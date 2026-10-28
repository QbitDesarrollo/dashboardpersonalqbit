import { describe, expect, it } from 'vitest';
import type { calendar_v3 } from 'googleapis';
import { aEventoCalendario, esReunionReal, esTareaTiusdei } from '../src/calendario/eventos.js';

const reunion = (extra: Partial<calendar_v3.Schema$Event> = {}): calendar_v3.Schema$Event => ({
  id: 'ev1',
  summary: 'Revisión de avance con Dinatek',
  status: 'confirmed',
  htmlLink: 'https://calendar.google.com/event?eid=ev1',
  start: { dateTime: '2026-10-27T10:30:00-05:00' },
  end: { dateTime: '2026-10-27T11:30:00-05:00' },
  attendees: [{ email: 'yo@qbit.com.ec', self: true, responseStatus: 'accepted' }, { email: 'cliente@dinatek.com' }],
  ...extra,
});

describe('eventos del calendario · tareas de Tiusdei', () => {
  it('un evento "[Tiusdei] ..." es una tarea sincronizada, nunca una reunión', () => {
    const tarea = reunion({ summary: '[Tiusdei] Ajustes landing campaña' });
    expect(esTareaTiusdei(tarea.summary)).toBe(true);
    expect(esReunionReal(tarea)).toBe(false);
    expect(aEventoCalendario(tarea)).toMatchObject({ es_tarea_tiusdei: true, es_reunion: false });
  });

  it('una reunión aceptada con otro invitado sí cuenta y conserva los datos de siempre', () => {
    expect(aEventoCalendario(reunion())).toEqual({
      id: 'ev1',
      summary: 'Revisión de avance con Dinatek',
      description: '',
      start: '2026-10-27T10:30:00-05:00',
      end: '2026-10-27T11:30:00-05:00',
      htmlLink: 'https://calendar.google.com/event?eid=ev1',
      status: 'confirmed',
      es_tarea_tiusdei: false,
      es_reunion: true,
    });
  });

  it('aplica las mismas reglas que el monitor: cancelada, disponible, día completo, sin invitados ni link, o sin responder no cuentan', () => {
    expect(esReunionReal(reunion({ status: 'cancelled' }))).toBe(false);
    expect(esReunionReal(reunion({ transparency: 'transparent' }))).toBe(false);
    expect(esReunionReal(reunion({ start: { date: '2026-10-27' }, end: { date: '2026-10-28' } }))).toBe(false);
    expect(esReunionReal(reunion({ attendees: [] }))).toBe(false);
    expect(esReunionReal(reunion({ attendees: [], hangoutLink: 'https://meet.google.com/abc-defg-hij' }))).toBe(true);
    expect(esReunionReal(reunion({ attendees: [{ self: true, responseStatus: 'needsAction' }, { email: 'x@y.com' }] }))).toBe(false);
    expect(esReunionReal(reunion({ attendees: [{ self: true, responseStatus: 'tentative' }, { email: 'x@y.com' }] }))).toBe(true);
  });
});
