import { query } from '../db/mysql.js';
import { alcanceDashboard } from './permisos.js';

interface Fila {
  id: string; titulo_tarea: string; fecha_entrega: string | null; prioridad: string; estado: string;
  responsable_user_id: string | null; brand_id: string; desk_id: string | null;
  cantidad_entregables: number; tiempo_trabajado: number; brand_nombre: string | null;
}

export async function consultarTareasDashboard(userId: string, role: string) {
  const { acceso, parametros } = alcanceDashboard(userId, role);
  return query<Fila[]>(`SELECT t.id, t.titulo_tarea, t.fecha_entrega, t.prioridad, t.estado,
      t.responsable_user_id, t.brand_id, t.desk_id, t.cantidad_entregables, t.tiempo_trabajado, b.nombre AS brand_nombre
      FROM tasks t LEFT JOIN brands b ON b.id = t.brand_id
      WHERE (t.parent_task_id IS NULL OR t.parent_task_id = '') AND (${acceso})
      ORDER BY t.created_at DESC, t.id`, parametros);
}
