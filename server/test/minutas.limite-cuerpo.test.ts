import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { cuerpoDemasiadoGrande, instalarSubidaEvidencia } from '../src/minutas/limiteCuerpo.js';
import { crearTokenApi, crearUsuario, limpiarBase, cerrarLimpieza } from './helpers/api.js';

let server: Server;
let url: string;
let token: string;
let limitada = false;
beforeAll(async () => {
  await limpiarBase();
  token = (await crearTokenApi(await crearUsuario('Prueba límite'))).token;
  const app = express();
  instalarSubidaEvidencia(app, (_req, res, next) => limitada ? res.status(429).end() : next());
  app.use(express.json({ limit: '2mb' }));
  app.post(['/api/minuta-evidence', '/api/otra'], (_req, res) => res.json({ ok: true }));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await cerrarLimpieza();
});
const enviar = (body: string, auth = false, ruta = '/api/minuta-evidence') => fetch(`${url}${ruta}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body,
});

describe('orden de la subida especial', () => {
  it('rechaza sin token antes de analizar JSON inválido o grande', async () => {
    for (const body of ['{', JSON.stringify({ contenido: 'x'.repeat(16 * 1024 * 1024) })]) {
      const r = await enviar(body);
      expect(r.status).toBe(401);
      expect((await r.json()).error).toBe('TIUSDEI_TOKEN_MISSING');
    }
  });
  it('limita antes de analizar el cuerpo, también con token', async () => {
    limitada = true;
    try { expect((await enviar('{', true)).status).toBe(429); }
    finally { limitada = false; }
  });
  it('mantiene 15 MB con código nombrado y 2 MB en otras rutas', async () => {
    expect((await enviar(JSON.stringify({ contenido: 'x'.repeat(3 * 1024 * 1024) }), true)).status).toBe(200);
    const r = await enviar(JSON.stringify({ contenido: 'x'.repeat(16 * 1024 * 1024) }), true);
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ error: 'TIUSDEI_FILE_TOO_LARGE', message: 'El archivo pesa más de 10 MB.' });
    expect((await enviar(JSON.stringify({ contenido: 'x'.repeat(3 * 1024 * 1024) }), true, '/api/otra')).status).toBe(413);
  });
});

const respuesta = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

describe('cuerpo de evidencia demasiado grande', () => {
  it('responde TIUSDEI_FILE_TOO_LARGE con 413 cuando el JSON supera el límite del parser', () => {
    const res = respuesta(); const next = vi.fn();
    cuerpoDemasiadoGrande(Object.assign(new Error('request entity too large'), { type: 'entity.too.large' }), {} as never, res as never, next);
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({ error: 'TIUSDEI_FILE_TOO_LARGE', message: 'El archivo pesa más de 10 MB.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('deja pasar cualquier otro error al manejador general', () => {
    const res = respuesta(); const next = vi.fn(); const error = new Error('JSON inválido');
    cuerpoDemasiadoGrande(error, {} as never, res as never, next);
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});
