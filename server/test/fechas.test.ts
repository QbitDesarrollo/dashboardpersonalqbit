import { describe, it, expect } from 'vitest';
import { fechaDeColumna, fechaSql, hoyEcuador } from '../src/utils/fechas.js';

describe('fechas de Ecuador', () => {
  it('hoy es la fecha de Ecuador aunque en UTC ya sea mañana', () => {
    expect(hoyEcuador(new Date('2026-10-10T01:00:00Z'))).toBe('2026-10-09');
    expect(hoyEcuador(new Date('2026-10-10T05:00:00Z'))).toBe('2026-10-10');
  });

  it('solo convierte a SQL una fecha YYYY-MM-DD; cualquier otra cosa se rechaza', () => {
    expect(fechaSql('2026-10-09')).toBe("'2026-10-09'");
    for (const malo of ["2026-10-09' OR '1'='1", '2026-10-9', '', 'hoy']) expect(() => fechaSql(malo), malo).toThrow();
  });

  it('lee una columna DATE de mysql2 (Date a medianoche UTC) o un texto', () => {
    expect(fechaDeColumna(new Date('2026-10-02T00:00:00Z'))).toBe('2026-10-02');
    expect(fechaDeColumna('2026-10-02')).toBe('2026-10-02');
    expect(fechaDeColumna(null)).toBeNull();
  });
});

describe('fin del día límite en Ecuador', () => {
  it('una entrega a las 19:41 de Ecuador del día límite es a tiempo, aunque en UTC ya sea el día siguiente', async () => {
    const { finDelDiaEcuador } = await import('../src/utils/fechas.js');
    const limite = finDelDiaEcuador(new Date('2026-10-27T00:00:00Z'));
    expect(new Date('2026-10-28T00:41:16Z') <= limite!).toBe(true);
    expect(new Date('2026-10-28T05:00:00Z') <= limite!).toBe(false);
    expect(limite!.toISOString()).toBe('2026-10-28T04:59:59.999Z');
  });

  it('acepta la fecha como texto y sin fecha devuelve null', async () => {
    const { finDelDiaEcuador } = await import('../src/utils/fechas.js');
    expect(finDelDiaEcuador('2026-10-27')!.toISOString()).toBe('2026-10-28T04:59:59.999Z');
    expect(finDelDiaEcuador(null)).toBeNull();
  });
});
