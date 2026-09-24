import { query } from '../db/mysql.js';
import { createNotification } from '../utils/notifications.js';
import { sendEmail, timerAutoPausedEmail } from '../services/email.js';

/**
 * Auto-pausa por latido (heartbeat): mientras Tiusdei está abierto, el frontend
 * manda un pulso por minuto (POST /time-sessions/heartbeat). Si una sesión activa
 * deja de latir por >5 min (cerró la pestaña/navegador, apagó la laptop, crasheó),
 * se pausa sola EN EL MOMENTO DEL ÚLTIMO LATIDO, con el tiempo bien guardado.
 *
 * Regla del equipo: "trabajando = Tiusdei abierto con play; cerraste = se pausó".
 * Solo aplica a sesiones que ALGUNA VEZ latieron (last_heartbeat != NULL): así los
 * frontends viejos en caché no ven sus sesiones cortadas (a esos los cubren los
 * jobs de fin de día y de sesiones colgadas).
 *
 * Corre cada 2 min vía setInterval en index.ts.
 */
// 15 min (antes 5): Chrome frena los timers de pestanas en segundo plano y un
// parpadeo de red cortaba sesiones de gente que SI estaba trabajando. Como la
// pausa se estampa en el ULTIMO latido, la gracia extra no regala ni un minuto.
const GRACE_MINUTES = 15;
const CAP_SECONDS = 12 * 3600;

export async function runHeartbeatAutoPause(): Promise<void> {
  try {
    const stale = await query<any[]>(
      `SELECT te.id, te.user_id, te.task_id, te.start_time, te.last_heartbeat,
              COALESCE(te.idle_seconds, 0) AS idle_seconds,
              t.titulo_tarea, p.nombre, p.email
       FROM time_entries te
       LEFT JOIN tasks t ON t.id = te.task_id
       LEFT JOIN profiles p ON p.id = te.user_id
       WHERE te.status = 'active'
         AND te.last_heartbeat IS NOT NULL
         AND te.last_heartbeat < DATE_SUB(NOW(), INTERVAL ${GRACE_MINUTES} MINUTE)`
    );
    if (stale.length === 0) return;

    const emailOk = !!(process.env.MAILGUN_API_KEY || process.env.SMTP_PASS);
    const frontendUrl = process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec';

    for (const s of stale) {
      const worked = Math.floor((new Date(s.last_heartbeat).getTime() - new Date(s.start_time).getTime()) / 1000);
      const capped = Math.min(Math.max(0, worked - Number(s.idle_seconds)), CAP_SECONDS);

      await query(
        `UPDATE time_entries SET status='completed', end_time=last_heartbeat, duration_seconds=?,
                description=CONCAT(IFNULL(description,''), ' [auto-pausada: Tiusdei cerrado]')
         WHERE id=? AND status='active'`,
        [capped, s.id]
      );
      if (s.task_id) {
        await query(
          'UPDATE tasks SET tiempo_trabajado = tiempo_trabajado + ?, timer_activo = 0, timer_inicio = NULL WHERE id = ?',
          [capped, s.task_id]
        );
      }

      const hrs = Math.floor(capped / 3600); const mins = Math.floor((capped % 3600) / 60);
      await createNotification(
        s.user_id,
        `⏸️ Tu timer en "${s.titulo_tarea || 'una tarea'}" se pausó automáticamente porque cerraste Tiusdei (se guardaron ${hrs}h ${mins}m). Si sigues trabajando, reanúdalo.`,
        s.task_id || null
      ).catch(() => {});

      if (emailOk && s.email && s.email.includes('@')) {
        timerAutoPausedEmail({
          recipientName: s.nombre || 'Usuario',
          taskTitle: s.titulo_tarea || 'una tarea',
          tiempoGuardado: `${hrs}h ${mins}m`,
          taskUrl: s.task_id ? `${frontendUrl}/tareas?task=${s.task_id}` : frontendUrl,
        }).then((m) => { m.to = s.email; return sendEmail(m); }).catch((e) => console.error('[HEARTBEAT-PAUSE] email:', e));
      }
    }
    console.log(`[HEARTBEAT-PAUSE] ${stale.length} sesión(es) pausadas por cierre de Tiusdei`);
  } catch (e) {
    console.error('[HEARTBEAT-PAUSE] error:', e);
  }
}
