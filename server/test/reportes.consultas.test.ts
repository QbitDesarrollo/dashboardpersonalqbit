import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { datosDelReporte, cacheIa } from '../src/reportes/consultas.js';
import { limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, crearTarea, type Usuario } from './helpers/api.js';
import { query, uuid } from '../src/db/mysql.js';

let ana: Usuario;
let oriana: Usuario;
let marcaId: string;
let proyectoId: string;

beforeAll(async () => { await limpiarBase(); });
afterAll(async () => { await cerrarLimpieza(); });
beforeEach(async () => {
  await limpiarBase();
  const even = await crearUsuario('Even Fierro', 'admin');
  ana = await crearUsuario('Ana Mora', 'equipo');
  oriana = await crearUsuario('Oriana Barcia', 'equipo');
  marcaId = await crearMarca('Alba del Bosque');
  proyectoId = uuid();
  await query('INSERT INTO projects (id, brand_id, nombre, lider_user_id) VALUES (?, ?, ?, ?)', [proyectoId, marcaId, 'Bot Proyecta', even.id]);
});

async function tareaDelProyecto(titulo: string, campos: Record<string, unknown> = {}) {
  const id = await crearTarea(marcaId, titulo, (campos.estado as string) ?? 'en_proceso');
  const sets = ['project_id = ?', ...Object.keys(campos).filter((k) => k !== 'estado').map((k) => `${k} = ?`)];
  await query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, [proyectoId, ...Object.entries(campos).filter(([k]) => k !== 'estado').map(([, v]) => v), id]);
  return id;
}
const comentar = (taskId: string, userId: string, html: string, creado: string) =>
  query('INSERT INTO comments (id, task_id, user_id, comentario, contenido_html, created_at) VALUES (?, ?, ?, ?, ?, ?)', [uuid(), taskId, userId, html.replace(/<[^>]+>/g, ''), html, creado]);

const PERIODO = { desde: '2026-09-21', hasta: '2026-09-27' };

describe('datosDelReporte', () => {
  it('trae el proyecto y sus tareas principales con todo su historial de estados y fechas, en fechas de Ecuador', async () => {
    const t1 = await tareaDelProyecto('Momento de ofrecer cita', { responsable_user_id: ana.id, fecha_entrega: '2026-10-02', created_at: '2026-09-01 03:00:00' });
    await query('INSERT INTO tasks (id, brand_id, titulo_tarea, estado, parent_task_id, project_id) VALUES (?, ?, ?, ?, ?, ?)', [uuid(), marcaId, 'Sub 1', 'entregado', t1, proyectoId]);
    const t2 = await tareaDelProyecto('Menú de incidencias', { estado: 'entregado' });
    await query("INSERT INTO activity_log (id, entity_type, entity_id, action, field_name, old_value, new_value, user_id, created_at) VALUES (?, 'task', ?, 'status_change', 'estado', 'en_proceso', 'entregado', ?, '2026-09-24 15:00:00')", [uuid(), t2, oriana.id]);
    await query("INSERT INTO task_reschedules (id, task_id, fecha_anterior, fecha_nueva, motivo, comentario, changed_by, changed_at) VALUES (?, ?, '2026-09-20', '2026-10-02', 'CLIENTE', NULL, ?, '2026-09-22 03:00:00')", [uuid(), t1, ana.id]);
    const otro = uuid();
    await query('INSERT INTO projects (id, brand_id, nombre) VALUES (?, ?, ?)', [otro, marcaId, 'Otro']);
    const ajena = await crearTarea(marcaId, 'De otro proyecto');
    await query('UPDATE tasks SET project_id = ? WHERE id = ?', [otro, ajena]);

    const d = await datosDelReporte(proyectoId, PERIODO);
    expect(d.proyecto).toMatchObject({ id: proyectoId, nombre: 'Bot Proyecta', marca: 'Alba del Bosque', lider: 'Even Fierro' });
    expect(d.tareas.map((t) => t.titulo).sort()).toEqual(['Menú de incidencias', 'Momento de ofrecer cita']);
    expect(d.todas).toHaveLength(3);
    expect(d.tareas.find((t) => t.id === t1)).toEqual({
      id: t1, titulo: 'Momento de ofrecer cita', estado: 'en_proceso', fecha_entrega: '2026-10-02', responsable: 'Ana Mora', creada: '2026-08-31',
      cambios: [], comentarios: 0,
      reprogramaciones: [{ fecha: '2026-09-21', anterior: '2026-09-20', nueva: '2026-10-02', motivo: 'CLIENTE', comentario: null, por: 'Ana Mora' }],
    });
    expect(d.tareas.find((t) => t.id === t2)!.cambios).toEqual([{ fecha: '2026-09-24', de: 'en_proceso', a: 'entregado', por: 'Oriana Barcia' }]);
  });

  it('solo toma los comentarios del periodo según la hora de Ecuador, y los cuenta en la tarea', async () => {
    const t1 = await tareaDelProyecto('Momento de ofrecer cita');
    await comentar(t1, ana.id, '<p>Domingo 20 a las 23:00: fuera</p>', '2026-09-21 04:00:00');
    await comentar(t1, ana.id, '<p>Lunes 21 a la 01:00: dentro</p>', '2026-09-21 06:00:00');
    await comentar(t1, oriana.id, '<p>Domingo 27 a las 23:59: <b>dentro</b></p>', '2026-09-28 04:59:00');
    await comentar(t1, ana.id, '<p>Lunes 28 a las 00:00: fuera</p>', '2026-09-28 05:00:00');
    const d = await datosDelReporte(proyectoId, PERIODO);
    expect(d.comentarios.get(t1)).toEqual([
      { fecha: '2026-09-21', autor: 'Ana Mora', texto: 'Lunes 21 a la 01:00: dentro' },
      { fecha: '2026-09-27', autor: 'Oriana Barcia', texto: 'Domingo 27 a las 23:59: dentro' },
    ]);
    expect(d.tareas[0].comentarios).toBe(2);
  });
});

describe('cacheIa', () => {
  it('guarda y lee los avances ya resumidos', async () => {
    expect(await cacheIa.avance('x')).toBeNull();
    await cacheIa.guardarAvance('x', { avance: 'Se definió.', decision: '', bloqueo: '' });
    expect(await cacheIa.avance('x')).toEqual({ avance: 'Se definió.', decision: '', bloqueo: '' });
  });
});
