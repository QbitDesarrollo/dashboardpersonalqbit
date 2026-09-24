import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { mcpMinutasRouter } from '../src/routes/mcp-minutas.js';
import {
  levantarAppEn, limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, crearProyecto, crearTarea, crearTokenApi, llamar, type Usuario,
} from './helpers/api.js';
import { query, uuid } from '../src/db/mysql.js';

let api: { url: string; cerrar: () => Promise<void> };
let even: Usuario;
let marcaId: string;

beforeAll(async () => { api = await levantarAppEn('/api', mcpMinutasRouter); });
afterAll(async () => { await api.cerrar(); await cerrarLimpieza(); });
beforeEach(async () => {
  await limpiarBase();
  even = await crearTokenApi(await crearUsuario('Even', 'ejecutivo'));
  marcaId = await crearMarca('Alba del Bosque');
});

const crear = (cuerpo: Record<string, unknown>) => llamar(`${api.url}/minutas`, even, 'POST', cuerpo);

describe('POST /api/minutas (create_minuta)', () => {
  it('crea la minuta con sus puntos y devuelve código, url y los puntos creados', async () => {
    const diego = await crearUsuario('Diego Ruiz', 'equipo');
    const r = await crear({
      brandId: marcaId, date: '2026-09-24', title: 'Revisión de avance', summary: 'Lanzamiento el 26.',
      points: [
        { title: 'Video en el home', description: 'Sin sonido.', assigneeId: diego.id, dueDate: '2026-09-30' },
        { title: 'Fichas técnicas', client: true },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ code: 'M-01', url: expect.stringMatching(/\/minutas\/[0-9a-f-]{36}$/) });
    expect(r.body.points.map((p: any) => [p.code, p.title])).toEqual([['1.1', 'Video en el home'], ['1.2', 'Fichas técnicas']]);
    const [fila] = await query<any[]>('SELECT estado, owner_user_id, resumen FROM minutas WHERE id = ?', [r.body.id]);
    expect(fila).toEqual({ estado: 'borrador', owner_user_id: even.id, resumen: 'Lanzamiento el 26.' });
  });

  it('sin fecha usa la de hoy en Ecuador y con publish la deja publicada', async () => {
    const r = await crear({ brandId: marcaId, title: 'Kickoff', publish: true, points: [] });
    const [fila] = await query<any[]>("SELECT estado, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha FROM minutas WHERE id = ?", [r.body.id]);
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());
    expect(fila).toEqual({ estado: 'publicada', fecha: hoy });
  });

  it('rechaza con nombre una marca, un proyecto o un responsable inválidos', async () => {
    const otra = await crearMarca('Pronaca');
    const proyectoAjeno = await crearProyecto(otra, 'Web Pronaca');
    expect((await crear({ brandId: uuid(), title: 'X', points: [] })).body.error).toBe('TIUSDEI_INVALID_BRAND');
    expect((await crear({ brandId: marcaId, projectId: proyectoAjeno, title: 'X', points: [] })).body.error).toBe('TIUSDEI_INVALID_PROJECT');
    const r = await crear({ brandId: marcaId, title: 'X', points: [{ title: 'Uno', assigneeId: uuid() }] });
    expect(r).toMatchObject({ status: 400, body: { error: 'TIUSDEI_INVALID_ASSIGNEE' } });
    expect((await crear({ brandId: marcaId, points: [] })).body.error).toBe('TIUSDEI_VALIDATION');
  });
});

describe('GET /api/minutas (list_minutas)', () => {
  it('lista las minutas con filtros y en forma resumida', async () => {
    await crear({ brandId: marcaId, date: '2026-09-20', title: 'Kickoff portal', points: [{ title: 'Uno' }] });
    await crear({ brandId: marcaId, date: '2026-09-24', title: 'Revisión', points: [{ title: 'Menú de incidencias' }] });
    const todas = await llamar(`${api.url}/minutas?brandId=${marcaId}`, even);
    expect(todas.body.minutas.map((m: any) => [m.code, m.title])).toEqual([['M-02', 'Revisión'], ['M-01', 'Kickoff portal']]);
    const busqueda = await llamar(`${api.url}/minutas?query=incidencias`, even);
    expect(busqueda.body.minutas.map((m: any) => m.title)).toEqual(['Revisión']);
  });
});

describe('GET /api/minutas/:id (get_minuta)', () => {
  it('entrega la minuta completa para leerla', async () => {
    const creada = await crear({ brandId: marcaId, date: '2026-09-24', title: 'Revisión', points: [{ title: 'Fichas técnicas', client: true }] });
    const r = await llamar(`${api.url}/minutas/${creada.body.id}`, even);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ code: 'M-01', brand: 'Alba del Bosque', timezone: 'America/Guayaquil' });
    expect(r.body.points[0]).toMatchObject({ code: '1.1', title: 'Fichas técnicas', status: 'Esperando al cliente', assignee: 'Cliente' });
  });

  it('responde con nombre si la minuta no existe', async () => {
    expect(await llamar(`${api.url}/minutas/${uuid()}`, even)).toMatchObject({ status: 404, body: { error: 'TIUSDEI_NOT_FOUND' } });
  });
});

