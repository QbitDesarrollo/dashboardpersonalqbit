import { query } from '../db/mysql.js';

export const SQL_INGRESO = `SELECT MIN(check_in) AS ingreso FROM attendance
 WHERE user_id = ? AND check_in >= ? AND check_in < ?`;
export const SQL_TIMERS = `SELECT start_time, end_time, status, duration_seconds, idle_seconds FROM time_entries
 WHERE user_id = ? AND start_time < ? AND (end_time > ? OR (end_time IS NULL AND status = 'active'))
 AND status IN ('active', 'completed', 'paused') ORDER BY start_time`;
export const SQL_TAREAS = `SELECT COUNT(*) AS total,
 COALESCE(SUM(t.estado IN ('entregado', 'aprobado')), 0) AS completadas
 FROM tasks t WHERE DATE(t.fecha_entrega) = ?
 AND (t.responsable_user_id = ? OR EXISTS (SELECT 1 FROM task_responsables tr WHERE tr.task_id = t.id AND tr.user_id = ?))`;
/** El reporte Cumplimiento selecciona por DATE(created_at) UTC, no por fecha de entrega.
 * Solo las tareas entregadas forman su denominador; la espera del cliente solo afecta vencidas.
 * La fecha justa: última nueva no interna, o primera anterior, o fecha actual (en ese orden).
 */
export const SQL_CUMPLIMIENTO = `SELECT t.estado,
 DATE_FORMAT(COALESCE(
   (SELECT r.fecha_nueva FROM task_reschedules r WHERE r.task_id = t.id AND (r.motivo <> 'INTERNO' OR r.motivo IS NULL)
     AND r.fecha_nueva IS NOT NULL ORDER BY r.changed_at DESC LIMIT 1),
   (SELECT r.fecha_anterior FROM task_reschedules r WHERE r.task_id = t.id ORDER BY r.changed_at ASC LIMIT 1),
   t.fecha_entrega), '%Y-%m-%d') AS objetivo,
 (SELECT MIN(a.created_at) FROM activity_log a WHERE a.entity_type = 'task' AND a.field_name = 'estado'
   AND a.new_value IN ('entregado', 'aprobado', 'revision_cliente', 'revision_interna', 'en_revision') AND a.entity_id = t.id) AS entregada
 FROM tasks t WHERE DATE(t.created_at) BETWEEN ? AND ?
 AND (t.parent_task_id IS NULL OR t.parent_task_id = '')
 AND (t.responsable_user_id = ? OR EXISTS (SELECT 1 FROM task_responsables tr WHERE tr.task_id = t.id AND tr.user_id = ?))`;

export async function consultarDia(userId: string, hoy: string, inicio: Date, fin: Date) {
  const [ingresos, timers, tareas] = await Promise.all([
    query<{ ingreso: Date | null }[]>(SQL_INGRESO, [userId, inicio, fin]),
    query<{ start_time: Date; end_time: Date | null; status: string; duration_seconds: number | null; idle_seconds: number | null }[]>(SQL_TIMERS, [userId, fin, inicio]),
    query<{ total: number; completadas: number }[]>(SQL_TAREAS, [hoy, userId, userId]),
  ]);
  return { ingreso: ingresos[0]?.ingreso ?? null, timers, tareas: { total: Number(tareas[0]?.total ?? 0), completadas: Number(tareas[0]?.completadas ?? 0) } };
}
export function consultarCumplimiento(userId: string, desde: string, hasta: string) {
  return query<{ estado: string; objetivo: string | null; entregada: Date | null }[]>(SQL_CUMPLIMIENTO, [desde, hasta, userId, userId]);
}
