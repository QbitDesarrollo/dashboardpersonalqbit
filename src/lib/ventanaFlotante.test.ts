import { beforeEach, describe, expect, it } from 'vitest';
import { soportada, leerPreferencia, guardarPreferencia, limitarTamano, leerTamano, guardarTamano, entregaFlotante, subtareaLista } from './ventanaFlotante';

beforeEach(() => localStorage.clear());
describe('ventana flotante', () => {
  it('uses Ecuador dates for delivery and existing done states for subtasks', () => {
    expect(entregaFlotante('2026-10-27 17:00:00', Date.parse('2026-10-28T01:00:00Z'))).toBe('Entrega hoy 17:00');
    expect(entregaFlotante('2026-10-27', Date.parse('2026-10-27T15:00:00Z'))).toBe('Entrega hoy');
    expect(subtareaLista({ estado: 'aprobado' })).toBe(true);
    expect(subtareaLista({ estado: 'entregado' })).toBe(true);
    expect(subtareaLista({ check_done: true })).toBe(true);
    expect(subtareaLista({ estado: 'en_proceso' })).toBe(false);
  });
  it('requires the API and a top-level window', () => {
    expect(soportada(window)).toBe(false);
    const top = {};
    expect(soportada({ self: top, top, documentPictureInPicture: {} })).toBe(true);
    expect(soportada({ self: {}, top, documentPictureInPicture: {} })).toBe(false);
  });
  it('defaults ON and persists both choices', () => {
    expect(leerPreferencia(localStorage)).toBe(true);
    guardarPreferencia(localStorage, false);
    expect(leerPreferencia(localStorage)).toBe(false);
    guardarPreferencia(localStorage, true);
    expect(leerPreferencia(localStorage)).toBe(true);
  });
  it('clamps and remembers window dimensions, tolerating invalid storage', () => {
    expect(limitarTamano({ width: 1, height: 999 })).toEqual({ width: 300, height: 520 });
    expect(limitarTamano({ width: 999, height: 1 })).toEqual({ width: 520, height: 220 });
    expect(limitarTamano({ width: NaN, height: Infinity })).toEqual({ width: 360, height: 380 });
    guardarTamano(localStorage, { width: 410, height: 300 });
    expect(leerTamano(localStorage)).toEqual({ width: 410, height: 300 });
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(leerPreferencia(blocked)).toBe(true);
    expect(leerTamano(blocked)).toEqual({ width: 360, height: 380 });
    expect(() => guardarPreferencia(blocked, false)).not.toThrow();
  });
});
