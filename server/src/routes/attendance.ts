import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

export const attendanceRouter = Router();

// Check in
attendanceRouter.post('/attendance/check-in', requireAuth, async (req: AuthRequest, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const existing = await queryOne<any>(
      `SELECT id FROM attendance WHERE user_id = ? AND DATE(check_in) = ? AND check_out IS NULL LIMIT 1`,
      [req.userId, today]
    );
    if (existing) return res.status(409).json({ error: 'Ya tienes un check-in abierto hoy' });

    const id = uuid();
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    await query(
      `INSERT INTO attendance (id, user_id, check_in, notes) VALUES (?, ?, ?, ?)`,
      [id, req.userId, now, req.body.notes || null]
    );

    const record = await queryOne<any>('SELECT * FROM attendance WHERE id = ?', [id]);
    res.status(201).json({ attendance: record });
  } catch (e) {
    console.error('[ATTENDANCE] Error check-in:', e);
    res.status(500).json({ error: 'Error al registrar entrada' });
  }
});

// Check out
attendanceRouter.post('/attendance/check-out', requireAuth, async (req: AuthRequest, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const open = await queryOne<any>(
      `SELECT id, check_in FROM attendance WHERE user_id = ? AND DATE(check_in) = ? AND check_out IS NULL LIMIT 1`,
      [req.userId, today]
    );
    if (!open) return res.status(404).json({ error: 'No hay check-in abierto' });

    const now = new Date();
    const checkIn = new Date(open.check_in);
    const nowStr = now.toISOString().replace('T', ' ').replace('Z', '');

    // Almuerzo: se descuenta del total de la jornada. Si se va sin marcar el
    // regreso, el almuerzo se cierra al hacer check-out.
    const full = await queryOne<any>('SELECT lunch_start, lunch_end FROM attendance WHERE id = ?', [open.id]);
    let lunchSecs = 0;
    let closeLunch = false;
    if (full?.lunch_start) {
      const ls = new Date(full.lunch_start).getTime();
      const le = full.lunch_end ? new Date(full.lunch_end).getTime() : now.getTime();
      lunchSecs = Math.max(0, Math.floor((le - ls) / 1000));
      closeLunch = !full.lunch_end;
    }
    const totalSeconds = Math.max(0, Math.floor((now.getTime() - checkIn.getTime()) / 1000) - lunchSecs);

    await query(
      closeLunch
        ? `UPDATE attendance SET check_out = ?, total_seconds = ?, lunch_end = ? WHERE id = ?`
        : `UPDATE attendance SET check_out = ?, total_seconds = ? WHERE id = ?`,
      closeLunch ? [nowStr, totalSeconds, nowStr, open.id] : [nowStr, totalSeconds, open.id]
    );

    const record = await queryOne<any>('SELECT * FROM attendance WHERE id = ?', [open.id]);
    res.json({ attendance: record });
  } catch (e) {
    console.error('[ATTENDANCE] Error check-out:', e);
    res.status(500).json({ error: 'Error al registrar salida' });
  }
});

// Today's attendance
// Marcar salida a almuerzo (requiere check-in abierto; un almuerzo por jornada)
attendanceRouter.post('/attendance/lunch-start', requireAuth, async (req: AuthRequest, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const open = await queryOne<any>(
      `SELECT id, lunch_start FROM attendance WHERE user_id = ? AND DATE(check_in) = ? AND check_out IS NULL LIMIT 1`,
      [req.userId, today]
    );
    if (!open) return res.status(404).json({ error: 'Necesitas estar en check-in para marcar tu almuerzo' });
    if (open.lunch_start) return res.status(409).json({ error: 'Ya marcaste tu almuerzo hoy' });

    const nowStr = new Date().toISOString().replace('T', ' ').replace('Z', '');
    await query(`UPDATE attendance SET lunch_start = ? WHERE id = ?`, [nowStr, open.id]);

    // Al salir a almorzar el timer se PAUSA SOLO: el almuerzo no cuenta como
    // jornada, asi que no puede seguir corriendo mientras la persona come.
    let timersPausados = 0;
    const sesiones = await query<any[]>(
      `SELECT te.id, te.task_id, te.start_time, COALESCE(te.idle_seconds, 0) AS idle_seconds, t.titulo_tarea
       FROM time_entries te LEFT JOIN tasks t ON t.id = te.task_id
       WHERE te.user_id = ? AND te.status = 'active'`,
      [req.userId]
    );
    for (const ses of sesiones) {
      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(ses.start_time).getTime()) / 1000));
      const capped = Math.min(10 * 3600, Math.max(0, elapsed - Number(ses.idle_seconds)));
      await query(
        `UPDATE time_entries SET status='completed', end_time=NOW(), duration_seconds=?,
                description=CONCAT(IFNULL(description,''), ' [pausada por almuerzo]')
         WHERE id=? AND status='active'`,
        [capped, ses.id]
      );
      if (ses.task_id) {
        await query(
          'UPDATE tasks SET tiempo_trabajado = tiempo_trabajado + ?, timer_activo = 0, timer_inicio = NULL WHERE id = ?',
          [capped, ses.task_id]
        );
      }
      timersPausados++;
    }
    // Timers legacy sin sesion (tareas donde la persona es responsable)
    const legacy = await query<any[]>(
      `SELECT id, timer_inicio FROM tasks WHERE timer_activo = 1 AND responsable_user_id = ?`,
      [req.userId]
    );
    for (const t of legacy) {
      const elapsed = t.timer_inicio
        ? Math.min(10 * 3600, Math.max(0, Math.floor((Date.now() - new Date(t.timer_inicio).getTime()) / 1000)))
        : 0;
      await query(
        'UPDATE tasks SET tiempo_trabajado = tiempo_trabajado + ?, timer_activo = 0, timer_inicio = NULL WHERE id = ?',
        [elapsed, t.id]
      );
      timersPausados++;
    }

    const record = await queryOne<any>('SELECT * FROM attendance WHERE id = ?', [open.id]);
    res.json({ attendance: record, timers_pausados: timersPausados });
  } catch (e) {
    console.error('[ATTENDANCE] Error lunch-start:', e);
    res.status(500).json({ error: 'Error al marcar almuerzo' });
  }
});

