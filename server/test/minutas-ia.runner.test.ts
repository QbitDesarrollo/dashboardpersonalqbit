import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { crearRunnerHttp, ErrorRunner } from '../src/minutas/ia/runner.js';

const TOKEN = 't'.repeat(40);
let servidor: http.Server | null = null;

/** Fake runner answering with a fixed status and body; records what it received. */
async function runnerFalso(status: number, body: unknown) {
  const recibido: { auth?: string; url?: string; body?: unknown } = {};
  servidor = http.createServer(async (req, res) => {
    let datos = '';
    for await (const p of req) datos += p;
    Object.assign(recibido, { auth: req.headers.authorization, url: `${req.method} ${req.url}`, body: datos ? JSON.parse(datos) : undefined });
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((r) => servidor!.listen(0, '127.0.0.1', () => r()));
  return { url: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`, recibido };
}

afterEach(() => new Promise<void>((r) => (servidor ? servidor.close(() => r()) : r())));

describe('crearRunnerHttp', () => {
  it('pide la minuta con el token y devuelve la respuesta del runner', async () => {
    const { url, recibido } = await runnerFalso(200, { titulo: 'X', resumen: '', puntos: [] });
    const r = await crearRunnerHttp({ url, token: TOKEN }).generar({ transcripcion: 'Hola', fecha: '2026-09-24' });
    expect(r).toEqual({ titulo: 'X', resumen: '', puntos: [] });
    expect(recibido).toEqual({ auth: `Bearer ${TOKEN}`, url: 'POST /minuta', body: { transcripcion: 'Hola', fecha: '2026-09-24' } });
  });

  it('pasa el mensaje del runner cuando rechaza el pedido', async () => {
    const { url } = await runnerFalso(429, { error: 'Codex está ocupado con otra minuta. Intenta en un minuto.' });
    await expect(crearRunnerHttp({ url, token: TOKEN }).generar({ transcripcion: 'Hola', fecha: '2026-09-24' }))
      .rejects.toEqual(new ErrorRunner('Codex está ocupado con otra minuta. Intenta en un minuto.'));
  });

  it('si el runner rechaza el token, lo dice sin detalles técnicos', async () => {
    const { url } = await runnerFalso(401, { error: 'No autorizado' });
    await expect(crearRunnerHttp({ url, token: TOKEN }).generar({ transcripcion: 'Hola', fecha: '2026-09-24' }))
      .rejects.toEqual(new ErrorRunner('El servicio de IA rechazó la conexión. Revisa la configuración del servidor.'));
  });

  it('si el runner no está corriendo, dice que no responde', async () => {
    const runner = crearRunnerHttp({ url: 'http://127.0.0.1:9', token: TOKEN });
    await expect(runner.generar({ transcripcion: 'Hola', fecha: '2026-09-24' })).rejects.toEqual(new ErrorRunner('El servicio de IA no responde.'));
    expect(await runner.salud()).toEqual({ listo: false, detalle: 'El servicio de IA no responde.' });
  });

  it('salud devuelve si Codex tiene la sesión iniciada', async () => {
    const { url, recibido } = await runnerFalso(200, { listo: true, detalle: 'Logged in using ChatGPT' });
    expect(await crearRunnerHttp({ url, token: TOKEN }).salud()).toEqual({ listo: true, detalle: 'Logged in using ChatGPT' });
    expect(recibido.url).toBe('GET /salud');
  });

  it('sin URL o token configurados, la IA no está disponible', async () => {
    const runner = crearRunnerHttp({ url: '', token: '' });
    expect(await runner.salud()).toEqual({ listo: false, detalle: 'La IA no está configurada en el servidor.' });
    await expect(runner.generar({ transcripcion: 'Hola', fecha: '2026-09-24' })).rejects.toEqual(new ErrorRunner('La IA no está configurada en el servidor.'));
  });
});
