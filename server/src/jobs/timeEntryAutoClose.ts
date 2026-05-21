import * as crypto from 'crypto';
import { query } from '../db/mysql.js';

/**
 * Job: cierra time_entries que llevan >12h en estado 'active' o 'paused'
 * sin que el usuario las haya cerrado manualmente.
 *
 * Razón: si nadie pausa la sesión (cierra app, computadora se apaga, olvido),
 * el monitor de equipo muestra horas absurdas (167h, 97h) y los reportes salen mal.
 *
 * Acción: marca como 'completed', cap de 8h en duration_seconds.
 *
 * Corre cada 30 min vía setInterval en index.ts.
 */
export async function runTimeEntryAutoClose(): Promise<void> {
  try {
    const STALL_HOURS = 12;
    const CAP_SECONDS = 8 * 3600; // 8h cap razonable para una jornada

    // 1. Encontrar entries colgadas
    const stalled = await query<any[]>(
      `SELECT te.id, te.user_id, te.task_id, te.start_time, p.nombre
       FROM time_entries te
       LEFT JOIN profiles p ON p.id = te.user_id
       WHERE te.status IN ('active','paused')
         AND te.start_time < DATE_SUB(NOW(), INTERVAL ${STALL_HOURS} HOUR)`
    );

    if (stalled.length === 0) return;

    console.log(`[TIME-ENTRY-AUTOCLOSE] ${stalled.length} entries colgadas detectadas, cerrando...`);
    for (const e of stalled) {
      console.log(`  → ${e.nombre}: entry ${e.id} desde ${e.start_time}`);
    }

    // 2. Cerrar todas con cap de 8h
    await query(
      `UPDATE time_entries
       SET status='completed',
           end_time = DATE_ADD(start_time, INTERVAL 8 HOUR),
           duration_seconds = ?,
           description = CONCAT(IFNULL(description,''), ' [auto-cerrada: sesión >12h sin pausar, cap 8h]')
       WHERE status IN ('active','paused')
         AND start_time < DATE_SUB(NOW(), INTERVAL ${STALL_HOURS} HOUR)`,
      [CAP_SECONDS]
    );

    // 3. Notificar a admins/ejecutivos si hay >0 cerradas
    if (stalled.length > 0) {
      const admins = await query<{ id: string }[]>(
        `SELECT id FROM profiles WHERE rol IN ('admin','ejecutivo') AND activo = 1`
      );
      const usersList = stalled.map((e: any) => e.nombre).join(', ');
      const mensaje = `Se cerraron ${stalled.length} sesión(es) de tiempo automáticamente (>12h sin pausar): ${usersList}`;
      for (const admin of admins) {
        const notifId = crypto.randomUUID();
        await query(
          `INSERT INTO notifications (id, user_id, mensaje) VALUES (?, ?, ?)`,
          [notifId, admin.id, mensaje]
        ).catch(() => {});
      }
    }
  } catch (e) {
    console.error('[TIME-ENTRY-AUTOCLOSE] Error:', e);
  }
}
