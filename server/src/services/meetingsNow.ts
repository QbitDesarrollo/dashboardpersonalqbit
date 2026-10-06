import { google, type calendar_v3 } from 'googleapis';
import { query } from '../db/mysql.js';
import { getAuthedClient } from '../utils/googleAuth.js';

// Reuniones de cada persona, leídas de su Google Calendar (si lo tiene
// conectado). Sirve para que el monitor y las vistas de equipo muestren
// "En reunión: X", sumen las reuniones a las horas trabajadas y para repartir
// las reuniones por marca en Tiempo por marca. Los eventos se cachean por persona
// para no golpear la API de Google en cada refresco.
//
// Qué cuenta como reunión (reunión con Steven, 6-oct-2026):
//  - evento con hora (no de día completo), no cancelado, no marcado "disponible",
//    que no sea una tarea que Tiusdei sincroniza ("[Tiusdei] ...");
//  - con al menos otro invitado o con link de videollamada (un bloqueo personal
//    tipo "NO DISPONIBLE" o "Almuerzo" no es reunión);
//  - que la persona organizó, aceptó o marcó "quizás" (una invitación sin
//    responder no cuenta: casi la mitad del tiempo agendado eran invitaciones así,
//    muchas de reuniones a las que no fue o que no se dieron).
// Y al sumar: solo dentro de la jornada marcada, sin duplicar reuniones que se
// pisan y sin el tiempo en que la persona tenía el timer corriendo en una tarea.

export interface EventoHoy { summary: string; start: string; end: string; duration_min: number }
export interface ReunionesUsuario {
  conectado: boolean;
  eventos: EventoHoy[];
  ahora: EventoHoy | null;      // evento en curso en este momento
  hoy_seg: number;              // total agendado del día (pasadas + futuras)
  hasta_ahora_seg: number;      // lo que CUENTA: transcurrido, en la jornada marcada y sin timer
  fuera_jornada_seg: number;    // transcurrido pero antes del ingreso, después de la salida o en almuerzo
}

type Intervalo = [number, number];
function unir(iv: Intervalo[]): Intervalo[] {
  const s = iv.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Intervalo[] = [];
  for (const [a, b] of s) {
    const u = out[out.length - 1];
    if (u && a <= u[1]) u[1] = Math.max(u[1], b); else out.push([a, b]);
  }
  return out;
}
function intersectar(a: Intervalo[], b: Intervalo[]): Intervalo[] {
  const out: Intervalo[] = [];
  for (const [a1, a2] of a) for (const [b1, b2] of b) {
    const i = Math.max(a1, b1), f = Math.min(a2, b2);
    if (f > i) out.push([i, f]);
  }
  return unir(out);
}
function restar(a: Intervalo[], b: Intervalo[]): Intervalo[] {
  let res = a;
  for (const [b1, b2] of b) {
    const next: Intervalo[] = [];
    for (const [a1, a2] of res) {
      if (b2 <= a1 || b1 >= a2) { next.push([a1, a2]); continue; }
      if (b1 > a1) next.push([a1, b1]);
      if (b2 < a2) next.push([b2, a2]);
    }
    res = next;
  }
  return res;
}
const sumarSeg = (iv: Intervalo[]) => iv.reduce((s, [a, b]) => s + (b - a), 0) / 1000;

/** Jornadas marcadas en Asistencia desde `desdeMs`, por persona (sin almuerzos). */
async function jornadas(userIds: string[], desdeMs: number): Promise<Map<string, Intervalo[]>> {
  const out = new Map<string, Intervalo[]>();
  if (!userIds.length) return out;
  const ph = userIds.map(() => '?').join(',');
  const rows = await query<{ user_id: string; check_in: Date; check_out: Date | null; lunch_start: Date | null; lunch_end: Date | null }[]>(
    `SELECT user_id, check_in, check_out, lunch_start, lunch_end FROM attendance
     WHERE user_id IN (${ph}) AND check_in >= ?`,
    [...userIds, new Date(desdeMs - 24 * 3600 * 1000)],
  );
  const ahora = Date.now();
  for (const r of rows) {
    const ini = new Date(r.check_in).getTime();
    const fin = r.check_out ? new Date(r.check_out).getTime() : ahora;
    let iv: Intervalo[] = [[ini, Math.min(fin, ahora)]];
    if (r.lunch_start) {
      const l1 = new Date(r.lunch_start).getTime();
      const l2 = r.lunch_end ? new Date(r.lunch_end).getTime() : Math.min(ahora, fin);
      iv = restar(iv, [[l1, l2]]);
    }
    out.set(r.user_id, [...(out.get(r.user_id) || []), ...iv]);
  }
  for (const [k, v] of out) out.set(k, unir(v));
  return out;
}

