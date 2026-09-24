import { google } from 'googleapis';
import { query } from '../db/mysql.js';
import { getAuthedClient } from '../utils/googleAuth.js';

// Reuniones de hoy de cada persona, leídas de su Google Calendar (si lo tiene
// conectado). Sirve para que el monitor y las vistas de equipo muestren
// "En reunión: X" y sumen las reuniones a la utilización del día. Los eventos
// se cachean 2 minutos por persona para no golpear la API de Google en cada
// refresco (el monitor consulta cada 30 s y las vistas de equipo cada 60 s).

export interface EventoHoy { summary: string; start: string; end: string; duration_min: number }
export interface ReunionesUsuario {
  conectado: boolean;
  eventos: EventoHoy[];
  ahora: EventoHoy | null;      // evento en curso en este momento
  hoy_seg: number;              // total agendado del día (pasadas + futuras)
  hasta_ahora_seg: number;      // lo que CUENTA: transcurrido y dentro de la jornada marcada
  fuera_jornada_seg: number;    // transcurrido pero antes del ingreso, después de la salida o en almuerzo
}

// Las reuniones solo cuentan como trabajo dentro de la jornada marcada en
// Asistencia (del ingreso a la salida, sin el almuerzo). Así, quien marca
// ingreso a las 16:20 no suma las reuniones de la mañana y su utilización no
// sale inflada; y las reuniones que se pisan entre sí se cuentan una sola vez.
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

const TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { at: number; eventos: EventoHoy[] }>();
const TZ = 'America/Guayaquil';

function ventanaHoy(): { timeMin: string; timeMax: string } {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  return { timeMin: new Date(`${hoy}T00:00:00-05:00`).toISOString(), timeMax: new Date(`${hoy}T23:59:59-05:00`).toISOString() };
}

async function eventosDe(userId: string): Promise<EventoHoy[] | null> {
  const c = cache.get(userId);
  if (c && Date.now() - c.at < TTL_MS) return c.eventos;
  const client = await getAuthedClient(userId);
  if (!client) return null;
  const { timeMin, timeMax } = ventanaHoy();
  try {
    const cal = google.calendar({ version: 'v3', auth: client });
    const resp = await cal.events.list({ calendarId: 'primary', timeMin, timeMax, maxResults: 100, singleEvents: true, orderBy: 'startTime' });
    const eventos: EventoHoy[] = [];
    for (const ev of resp.data.items || []) {
      if (ev.status === 'cancelled') continue;
      if (ev.transparency === 'transparent') continue; // marcado como "disponible"
      // Las tareas que Tiusdei sincroniza al calendario no son reuniones
      if ((ev.summary || '').startsWith('[Tiusdei]')) continue;
      const yo = (ev.attendees || []).find((a) => a.self);
      if (yo && yo.responseStatus === 'declined') continue;
      const s = ev.start?.dateTime, e = ev.end?.dateTime;
      if (!s || !e) continue; // eventos de día completo no cuentan
      const dur = Math.round((new Date(e).getTime() - new Date(s).getTime()) / 60000);
      if (dur <= 0) continue;
      eventos.push({ summary: ev.summary || '(Sin título)', start: s, end: e, duration_min: dur });
    }
    cache.set(userId, { at: Date.now(), eventos });
    return eventos;
  } catch (e) {
    console.error(`[REUNIONES] ${userId}:`, (e as Error).message);
    // Si Google falla, usar lo último que teníamos (aunque esté vencido) para no parpadear
    return c?.eventos ?? [];
  }
}

// Reuniones de los últimos N días, en segundos por día (calendario Ecuador), para
// sumarlas a las horas trabajadas (hoy, semana, 30 días, ritmo). Caché de 10 min.
const cacheRango = new Map<string, { at: number; eventos: EventoHoy[] }>();
const TTL_RANGO_MS = 10 * 60 * 1000;
const diaEcuador = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));

async function eventosRango(userId: string, dias: number): Promise<EventoHoy[] | null> {
  const key = `${userId}:${dias}`;
  const c = cacheRango.get(key);
  if (c && Date.now() - c.at < TTL_RANGO_MS) return c.eventos;
  const client = await getAuthedClient(userId);
  if (!client) return null;
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const desde = new Date(`${hoy}T00:00:00-05:00`); desde.setUTCDate(desde.getUTCDate() - dias);
  try {
    const cal = google.calendar({ version: 'v3', auth: client });
    const resp = await cal.events.list({ calendarId: 'primary', timeMin: desde.toISOString(), timeMax: new Date(`${hoy}T23:59:59-05:00`).toISOString(), maxResults: 2500, singleEvents: true, orderBy: 'startTime' });
    const eventos: EventoHoy[] = [];
    for (const ev of resp.data.items || []) {
      if (ev.status === 'cancelled' || ev.transparency === 'transparent') continue;
      if ((ev.summary || '').startsWith('[Tiusdei]')) continue;
      const yo = (ev.attendees || []).find((a) => a.self);
      if (yo && yo.responseStatus === 'declined') continue;
      const s = ev.start?.dateTime, e = ev.end?.dateTime;
      if (!s || !e) continue;
      const dur = Math.round((new Date(e).getTime() - new Date(s).getTime()) / 60000);
      if (dur <= 0 || dur > 12 * 60) continue; // eventos de más de 12 h no son reuniones
      eventos.push({ summary: ev.summary || '(Sin título)', start: s, end: e, duration_min: dur });
    }
    cacheRango.set(key, { at: Date.now(), eventos });
    return eventos;
  } catch (e) {
    console.error(`[REUNIONES rango] ${userId}:`, (e as Error).message);
    return c?.eventos ?? [];
  }
}

export async function reunionesPorDia(userIds: string[], dias: number): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  if (!userIds.length) return out;
  const ph = userIds.map(() => '?').join(',');
  const tokens = await query<{ user_id: string }[]>(`SELECT user_id FROM google_tokens WHERE user_id IN (${ph})`, userIds);
  const conectados = new Set(tokens.map((t) => t.user_id));
  const ahoraMs = Date.now();
  const jor = await jornadas(userIds.filter((u) => conectados.has(u)), ahoraMs - (dias + 1) * 86400000);
  await Promise.all(userIds.map(async (uid) => {
    if (!conectados.has(uid)) return;
    const eventos = await eventosRango(uid, dias);
    if (!eventos) return;
    // Transcurridas, sin duplicar las que se pisan, y solo dentro de la jornada marcada
    const reun = unir(eventos.map((ev) => [new Date(ev.start).getTime(), Math.min(new Date(ev.end).getTime(), ahoraMs)] as Intervalo));
    const cuentan = intersectar(reun, jor.get(uid) || []);
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
  const ph = userIds.map(() => '?').join(',');
  const tokens = await query<{ user_id: string }[]>(`SELECT user_id FROM google_tokens WHERE user_id IN (${ph})`, userIds);
  const conectados = new Set(tokens.map((t) => t.user_id));
  const ahoraMs = Date.now();
  const inicioHoy = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())}T00:00:00-05:00`).getTime();
  const jor = await jornadas(userIds.filter((u) => conectados.has(u)), inicioHoy);
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
    const cuenta = sumarSeg(intersectar(transcurrido, (jor.get(uid) || []).filter(([, b]) => b > inicioHoy)));
    out.set(uid, {
      conectado: true, eventos, ahora,
      hoy_seg: Math.round(sumarSeg(agendado)),
      hasta_ahora_seg: Math.round(cuenta),
      fuera_jornada_seg: Math.round(Math.max(0, sumarSeg(transcurrido) - cuenta)),
    });
  }));
  return out;
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
