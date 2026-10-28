import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { miDiaRouter } from '../src/routes/mi-dia.js';
import { googleCalendarRouter } from '../src/routes/google-calendar.js';
import { query } from '../src/db/mysql.js';
import { levantarApp, limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, crearTarea, fijarAjuste, llamar, type Usuario } from './helpers/api.js';

let api: Awaited<ReturnType<typeof levantarApp>>;
let admin: Usuario, equipo: Usuario, persona: Usuario;
const rutas = ['/mi-dia', '/google-calendar/events', '/google-calendar/status'];
beforeAll(async () => { api = await levantarApp(miDiaRouter, googleCalendarRouter); });
afterAll(async () => { await api.cerrar(); await cerrarLimpieza(); });
beforeEach(async () => {
  await limpiarBase();
  admin = await crearUsuario('Admin', 'admin');
  equipo = await crearUsuario('Equipo', 'equipo');
  persona = await crearUsuario('Tanya Moya');
});
const consultar = (ruta: string, viewer: Usuario, target?: string) => llamar(`${api.url}${ruta}${target ? `?userId=${target}` : ''}`, viewer);

describe('Día por persona · identidad y permisos compartidos', () => {
  it('conserva el día propio sin parámetro y con el propio ID; admin obtiene las tareas de la persona elegida', async () => {
    const marca = await crearMarca('Marca');
    const tarea = await crearTarea(marca, 'Tarea personal');
    await query('UPDATE tasks SET responsable_user_id=?, created_at=NOW(), fecha_entrega=DATE(CONVERT_TZ(NOW(),\'+00:00\',\'-05:00\')) WHERE id=?', [persona.id, tarea]);
    const propia = await consultar('/mi-dia', admin);
    expect(propia.status).toBe(200);
    expect(propia.body.tareas).toEqual({ completadas: 0, total: 0 });
    expect((await consultar('/mi-dia', admin, admin.id)).body.tareas).toEqual(propia.body.tareas);
    const ajena = await consultar('/mi-dia', admin, persona.id);
    expect(ajena.status).toBe(200);
    expect(ajena.body.tareas).toEqual({ completadas: 0, total: 1 });
    expect((await consultar('/mi-dia', persona)).body.tareas).toEqual(ajena.body.tareas);
  });
  it.each(rutas)('%s rechaza equipo antes de resolver el destino', async ruta => {
    expect(await consultar(ruta, equipo, persona.id)).toEqual({ status: 403, body: { error: 'Sin permisos para ver reuniones' } });
    expect(await consultar(ruta, equipo, 'desconocida')).toEqual({ status: 403, body: { error: 'Sin permisos para ver reuniones' } });
  });
  it.each(rutas)('%s rechaza perfiles desconocidos o inactivos', async ruta => {
    await query('UPDATE profiles SET activo=0 WHERE id=?', [persona.id]);
    for (const id of [persona.id, 'desconocida']) {
      expect(await consultar(ruta, admin, id)).toEqual({ status: 404, body: { error: 'Persona no encontrada' } });
    }
  });
  it('status y events sin token conservan su respuesta para la cuenta propia y la elegida', async () => {
    for (const id of [undefined, admin.id, persona.id]) {
      const status = await consultar('/google-calendar/status', admin, id);
      expect(status.status).toBe(200);
      expect(status.body).toMatchObject({ connected: false, calendar: false, permisos: { conectado: false, calendar: false } });
      expect(await consultar('/google-calendar/events', admin, id)).toEqual({ status: 401, body: { error: 'Google no conectado' } });
    }
  });
  it('daily_meetings_roles permite equipo y mantiene la misma regla en desk-meetings', async () => {
    await fijarAjuste('daily_meetings_roles', ' admin, equipo, ');
    expect((await consultar('/mi-dia', equipo, persona.id)).status).toBe(200);
    expect((await consultar('/google-calendar/status', equipo, persona.id)).body.connected).toBe(false);
    expect(await consultar('/google-calendar/events', equipo, persona.id)).toEqual({ status: 401, body: { error: 'Google no conectado' } });
    expect(await consultar('/google-calendar/desk-meetings', equipo)).toEqual({ status: 400, body: { error: 'Parámetros start y end requeridos' } });
    await fijarAjuste('daily_meetings_roles', 'ejecutivo');
    expect((await consultar('/google-calendar/desk-meetings', admin)).status).toBe(403);
    for (const ruta of rutas) expect((await consultar(ruta, admin, persona.id)).status).toBe(403);
    expect((await consultar('/mi-dia', admin)).status).toBe(200);
  });
});
