import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne } from '../db/mysql.js';
import { accionSchema, editarItemSchema, evidenciaSchema } from '../minutas/esquemas.js';
import { accionarPunto, adjuntarEvidencia, editarPunto } from '../minutas/puntos/servicio.js';
import { enTransaccion } from '../minutas/transaccion.js';
import { soloEquipoInterno } from '../minutas/permisos.js';
import { cargarDetalle, insertarNota } from '../minutas/consultas.js';
import { ErrorMinuta, vincularTarea } from '../minutas/servicio.js';

/** Rutas de los puntos de una minuta: edición, acciones, evidencias, tareas y notas. */
export const minutaItemsRouter = Router();

minutaItemsRouter.patch('/minuta-items/:id', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  const parsed = editarItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos del punto inválidos', details: parsed.error.flatten().fieldErrors });
  }
  try {
    const itemId = String(req.params.id);
    const minutaId = await enTransaccion((conn) => editarPunto(conn, itemId, parsed.data));
    res.json(await cargarDetalle(minutaId));
  } catch (e) {
    if (e instanceof ErrorMinuta) return res.status(e.status).json({ error: e.message });
    console.error('[MINUTAS] editar punto:', e);
    res.status(500).json({ error: 'Error al editar el punto' });
  }
});

minutaItemsRouter.post('/minuta-items/:id/evidencias', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  const parsed = evidenciaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Evidencia inválida', details: parsed.error.flatten().fieldErrors });
  }
  try {
    const itemId = String(req.params.id);
    const { minutaId } = await enTransaccion((conn) => adjuntarEvidencia(conn, itemId, parsed.data, req.userId!));
    res.status(201).json(await cargarDetalle(minutaId));
  } catch (err) {
    if (err instanceof ErrorMinuta) return res.status(err.status).json({ error: err.message });
    console.error('[MINUTAS] evidencia:', err);
    res.status(500).json({ error: 'Error al adjuntar la evidencia' });
  }
});

minutaItemsRouter.post('/minuta-items/:id/accion', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  const parsed = accionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Acción inválida', details: parsed.error.flatten().fieldErrors });
  }
  try {
    const itemId = String(req.params.id);
    const { accion, resolucion, motivo } = parsed.data;
    const minutaId = await enTransaccion((conn) => accionarPunto(conn, itemId, accion, { resolucion, motivo }, req.userId!));
    res.json(await cargarDetalle(minutaId));
  } catch (e) {
    if (e instanceof ErrorMinuta) return res.status(e.status === 400 ? 422 : e.status).json({ error: e.message });
    console.error('[MINUTAS] acción:', e);
    res.status(500).json({ error: 'Error al actualizar el punto' });
  }
});

minutaItemsRouter.post('/minuta-items/:id/tareas', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  const parsed = z.object({ task_id: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'task_id inválido' });
  try {
    res.json(await cargarDetalle(await vincularTarea(String(req.params.id), parsed.data.task_id)));
  } catch (e) {
    if (e instanceof ErrorMinuta) return res.status(e.status).json({ error: e.message });
    console.error('[MINUTAS] vincular tarea:', e);
    res.status(500).json({ error: 'Error al vincular la tarea' });
  }
});

minutaItemsRouter.delete('/minuta-items/:id/tareas/:taskId', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  try {
    const itemId = String(req.params.id);
    const item = await queryOne<{ minuta_id: string }>('SELECT minuta_id FROM minuta_items WHERE id = ?', [itemId]);
    if (!item) return res.status(404).json({ error: 'Punto no encontrado' });
    // La tarea sigue existiendo; solo deja de estar vinculada a este punto.
    await query('UPDATE tasks SET minuta_item_id = NULL WHERE id = ? AND minuta_item_id = ?', [String(req.params.taskId), itemId]);
    res.json(await cargarDetalle(item.minuta_id));
  } catch (e) {
    console.error('[MINUTAS] desvincular tarea:', e);
    res.status(500).json({ error: 'Error al desvincular la tarea' });
  }
});

minutaItemsRouter.delete('/minuta-evidencias/:id', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  try {
    const evidenciaId = String(req.params.id);
    const ev = await queryOne<any>(
      `SELECT e.item_id, i.minuta_id, i.estado,
              (SELECT COUNT(*) FROM minuta_item_evidencias x WHERE x.item_id = e.item_id) AS total
         FROM minuta_item_evidencias e JOIN minuta_items i ON i.id = e.item_id
        WHERE e.id = ?`,
      [evidenciaId],
    );
    if (!ev) return res.status(404).json({ error: 'Evidencia no encontrada' });
    const cerrado = ev.estado === 'completado' || ev.estado === 'aprobado';
    if (cerrado && Number(ev.total) <= 1) {
      return res.status(422).json({ error: 'Un punto cerrado necesita al menos una evidencia. Reábrelo para cambiarla.' });
    }
    await query('DELETE FROM minuta_item_evidencias WHERE id = ?', [evidenciaId]);
    res.json(await cargarDetalle(ev.minuta_id));
  } catch (e) {
    console.error('[MINUTAS] quitar evidencia:', e);
    res.status(500).json({ error: 'Error al quitar la evidencia' });
  }
});

minutaItemsRouter.delete('/minuta-items/:id', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  try {
    const itemId = String(req.params.id);
    const item = await queryOne<any>(
      `SELECT i.minuta_id, i.estado,
              (SELECT COUNT(*) FROM tasks t WHERE t.minuta_item_id = i.id) AS tareas,
              (SELECT COUNT(*) FROM minuta_item_evidencias e WHERE e.item_id = i.id) AS evidencias
         FROM minuta_items i WHERE i.id = ?`,
      [itemId],
    );
    if (!item) return res.status(404).json({ error: 'Punto no encontrado' });
    // Borrar es para errores de tipeo. Lo que ya tuvo avance se descarta y queda en el historial.
    if (item.estado !== 'pendiente' || Number(item.tareas) > 0 || Number(item.evidencias) > 0) {
      return res.status(422).json({ error: 'Este punto ya tiene avance. Descártalo en vez de borrarlo.' });
    }
    await query('DELETE FROM minuta_items WHERE id = ?', [itemId]);
    res.json(await cargarDetalle(item.minuta_id));
  } catch (e) {
    console.error('[MINUTAS] borrar punto:', e);
    res.status(500).json({ error: 'Error al borrar el punto' });
  }
});

minutaItemsRouter.post('/minuta-items/:id/notas', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  const parsed = z.object({ texto: z.string().trim().min(1).max(5000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Escribe la nota.' });
  try {
    const itemId = String(req.params.id);
    const item = await queryOne<{ minuta_id: string }>('SELECT minuta_id FROM minuta_items WHERE id = ?', [itemId]);
    if (!item) return res.status(404).json({ error: 'Punto no encontrado' });
    await insertarNota(itemId, 'nota', parsed.data.texto, { userId: req.userId! });
    res.status(201).json(await cargarDetalle(item.minuta_id));
  } catch (e) {
    console.error('[MINUTAS] nota:', e);
    res.status(500).json({ error: 'Error al guardar la nota' });
  }
});
