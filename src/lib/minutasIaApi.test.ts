import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { esperarBorrador, estadoIa, pedirBorrador, saludIa } from './minutasIaApi';

const respuesta = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

const BORRADOR = { titulo: 'Revisión', resumen: 'R', puntos: [] };

describe('minutasIaApi', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('consulta el estado y la salud de la IA', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, { permitido: true })).mockReturnValueOnce(respuesta(200, { listo: true }));
    expect(await estadoIa()).toEqual({ permitido: true });
    expect(await saludIa()).toEqual({ listo: true });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/data\/minutas\/ia\/estado$/);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/api\/data\/minutas\/ia\/salud$/);
  });

  it('pide el borrador con la transcripción y la fecha', async () => {
    fetchMock.mockReturnValue(respuesta(202, { id: 'job1' }));
    const datos = { transcripcion: 'Hola', notas_cliente: '- Banner', indicaciones: 'Solo web', fecha: '2026-09-24' };
    expect(await pedirBorrador(datos)).toEqual({ id: 'job1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/data\/minutas\/ia\/borradores$/);
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify(datos) });
  });

  it('espera hasta que el borrador está listo', async () => {
    fetchMock
      .mockReturnValueOnce(respuesta(200, { id: 'job1', estado: 'procesando', borrador: null, error: null }))
      .mockReturnValueOnce(respuesta(200, { id: 'job1', estado: 'listo', borrador: BORRADOR, error: null }));
    expect(await esperarBorrador('job1', { intervaloMs: 1 })).toEqual(BORRADOR);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/api\/data\/minutas\/ia\/borradores\/job1$/);
  });

  it('si la generación falla, lanza el error del servidor', async () => {
    fetchMock.mockReturnValue(respuesta(200, { id: 'job1', estado: 'error', borrador: null, error: 'Codex está ocupado.' }));
    await expect(esperarBorrador('job1', { intervaloMs: 1 })).rejects.toThrow('Codex está ocupado.');
  });

  it('deja de esperar pasado el límite', async () => {
    fetchMock.mockImplementation(() => respuesta(200, { id: 'job1', estado: 'procesando', borrador: null, error: null }));
    await expect(esperarBorrador('job1', { intervaloMs: 1, limiteMs: 20 })).rejects.toThrow('La IA está tardando demasiado. Intenta de nuevo en unos minutos.');
  });
});
