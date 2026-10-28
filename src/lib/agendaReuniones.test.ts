import { describe, expect, it } from 'vitest';
import { agruparPorDia, etiquetaDia, etiquetaPeriodo, celdasMes, siguienteReunion, sumarDias } from './agendaReuniones';
import { calendarioReuniones, type Reunion } from './reuniones';

const reunion = (id: string, start: string): Reunion => ({ id, summary: id, start, end: start, htmlLink: '', es_reunion: true });
const now = Date.parse('2026-10-27T15:00:00Z');

describe('agenda de reuniones · días civiles de Ecuador', () => {
  it('agrupa y ordena días y horas al cruzar medianoche UTC y Ecuador', () => {
    const a = reunion('a', '2026-10-28T04:59:59Z');
    const b = reunion('b', '2026-10-28T05:00:00Z');
    const c = reunion('c', '2026-10-27T15:00:00Z');
    expect(agruparPorDia([b, a, c])).toEqual([{ dia: '2026-10-27', reuniones: [c, a] }, { dia: '2026-10-28', reuniones: [b] }]);
    expect(agruparPorDia([])).toEqual([]);
  });
  it('etiqueta Hoy, Mañana y los demás días sin depender de la zona local', () => {
    expect(etiquetaDia('2026-10-27', now)).toBe('Hoy · mar 27 oct');
    expect(etiquetaDia('2026-10-28', now)).toBe('Mañana · mié 28 oct');
    expect(etiquetaDia('2026-10-29', now)).toBe('jue 29 oct');
    expect(etiquetaDia('2026-10-27', Date.parse('2026-10-28T04:59:59Z'))).toBe('Hoy · mar 27 oct');
    expect(etiquetaDia('2026-10-28', Date.parse('2026-10-28T05:00:00Z'))).toBe('Hoy · mié 28 oct');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('conserva la semana domingo–sábado en ambos lados del lunes', () => {
    for (const dia of ['2026-10-25', '2026-10-26']) {
      const rango = calendarioReuniones(Date.parse(`${dia}T12:00:00-05:00`), 'Semana');
      expect(rango.inicio.slice(0, 10)).toBe('2026-10-25');
      expect(etiquetaPeriodo(rango.inicio, rango.fin, 'Semana')).toBe('25 – 31 oct');
    }
    expect(etiquetaPeriodo('2026-10-28', '2026-11-03', 'Semana')).toBe('28 oct – 3 nov');
    expect(etiquetaPeriodo('2026-12-28', '2027-01-03', 'Semana')).toBe('28 dic 2026 – 3 ene 2027');
    expect(etiquetaPeriodo('2026-10-01', '2026-10-31', 'Mes')).toBe('octubre 2026');
  });
  it('crea celdas pequeñas de lunes a domingo con blancos a ambos lados', () => {
    const noviembre = celdasMes('2026-11-01');
    expect(noviembre).toHaveLength(42);
    expect(noviembre.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(noviembre.slice(-6)).toEqual(Array(6).fill(null));
    const febrero = celdasMes('2027-02-01');
    expect(febrero).toHaveLength(28);
    expect(febrero[0]).toBe('2027-02-01');
    expect(febrero[27]).toBe('2027-02-28');
  });
  it('busca la siguiente reunión futura de otro día sin mutar el orden', () => {
    const futuras = [reunion('tarde', '2026-10-29T15:00:00Z'), reunion('mañana', '2026-10-28T13:30:00Z'), reunion('hoy', '2026-10-27T18:00:00Z')];
    expect(siguienteReunion(futuras, now)?.id).toBe('mañana');
    expect(futuras[0].id).toBe('tarde');
    expect(siguienteReunion([], now)).toBeNull();
    expect(siguienteReunion([reunion('pasada', '2026-10-26T15:00:00Z')], now)).toBeNull();
    expect(siguienteReunion([reunion('medianoche', '2026-10-28T05:00:00Z')], Date.parse('2026-10-28T04:59:59Z'))?.id).toBe('medianoche');
  });
});
