import { query } from '../db/mysql.js';
import { ESTADOS_CERRADOS, formarResumen, type FilaResumen, type FilaCanal } from './dominio.js';

/** Subconsultas independientes evitan multiplicar personas/tareas por los canales. */
export async function consultarResumen() {
  const filas = await query<FilaResumen[]>(`
    SELECT d.id, d.nombre, d.orden, d.color, d.next_department_id,
           dn.nombre AS next_department_nombre, d.activo,
           (SELECT COUNT(*) FROM profiles p WHERE p.department_id = d.id AND p.activo = 1) AS personas,
           (SELECT COUNT(*) FROM tasks t WHERE t.department_id = d.id
             AND t.estado NOT IN (?, ?, ?)) AS tareas_abiertas,
           (SELECT COUNT(*) FROM tasks t WHERE t.department_id = d.id) AS tareas_total
    FROM departments d
    LEFT JOIN departments dn ON dn.id = d.next_department_id
    ORDER BY d.orden, d.nombre, d.id
  `, ESTADOS_CERRADOS);
  const canales = await query<FilaCanal[]>(`
    SELECT department_id, nombre FROM desks
    WHERE department_id IS NOT NULL ORDER BY nombre, id
  `);
  return formarResumen(filas, canales);
}
