import { query, queryOne } from '../db/mysql.js';
import { createNotification } from '../utils/notifications.js';
import { avisarCambioTimer } from '../utils/realtime.js';

/**
 * Cierre DURO de timers al final del día (incidencia ca963e24).
 *
 * El aviso de las 18:00 (eodTimerAlert) solo notifica; si nadie pausa, la sesión
 * seguía corriendo toda la noche y el Monitor de Equipo amanecía mostrando 12h.
 * Este job, 2 horas después del cierre (default 20:00 ECU), cierra TODA sesión
 * activa/pausada y apaga el timer de la tarea:
 *   - duration = (transcurrido - idle) con tope de 8h
 *   - se suma a tiempo_trabajado de la tarea (consistencia con el stop manual)
 *   - se notifica a la persona para que ajuste si no corresponde
 *
 * Config en site_settings: timer_eod_enabled ('1' default) y timer_eod_hour (18).
 * Corre cada 30 min vía setInterval en index.ts.
 */
let lastCloseDate = '';

function ecuadorNow(): Date {
  return new Date(Date.now() - 5 * 60 * 60 * 1000); // Ecuador = UTC-5 fijo
}

const CAP_SECONDS = 12 * 3600; // jornada extendida (Steven, 23-sep): antes 8 h

export async function runEodTimerClose(): Promise<void> {
  try {
    const enabledRow = await queryOne<{ value: string }>("SELECT value FROM site_settings WHERE `key` = 'timer_eod_enabled'");
    if (enabledRow && enabledRow.value === '0') return;
    const hourRow = await queryOne<{ value: string }>("SELECT value FROM site_settings WHERE `key` = 'timer_eod_hour'");
    const eodHour = Math.max(0, Math.min(23, parseInt(hourRow?.value || '18')));
    // Horas después del aviso para el cierre duro (timer_eod_close_offset, default 4 → 22:00)
    const offsetRow = await queryOne<{ value: string }>("SELECT value FROM site_settings WHERE `key` = 'timer_eod_close_offset'");
    const closeHour = Math.min(23, eodHour + Math.max(1, parseInt(offsetRow?.value || '4')));

    const ec = ecuadorNow();
    const today = ec.toISOString().slice(0, 10);
    if (ec.getUTCHours() < closeHour) return;
    if (lastCloseDate === today) return;
    lastCloseDate = today;

    // Acumulado de cierres para el reporte de reincidencia (Steven/ops)
    const cerrados: { user_id: string; nombre: string; titulo: string; capped: number }[] = [];

    // 1) Sesiones de tiempo abiertas → cerrarlas con tope
    const sessions = await query<any[]>(
      `SELECT te.id, te.user_id, te.task_id, te.start_time, COALESCE(te.idle_seconds, 0) AS idle_seconds,
              t.titulo_tarea
       FROM time_entries te
       LEFT JOIN tasks t ON t.id = te.task_id
       WHERE te.status IN ('active','paused')
         AND (te.last_heartbeat IS NULL OR te.last_heartbeat < DATE_SUB(NOW(), INTERVAL 10 MINUTE))`
    );
    // Las sesiones con latido fresco NO se tocan: Tiusdei está abierto y el modal
    // del cliente ("¿Sigues trabajando?") gobierna esos casos — si la persona no
    // confirma, el propio cliente pausa; si cierra Tiusdei, cae el latido y las
    // pausa el job heartbeatAutoPause.
    const nombresRows = sessions.length > 0 ? await query<any[]>(
      `SELECT id, nombre FROM profiles WHERE id IN (${sessions.map(() => '?').join(',')})`,
      sessions.map((x) => x.user_id)
    ) : [];
    const nombreDe: Record<string, string> = {};
    for (const n of nombresRows) nombreDe[n.id] = n.nombre;

    for (const s of sessions) {
      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(s.start_time).getTime()) / 1000));
      const capped = Math.min(Math.max(0, elapsed - Number(s.idle_seconds)), CAP_SECONDS);
      await query(
        `UPDATE time_entries SET status='completed', end_time=NOW(), duration_seconds=?,
                description=CONCAT(IFNULL(description,''), ' [cierre automático fin del día]')
         WHERE id=?`,
        [capped, s.id]
      );
      if (s.task_id) {
        await query(
          'UPDATE tasks SET tiempo_trabajado = tiempo_trabajado + ?, timer_activo = 0, timer_inicio = NULL WHERE id = ?',
          [capped, s.task_id]
        );
      }
      cerrados.push({ user_id: s.user_id, nombre: nombreDe[s.user_id] || 'Alguien', titulo: s.titulo_tarea || 'una tarea', capped });
      avisarCambioTimer(s.user_id);
    }

    // 2) Timers legacy sin sesión (solo tasks.timer_activo) → cerrarlos igual
    const legacy = await query<any[]>(
      `SELECT id, titulo_tarea, timer_inicio, responsable_user_id FROM tasks WHERE timer_activo = 1`
    );
    for (const t of legacy) {
      const elapsed = t.timer_inicio ? Math.max(0, Math.floor((Date.now() - new Date(t.timer_inicio).getTime()) / 1000)) : 0;
      const capped = Math.min(elapsed, CAP_SECONDS);
      await query(
        'UPDATE tasks SET tiempo_trabajado = tiempo_trabajado + ?, timer_activo = 0, timer_inicio = NULL WHERE id = ?',
        [capped, t.id]
      );
      if (t.responsable_user_id) {
        cerrados.push({ user_id: t.responsable_user_id, nombre: '', titulo: t.titulo_tarea, capped });
      }
    }

    if (cerrados.length > 0) {
      // Completar nombres que falten (cierres legacy)
      const sinNombre = [...new Set(cerrados.filter((c) => !c.nombre).map((c) => c.user_id))];
      if (sinNombre.length > 0) {
        const extra = await query<any[]>(
          `SELECT id, nombre FROM profiles WHERE id IN (${sinNombre.map(() => '?').join(',')})`, sinNombre
        );
        const m: Record<string, string> = {};
        for (const e of extra) m[e.id] = e.nombre;
        for (const c of cerrados) if (!c.nombre) c.nombre = m[c.user_id] || 'Alguien';
      }

      // Reincidencia: cuantos cierres automaticos tuvo cada uno en los ultimos 30 dias
      // (los cierres llevan marca en description; el de hoy ya esta incluido).
      const uids = [...new Set(cerrados.map((c) => c.user_id))];
      const reincRows = await query<any[]>(
        `SELECT user_id, COUNT(*) AS veces FROM time_entries
         WHERE user_id IN (${uids.map(() => '?').join(',')})
           AND (description LIKE '%cierre automático fin del día%' OR description LIKE '%auto-cerrada%' OR description LIKE '%auto-pausada%')
           AND start_time > DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY user_id`,
        uids
      );
      const vecesDe: Record<string, number> = {};
      for (const r of reincRows) vecesDe[r.user_id] = Number(r.veces);

      // Aviso individual (a reincidentes se les sube el tono)
      const fmt = (secs: number) => `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
      const avisados = new Set<string>();
      for (const c of cerrados) {
        const veces = vecesDe[c.user_id] || 1;
        const base = `⏰ Tu timer en "${c.titulo}" se cerró automáticamente al final del día (se sumaron ${fmt(c.capped)}).`;
        const extra = veces >= 3
          ? ` Es tu ${veces}ª vez en 30 días: recuerda pausar tu timer al terminar la jornada — Operaciones da seguimiento a los reincidentes.`
          : ' Recuerda pausar tu timer al terminar la jornada.';
        if (!avisados.has(c.user_id + c.titulo)) {
          avisados.add(c.user_id + c.titulo);
          await createNotification(c.user_id, base + extra, null).catch(() => {});
        }
      }

      // Reporte a Steven/ops (configurable en site_settings.timer_olvido_notify_ids)
      const notifIdsRow = await queryOne<{ value: string }>("SELECT value FROM site_settings WHERE `key` = 'timer_olvido_notify_ids'");
      const notifIds = (notifIdsRow?.value || '').split(',').map((x) => x.trim()).filter(Boolean);
      if (notifIds.length > 0) {
        const porPersona: Record<string, { nombre: string; items: string[] }> = {};
        for (const c of cerrados) {
          if (!porPersona[c.user_id]) porPersona[c.user_id] = { nombre: c.nombre, items: [] };
          porPersona[c.user_id].items.push(c.titulo);
        }
        const detalle = Object.entries(porPersona).map(([uid, p]) => {
          const veces = vecesDe[uid] || 1;
          const marca = veces >= 3 ? ` ⚠️ ${veces}ª vez en 30 días` : ` (${veces}ª vez en 30 días)`;
          return `${p.nombre}${marca}`;
        }).join(' · ');
        const msg = `⏰ Timers olvidados hoy (cierre automático ${closeHour}:00): ${detalle}`;
        for (const nid of notifIds) {
          if (!uids.includes(nid)) await createNotification(nid, msg, null).catch(() => {});
        }
      }

      console.log(`[EOD-TIMER-CLOSE] Cerrados ${sessions.length} sesiones + ${legacy.length} timers legacy (>${closeHour}:00 ECU)`);
    }
  } catch (e) {
    console.error('[EOD-TIMER-CLOSE] error:', e);
  }
}
