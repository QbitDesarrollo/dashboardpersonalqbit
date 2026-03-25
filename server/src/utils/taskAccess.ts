import { queryOne } from '../db/mysql.js';
import { getUserRole } from './roles.js';

/**
 * Verifica si un usuario puede acceder a una tarea (ver/comentar).
 * admin: acceso total.
 * ejecutivo/equipo: solo tareas de sus mesas o asignadas a él.
 * cliente: solo si la tarea está en una marca asignada al cliente.
 */
export async function canAccessTask(userId: string, taskId: string): Promise<boolean> {
  const task = await queryOne<{ brand_id: string; desk_id: string | null; responsable_user_id: string | null }>(
    'SELECT brand_id, desk_id, responsable_user_id FROM tasks WHERE id = ?', [taskId]
  );
  if (!task) return false;

  const role = await getUserRole(userId);
  if (role === 'admin') return true;

  if (role === 'ejecutivo' || role === 'equipo') {
    // Asignado directamente
    if (task.responsable_user_id === userId) return true;
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
    return !!resp;
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
