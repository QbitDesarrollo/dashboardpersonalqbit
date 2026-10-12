import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';
import fs from 'fs';
import path from 'path';

export const activityTrackingRouter = Router();

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'screenshots');

// Ensure screenshots directory exists
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch {}

// Record activity snapshot (called every ~60s from client)
activityTrackingRouter.post('/activity-tracking/snapshot', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { time_entry_id, keyboard_events = 0, mouse_events = 0, scroll_events = 0, click_events = 0, tab_hidden = false } = req.body;
    if (!time_entry_id) return res.status(400).json({ error: 'time_entry_id requerido' });

    // Verify session belongs to user
    const session = await queryOne<any>(
      `SELECT id FROM time_entries WHERE id = ? AND user_id = ? AND status IN ('active','paused')`,
      [time_entry_id, req.userId]
    );
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

    const totalEvents = keyboard_events + mouse_events + scroll_events + click_events;
    // 30+ events/minute = 100% activity
    const activityPercent = Math.min(100, Math.round((totalEvents / 30) * 100));
    // Sin actividad en la pestana hay dos casos MUY distintos:
    //  - Tiusdei con el foco y nadie toca nada -> la persona se fue: IDLE (se descuenta)
    //  - pestana oculta o ventana sin foco (`tab_hidden`) -> esta trabajando en otro
    //    programa (Illustrator, Premiere, Figma), aunque Tiusdei se vea en otro
    //    monitor: NO es idle. Antes esto descontaba horas enteras a los disenadores.
    const tabHidden = tab_hidden === true || tab_hidden === 1 || tab_hidden === '1';
    const isIdle = activityPercent < 10 && !tabHidden ? 1 : 0;

    const id = uuid();
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

    await query(
      `INSERT INTO activity_snapshots (id, time_entry_id, user_id, keyboard_events, mouse_events, scroll_events, click_events, activity_percent, is_idle, tab_hidden, snapshot_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, time_entry_id, req.userId, keyboard_events, mouse_events, scroll_events, click_events, activityPercent, isIdle, tabHidden ? 1 : 0, now]
    );

    // Update session's rolling activity level (average of last 10 snapshots)
    const recent = await query<any[]>(
      `SELECT activity_percent FROM activity_snapshots WHERE time_entry_id = ? ORDER BY snapshot_at DESC LIMIT 10`,
      [time_entry_id]
    );
    if (recent.length > 0) {
      const avg = Math.round(recent.reduce((sum: number, r: any) => sum + r.activity_percent, 0) / recent.length);
      await query(`UPDATE time_entries SET activity_level = ? WHERE id = ?`, [avg, time_entry_id]);
    }

    // Track idle time
    if (isIdle) {
      await query(`UPDATE time_entries SET idle_seconds = idle_seconds + 60 WHERE id = ?`, [time_entry_id]);
    }

    res.json({ activity_percent: activityPercent, is_idle: !!isIdle });
  } catch (e) {
    console.error('[ACTIVITY] Error snapshot:', e);
    res.status(500).json({ error: 'Error al registrar actividad' });
  }
});

// Upload screenshot (base64)
activityTrackingRouter.post('/activity-tracking/screenshot', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { time_entry_id, task_id, image_base64, activity_percent = 0 } = req.body;
    if (!time_entry_id || !task_id || !image_base64) {
      return res.status(400).json({ error: 'time_entry_id, task_id, image_base64 requeridos' });
    }

    // Verify session
    const session = await queryOne<any>(
      `SELECT id FROM time_entries WHERE id = ? AND user_id = ?`,
      [time_entry_id, req.userId]
    );
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

    const id = uuid();
    const filename = `${id}.jpg`;
    const thumbFilename = `${id}_thumb.jpg`;
    const filePath = path.join(UPLOADS_DIR, filename);
    const thumbPath = path.join(UPLOADS_DIR, thumbFilename);

    // Decode base64 and save
    const imageBuffer = Buffer.from(image_base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    fs.writeFileSync(filePath, imageBuffer);

    // Create a simple thumbnail (just save same image - could use sharp later)
    fs.writeFileSync(thumbPath, imageBuffer);

    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

    await query(
      `INSERT INTO screenshots (id, time_entry_id, user_id, task_id, file_path, thumbnail_path, activity_percent, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, time_entry_id, req.userId, task_id, `/uploads/screenshots/${filename}`, `/uploads/screenshots/${thumbFilename}`, activity_percent, now]
    );

    // Update screenshot count
    await query(`UPDATE time_entries SET screenshot_count = screenshot_count + 1 WHERE id = ?`, [time_entry_id]);

    res.json({ id, file_path: `/uploads/screenshots/${filename}` });
  } catch (e) {
    console.error('[ACTIVITY] Error screenshot:', e);
    res.status(500).json({ error: 'Error al guardar screenshot' });
  }
});

// List screenshots
activityTrackingRouter.get('/activity-tracking/screenshots', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { user_id, date, task_id, limit = '50', offset = '0' } = req.query as Record<string, string>;
    const isAdminOps = await hasRole(req.userId!, ['admin', 'ejecutivo']);

    // Equipo can only see their own
    const effectiveUserId = (isAdminOps && user_id) ? user_id : req.userId!;

    let where = 'WHERE s.user_id = ?';
    const params: any[] = [effectiveUserId];

    if (date) {
      where += ' AND DATE(s.captured_at) = ?';
      params.push(date);
    }
    if (task_id) {
      where += ' AND s.task_id = ?';
      params.push(task_id);
    }

    const limitNum = Math.min(Math.max(1, parseInt(limit) || 50), 200);
    const offsetNum = Math.max(0, parseInt(offset) || 0);

    const rows = await query<any[]>(
      `SELECT s.*, t.titulo_tarea
       FROM screenshots s
       JOIN tasks t ON t.id = s.task_id
       ${where}
       ORDER BY s.captured_at DESC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );

    res.json({ screenshots: rows });
  } catch (e) {
    console.error('[ACTIVITY] Error listing screenshots:', e);
    res.status(500).json({ error: 'Error al listar screenshots' });
  }
});

// Get activity snapshots for a session
activityTrackingRouter.get('/activity-tracking/snapshots', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { time_entry_id } = req.query as Record<string, string>;
    if (!time_entry_id) return res.status(400).json({ error: 'time_entry_id requerido' });

    const rows = await query<any[]>(
      `SELECT * FROM activity_snapshots WHERE time_entry_id = ? ORDER BY snapshot_at ASC`,
      [time_entry_id]
    );

    res.json({ snapshots: rows });
  } catch (e) {
    console.error('[ACTIVITY] Error listing snapshots:', e);
    res.status(500).json({ error: 'Error al listar snapshots' });
  }
});

// Admin: delete screenshot
activityTrackingRouter.delete('/activity-tracking/screenshots/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });

    const ss = await queryOne<any>('SELECT file_path, thumbnail_path FROM screenshots WHERE id = ?', [req.params.id]);
    if (ss) {
      try { fs.unlinkSync(path.resolve(process.cwd(), ss.file_path.replace(/^\//, ''))); } catch {}
      try { if (ss.thumbnail_path) fs.unlinkSync(path.resolve(process.cwd(), ss.thumbnail_path.replace(/^\//, ''))); } catch {}
    }

    await query('DELETE FROM screenshots WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('[ACTIVITY] Error deleting screenshot:', e);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});
