import { query } from '../db/mysql.js';
import { ESTADOS_CERRADOS, formarResumen, type FilaResumen, type FilaCanal } from './dominio.js';

/** Subconsultas independientes evitan multiplicar personas/tareas por los canales. */
export const RESUMEN = `
    SELECT d.id, d.nombre, d.orden, d.color, d.next_department_id,
           dn.nombre AS next_department_nombre, d.activo,
           (SELECT COUNT(*) FROM profiles p WHERE p.department_id = d.id AND p.activo = 1) AS personas,
           (SELECT COUNT(*) FROM tasks t WHERE t.department_id = d.id
             AND t.estado NOT IN (?, ?, ?)) AS tareas_abiertas,
           (SELECT COUNT(*) FROM tasks t WHERE t.department_id = d.id) AS tareas_total
    FROM departments d
    LEFT JOIN departments dn ON dn.id = d.next_department_id
    ORDER BY d.orden, d.nombre, d.id
  `;
export const CANALES = `
    SELECT department_id, nombre FROM desks
    WHERE department_id IS NOT NULL ORDER BY nombre, id
  `;

// Bloqueo ordenado del catálogo: serializa archivo/restauración/eliminación y sus cadenas.
export const BLOQUEAR_DEPARTAMENTOS = 'SELECT id, nombre, activo, next_department_id FROM departments ORDER BY id FOR UPDATE';
export const TAREAS_ABIERTAS = 'SELECT id, responsable_user_id FROM tasks WHERE department_id = ? AND estado NOT IN (?, ?, ?) ORDER BY id FOR UPDATE';
export const MOVER_TAREA = 'UPDATE tasks SET department_id = ? WHERE id = ?';
export const CERRAR_HISTORIAL = 'UPDATE task_department_history SET exited_at = NOW(3) WHERE task_id = ? AND exited_at IS NULL';
export const ABRIR_HISTORIAL = 'INSERT INTO task_department_history (id, task_id, department_id, responsable_user_id) VALUES (?, ?, ?, ?)';
export const MOVER_PERSONAS = 'UPDATE profiles SET department_id = ? WHERE department_id = ?';
export const MOVER_MESAS = 'UPDATE desks SET department_id = ? WHERE department_id = ?';
export const ETAPAS_ENTRANTES = 'SELECT id FROM departments WHERE next_department_id = ? ORDER BY id FOR UPDATE';
export const REENCADENAR_ETAPA = 'UPDATE departments SET next_department_id = ? WHERE id = ?';
export const ARCHIVAR = 'UPDATE departments SET activo = 0 WHERE id = ?';
export const RESTAURAR = 'UPDATE departments SET activo = 1 WHERE id = ?';
export const ELIMINAR = 'DELETE FROM departments WHERE id = ?';

// Lecturas actuales con bloqueos de rango (REPEATABLE READ), no snapshots COUNT(*).
// Incluyen perfiles inactivos e historial cerrado: ninguna referencia se pierde por CASCADE/SET NULL.
export const REFERENCIAS = {
  tareas: 'SELECT id FROM tasks WHERE department_id = ? FOR UPDATE',
  historial: 'SELECT id FROM task_department_history WHERE department_id = ? FOR UPDATE',
  traspasos: 'SELECT id FROM task_handoffs WHERE from_department_id = ? OR to_department_id = ? FOR UPDATE',
  plantillas: 'SELECT id FROM template_tasks WHERE department_id = ? FOR UPDATE',
  personas: 'SELECT id FROM profiles WHERE department_id = ? FOR UPDATE',
  mesas: 'SELECT id FROM desks WHERE department_id = ? FOR UPDATE',
  etapas: 'SELECT id FROM departments WHERE next_department_id = ? FOR UPDATE',
} as const;
// Vista previa del diálogo (solo lectura): conteos sin bloquear filas.
export const LEER_DEPARTAMENTOS = 'SELECT id, nombre, activo, next_department_id FROM departments ORDER BY id';
export const CONTAR_REFERENCIAS = {
  tareas: 'SELECT COUNT(*) AS n FROM tasks WHERE department_id = ?',
  historial: 'SELECT COUNT(*) AS n FROM task_department_history WHERE department_id = ?',
  traspasos: 'SELECT COUNT(*) AS n FROM task_handoffs WHERE from_department_id = ? OR to_department_id = ?',
  plantillas: 'SELECT COUNT(*) AS n FROM template_tasks WHERE department_id = ?',
  personas: 'SELECT COUNT(*) AS n FROM profiles WHERE department_id = ?',
  mesas: 'SELECT COUNT(*) AS n FROM desks WHERE department_id = ?',
  etapas: 'SELECT COUNT(*) AS n FROM departments WHERE next_department_id = ?',
} as const;
export const AISLAMIENTO = 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ';

export async function consultarResumen() {
  const filas = await query<FilaResumen[]>(RESUMEN, ESTADOS_CERRADOS);
  const canales = await query<FilaCanal[]>(CANALES);
  return formarResumen(filas, canales);
}
