import { describe, it, expect, beforeEach, vi } from 'vitest';
import { guardarFiltros, leerFiltros, SIN_FILTROS } from './filtrosTareas';

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('filtros recordados de Tareas', () => {
  it('sin nada guardado no hay filtros recordados', () => {
    expect(leerFiltros('u1')).toBeNull();
  });

  it('guarda y lee los filtros de cada persona por separado', () => {
    guardarFiltros('u1', { ...SIN_FILTROS, responsable: 'u1', status: 'en_proceso' });
    expect(leerFiltros('u1')).toEqual({ ...SIN_FILTROS, responsable: 'u1', status: 'en_proceso' });
    expect(leerFiltros('u2')).toBeNull();
  });

  it('sin usuario no guarda ni lee nada', () => {
    guardarFiltros(null, { ...SIN_FILTROS, brand: 'b1' });
    expect(localStorage.length).toBe(0);
    expect(leerFiltros(undefined)).toBeNull();
  });

  it('ignora lo guardado si está dañado y completa lo que falte con "todos"', () => {
    localStorage.setItem('tareas_filtros:u1', '{no es json');
    expect(leerFiltros('u1')).toBeNull();
    localStorage.setItem('tareas_filtros:u1', JSON.stringify({ brand: 'b1', status: 7 }));
    expect(leerFiltros('u1')).toEqual({ ...SIN_FILTROS, brand: 'b1' });
  });

  it('si el navegador bloquea el almacenamiento, la pantalla sigue funcionando', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(leerFiltros('u1')).toBeNull();
    expect(() => guardarFiltros('u1', SIN_FILTROS)).not.toThrow();
  });
});
