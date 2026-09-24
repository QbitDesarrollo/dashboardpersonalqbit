import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as api from './minutasApi';
import { listarMinutas, accionPunto } from './minutasApi';

function respuesta(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('minutasApi', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('lista con los filtros que tienen valor', async () => {
    fetchMock.mockReturnValue(respuesta(200, []));
    await listarMinutas({ brand_id: 'b1', project_id: '', q: 'whatsapp' });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toMatch(/\/api\/data\/minutas\?brand_id=b1&q=whatsapp$/);
  });

  it('envía la acción del punto y devuelve la minuta actualizada', async () => {
    fetchMock.mockReturnValue(respuesta(200, { id: 'm1' }));
    const r = await accionPunto('i1', 'completar', { resolucion: 'Se hizo el video.' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/data\/minuta-items\/i1\/accion$/);
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ accion: 'completar', resolucion: 'Se hizo el video.' }) });
    expect(r).toEqual({ id: 'm1' });
  });

  it.each([
    ['obtenerMinuta', ['m1'], 'GET', '/minutas/m1', undefined],
    ['crearMinuta', [{ brand_id: 'b1', fecha: '2026-09-22', titulo: 'Reunión' }], 'POST', '/minutas', { brand_id: 'b1', fecha: '2026-09-22', titulo: 'Reunión' }],
    ['editarMinuta', ['m1', { titulo: 'Nuevo' }], 'PATCH', '/minutas/m1', { titulo: 'Nuevo' }],
    ['borrarMinuta', ['m1'], 'DELETE', '/minutas/m1', undefined],
    ['agregarPunto', ['m1', { titulo: 'Filtro' }], 'POST', '/minutas/m1/items', { titulo: 'Filtro' }],
    ['editarPunto', ['i1', { descripcion: 'x' }], 'PATCH', '/minuta-items/i1', { descripcion: 'x' }],
    ['borrarPunto', ['i1'], 'DELETE', '/minuta-items/i1', undefined],
    ['agregarEvidencia', ['i1', { tipo: 'enlace', nombre: 'Home', url: 'https://x.com' }], 'POST', '/minuta-items/i1/evidencias', { tipo: 'enlace', nombre: 'Home', url: 'https://x.com' }],
    ['quitarEvidencia', ['e1'], 'DELETE', '/minuta-evidencias/e1', undefined],
    ['vincularTarea', ['i1', 't1'], 'POST', '/minuta-items/i1/tareas', { task_id: 't1' }],
    ['desvincularTarea', ['i1', 't1'], 'DELETE', '/minuta-items/i1/tareas/t1', undefined],
    ['activarEnlace', ['m1'], 'POST', '/minutas/m1/enlace', undefined],
    ['desactivarEnlace', ['m1'], 'DELETE', '/minutas/m1/enlace', undefined],
  ] as const)('%s usa el método y la ruta correctos', async (fn, args, method, ruta, body) => {
    fetchMock.mockReturnValue(respuesta(200, { ok: true }));
    await (api as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[fn](...args);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url).endsWith(`/api/data${ruta}`)).toBe(true);
    expect(init.method).toBe(method);
    expect(init.body).toBe(body === undefined ? undefined : JSON.stringify(body));
  });

  it('lee la minuta pública por su token (ruta sin login)', async () => {
    fetchMock.mockReturnValue(respuesta(200, { codigo: 'M-01', puntos: [] }));
    const r = await api.obtenerMinutaPublica('mn_abc');
    expect(String(fetchMock.mock.calls[0][0]).endsWith('/api/public/minutas/mn_abc')).toBe(true);
    expect(r).toEqual({ codigo: 'M-01', puntos: [] });
  });

  it('propaga el mensaje de error del servidor', async () => {
    fetchMock.mockReturnValue(respuesta(422, { error: 'Falta al menos una evidencia.' }));
    await expect(accionPunto('i1', 'completar', {})).rejects.toThrow('Falta al menos una evidencia.');
  });
});
