import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { aprobarReporte, enviarReporte, esperarReporte, generarReporte, guardarConfigReportes, leerConfigReportes, listarReportes, pdfReporte, pendientesReportes, regenerarReporte } from './reportesApi';

const respuesta = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('reportesApi', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); localStorage.setItem('tiusdei_token', 'tok'); });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  const ultima = () => { const [url, init] = fetchMock.mock.calls.at(-1)!; return { url: String(url).replace(/^https?:\/\/[^/]+/, ''), init }; };

  it('usa las rutas y métodos de la API', async () => {
    fetchMock.mockImplementation(() => respuesta(200, {}));
    await leerConfigReportes('p1');
    expect(ultima().url).toBe('/api/data/projects/p1/reportes/config');
    await guardarConfigReportes('p1', { activo: true, dia_entrega: 1, hora_entrega: '08:00' });
    expect(ultima()).toMatchObject({ url: '/api/data/projects/p1/reportes/config', init: { method: 'PUT' } });
    await listarReportes('p1');
    expect(ultima().url).toBe('/api/data/projects/p1/reportes');
    await generarReporte('p1');
    expect(ultima()).toMatchObject({ url: '/api/data/projects/p1/reportes/generar', init: { method: 'POST' } });
    await regenerarReporte('r1', 'Menos técnico');
    expect(ultima()).toMatchObject({ url: '/api/data/reportes/r1/regenerar', init: { method: 'POST', body: JSON.stringify({ indicaciones: 'Menos técnico' }) } });
    await aprobarReporte('r1');
    expect(ultima()).toMatchObject({ url: '/api/data/reportes/r1/aprobar', init: { method: 'POST' } });
    await enviarReporte('r1', ['u1'], ['u2']);
    expect(ultima()).toMatchObject({ url: '/api/data/reportes/r1/enviar', init: { body: JSON.stringify({ para: ['u1'], cc: ['u2'] }) } });
    fetchMock.mockImplementation(() => respuesta(200, { pendientes: 2 }));
    expect(await pendientesReportes()).toBe(2);
  });

  it('espera a que el reporte termine de generarse', async () => {
    fetchMock
      .mockReturnValueOnce(respuesta(200, { id: 'r1', estado: 'generando' }))
      .mockReturnValueOnce(respuesta(200, { id: 'r1', estado: 'borrador', contenido: {} }));
    const r = await esperarReporte('r1', { intervaloMs: 1 });
    expect(r.estado).toBe('borrador');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('muestra el error de la API', async () => {
    fetchMock.mockReturnValue(respuesta(409, { error: 'Primero aprueba el reporte.' }));
    await expect(enviarReporte('r1', ['u1'], [])).rejects.toThrow('Primero aprueba el reporte.');
  });

  it('descarga el PDF con la sesión para mostrarlo en pantalla', async () => {
    fetchMock.mockReturnValue(Promise.resolve(new Response(new Blob(['%PDF-1.3'], { type: 'application/pdf' }), { status: 200 })));
    const pdf = await pdfReporte('r1');
    expect(pdf.type).toBe('application/pdf');
    expect(ultima().init.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });
});
