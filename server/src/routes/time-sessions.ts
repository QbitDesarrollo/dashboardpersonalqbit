import { Router } from 'express';
import { canAccessTask } from '../utils/taskAccess.js';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

export const timeSessionsRouter = Router();

// Sesiones de tiempo de una tarea, de todas las personas (historial del detalle)
timeSessionsRouter.get('/time-sessions/task/:taskId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const taskId = String(req.params.taskId);
    if (!(await canAccessTask(req.userId!, taskId))) return res.status(403).json({ error: 'Sin acceso a la tarea' });
    const rows = await query<any[]>(
      `SELECT te.id, te.user_id, p.nombre, p.avatar_url, te.start_time, te.end_time, te.duration_seconds, te.status
       FROM time_entries te LEFT JOIN profiles p ON p.id = te.user_id
       WHERE te.task_id = ? ORDER BY te.start_time DESC LIMIT 200`,
      [taskId],
    );
    res.json({ sessions: rows });
  } catch (e) {
    console.error('[TIME-SESSIONS] task:', e);
    res.status(500).json({ error: 'Error al cargar sesiones' });
  }
});

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
    if (!(await canAccessTask(req.userId!, String(task_id)))) return res.status(403).json({ error: 'Sin acceso a esta tarea' });

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
    // Tope de 10h por sesion: sin esto, una sesion olvidada por dias quedaba con
    // duraciones absurdas (72h+) y ensuciaba el Monitor y el tiempo por persona.
    const effectiveSeconds = Math.min(12 * 3600, Math.max(0, totalSeconds - (session.idle_seconds || 0)));
    const nowStr = now.toISOString().replace('T', ' ').replace('Z', '');

    await query(
      `UPDATE time_entries SET end_time = ?, duration_seconds = ?, status = 'completed' WHERE id = ?`,
      [nowStr, effectiveSeconds, id]
    );

    // OJO: aquí NO se suma a tasks.tiempo_trabajado. El flujo interactivo
    // (TaskTimer) ya manda el delta legacy al pausar; sumar aquí también
    // duplicaba el tiempo de la tarea (se detectaron 291 tareas en 2.0x).
    // Los jobs de auto-pausa/cierre sí suman porque ahí no hay cliente.

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
    const isAdminOps = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    const effectiveUserId = (isAdminOps && user_id) ? user_id : req.userId!;

    let where = 'WHERE te.user_id = ?';
    const params: any[] = [effectiveUserId];

    if (task_id) { where += ' AND te.task_id = ?'; params.push(task_id); }
    if (date_from) { where += ' AND te.start_time >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND te.start_time <= ?'; params.push(date_to + ' 23:59:59'); }

    const limitNum = Math.min(Math.max(1, parseInt(limit) || 50), 200);
    const offsetNum = Math.max(0, parseInt(offset) || 0);

    const rows = await query<any[]>(
      `SELECT te.*, t.titulo_tarea, b.nombre as brand_nombre
       FROM time_entries te
       JOIN tasks t ON t.id = te.task_id
       LEFT JOIN brands b ON b.id = t.brand_id
       ${where}
       ORDER BY te.start_time DESC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
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
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });

    await query('DELETE FROM time_entries WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('[TIME-SESSIONS] Error deleting:', e);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});


// ── Latido del timer: el frontend lo manda cada 60s mientras Tiusdei está abierto ──
// Si deja de llegar (>5 min), el job heartbeatAutoPause pausa la sesión sola.
timeSessionsRouter.post('/time-sessions/heartbeat', requireAuth, async (req: AuthRequest, res) => {
  try {
    await query(
      `UPDATE time_entries SET last_heartbeat = NOW() WHERE user_id = ? AND status = 'active'`,
      [req.userId]
    );
    const row = await queryOne<any>(
      `SELECT te.id, te.task_id, t.titulo_tarea FROM time_entries te
       LEFT JOIN tasks t ON t.id = te.task_id
       WHERE te.user_id = ? AND te.status = 'active' LIMIT 1`,
      [req.userId]
    );
    if (!row) { res.json({ active: false }); return; }

    // ¿Ya es hora de cierre (Ecuador)? El cliente muestra el modal de confirmación.
    const enabledRow = await queryOne<{ value: string }>("SELECT value FROM site_settings WHERE `key` = 'timer_eod_enabled'");
    const hourRow = await queryOne<{ value: string }>("SELECT value FROM site_settings WHERE `key` = 'timer_eod_hour'");
    const eodHour = Math.max(0, Math.min(23, parseInt(hourRow?.value || '18')));
    const closeHour = Math.min(23, eodHour + 2);
    const ecuHour = new Date(Date.now() - 5 * 3600 * 1000).getUTCHours();
    const eod = (!enabledRow || enabledRow.value !== '0') && ecuHour >= closeHour;

    res.json({ active: true, session_id: row.id, task_id: row.task_id, titulo: row.titulo_tarea || null, eod });
  } catch (e) {
    console.error('[TIME-SESSIONS] heartbeat error:', e);
    res.status(500).json({ error: 'Error en heartbeat' });
  }
});

// ── Pausar MI sesión activa (server-side completo: sesión + tarea, sin math en el cliente) ──
timeSessionsRouter.post('/time-sessions/pause-mine', requireAuth, async (req: AuthRequest, res) => {
  try {
    const session = await queryOne<any>(
      `SELECT * FROM time_entries WHERE user_id = ? AND status = 'active' LIMIT 1`,
      [req.userId]
    );
    if (!session) { res.json({ ok: false, motivo: 'sin sesión activa' }); return; }

    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(session.start_time).getTime()) / 1000));
    const capped = Math.min(12 * 3600, Math.max(0, elapsed - (session.idle_seconds || 0)));

    await query(
      `UPDATE time_entries SET status='completed', end_time=NOW(), duration_seconds=? WHERE id=?`,
      [capped, session.id]
    );
    await query(
      'UPDATE tasks SET tiempo_trabajado = tiempo_trabajado + ?, timer_activo = 0, timer_inicio = NULL WHERE id = ?',
      [capped, session.task_id]
    );
    res.json({ ok: true, duration_seconds: capped });
  } catch (e) {
    console.error('[TIME-SESSIONS] pause-mine error:', e);
    res.status(500).json({ error: 'Error al pausar' });
  }
});

// ── Sugerencia de reanudar: última sesión auto-pausada reciente (12h) sin sesión activa nueva ──
timeSessionsRouter.get('/time-sessions/resume-suggestion', requireAuth, async (req: AuthRequest, res) => {
  try {
    const active = await queryOne<any>(
      `SELECT id FROM time_entries WHERE user_id = ? AND status = 'active' LIMIT 1`,
      [req.userId]
    );
    if (active) { res.json({}); return; }
    const row = await queryOne<any>(
      `SELECT te.task_id, t.titulo_tarea AS titulo, te.end_time, te.duration_seconds
       FROM time_entries te
       JOIN tasks t ON t.id = te.task_id
       WHERE te.user_id = ? AND te.status = 'completed'
         AND te.description LIKE '%auto-pausada: Tiusdei cerrado%'
         AND te.end_time > DATE_SUB(NOW(), INTERVAL 12 HOUR)
       ORDER BY te.end_time DESC LIMIT 1`,
      [req.userId]
    );
    res.json(row || {});
  } catch (e) {
    console.error('[TIME-SESSIONS] resume-suggestion error:', e);
    res.status(500).json({ error: 'Error' });
  }
});
