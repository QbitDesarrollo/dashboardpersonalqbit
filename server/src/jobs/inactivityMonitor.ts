import { query, queryOne, uuid } from '../db/mysql.js';

/**
 * Runs every 60 seconds. Checks for idle users with active timers.
 * - Notifies admins if a user is REALLY idle (setting `timedoctor_idle_notify`, off by default)
 * - Auto-pauses sessions if setting enabled
 * - Auto-closes attendance records from previous days
 *
 * Idle = the last N one-minute snapshots were all idle (Tiusdei in front and no
 * keyboard/mouse). It used to be "no snapshot for N minutes", which is what happens
 * when the tab is in the background or the computer sleeps: it notified every admin
 * and executive about people who were working in Illustrator (616 notices to 14
 * people on 12-oct, ~59.600 in total). Steven's incident, 12-oct.
 */
export async function runInactivityMonitor() {
  try {
    // Get settings
    const idleThresholdRow = await queryOne<{ value: string }>(
      `SELECT value FROM site_settings WHERE \`key\` = 'timedoctor_idle_threshold'`
    );
    const autoPauseRow = await queryOne<{ value: string }>(
      `SELECT value FROM site_settings WHERE \`key\` = 'timedoctor_auto_pause_idle'`
    );
    const idleThresholdMinutes = Math.max(1, parseInt(idleThresholdRow?.value || '5') || 5);
    const autoPause = autoPauseRow?.value === '1';
    const notifyRow = await queryOne<{ value: string }>(
      `SELECT value FROM site_settings WHERE \`key\` = 'timedoctor_idle_notify'`
    );
    const notify = notifyRow?.value === '1';

    // Find active sessions
    const activeSessions = await query<any[]>(
      `SELECT te.id, te.user_id, te.task_id, t.titulo_tarea, p.nombre
       FROM time_entries te
       JOIN tasks t ON t.id = te.task_id
       JOIN profiles p ON p.id = te.user_id
       WHERE te.status = 'active'`
    );

    const now = new Date();

    for (const session of (autoPause || notify) ? activeSessions : []) {
      // Really idle: the last N snapshots (one per minute) are all idle
      const ultimos = await query<{ is_idle: number }[]>(
        `SELECT is_idle FROM activity_snapshots
         WHERE time_entry_id = ? AND snapshot_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
         ORDER BY snapshot_at DESC LIMIT ?`,
        [session.id, idleThresholdMinutes + 1, idleThresholdMinutes]
      );
      const idleMinutes = idleThresholdMinutes;

      if (ultimos.length >= idleThresholdMinutes && ultimos.every((u) => Number(u.is_idle) === 1)) {
        // User is idle
        if (autoPause) {
          // Auto-pause the session
          await query(`UPDATE time_entries SET status = 'paused' WHERE id = ?`, [session.id]);
          await query(`UPDATE tasks SET timer_activo = 0 WHERE id = ?`, [session.task_id]);
        }

        // Check if we already sent an alert recently (avoid spamming)
        const recentAlert = await queryOne<any>(
          `SELECT id FROM notifications
           WHERE user_id IN (SELECT id FROM profiles WHERE rol IN ('admin','ejecutivo'))
             AND mensaje LIKE ?
             AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
           LIMIT 1`,
          [`%${session.nombre}%inactiv%`]
        );

        if (notify && !recentAlert) {
          // Get admin/ejecutivo users to notify
          const admins = await query<{ id: string }[]>(
            `SELECT id FROM profiles WHERE rol IN ('admin','ejecutivo') AND activo = 1`
          );

          const mensaje = autoPause
            ? `${session.nombre} lleva ${idleMinutes}min inactivo. Su sesión fue pausada automáticamente.`
            : `${session.nombre} lleva ${idleMinutes}min inactivo con el timer activo en "${session.titulo_tarea}".`;

          for (const admin of admins) {
            const notifId = uuid();
            await query(
              `INSERT INTO notifications (id, user_id, mensaje, task_id) VALUES (?, ?, ?, ?)`,
              [notifId, admin.id, mensaje, session.task_id]
            );
          }
        }
      }
    }

    // Auto-close attendance from previous days
    const today = now.toISOString().slice(0, 10);
    const openOld = await query<any[]>(
      `SELECT id, user_id, check_in, COALESCE(auto_check_in, 0) AS auto_check_in FROM attendance WHERE check_out IS NULL AND DATE(check_in) < ?`,
      [today]
    );

    for (const att of openOld) {
      const checkIn = new Date(att.check_in);
      // Close at midnight of the check-in day
      const midnight = new Date(checkIn);
      midnight.setHours(23, 59, 59, 0);
      // Automatic check-in (first activity of the day, nobody clicked check-out):
      // close at the last activity of that day instead of midnight, so the day is
      // not inflated to midnight.
      if (Number(att.auto_check_in) === 1) {
        const ult = await queryOne<{ t: Date | null }>(
          `SELECT GREATEST(
             COALESCE((SELECT MAX(COALESCE(end_time, last_heartbeat, start_time)) FROM time_entries WHERE user_id = ? AND start_time BETWEEN ? AND ?), '1970-01-01'),
             COALESCE((SELECT MAX(created_at) FROM activity_log WHERE user_id = ? AND created_at BETWEEN ? AND ?), '1970-01-01'),
             COALESCE((SELECT MAX(created_at) FROM comments WHERE user_id = ? AND created_at BETWEEN ? AND ?), '1970-01-01')
           ) AS t`,
          [att.user_id, checkIn, midnight, att.user_id, checkIn, midnight, att.user_id, checkIn, midnight]
        );
        // The automatic check-in was created by an activity, so with nothing after it
        // the day ends right there (one minute), never at midnight
        const t = ult?.t ? new Date(ult.t) : null;
        const fin = t && t.getTime() > checkIn.getTime() ? t.getTime() : checkIn.getTime() + 60_000;
        midnight.setTime(Math.min(fin, midnight.getTime()));
      }
      const totalSeconds = Math.floor((midnight.getTime() - checkIn.getTime()) / 1000);
      const midnightStr = midnight.toISOString().replace('T', ' ').replace('Z', '');

      await query(
        `UPDATE attendance SET check_out = ?, total_seconds = ?, auto_checked_out = 1 WHERE id = ?`,
        [midnightStr, totalSeconds, att.id]
      );
    }
  } catch (e) {
    console.error('[INACTIVITY-MONITOR] Error:', e);
  }
}
