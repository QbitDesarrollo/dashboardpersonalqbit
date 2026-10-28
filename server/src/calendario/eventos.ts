import type { calendar_v3 } from 'googleapis';

// Clasificación de los eventos de Google Calendar. Una sola regla para todo
// Tiusdei: la franja de Tareas, el dashboard y el monitor de equipo cuentan
// como reunión exactamente lo mismo (ver services/meetingsNow.ts).

const PREFIJO_TAREA = '[Tiusdei]';

/** Los eventos "[Tiusdei] ..." son tareas que Tiusdei sincroniza al calendario, no reuniones. */
export function esTareaTiusdei(summary: string | null | undefined): boolean {
  return (summary || '').startsWith(PREFIJO_TAREA);
}

/**
 * ¿El evento es una reunión de verdad para la persona dueña del calendario?
 * Con hora (no de día completo), no cancelado, no marcado "disponible", no es una
 * tarea de Tiusdei, con al menos otro invitado o con link de videollamada, y que
 * la persona organizó, aceptó o marcó "quizás".
 */
export function esReunionReal(ev: calendar_v3.Schema$Event): boolean {
  if (ev.status === 'cancelled' || ev.transparency === 'transparent') return false;
  if (esTareaTiusdei(ev.summary)) return false;
  if (!ev.start?.dateTime || !ev.end?.dateTime) return false;
  const invitados = ev.attendees || [];
  const otros = invitados.filter((a) => !a.self && !a.resource).length;
  const conLink = !!(ev.hangoutLink || ev.conferenceData);
  if (otros === 0 && !conLink) return false;
  const yo = invitados.find((a) => a.self);
  if (yo && !yo.organizer && yo.responseStatus !== 'accepted' && yo.responseStatus !== 'tentative') return false;
  return true;
}

export type Plataforma = 'meet' | 'zoom' | 'teams' | 'otro';
export interface EnlaceReunion { url: string; plataforma: Plataforma }

const LINKS_CONOCIDOS: { patron: RegExp; plataforma: Plataforma }[] = [
  { patron: /https:\/\/meet\.google\.com\/[a-z0-9-]+/i, plataforma: 'meet' },
  { patron: /https:\/\/[a-z0-9.-]*zoom\.us\/(?:j|my|w)\/[^\s"'<>]+/i, plataforma: 'zoom' },
  { patron: /https:\/\/teams\.(?:microsoft|live)\.com\/[^\s"'<>]+/i, plataforma: 'teams' },
];

function plataformaDe(url: string): Plataforma {
  return LINKS_CONOCIDOS.find((l) => l.patron.test(url))?.plataforma ?? 'otro';
}

/**
 * Enlace para entrar a la videollamada del evento: el Meet del evento, el punto de
 * entrada de video de la conferencia (Zoom/Teams instalados en Calendar) o un link
 * conocido pegado en la ubicación o la descripción. Sin videollamada: null.
 */
export function enlaceDeReunion(ev: calendar_v3.Schema$Event): EnlaceReunion | null {
  if (ev.hangoutLink) return { url: ev.hangoutLink, plataforma: 'meet' };
  const video = ev.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video' && p.uri);
  if (video?.uri) return { url: video.uri, plataforma: plataformaDe(video.uri) };
  for (const texto of [ev.location || '', ev.description || '']) {
    for (const { patron, plataforma } of LINKS_CONOCIDOS) {
      const m = texto.match(patron);
      if (m) return { url: m[0], plataforma };
    }
  }
  return null;
}

export interface EventoCalendario {
  id: string | null | undefined;
  summary: string;
  description: string;
  start: string;
  end: string;
  htmlLink: string;
  status: string | null | undefined;
  es_tarea_tiusdei: boolean;
  es_reunion: boolean;
  enlace: EnlaceReunion | null;
  ubicacion: string;
}

/** Forma en que la API entrega cada evento al frontend. */
export function aEventoCalendario(ev: calendar_v3.Schema$Event): EventoCalendario {
  return {
    id: ev.id,
    summary: ev.summary || '(Sin titulo)',
    description: ev.description || '',
    start: ev.start?.dateTime || ev.start?.date || '',
    end: ev.end?.dateTime || ev.end?.date || '',
    htmlLink: ev.htmlLink || '',
    status: ev.status,
    es_tarea_tiusdei: esTareaTiusdei(ev.summary),
    es_reunion: esReunionReal(ev),
    enlace: enlaceDeReunion(ev),
    ubicacion: ev.location || '',
  };
}
