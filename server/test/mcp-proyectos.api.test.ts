import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mcpRouter } from '../src/routes/mcp.js';
import { mcpProyectosRouter } from '../src/routes/mcp-proyectos.js';
import { levantarAppEn, limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, crearTokenApi, llamar, type Usuario } from './helpers/api.js';
import { query, queryOne, uuid } from '../src/db/mysql.js';

let api: { url: string; cerrar: () => Promise<void> };
let even: Usuario;
let alba: string;
let dinatek: string;
let bot: string;
let web: string;

beforeAll(async () => { api = await levantarAppEn('/api', mcpProyectosRouter, mcpRouter); });
afterAll(async () => { await api.cerrar(); await cerrarLimpieza(); });
beforeEach(async () => {
  await limpiarBase();
  even = await crearTokenApi(await crearUsuario('Even Fierro', 'admin'));
  alba = await crearMarca('Alba del Bosque');
  dinatek = await crearMarca('Dinatek');
  bot = uuid();
  web = uuid();
  await query("INSERT INTO projects (id, brand_id, nombre, estado, lider_user_id) VALUES (?, ?, 'Asistente Proyecta · Bot', 'en_curso', ?)", [bot, alba, even.id]);
  await query("INSERT INTO projects (id, brand_id, nombre, estado) VALUES (?, ?, 'Sitio web', 'pausado')", [web, dinatek]);
  await query("INSERT INTO projects (id, brand_id, nombre, estado, activo) VALUES (?, ?, 'Borrado', 'en_curso', 0)", [uuid(), alba]);
});

const u = (ruta: string) => `${api.url}${ruta}`;
const crear = (extra: Record<string, unknown> = {}) =>
  llamar(u('/tasks'), even, 'POST', { title: 'Corregir alertas', brandId: alba, dueDate: '2026-10-20', ...extra });

describe('list_projects', () => {
  it('lista los proyectos activos con marca, estado, líder y avance; filtra por marca y estado', async () => {
    const r = await llamar(u('/projects'), even);
    expect(r.status).toBe(200);
    expect(r.body.map((p: any) => p.name).sort()).toEqual(['Asistente Proyecta · Bot', 'Sitio web']);
    expect(r.body.find((p: any) => p.id === bot)).toMatchObject({ brand: { id: alba, name: 'Alba del Bosque' }, status: 'En curso', leader: 'Even Fierro', tasks: 0, done: 0 });
    expect((await llamar(u(`/projects?brandId=${dinatek}`), even)).body.map((p: any) => p.id)).toEqual([web]);
    expect((await llamar(u('/projects?status=Pausado'), even)).body.map((p: any) => p.id)).toEqual([web]);
  });
});

describe('tareas con proyecto (opcional)', () => {
  it('crea con proyecto de su marca, y sin proyecto como siempre', async () => {
    const con = await crear({ projectId: bot });
    expect(con.status).toBe(201);
    expect((await queryOne<any>('SELECT project_id FROM tasks WHERE id = ?', [con.body.id])).project_id).toBe(bot);
    const sin = await crear();
    expect(sin.status).toBe(201);
    expect((await queryOne<any>('SELECT project_id FROM tasks WHERE id = ?', [sin.body.id])).project_id).toBeNull();
  });

  it('no acepta un proyecto de otra marca ni uno que no existe', async () => {
    expect(await crear({ projectId: web })).toMatchObject({ status: 400, body: { error: 'TIUSDEI_INVALID_PROJECT' } });
    expect(await crear({ projectId: uuid() })).toMatchObject({ status: 400, body: { error: 'TIUSDEI_INVALID_PROJECT' } });
  });

  it('get_task dice a qué proyecto pertenece, o null', async () => {
    const con = await crear({ projectId: bot });
    expect((await llamar(u(`/tasks/${con.body.id}`), even)).body.project).toEqual({ id: bot, name: 'Asistente Proyecta · Bot' });
    const sin = await crear();
    expect((await llamar(u(`/tasks/${sin.body.id}`), even)).body.project).toBeNull();
  });

  it('search_tasks filtra por proyecto y cada fila dice su proyecto', async () => {
    const con = await crear({ projectId: bot, title: 'Del bot' });
    await crear({ title: 'Suelta' });
    const r = await llamar(u(`/tasks?projectId=${bot}`), even);
    expect(r.body.items.map((t: any) => [t.id, t.project])).toEqual([[con.body.id, 'Asistente Proyecta · Bot']]);
    const todas = await llamar(u('/tasks'), even);
    expect(todas.body.items.find((t: any) => t.title === 'Suelta').project).toBeNull();
  });

  it('update_task mueve la tarea a un proyecto de su marca o la saca del proyecto', async () => {
    const t = await crear();
    expect((await llamar(u(`/tasks/${t.body.id}`), even, 'PATCH', { projectId: bot })).status).toBe(200);
    expect((await queryOne<any>('SELECT project_id FROM tasks WHERE id = ?', [t.body.id])).project_id).toBe(bot);
    expect(await llamar(u(`/tasks/${t.body.id}`), even, 'PATCH', { projectId: web })).toMatchObject({ status: 400, body: { error: 'TIUSDEI_INVALID_PROJECT' } });
    expect((await llamar(u(`/tasks/${t.body.id}`), even, 'PATCH', { projectId: null })).status).toBe(200);
    expect((await queryOne<any>('SELECT project_id FROM tasks WHERE id = ?', [t.body.id])).project_id).toBeNull();
  });
});
