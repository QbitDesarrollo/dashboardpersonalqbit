import { describe, expect, it } from 'vitest';
import { formarResumen, ESTADOS_CERRADOS, validarArchivo, siguienteTrasArchivo, validarEliminacion } from '../src/departamentos/dominio.js';
import { archivarSchema, eliminarSchema } from '../src/departamentos/esquemas.js';

const fila = {
  id: 'a', nombre: 'Contenido', orden: 10, color: '#14b8a6', next_department_id: 'b',
  next_department_nombre: 'Diseño', activo: 1, personas: '3', tareas_abiertas: '4', tareas_total: '8',
};

const departamento = { id: 'a', nombre: 'Contenido', activo: 1, next_department_id: 'b' };
const sinReferencias = { tareas: 0, historial: 0, traspasos: 0, plantillas: 0, personas: 0, mesas: 0, etapas: 0 };

describe('archivo seguro · S9', () => {
  it('exige destino explícito UUID o null y confirmación sin normalizar', () => {
    for (const body of [{}, { destino_id: 'a' }, { destino_id: 1 }]) expect(archivarSchema.safeParse(body).success).toBe(false);
    expect(archivarSchema.parse({ destino_id: null })).toEqual({ destino_id: null });
    expect(archivarSchema.safeParse({ destino_id: 'a729c3e1-68eb-49ea-9d14-006fd14589db' }).success).toBe(true);
    expect(eliminarSchema.parse({ confirmacion: ' Contenido ' }).confirmacion).toBe(' Contenido ');
  });
  it('rechaza origen inexistente o inactivo y destino propio, inexistente o inactivo', () => {
    expect(() => validarArchivo(null, null, null)).toThrow('Departamento no encontrado');
    expect(() => validarArchivo({ ...departamento, activo: 0 }, null, null)).toThrow('El departamento ya está archivado');
    expect(() => validarArchivo(departamento, 'a', departamento)).toThrow('El destino debe ser otro departamento');
    expect(() => validarArchivo(departamento, 'b', null)).toThrow('El destino debe estar activo');
    expect(() => validarArchivo(departamento, 'b', { ...departamento, id: 'b', activo: 0 })).toThrow('El destino debe estar activo');
    expect(() => validarArchivo(departamento, null, null)).not.toThrow();
    expect(() => validarArchivo(departamento, 'b', { ...departamento, id: 'b' })).not.toThrow();
  });
  it('reencadena conservando siguiente etapa, sin autorreferencias incluso en ciclos', () => {
    expect(siguienteTrasArchivo('x', 'b', 'a')).toBe('b');
    expect(siguienteTrasArchivo('b', 'b', 'a')).toBeNull();
    expect(siguienteTrasArchivo('x', 'a', 'a')).toBeNull();
    expect(siguienteTrasArchivo('x', null, 'a')).toBeNull();
  });
  it('bloquea cada referencia, exige archivo previo y nombre exacto', () => {
    expect(() => validarEliminacion(departamento, 'Contenido', sinReferencias)).toThrow('Primero archívalo');
    const archivado = { ...departamento, activo: 0 };
    for (const nombre of ['contenido', 'Contenido ', ' Contenido', '']) expect(() => validarEliminacion(archivado, nombre, sinReferencias)).toThrow('Escribe el nombre exacto');
    for (const clave of Object.keys(sinReferencias)) expect(() => validarEliminacion(archivado, 'Contenido', { ...sinReferencias, [clave]: 1 })).toThrow('El departamento tiene referencias');
    expect(() => validarEliminacion(archivado, 'Contenido', sinReferencias)).not.toThrow();
    expect(() => validarEliminacion(null, 'Contenido', sinReferencias)).toThrow('Departamento no encontrado');
  });
});

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
