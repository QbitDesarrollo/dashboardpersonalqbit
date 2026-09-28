import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { aplicarAccion, type AccionPunto } from '../minutas/domain.js';
import { accionSchema, editarItemSchema, esImagenPropia, evidenciaSchema } from '../minutas/esquemas.js';
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
    const item = await queryOne<{ minuta_id: string }>('SELECT minuta_id FROM minuta_items WHERE id = ?', [itemId]);
    if (!item) return res.status(404).json({ error: 'Punto no encontrado' });
    const b = parsed.data;
    // Un punto es del cliente o de alguien del equipo, nunca de los dos.
    if (b.responsable_cliente === true) b.responsable_user_id = null;
    else if (b.responsable_user_id) b.responsable_cliente = false;
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const col of ['titulo', 'descripcion', 'responsable_user_id', 'fecha_compromiso'] as const) {
      if (b[col] !== undefined) { sets.push(`${col} = ?`); vals.push(b[col]); }
    }
    for (const col of ['responsable_cliente', 'visible_cliente'] as const) {
      if (b[col] !== undefined) { sets.push(`${col} = ?`); vals.push(b[col] ? 1 : 0); }
    }
    if (sets.length) await query(`UPDATE minuta_items SET ${sets.join(', ')} WHERE id = ?`, [...vals, itemId]);
    res.json(await cargarDetalle(item.minuta_id));
  } catch (e) {
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
    const item = await queryOne<{ minuta_id: string }>('SELECT minuta_id FROM minuta_items WHERE id = ?', [itemId]);
    if (!item) return res.status(404).json({ error: 'Punto no encontrado' });
    const e = parsed.data;
    if (e.tipo === 'imagen' && !esImagenPropia(e.url)) {
      return res.status(400).json({ error: 'La imagen debe subirse a Tiusdei.' });
    }
    await query(
      `INSERT INTO minuta_item_evidencias (id, item_id, tipo, nombre, url, drive_file_id, subido_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), itemId, e.tipo, e.nombre, e.url, e.drive_file_id ?? null, req.userId!],
    );
    res.status(201).json(await cargarDetalle(item.minuta_id));
  } catch (err) {
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
    const item = await queryOne<any>(
      `SELECT i.minuta_id, i.estado, i.responsable_cliente,
              (SELECT COUNT(*) FROM minuta_item_evidencias e WHERE e.item_id = i.id) AS evidencias
         FROM minuta_items i WHERE i.id = ?`,
      [itemId],
    );
    if (!item) return res.status(404).json({ error: 'Punto no encontrado' });
    const { accion, resolucion, motivo } = parsed.data;
    const r = aplicarAccion(
      { estado: item.estado, responsableCliente: !!item.responsable_cliente, evidencias: Number(item.evidencias) },
      accion as AccionPunto,
      { resolucion, motivo },
    );
    if (!r.ok) return res.status(422).json({ error: r.error });
    // Además del estado, cada acción deja su rastro en el punto.
    const extra: Record<string, { sql: string; vals: unknown[] }> = {
      completar: {
        sql: ', resolucion = ?, completado_por = ?, completado_en = NOW(3)',
        vals: [resolucion?.trim() || null, req.userId!],
      },
      aprobar: {
        sql: ", aprobado_via = 'reunion', aprobado_por_nombre = (SELECT nombre FROM profiles WHERE id = ?), aprobado_en = NOW(3)",
        vals: [req.userId!],
      },
      descartar: { sql: ', motivo_descarte = ?', vals: [motivo?.trim() || null] },
      reabrir: { sql: ', completado_por = NULL, completado_en = NULL', vals: [] },
      pedir_ajuste: { sql: ', completado_por = NULL, completado_en = NULL', vals: [] },
      restaurar: { sql: ', motivo_descarte = NULL', vals: [] },
    };
    const e = Object.hasOwn(extra, accion) ? extra[accion] : { sql: '', vals: [] };
    await query(`UPDATE minuta_items SET estado = ?${e.sql} WHERE id = ?`, [r.estado, ...e.vals, itemId]);
    // El ajuste que pidió el cliente queda escrito en el punto.
    if (accion === 'pedir_ajuste') await insertarNota(itemId, 'ajuste', motivo!.trim(), { userId: req.userId! });
    res.json(await cargarDetalle(item.minuta_id));
  } catch (e) {
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
