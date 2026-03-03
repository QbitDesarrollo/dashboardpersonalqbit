import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

export const timeSessionsRouter = Router();

// Get current user's active session
timeSessionsRouter.get('/time-sessions/active', requireAuth, async (req: AuthRequest, res) => {
  try {
    const row = await queryOne<any>(
      `SELECT te.*, t.titulo_tarea, t.brand_id, b.nombre as brand_nombre
       FROM time_entries te
       JOIN tasks t ON t.id = te.task_id
       LEFT JOIN brands b ON b.id = t.brand_id
       WHERE te.user_id = ? AND te.status = 'active'
       LIMIT 1`,
      [req.userId]
    );
    res.json({ session: row || null });
  } catch (e) {
    console.error('[TIME-SESSIONS] Error:', e);
    res.status(500).json({ error: 'Error al obtener sesión activa' });
  }
});

// Start a new time session
timeSessionsRouter.post('/time-sessions/start', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { task_id } = req.body;
    if (!task_id) return res.status(400).json({ error: 'task_id requerido' });

    // Check no other active session
    const existing = await queryOne<any>(
      `SELECT id, task_id FROM time_entries WHERE user_id = ? AND status = 'active' LIMIT 1`,
      [req.userId]
    );
    if (existing) {
      return res.status(409).json({
        error: 'Ya tienes una sesión activa',
        active_session_id: existing.id,
        active_task_id: existing.task_id,
      });
    }

    const id = uuid();
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

    await query(
      `INSERT INTO time_entries (id, task_id, user_id, start_time, status)
       VALUES (?, ?, ?, ?, 'active')`,
      [id, task_id, req.userId, now]
    );

    // Update task timer fields for backward compatibility
    await query(
      `UPDATE tasks SET timer_activo = 1, timer_inicio = ? WHERE id = ?`,
      [now, task_id]
    );

    const session = await queryOne<any>('SELECT * FROM time_entries WHERE id = ?', [id]);
    res.status(201).json({ session });
  } catch (e) {
    console.error('[TIME-SESSIONS] Error starting:', e);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// Stop a session
timeSessionsRouter.post('/time-sessions/:id/stop', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const session = await queryOne<any>(
      `SELECT * FROM time_entries WHERE id = ? AND user_id = ?`,
      [id, req.userId]
    );
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });
    if (session.status === 'completed') return res.status(400).json({ error: 'Sesión ya completada' });

    const now = new Date();
    const startTime = new Date(session.start_time);
    const totalSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
    const effectiveSeconds = Math.max(0, totalSeconds - (session.idle_seconds || 0));
    const nowStr = now.toISOString().replace('T', ' ').replace('Z', '');

    await query(
      `UPDATE time_entries SET end_time = ?, duration_seconds = ?, status = 'completed' WHERE id = ?`,
      [nowStr, effectiveSeconds, id]
    );

    // Update task accumulated time
    await query(
      `UPDATE tasks SET tiempo_trabajado = tiempo_trabajado + ?, timer_activo = 0, timer_inicio = NULL WHERE id = ?`,
      [effectiveSeconds, session.task_id]
    );

    res.json({ success: true, duration_seconds: effectiveSeconds });
  } catch (e) {
    console.error('[TIME-SESSIONS] Error stopping:', e);
    res.status(500).json({ error: 'Error al detener sesión' });
  }
});

// Pause a session
timeSessionsRouter.post('/time-sessions/:id/pause', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const session = await queryOne<any>(
      `SELECT * FROM time_entries WHERE id = ? AND user_id = ? AND status = 'active'`,
      [id, req.userId]
    );
    if (!session) return res.status(404).json({ error: 'Sesión activa no encontrada' });

    await query(`UPDATE time_entries SET status = 'paused' WHERE id = ?`, [id]);
    await query(`UPDATE tasks SET timer_activo = 0 WHERE id = ?`, [session.task_id]);

    res.json({ success: true });
  } catch (e) {
    console.error('[TIME-SESSIONS] Error pausing:', e);
    res.status(500).json({ error: 'Error al pausar' });
  }
});

// Resume a paused session
timeSessionsRouter.post('/time-sessions/:id/resume', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const session = await queryOne<any>(
      `SELECT * FROM time_entries WHERE id = ? AND user_id = ? AND status = 'paused'`,
      [id, req.userId]
    );
    if (!session) return res.status(404).json({ error: 'Sesión pausada no encontrada' });

    await query(`UPDATE time_entries SET status = 'active' WHERE id = ?`, [id]);
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    await query(`UPDATE tasks SET timer_activo = 1, timer_inicio = ? WHERE id = ?`, [now, session.task_id]);

    res.json({ success: true });
  } catch (e) {
    console.error('[TIME-SESSIONS] Error resuming:', e);
    res.status(500).json({ error: 'Error al reanudar' });
  }
});

// List sessions
timeSessionsRouter.get('/time-sessions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { user_id, task_id, date_from, date_to, limit = '50', offset = '0' } = req.query as Record<string, string>;
    const isAdminOps = await hasRole(req.userId!, ['admin', 'ops']);
    const effectiveUserId = (isAdminOps && user_id) ? user_id : req.userId!;

    let where = 'WHERE te.user_id = ?';
    const params: any[] = [effectiveUserId];

    if (task_id) { where += ' AND te.task_id = ?'; params.push(task_id); }
    if (date_from) { where += ' AND te.start_time >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND te.start_time <= ?'; params.push(date_to + ' 23:59:59'); }

    const rows = await query<any[]>(
      `SELECT te.*, t.titulo_tarea, b.nombre as brand_nombre
       FROM time_entries te
       JOIN tasks t ON t.id = te.task_id
       LEFT JOIN brands b ON b.id = t.brand_id
       ${where}
       ORDER BY te.start_time DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const countRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM time_entries te ${where}`,
      params
    );

    res.json({ sessions: rows, total: countRow?.total || 0 });
  } catch (e) {
    console.error('[TIME-SESSIONS] Error listing:', e);
    res.status(500).json({ error: 'Error al listar sesiones' });
  }
});

// Admin: delete session
timeSessionsRouter.delete('/time-sessions/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });

    await query('DELETE FROM time_entries WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('[TIME-SESSIONS] Error deleting:', e);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});
