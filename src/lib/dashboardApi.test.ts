import { describe, it, expect, vi, afterEach } from 'vitest';
import { getDashboardTasks } from './dashboardApi';
afterEach(() => vi.unstubAllGlobals());
describe('API ligera del dashboard', () => {
  it('recupera todo el historial con una sola petición', async () => {
    const tareas = Array.from({length:510},(_,i)=>({id:String(i)}));
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({tasks:tareas})));
    vi.stubGlobal('fetch',fetch);
    expect(await getDashboardTasks()).toEqual(tareas); expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain('/api/data/dashboard/tasks');
  });
  it('rechaza errores y respuestas incompletas', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{}',{status:500})).mockResolvedValueOnce(new Response('{}'));
    vi.stubGlobal('fetch',fetch);
    await expect(getDashboardTasks()).rejects.toThrow('No se pudieron cargar');
    await expect(getDashboardTasks()).rejects.toThrow('Respuesta incompleta');
  });
});
