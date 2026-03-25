import { query, queryOne, uuid } from '../db/mysql.js';

/**
 * Runs every 60 seconds. Checks for idle users with active timers.
 * - Sends notifications to admins if a user is idle
 * - Auto-pauses sessions if setting enabled
 * - Auto-closes attendance records from previous days
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
    const idleThresholdMinutes = parseInt(idleThresholdRow?.value || '5');
    const autoPause = autoPauseRow?.value === '1';

    // Find active sessions
    const activeSessions = await query<any[]>(
      `SELECT te.id, te.user_id, te.task_id, t.titulo_tarea, p.nombre
       FROM time_entries te
       JOIN tasks t ON t.id = te.task_id
       JOIN profiles p ON p.id = te.user_id
       WHERE te.status = 'active'`
    );

    const now = new Date();

    for (const session of activeSessions) {
      // Check last activity snapshot
      const lastSnapshot = await queryOne<any>(
        `SELECT snapshot_at, is_idle FROM activity_snapshots
         WHERE time_entry_id = ? ORDER BY snapshot_at DESC LIMIT 1`,
        [session.id]
      );

      if (!lastSnapshot) continue; // No snapshots yet, skip

      const lastActivityTime = new Date(lastSnapshot.snapshot_at);
      const idleMinutes = Math.floor((now.getTime() - lastActivityTime.getTime()) / 60000);

      if (idleMinutes >= idleThresholdMinutes) {
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

        if (!recentAlert) {
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
              `INSERT INTO notifications (id, user_id, tipo, mensaje, task_id) VALUES (?, ?, 'alerta', ?, ?)`,
              [notifId, admin.id, mensaje, session.task_id]
            );
          }
        }
      }
    }

    // Auto-close attendance from previous days
    const today = now.toISOString().slice(0, 10);
    const openOld = await query<any[]>(
      `SELECT id, check_in FROM attendance WHERE check_out IS NULL AND DATE(check_in) < ?`,
      [today]
    );

    for (const att of openOld) {
      const checkIn = new Date(att.check_in);
      // Close at midnight of the check-in day
      const midnight = new Date(checkIn);
      midnight.setHours(23, 59, 59, 0);
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