/** Tiempo con timer en tareas desde `desdeMs`, por persona (la sesión activa llega hasta ahora). */
async function tiempoConTimer(userIds: string[], desdeMs: number): Promise<Map<string, Intervalo[]>> {
  const out = new Map<string, Intervalo[]>();
  if (!userIds.length) return out;
  const ph = userIds.map(() => '?').join(',');
  const rows = await query<{ user_id: string; start_time: Date; end_time: Date | null; status: string }[]>(
    `SELECT user_id, start_time, end_time, status FROM time_entries
     WHERE user_id IN (${ph}) AND (start_time >= ? OR status = 'active') AND status IN ('active','completed','paused')`,
    [...userIds, new Date(desdeMs - 13 * 3600 * 1000)],
  );
  const ahora = Date.now();
  for (const r of rows) {
    const ini = new Date(r.start_time).getTime();
    const fin = r.end_time ? new Date(r.end_time).getTime() : (r.status === 'active' ? ahora : ini);
    out.set(r.user_id, [...(out.get(r.user_id) || []), [ini, fin] as Intervalo]);
  }
  for (const [k, v] of out) out.set(k, unir(v));
  return out;
}

const TZ = 'America/Guayaquil';

/** ¿Este evento del calendario cuenta como reunión de la persona? (reglas arriba) */
function esReunion(ev: calendar_v3.Schema$Event, maxMin: number): EventoHoy | null {
  if (ev.status === 'cancelled' || ev.transparency === 'transparent') return null;
  if ((ev.summary || '').startsWith('[Tiusdei]')) return null;
  const s = ev.start?.dateTime, e = ev.end?.dateTime;
  if (!s || !e) return null; // eventos de día completo no cuentan
  const dur = Math.round((new Date(e).getTime() - new Date(s).getTime()) / 60000);
  if (dur <= 0 || dur > maxMin) return null;
  const invitados = ev.attendees || [];
  const otros = invitados.filter((a) => !a.self && !a.resource).length;
  const conLink = !!(ev.hangoutLink || ev.conferenceData);
  if (otros === 0 && !conLink) return null; // bloqueo personal, no reunión
  const yo = invitados.find((a) => a.self);
  if (yo && !yo.organizer && yo.responseStatus !== 'accepted' && yo.responseStatus !== 'tentative') return null;
  return { summary: ev.summary || '(Sin título)', start: s, end: e, duration_min: dur };
}

// Quién no deja leer su calendario (conexión vencida o sin permiso de calendario).
// Se reintenta cada 10 min: sin esto, cada refresco del monitor volvía a pedirle a
// Google los calendarios que ya sabemos que no se pueden leer.
const sinAcceso = new Map<string, { motivo: string; at: number }>();
const REINTENTO_SIN_ACCESO_MS = 10 * 60 * 1000;
export function motivoSinAcceso(userId: string): string | null { return sinAcceso.get(userId)?.motivo ?? null; }

const cacheEventos = new Map<string, { at: number; eventos: EventoHoy[] }>();
/** Reuniones de la persona entre dos instantes; null = sin Google conectado o sin acceso. */
async function leerReuniones(userId: string, timeMin: string, timeMax: string, ttlMs: number, maxResults: number, maxMin: number): Promise<EventoHoy[] | null> {
  const key = `${userId}|${timeMin}|${timeMax}`;
  const c = cacheEventos.get(key);
  if (c && Date.now() - c.at < ttlMs) return c.eventos;
  const sa = sinAcceso.get(userId);
  if (sa && Date.now() - sa.at < REINTENTO_SIN_ACCESO_MS) return c?.eventos ?? null;
  const client = await getAuthedClient(userId);
  if (!client) return null;
  try {
    const cal = google.calendar({ version: 'v3', auth: client });
    const eventos: EventoHoy[] = [];
    let pageToken: string | undefined;
    do {
      const resp = await cal.events.list({ calendarId: 'primary', timeMin, timeMax, maxResults, singleEvents: true, orderBy: 'startTime', pageToken });
      for (const ev of resp.data.items || []) { const r = esReunion(ev, maxMin); if (r) eventos.push(r); }
      pageToken = resp.data.nextPageToken || undefined;
    } while (pageToken);
    cacheEventos.set(key, { at: Date.now(), eventos });
    sinAcceso.delete(userId);
    // Que la caché no crezca sin límite con rangos viejos
    if (cacheEventos.size > 2000) for (const [k, v] of cacheEventos) if (Date.now() - v.at > 3600_000) cacheEventos.delete(k);
    return eventos;
  } catch (e) {
    const msg = (e as Error).message || '';
    if (/scope/i.test(msg)) sinAcceso.set(userId, { motivo: 'sin permiso de calendario', at: Date.now() });
    else if (/refresh token|invalid_grant/i.test(msg)) sinAcceso.set(userId, { motivo: 'conexión vencida', at: Date.now() });
    console.error(`[REUNIONES] ${userId}:`, msg);
    // Si Google falla, usar lo último que teníamos (aunque esté vencido) para no parpadear
    return c?.eventos ?? (sinAcceso.has(userId) ? null : []);
  }
}

