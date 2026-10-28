import { describe, expect, it } from 'vitest';
import { calcStats, tareasUrgentes, type Task } from './dashboardDatos';

const AHORA = new Date(2026, 9, 27, 11, 20);

const tarea = (id: string, estado: string, fecha_entrega: string): Task => ({
  id,
  titulo_tarea: `Tarea ${id}`,
  fecha_entrega,
  prioridad: 'media',
  estado,
  responsable_user_id: null,
  brand_id: 'b1',
  desk_id: null,
  cantidad_entregables: 1,
  tiempo_trabajado: 0,
  brands: { nombre: 'Mall del Norte' },
});

describe('tareasUrgentes', () => {
  it('usa la misma regla que Atrasadas: aprobada, entregada y en revisión del cliente no son urgentes', () => {
    const lista = [
      tarea('aprobada', 'aprobado', '2026-04-16'),
      tarea('entregada', 'entregado', '2026-10-20'),
      tarea('cliente', 'revision_cliente', '2026-10-25'),
      tarea('backlog', 'backlog', '2026-10-20'),
    ];

    expect(tareasUrgentes(lista, AHORA).map((t) => t.id)).toEqual(['backlog']);
    expect(calcStats(lista, AHORA).atrasadas).toBe(1);
  });

  it('incluye las que vencen hasta en 2 días, deja fuera las de 3 y ordena por días restantes', () => {
    const lista = [
      tarea('en-3', 'en_proceso', '2026-10-30'),
      tarea('en-2', 'en_proceso', '2026-10-29'),
      tarea('hoy', 'ajustes', '2026-10-27T00:00:00.000Z'),
      tarea('vencida', 'bloqueado', '2026-10-26'),
      tarea('sin-fecha', 'en_proceso', ''),
    ];

    expect(tareasUrgentes(lista, AHORA).map((t) => [t.id, t.dias_restantes])).toEqual([
      ['vencida', -1],
      ['hoy', 0],
      ['en-2', 2],
    ]);
  });

  it('conserva los datos que muestra la tarjeta', () => {
    const [urgente] = tareasUrgentes([tarea('x', 'en_proceso', '2026-10-27')], AHORA);
    expect(urgente).toEqual({
      id: 'x',
      titulo_tarea: 'Tarea x',
      fecha_entrega: '2026-10-27',
      dias_restantes: 0,
      prioridad: 'media',
      estado: 'en_proceso',
      brand_name: 'Mall del Norte',
    });
  });
});
