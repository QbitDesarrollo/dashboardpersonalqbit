import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

export const teamMonitorRouter = Router();

const requireAdminOps = async (req: AuthRequest): Promise<boolean> => {
  return hasRole(req.userId!, ['admin', 'ejecutivo']);
};

// Live team status
teamMonitorRouter.get('/team-monitor/live', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireAdminOps(req))) return res.status(403).json({ error: 'Sin permisos' });

    const today = new Date().toISOString().slice(0, 10);

    const users = await query<any[]>(
      `SELECT p.id as user_id, p.nombre, p.avatar_url, p.rol,
              te.id as session_id, te.task_id, te.start_time as session_start,
              te.activity_level, te.status as session_status,
              t.titulo_tarea,
              att.check_in as checked_in_at, att.check_out as checked_out_at,
              (SELECT SUM(te2.duration_seconds) FROM time_entries te2 WHERE te2.user_id = p.id AND DATE(te2.start_time) = ? AND te2.status = 'completed') as today_completed_seconds
       FROM profiles p
       LEFT JOIN time_entries te ON te.user_id = p.id AND te.status IN ('active','paused')
       LEFT JOIN tasks t ON t.id = te.task_id
       LEFT JOIN attendance att ON att.user_id = p.id AND DATE(att.check_in) = ? AND att.check_out IS NULL
       WHERE p.activo = 1 AND p.rol IN ('admin','ejecutivo','equipo')
       ORDER BY te.status DESC, p.nombre`,
      [today, today]
    );

    // Get last screenshot for active users
    for (const user of users) {
      if (user.session_id) {
        const lastSS = await query<any[]>(
          `SELECT file_path, thumbnail_path, activity_percent, captured_at
           FROM screenshots WHERE time_entry_id = ? ORDER BY captured_at DESC LIMIT 1`,
          [user.session_id]
        );
        user.last_screenshot = lastSS[0] || null;

        // Calculate current duration
        if (user.session_start) {
          const elapsed = Math.floor((Date.now() - new Date(user.session_start).getTime()) / 1000);
          // Cap defensivo 12h: si excede, asumimos que olvidaron pausar y reportamos solo 12h
          user.current_session_seconds = Math.min(elapsed, 12 * 3600);
          user.session_overdue = elapsed > 12 * 3600;
        }
      }
      // Cast a Number — MySQL devuelve SUM() como string, evita concatenación en frontend
      user.today_completed_seconds = Number(user.today_completed_seconds || 0);
      user.current_session_seconds = Number(user.current_session_seconds || 0);
      user.today_total_seconds = user.today_completed_seconds + user.current_session_seconds;
    }

    res.json({ users });
  } catch (e) {
    console.error('[TEAM-MONITOR] Error live:', e);
    res.status(500).json({ error: 'Error' });
  }
});

// Daily summary
teamMonitorRouter.get('/team-monitor/daily-summary', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireAdminOps(req))) return res.status(403).json({ error: 'Sin permisos' });

    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

    const rows = await query<any[]>(
      `SELECT p.id as user_id, p.nombre, p.avatar_url,
              COUNT(te.id) as session_count,
              COALESCE(SUM(te.duration_seconds), 0) as total_seconds,
              COALESCE(AVG(te.activity_level), 0) as avg_activity,
              COALESCE(SUM(te.screenshot_count), 0) as total_screenshots,
              COALESCE(SUM(te.idle_seconds), 0) as total_idle_seconds,
              att.check_in, att.check_out, att.total_seconds as attendance_seconds
       FROM profiles p
       LEFT JOIN time_entries te ON te.user_id = p.id AND DATE(te.start_time) = ? AND te.status = 'completed'
       LEFT JOIN attendance att ON att.user_id = p.id AND DATE(att.check_in) = ?
       WHERE p.activo = 1 AND p.rol IN ('admin','ejecutivo','equipo')
       GROUP BY p.id, p.nombre, p.avatar_url, att.check_in, att.check_out, att.total_seconds
       ORDER BY total_seconds DESC`,
      [date, date]
    );

    res.json({ summary: rows, date });
  } catch (e) {
    console.error('[TEAM-MONITOR] Error daily summary:', e);
    res.status(500).json({ error: 'Error' });
  }
});

