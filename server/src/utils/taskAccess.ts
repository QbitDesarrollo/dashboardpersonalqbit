import { queryOne } from '../db/mysql.js';
import { getUserRole } from './roles.js';

/**
 * Verifica si un usuario puede acceder a una tarea (ver/comentar).
 * admin/ops/equipo: acceso total.
 * cliente: solo si la tarea está en una marca asignada al cliente.
 */
export async function canAccessTask(userId: string, taskId: string): Promise<boolean> {
  const task = await queryOne<{ brand_id: string }>('SELECT brand_id FROM tasks WHERE id = ?', [taskId]);
  if (!task) return false;

  const role = await getUserRole(userId);
  if (['admin', 'ops', 'equipo'].includes(role)) return true;

  if (role === 'cliente') {
    const row = await queryOne<{ n: number }>(
      'SELECT 1 as n FROM client_brands WHERE user_id = ? AND brand_id = ? LIMIT 1',
      [userId, task.brand_id]
    );
    return !!row;
  }

  return false;
}
