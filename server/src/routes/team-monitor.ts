import { Router } from 'express';
import { signPath } from '../utils/signedUrl.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';
import { reunionesDeHoy, horaLimiteIngreso, esIngresoTarde } from '../services/meetingsNow.js';

export const teamMonitorRouter = Router();

const requireAdminOps = async (req: AuthRequest): Promise<boolean> => {
  return hasRole(req.userId!, ['admin', 'ejecutivo']);
};

// Live team status
teamMonitorRouter.get('/team-monitor/live', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireAdminOps(req))) return res.status(403).json({ error: 'Sin permisos' });

    // hoy en Ecuador (no UTC): después de las 19:00 la fecha UTC ya es mañana
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());

    const users = await query<any[]>(
      `SELECT p.id as user_id, p.nombre, p.avatar_url, p.rol,
              te.id as session_id, te.task_id, te.start_time as session_start,
              te.activity_level, te.status as session_status,
              t.titulo_tarea, t.tiempo_trabajado as task_tiempo_trabajado, t.estimated_hours as task_estimated_hours,
              att.check_in as checked_in_at, att.check_out as checked_out_at,
              att.lunch_start, att.lunch_end,
              (SELECT SUM(te2.duration_seconds) FROM time_entries te2 WHERE te2.user_id = p.id AND DATE(CONVERT_TZ(te2.start_time, '+00:00', '-05:00')) = ? AND te2.status = 'completed') as today_completed_seconds
       FROM profiles p
       LEFT JOIN time_entries te ON te.user_id = p.id AND te.status IN ('active','paused')
       LEFT JOIN tasks t ON t.id = te.task_id
       LEFT JOIN attendance att ON att.user_id = p.id AND DATE(CONVERT_TZ(att.check_in, '+00:00', '-05:00')) = ? AND att.check_out IS NULL
       WHERE p.activo = 1 AND p.rol IN ('admin','ejecutivo','equipo')
       ORDER BY te.status DESC, p.nombre`,
      [today, today]
    );

    // Reuniones del calendario (Google) de hoy, por persona
    const reuniones = await reunionesDeHoy(users.map((u: any) => u.user_id));
    // Primer ingreso del día (Ecuador) para marcar "ingreso tarde"
    const limiteIngreso = await horaLimiteIngreso();
    const primerosIngresos = new Map((await query<any[]>(
      `SELECT user_id, MIN(check_in) AS primero FROM attendance WHERE DATE(CONVERT_TZ(check_in, '+00:00', '-05:00')) = ? GROUP BY user_id`,
      [today],
    )).map((r: any) => [r.user_id, r.primero]));
    // Get last screenshot for active users
    for (const user of users) {
      if (user.session_id) {
        const lastSS = await query<any[]>(
          `SELECT file_path, thumbnail_path, activity_percent, captured_at
           FROM screenshots WHERE time_entry_id = ? ORDER BY captured_at DESC LIMIT 1`,
          [user.session_id]
        );
        const ss = lastSS[0] || null;
        if (ss) {
          if (ss.file_path) ss.file_path = signPath(ss.file_path);
          if (ss.thumbnail_path) ss.thumbnail_path = signPath(ss.thumbnail_path);
        }
        user.last_screenshot = ss;

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
      // Acumulado de la tarea en curso: lo ya guardado en la tarea + la sesión activa (aún no sumada)
      user.task_total_seconds = user.task_id
        ? Number(user.task_tiempo_trabajado || 0) + (user.session_status === 'active' ? user.current_session_seconds : 0)
        : null;
      user.task_estimated_hours = user.task_estimated_hours != null ? Number(user.task_estimated_hours) : null;
      // Reuniones y utilización del día: (timer + reuniones) / tiempo conectado (sin almuerzo)
      const reu = reuniones.get(user.user_id);
      user.calendar_connected = !!reu?.conectado;
      user.meeting_now = reu?.ahora ?? null;
      user.meetings_today = reu?.eventos.length ?? 0;
      user.meetings_today_seconds = reu?.hasta_ahora_seg ?? 0;
      user.meetings_today_total_seconds = reu?.hoy_seg ?? 0;
      // Reuniones antes del ingreso, después de la salida o en el almuerzo: no cuentan
      user.meetings_outside_seconds = reu?.fuera_jornada_seg ?? 0;
      user.first_check_in = primerosIngresos.get(user.user_id) ?? null;
      user.late_check_in = esIngresoTarde(user.first_check_in, limiteIngreso);
      user.late_limit = limiteIngreso;
      let attSeg = 0;
      if (user.checked_in_at) {
        const fin = user.checked_out_at ? new Date(user.checked_out_at).getTime() : Date.now();
        attSeg = Math.max(0, (fin - new Date(user.checked_in_at).getTime()) / 1000);
        if (user.lunch_start) {
          const lFin = user.lunch_end ? new Date(user.lunch_end).getTime() : Math.min(Date.now(), fin);
          attSeg -= Math.max(0, (lFin - new Date(user.lunch_start).getTime()) / 1000);
        }
      }
      user.attendance_today_seconds = Math.round(attSeg);
      // Horas trabajadas de hoy = timer + reuniones del calendario (una reunión es trabajo)
      user.work_today_seconds = user.today_total_seconds + user.meetings_today_seconds;
      user.utilization_pct = attSeg >= 600 ? Math.min(100, Math.round((user.work_today_seconds / attSeg) * 100)) : null;
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

    for (const r of rows as any[]) {
      if (r.file_path) r.file_path = signPath(r.file_path);
      if (r.thumbnail_path) r.thumbnail_path = signPath(r.thumbnail_path);
    }
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
