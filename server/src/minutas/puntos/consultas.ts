import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { z } from 'zod';
import { uuid } from '../../db/mysql.js';
import type { EstadoPunto, DatosAccion } from '../domain.js';
import type { editarItemSchema, evidenciaSchema } from '../esquemas.js';

export async function cargarPunto(conn: PoolConnection, id: string) {
  const [rows] = await conn.query<(RowDataPacket & { minuta_id: string; estado: EstadoPunto; responsable_cliente: number; evidencias: number })[]>(
    `SELECT i.minuta_id, i.estado, i.responsable_cliente,
       (SELECT COUNT(*) FROM minuta_item_evidencias e WHERE e.item_id = i.id) AS evidencias
       FROM minuta_items i WHERE i.id = ? FOR UPDATE`, [id],
  );
  return rows[0] ?? null;
}

export async function guardarAccion(conn: PoolConnection, id: string, estado: EstadoPunto, accion: string, datos: DatosAccion, userId: string) {
  const extra: Record<string, { sql: string; vals: unknown[] }> = {
    completar: { sql: ', resolucion = ?, completado_por = ?, completado_en = NOW(3)', vals: [datos.resolucion?.trim() || null, userId] },
    aprobar: { sql: ", aprobado_via = 'reunion', aprobado_por_nombre = (SELECT nombre FROM profiles WHERE id = ?), aprobado_en = NOW(3)", vals: [userId] },
    descartar: { sql: ', motivo_descarte = ?', vals: [datos.motivo?.trim() || null] },
    reabrir: { sql: ', completado_por = NULL, completado_en = NULL', vals: [] },
    pedir_ajuste: { sql: ', completado_por = NULL, completado_en = NULL', vals: [] },
    restaurar: { sql: ', motivo_descarte = NULL', vals: [] },
  };
  const e = Object.hasOwn(extra, accion) ? extra[accion] : { sql: '', vals: [] };
  await conn.execute(`UPDATE minuta_items SET estado = ?${e.sql} WHERE id = ?`, [estado, ...e.vals, id]);
}

export async function guardarEdicion(conn: PoolConnection, id: string, b: z.infer<typeof editarItemSchema>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const col of ['titulo', 'descripcion', 'responsable_user_id', 'fecha_compromiso'] as const) {
    if (b[col] !== undefined) { sets.push(`${col} = ?`); vals.push(b[col]); }
  }
  for (const col of ['responsable_cliente', 'visible_cliente'] as const) {
    if (b[col] !== undefined) { sets.push(`${col} = ?`); vals.push(b[col] ? 1 : 0); }
  }
  if (sets.length) await conn.execute(`UPDATE minuta_items SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
}

export async function responsableValido(conn: PoolConnection, id: string) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT p.id FROM profiles p WHERE p.id = ? AND p.activo = 1
      AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = p.id AND r.role IN ('admin','ejecutivo','equipo'))`, [id],
  );
  return rows.length > 0;
}

export async function cargarOrden(conn: PoolConnection, minutaId: string) {
  const [minuta] = await conn.query<RowDataPacket[]>('SELECT id FROM minutas WHERE id = ? FOR UPDATE', [minutaId]);
  if (!minuta.length) return null;
  const [filas] = await conn.query<(RowDataPacket & { id: string })[]>(
    'SELECT id FROM minuta_items WHERE minuta_id = ? ORDER BY sort_order, numero FOR UPDATE', [minutaId],
  );
  return filas.map((f) => f.id);
}

export async function guardarOrden(conn: PoolConnection, minutaId: string, ids: string[]) {
  await conn.execute('UPDATE minuta_items SET numero = numero + 100000 WHERE minuta_id = ?', [minutaId]);
  for (const [i, id] of ids.entries()) {
    await conn.execute('UPDATE minuta_items SET numero = ?, sort_order = ? WHERE id = ? AND minuta_id = ?', [i + 1, i + 1, id, minutaId]);
  }
}

export async function insertarEvidencia(conn: PoolConnection, itemId: string, e: z.infer<typeof evidenciaSchema>, userId: string, id = uuid()) {
  await conn.execute(
    `INSERT INTO minuta_item_evidencias (id, item_id, tipo, nombre, url, drive_file_id, subido_por)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, itemId, e.tipo, e.nombre, e.url, e.drive_file_id ?? null, userId],
  );
  return id;
}

export async function evidenciaPorId(conn: PoolConnection, id: string) {
  const [rows] = await conn.query<(RowDataPacket & { item_id: string })[]>('SELECT item_id FROM minuta_item_evidencias WHERE id = ? FOR UPDATE', [id]);
  return rows[0] ?? null;
}
