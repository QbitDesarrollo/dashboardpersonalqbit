import { Router, type Response, type NextFunction } from 'express';
import type { RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { pool, query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';
import { progreso, type EstadoPunto } from '../minutas/domain.js';

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
            r.nombre AS responsable_nombre, r.avatar_url AS responsable_avatar
       FROM minuta_items i
       LEFT JOIN profiles r ON r.id = i.responsable_user_id
      WHERE i.minuta_id = ?
      ORDER BY i.sort_order, i.numero`,
    [id],
  );
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
      await conn.execute(
        `INSERT INTO minuta_items (id, minuta_id, numero, titulo, descripcion, responsable_user_id, responsable_cliente, fecha_compromiso, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid(), id, n, it.titulo, it.descripcion ?? null, it.responsable_cliente ? null : (it.responsable_user_id ?? null),
         it.responsable_cliente ? 1 : 0, it.fecha_compromiso ?? null, n],
      );
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
