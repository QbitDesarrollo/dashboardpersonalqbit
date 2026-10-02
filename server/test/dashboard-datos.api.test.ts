import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { dashboardDatosRouter } from '../src/routes/dashboard-datos.js';
import { tasksRouter } from '../src/routes/tasks.js';
import { query } from '../src/db/mysql.js';
import * as db from '../src/db/mysql.js';
import { levantarApp, limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, crearTarea, llamar, type Usuario } from './helpers/api.js';

let api: Awaited<ReturnType<typeof levantarApp>>;
let admin: Usuario, equipo: Usuario, ejecutivo: Usuario, cliente: Usuario;
let marca: string;
beforeAll(async () => { api = await levantarApp(dashboardDatosRouter, tasksRouter); });
afterAll(async () => { await api.cerrar(); await cerrarLimpieza(); });
beforeEach(async () => {
  await query('DELETE FROM task_responsables'); await query('DELETE FROM task_seguidores'); await query('DELETE FROM client_brands');
  await limpiarBase();
  admin = await crearUsuario('Admin', 'admin'); equipo = await crearUsuario('Equipo', 'equipo');
  ejecutivo = await crearUsuario('Ejecutivo', 'ejecutivo'); cliente = await crearUsuario('Cliente', 'cliente');
  marca = await crearMarca('Marca');
}, 15000);
const ids = (tasks: { id: string }[]) => tasks.map(t => t.id).sort();

describe('GET /dashboard/tasks · historial ligero y permisos', () => {
  it('exige sesión', async () => {
    expect((await llamar(`${api.url}/dashboard/tasks`, null)).status).toBe(401);
  });
  it('devuelve más de 500 tareas sin datos de detalle ni subtareas', async () => {
    const values = Array.from({ length: 510 }, (_, i) => ['UUID()', '?', '?', "'backlog'"].join(',')).map(v => `(${v})`).join(',');
    await query(`INSERT INTO tasks (id, brand_id, titulo_tarea, estado) VALUES ${values}`, Array.from({ length: 510 }, (_, i) => [marca, `Tarea ${i}`]).flat());
    const padre = await crearTarea(marca, 'Padre'); const hija = await crearTarea(marca, 'Hija');
    await query('UPDATE tasks SET parent_task_id = ? WHERE id = ?', [padre, hija]);
    const consultas = vi.spyOn(db, 'query');
    const r = await llamar(`${api.url}/dashboard/tasks`, admin);
    const llamadas = [...consultas.mock.calls]; consultas.mockRestore();
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0][0]).not.toMatch(/files|task_reads|task_deliverable_types/);
    expect(r.status).toBe(200); expect(r.body.tasks).toHaveLength(511);
    expect(ids(r.body.tasks)).not.toContain(hija);
    expect(r.body.tasks[0]).not.toHaveProperty('detalle'); expect(r.body.tasks[0]).not.toHaveProperty('files_count');
    expect(r.body.tasks[0].brands).toEqual({ nombre: 'Marca' });
    expect(r.body.tasks[0]).toHaveProperty('tiempo_trabajado');
  });
  it('conserva el acceso de mesa, responsable, co-responsable, seguidor y cliente', async () => {
    const otra = await crearMarca('Otra marca');
    const mesa = '11111111-1111-4111-8111-111111111111';
    await query('INSERT INTO desks (id,nombre) VALUES (?,?)', [mesa, 'Mesa']);
    for (const u of [equipo, ejecutivo]) await query('INSERT INTO desk_members (id,desk_id,user_id) VALUES (UUID(),?,?)', [mesa, u.id]);
    const deMesa = await crearTarea(marca, 'De mesa'); await query('UPDATE tasks SET desk_id=? WHERE id=?', [mesa, deMesa]);
    for (const u of [equipo, ejecutivo]) {
      const directa = await crearTarea(otra, `Directa ${u.nombre}`); await query('UPDATE tasks SET responsable_user_id=? WHERE id=?', [u.id, directa]);
      const compartida = await crearTarea(otra, `Compartida ${u.nombre}`); await query('INSERT INTO task_responsables (id,task_id,user_id) VALUES (UUID(),?,?)', [compartida, u.id]);
      const seguida = await crearTarea(otra, `Seguida ${u.nombre}`); await query('INSERT INTO task_seguidores (id,task_id,user_id) VALUES (UUID(),?,?)', [seguida, u.id]);
    }
    await crearTarea(otra, 'Privada');
    await query('INSERT INTO client_brands (id,user_id,brand_id) VALUES (UUID(),?,?)', [cliente.id, marca]);
    for (const u of [admin, equipo, ejecutivo, cliente]) {
      const anterior = await llamar(`${api.url}/tasks?limit=500`, u);
      const nuevo = await llamar(`${api.url}/dashboard/tasks`, u);
      expect(nuevo.status).toBe(200); expect(ids(nuevo.body.tasks)).toEqual(ids(anterior.body.tasks));
    }
    expect((await llamar(`${api.url}/dashboard/tasks`, equipo)).body.tasks).toHaveLength(4);
    expect((await llamar(`${api.url}/dashboard/tasks`, cliente)).body.tasks).toHaveLength(1);
    await query('DELETE FROM client_brands WHERE user_id=?', [cliente.id]);
    expect((await llamar(`${api.url}/dashboard/tasks`, cliente)).body.tasks).toEqual([]);
  }, 45000);
});