function ventanaHoy(): { timeMin: string; timeMax: string } {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  return { timeMin: new Date(`${hoy}T00:00:00-05:00`).toISOString(), timeMax: new Date(`${hoy}T23:59:59-05:00`).toISOString() };
}
// Hoy: caché de 2 min (el monitor consulta cada 30 s y las vistas de equipo cada 60 s)
async function eventosDe(userId: string): Promise<EventoHoy[] | null> {
  const { timeMin, timeMax } = ventanaHoy();
  return leerReuniones(userId, timeMin, timeMax, 2 * 60 * 1000, 250, 24 * 60);
}
// Últimos N días: caché de 10 min; eventos de más de 12 h no son reuniones
async function eventosRango(userId: string, dias: number): Promise<EventoHoy[] | null> {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const desde = new Date(`${hoy}T00:00:00-05:00`); desde.setUTCDate(desde.getUTCDate() - dias);
  return leerReuniones(userId, desde.toISOString(), new Date(`${hoy}T23:59:59-05:00`).toISOString(), 10 * 60 * 1000, 2500, 12 * 60);
}
const diaEcuador = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));

async function conGoogle(userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const tokens = await query<{ user_id: string }[]>(`SELECT user_id FROM google_tokens WHERE user_id IN (${userIds.map(() => '?').join(',')})`, userIds);
  return new Set(tokens.map((t) => t.user_id));
}

/** Reuniones que cuentan, en segundos por día (calendario Ecuador), de los últimos N días. */
export async function reunionesPorDia(userIds: string[], dias: number): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  if (!userIds.length) return out;
  const conectados = await conGoogle(userIds);
  const ids = userIds.filter((u) => conectados.has(u));
  const ahoraMs = Date.now();
  const desdeMs = ahoraMs - (dias + 1) * 86400000;
  const [jor, timer] = await Promise.all([jornadas(ids, desdeMs), tiempoConTimer(ids, desdeMs)]);
  await Promise.all(ids.map(async (uid) => {
    const eventos = await eventosRango(uid, dias);
    if (!eventos) return;
    // Transcurridas, sin duplicar las que se pisan, dentro de la jornada y sin el tiempo con timer
    const reun = unir(eventos.map((ev) => [new Date(ev.start).getTime(), Math.min(new Date(ev.end).getTime(), ahoraMs)] as Intervalo));
    const cuentan = restar(intersectar(reun, jor.get(uid) || []), timer.get(uid) || []);
    const porDia: Record<string, number> = {};
    for (const [a, b] of cuentan) {
      const dia = diaEcuador(new Date(a).toISOString());
      porDia[dia] = (porDia[dia] || 0) + (b - a) / 1000;
    }
    out.set(uid, porDia);
  }));
  return out;
}

