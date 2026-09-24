import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne } from '../db/mysql.js';
import { getGlobalPresence } from '../socket.js';
import { hasRole } from '../utils/roles.js';
import { reunionesDeHoy, reunionesPorDia, horaLimiteIngreso, esIngresoTarde } from '../services/meetingsNow.js';

// Vista privada "Mi equipo" (Jefe de Desarrollo): carga laboral, tiempos y
// todas las tareas del equipo de desarrollo. Quién la ve y quiénes son el
// equipo se guarda en site_settings (dev_team_owner_ids / dev_team_member_ids,
// CSV de uuids); si no existen se usan estos valores por defecto.
const DEFAULT_OWNER_IDS = ['fae44468-6961-45c3-ab6b-480412abdd91']; // Fadel
const DEFAULT_MEMBER_IDS = [
  '25d90b0c-67b0-4756-8e40-a4f62f13953c', // Jonathan Vera
  '63b44b66-3564-47f0-9749-a4b2a7d26bf9', // Even Fierro
  'd59fc6b2-6649-43bb-b7a4-99495629f6a3', // Oriana Barcia
];

const ESTADOS_CERRADOS = new Set(['entregado', 'aprobado']);
const SEMANAS_ADELANTE = 8;
const SEMANAS_ATRAS = 8;
const TZ = 'America/Guayaquil';

export const devTeamRouter = Router();

async function readIds(key: string, fallback: string[]): Promise<string[]> {
  const row = await queryOne<{ value: string }>('SELECT value FROM site_settings WHERE `key` = ?', [key]);
  if (!row?.value) return fallback;
  const ids = row.value.split(',').map((s) => s.trim()).filter(Boolean);
  return ids.length ? ids : fallback;
}

async function requireOwner(req: AuthRequest): Promise<boolean> {
  const owners = await readIds('dev_team_owner_ids', DEFAULT_OWNER_IDS);
  return !!req.userId && owners.includes(req.userId);
}

// Horas por semana que cada persona reserva a mantenimiento, cotizaciones y
// soporte (trabajo recurrente que no siempre tiene tarea). Se restan de la
// capacidad antes de comparar contra la carga de proyectos.
async function readReserved(): Promise<Record<string, number>> {
  const row = await queryOne<{ value: string }>('SELECT value FROM site_settings WHERE `key` = ?', ['dev_team_reserved_hours']);
  try { return row?.value ? JSON.parse(row.value) : {}; } catch { return {}; }
}
// Tareas que cuentan como "recurrentes" al sugerir esa reserva
const RECURRENTE_REGEXP = 'mantenimiento|cotiza|propuesta|soporte|incidencia|bug|error|respaldo|acceso';

// ---- Fechas (todo en calendario de Ecuador, sin horas) ----
function hoyEcuador(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()); // YYYY-MM-DD
}
function toUtcDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(ymdStr: string, n: number): string {
  const d = toUtcDate(ymdStr);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}