// Screenshots timeline for a user
teamMonitorRouter.get('/team-monitor/screenshots', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireAdminOps(req))) return res.status(403).json({ error: 'Sin permisos' });

    const { user_id, date } = req.query as Record<string, string>;
    if (!user_id) return res.status(400).json({ error: 'user_id requerido' });

    const targetDate = date || new Date().toISOString().slice(0, 10);

    const rows = await query<any[]>(
      `SELECT s.*, t.titulo_tarea
       FROM screenshots s
       JOIN tasks t ON t.id = s.task_id
       WHERE s.user_id = ? AND DATE(s.captured_at) = ?
       ORDER BY s.captured_at ASC`,
      [user_id, targetDate]
    );

    res.json({ screenshots: rows });
  } catch (e) {
    console.error('[TEAM-MONITOR] Error screenshots:', e);
    res.status(500).json({ error: 'Error' });
  }
});

// Productivity report
teamMonitorRouter.get('/team-monitor/productivity', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireAdminOps(req))) return res.status(403).json({ error: 'Sin permisos' });

    const today = new Date().toISOString().slice(0, 10);
    const { date_from = today, date_to = today } = req.query as Record<string, string>;

    const byUser = await query<any[]>(
      `SELECT p.id as user_id, p.nombre, p.avatar_url,
              COUNT(te.id) as session_count,
              COALESCE(SUM(te.duration_seconds), 0) as total_seconds,
              COALESCE(AVG(te.activity_level), 0) as avg_activity,
              COALESCE(SUM(te.idle_seconds), 0) as idle_seconds,
              COALESCE(SUM(te.screenshot_count), 0) as screenshots
       FROM profiles p
       LEFT JOIN time_entries te ON te.user_id = p.id
         AND DATE(te.start_time) >= ? AND DATE(te.start_time) <= ?
         AND te.status = 'completed'
       WHERE p.activo = 1 AND p.rol IN ('admin','ejecutivo','equipo')
       GROUP BY p.id, p.nombre, p.avatar_url
       HAVING total_seconds > 0
       ORDER BY total_seconds DESC`,
      [date_from, date_to]
    );

    const byDay = await query<any[]>(
      `SELECT DATE(te.start_time) as day,
              COUNT(DISTINCT te.user_id) as active_users,
              SUM(te.duration_seconds) as total_seconds,
              AVG(te.activity_level) as avg_activity
       FROM time_entries te
       WHERE DATE(te.start_time) >= ? AND DATE(te.start_time) <= ?
         AND te.status = 'completed'
       GROUP BY DATE(te.start_time)
       ORDER BY day ASC`,
      [date_from, date_to]
    );

    res.json({ by_user: byUser, by_day: byDay, date_from, date_to });
  } catch (e) {
    console.error('[TEAM-MONITOR] Error productivity:', e);
    res.status(500).json({ error: 'Error' });
  }
});

// Attendance report
teamMonitorRouter.get('/team-monitor/attendance', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireAdminOps(req))) return res.status(403).json({ error: 'Sin permisos' });

    const today = new Date().toISOString().slice(0, 10);
    const { date_from = today, date_to = today } = req.query as Record<string, string>;

    const rows = await query<any[]>(
      `SELECT a.*, p.nombre, p.avatar_url
       FROM attendance a
       JOIN profiles p ON p.id = a.user_id
       WHERE DATE(a.check_in) >= ? AND DATE(a.check_in) <= ?
       ORDER BY a.check_in DESC`,
      [date_from, date_to]
    );

    res.json({ records: rows, date_from, date_to });
  } catch (e) {
    console.error('[TEAM-MONITOR] Error attendance:', e);
    res.status(500).json({ error: 'Error' });
  }
});
