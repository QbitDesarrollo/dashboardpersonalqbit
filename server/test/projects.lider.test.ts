import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { projectsRouter } from '../src/routes/projects.js';
import { levantarApp, limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, llamar, type Usuario } from './helpers/api.js';
import { query, uuid } from '../src/db/mysql.js';

let api: { url: string; cerrar: () => Promise<void> };
let admin: Usuario;
let marcaId: string;

beforeAll(async () => { api = await levantarApp(projectsRouter); });
afterAll(async () => { await api.cerrar(); await cerrarLimpieza(); });
beforeEach(async () => {
  await limpiarBase();
  admin = await crearUsuario('Admin', 'admin');
  marcaId = await crearMarca('Alba del Bosque');
});

const crear = (cuerpo: Record<string, unknown>) => llamar(`${api.url}/projects`, admin, 'POST', cuerpo);

describe('proyectos · líder obligatorio', () => {
  it('no crea un proyecto con un líder que no existe o vacío', async () => {
    for (const lider of [uuid(), '', null]) {
      expect(await crear({ brand_id: marcaId, nombre: 'Portal', lider_user_id: lider })).toMatchObject({ status: 400, body: { error: 'Elige el líder del proyecto.' } });
    }
  });

  it('si no se manda líder (creación rápida desde el tablero del cliente), queda como líder quien lo crea', async () => {
    const r = await crear({ brand_id: marcaId, nombre: 'Portal' });
    expect(r).toMatchObject({ status: 201, body: { lider_user_id: admin.id } });
  });

  it('crea el proyecto con su líder', async () => {
    const lider = await crearUsuario('Diego Ruiz', 'equipo');
    const r = await crear({ brand_id: marcaId, nombre: 'Portal', lider_user_id: lider.id });
    expect(r).toMatchObject({ status: 201, body: { lider_user_id: lider.id, lider_nombre: 'Diego Ruiz' } });
  });

  it('al editar no deja quitar el líder, pero sí cambiarlo o editar otras cosas', async () => {
    const lider = await crearUsuario('Diego Ruiz', 'equipo');
    const otro = await crearUsuario('Ana Mora', 'equipo');
    const { body: p } = await crear({ brand_id: marcaId, nombre: 'Portal', lider_user_id: lider.id });
    for (const vacio of [null, '']) {
      expect(await llamar(`${api.url}/projects/${p.id}`, admin, 'PATCH', { lider_user_id: vacio })).toMatchObject({ status: 400, body: { error: 'Elige el líder del proyecto.' } });
    }
    expect((await llamar(`${api.url}/projects/${p.id}`, admin, 'PATCH', { lider_user_id: otro.id })).body.lider_nombre).toBe('Ana Mora');
    expect((await llamar(`${api.url}/projects/${p.id}`, admin, 'PATCH', { nombre: 'Portal 2' })).body.nombre).toBe('Portal 2');
    const [fila] = await query<any[]>('SELECT lider_user_id FROM projects WHERE id = ?', [p.id]);
    expect(fila.lider_user_id).toBe(otro.id);
  });
});
