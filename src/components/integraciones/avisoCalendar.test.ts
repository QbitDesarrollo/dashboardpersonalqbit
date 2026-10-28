import { describe, expect, it } from 'vitest';
import { avisoCalendarOculto, ocultarAvisoCalendar } from './avisoCalendar';

function almacenamiento() {
  const datos = new Map<string, string>();
  return { getItem: (key: string) => datos.get(key) ?? null, setItem: (key: string, value: string) => { datos.set(key, value); } };
}

describe('posponer el aviso de Calendar', () => {
  it('empieza visible y lo oculta exactamente siete días', () => {
    const storage = almacenamiento();
    const ahora = 1_800_000_000_000;
    expect(avisoCalendarOculto(ahora, storage)).toBe(false);
    ocultarAvisoCalendar(ahora, storage);
    expect(avisoCalendarOculto(ahora, storage)).toBe(true);
    expect(avisoCalendarOculto(ahora + 7 * 86400000 - 1, storage)).toBe(true);
    expect(avisoCalendarOculto(ahora + 7 * 86400000, storage)).toBe(false);
    expect(avisoCalendarOculto(ahora + 8 * 86400000, storage)).toBe(false);
  });

  it('tolera almacenamiento corrupto o no disponible', () => {
    expect(avisoCalendarOculto(1, { getItem: () => 'invalid' })).toBe(false);
    const storage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(avisoCalendarOculto(1, storage)).toBe(false);
    expect(() => ocultarAvisoCalendar(1, storage)).not.toThrow();
  });
});
