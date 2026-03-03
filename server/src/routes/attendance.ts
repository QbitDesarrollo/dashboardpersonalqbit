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
    const totalSeconds = Math.floor((now.getTime() - checkIn.getTime()) / 1000);
    const nowStr = now.toISOString().replace('T', ' ').replace('Z', '');

    await query(
      `UPDATE attendance SET check_out = ?, total_seconds = ? WHERE id = ?`,
      [nowStr, totalSeconds, open.id]
    );

    const record = await queryOne<any>('SELECT * FROM attendance WHERE id = ?', [open.id]);
    res.json({ attendance: record });
  } catch (e) {
    console.error('[ATTENDANCE] Error check-out:', e);
    res.status(500).json({ error: 'Error al registrar salida' });
  }
});

// Today's attendance
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
    const isAdminOps = await hasRole(req.userId!, ['admin', 'ops']);
    const effectiveUserId = (isAdminOps && user_id) ? user_id : req.userId!;

    let where = 'WHERE a.user_id = ?';
    const params: any[] = [effectiveUserId];

    if (date_from) { where += ' AND DATE(a.check_in) >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND DATE(a.check_in) <= ?'; params.push(date_to); }

    const rows = await query<any[]>(
      `SELECT a.*, p.nombre, p.avatar_url
       FROM attendance a
       JOIN profiles p ON p.id = a.user_id
       ${where}
       ORDER BY a.check_in DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
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
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
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
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
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