function inicioSemana(ymdStr: string): string {
  const d = toUtcDate(ymdStr);
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return ymd(d);
}
function diffDias(a: string, b: string): number {
  return Math.round((toUtcDate(a).getTime() - toUtcDate(b).getTime()) / 86400000);
}
function mediana(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const r1 = (n: number) => Math.round(n * 10) / 10;

interface TaskRow {
  id: string;
  titulo_tarea: string;
  estado: string;
  prioridad: string;
  fecha_inicio: string | null;
  fecha_entrega: string | null;
  estimated_hours: string | number | null;
  tiempo_trabajado: number | null;
  responsable_user_id: string | null;
  co_responsables: string | null;
  ajustes_count: number | null;
  parent_task_id: string | null;
  timer_activo: number;
  departamento: string | null;
  project_id: string | null;
  brand_nombre: string | null;
  project_nombre: string | null;
  desk_nombre: string | null;
  reagendada: number;
  minutos_por_tipo: string | number | null;
  created_at: Date;
  updated_at: Date;
}

// Calcula la foto completa (presencia, timer, horas, entregas, carga por semana,
// tareas y proyectos) para cualquier lista de personas. La usan la vista privada
// de Fadel (equipo de desarrollo) y la vista por mesa. Con `soloRecientes` la
// lista de tareas trae solo las abiertas y las cerradas en los últimos 30 días
// (para mesas grandes).
// Horas de una tarea para la carga: estimado de la tarea → estimado estándar de
// sus tipos de entregable × cantidad → según `sinEstimar`: 'mediana' (la de la
// persona, vista de desarrollo) o 'cero' (vista por mesa: no inventa horas; la
// tarea se cuenta aparte como "sin estimar"). `soporte` = integrantes de apoyo:
// se muestran pero no entran en los totales del equipo.
interface OpcionesOverview { sinEstimar?: 'mediana' | 'cero'; soporte?: Set<string> }
async function construirOverview(memberIds: string[], soloRecientes = false, opts: OpcionesOverview = {}) {
    const ph = memberIds.map(() => '?').join(',');
    const hoy = hoyEcuador();
    const lunesActual = inicioSemana(hoy);
    const recientesCond = soloRecientes
      ? ` AND (t.estado NOT IN ('entregado','aprobado') OR t.updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY))`
      : '';

    const [members, attendance, timers, horasDia, entregasDia, tasks, reservadas, recurrenteTimer, recurrenteTareas, reuniones, reunionesDias, limiteIngreso] = await Promise.all([
      query<any[]>(
        `SELECT p.id, p.nombre, p.avatar_url, p.rol, u.email, p.weekly_capacity_hours, p.activo
         FROM profiles p LEFT JOIN users u ON u.id = p.id WHERE p.id IN (${ph})`,
        memberIds,
      ),
      query<any[]>(
        `SELECT user_id, check_in, check_out, lunch_start, lunch_end
         FROM attendance
         WHERE user_id IN (${ph}) AND DATE(CONVERT_TZ(check_in, '+00:00', '-05:00')) = ?
         ORDER BY check_in DESC`,
        [...memberIds, hoy],
      ),
      query<any[]>(
        `SELECT te.user_id, te.task_id, te.status, te.start_time, te.duration_seconds, t.titulo_tarea
         FROM time_entries te JOIN tasks t ON t.id = te.task_id
         WHERE te.user_id IN (${ph}) AND te.status IN ('active','paused')`,
        memberIds,
      ),
      query<any[]>(
        `SELECT user_id, DATE(CONVERT_TZ(start_time, '+00:00', '-05:00')) AS dia, SUM(duration_seconds) AS s
         FROM time_entries
         WHERE user_id IN (${ph}) AND status = 'completed' AND start_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY user_id, dia`,
        [...memberIds, SEMANAS_ATRAS * 7 + 7],
      ),
      query<any[]>(
        `SELECT t.responsable_user_id AS user_id,
                DATE(CONVERT_TZ(al.created_at, '+00:00', '-05:00')) AS dia,
                COUNT(DISTINCT al.entity_id) AS n
         FROM activity_log al JOIN tasks t ON t.id = al.entity_id
         WHERE al.entity_type = 'task' AND al.field_name = 'estado'
           AND al.new_value IN ('entregado','aprobado')
           AND (al.old_value IS NULL OR al.old_value NOT IN ('entregado','aprobado'))
           AND t.responsable_user_id IN (${ph})
           AND al.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY t.responsable_user_id, dia`,
        [...memberIds, SEMANAS_ATRAS * 7 + 7],
      ),
      query<TaskRow[]>(
        `SELECT t.id, t.titulo_tarea, t.estado, t.prioridad,
                DATE_FORMAT(t.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
                DATE_FORMAT(t.fecha_entrega, '%Y-%m-%d') AS fecha_entrega,
                t.estimated_hours, t.tiempo_trabajado, t.responsable_user_id,
                (SELECT GROUP_CONCAT(tr.user_id) FROM task_responsables tr WHERE tr.task_id = t.id) AS co_responsables,
                t.ajustes_count, t.parent_task_id, t.timer_activo, t.departamento, t.project_id,
                b.nombre AS brand_nombre, p.nombre AS project_nombre, d.nombre AS desk_nombre,
                (SELECT COUNT(*) FROM task_reschedules r WHERE r.task_id = t.id) AS reagendada,
                COALESCE(
                  (SELECT SUM(tdt.cantidad * dt.minutos_estimados) FROM task_deliverable_types tdt
                    JOIN deliverable_types dt ON dt.id = tdt.tipo_entregable_id
                    WHERE tdt.task_id = t.id AND dt.minutos_estimados > 0),
                  (SELECT dt2.minutos_estimados * GREATEST(1, COALESCE(t.cantidad_entregables, 1))
                    FROM deliverable_types dt2 WHERE dt2.id = t.tipo_entregable_id AND dt2.minutos_estimados > 0)
                ) AS minutos_por_tipo,
                t.created_at, t.updated_at
         FROM tasks t
         LEFT JOIN brands b ON b.id = t.brand_id
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN desks d ON d.id = t.desk_id
         WHERE (t.responsable_user_id IN (${ph})
            OR t.id IN (SELECT task_id FROM task_responsables WHERE user_id IN (${ph})))${recientesCond}
         ORDER BY t.fecha_entrega IS NULL, t.fecha_entrega ASC, t.prioridad = 'alta' DESC`,
        [...memberIds, ...memberIds],
      ),
      readReserved(),
      query<any[]>(
        `SELECT te.user_id, SUM(te.duration_seconds) AS s, COUNT(DISTINCT te.task_id) AS n
         FROM time_entries te JOIN tasks t ON t.id = te.task_id
         WHERE te.user_id IN (${ph}) AND te.status = 'completed'
           AND te.start_time >= DATE_SUB(NOW(), INTERVAL 56 DAY)
           AND t.titulo_tarea REGEXP ?
         GROUP BY te.user_id`,
        [...memberIds, RECURRENTE_REGEXP],
      ),
      query<any[]>(
        `SELECT responsable_user_id AS user_id, COUNT(*) AS n
         FROM tasks
         WHERE responsable_user_id IN (${ph}) AND estado IN ('entregado','aprobado')
           AND updated_at >= DATE_SUB(NOW(), INTERVAL 56 DAY)
           AND titulo_tarea REGEXP ?
         GROUP BY responsable_user_id`,
        [...memberIds, RECURRENTE_REGEXP],
      ),
      reunionesDeHoy(memberIds),
      reunionesPorDia(memberIds, SEMANAS_ATRAS * 7 + 7),
      horaLimiteIngreso(),
    ]);

    const presence = new Map(getGlobalPresence().map((p) => [p.userId, p.status]));
    const memberSet = new Set(memberIds);

    // Responsables de cada tarea (titular + co-responsables), y cuántos del equipo
    const tareas = tasks.map((t) => {
      const set = new Set<string>();
      if (t.responsable_user_id) set.add(t.responsable_user_id);
      (t.co_responsables || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((id) => set.add(id));
      const responsables = Array.from(set);
      const est = Number(t.estimated_hours || 0);
      const porTipo = Number(t.minutos_por_tipo || 0) / 60;
      return {
        id: t.id,
        titulo: t.titulo_tarea,
        estado: t.estado,
        prioridad: t.prioridad,
        fecha_inicio: t.fecha_inicio,
        fecha_entrega: t.fecha_entrega,
        estimado_h: est > 0 ? est : null,
        estimado_tipo_h: porTipo > 0 ? r1(porTipo) : null,
        trabajado_h: r1(Number(t.tiempo_trabajado || 0) / 3600),
        responsable_user_id: t.responsable_user_id,
        responsables,
        miembros: responsables.filter((id) => memberSet.has(id)),
        ajustes: Number(t.ajustes_count || 0),
        reagendada: Number(t.reagendada || 0),
        es_subtarea: !!t.parent_task_id,
        timer_activo: !!t.timer_activo,
        departamento: t.departamento,
        project_id: t.project_id,
        proyecto: t.project_nombre,
        marca: t.brand_nombre,
        mesa: t.desk_nombre,
        abierta: !ESTADOS_CERRADOS.has(t.estado),
        vencida: !ESTADOS_CERRADOS.has(t.estado) && !!t.fecha_entrega && t.fecha_entrega < hoy,
        created_at: t.created_at,
        updated_at: t.updated_at,
      };
    });

    // Semanas hacia atrás (horas y entregas) y hacia adelante (carga)
    const semanasAtras: string[] = [];
    for (let i = SEMANAS_ATRAS - 1; i >= 0; i--) semanasAtras.push(addDays(lunesActual, -7 * i));
    const semanasAdelante: string[] = [];
    for (let i = 0; i < SEMANAS_ADELANTE; i++) semanasAdelante.push(addDays(lunesActual, 7 * i));

    const attendanceByUser = new Map<string, any>();
    for (const a of attendance) if (!attendanceByUser.has(a.user_id)) attendanceByUser.set(a.user_id, a);
    // Primer ingreso del día (para "ingreso tarde"); attendance viene ordenado de más nuevo a más viejo
    const primerIngreso = new Map<string, Date>();
    for (const a of attendance) primerIngreso.set(a.user_id, a.check_in);
    const timerByUser = new Map<string, any>();
    for (const t of timers) if (!timerByUser.has(t.user_id) || t.status === 'active') timerByUser.set(t.user_id, t);

    const ahora = Date.now();
    const noventaDiasAtras = new Date(ahora - 90 * 86400000);

    const out = members.map((m) => {
      const capBruta = Number(m.weekly_capacity_hours || 40);
      const reservadasSem = Math.max(0, Math.min(capBruta, Number(reservadas[m.id] ?? 0)));
      // Capacidad que realmente queda para proyectos
      const cap = Math.max(0, capBruta - reservadasSem);
      const recT = recurrenteTimer.find((r) => r.user_id === m.id);
      const recN = recurrenteTareas.find((r) => r.user_id === m.id);
      const recurrenteHoras8 = r1(Number(recT?.s || 0) / 3600);
      const mias = tareas.filter((t) => t.miembros.includes(m.id));
      const abiertas = mias.filter((t) => t.abierta);

      // Estimación por defecto para tareas sin horas: mediana de lo que esta
      // persona estima en sus tareas de los últimos 90 días (mínimo 0.5h, máximo 8h)
      const conEstimado = mias
        .filter((t) => t.estimado_h && new Date(t.updated_at) >= noventaDiasAtras)
        .map((t) => t.estimado_h as number);
      const defecto = Math.min(8, Math.max(0.5, mediana(conEstimado) ?? 2));

      // Carga por semana (horas restantes de cada tarea abierta, repartidas entre responsables)
      const semanas = semanasAdelante.map((inicio) => ({ inicio, horas: 0, tareas: 0, capacidad: cap, pct: 0 }));
      let vencidasH = 0, vencidasN = 0, sinFechaH = 0, sinFechaN = 0, despuesH = 0, despuesN = 0;
      let comprometidas = 0, estimadasExplicitas = 0;
      for (const t of abiertas) {
        const conocidas = t.estimado_h ?? t.estimado_tipo_h;
        if (conocidas) estimadasExplicitas += 1;
        const horas = conocidas ?? (opts.sinEstimar === 'cero' ? 0 : defecto);
        // Sin horas conocidas en la vista por mesa: la tarea se cuenta, pero sin sumar horas
        const restante = (horas > 0 ? Math.max(0.25, horas - t.trabajado_h) : 0) / Math.max(1, t.responsables.length);
        comprometidas += restante;
        if (!t.fecha_entrega) { sinFechaH += restante; sinFechaN += 1; continue; }
        if (t.fecha_entrega < hoy) { vencidasH += restante; vencidasN += 1; continue; }
        const idx = Math.floor(diffDias(inicioSemana(t.fecha_entrega), lunesActual) / 7);
        if (idx >= SEMANAS_ADELANTE) { despuesH += restante; despuesN += 1; continue; }
        semanas[idx].horas += restante;
        semanas[idx].tareas += 1;
      }
      // Lo vencido hay que hacerlo ya: cuenta en la semana actual
      semanas[0].horas += vencidasH;
      semanas[0].tareas += vencidasN;
      for (const s of semanas) { s.horas = r1(s.horas); s.pct = cap > 0 ? Math.round((s.horas / cap) * 100) : 0; }

      // Horas trabajadas por día = timer + reuniones del calendario (pedido de Fadel/Steven:
      // una reunión es trabajo). Últimas 8 semanas, en calendario Ecuador.
      const misDiasTimer = horasDia.filter((h) => h.user_id === m.id).map((h) => ({ dia: ymd(new Date(h.dia)), s: Number(h.s || 0) }));
      const misDiasReu = Object.entries(reunionesDias.get(m.id) || {}).map(([dia, s]) => ({ dia, s: Number(s || 0) }));
      const misDias = [...misDiasTimer, ...misDiasReu];
      const secTimerDe = (desde: string) => misDiasTimer.filter((h) => h.dia >= desde).reduce((acc, h) => acc + h.s, 0);
      const secReuDe = (desde: string) => misDiasReu.filter((h) => h.dia >= desde).reduce((acc, h) => acc + h.s, 0);
      const horasSemana = semanasAtras.map((inicio) => {
        const fin = addDays(inicio, 6);
        const s = misDias.filter((h) => { const d = ymd(new Date(h.dia)); return d >= inicio && d <= fin; })
          .reduce((acc, h) => acc + Number(h.s || 0), 0);
        return { inicio, horas: r1(s / 3600) };
      });
      const secDe = (desde: string) => misDias
        .filter((h) => ymd(new Date(h.dia)) >= desde)
        .reduce((acc, h) => acc + Number(h.s || 0), 0);
      const timer = timerByUser.get(m.id) || null;
      let timerSeg = 0;
      if (timer) {
        timerSeg = timer.status === 'active'
          ? Math.min(Math.floor((ahora - new Date(timer.start_time).getTime()) / 1000), 12 * 3600)
          : Number(timer.duration_seconds || 0);
      }
      const hoySeg = secDe(hoy) + timerSeg;
      // Ritmo real: promedio de las 4 semanas completas anteriores (excluye la actual)
      const previas = horasSemana.slice(-5, -1).map((s) => s.horas);
      const ritmo = previas.length ? r1(previas.reduce((a, b) => a + b, 0) / previas.length) : 0;

      const misEntregas = entregasDia.filter((e) => e.user_id === m.id);
      const entregasSemana = semanasAtras.map((inicio) => {
        const fin = addDays(inicio, 6);
        const n = misEntregas.filter((e) => { const d = ymd(new Date(e.dia)); return d >= inicio && d <= fin; })
          .reduce((acc, e) => acc + Number(e.n || 0), 0);
        return { inicio, entregas: n };
      });

      const byEstado: Record<string, number> = {};
      for (const t of mias) byEstado[t.estado] = (byEstado[t.estado] || 0) + 1;
      const finSemana = addDays(lunesActual, 6);
      const finProxima = addDays(lunesActual, 13);

      const att = attendanceByUser.get(m.id) || null;
      // Utilización de hoy: (timer + reuniones del calendario) / tiempo conectado (asistencia, sin almuerzo)
      const reu = reuniones.get(m.id);
      let asistenciaSeg = 0;
      if (att?.check_in) {
        const fin = att.check_out ? new Date(att.check_out).getTime() : ahora;
        asistenciaSeg = Math.max(0, (fin - new Date(att.check_in).getTime()) / 1000);
        if (att.lunch_start) {
          const lFin = att.lunch_end ? new Date(att.lunch_end).getTime() : Math.min(ahora, fin);
          asistenciaSeg -= Math.max(0, (lFin - new Date(att.lunch_start).getTime()) / 1000);
        }
      }
      // hoySeg ya incluye las reuniones de hoy (vienen en misDias); no se suman dos veces
      const reunionesHoySeg = secReuDe(hoy);
      const utilizacion = asistenciaSeg >= 600 ? Math.min(100, Math.round((hoySeg / asistenciaSeg) * 100)) : null;
      return {
        id: m.id,
        // Hay perfiles con espacio inicial (" Nicole Rodriguez"): sin trim, el nombre corto sale vacío
        nombre: String(m.nombre || '').trim() || 'Sin nombre',
        email: m.email,
        rol: m.rol,
        avatar_url: m.avatar_url,
        activo: !!m.activo,
        es_soporte: !!opts.soporte?.has(m.id),
        primer_ingreso: primerIngreso.get(m.id) ?? null,
        ingreso_tarde: esIngresoTarde(primerIngreso.get(m.id), limiteIngreso),
        capacidad_semana: capBruta,
        reservadas_semana: reservadasSem,
        capacidad_proyectos: cap,
        // Sugerencia: lo que de verdad registran en el timer en tareas recurrentes (8 semanas)
        reservadas_sugeridas: r1(recurrenteHoras8 / 8),
        recurrente: { horas_8sem: recurrenteHoras8, tareas_timer_8sem: Number(recT?.n || 0), tareas_entregadas_8sem: Number(recN?.n || 0) },
        presencia: presence.get(m.id) || 'offline',
        asistencia_hoy: att ? { check_in: att.check_in, check_out: att.check_out, lunch_start: att.lunch_start, lunch_end: att.lunch_end } : null,
        timer: timer ? { task_id: timer.task_id, titulo: timer.titulo_tarea, status: timer.status, start_time: timer.start_time, segundos: timerSeg } : null,
        calendario_conectado: !!reu?.conectado,
        reunion_ahora: reu?.ahora ?? null,
        reuniones_hoy: reu?.eventos.length ?? 0,
        asistencia_hoy_seg: Math.round(asistenciaSeg),
        utilizacion_hoy_pct: utilizacion,
        horas: {
          hoy: r1(hoySeg / 3600),
          timer_hoy: r1((secTimerDe(hoy) + timerSeg) / 3600),
          reuniones_hoy: r1(reunionesHoySeg / 3600),
          reuniones_hoy_total: r1((reu?.hoy_seg ?? 0) / 3600),
          reuniones_semana: r1(secReuDe(lunesActual) / 3600),
          reuniones_ult30: r1(secReuDe(addDays(hoy, -29)) / 3600),
          semana: r1((secDe(lunesActual) + timerSeg) / 3600),
          ult7: r1((secDe(addDays(hoy, -6)) + timerSeg) / 3600),
          ult30: r1((secDe(addDays(hoy, -29)) + timerSeg) / 3600),
          ritmo_semanal: ritmo,
          por_semana: horasSemana,
        },
        entregas: { por_semana: entregasSemana, ult30: misEntregas.filter((e) => ymd(new Date(e.dia)) >= addDays(hoy, -29)).reduce((a, e) => a + Number(e.n || 0), 0) },
        conteos: {
          total: mias.length,
          abiertas: abiertas.length,
          por_estado: byEstado,
          vencidas: vencidasN,
          vence_esta_semana: abiertas.filter((t) => t.fecha_entrega && t.fecha_entrega >= hoy && t.fecha_entrega <= finSemana).length,
          vence_proxima_semana: abiertas.filter((t) => t.fecha_entrega && t.fecha_entrega > finSemana && t.fecha_entrega <= finProxima).length,
          sin_fecha: sinFechaN,
          sin_estimar: abiertas.length - estimadasExplicitas,
          bloqueadas: abiertas.filter((t) => t.estado === 'bloqueado').length,
          en_proceso: abiertas.filter((t) => t.estado === 'en_proceso').length,
          reagendadas: abiertas.filter((t) => t.reagendada > 0).length,
          con_ajustes: abiertas.filter((t) => t.ajustes > 0).length,
          alta_prioridad: abiertas.filter((t) => t.prioridad === 'alta').length,
        },
        carga: {
          horas_comprometidas: r1(comprometidas),
          horas_defecto_por_tarea: defecto,
          semanas_para_vaciar: cap > 0 ? r1(comprometidas / cap) : null,
          semanas_a_ritmo_real: ritmo > 0 ? r1(comprometidas / ritmo) : null,
          vencidas: { horas: r1(vencidasH), tareas: vencidasN },
          sin_fecha: { horas: r1(sinFechaH), tareas: sinFechaN },
          despues: { horas: r1(despuesH), tareas: despuesN },
          semanas,
        },
      };
    });

    // Resumen del equipo y veredicto "¿hace falta otro recurso?" (sin los de soporte;
    // si todos son soporte, se usan todos)
    const principales = out.filter((m) => !m.es_soporte);
    const base = principales.length ? principales : out;
    const capacidadEquipo = base.reduce((a, m) => a + m.capacidad_proyectos, 0);
    const capacidadBrutaEquipo = base.reduce((a, m) => a + m.capacidad_semana, 0);
    const reservadasEquipo = base.reduce((a, m) => a + m.reservadas_semana, 0);
    const comprometidasEquipo = r1(base.reduce((a, m) => a + m.carga.horas_comprometidas, 0));
    const ritmoEquipo = r1(base.reduce((a, m) => a + m.horas.ritmo_semanal, 0));
    const abiertasEquipo = base.reduce((a, m) => a + m.conteos.abiertas, 0);
    const sinEstimarEquipo = base.reduce((a, m) => a + m.conteos.sin_estimar, 0);
    let deficit4 = 0;
    for (const m of base) for (const s of m.carga.semanas.slice(0, 4)) deficit4 += Math.max(0, s.horas - s.capacidad);
    const faltantesSemana = r1(deficit4 / 4);
    const semanasParaVaciar = capacidadEquipo > 0 ? r1(comprometidasEquipo / capacidadEquipo) : null;
    const saturados = base.filter((m) => m.carga.semanas.slice(0, 2).some((s) => s.pct > 100)).map((m) => m.nombre);
    let veredicto: 'ok' | 'al_limite' | 'contratar' = 'ok';
    if (faltantesSemana >= 20 || (semanasParaVaciar ?? 0) >= 6) veredicto = 'contratar';
    else if (faltantesSemana >= 8 || (semanasParaVaciar ?? 0) >= 3) veredicto = 'al_limite';

    // Proyectos con tareas abiertas del equipo
    const projIds = Array.from(new Set(tareas.filter((t) => t.abierta && t.project_id).map((t) => t.project_id as string)));
    let proyectos: any[] = [];
    if (projIds.length) {
      const meta = await query<any[]>(
        `SELECT p.id, p.nombre, p.estado, p.salud, DATE_FORMAT(p.fecha_fin, '%Y-%m-%d') AS fecha_fin, b.nombre AS marca
         FROM projects p LEFT JOIN brands b ON b.id = p.brand_id WHERE p.id IN (${projIds.map(() => '?').join(',')})`,
        projIds,
      );
      proyectos = meta.map((p) => {
        const del = tareas.filter((t) => t.project_id === p.id);
        const ab = del.filter((t) => t.abierta);
        const porMiembro: Record<string, number> = {};
        for (const t of ab) for (const id of t.miembros) porMiembro[id] = (porMiembro[id] || 0) + 1;
        const horas = ab.reduce((a, t) => a + Math.max(0.25, (t.estimado_h ?? t.estimado_tipo_h ?? 2) - t.trabajado_h), 0);
        return {
          id: p.id, nombre: p.nombre, marca: p.marca, estado: p.estado, salud: p.salud, fecha_fin: p.fecha_fin,
          total: del.length, abiertas: ab.length, vencidas: ab.filter((t) => t.vencida).length,
          horas_restantes: r1(horas), por_miembro: porMiembro,
        };
      }).sort((a, b) => b.abiertas - a.abiertas);
    }

    return {
      generado: new Date().toISOString(),
      hoy,
      semana_actual: lunesActual,
      solo_recientes: soloRecientes,
      hora_limite_ingreso: limiteIngreso,
      miembros: out,
      equipo: {
        integrantes: base.length,
        soporte: out.length - principales.length,
        capacidad_semana: capacidadEquipo,
        capacidad_bruta: capacidadBrutaEquipo,
        reservadas_semana: reservadasEquipo,
        horas_comprometidas: comprometidasEquipo,
        ritmo_semanal_real: ritmoEquipo,
        semanas_para_vaciar: semanasParaVaciar,
        semanas_a_ritmo_real: ritmoEquipo > 0 ? r1(comprometidasEquipo / ritmoEquipo) : null,
        horas_faltantes_semana: faltantesSemana,
        personas_faltantes: r1(faltantesSemana / 40),
        tareas_abiertas: abiertasEquipo,
        sin_estimar: sinEstimarEquipo,
        pct_sin_estimar: abiertasEquipo ? Math.round((sinEstimarEquipo / abiertasEquipo) * 100) : 0,
        saturados,
        veredicto,
      },
      proyectos,
      tareas,
    };
}

devTeamRouter.get('/dev-team/overview', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireOwner(req))) return res.status(403).json({ error: 'Esta vista es privada' });
    const memberIds = await readIds('dev_team_member_ids', DEFAULT_MEMBER_IDS);
    const [data, candidates] = await Promise.all([
      construirOverview(memberIds),
      query<any[]>(
        `SELECT id, nombre, rol, avatar_url FROM profiles
         WHERE activo = 1 AND rol IN ('admin','ejecutivo','equipo') ORDER BY nombre`,
      ),
    ]);
    res.json({ ...data, candidatos: candidates, config: { member_ids: memberIds } });
  } catch (e) {
    console.error('[DEV-TEAM] overview:', e);
    res.status(500).json({ error: 'Error al cargar la vista del equipo' });
  }
});

