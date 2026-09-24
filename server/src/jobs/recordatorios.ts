import { query, queryOne, uuid } from '../db/mysql.js';
import { createNotification } from '../utils/notifications.js';
import { sendEmail } from '../services/email.js';
import { renderEmail } from '../services/emailLayout.js';
import { reunionesDeHoy } from '../services/meetingsNow.js';

/**
 * Recordatorios sutiles por correo (pedido de Steven, 22-sep-2026):
 *  1. "checkin":   quien no ha marcado ingreso a la hora configurada (una vez al día).
 *  2. "sin_tarea": quien está conectado (con ingreso, sin salida, no en almuerzo,
 *                  no en reunión del calendario) y lleva N minutos sin tarea activa.
 * Solo a los roles configurados (por defecto 'equipo': no a jefaturas) que sean
 * equipo directo de una mesa (integrante base, no soporte), en días hábiles y
 * dentro del horario. Además, un reporte diario de asistencia (sin ingreso e
 * ingreso tarde) a `reporte_asistencia_ids` a las `reporte_asistencia_hora` (10:00).
 * Corre cada 10 min vía setInterval en index.ts.
 *
 * Configuración en site_settings (todas opcionales):
 *  recordatorio_roles            'equipo'         roles separados por coma
 *  recordatorio_checkin_enabled  '1'
 *  recordatorio_checkin_hora     '09:30'          hora Ecuador; se avisa dentro de las 2 h siguientes
 *  recordatorio_sin_tarea_enabled '1'
 *  recordatorio_sin_tarea_min    '30'             minutos conectado sin tarea activa
 *  recordatorio_sin_tarea_max    '3'              máximo de avisos por persona al día
 *  recordatorio_horario          '09:00-18:00'    ventana Ecuador para "sin tarea"
 */
const TZ = 'America/Guayaquil';

function ahoraEcuador(): { fecha: string; hhmm: string; minutos: number; diaSemana: number } {
  const d = new Date();
  const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(d);
  const hh = Number(parts.find((p) => p.type === 'hour')?.value || 0) % 24;
  const mm = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  const wd = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
  const diaSemana = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
  return { fecha, hhmm: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, minutos: hh * 60 + mm, diaSemana };
}
const aMinutos = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function setting(key: string, fallback: string): Promise<string> {
  const row = await queryOne<{ value: string }>('SELECT value FROM site_settings WHERE `key` = ?', [key]);
  return row?.value ?? fallback;
}

async function yaEnviado(userId: string, tipo: string, fecha: string, minutosMin = 0): Promise<{ hoy: number; reciente: boolean }> {
  const rows = await query<{ created_at: Date }[]>(
    'SELECT created_at FROM recordatorios_enviados WHERE user_id = ? AND tipo = ? AND fecha = ? ORDER BY created_at DESC',
    [userId, tipo, fecha],
  );
  const reciente = rows.length > 0 && minutosMin > 0 && Date.now() - new Date(rows[0].created_at).getTime() < minutosMin * 60000;
  return { hoy: rows.length, reciente };
}

async function registrar(userId: string, tipo: string, fecha: string): Promise<void> {
  await query('INSERT INTO recordatorios_enviados (id, user_id, tipo, fecha) VALUES (?, ?, ?, ?)', [uuid(), userId, tipo, fecha]);
}

// Solo el equipo directo de las mesas: integrante base (no soporte) de alguna mesa activa
const EQUIPO_DIRECTO = `EXISTS (SELECT 1 FROM desk_members dm JOIN desks d ON d.id = dm.desk_id
  WHERE dm.user_id = p.id AND d.activo = 1 AND COALESCE(dm.es_soporte, 0) = 0)`;

