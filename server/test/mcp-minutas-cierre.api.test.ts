import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import fs from 'fs/promises';
import path from 'path';
import { instalarSubidaEvidencia } from '../src/minutas/limiteCuerpo.js';
import { archivosEstaticos } from '../src/utils/estaticos.js';
import * as repoPuntos from '../src/minutas/puntos/consultas.js';
import { mcpMinutasRouter } from '../src/routes/mcp-minutas.js';
import { query, uuid } from '../src/db/mysql.js';
import { minutasRouter } from '../src/routes/minutas.js';
import { filesRouter } from '../src/routes/files-routes.js';
import { crearRouterMinutaPublica } from '../src/routes/public-minuta.js';
import { limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, crearTokenApi, llamar, type Usuario } from './helpers/api.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
const PDF = Buffer.from('%PDF-1.7\nTest document\n%%EOF');
let url: string;
let cerrar: () => Promise<void>;
let usuario: Usuario;
let token: Usuario;
let minuta: string;
let puntos: string[];
const archivos = new Set<string>();

beforeAll(async () => {
  // Same parser ordering as production: only this upload may exceed 2 MB.
  const app = express();
  instalarSubidaEvidencia(app, (_req, _res, next) => next());
  app.use('/uploads', archivosEstaticos(path.join(process.cwd(), 'uploads')));
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', mcpMinutasRouter, crearRouterMinutaPublica({ limitePorMinuto: 10000 }));
  app.use('/web', minutasRouter, filesRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cerrar = () => new Promise<void>((resolve) => server.close(() => resolve()));
});
afterAll(async () => {
  for (const archivo of archivos) {
    await fs.unlink(archivo).catch(() => undefined);
    for (const dir of [path.join(path.dirname(archivo), '.pendientes'), path.join(process.cwd(), 'uploads-privado', 'evidencias-pendientes')]) {
      await fs.unlink(path.join(dir, `${path.parse(archivo).name}.json`)).catch(() => undefined);
    }
  }
  await cerrar();
  await cerrarLimpieza();
});
beforeEach(async () => {
  await limpiarBase();
  usuario = await crearUsuario('Even', 'ejecutivo');
  token = await crearTokenApi(usuario);
  const r = await llamar(`${url}/api/minutas`, token, 'POST', {
    brandId: await crearMarca('Alba'), title: 'Seguimiento',
    points: [{ title: 'Home' }, { title: 'Menú' }, { title: 'Catálogo' }],
  });
  minuta = r.body.id;
  puntos = r.body.points.map((p: { id: string }) => p.id);
});
const leer = () => llamar(`${url}/api/minutas/${minuta}`, token);
const subir = async (bytes = PNG, mimeType = 'image/png', pointId?: string) => {
  const r = await llamar(`${url}/api/minuta-evidence`, token, 'POST', {
    fileBase64: bytes.toString('base64'), fileName: mimeType === 'application/pdf' ? 'Entrega.pdf' : 'Captura.png', mimeType, pointId,
  });
  if (r.body.url) archivos.add(path.join(process.cwd(), 'uploads', 'editor', path.basename(r.body.url)));
  return r;
};
const cerrarPunto = (body: unknown, id = puntos[0], quien = token) => llamar(`${url}/api/minuta-points/${id}/close`, quien, 'POST', body);
const editar = (body: unknown, id = puntos[0]) => llamar(`${url}/api/minuta-points/${id}`, token, 'PATCH', body);

describe('regresiones del verificador', () => {
  it.each([{ bytes: Buffer.from('ffd8ffdb', 'hex'), mime: 'image/jpeg', ext: 'jpg' }, { bytes: Buffer.from('524946460000000057454250', 'hex'), mime: 'image/webp', ext: 'webp' }, { bytes: PNG, mime: 'image/png', ext: 'png' }])('sube $mime sin usar el nombre como ruta', async ({ bytes, mime, ext }) => {
    const r = await llamar(`${url}/api/minuta-evidence`, token, 'POST', { fileBase64: bytes.toString('base64'), fileName: '../../x.png', mimeType: mime });
    expect(r.status).toBe(201);
    expect(new URL(r.body.url).pathname).toMatch(new RegExp(`^/uploads/editor/[a-f0-9-]{36}\\.${ext}$`));
    archivos.add(path.join(process.cwd(), 'uploads', 'editor', path.basename(r.body.url)));
    expect(await fs.readFile([...archivos].at(-1)!)).toEqual(bytes);
    expect((await fetch(`${url}/uploads/editor/.pendientes/${r.body.evidenceId}.json`)).status).toBe(404);
    await expect(fs.access(path.join(process.cwd(), 'uploads', 'editor', '.pendientes', `${r.body.evidenceId}.json`))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('rechaza base64 inválido y peticiones sin token', async () => {
    const body = { fileBase64: 'abc', fileName: 'x.png', mimeType: 'image/png' };
    expect(await llamar(`${url}/api/minuta-evidence`, token, 'POST', body)).toMatchObject({ status: 400, body: { error: 'TIUSDEI_VALIDATION' } });
    expect((await llamar(`${url}/api/minuta-evidence`, null, 'POST', body)).status).toBe(401);
  });
  it('no permite usar pendientes de otro dueño y conserva el punto sin cambios', async () => {
    const ev = await subir(); const antes = await leer();
    const otro = await crearTokenApi(await crearUsuario('Otro', 'equipo'));
    expect(await cerrarPunto({ whatWasDone: 'Trabajo completado', evidence: [{ evidenceId: ev.body.evidenceId }] }, puntos[0], otro)).toMatchObject({ status: 400, body: { error: 'TIUSDEI_VALIDATION' } });
    expect(await leer()).toEqual(antes);
  });
  it('cierres concurrentes del mismo pendiente no producen un 500', async () => {
    const ev = await subir();
    const body = { whatWasDone: 'Trabajo completado', evidence: [{ evidenceId: ev.body.evidenceId }] };
    const resultados = await Promise.all([cerrarPunto(body, puntos[0]), cerrarPunto(body, puntos[1])]);
    expect(resultados.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(resultados.find((r) => r.status === 400)?.body.error).toBe('TIUSDEI_VALIDATION');
    expect((await leer()).body.points.flatMap((p: { evidence: unknown[] }) => p.evidence)).toHaveLength(1);
  });
  it.each(['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK'])('devuelve VALIDATION ante contención %s y revierte el cierre', async (code) => {
    const ev = await subir(); const antes = await leer();
    const fallo = vi.spyOn(repoPuntos, 'insertarEvidencia').mockRejectedValueOnce(Object.assign(new Error('contención simulada'), { code }));
    try { expect(await cerrarPunto({ whatWasDone: 'Trabajo completado', evidence: [{ evidenceId: ev.body.evidenceId }] })).toMatchObject({ status: 400, body: { error: 'TIUSDEI_VALIDATION' } }); }
    finally { fallo.mockRestore(); }
    expect(await leer()).toEqual(antes);
  });
  it('limpia archivos si falla la inserción de una subida con pointId', async () => {
    const dir = path.join(process.cwd(), 'uploads', 'editor');
    await fs.mkdir(dir, { recursive: true });
    const antes = (await fs.readdir(dir)).sort();
    const fallo = vi.spyOn(repoPuntos, 'insertarEvidencia').mockRejectedValueOnce(new Error('fallo de inserción simulado'));
    try { expect((await subir(PNG, 'image/png', puntos[0])).status).toBe(500); }
    finally { fallo.mockRestore(); }
    const despues = (await fs.readdir(dir)).sort();
    for (const f of despues.filter((f) => !antes.includes(f) && f.endsWith('.png'))) archivos.add(path.join(dir, f));
    expect(despues).toEqual(antes);
    expect((await leer()).body.points[0].evidence).toEqual([]);
  });
  it('no expone actividad MCP en el enlace público, pero sí internamente', async () => {
    await cerrarPunto({ whatWasDone: 'Trabajo completado', evidence: [{ url: 'https://example.com' }] });
    await llamar(`${url}/api/minuta-points/${puntos[0]}/reopen`, token, 'POST', { reason: 'Corregir color' });
    const { activar } = await import('../src/minutas/enlace/repositorio.js');
    await activar(minuta, 'notas-public-token', 'ABCDEF');
    const entrada = await llamar(`${url}/api/public/minuta/notas-public-token/entrar`, null, 'POST', { codigo: 'ABCDEF', nombre: 'Cliente' });
    const publica = await llamar(`${url}/api/public/minuta/notas-public-token`, { ...usuario, token: entrada.body.sesion });
    expect(publica.status).toBe(200);
    expect(JSON.stringify(publica.body)).not.toContain('vía MCP');
    expect((await leer()).body.points[0].notes).toHaveLength(2);
    expect((await llamar(`${url}/web/minutas/${minuta}`, usuario)).body.items[0].notas).toHaveLength(2);
  });
});

describe('upload_minuta_evidence', () => {
  it.each([{ bytes: PNG, mime: 'image/png', type: 'imagen' }, { bytes: PDF, mime: 'application/pdf', type: 'archivo' }])('sube contenido real $mime', async ({ bytes, mime, type }) => {
    const r = await subir(bytes, mime);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ evidenceId: expect.stringMatching(/^[a-f0-9-]{36}$/), type, pointId: null });
    expect(await fs.readFile(path.join(process.cwd(), 'uploads', 'editor', path.basename(r.body.url)))).toEqual(bytes);
  });
  it('adjunta inmediatamente al indicar pointId y conserva el nombre', async () => {
    const r = await subir(PDF, 'application/pdf', puntos[0]);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ pointId: puntos[0], name: 'Entrega.pdf', type: 'archivo' });
    expect((await leer()).body.points[0].evidence).toEqual([{ type: 'archivo', name: 'Entrega.pdf', url: r.body.url }]);
  });
  it('rechaza más de 10 MB sin cambiar la minuta', async () => {
    const antes = await leer();
    expect(await subir(Buffer.alloc(10 * 1024 * 1024 + 1))).toMatchObject({ status: 413, body: { error: 'TIUSDEI_FILE_TOO_LARGE' } });
    expect(await leer()).toEqual(antes);
  });
  it.each([[PNG, 'text/plain'], [PDF, 'image/png'], [Buffer.from('fake'), 'application/pdf']])('rechaza MIME o contenido falso', async (bytes, mime) => {
    const antes = await leer();
    expect(await subir(bytes, mime)).toMatchObject({ status: 400, body: { error: 'TIUSDEI_UNSUPPORTED_FILE' } });
    expect(await leer()).toEqual(antes);
  });
});

describe('close_minuta_point y reapertura', () => {
  it('cierra con archivos pendientes y vinculados, enlace y Drive; get conserva el formato', async () => {
    const pendiente = await subir();
    const vinculada = await subir(PDF, 'application/pdf', puntos[0]);
    const r = await cerrarPunto({ whatWasDone: 'Se entregó el nuevo home.', evidence: [
      { evidenceId: pendiente.body.evidenceId }, { evidenceId: vinculada.body.evidenceId },
      { url: 'https://example.com/home', name: 'Home' }, { driveFileId: 'drive-id', name: 'Video' },
    ] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: puntos[0], status: 'Completado', whatWasDone: 'Se entregó el nuevo home.', closedBy: 'Even', closedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/) });
    expect(r.body.evidence.map((e: { type: string }) => e.type).sort()).toEqual(['archivo', 'drive', 'enlace', 'imagen']);
    expect(r.body.notes).toContainEqual(expect.objectContaining({ text: 'Cerrado vía MCP', author: 'Even' }));
    expect((await leer()).body.points[0]).toEqual(r.body);
    const web = await llamar(`${url}/web/minutas/${minuta}`, usuario);
    expect(web.body.items[0]).toMatchObject({ estado: 'completado', completado_por: { id: usuario.id } });
    expect(web.body.items[0].notas[0].via).toBe('mcp');
    const reabierto = await llamar(`${url}/api/minuta-points/${puntos[0]}/reopen`, token, 'POST', { reason: 'Corregir el color' });
    expect(reabierto.status).toBe(200);
    expect(reabierto.body).toMatchObject({ status: 'En curso', closedBy: null, closedAt: null, whatWasDone: r.body.whatWasDone });
    expect(reabierto.body.notes).toContainEqual(expect.objectContaining({ text: 'Reabierto vía MCP: Corregir el color' }));
  });
  it.each([{}, { whatWasDone: 'corto' }])('rechaza texto faltante o corto y revierte evidencias', async (body) => {
    const antes = await leer();
    expect(await cerrarPunto({ ...body, evidence: [{ url: 'https://example.com' }] })).toMatchObject({ status: 400, body: { error: 'TIUSDEI_VALIDATION' } });
    expect(await leer()).toEqual(antes);
  });
  it('exige evidencia sin cambiar estado ni actividad', async () => {
    const antes = await leer();
    expect(await cerrarPunto({ whatWasDone: 'Se terminó el trabajo.', evidence: [] })).toMatchObject({ status: 422, body: { error: 'TIUSDEI_EVIDENCE_REQUIRED' } });
    expect(await leer()).toEqual(antes);
  });
  it('no toma evidencia de otro punto', async () => {
    const ev = await subir(PNG, 'image/png', puntos[1]);
    const antes = await leer();
    expect(await cerrarPunto({ whatWasDone: 'Se terminó el trabajo.', evidence: [{ evidenceId: ev.body.evidenceId }] })).toMatchObject({ status: 400, body: { error: 'TIUSDEI_VALIDATION' } });
    expect(await leer()).toEqual(antes);
  });
  it('solo reabre completados y requiere motivo', async () => {
    const antes = await leer();
    for (const [body, error, status] of [[{ reason: 'Cambiar' }, 'TIUSDEI_INVALID_STATE', 422], [{ reason: 'x' }, 'TIUSDEI_VALIDATION', 400]] as const) {
      expect(await llamar(`${url}/api/minuta-points/${puntos[0]}/reopen`, token, 'POST', body)).toMatchObject({ status, body: { error } });
    }
    expect(await leer()).toEqual(antes);
  });
  it('permite nota vacía solo para puntos del cliente y no duplica evidencia ya adjunta', async () => {
    await editar({ client: true });
    const subida = await subir(PDF, 'application/pdf', puntos[0]);
    const r = await cerrarPunto({ whatWasDone: '', evidence: [{ evidenceId: subida.body.evidenceId }, { evidenceId: subida.body.evidenceId }] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'Recibido', whatWasDone: null });
    expect(r.body.evidence).toHaveLength(1);
  });
  it('devuelve NOT_FOUND y revierte adjuntos al referir archivos inexistentes', async () => {
    const antes = await leer();
    expect(await cerrarPunto({ whatWasDone: 'Trabajo terminado', evidence: [{ url: 'https://example.com' }, { evidenceId: uuid() }] })).toMatchObject({ status: 404, body: { error: 'TIUSDEI_NOT_FOUND' } });
    expect(await leer()).toEqual(antes);
    expect(await editar({ title: 'Otro' }, uuid())).toMatchObject({ status: 404, body: { error: 'TIUSDEI_NOT_FOUND' } });
  });
  it('rechaza clientes en las cuatro operaciones', async () => {
    const cliente = await crearTokenApi(await crearUsuario('Cliente', 'cliente'));
    const antes = await leer();
    for (const [ruta, method, body] of [
      ['/minuta-evidence', 'POST', { fileBase64: PNG.toString('base64'), fileName: 'x.png', mimeType: 'image/png' }],
      [`/minuta-points/${puntos[0]}/close`, 'POST', { whatWasDone: 'Trabajo terminado', evidence: [] }],
      [`/minuta-points/${puntos[0]}/reopen`, 'POST', { reason: 'Cambiar' }],
      [`/minuta-points/${puntos[0]}`, 'PATCH', { title: 'Otro' }],
    ] as const) expect(await llamar(`${url}/api${ruta}`, cliente, method, body)).toMatchObject({ status: 403, body: { error: 'TIUSDEI_FORBIDDEN' } });
    expect(await leer()).toEqual(antes);
  });
});

