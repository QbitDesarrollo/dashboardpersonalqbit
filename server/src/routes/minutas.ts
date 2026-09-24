import { Router } from 'express';
import { z } from 'zod';
import type { RowDataPacket } from 'mysql2';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { pool, query, queryOne } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';
import { crearSchema, editarSchema, itemSchema } from '../minutas/esquemas.js';
import { soloEquipoInterno } from '../minutas/permisos.js';
import { cargarDetalle } from '../minutas/consultas.js';
import { agregarPuntos, crearMinuta, ErrorMinuta, listarMinutas } from '../minutas/servicio.js';
import { minutaItemsRouter } from './minuta-items.js';

/**
 * Minutas de reunión: lo que se habló con el cliente, punto por punto.
 * Cuelgan de la marca (proyecto opcional). Las reglas de estado de cada punto
 * viven en minutas/domain.ts; las consultas en minutas/consultas.ts.
 */
export const minutasRouter = Router();
minutasRouter.use(minutaItemsRouter);

minutasRouter.get('/minutas', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  try {
    const texto = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
    res.json(await listarMinutas({ brandId: texto(req.query.brand_id), projectId: texto(req.query.project_id), q: texto(req.query.q) }));
  } catch (e) {
    console.error('[MINUTAS] listar:', e);
    res.status(500).json({ error: 'Error al cargar minutas' });
  }
});

minutasRouter.get('/minutas/:id', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  try {
    const detalle = await cargarDetalle(String(req.params.id));
    if (!detalle) return res.status(404).json({ error: 'Minuta no encontrada' });
    res.json(detalle);
  } catch (e) {
    console.error('[MINUTAS] detalle:', e);
    res.status(500).json({ error: 'Error al cargar la minuta' });
  }
});

minutasRouter.patch('/minutas/:id', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  const parsed = editarSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos de minuta inválidos', details: parsed.error.flatten().fieldErrors });
  }
  if (!pool) return res.status(500).json({ error: 'Base de datos no configurada' });
  const id = String(req.params.id);
  const b = parsed.data;
  const actual = await queryOne<{ brand_id: string }>('SELECT brand_id FROM minutas WHERE id = ?', [id]);
  if (!actual) return res.status(404).json({ error: 'Minuta no encontrada' });
  if (b.project_id) {
    const proyecto = await queryOne('SELECT id FROM projects WHERE id = ? AND brand_id = ?', [b.project_id, actual.brand_id]);
    if (!proyecto) return res.status(400).json({ error: 'El proyecto no pertenece a esa marca.' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const col of ['titulo', 'fecha', 'project_id', 'owner_user_id', 'resumen', 'estado'] as const) {
      if (b[col] !== undefined) { sets.push(`${col} = ?`); vals.push(b[col]); }
    }
    if (sets.length) await conn.execute(`UPDATE minutas SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
    if (b.miembros) {
      await conn.execute('DELETE FROM minuta_miembros WHERE minuta_id = ?', [id]);
      for (const userId of new Set(b.miembros)) {
        await conn.execute('INSERT INTO minuta_miembros (minuta_id, user_id) VALUES (?, ?)', [id, userId]);
      }
    }
    await conn.commit();
    res.json(await cargarDetalle(id));
  } catch (e) {
    await conn.rollback();
    console.error('[MINUTAS] editar:', e);
    res.status(500).json({ error: 'Error al editar la minuta' });
  } finally {
    conn.release();
  }
});

// Reorders the points. Codes follow the position (moving a point first makes it N.1),
// so numbers are rewritten in two steps to respect the (minuta_id, numero) unique key.
minutasRouter.put('/minutas/:id/orden', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  const parsed = z.object({ items: z.array(z.string()).max(500) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'La lista de puntos no coincide con la minuta.' });
  if (!pool) return res.status(500).json({ error: 'Base de datos no configurada' });
  const id = String(req.params.id);
  const nuevo = parsed.data.items;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [minuta] = await conn.query<RowDataPacket[]>('SELECT id FROM minutas WHERE id = ? FOR UPDATE', [id]);
    if (!minuta.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Minuta no encontrada' });
    }
    const [filas] = await conn.query<RowDataPacket[]>('SELECT id FROM minuta_items WHERE minuta_id = ?', [id]);
    const actuales = new Set(filas.map((f) => String(f.id)));
    const mismaLista = nuevo.length === actuales.size && new Set(nuevo).size === nuevo.length && nuevo.every((i) => actuales.has(i));
    if (!mismaLista) {
      await conn.rollback();
      return res.status(400).json({ error: 'La lista de puntos no coincide con la minuta.' });
    }
    await conn.execute('UPDATE minuta_items SET numero = numero + 100000 WHERE minuta_id = ?', [id]);
    for (const [i, itemId] of nuevo.entries()) {
      await conn.execute('UPDATE minuta_items SET numero = ?, sort_order = ? WHERE id = ? AND minuta_id = ?', [i + 1, i + 1, itemId, id]);
    }
    await conn.commit();
    res.json(await cargarDetalle(id));
  } catch (e) {
    await conn.rollback();
    console.error('[MINUTAS] reordenar:', e);
    res.status(500).json({ error: 'Error al reordenar los puntos' });
  } finally {
    conn.release();
  }
});

minutasRouter.post('/minutas/:id/items', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos del punto inválidos', details: parsed.error.flatten().fieldErrors });
  }
  const id = String(req.params.id);
  try {
    await agregarPuntos(id, [parsed.data]);
    res.status(201).json(await cargarDetalle(id));
  } catch (e) {
    if (e instanceof ErrorMinuta) return res.status(e.status).json({ error: e.message });
    console.error('[MINUTAS] agregar punto:', e);
    res.status(500).json({ error: 'Error al agregar el punto' });
  }
});

minutasRouter.post('/minutas', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos de minuta inválidos', details: parsed.error.flatten().fieldErrors });
  }
  try {
    const id = await crearMinuta(parsed.data, req.userId!);
    res.status(201).json(await cargarDetalle(id));
  } catch (e) {
    if (e instanceof ErrorMinuta) return res.status(e.status).json({ error: e.message });
    console.error('[MINUTAS] crear:', e);
    res.status(500).json({ error: 'Error al crear la minuta' });
  }
});

minutasRouter.delete('/minutas/:id', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const minuta = await queryOne<{ owner_user_id: string }>('SELECT owner_user_id FROM minutas WHERE id = ?', [id]);
    if (!minuta) return res.status(404).json({ error: 'Minuta no encontrada' });
    const esAdmin = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (minuta.owner_user_id !== req.userId && !esAdmin) {
      return res.status(403).json({ error: 'Solo el responsable de la minuta o un administrador puede borrarla.' });
    }
    // Los puntos y evidencias se van en cascada; las tareas quedan, sin vínculo (FK ON DELETE SET NULL).
    await query('DELETE FROM minutas WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[MINUTAS] borrar:', e);
    res.status(500).json({ error: 'Error al borrar la minuta' });
  }
});
