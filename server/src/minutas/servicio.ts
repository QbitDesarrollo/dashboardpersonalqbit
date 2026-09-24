import type { RowDataPacket } from 'mysql2';
import type { z } from 'zod';
import { pool, query, queryOne, uuid } from '../db/mysql.js';
import { progreso, type EstadoPunto } from './domain.js';
import type { crearSchema, itemSchema } from './esquemas.js';
import { codigo, insertarPunto, sincronizarArranques } from './consultas.js';

/**
 * Minuta operations shared by the web app routes and the MCP API, so both behave the same.
 * Errors meant for the caller carry an HTTP status and a message that can be shown as-is.
 */
export class ErrorMinuta extends Error {
  /** `codigo` is the named error the MCP API returns (TIUSDEI_*). */
  constructor(readonly status: number, mensaje: string, readonly codigo = 'TIUSDEI_ERROR') { super(mensaje); }
}

export async function listarMinutas(filtros: { brandId?: string; projectId?: string; q?: string }) {
  await sincronizarArranques();
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filtros.brandId) { conds.push('m.brand_id = ?'); params.push(filtros.brandId); }
  if (filtros.projectId) { conds.push('m.project_id = ?'); params.push(filtros.projectId); }
  const q = (filtros.q ?? '').trim().slice(0, 100);
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
  return minutas.map((m) => ({
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
  }));
}

/** Creates a minuta with its points, numbered per brand (M-01, M-02…). Returns its id. */
export async function crearMinuta(b: z.infer<typeof crearSchema>, userId: string): Promise<string> {
  if (!pool) throw new ErrorMinuta(500, 'Base de datos no configurada');
  const marca = await queryOne('SELECT id FROM brands WHERE id = ?', [b.brand_id]);
  if (!marca) throw new ErrorMinuta(400, 'La marca no existe.', 'TIUSDEI_INVALID_BRAND');
  if (b.project_id) {
    const proyecto = await queryOne('SELECT id FROM projects WHERE id = ? AND brand_id = ?', [b.project_id, b.brand_id]);
    if (!proyecto) throw new ErrorMinuta(400, 'El proyecto no pertenece a esa marca.', 'TIUSDEI_INVALID_PROJECT');
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
      [id, b.brand_id, b.project_id ?? null, numero, b.titulo, b.fecha, b.owner_user_id ?? userId,
       b.resumen ?? null, b.estado ?? 'borrador', userId],
    );
    for (const miembro of new Set(b.miembros ?? [])) {
      await conn.execute('INSERT INTO minuta_miembros (minuta_id, user_id) VALUES (?, ?)', [id, miembro]);
    }
    let n = 0;
    for (const it of b.items ?? []) {
      n += 1;
      await insertarPunto(conn, id, n, it);
    }
    await conn.commit();
    return id;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** Appends points after the last one of an existing minuta (1.3, 1.4…). Returns the new point ids in order. */
export async function agregarPuntos(minutaId: string, items: z.infer<typeof itemSchema>[]): Promise<string[]> {
  if (!pool) throw new ErrorMinuta(500, 'Base de datos no configurada');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [minuta] = await conn.query<RowDataPacket[]>('SELECT id FROM minutas WHERE id = ? FOR UPDATE', [minutaId]);
    if (!minuta.length) throw new ErrorMinuta(404, 'Minuta no encontrada', 'TIUSDEI_NOT_FOUND');
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT COALESCE(MAX(numero), 0) AS ultimo FROM minuta_items WHERE minuta_id = ?',
      [minutaId],
    );
    let numero = Number(rows[0].ultimo);
    const ids: string[] = [];
    for (const it of items) ids.push(await insertarPunto(conn, minutaId, ++numero, it));
    await conn.commit();
    return ids;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** Links an existing task to a point of the same brand. Returns the minuta id. */
export async function vincularTarea(itemId: string, taskId: string): Promise<string> {
  const item = await queryOne<{ minuta_id: string; brand_id: string }>(
    'SELECT i.minuta_id, m.brand_id FROM minuta_items i JOIN minutas m ON m.id = i.minuta_id WHERE i.id = ?',
    [itemId],
  );
  if (!item) throw new ErrorMinuta(404, 'Punto no encontrado', 'TIUSDEI_NOT_FOUND');
  const tarea = await queryOne<{ brand_id: string }>('SELECT brand_id FROM tasks WHERE id = ?', [taskId]);
  if (!tarea) throw new ErrorMinuta(404, 'Tarea no encontrada', 'TIUSDEI_NOT_FOUND');
  if (tarea.brand_id !== item.brand_id) throw new ErrorMinuta(400, 'La tarea es de otra marca.', 'TIUSDEI_BRAND_MISMATCH');
  await query('UPDATE tasks SET minuta_item_id = ? WHERE id = ?', [itemId, taskId]);
  return item.minuta_id;
}
