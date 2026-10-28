import { describe, expect, it } from 'vitest';
import type { calendar_v3 } from 'googleapis';
import { aEventoCalendario, enlaceDeReunion, esReunionReal, esReunionVisible, esTareaTiusdei } from '../src/calendario/eventos.js';

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
      enlace: null,
      ubicacion: '',
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

describe('eventos del calendario · enlace para entrar', () => {
  it('usa el link de Meet del evento', () => {
    expect(enlaceDeReunion(reunion({ hangoutLink: 'https://meet.google.com/abc-defg-hij' })))
      .toEqual({ url: 'https://meet.google.com/abc-defg-hij', plataforma: 'meet' });
  });

  it('usa el punto de entrada de video de la conferencia (Zoom o Teams instalados en Calendar)', () => {
    const ev = reunion({
      conferenceData: {
        conferenceSolution: { name: 'Zoom Meeting' },
        entryPoints: [
          { entryPointType: 'phone', uri: 'tel:+1-555-0100' },
          { entryPointType: 'video', uri: 'https://us02web.zoom.us/j/81234567890?pwd=abc' },
        ],
      },
    });
    expect(enlaceDeReunion(ev)).toEqual({ url: 'https://us02web.zoom.us/j/81234567890?pwd=abc', plataforma: 'zoom' });
  });

  it('encuentra un link de Zoom, Teams o Meet pegado en la ubicación o en la descripción', () => {
    expect(enlaceDeReunion(reunion({ location: 'https://zoom.us/j/99887766554' })))
      .toEqual({ url: 'https://zoom.us/j/99887766554', plataforma: 'zoom' });
    expect(enlaceDeReunion(reunion({ description: 'Únete aquí: <a href="https://teams.microsoft.com/l/meetup-join/19%3ameeting_x">Teams</a>' })))
      .toEqual({ url: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x', plataforma: 'teams' });
  });

  it('sin videollamada no inventa enlace y entrega la ubicación', () => {
    const ev = reunion({ location: 'Oficina Qbit, sala 2' });
    expect(enlaceDeReunion(ev)).toBeNull();
    expect(aEventoCalendario(ev)).toMatchObject({ enlace: null, ubicacion: 'Oficina Qbit, sala 2' });
  });

  it('la API entrega el enlace junto al evento', () => {
    expect(aEventoCalendario(reunion({ hangoutLink: 'https://meet.google.com/abc-defg-hij' })).enlace)
      .toEqual({ url: 'https://meet.google.com/abc-defg-hij', plataforma: 'meet' });
  });
});

describe('eventos del calendario · reuniones que ve la persona', () => {
  const sinResponder = reunion({
    hangoutLink: 'https://meet.google.com/abc-defg-hij',
    attendees: [{ email: 'yo@qbit.com.ec', self: true, responseStatus: 'needsAction' }, { email: 'equipo@qbit.com.ec' }],
  });

  it('muestra las invitaciones que todavía no respondió (el monitor no las cuenta como horas)', () => {
    expect(esReunionVisible(sinResponder)).toBe(true);
    expect(esReunionReal(sinResponder)).toBe(false);
    expect(aEventoCalendario(sinResponder).es_reunion).toBe(true);
  });

  it('no muestra las que rechazó, las tareas de Tiusdei ni los bloqueos personales', () => {
    expect(esReunionVisible(reunion({ attendees: [{ self: true, responseStatus: 'declined' }, { email: 'x@y.com' }] }))).toBe(false);
    expect(esReunionVisible(reunion({ summary: '[Tiusdei] Tarea', hangoutLink: 'https://meet.google.com/abc-defg-hij' }))).toBe(false);
    expect(esReunionVisible(reunion({ summary: 'Hora de almorzar', attendees: [] }))).toBe(false);
    expect(esReunionVisible(reunion({ status: 'cancelled' }))).toBe(false);
  });
});
