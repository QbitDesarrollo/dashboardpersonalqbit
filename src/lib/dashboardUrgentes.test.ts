import { describe, expect, it } from 'vitest';
import type { Task } from './dashboardDatos';
import { agruparUrgentes, textoVencimiento } from './dashboardUrgentes';

const hoy = new Date(2026, 9, 2, 12);
const tarea = (dia: number, estado = 'en_proceso'): Task => ({
  id: `${dia}-${estado}`, titulo_tarea: 'Tarea', fecha_entrega: `2026-10-${String(dia).padStart(2, '0')}`,
  estado, prioridad: 'alta', brand_id: 'b1', desk_id: null, responsable_user_id: null,
  cantidad_entregables: 1, tiempo_trabajado: 0,
});
describe('urgentes del dashboard', () => {
  it('agrupa -1, 0, 1 y 7 días, excluye 8 y los estados terminados o en manos del cliente', () => {
    const grupos = agruparUrgentes([tarea(10), tarea(9), tarea(3), tarea(2), tarea(1),
      tarea(1, 'aprobado'), tarea(2, 'entregado'), tarea(3, 'revision_cliente')], hoy);
    expect(grupos.map((g) => [g.nombre, g.tareas.map((t) => t.dias_restantes)])).toEqual([
      ['Atrasadas', [-1]], ['Hoy', [0]], ['Esta semana', [1, 7]],
    ]);
  });
  it('mantiene grupos vacíos y el orden de vencimiento', () => {
    expect(agruparUrgentes([], hoy).map((g) => g.tareas)).toEqual([[], [], []]);
    expect(agruparUrgentes([tarea(9), tarea(3)], hoy)[2].tareas.map((t) => t.id)).toEqual(['3-en_proceso', '9-en_proceso']);
  });
  it.each([[-194, 'Venció hace 194 días'], [-1, 'Venció ayer'], [0, 'Vence hoy'],
    [1, 'Vence mañana'], [3, 'Vence en 3 días'], [7, 'Vence en 7 días'], [8, 'Vence en 8 días']])('describe %i días', (dias, texto) => {
    expect(textoVencimiento(dias)).toBe(texto);
  });
});