// Vista por mesa (admins y ejecutivos): misma foto, pero para los integrantes
// activos de la mesa elegida. Sin desk_id devuelve solo la lista de mesas.
devTeamRouter.get('/dev-team/desk-overview', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await hasRole(req.userId!, ['admin', 'ejecutivo']))) return res.status(403).json({ error: 'Sin permisos' });
    const desks = await query<{ id: string; nombre: string; miembros: number }[]>(
      `SELECT d.id, d.nombre,
              (SELECT COUNT(*) FROM desk_members dm JOIN profiles p ON p.id = dm.user_id
                WHERE dm.desk_id = d.id AND p.activo = 1 AND p.rol IN ('admin','ejecutivo','equipo')) AS miembros
       FROM desks d WHERE d.activo = 1 ORDER BY d.nombre`,
    );
    const deskId = String(req.query.desk_id || '');
    if (!deskId) return res.json({ desks });
    const desk = desks.find((d) => d.id === deskId);
    if (!desk) return res.status(404).json({ error: 'Mesa no encontrada' });
    const rows = await query<{ user_id: string; es_soporte: number | null }[]>(
      `SELECT dm.user_id, dm.es_soporte FROM desk_members dm JOIN profiles p ON p.id = dm.user_id
       WHERE dm.desk_id = ? AND p.activo = 1 AND p.rol IN ('admin','ejecutivo','equipo')
       ORDER BY p.nombre`,
      [deskId],
    );
    const memberIds = rows.map((r) => r.user_id);
    if (!memberIds.length) return res.json({ desks, desk_id: deskId, desk_nombre: desk.nombre, miembros: [], tareas: [], proyectos: [], equipo: null });
    // Equipo base de la mesa vs. soporte (marcado en Administración > Mesas)
    const soporte = new Set(rows.filter((r) => Number(r.es_soporte) === 1).map((r) => r.user_id));
    const data = await construirOverview(memberIds, true, { sinEstimar: 'cero', soporte });
    res.json({ desks, desk_id: deskId, desk_nombre: desk.nombre, ...data });
  } catch (e) {
    console.error('[DEV-TEAM] desk-overview:', e);
    res.status(500).json({ error: 'Error al cargar la vista de la mesa' });
  }
});