// Marcar regreso del almuerzo
attendanceRouter.post('/attendance/lunch-end', requireAuth, async (req: AuthRequest, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const open = await queryOne<any>(
      `SELECT id, lunch_start, lunch_end FROM attendance WHERE user_id = ? AND DATE(check_in) = ? AND check_out IS NULL LIMIT 1`,
      [req.userId, today]
    );
    if (!open) return res.status(404).json({ error: 'No hay check-in abierto' });
    if (!open.lunch_start) return res.status(400).json({ error: 'No has marcado salida a almuerzo' });
    if (open.lunch_end) return res.status(409).json({ error: 'Ya marcaste tu regreso' });

    const nowStr = new Date().toISOString().replace('T', ' ').replace('Z', '');
    await query(`UPDATE attendance SET lunch_end = ? WHERE id = ?`, [nowStr, open.id]);
    const record = await queryOne<any>('SELECT * FROM attendance WHERE id = ?', [open.id]);
    res.json({ attendance: record });
  } catch (e) {
    console.error('[ATTENDANCE] Error lunch-end:', e);
    res.status(500).json({ error: 'Error al marcar regreso' });
  }
});

attendanceRouter.get('/attendance/today', requireAuth, async (req: AuthRequest, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const record = await queryOne<any>(
      `SELECT * FROM attendance WHERE user_id = ? AND DATE(check_in) = ? ORDER BY check_in DESC LIMIT 1`,
      [req.userId, today]
    );
    res.json({ attendance: record || null });
  } catch (e) {
    console.error('[ATTENDANCE] Error:', e);
    res.status(500).json({ error: 'Error' });
  }
});

// List attendance records
attendanceRouter.get('/attendance', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { user_id, date_from, date_to, limit = '50', offset = '0' } = req.query as Record<string, string>;
    const isAdminOps = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    const effectiveUserId = (isAdminOps && user_id) ? user_id : req.userId!;

    let where = 'WHERE a.user_id = ?';
    const params: any[] = [effectiveUserId];

    if (date_from) { where += ' AND DATE(a.check_in) >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND DATE(a.check_in) <= ?'; params.push(date_to); }

    const limitNum = Math.min(Math.max(1, parseInt(limit) || 50), 200);
    const offsetNum = Math.max(0, parseInt(offset) || 0);

    const rows = await query<any[]>(
      `SELECT a.*, p.nombre, p.avatar_url
       FROM attendance a
       JOIN profiles p ON p.id = a.user_id
       ${where}
       ORDER BY a.check_in DESC LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );

    res.json({ records: rows });
  } catch (e) {
    console.error('[ATTENDANCE] Error listing:', e);
    res.status(500).json({ error: 'Error al listar asistencia' });
  }
});

// Admin: attendance summary
attendanceRouter.get('/attendance/summary', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });

    const { date_from, date_to } = req.query as Record<string, string>;
    const today = new Date().toISOString().slice(0, 10);
    const from = date_from || today;
    const to = date_to || today;

    const rows = await query<any[]>(
      `SELECT a.user_id, p.nombre, p.avatar_url,
              COUNT(*) as total_days,
              SUM(a.total_seconds) as total_seconds,
              AVG(a.total_seconds) as avg_seconds,
              SUM(a.auto_checked_out) as auto_checkouts
       FROM attendance a
       JOIN profiles p ON p.id = a.user_id
       WHERE DATE(a.check_in) >= ? AND DATE(a.check_in) <= ?
       GROUP BY a.user_id, p.nombre, p.avatar_url
       ORDER BY p.nombre`,
      [from, to]
    );

    res.json({ summary: rows, date_from: from, date_to: to });
  } catch (e) {
    console.error('[ATTENDANCE] Error summary:', e);
    res.status(500).json({ error: 'Error al generar resumen' });
  }
});

// Admin: edit attendance
attendanceRouter.patch('/attendance/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });

    const { check_in, check_out, notes } = req.body;
    const updates: string[] = [];
    const params: any[] = [];

    if (check_in) { updates.push('check_in = ?'); params.push(check_in); }
    if (check_out) { updates.push('check_out = ?'); params.push(check_out); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }

    if (check_in && check_out) {
      const total = Math.floor((new Date(check_out).getTime() - new Date(check_in).getTime()) / 1000);
      updates.push('total_seconds = ?');
      params.push(total);
    }

    if (updates.length > 0) {
      params.push(req.params.id);
      await query(`UPDATE attendance SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[ATTENDANCE] Error editing:', e);
    res.status(500).json({ error: 'Error al editar' });
  }
});
