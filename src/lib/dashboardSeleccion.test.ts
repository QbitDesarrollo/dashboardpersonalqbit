import { describe, expect, it } from 'vitest';
import type { Task } from './dashboardDatos';
import { seleccionarTareas, metricasResponsables, metricasMarcas } from './dashboardSeleccion';

const tarea = (id: string, estado: string, extra: Partial<Task> = {}): Task => ({
  id, titulo_tarea: id, estado, fecha_entrega: '2026-10-10', prioridad: 'media', responsable_user_id: 'u1',
  brand_id: 'b1', desk_id: 'd1', cantidad_entregables: 2, tiempo_trabajado: 60, brands: { nombre: 'Marca' }, ...extra,
});
const hoy = new Date('2026-10-02T15:00:00Z');
const tareas = [tarea('a', 'en_proceso'), tarea('b', 'en_revision'), tarea('c', 'aprobado'), tarea('d', 'entregado'),
  tarea('e', 'backlog', { fecha_entrega: '2026-09-30' }), tarea('f', 'revision_cliente', { fecha_entrega: '2026-09-30' }),
  tarea('g', 'en_proceso', { responsable_user_id: 'u2', brand_id: 'b2', cantidad_entregables: 0, tiempo_trabajado: 0 })];
const ids = (xs: Task[]) => xs.map((t) => t.id);

describe('las tareas detrás de cada indicador del dashboard', () => {
  it('las activas reúnen en proceso y en revisión; entregadas excluye aprobadas', () => {
    expect(ids(seleccionarTareas(tareas, { tipo: 'activas' }, hoy))).toEqual(['a', 'b', 'g']);
    expect(ids(seleccionarTareas(tareas, { tipo: 'estado', estado: 'entregado' }, hoy))).toEqual(['d']);
  });
  it('cada segmento del responsable respeta su estado y su identificador', () => {
    expect(ids(seleccionarTareas(tareas, { tipo: 'responsable', id: 'u1', grupo: 'completadas' }, hoy))).toEqual(['c', 'd']);
    expect(ids(seleccionarTareas(tareas, { tipo: 'responsable', id: 'u1', grupo: 'enProgreso' }, hoy))).toEqual(['a', 'b']);
  });
  it('las atrasadas excluyen las cerradas y las que están en revisión del cliente', () => {
    const xs = [...tareas, tarea('h', 'entregado', { fecha_entrega: '2026-09-30' }), tarea('i', 'backlog', { fecha_entrega: '' })];
    expect(ids(seleccionarTareas(xs, { tipo: 'atrasadas' }, hoy))).toEqual(['e']);
  });
  it('los entregables y el tiempo muestran las tareas que aportan al indicador', () => {
    expect(ids(seleccionarTareas(tareas, { tipo: 'entregables' }, hoy))).not.toContain('g');
    expect(ids(seleccionarTareas(tareas, { tipo: 'tiempo' }, hoy))).not.toContain('g');
  });
  it('trabaja sobre las tareas ya filtradas, sin recuperar otras marcas', () => {
    expect(ids(seleccionarTareas(tareas.filter((t) => t.brand_id === 'b1'), { tipo: 'activas' }, hoy))).toEqual(['a', 'b']);
    expect(ids(seleccionarTareas(tareas, { tipo: 'marca', id: 'b2' }, hoy))).toEqual(['g']);
    expect(seleccionarTareas([], { tipo: 'activas' }, hoy)).toEqual([]);
  });
  it('personas y marcas con nombres iguales conservan métricas separadas por ID', () => {
    const ms = metricasResponsables(tareas, [{ id: 'u1', nombre: 'Alex' }, { id: 'u2', nombre: 'Alex' }]);
    expect(ms.map((m) => [m.id, m.nombre, m.total, m.completadas, m.enProgreso])).toEqual([['u1', 'Alex', 6, 2, 2], ['u2', 'Alex', 1, 0, 1]]);
    expect(metricasMarcas(tareas).map((m) => [m.id, m.nombre, m.total])).toEqual([['b1', 'Marca', 6], ['b2', 'Marca', 1]]);
  });
});
