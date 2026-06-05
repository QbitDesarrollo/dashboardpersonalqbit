import { query, queryOne } from '../db/mysql.js';
import { createNotification } from '../utils/notifications.js';

/**
 * Pieza 3 del Timer Control: alerta de cierre al final del día.
 * Corre cada 30 min. Cuando es la hora de cierre (Ecuador, UTC-5) y todavía
 * no se avisó hoy, notifica a cada persona que tenga un timer activo para que
 * lo cierre o lo justifique antes de terminar su jornada.
 *
 * Config en site_settings:
 *   timer_eod_enabled  '1' (default) / '0'
 *   timer_eod_hour     hora local de cierre, default '18' (6pm)
 */
let lastAlertDate = ''; // fecha Ecuador (YYYY-MM-DD) del último aviso

function ecuadorNow(): Date {
  // Ecuador = UTC-5 sin horario de verano
  return new Date(Date.now() - 5 * 60 * 60 * 1000);
}
function hhmm(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export async function runEodTimerAlert(): Promise<void> {
  try {
    const enabledRow = await queryOne<{ value: string }>("SELECT value FROM site_settings WHERE `key` = 'timer_eod_enabled'");
    if (enabledRow && enabledRow.value === '0') return;
    const hourRow = await queryOne<{ value: string }>("SELECT value FROM site_settings WHERE `key` = 'timer_eod_hour'");
    const eodHour = Math.max(0, Math.min(23, parseInt(hourRow?.value || '18')));

    const ec = ecuadorNow();
    const today = ec.toISOString().slice(0, 10);
    if (ec.getUTCHours() < eodHour) return;   // todavía no es la hora de cierre
    if (lastAlertDate === today) return;       // ya avisamos hoy

    const activos = await query<any[]>(
      `SELECT t.id, t.titulo_tarea, t.timer_inicio, t.responsable_user_id
       FROM tasks t
       WHERE t.timer_activo = 1 AND t.responsable_user_id IS NOT NULL`
    );

    lastAlertDate = today; // marcar antes del loop para no duplicar si se solapan corridas

    for (const t of activos) {
      let desde = '';
      if (t.timer_inicio) {
        const ini = new Date(new Date(t.timer_inicio).getTime() - 5 * 60 * 60 * 1000);
        desde = ` (activo desde las ${hhmm(ini)})`;
      }
      const msg = `⏰ Tienes el timer corriendo en "${t.titulo_tarea}"${desde}. Ciérralo o justifica la sesión antes de terminar tu día.`;
      createNotification(t.responsable_user_id, msg, t.id).catch(() => {});
    }

    if (activos.length > 0) {
      console.log(`[EOD-TIMER] Avisados ${activos.length} timers activos al cierre (${eodHour}:00 ECU)`);
    }
  } catch (e) {
    console.error('[EOD-TIMER] error:', e);
  }
}