export async function runRecordatorios(): Promise<void> {
  try {
    const { fecha, minutos, diaSemana } = ahoraEcuador();
    if (diaSemana === 0 || diaSemana === 6) return; // fin de semana
    const roles = (await setting('recordatorio_roles', 'equipo')).split(',').map((r) => r.trim()).filter(Boolean);
    if (!roles.length) return;
    const frontendUrl = process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec';
    const emailOk = !!(process.env.MAILGUN_API_KEY || process.env.SMTP_PASS);
    const ph = roles.map(() => '?').join(',');

    // ---- 0. Reporte diario de asistencia a jefatura (una vez al día, desde las 10:00) ----
    const horaReporte = aMinutos(await setting('reporte_asistencia_hora', '10:00'));
    if (minutos >= horaReporte && minutos < horaReporte + 120) {
      const destinatarios = (await setting('reporte_asistencia_ids', 'cfb95eb0-8e0c-4c0f-b581-54cb91b535c6')).split(',').map((s) => s.trim()).filter(Boolean);
      const limite = await setting('asistencia_hora_limite', '09:15');
      const equipo = await query<{ id: string; nombre: string; check_in: Date | null }[]>(
        `SELECT p.id, p.nombre,
                (SELECT MIN(a.check_in) FROM attendance a WHERE a.user_id = p.id AND DATE(CONVERT_TZ(a.check_in, '+00:00', '-05:00')) = ?) AS check_in
         FROM profiles p WHERE p.activo = 1 AND p.rol IN (${ph}) AND ${EQUIPO_DIRECTO} ORDER BY p.nombre`,
        [fecha, ...roles],
      );
      const hhmm = (d: Date) => new Intl.DateTimeFormat('es-EC', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));
      const sinIngreso = equipo.filter((u) => !u.check_in);
      const tarde = equipo.filter((u) => u.check_in && aMinutos(hhmm(u.check_in as Date)) > aMinutos(limite));
      for (const destId of destinatarios) {
        const { hoy } = await yaEnviado(destId, 'reporte_asist', fecha);
        if (hoy > 0) continue;
        const dest = await queryOne<{ nombre: string; email: string }>('SELECT p.nombre, u.email FROM profiles p JOIN users u ON u.id = p.id WHERE p.id = ?', [destId]);
        if (!dest) continue;
        const lista = (us: { nombre: string }[]) => us.length ? us.map((u) => esc(String(u.nombre).trim())).join(', ') : 'nadie';
        await createNotification(destId, `Asistencia de hoy: ${sinIngreso.length} sin ingreso y ${tarde.length} con ingreso tarde (después de las ${limite}).`);
        if (emailOk && dest.email) {
          const { html, text } = await renderEmail({
            accent: sinIngreso.length ? 'amber' : 'green',
            preheader: 'Reporte de asistencia',
            headline: `Asistencia de hoy: ${sinIngreso.length} sin ingreso`,
            greeting: `Hola ${esc(String(dest.nombre).trim().split(' ')[0])},`,
            intro: `Este es el reporte de las ${await setting('reporte_asistencia_hora', '10:00')} del equipo directo de las mesas (${equipo.length} personas).`,
            details: [
              { label: `Sin ingreso (${sinIngreso.length})`, value: lista(sinIngreso), highlight: sinIngreso.length > 0 },
              { label: `Ingreso tarde, después de las ${limite} (${tarde.length})`, value: tarde.length ? tarde.map((u) => `${esc(String(u.nombre).trim())} (${hhmm(u.check_in as Date)})`).join(', ') : 'nadie' },
            ],
            cta: { text: 'Ver Monitor de Equipo', url: `${frontendUrl}/admin/monitor` },
          });
          await sendEmail({ to: dest.email, subject: `Asistencia de hoy: ${sinIngreso.length} sin ingreso, ${tarde.length} tarde`, html, text });
        }
        await registrar(destId, 'reporte_asist', fecha);
        console.log(`[RECORDATORIOS] reporte_asist → ${dest.nombre} (${sinIngreso.length} sin ingreso, ${tarde.length} tarde)`);
      }
    }

    // ---- 1. Sin check-in ----
    if ((await setting('recordatorio_checkin_enabled', '1')) === '1') {
      const horaMin = aMinutos(await setting('recordatorio_checkin_hora', '09:30'));
      if (minutos >= horaMin && minutos < horaMin + 120) {
        const sinIngreso = await query<{ id: string; nombre: string; email: string }[]>(
          `SELECT p.id, p.nombre, u.email FROM profiles p JOIN users u ON u.id = p.id
           WHERE p.activo = 1 AND p.rol IN (${ph}) AND ${EQUIPO_DIRECTO}
             AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.user_id = p.id AND DATE(CONVERT_TZ(a.check_in, '+00:00', '-05:00')) = ?)`,
          [...roles, fecha],
        );
        for (const u of sinIngreso) {
          const { hoy } = await yaEnviado(u.id, 'checkin', fecha);
          if (hoy > 0) continue;
          const nombre = String(u.nombre || '').trim().split(' ')[0] || 'Hola';
          await createNotification(u.id, 'Aún no marcas tu ingreso de hoy en Tiusdei. Cuando llegues, dale a "Ingresar" en Asistencia.');
          if (emailOk && u.email) {
            const { html, text } = await renderEmail({
              accent: 'amber',
              preheader: 'Recordatorio de ingreso',
              headline: 'Aún no marcas tu ingreso de hoy',
              greeting: `Hola ${esc(nombre)},`,
              intro: 'Todavía no aparece tu ingreso de hoy en Tiusdei. Si ya estás trabajando, márcalo en <strong>Asistencia</strong> para que tu día quede registrado; si es un día libre o permiso, ignora este mensaje.',
              cta: { text: 'Marcar ingreso', url: `${frontendUrl}/dashboard` },
            });
            await sendEmail({ to: u.email, subject: 'Recordatorio: aún no marcas tu ingreso en Tiusdei', html, text });
          }
          await registrar(u.id, 'checkin', fecha);
          console.log(`[RECORDATORIOS] checkin → ${u.nombre}`);
        }
      }
    }

    // ---- 2. Conectado sin tarea activa ----
    if ((await setting('recordatorio_sin_tarea_enabled', '1')) === '1') {
      const [ini, fin] = (await setting('recordatorio_horario', '09:00-18:00')).split('-').map((s) => aMinutos(s.trim()));
      if (minutos < ini || minutos > fin) return;
      const umbralMin = Math.max(10, Number(await setting('recordatorio_sin_tarea_min', '30')) || 30);
      const maxDia = Math.max(1, Number(await setting('recordatorio_sin_tarea_max', '3')) || 3);
      const candidatos = await query<{ id: string; nombre: string; email: string; check_in: Date; lunch_start: Date | null; lunch_end: Date | null; ultima_actividad: Date | null }[]>(
        `SELECT p.id, p.nombre, u.email, a.check_in, a.lunch_start, a.lunch_end,
                (SELECT MAX(COALESCE(te.end_time, te.last_heartbeat, te.start_time)) FROM time_entries te
                  WHERE te.user_id = p.id AND te.start_time >= DATE_SUB(NOW(), INTERVAL 1 DAY)) AS ultima_actividad
         FROM profiles p JOIN users u ON u.id = p.id
         JOIN attendance a ON a.user_id = p.id AND DATE(CONVERT_TZ(a.check_in, '+00:00', '-05:00')) = ? AND a.check_out IS NULL
         WHERE p.activo = 1 AND p.rol IN (${ph}) AND ${EQUIPO_DIRECTO}
           AND NOT EXISTS (SELECT 1 FROM time_entries te2 WHERE te2.user_id = p.id AND te2.status = 'active')`,
        [fecha, ...roles],
      );
      if (!candidatos.length) return;
      const reuniones = await reunionesDeHoy(candidatos.map((c) => c.id));
      const ahora = Date.now();
      for (const c of candidatos) {
        if (c.lunch_start && !c.lunch_end) continue;            // en almuerzo
        if (reuniones.get(c.id)?.ahora) continue;               // en reunión del calendario
        const desde = Math.max(
          new Date(c.check_in).getTime(),
          c.lunch_end ? new Date(c.lunch_end).getTime() : 0,
          c.ultima_actividad ? new Date(c.ultima_actividad).getTime() : 0,
        );
        const minSinTarea = Math.floor((ahora - desde) / 60000);
        if (minSinTarea < umbralMin) continue;
        const { hoy, reciente } = await yaEnviado(c.id, 'sin_tarea', fecha, 120);
        if (hoy >= maxDia || reciente) continue;
        const nombre = String(c.nombre || '').trim().split(' ')[0] || 'Hola';
        await createNotification(c.id, `Llevas ${minSinTarea} min conectado sin una tarea activa. Si estás trabajando en algo, dale play para que tu tiempo cuente.`);
        if (emailOk && c.email) {
          const { html, text } = await renderEmail({
            accent: 'blue',
            preheader: 'Sin tarea activa',
            headline: '¿En qué estás trabajando?',
            greeting: `Hola ${esc(nombre)},`,
            intro: `Estás conectado en Tiusdei desde hace un rato, pero llevas <strong>${minSinTarea} minutos</strong> sin una tarea activa. Si estás trabajando en algo, dale play a la tarea para que tu tiempo quede registrado; si estás en una reunión que no está en tu calendario, agrégala y no volveremos a molestar.`,
            cta: { text: 'Ir a mis tareas', url: `${frontendUrl}/tareas` },
          });
          await sendEmail({ to: c.email, subject: 'Recordatorio: no tienes una tarea activa en Tiusdei', html, text });
        }
        await registrar(c.id, 'sin_tarea', fecha);
        console.log(`[RECORDATORIOS] sin_tarea (${minSinTarea} min) → ${c.nombre}`);
      }
    }
  } catch (e) {
    console.error('[RECORDATORIOS] error:', (e as Error).message);
  }
}
