import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';

export const notificationsRouter = Router();

/**
 * GET /api/notifications
 * Get notifications for the authenticated user
 */
notificationsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const unreadOnly = req.query.unread === 'true';

    let query = supabaseAdmin
      .from('notifications')
      .select('*, tasks(titulo_tarea)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq('leida', false);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ notifications: data || [] });
  } catch (error) {
    console.error('[NOTIFICATIONS] Error fetching:', error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

/**
 * GET /api/notifications/count
 * Get unread notification count
 */
notificationsRouter.get('/count', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const { count, error } = await supabaseAdmin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('leida', false);

    if (error) throw error;

    res.json({ count: count || 0 });
  } catch (error) {
    console.error('[NOTIFICATIONS] Error counting:', error);
    res.status(500).json({ error: 'Error al contar notificaciones' });
  }
});

const createNotificationSchema = z.object({
  userId: z.string().uuid(),
  mensaje: z.string().min(1).max(500),
  taskId: z.string().uuid().optional(),
});

/**
 * POST /api/notifications
 * Create a notification for a user
 */
notificationsRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = createNotificationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
      return;
    }

    const { userId, mensaje, taskId } = parsed.data;

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: userId,
        mensaje,
        task_id: taskId || null,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ notification: data });
  } catch (error) {
    console.error('[NOTIFICATIONS] Error creating:', error);
    res.status(500).json({ error: 'Error al crear notificación' });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a notification as read
 */
notificationsRouter.patch('/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ leida: true })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('[NOTIFICATIONS] Error marking read:', error);
    res.status(500).json({ error: 'Error al marcar como leída' });
  }
});

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read
 */
notificationsRouter.patch('/read-all', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ leida: true })
      .eq('user_id', userId)
      .eq('leida', false);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('[NOTIFICATIONS] Error marking all read:', error);
    res.status(500).json({ error: 'Error al marcar todas como leídas' });
  }
});
