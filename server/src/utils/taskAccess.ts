import { queryOne } from '../db/mysql.js';
import { getUserRole } from './roles.js';

/**
 * Verifica si un usuario puede acceder a una tarea (ver/comentar).
 * admin: acceso total.
 * ejecutivo/equipo: solo tareas de sus mesas o asignadas a él.
 * cliente: solo si la tarea está en una marca asignada al cliente.
 */
export async function canAccessTask(userId: string, taskId: string, _depth: number = 0): Promise<boolean> {
  const task = await queryOne<{ brand_id: string; desk_id: string | null; responsable_user_id: string | null; parent_task_id: string | null; client_board_id: string | null; created_by: string | null }>(
    'SELECT brand_id, desk_id, responsable_user_id, parent_task_id, client_board_id, created_by FROM tasks WHERE id = ?', [taskId]
  );
  if (!task) return false;

  // FIX: si es subtarea, heredar acceso del padre. Si tienes acceso al padre, puedes comentar en sus subtareas.
  // Limit recursion depth a 5 niveles para evitar loops/abuso.
  if (task.parent_task_id && _depth < 5) {
    const parentAccess = await canAccessTask(userId, task.parent_task_id, _depth + 1);
    if (parentAccess) return true;
  }

  const role = await getUserRole(userId);
  if (role === 'admin') return true;

  if (role === 'ejecutivo' || role === 'equipo') {
    // Asignado directamente
    if (task.responsable_user_id === userId) return true;
    // Creador de la tarea
    if (task.created_by === userId) return true;
    // Ejecutivo: las tareas de tableros de cliente son de su dominio
    // (el módulo /clientes es admin+ejecutivo; estas tareas suelen no tener mesa)
    if (role === 'ejecutivo' && task.client_board_id) return true;
    // Miembro de la mesa de la tarea
    if (task.desk_id) {
      const member = await queryOne<{ n: number }>(
        'SELECT 1 as n FROM desk_members WHERE desk_id = ? AND user_id = ? LIMIT 1',
        [task.desk_id, userId]
      );
      if (member) return true;
    }
    // En task_responsables
    const resp = await queryOne<{ n: number }>(
      'SELECT 1 as n FROM task_responsables WHERE task_id = ? AND user_id = ? LIMIT 1',
      [taskId, userId]
    );
    if (resp) return true;
    // Seguidor de la tarea (le pasaron la tarea y la sigue viendo)
    const seg = await queryOne<{ n: number }>(
      'SELECT 1 as n FROM task_seguidores WHERE task_id = ? AND user_id = ? LIMIT 1',
      [taskId, userId]
    );
    return !!seg;
  }

  if (role === 'cliente') {
    const row = await queryOne<{ n: number }>(
      'SELECT 1 as n FROM client_brands WHERE user_id = ? AND brand_id = ? LIMIT 1',
      [userId, task.brand_id]
    );
    return !!row;
  }

  return false;
}
