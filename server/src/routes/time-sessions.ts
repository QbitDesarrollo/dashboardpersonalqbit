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
// Apaga el timer de la tarea si SIGUE marcado como corriendo, sumando el tramo desde
// timer_inicio (como hace el PATCH de la tarea). En el flujo de la fila de Tareas la
// tarea ya llega pausada (el PATCH va primero), así que aquí no se suma nada y no se
// duplica; sirve cuando se detiene desde otro lugar u otro dispositivo, que antes
// dejaba la tarea "corriendo" para siempre (incidencia de Steven, 28-ago).
async function apagarTimerDeTarea(taskId: string | null | undefined): Promise<void> {
  if (!taskId) return;
  await query(
    `UPDATE tasks SET tiempo_trabajado = tiempo_trabajado + LEAST(43200, GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, timer_inicio, NOW()), 0))),
            timer_activo = 0, timer_inicio = NULL
     WHERE id = ? AND timer_activo = 1`,
    [taskId]
  );
}

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

    // OJO: aquí NO se suma la sesión a tasks.tiempo_trabajado. El flujo interactivo
    // (TaskTimer) ya manda el delta legacy al pausar; sumar aquí también
    // duplicaba el tiempo de la tarea (se detectaron 291 tareas en 2.0x).
    // Solo si la tarea quedó marcada como corriendo (nadie mandó ese delta) se
    // apaga y se suma su tramo. Los jobs de auto-pausa/cierre suman aparte.
    await apagarTimerDeTarea(session.task_id);

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
    await apagarTimerDeTarea(session.task_id);

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
      `SELECT te.id, te.task_id, te.start_time, t.titulo_tarea FROM time_entries te
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

    res.json({ active: true, session_id: row.id, task_id: row.task_id, titulo: row.titulo_tarea || null, eod,
      start_time: row.start_time ? new Date(row.start_time).toISOString() : null });
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

// ── Timer pausado solo (Tiusdei cerrado o pestaña dormida) ──
// Última sesión auto-pausada (12 h) sin otra sesión después y sin atender. Además
// del aviso, calcula cuánto se puede recuperar si la persona dice que siguió
// trabajando: desde la pausa hasta ahora, solo dentro de su jornada marcada (sin
// almuerzo), sin pisar otras sesiones y como máximo 10 h (pedido de Steven, 6-oct:
// "se les pausa siempre las tareas"; de 173 auto-pausas en 14 días, 64 se
// retomaron en la misma tarea). 10 h y no 3 (incidencia de Edmundo, 12-oct): en
// una cobertura o producción la computadora queda suspendida casi toda la jornada.
const MAX_RECUPERABLE_SEG = 10 * 3600;
type Tramo = [number, number];
function unirTramos(iv: Tramo[]): Tramo[] {
  const s = iv.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Tramo[] = [];
  for (const [a, b] of s) { const u = out[out.length - 1]; if (u && a <= u[1]) u[1] = Math.max(u[1], b); else out.push([a, b]); }
  return out;
}
function restarTramos(a: Tramo[], b: Tramo[]): Tramo[] {
  let res = a;
  for (const [b1, b2] of b) {
    const next: Tramo[] = [];
    for (const [a1, a2] of res) {
      if (b2 <= a1 || b1 >= a2) { next.push([a1, a2]); continue; }
      if (b1 > a1) next.push([a1, b1]);
      if (b2 < a2) next.push([b2, a2]);
    }
    res = next;
  }
  return res;
}
function intersectarTramos(a: Tramo[], b: Tramo[]): Tramo[] {
  const out: Tramo[] = [];
  for (const [a1, a2] of a) for (const [b1, b2] of b) { const i = Math.max(a1, b1), f = Math.min(a2, b2); if (f > i) out.push([i, f]); }
  return unirTramos(out);
}
async function pausaAutomaticaPendiente(userId: string) {
  return queryOne<any>(
    `SELECT te.id, te.task_id, t.titulo_tarea AS titulo, t.estado, te.end_time, te.duration_seconds
     FROM time_entries te
     JOIN tasks t ON t.id = te.task_id
     WHERE te.user_id = ? AND te.status = 'completed'
       AND te.description LIKE '%auto-pausada: Tiusdei cerrado%'
       AND te.description NOT LIKE '%[atendida]%'
       AND te.end_time > DATE_SUB(NOW(), INTERVAL 12 HOUR)
       AND NOT EXISTS (SELECT 1 FROM time_entries t2 WHERE t2.user_id = te.user_id AND t2.id <> te.id AND t2.start_time >= te.end_time)
     ORDER BY te.end_time DESC LIMIT 1`,
    [userId]
  );
}
/** Tramos recuperables entre la pausa y ahora (jornada marcada, sin almuerzo ni otras sesiones). */
async function tramosRecuperables(userId: string, desde: Date): Promise<Tramo[]> {
  const ini = new Date(desde).getTime(), fin = Date.now();
  if (fin - ini > MAX_RECUPERABLE_SEG * 1000 || fin <= ini) return [];
  const [asist, otras] = await Promise.all([
    query<any[]>(`SELECT check_in, check_out, lunch_start, lunch_end FROM attendance WHERE user_id = ? AND check_in < ? AND (check_out IS NULL OR check_out > ?)`, [userId, new Date(fin), new Date(ini)]),
    query<any[]>(`SELECT start_time, end_time FROM time_entries WHERE user_id = ? AND start_time < ? AND (end_time IS NULL OR end_time > ?)`, [userId, new Date(fin), new Date(ini)]),
  ]);
  let jornada: Tramo[] = [];
  for (const a of asist) {
    let iv: Tramo[] = [[new Date(a.check_in).getTime(), a.check_out ? new Date(a.check_out).getTime() : fin]];
    if (a.lunch_start) iv = restarTramos(iv, [[new Date(a.lunch_start).getTime(), a.lunch_end ? new Date(a.lunch_end).getTime() : fin]]);
    jornada = jornada.concat(iv);
  }
  const ocupado = otras.map((o) => [new Date(o.start_time).getTime(), o.end_time ? new Date(o.end_time).getTime() : fin] as Tramo);
  return restarTramos(intersectarTramos([[ini, fin]], unirTramos(jornada)), unirTramos(ocupado));
}
const segDe = (iv: Tramo[]) => Math.floor(iv.reduce((s, [a, b]) => s + (b - a), 0) / 1000);

timeSessionsRouter.get('/time-sessions/resume-suggestion', requireAuth, async (req: AuthRequest, res) => {
  try {
    const active = await queryOne<any>(
      `SELECT id FROM time_entries WHERE user_id = ? AND status = 'active' LIMIT 1`,
      [req.userId]
    );
    if (active) { res.json({}); return; }
    const row = await pausaAutomaticaPendiente(req.userId!);
    if (!row) { res.json({}); return; }
    const abierta = !['entregado', 'aprobado'].includes(row.estado);
    const recuperable = abierta ? segDe(await tramosRecuperables(req.userId!, row.end_time)) : 0;
    res.json({
      task_id: row.task_id, titulo: row.titulo, end_time: row.end_time, duration_seconds: row.duration_seconds,
      tarea_abierta: abierta, recuperable_seg: recuperable,
    });
  } catch (e) {
    console.error('[TIME-SESSIONS] resume-suggestion error:', e);
    res.status(500).json({ error: 'Error' });
  }
});

// Atender la pausa automática: 'recuperar' (suma el tiempo que siguió trabajando y
// reanuda), 'reanudar' (solo reanuda) o 'descartar' (deja pausado y no vuelve a avisar)
timeSessionsRouter.post('/time-sessions/resume-auto', requireAuth, async (req: AuthRequest, res) => {
  try {
    const accion = String(req.body?.accion || '');
    if (!['recuperar', 'reanudar', 'descartar'].includes(accion)) return res.status(400).json({ error: 'Acción inválida' });
    const active = await queryOne<any>(`SELECT id FROM time_entries WHERE user_id = ? AND status = 'active' LIMIT 1`, [req.userId]);
    if (active && accion !== 'descartar') return res.status(409).json({ error: 'Ya tienes un timer corriendo' });
    const row = await pausaAutomaticaPendiente(req.userId!);
    if (!row) return res.status(404).json({ error: 'No hay una pausa automática pendiente' });
    await query(`UPDATE time_entries SET description = CONCAT(IFNULL(description,''), ' [atendida]') WHERE id = ?`, [row.id]);
    if (accion === 'descartar') return res.json({ ok: true, recuperado_seg: 0 });
    if (['entregado', 'aprobado'].includes(row.estado) || !(await canAccessTask(req.userId!, row.task_id))) {
      return res.status(409).json({ error: 'La tarea ya no está abierta' });
    }
    const toSql = (ms: number) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
    let recuperado = 0;
    if (accion === 'recuperar') {
      for (const [a, b] of await tramosRecuperables(req.userId!, row.end_time)) {
        const seg = Math.floor((b - a) / 1000);
        if (seg < 60) continue;
        await query(
          `INSERT INTO time_entries (id, task_id, user_id, start_time, end_time, duration_seconds, status, description)
           VALUES (?, ?, ?, ?, ?, ?, 'completed', '[recuperado: siguió trabajando con Tiusdei cerrado o dormido]')`,
          [uuid(), row.task_id, req.userId, toSql(a), toSql(b), seg]
        );
        recuperado += seg;
      }
      if (recuperado > 0) await query('UPDATE tasks SET tiempo_trabajado = tiempo_trabajado + ? WHERE id = ?', [recuperado, row.task_id]);
    }
    const now = toSql(Date.now());
    const id = uuid();
    await query(`INSERT INTO time_entries (id, task_id, user_id, start_time, status) VALUES (?, ?, ?, ?, 'active')`, [id, row.task_id, req.userId, now]);
    await query(`UPDATE tasks SET timer_activo = 1, timer_inicio = ? WHERE id = ?`, [now, row.task_id]);
    res.json({ ok: true, recuperado_seg: recuperado, titulo: row.titulo });
  } catch (e) {
    console.error('[TIME-SESSIONS] resume-auto error:', e);
    res.status(500).json({ error: 'Error al reanudar' });
  }
});
