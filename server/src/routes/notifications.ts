import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';

export const notificationsRouter = Router();

notificationsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const limitRaw = parseInt(String(req.query.limit), 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
    const unreadOnly = req.query.unread === 'true';

    let sql = `
      SELECT n.*, t.titulo_tarea
      FROM notifications n
      LEFT JOIN tasks t ON t.id = n.task_id
      WHERE n.user_id = ?
    `;
    const params: any[] = [userId];
    if (unreadOnly) {
      sql += ' AND n.leida = 0';
    }
    // Inline limit to avoid mysql2 prepared-statement type issues with LIMIT
    sql += ` ORDER BY n.created_at DESC LIMIT ${limit}`;

    const rows = await query<any[]>(sql, params);
    const notifications = rows.map((r) => ({ ...r, tasks: r.titulo_tarea ? { titulo_tarea: r.titulo_tarea } : null }));
    res.json({ notifications });
  } catch (error) {
    console.error('[NOTIFICATIONS] Error fetching:', error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

notificationsRouter.get('/count', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const row = await queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND leida = 0', [userId]);
    res.json({ count: row?.cnt ?? 0 });
  } catch (error) {
    console.error('[NOTIFICATIONS] Error counting:', error);
    res.status(500).json({ error: 'Error al contar notificaciones' });
  }
});

const createNotificationSchema = z.object({
  userId: z.string(),
  mensaje: z.string().min(1).max(500),
  taskId: z.string().optional(),
});

notificationsRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = createNotificationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
      return;
    }
    const { userId, mensaje, taskId } = parsed.data;
    const id = uuid();
    await query('INSERT INTO notifications (id, user_id, mensaje, task_id) VALUES (?, ?, ?, ?)', [id, userId, mensaje, taskId || null]);
    const row = await queryOne<any>('SELECT * FROM notifications WHERE id = ?', [id]);
    res.status(201).json({ notification: row });
  } catch (error) {
    console.error('[NOTIFICATIONS] Error creating:', error);
    res.status(500).json({ error: 'Error al crear notificación' });
  }
});

notificationsRouter.patch('/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    await query('UPDATE notifications SET leida = 1 WHERE id = ? AND user_id = ?', [id, userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('[NOTIFICATIONS] Error marking read:', error);
    res.status(500).json({ error: 'Error al marcar como leída' });
  }
});

notificationsRouter.patch('/read-all', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    await query('UPDATE notifications SET leida = 1 WHERE user_id = ? AND leida = 0', [userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('[NOTIFICATIONS] Error marking all read:', error);
    res.status(500).json({ error: 'Error al marcar todas como leídas' });
  }
});
