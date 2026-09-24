import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { tasksRouter } from '../src/routes/tasks.js';
import { incidenciasRouter } from '../src/routes/incidencias.js';
import { levantarApp, limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, crearTarea, llamar, type Usuario } from './helpers/api.js';
import { query } from '../src/db/mysql.js';

let api: { url: string; cerrar: () => Promise<void> };
let admin: Usuario;
let marcaId: string;

beforeAll(async () => { api = await levantarApp(tasksRouter, incidenciasRouter); });
afterAll(async () => { await api.cerrar(); await cerrarLimpieza(); });
beforeEach(async () => {
  await limpiarBase();
  // Only one user: nobody else gets notified when the incidencia is created.
  admin = await crearUsuario('Admin', 'admin');
  marcaId = await crearMarca('Alba del Bosque');
});

const detalleDe = async (id: string) => (await query<{ detalle: string | null }[]>('SELECT detalle FROM tasks WHERE id = ?', [id]))[0].detalle;

describe('detalle vacío del editor', () => {
  it('al crear una tarea, "<p></p>" se guarda como vacío (NULL)', async () => {
    const r = await llamar(`${api.url}/tasks`, admin, 'POST', { titulo_tarea: 'Banner', brand_id: marcaId, fecha_entrega: '2026-10-01', detalle: '<p></p>' });
    expect(r.status).toBe(201);
    expect(await detalleDe(r.body.id)).toBeNull();
  });

  it('al editar una tarea, "<p></p>" borra el detalle; un detalle con texto se guarda igual', async () => {
    const id = await crearTarea(marcaId, 'Banner');
    await llamar(`${api.url}/tasks/${id}`, admin, 'PATCH', { detalle: '<p>Tres láminas</p>' });
    expect(await detalleDe(id)).toBe('<p>Tres láminas</p>');
    await llamar(`${api.url}/tasks/${id}`, admin, 'PATCH', { detalle: '<p></p>' });
    expect(await detalleDe(id)).toBeNull();
  });

  it('al crear una incidencia, una descripción "<p></p>" se guarda como vacía', async () => {
    const r = await llamar(`${api.url}/incidencias`, admin, 'POST', { titulo: 'Botón roto', descripcion: '<p></p>' });
    expect(r.status).toBe(201);
    expect(r.body.descripcion).toBeNull();
  });
});
