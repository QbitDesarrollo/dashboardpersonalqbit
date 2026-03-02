import { query, uuid } from '../db/mysql.js';

/**
 * Create an in-app notification for a user (assignee, author, etc.).
 */
export async function createNotification(
  userId: string,
  mensaje: string,
  taskId?: string | null
): Promise<void> {
  try {
    const id = uuid();
    await query(
      'INSERT INTO notifications (id, user_id, mensaje, task_id) VALUES (?, ?, ?, ?)',
      [id, userId, mensaje, taskId ?? null]
    );
  } catch (error) {
    console.error('[NOTIFICATION] Error creando:', error);
  }
}
