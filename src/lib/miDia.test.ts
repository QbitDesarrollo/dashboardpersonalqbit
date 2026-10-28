import { describe, expect, it } from 'vitest';
import { duracionDia, horaDia, estadoResponsable } from './miDia';

describe('Mi día · presentación', () => {
  it('formatea segundos sin negativos y muestra el ingreso en Ecuador', () => {
    expect(duracionDia(3900)).toBe('1h 5m'); expect(duracionDia(-1)).toBe('0h 0m');
    expect(horaDia(null)).toBe('Sin ingreso'); expect(horaDia('2026-10-02T14:15:00Z')).toBe('09:15');
  });
  it('da prioridad a la reunión, respeta el timer activo y no inventa ausencia', () => {
    expect(estadoResponsable({ user_id: 'a', meeting_now: { summary: 'Planificación' } })).toBe('En reunión · Planificación');
    expect(estadoResponsable({ user_id: 'a', session_status: 'active', titulo_tarea: 'Diseño' })).toBe('Trabajando · Diseño');
    expect(estadoResponsable({ user_id: 'a', first_check_in: null })).toBe('Sin ingreso hoy');
    expect(estadoResponsable({ user_id: 'a', first_check_in: '2026-10-02T13:00Z', session_status: 'paused' })).toBeNull();
    expect(estadoResponsable(undefined)).toBeNull();
  });
});
