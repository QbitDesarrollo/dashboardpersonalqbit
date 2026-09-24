import { Router, type Response, type NextFunction } from 'express';
import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { pool, query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';
import { aplicarAccion, progreso, type AccionPunto, type EstadoPunto } from '../minutas/domain.js';

/**
 * Minutas de reunión: lo que se habló con el cliente, punto por punto.
 * Cuelgan de la marca (proyecto opcional). Las reglas de estado de cada punto
 * viven en minutas/domain.ts; este archivo solo traduce HTTP <-> SQL.
 */
export const minutasRouter = Router();

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');

const itemSchema = z.object({
  titulo: z.string().trim().min(1).max(300),
  descripcion: z.string().max(10000).nullish(),
  responsable_user_id: z.string().uuid().nullish(),
  responsable_cliente: z.boolean().optional(),
  fecha_compromiso: fechaIso.nullish(),
});

const crearSchema = z.object({
  brand_id: z.string().uuid(),
  project_id: z.string().uuid().nullish(),
  fecha: fechaIso,
  titulo: z.string().trim().min(1).max(200),
  owner_user_id: z.string().uuid().optional(),
  miembros: z.array(z.string().uuid()).max(50).optional(),
  resumen: z.string().max(20000).nullish(),
  estado: z.enum(['borrador', 'publicada']).optional(),
  items: z.array(itemSchema).max(100).optional(),
});

/** Las minutas son internas: mismos roles que pueden crear tareas. */
async function soloEquipoInterno(req: AuthRequest, res: Response, next: NextFunction) {
  if (!(await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']))) {
    res.status(403).json({ error: 'Sin permisos' });
    return;
  }
  next();
}

const editarSchema = z.object({
  titulo: z.string().trim().min(1).max(200).optional(),
  fecha: fechaIso.optional(),
  project_id: z.string().uuid().nullable().optional(),
  miembros: z.array(z.string().uuid()).max(50).optional(),
  owner_user_id: z.string().uuid().optional(),
  resumen: z.string().max(20000).nullable().optional(),
  estado: z.enum(['borrador', 'publicada']).optional(),
});

const editarItemSchema = z.object({
  titulo: z.string().trim().min(1).max(300).optional(),
  descripcion: z.string().max(10000).nullable().optional(),
  responsable_user_id: z.string().uuid().nullable().optional(),
  responsable_cliente: z.boolean().optional(),
  fecha_compromiso: fechaIso.nullable().optional(),
  visible_cliente: z.boolean().optional(),
});

// Evidencia: enlace o archivo de Drive. No se suben archivos a Tiusdei (decisión de Steven, 23-sep).
const evidenciaSchema = z.object({
  tipo: z.enum(['enlace', 'drive']),
  nombre: z.string().trim().min(1).max(500),
  url: z.string().max(1000).regex(/^https?:\/\/\S+$/i, 'La URL debe empezar con http:// o https://'),
  drive_file_id: z.string().max(255).nullish(),
});

const accionSchema = z.object({
  accion: z.string().min(1).max(40),
  resolucion: z.string().max(10000).optional(),
  motivo: z.string().max(2000).optional(),
});

/** Un punto nuevo. Si lo debe hacer el cliente, no lleva responsable del equipo. */
async function insertarPunto(conn: PoolConnection, minutaId: string, numero: number, it: z.infer<typeof itemSchema>) {
  await conn.execute(
    `INSERT INTO minuta_items (id, minuta_id, numero, titulo, descripcion, responsable_user_id, responsable_cliente, fecha_compromiso, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), minutaId, numero, it.titulo, it.descripcion ?? null,
     it.responsable_cliente ? null : (it.responsable_user_id ?? null),
     it.responsable_cliente ? 1 : 0, it.fecha_compromiso ?? null, numero],
  );
}

function codigo(numero: number): string {
  return `M-${String(numero).padStart(2, '0')}`;
}

async function cargarDetalle(id: string) {
  const m = await queryOne<any>(
    `SELECT m.id, m.brand_id, b.nombre AS brand_nombre, m.project_id, p.nombre AS project_nombre,
            m.numero, m.titulo, DATE_FORMAT(m.fecha, '%Y-%m-%d') AS fecha, m.resumen, m.enlaces, m.estado,
            m.owner_user_id, o.nombre AS owner_nombre, o.avatar_url AS owner_avatar, m.created_at
       FROM minutas m
       JOIN brands b ON b.id = m.brand_id
       LEFT JOIN projects p ON p.id = m.project_id
       LEFT JOIN profiles o ON o.id = m.owner_user_id
      WHERE m.id = ?`,
    [id],
  );
  if (!m) return null;
  const miembros = await query<any[]>(
    `SELECT p.id, p.nombre, p.avatar_url
       FROM minuta_miembros mm JOIN profiles p ON p.id = mm.user_id
      WHERE mm.minuta_id = ?
      ORDER BY p.nombre`,
    [id],
  );
  const items = await query<any[]>(
    `SELECT i.*, DATE_FORMAT(i.fecha_compromiso, '%Y-%m-%d') AS fecha_compromiso,
            r.nombre AS responsable_nombre, r.avatar_url AS responsable_avatar,
            c.nombre AS completado_por_nombre
       FROM minuta_items i
       LEFT JOIN profiles r ON r.id = i.responsable_user_id
       LEFT JOIN profiles c ON c.id = i.completado_por
      WHERE i.minuta_id = ?
      ORDER BY i.sort_order, i.numero`,
    [id],
  );
  const evidenciasPorItem = new Map<string, any[]>();
  if (items.length) {
    const ids = items.map((i) => i.id);
    const evidencias = await query<any[]>(
      `SELECT id, item_id, tipo, nombre, url, drive_file_id, origen_task_id, created_at
         FROM minuta_item_evidencias
        WHERE item_id IN (${ids.map(() => '?').join(',')})
        ORDER BY created_at`,
      ids,
    );
    for (const e of evidencias) {
      const lista = evidenciasPorItem.get(e.item_id) ?? [];
      lista.push({ id: e.id, tipo: e.tipo, nombre: e.nombre, url: e.url, drive_file_id: e.drive_file_id, origen_task_id: e.origen_task_id });
      evidenciasPorItem.set(e.item_id, lista);
    }
  }
  return {
    id: m.id,
    brand_id: m.brand_id,
    brand_nombre: m.brand_nombre,
    project_id: m.project_id,
    project_nombre: m.project_nombre,
    numero: m.numero,
    codigo: codigo(m.numero),
    titulo: m.titulo,
    fecha: m.fecha,
    resumen: m.resumen,
    enlaces: m.enlaces ?? [],
    estado: m.estado,
    owner: { id: m.owner_user_id, nombre: m.owner_nombre, avatar_url: m.owner_avatar },
    miembros,
    progreso: progreso(items.map((i) => i.estado as EstadoPunto)),
    items: items.map((i) => ({
      id: i.id,
      numero: i.numero,
      titulo: i.titulo,
      descripcion: i.descripcion,
      responsable: i.responsable_user_id
        ? { id: i.responsable_user_id, nombre: i.responsable_nombre, avatar_url: i.responsable_avatar }
        : null,
      responsable_cliente: !!i.responsable_cliente,
      fecha_compromiso: i.fecha_compromiso,
      estado: i.estado,
      visible_cliente: !!i.visible_cliente,
      resolucion: i.resolucion,
      completado_por: i.completado_por ? { id: i.completado_por, nombre: i.completado_por_nombre } : null,
      completado_en: i.completado_en,
      aprobado_via: i.aprobado_via,
      aprobado_por_nombre: i.aprobado_por_nombre,
      aprobado_en: i.aprobado_en,
      motivo_descarte: i.motivo_descarte,
      evidencias: evidenciasPorItem.get(i.id) ?? [],
    })),
    created_at: m.created_at,
  };
}

minutasRouter.get('/minutas', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  try {
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

minutasRouter.patch('/minuta-items/:id', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
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

minutasRouter.post('/minuta-items/:id/evidencias', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
  const parsed = evidenciaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Evidencia inválida', details: parsed.error.flatten().fieldErrors });
  }
  try {
    const itemId = String(req.params.id);
    const item = await queryOne<{ minuta_id: string }>('SELECT minuta_id FROM minuta_items WHERE id = ?', [itemId]);
    if (!item) return res.status(404).json({ error: 'Punto no encontrado' });
    const e = parsed.data;
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

minutasRouter.post('/minuta-items/:id/accion', requireAuth, soloEquipoInterno, async (req: AuthRequest, res) => {
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
      restaurar: { sql: ', motivo_descarte = NULL', vals: [] },
    };
    const e = Object.hasOwn(extra, accion) ? extra[accion] : { sql: '', vals: [] };
    await query(`UPDATE minuta_items SET estado = ?${e.sql} WHERE id = ?`, [r.estado, ...e.vals, itemId]);
    res.json(await cargarDetalle(item.minuta_id));
  } catch (e) {
    console.error('[MINUTAS] acción:', e);
    res.status(500).json({ error: 'Error al actualizar el punto' });
  }
});