// Capacidad y horas reservadas de cualquier persona (solo admins). Misma lógica
// que /dev-team/members/:id pero sin exigir que sea del equipo de desarrollo.
devTeamRouter.patch('/dev-team/desk-members/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await hasRole(req.userId!, ['admin']))) return res.status(403).json({ error: 'Sin permisos' });
    const parsed = capacidadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Valores inválidos (capacidad 1 a 80 h, reservadas 0 a 80 h)' });
    const id = String(req.params.id);
    const existe = await queryOne<{ id: string }>('SELECT id FROM profiles WHERE id = ?', [id]);
    if (!existe) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (parsed.data.weekly_capacity_hours !== undefined) {
      await query('UPDATE profiles SET weekly_capacity_hours = ? WHERE id = ?', [Math.round(parsed.data.weekly_capacity_hours), id]);
    }
    if (parsed.data.reserved_hours !== undefined) {
      const actual = await readReserved();
      actual[id] = Math.round(parsed.data.reserved_hours * 2) / 2;
      await query(
        'INSERT INTO site_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
        ['dev_team_reserved_hours', JSON.stringify(actual)],
      );
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[DEV-TEAM] desk-member:', e);
    res.status(500).json({ error: 'Error al guardar' });
  }
});

const capacidadSchema = z.object({
  weekly_capacity_hours: z.number().min(1).max(80).optional(),
  reserved_hours: z.number().min(0).max(80).optional(),
});

