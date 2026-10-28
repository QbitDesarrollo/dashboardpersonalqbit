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
  };
}
