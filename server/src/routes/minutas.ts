import { Router } from 'express';
import { z } from 'zod';
import type { RowDataPacket } from 'mysql2';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { pool, query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';
import { progreso, type EstadoPunto } from '../minutas/domain.js';
import { crearSchema, editarSchema, itemSchema } from '../minutas/esquemas.js';
import { soloEquipoInterno } from '../minutas/permisos.js';
import { cargarDetalle, codigo, insertarPunto, sincronizarArranques } from '../minutas/consultas.js';
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
    await sincronizarArranques();
    const conds: string[] = [];
    const params: unknown[] = [];
    if (typeof req.query.brand_id === 'string' && req.query.brand_id) { conds.push('m.brand_id = ?'); params.push(req.query.brand_id); }
    if (typeof req.query.project_id === 'string' && req.query.project_id) { conds.push('m.project_id = ?'); params.push(req.query.project_id); }
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      conds.push(`(m.titulo LIKE ? OR EXISTS (
        SELECT 1 FROM minuta_items i WHERE i.minuta_id = m.id AND (i.titulo LIKE ? OR i.descripcion LIKE ?)))`);
      params.push(like, like, like);
    }
    const minutas = await query<any[]>(
      `SELECT m.id, m.brand_id, b.nombre AS brand_nombre, m.project_id, p.nombre AS project_nombre,
              m.numero, m.titulo, DATE_FORMAT(m.fecha, '%Y-%m-%d') AS fecha, m.estado,
              m.owner_user_id, o.nombre AS owner_nombre, o.avatar_url AS owner_avatar
         FROM minutas m
         JOIN brands b ON b.id = m.brand_id
         LEFT JOIN projects p ON p.id = m.project_id
         LEFT JOIN profiles o ON o.id = m.owner_user_id
        ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
        ORDER BY m.fecha DESC, m.numero DESC`,
      params,
    );
    const estadosPorMinuta = new Map<string, EstadoPunto[]>();
    if (minutas.length) {
      const ids = minutas.map((m) => m.id);
      const filas = await query<any[]>(
        `SELECT minuta_id, estado FROM minuta_items WHERE minuta_id IN (${ids.map(() => '?').join(',')})`,
        ids,
      );
      for (const f of filas) {
        const lista = estadosPorMinuta.get(f.minuta_id) ?? [];
        lista.push(f.estado);
        estadosPorMinuta.set(f.minuta_id, lista);
      }
    }
    res.json(minutas.map((m) => ({
      id: m.id,
      brand_id: m.brand_id,
      brand_nombre: m.brand_nombre,
      project_id: m.project_id,
      project_nombre: m.project_nombre,
      numero: m.numero,
      codigo: codigo(m.numero),
      titulo: m.titulo,
      fecha: m.fecha,
      estado: m.estado,
      owner: { id: m.owner_user_id, nombre: m.owner_nombre, avatar_url: m.owner_avatar },
      progreso: progreso(estadosPorMinuta.get(m.id) ?? []),
    })));
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
  if (!pool) return res.status(500).json({ error: 'Base de datos no configurada' });
  const id = String(req.params.id);
  const it = parsed.data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [minuta] = await conn.query<RowDataPacket[]>('SELECT id FROM minutas WHERE id = ? FOR UPDATE', [id]);
    if (!minuta.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Minuta no encontrada' });
    }
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM minuta_items WHERE minuta_id = ?',
      [id],
    );
    const numero = Number(rows[0].siguiente);
    await insertarPunto(conn, id, numero, it);
    await conn.commit();
    res.status(201).json(await cargarDetalle(id));
  } catch (e) {
    await conn.rollback();
    console.error('[MINUTAS] agregar punto:', e);
    res.status(500).json({ error: 'Error al agregar el punto' });
  } finally {
    conn.release();
  }
});

minutasRouter.post('/minutas', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos de minuta inválidos', details: parsed.error.flatten().fieldErrors });
  }
  const b = parsed.data;
  if (!pool) return res.status(500).json({ error: 'Base de datos no configurada' });
  const marca = await queryOne('SELECT id FROM brands WHERE id = ?', [b.brand_id]);
  if (!marca) return res.status(400).json({ error: 'La marca no existe.' });
  if (b.project_id) {
    const proyecto = await queryOne('SELECT id FROM projects WHERE id = ? AND brand_id = ?', [b.project_id, b.brand_id]);
    if (!proyecto) return res.status(400).json({ error: 'El proyecto no pertenece a esa marca.' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM minutas WHERE brand_id = ? FOR UPDATE',
      [b.brand_id],
    );
    const numero = Number(rows[0].siguiente);
    const id = uuid();
    await conn.execute(
      `INSERT INTO minutas (id, brand_id, project_id, numero, titulo, fecha, owner_user_id, resumen, estado, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, b.brand_id, b.project_id ?? null, numero, b.titulo, b.fecha, b.owner_user_id ?? req.userId!,
       b.resumen ?? null, b.estado ?? 'borrador', req.userId!],
    );
    for (const userId of new Set(b.miembros ?? [])) {
      await conn.execute('INSERT INTO minuta_miembros (minuta_id, user_id) VALUES (?, ?)', [id, userId]);
    }
    let n = 0;
    for (const it of b.items ?? []) {
      n += 1;
      await insertarPunto(conn, id, n, it);
    }
    await conn.commit();
    res.status(201).json(await cargarDetalle(id));
  } catch (e) {
    await conn.rollback();
    console.error('[MINUTAS] crear:', e);
    res.status(500).json({ error: 'Error al crear la minuta' });
  } finally {
    conn.release();
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
