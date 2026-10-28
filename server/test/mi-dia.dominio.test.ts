import { describe, expect, it } from 'vitest';
import { calcularDia, cumplimientoSemana, contarEntregas } from '../src/miDia/dominio.js';

const instante = (hora: string) => Date.parse(`2026-10-02T${hora}:00-05:00`);
const intervalo = (inicio: string, fin: string) => ({ start: instante(inicio), end: instante(fin) });
const base = { now: instante('10:00'), inicio: instante('08:00'), fin: instante('18:00'), ingreso: null, timers: [], reuniones: [], reunionesContadasSeg: 0, tareas: { completadas: 0, total: 0 } };

describe('Mi día · dominio sin base de datos', () => {
  it('sin ingreso no inventa trabajo; conserva la jornada y el marcador', () => {
    const dia = calcularDia(base);
    expect(dia.ingreso).toBeNull(); expect(dia.trabajadoSeg).toBe(0);
    expect(dia.jornadaSeg).toBe(36000); expect(dia.focoSeg).toBe(28800);
    expect(dia.ahora).toBe(20);
    expect(dia.segmentos.map(s => s.tipo)).toEqual(['libre', 'pendiente']);
  });
  it('une reuniones superpuestas y descuenta solo lo que falta de jornada', () => {
    const dia = calcularDia({ ...base, reuniones: [intervalo('09:00', '11:00'), intervalo('10:00', '12:00'), intervalo('17:00', '19:00')] });
    expect(dia.reuniones).toEqual({ total: 3, segundos: 18000, hechas: 0, enCurso: 2, porVenir: 1 });
    expect(dia.focoSeg).toBe(18000);
  });
  it('nunca muestra foco negativo antes o después de jornada', () => {
    expect(calcularDia({ ...base, reuniones: [intervalo('00:00', '23:59')] }).focoSeg).toBe(0);
    expect(calcularDia({ ...base, now: instante('20:00') }).focoSeg).toBe(0);
    expect(calcularDia({ ...base, now: instante('07:00') }).focoSeg).toBe(36000);
  });
  it('conserva tiempos guardados y añade reuniones ya contadas sin duplicarlos', () => {
    const dia = calcularDia({ ...base, ingreso: instante('08:00'), timers: [{ ...intervalo('08:00', '09:00'), segundos: 3300 }], reunionesContadasSeg: 1800 });
    expect(dia.trabajadoSeg).toBe(5100);
    expect(dia.segmentos[0].tipo).toBe('tareas');
  });
  it.each([[59, 'En riesgo'], [60, 'Atención'], [79, 'Atención'], [80, 'Vas bien']] as const)('clasifica %s%% sin cambiar los umbrales', (aTiempo, estado) => {
    expect(cumplimientoSemana(aTiempo, 100 - aTiempo, 50)).toEqual({ porcentaje: aTiempo, estado, delta: aTiempo - 50 });
  });
  it('redondea como el reporte (un decimal) y no inventa % sin entregas', () => {
    expect(cumplimientoSemana(2, 1, 60)).toEqual({ porcentaje: 66.7, estado: 'Atención', delta: 6.7 });
    expect(cumplimientoSemana(0, 0, null)).toEqual({ porcentaje: null, estado: 'Sin entregas', delta: null });
  });
});

describe('cumplimiento · día límite en hora de Ecuador', () => {
  it('una entrega a las 19:41 de Ecuador del día límite es a tiempo (en UTC ya es el día siguiente)', () => {
    expect(contarEntregas([{ estado: 'revision_interna', objetivo: '2026-10-27', entregada: new Date('2026-10-28T00:41:16Z') }]))
      .toEqual({ aTiempo: 1, tarde: 0 });
  });

  it('pasada la medianoche de Ecuador ya es tarde', () => {
    expect(contarEntregas([{ estado: 'entregado', objetivo: '2026-10-27', entregada: new Date('2026-10-28T05:00:00Z') }]))
      .toEqual({ aTiempo: 0, tarde: 1 });
  });
});
