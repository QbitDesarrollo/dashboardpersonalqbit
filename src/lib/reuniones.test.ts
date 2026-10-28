import { describe, it, expect } from 'vitest';
import { estadoReunion, etiquetaRelativa, minutosTranscurridos, progresoReunion, duracionTotal, leerIngreso, registrarIngreso, fechaReunion } from './reuniones';

const inicio = Date.parse('2026-10-27T15:00:00Z');
const reunion = { id: 'r1', start: new Date(inicio).toISOString(), end: new Date(inicio + 3600000).toISOString() };

describe('reuniones · reglas puras', () => {
  it('incluye el inicio y excluye el final del estado en curso', () => {
    expect(estadoReunion(reunion, inicio - 1)).toBe('proxima');
    expect(estadoReunion(reunion, inicio)).toBe('en_curso');
    expect(estadoReunion(reunion, inicio + 3599999)).toBe('en_curso');
    expect(estadoReunion(reunion, inicio + 3600000)).toBe('terminada');
  });
  it('formatea minutos y horas sin perder el límite de 59 minutos', () => {
    for (const [minutos, label] of [[25, 'en 25 min'], [59, 'en 59 min'], [60, 'en 1h 0m'], [220, 'en 3h 40m']] as const) {
      expect(etiquetaRelativa(reunion.start, inicio - minutos * 60000)).toBe(label);
    }
  });
  it('limita minutos y progreso al intervalo de la reunión', () => {
    expect(minutosTranscurridos(reunion.start, inicio - 1)).toBe(0);
    expect(minutosTranscurridos(reunion.start, inicio + 59999)).toBe(0);
    expect(minutosTranscurridos(reunion.start, inicio + 60000)).toBe(1);
    expect(progresoReunion(reunion, inicio - 1)).toBe(0);
    expect(progresoReunion(reunion, inicio + 1800000)).toBe(0.5);
    expect(progresoReunion(reunion, inicio + 7200000)).toBe(1);
    expect(progresoReunion({ ...reunion, end: reunion.start }, inicio)).toBe(0);
  });
  it('suma las duraciones, incluso cuando las reuniones se superponen', () => {
    expect(duracionTotal([])).toBe('0h 0m');
    expect(duracionTotal([reunion, { ...reunion, end: new Date(inicio + 1500000).toISOString() }])).toBe('1h 25m');
  });
  it('registra el primer ingreso por evento y fecha de Ecuador sin mezclar días', () => {
    const datos = new Map<string, string>();
    const storage = { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, v); } };
    expect(fechaReunion('2026-10-28T02:00:00Z')).toBe('2026-10-27');
    expect(leerIngreso(storage, reunion)).toBeNull();
    registrarIngreso(storage, reunion, inicio);
    registrarIngreso(storage, reunion, inicio + 60000);
    expect(leerIngreso(storage, reunion)).toBe(inicio);
    expect(leerIngreso(storage, { ...reunion, id: 'r2' })).toBeNull();
    expect(leerIngreso(storage, { ...reunion, start: '2026-10-28T15:00:00Z' })).toBeNull();
  });
  it('tolera almacenamiento bloqueado o inválido', () => {
    const storage = { getItem: () => 'invalid', setItem: () => { throw new Error('blocked'); } };
    expect(leerIngreso(storage, reunion)).toBeNull();
    expect(() => registrarIngreso(storage, reunion, inicio)).not.toThrow();
  });
});
