import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { archivosEstaticos } from '../src/utils/estaticos.js';

let dir: string;
let server: Server;
let url: string;
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiusdei-estaticos-'));
  await fs.mkdir(path.join(dir, '.pendientes'));
  await fs.writeFile(path.join(dir, '.pendientes', 'registro.json'), '{"owner":"interno"}');
  await fs.writeFile(path.join(dir, 'captura.png'), 'png');
  await fs.writeFile(path.join(dir, 'documento.pdf'), '%PDF-');
  await fs.writeFile(path.join(dir, 'ejecutable.svg'), '<svg/>');
  const app = express();
  app.use('/uploads', archivosEstaticos(dir));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/uploads`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fs.rm(dir, { recursive: true, force: true });
});
describe('archivos públicos', () => {
  it('no sirve archivos dentro de directorios ocultos', async () => {
    const r = await fetch(`${url}/.pendientes/registro.json`);
    expect([403, 404]).toContain(r.status);
    expect(await r.text()).not.toContain('interno');
  });
  it('conserva imágenes, PDF y las cabeceras de seguridad', async () => {
    const imagen = await fetch(`${url}/captura.png`);
    expect(imagen.status).toBe(200);
    expect(imagen.headers.get('x-content-type-options')).toBe('nosniff');
    expect(imagen.headers.get('content-security-policy')).toBe('sandbox');
    const pdf = await fetch(`${url}/documento.pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-security-policy')).toBeNull();
    expect((await fetch(`${url}/ejecutable.svg`)).headers.get('content-disposition')).toBe('attachment');
  });
});
