import { describe, expect, it, vi } from 'vitest';
import { cargarTareasDashboard } from './dashboardCarga';

describe('carga completa del dashboard', () => {
  it('carga las páginas por las filas recibidas y elimina duplicados', async () => {
    const pedir = vi.fn()
      .mockResolvedValueOnce({ tasks: [{ id: 'a' }, { id: 'b' }], total: 4 })
      .mockResolvedValueOnce({ tasks: [{ id: 'b' }, { id: 'c' }], total: 3 });
    expect(await cargarTareasDashboard(pedir)).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(pedir.mock.calls.map(([op]) => op)).toEqual([{ limit: 500, offset: 0 }, { limit: 500, offset: 2 }]);
  });
  it('no pide páginas innecesarias y no reintenta errores', async () => {
    const pedir = vi.fn().mockResolvedValue({ tasks: [], total: 0 });
    expect(await cargarTareasDashboard(pedir)).toEqual([]); expect(pedir).toHaveBeenCalledTimes(1);
    pedir.mockReset().mockRejectedValue(new Error('Sin conexión'));
    await expect(cargarTareasDashboard(pedir)).rejects.toThrow('Sin conexión'); expect(pedir).toHaveBeenCalledTimes(1);
  });
  it('si se interrumpe la paginación no presenta datos parciales como completos', async () => {
    const pedir = vi.fn().mockResolvedValueOnce({ tasks: [{ id: 'a' }], total: 3 }).mockResolvedValueOnce({ tasks: [], total: 3 });
    await expect(cargarTareasDashboard(pedir)).rejects.toThrow('No se pudieron cargar todas las tareas');
  });
  it('rechaza un resultado incompleto aunque las páginas se solapen', async () => {
    const pedir = vi.fn()
      .mockResolvedValueOnce({ tasks: [{ id: 'a' }, { id: 'b' }], total: 4 })
      .mockResolvedValueOnce({ tasks: [{ id: 'b' }, { id: 'c' }], total: 4 });
    await expect(cargarTareasDashboard(pedir)).rejects.toThrow('No se pudieron cargar todas las tareas');
  });
});
