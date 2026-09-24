import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { tasksRouter } from '../src/routes/tasks.js';
import { levantarApp, limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, crearProyecto, crearTarea, llamar, type Usuario } from './helpers/api.js';
import { query } from '../src/db/mysql.js';

let api: { url: string; cerrar: () => Promise<void> };
let admin: Usuario;
let marcaId: string;

beforeAll(async () => { api = await levantarApp(tasksRouter); });
afterAll(async () => { await api.cerrar(); await cerrarLimpieza(); });
beforeEach(async () => {
  await limpiarBase();
  admin = await crearUsuario('Admin', 'admin');
  marcaId = await crearMarca('Alba del Bosque');
});

async function tarea(titulo: string, fecha: string | null, estado = 'backlog', creada = '2026-09-01 10:00:00', projectId: string | null = null) {
  const id = await crearTarea(marcaId, titulo, estado);
  await query('UPDATE tasks SET fecha_entrega = ?, created_at = ?, project_id = ? WHERE id = ?', [fecha, creada, projectId, id]);
  return id;
}
const titulos = async (qs: string) => (await llamar(`${api.url}/tasks?${qs}`, admin)).body.tasks.map((t: any) => t.titulo_tarea);

describe('GET /tasks · orden por fecha de entrega', () => {
  it('con orden=entrega: abiertas de la más próxima a la más lejana (sin fecha al final) y luego las cerradas, la más reciente primero', async () => {
    await tarea('Lejana', '2026-12-01', 'backlog', '2026-09-20 10:00:00');
    await tarea('Vencida', '2026-09-01', 'en_proceso', '2026-08-01 10:00:00');
    await tarea('Sin fecha', null, 'backlog', '2026-09-25 10:00:00');
    await tarea('Próxima', '2026-09-26', 'backlog', '2026-09-10 10:00:00');
    await tarea('Entregada vieja', '2026-08-15', 'entregado', '2026-08-10 10:00:00');
    await tarea('Aprobada', '2026-09-05', 'aprobado', '2026-09-02 10:00:00');
    expect(await titulos('orden=entrega')).toEqual(['Vencida', 'Próxima', 'Lejana', 'Sin fecha', 'Aprobada', 'Entregada vieja']);
  });

  it('sin el parámetro mantiene el orden de siempre (la más recién creada primero)', async () => {
    await tarea('Vieja', '2026-09-26', 'backlog', '2026-08-01 10:00:00');
    await tarea('Nueva', '2026-12-01', 'backlog', '2026-09-20 10:00:00');
    expect(await titulos('')).toEqual(['Nueva', 'Vieja']);
  });
});

describe('GET /tasks · filtro por proyecto', () => {
  it('muestra solo las tareas del proyecto elegido', async () => {
    const portal = await crearProyecto(marcaId, 'Portal');
    const app = await crearProyecto(marcaId, 'App');
    await tarea('Del portal', '2026-09-26', 'backlog', '2026-09-01 10:00:00', portal);
    await tarea('De la app', '2026-09-26', 'backlog', '2026-09-01 10:00:00', app);
    await tarea('Sin proyecto', '2026-09-26');
    expect(await titulos(`project_id=${portal}`)).toEqual(['Del portal']);
  });
});

describe('GET /tasks · conteo de archivos', () => {
  it('trae cuántos archivos tiene cada tarea, para no pedirlos fila por fila', async () => {
    const con = await tarea('Con archivos', '2026-09-26');
    await tarea('Sin archivos', '2026-09-27');
    for (const n of ['brief.pdf', 'logo.png']) {
      await query('INSERT INTO files (id, task_id, nombre_archivo, url_storage, created_at) VALUES (UUID(), ?, ?, ?, NOW(3))', [con, n, `/uploads/tasks/${n}`]);
    }
    const r = await llamar(`${api.url}/tasks?orden=entrega`, admin);
    expect(r.body.tasks.map((t: any) => [t.titulo_tarea, Number(t.files_count)])).toEqual([['Con archivos', 2], ['Sin archivos', 0]]);
  });
});

