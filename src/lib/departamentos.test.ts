import { describe, expect, it } from 'vitest';
import { ordenarDepartamentos, opcionesSiguienteEtapa, calcularReorden } from './departamentos';

const departamentos = [
  { id: 'b', nombre: 'Diseño', orden: 20, activo: true },
  { id: 'c', nombre: 'Archivo', orden: 30, activo: false },
  { id: 'a', nombre: 'Contenido', orden: 10, activo: true },
];

describe('departamentos', () => {
  it('ordena por orden y nombre sin modificar el origen', () => {
    expect(ordenarDepartamentos(departamentos).map(d => d.id)).toEqual(['a', 'b', 'c']);
    expect(departamentos[0].id).toBe('b');
    expect(ordenarDepartamentos([{ ...departamentos[0], orden: 10 }, departamentos[2]]).map(d => d.id)).toEqual(['a', 'b']);
  });
  it('excluye la propia etapa y las archivadas, conservando una siguiente etapa archivada ya asignada', () => {
    expect(opcionesSiguienteEtapa(departamentos, 'a').map(d => d.id)).toEqual(['b']);
    expect(opcionesSiguienteEtapa(departamentos, 'a', 'c').map(d => d.id)).toEqual(['b', 'c']);
  });
  it('mueve en ambas direcciones y calcula posiciones de diez en diez', () => {
    expect(calcularReorden(departamentos, 'b', -1)).toEqual([{ id: 'b', orden: 10 }, { id: 'a', orden: 20 }, { id: 'c', orden: 30 }]);
    expect(calcularReorden(departamentos, 'a', 1)).toEqual(calcularReorden(departamentos, 'b', -1));
    expect(departamentos[0].orden).toBe(20);
  });
  it('no escribe nada para un movimiento fuera de límites o un id desconocido', () => {
    expect(calcularReorden(departamentos, 'a', -1)).toEqual([]);
    expect(calcularReorden(departamentos, 'c', 1)).toEqual([]);
    expect(calcularReorden(departamentos, 'x', 1)).toEqual([]);
  });
});
