import { describe, expect, it } from 'vitest';
import { confirmadoHasta, debePreguntarCierre, guardarConfirmacion, GRACIA_MS } from './guardianTimer';

const crearStorage = () => {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => { datos.set(k, v); },
    removeItem: (k: string) => { datos.delete(k); },
  };
};

const HORA = 3600_000;
const ahora = Date.parse('2026-10-28T03:00:00Z'); // 22:00 en Ecuador

describe('debePreguntarCierre', () => {
  it('no pregunta si el timer se acaba de iniciar, aunque ya pasó la hora de cierre', () => {
    const inicio = new Date(ahora - 16_000).toISOString();
    expect(debePreguntarCierre({ eod: true, inicio, confirmadoHasta: 0, ahora })).toBe(false);
  });

  it('pregunta cuando el timer lleva 3 horas o más y ya pasó la hora de cierre', () => {
    const inicio = new Date(ahora - GRACIA_MS).toISOString();
    expect(debePreguntarCierre({ eod: true, inicio, confirmadoHasta: 0, ahora })).toBe(true);
    expect(debePreguntarCierre({ eod: true, inicio: new Date(ahora - 6 * HORA).toISOString(), confirmadoHasta: 0, ahora })).toBe(true);
  });

  it('no pregunta antes de la hora de cierre ni mientras dura la confirmación', () => {
    const inicio = new Date(ahora - 6 * HORA).toISOString();
    expect(debePreguntarCierre({ eod: false, inicio, confirmadoHasta: 0, ahora })).toBe(false);
    expect(debePreguntarCierre({ eod: true, inicio, confirmadoHasta: ahora + 1, ahora })).toBe(false);
  });

  it('sin hora de inicio conocida se comporta como antes', () => {
    expect(debePreguntarCierre({ eod: true, inicio: null, confirmadoHasta: 0, ahora })).toBe(true);
  });
});

describe('confirmación compartida por sesión', () => {
  it('se recuerda por sesión del timer y no vale para otra sesión', () => {
    const s = crearStorage();
    guardarConfirmacion(s, 'ses-1', ahora + 3 * HORA);
    expect(confirmadoHasta(s, 'ses-1')).toBe(ahora + 3 * HORA);
    expect(confirmadoHasta(s, 'ses-2')).toBe(0);
  });

  it('sin almacenamiento disponible no falla', () => {
    const roto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); }, removeItem: () => {} };
    expect(() => guardarConfirmacion(roto, 'ses-1', 1)).not.toThrow();
    expect(confirmadoHasta(roto, 'ses-1')).toBe(0);
  });
});