devTeamRouter.patch('/dev-team/members/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireOwner(req))) return res.status(403).json({ error: 'Esta vista es privada' });
    const parsed = capacidadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Valores inválidos (capacidad 1 a 80 h, reservadas 0 a 80 h)' });
    const memberIds = await readIds('dev_team_member_ids', DEFAULT_MEMBER_IDS);
    const id = String(req.params.id);
    if (!memberIds.includes(id)) return res.status(404).json({ error: 'No es parte del equipo' });
    if (parsed.data.weekly_capacity_hours !== undefined) {
      await query('UPDATE profiles SET weekly_capacity_hours = ? WHERE id = ?', [Math.round(parsed.data.weekly_capacity_hours), id]);
    }
    if (parsed.data.reserved_hours !== undefined) {
      const actual = await readReserved();
      actual[id] = Math.round(parsed.data.reserved_hours * 2) / 2;
      await query(
        'INSERT INTO site_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
        ['dev_team_reserved_hours', JSON.stringify(actual)],
      );
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[DEV-TEAM] capacidad:', e);
    res.status(500).json({ error: 'Error al guardar' });
  }
});

const configSchema = z.object({ member_ids: z.array(z.string().uuid()).min(1).max(15) });

devTeamRouter.put('/dev-team/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireOwner(req))) return res.status(403).json({ error: 'Esta vista es privada' });
    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Lista de miembros inválida' });
    const ids = Array.from(new Set(parsed.data.member_ids));
    const ph = ids.map(() => '?').join(',');
    const existen = await query<{ id: string }[]>(`SELECT id FROM profiles WHERE id IN (${ph})`, ids);
    if (existen.length !== ids.length) return res.status(400).json({ error: 'Hay usuarios que no existen' });
    await query(
      'INSERT INTO site_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
      ['dev_team_member_ids', ids.join(',')],
    );
    res.json({ success: true, member_ids: ids });
  } catch (e) {
    console.error('[DEV-TEAM] config:', e);
    res.status(500).json({ error: 'Error al guardar' });
  }
});