describe('GET /api/minutas/:id/images', () => {
  const carpeta = path.join(process.cwd(), 'uploads', 'editor');
  const archivo = `${uuid()}.png`;
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');

  it('devuelve las capturas subidas a Tiusdei; las de Drive quedan como enlace', async () => {
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(path.join(carpeta, archivo), PNG);
    try {
      const creada = await crear({ brandId: marcaId, title: 'Revisión', points: [{ title: 'Home' }] });
      const itemId = creada.body.points[0].id;
      const base = process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec';
      await query('INSERT INTO minuta_item_evidencias (id, item_id, tipo, nombre, url) VALUES (?, ?, ?, ?, ?)', [uuid(), itemId, 'imagen', 'home.png', `${base}/uploads/editor/${archivo}`]);
      await query('INSERT INTO minuta_item_evidencias (id, item_id, tipo, nombre, url) VALUES (?, ?, ?, ?, ?)', [uuid(), itemId, 'drive', 'Video.mp4', 'https://drive.google.com/x']);
      await query('INSERT INTO minuta_item_evidencias (id, item_id, tipo, nombre, url) VALUES (?, ?, ?, ?, ?)', [uuid(), itemId, 'imagen', 'externa.png', 'https://otro.com/uploads/editor/x.png']);
      const r = await llamar(`${api.url}/minutas/${creada.body.id}/images`, even);
      expect(r.status).toBe(200);
      expect(r.body.images).toEqual([{ point: '1.1', name: 'home.png', mimeType: 'image/png', data: PNG.toString('base64') }]);
    } finally {
      fs.rmSync(path.join(carpeta, archivo), { force: true });
    }
  });
});

describe('POST /api/minutas/:id/points (add_minuta_points)', () => {
  const agregar = (minutaId: string, cuerpo: Record<string, unknown>) => llamar(`${api.url}/minutas/${minutaId}/points`, even, 'POST', cuerpo);

  it('agrega los puntos al final de la minuta existente y devuelve los nuevos con su código', async () => {
    const diego = await crearUsuario('Diego Ruiz', 'equipo');
    const creada = await crear({ brandId: marcaId, title: 'Revisión', points: [{ title: 'Home' }, { title: 'Menú' }] });
    const r = await agregar(creada.body.id, { points: [
      { title: 'Llamadas no contestadas', description: 'Crear la Task en Salesforce.', assigneeId: diego.id, dueDate: '2026-09-30' },
      { title: 'Enviar logos', client: true },
    ] });
    expect(r.status).toBe(201);
    expect(r.body.points.map((p: any) => [p.code, p.title])).toEqual([['1.3', 'Llamadas no contestadas'], ['1.4', 'Enviar logos']]);
    const detalle = await llamar(`${api.url}/minutas/${creada.body.id}`, even);
    expect(detalle.body.points.map((p: any) => [p.code, p.assignee, p.dueDate])).toEqual([
      ['1.1', null, null], ['1.2', null, null], ['1.3', 'Diego Ruiz', '2026-09-30'], ['1.4', 'Cliente', null],
    ]);
  });

  it('rechaza con nombre una minuta que no existe, un responsable inválido o una lista vacía', async () => {
    const creada = await crear({ brandId: marcaId, title: 'Revisión', points: [] });
    expect(await agregar(uuid(), { points: [{ title: 'X' }] })).toMatchObject({ status: 404, body: { error: 'TIUSDEI_NOT_FOUND' } });
    expect(await agregar(creada.body.id, { points: [{ title: 'X', assigneeId: uuid() }] })).toMatchObject({ status: 400, body: { error: 'TIUSDEI_INVALID_ASSIGNEE' } });
    expect((await agregar(creada.body.id, { points: [] })).body.error).toBe('TIUSDEI_VALIDATION');
    const [{ n }] = await query<any[]>('SELECT COUNT(*) AS n FROM minuta_items WHERE minuta_id = ?', [creada.body.id]);
    expect(Number(n)).toBe(0);
  });
});

describe('POST /api/minuta-points/:id/tasks (link_task_to_minuta_point)', () => {
  it('vincula una tarea de la misma marca al punto', async () => {
    const creada = await crear({ brandId: marcaId, title: 'Revisión', points: [{ title: 'Home' }] });
    const tarea = await crearTarea(marcaId, 'Editar video');
    const r = await llamar(`${api.url}/minuta-points/${creada.body.points[0].id}/tasks`, even, 'POST', { taskId: tarea });
    expect(r).toEqual({ status: 200, body: { ok: true, minutaId: creada.body.id, point: '1.1', taskId: tarea } });
    const detalle = await llamar(`${api.url}/minutas/${creada.body.id}`, even);
    expect(detalle.body.points[0].tasks.map((t: any) => t.title)).toEqual(['Editar video']);
  });

  it('no vincula una tarea de otra marca', async () => {
    const creada = await crear({ brandId: marcaId, title: 'Revisión', points: [{ title: 'Home' }] });
    const ajena = await crearTarea(await crearMarca('Pronaca'), 'Otra');
    const r = await llamar(`${api.url}/minuta-points/${creada.body.points[0].id}/tasks`, even, 'POST', { taskId: ajena });
    expect(r).toMatchObject({ status: 400, body: { error: 'TIUSDEI_BRAND_MISMATCH' } });
  });
});

describe('acceso', () => {
  it('exige el token de API y no deja pasar a clientes', async () => {
    expect((await llamar(`${api.url}/minutas`, null)).status).toBe(401);
    const cliente = await crearTokenApi(await crearUsuario('Cliente', 'cliente'));
    expect(await llamar(`${api.url}/minutas`, cliente)).toMatchObject({ status: 403, body: { error: 'TIUSDEI_FORBIDDEN' } });
  });
});