describe('update_minuta_point', () => {
  it('edita campos, alterna cliente/equipo y reenumera primero y último', async () => {
    const otro = await crearUsuario('Diego', 'equipo');
    const r = await editar({ title: 'Nuevo', description: 'Detalles', assigneeId: otro.id, dueDate: '2026-10-01', position: 1 }, puntos[2]);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ title: 'Nuevo', description: 'Detalles', assignee: 'Diego', dueDate: '2026-10-01', code: '1.1' });
    expect((await leer()).body.points.map((p: { id: string; code: string }) => [p.id, p.code])).toEqual([[puntos[2], '1.1'], [puntos[0], '1.2'], [puntos[1], '1.3']]);
    expect((await editar({ client: true, position: 3 }, puntos[2])).body).toMatchObject({ assignee: 'Cliente', code: '1.3' });
    expect((await editar({ assigneeId: otro.id }, puntos[2])).body.assignee).toBe('Diego');
    expect((await leer()).body.points.map((p: { id: string; code: string }) => [p.id, p.code])).toEqual(puntos.map((id, i) => [id, `1.${i + 1}`]));
  });
  it('rechaza responsables cliente e inactivos y revierte la edición', async () => {
    const cliente = await crearUsuario('Cliente', 'cliente');
    const inactivo = await crearUsuario('Inactivo', 'equipo');
    await query('UPDATE profiles SET activo = 0 WHERE id = ?', [inactivo.id]);
    const antes = await leer();
    for (const id of [cliente.id, inactivo.id, uuid()]) {
      expect(await editar({ title: 'Cambio', assigneeId: id })).toMatchObject({ status: 400, body: { error: 'TIUSDEI_INVALID_ASSIGNEE' } });
      expect(await leer()).toEqual(antes);
    }
  });
  it('valida posición positiva y limita el movimiento al último punto', async () => {
    const antes = await leer();
    for (const position of [0, -1, 1.5]) {
      expect(await editar({ title: 'Cambio', position })).toMatchObject({ status: 400, body: { error: 'TIUSDEI_VALIDATION' } });
      expect(await leer()).toEqual(antes);
    }
    expect((await editar({ position: 999 })).body.code).toBe('1.3');
  });
});