export async function reunionesDeHoy(userIds: string[]): Promise<Map<string, ReunionesUsuario>> {
  const out = new Map<string, ReunionesUsuario>();
  if (!userIds.length) return out;
  const conectados = await conGoogle(userIds);
  const ahoraMs = Date.now();
  const inicioHoy = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())}T00:00:00-05:00`).getTime();
  const ids = userIds.filter((u) => conectados.has(u));
  const [jor, timer] = await Promise.all([jornadas(ids, inicioHoy), tiempoConTimer(ids, inicioHoy)]);
  await Promise.all(userIds.map(async (uid) => {
    const vacio: ReunionesUsuario = { conectado: false, eventos: [], ahora: null, hoy_seg: 0, hasta_ahora_seg: 0, fuera_jornada_seg: 0 };
    if (!conectados.has(uid)) { out.set(uid, vacio); return; }
    const eventos = await eventosDe(uid);
    if (!eventos) { out.set(uid, vacio); return; }
    let ahora: EventoHoy | null = null;
    for (const ev of eventos) {
      const s = new Date(ev.start).getTime(), e = new Date(ev.end).getTime();
      if (s <= ahoraMs && e > ahoraMs && !ahora) ahora = ev;
    }
    const agendado = unir(eventos.map((ev) => [new Date(ev.start).getTime(), new Date(ev.end).getTime()] as Intervalo));
    const transcurrido = intersectar(agendado, [[inicioHoy, ahoraMs]]);
    const enJornada = intersectar(transcurrido, (jor.get(uid) || []).filter(([, b]) => b > inicioHoy));
    const cuenta = sumarSeg(restar(enJornada, timer.get(uid) || []));
    out.set(uid, {
      conectado: true, eventos, ahora,
      hoy_seg: Math.round(sumarSeg(agendado)),
      hasta_ahora_seg: Math.round(cuenta),
      fuera_jornada_seg: Math.round(Math.max(0, sumarSeg(transcurrido) - sumarSeg(enJornada))),
    });
  }));
  return out;
}

export interface ReunionContada { summary: string; seg: number }
export interface ReunionesRango {
  porPersona: Map<string, ReunionContada[]>;  // solo quienes se pudieron leer
  sinAcceso: Map<string, string>;             // user_id → motivo
  sinConectar: string[];                      // nunca conectaron Google
}
/**
 * Reuniones que cuentan entre dos instantes, evento por evento (para repartirlas
 * por marca). Cada segundo se asigna a una sola reunión: si dos se pisan, el
 * tramo compartido va a la que empezó antes.
 */
export async function reunionesEntre(userIds: string[], desdeMs: number, hastaMs: number): Promise<ReunionesRango> {
  const res: ReunionesRango = { porPersona: new Map(), sinAcceso: new Map(), sinConectar: [] };
  if (!userIds.length) return res;
  const conectados = await conGoogle(userIds);
  res.sinConectar = userIds.filter((u) => !conectados.has(u));
  const ids = userIds.filter((u) => conectados.has(u));
  const fin = Math.min(hastaMs, Date.now());
  if (fin <= desdeMs) return res;
  const [jor, timer] = await Promise.all([jornadas(ids, desdeMs), tiempoConTimer(ids, desdeMs)]);
  // Meses cerrados casi no cambian: caché de 1 h; el rango que incluye hoy, 10 min
  const ttl = hastaMs < Date.now() ? 3600_000 : 10 * 60 * 1000;
  const timeMin = new Date(desdeMs).toISOString(), timeMax = new Date(hastaMs).toISOString();
  await Promise.all(ids.map(async (uid) => {
    const eventos = await leerReuniones(uid, timeMin, timeMax, ttl, 2500, 12 * 60);
    if (!eventos) { res.sinAcceso.set(uid, motivoSinAcceso(uid) || 'sin acceso al calendario'); return; }
    const validos = intersectar(jor.get(uid) || [], [[desdeMs, fin]]);
    const sinTimer = restar(validos, timer.get(uid) || []);
    let ocupado: Intervalo[] = [];
    const lista: ReunionContada[] = [];
    for (const ev of [...eventos].sort((a, b) => a.start.localeCompare(b.start))) {
      const iv = restar(intersectar([[new Date(ev.start).getTime(), new Date(ev.end).getTime()]], sinTimer), ocupado);
      const seg = sumarSeg(iv);
      if (seg <= 0) continue;
      ocupado = unir([...ocupado, ...iv]);
      lista.push({ summary: ev.summary, seg });
    }
    res.porPersona.set(uid, lista);
  }));
  return res;
}

// Ingreso tarde: primer ingreso del día después de `asistencia_hora_limite`
// (site_settings, HH:MM hora Ecuador; por defecto 09:15).
export async function horaLimiteIngreso(): Promise<string> {
  const row = await query<{ value: string }[]>("SELECT value FROM site_settings WHERE `key` = 'asistencia_hora_limite'");
  const v = row[0]?.value?.trim();
  return v && /^\d{1,2}:\d{2}$/.test(v) ? v : '09:15';
}
export function esIngresoTarde(checkIn: Date | string | null | undefined, limite: string): boolean {
  if (!checkIn) return false;
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(checkIn));
  const min = (Number(p.find((x) => x.type === 'hour')?.value || 0) % 24) * 60 + Number(p.find((x) => x.type === 'minute')?.value || 0);
  const [h, m] = limite.split(':').map(Number);
  return min > (h || 0) * 60 + (m || 0);
}
