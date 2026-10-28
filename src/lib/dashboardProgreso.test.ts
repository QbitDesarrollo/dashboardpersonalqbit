import { describe, expect, it } from 'vitest';
import { calcularProgreso } from './dashboardProgreso';

describe('progreso del dashboard', () => {
  it('cuenta aprobado y entregado como terminados y redondea porcentajes', () => {
    const p = calcularProgreso([{ estado: 'aprobado' }, { estado: 'entregado' }, { estado: 'backlog' }]);
    expect(p.total).toBe(3); expect(p.porcentajeEntregadas).toBe(67);
    expect(p.segmentos.find((s) => s.estado === 'aprobado')).toMatchObject({ cantidad: 1, porcentaje: 33, proporcion: 100 / 3 });
    expect(p.segmentos.find((s) => s.estado === 'backlog')).toMatchObject({ cantidad: 1, porcentaje: 33 });
  });
  it('no pierde estados adicionales del total ni de la barra', () => {
    const p = calcularProgreso([{ estado: 'revision_cliente' }, { estado: 'ajustes' }, { estado: 'bloqueado' }]);
    expect(p.porcentajeEntregadas).toBe(0);
    expect(p.segmentos.reduce((n, s) => n + s.cantidad, 0)).toBe(3);
    expect(p.segmentos.find((s) => s.estado === 'revision_cliente')).toMatchObject({ cantidad: 1 });
    expect(p.segmentos.find((s) => s.estado === 'ajustes')).toMatchObject({ cantidad: 1 });
  });
  it('un conjunto vacío tiene porcentajes cero y conserva las opciones de consulta', () => {
    const p = calcularProgreso([]);
    expect(p.total).toBe(0); expect(p.porcentajeEntregadas).toBe(0);
    expect(p.segmentos.length).toBeGreaterThanOrEqual(6);
    expect(p.segmentos.every((s) => s.cantidad === 0 && s.porcentaje === 0 && s.proporcion === 0)).toBe(true);
  });
  it('nombra en español la revisión interna, como el resto de Tiusdei', () => {
    const p = calcularProgreso([{ estado: 'revision_interna' }]);
    expect(p.segmentos.find((s) => s.estado === 'revision_interna')).toMatchObject({ label: 'Revisión interna', cantidad: 1 });
  });
});