describe('paridad web PDF', () => {
  it('conserva edición, imagen, cierre y orden de la interfaz', async () => {
    expect((await llamar(`${url}/web/minuta-items/${puntos[0]}`, usuario, 'PATCH', { descripcion: 'Descripción web', responsable_cliente: true })).status).toBe(200);
    const imagen = await subir();
    expect((await llamar(`${url}/web/minuta-items/${puntos[0]}/evidencias`, usuario, 'POST', { tipo: 'imagen', nombre: 'Captura', url: imagen.body.url })).status).toBe(201);
    const r = await llamar(`${url}/web/minuta-items/${puntos[0]}/accion`, usuario, 'POST', { accion: 'completar' });
    expect(r.status).toBe(200);
    expect(r.body.items[0]).toMatchObject({ estado: 'completado', responsable_cliente: true, descripcion: 'Descripción web', completado_por: { id: usuario.id } });
    const orden = await llamar(`${url}/web/minutas/${minuta}/orden`, usuario, 'PUT', { items: [...puntos].reverse() });
    expect(orden.status).toBe(200);
    expect(orden.body.items.map((p: { id: string; numero: number }) => [p.id, p.numero])).toEqual([...puntos].reverse().map((id, i) => [id, i + 1]));
  });
  it('sube PDF, lo adjunta desde la web y lo sirve al cliente con firma', async () => {
    const form = new FormData();
    form.append('image', new Blob([PDF], { type: 'application/pdf' }), 'Entrega.pdf');
    const upload = await fetch(`${url}/web/editor/upload-image`, { method: 'POST', headers: { Authorization: `Bearer ${usuario.token}` }, body: form });
    expect(upload.status).toBe(201);
    const archivo = await upload.json() as { url: string };
    archivos.add(path.join(process.cwd(), 'uploads', 'editor', path.basename(archivo.url)));
    const ev = await llamar(`${url}/web/minuta-items/${puntos[0]}/evidencias`, usuario, 'POST', { tipo: 'archivo', nombre: 'Entrega.pdf', url: archivo.url });
    expect(ev.status).toBe(201);
    // Enable the link using its public team endpoint in the separate link suite; here use the signed session via existing service.
    const { activar } = await import('../src/minutas/enlace/repositorio.js');
    await activar(minuta, 'pdf-public-token', 'ABCDEF');
    const entrada = await llamar(`${url}/api/public/minuta/pdf-public-token/entrar`, null, 'POST', { codigo: 'ABCDEF', nombre: 'Cliente' });
    const cliente = { ...usuario, token: entrada.body.sesion };
    const vista = await llamar(`${url}/api/public/minuta/pdf-public-token`, cliente);
    const pdf = vista.body.items[0].evidencias[0];
    expect(pdf).toMatchObject({ tipo: 'archivo', nombre: 'Entrega.pdf', url: expect.stringMatching(/^\/api\/public\/minuta\/pdf-public-token\/evidencias\//) });
    const descarga = await fetch(`${url}${pdf.url}`);
    expect(descarga.status).toBe(200);
    expect(descarga.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await descarga.arrayBuffer())).toEqual(PDF);
    expect((await fetch(`${url}${pdf.url.replace(/sig=[a-f0-9]/, 'sig=z')}`)).status).toBe(404);
  });
});

describe('delete_minuta_evidence', () => {
  const quitar = (body: unknown, id = puntos[0], quien = token) => llamar(`${url}/api/minuta-points/${id}/evidence`, quien, 'DELETE', body);
  const cerradoConDos = async () => {
    await llamar(`${url}/api/minuta-points/${puntos[0]}/close`, token, 'POST', { whatWasDone: 'Se entregó el nuevo home.', evidence: [
      { url: 'https://example.com/vieja', name: 'evidencia-5.1.webp' }, { url: 'https://example.com/nueva', name: 'evidencia-5.1-v2.png' },
    ] });
  };

  it('quita por nombre una evidencia vieja de un punto cerrado sin reabrirlo ni tocar el texto', async () => {
    await cerradoConDos();
    const r = await quitar({ name: 'evidencia-5.1.webp' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'Completado', whatWasDone: 'Se entregó el nuevo home.', closedBy: 'Even' });
    expect(r.body.evidence).toEqual([{ type: 'enlace', name: 'evidencia-5.1-v2.png', url: 'https://example.com/nueva' }]);
    expect((await leer()).body.points[0]).toEqual(r.body);
  });

  it('también quita por URL', async () => {
    await cerradoConDos();
    const r = await quitar({ url: 'https://example.com/nueva' });
    expect(r.status).toBe(200);
    expect(r.body.evidence.map((e: { name: string }) => e.name)).toEqual(['evidencia-5.1.webp']);
  });

  it('no deja un punto cerrado sin evidencia, igual que la web', async () => {
    await cerradoConDos();
    await quitar({ name: 'evidencia-5.1.webp' });
    const antes = await leer();
    expect(await quitar({ name: 'evidencia-5.1-v2.png' })).toMatchObject({ status: 422, body: { error: 'TIUSDEI_EVIDENCE_REQUIRED' } });
    expect(await leer()).toEqual(antes);
  });

  it('avisa si no existe, si el nombre es ambiguo o si no indica cuál', async () => {
    await llamar(`${url}/api/minuta-points/${puntos[0]}/close`, token, 'POST', { whatWasDone: 'Se entregó el nuevo home.', evidence: [
      { url: 'https://example.com/a', name: 'Captura' }, { url: 'https://example.com/b', name: 'Captura' },
    ] });
    const antes = await leer();
    expect(await quitar({ name: 'No existe' })).toMatchObject({ status: 404, body: { error: 'TIUSDEI_NOT_FOUND' } });
    expect(await quitar({ name: 'Captura' })).toMatchObject({ status: 400, body: { error: 'TIUSDEI_VALIDATION' } });
    expect(await quitar({})).toMatchObject({ status: 400, body: { error: 'TIUSDEI_VALIDATION' } });
    expect(await leer()).toEqual(antes);
  });

  it('un cliente no puede quitar evidencias', async () => {
    await cerradoConDos();
    const cliente = await crearTokenApi(await crearUsuario('Cliente', 'cliente'));
    expect(await quitar({ name: 'evidencia-5.1.webp' }, puntos[0], cliente)).toMatchObject({ status: 403, body: { error: 'TIUSDEI_FORBIDDEN' } });
  });
});
