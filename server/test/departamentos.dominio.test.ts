import { describe, expect, it } from 'vitest';
import { formarResumen, ESTADOS_CERRADOS } from '../src/departamentos/dominio.js';

const fila = {
  id: 'a', nombre: 'Contenido', orden: 10, color: '#14b8a6', next_department_id: 'b',
  next_department_nombre: 'Diseño', activo: 1, personas: '3', tareas_abiertas: '4', tareas_total: '8',
};

describe('resumen de departamentos', () => {
  it('normaliza contadores y activo, agrupa canales sin multiplicar los conteos', () => {
    expect(formarResumen([fila], [
      { department_id: 'a', nombre: 'Mesa 1' }, { department_id: 'a', nombre: 'Mesa 2' },
      { department_id: 'otro', nombre: 'Otra' },
    ])).toEqual([{ ...fila, activo: true, personas: 3, tareas_abiertas: 4, tareas_total: 8, canales: ['Mesa 1', 'Mesa 2'] }]);
    expect(fila.personas).toBe('3');
  });
  it('conserva archivados, valores nulos y departamentos sin referencias', () => {
    expect(formarResumen([{ ...fila, activo: 0, color: null, next_department_id: null, next_department_nombre: null, personas: 0, tareas_abiertas: 0, tareas_total: 0 }], []))
      .toEqual([{ ...fila, activo: false, color: null, next_department_id: null, next_department_nombre: null, personas: 0, tareas_abiertas: 0, tareas_total: 0, canales: [] }]);
    expect(formarResumen([], [])).toEqual([]);
  });
  it('considera revisión del cliente abierta y excluye solo estados terminados', () => {
    expect(ESTADOS_CERRADOS).toEqual(['entregado', 'aprobado', 'cancelado']);
    for (const estado of ['backlog', 'en_proceso', 'en_revision', 'revision_interna', 'revision_cliente', 'ajustes', 'bloqueado']) {
      expect(ESTADOS_CERRADOS).not.toContain(estado);
    }
  });
});
