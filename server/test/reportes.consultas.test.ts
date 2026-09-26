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
  it('trae el proyecto y sus tareas principales con fechas de Ecuador, subtareas y el texto plano de la descripción', async () => {
    const t1 = await tareaDelProyecto('Momento de ofrecer cita', {
      detalle: '<p>Hola <b>equipo</b></p>', responsable_user_id: ana.id, fecha_entrega: '2026-10-02', created_at: '2026-09-01 03:00:00',
    });
    await query('INSERT INTO tasks (id, brand_id, titulo_tarea, estado, parent_task_id, project_id) VALUES (?, ?, ?, ?, ?, ?)', [uuid(), marcaId, 'Sub 1', 'entregado', t1, proyectoId]);
    await query('INSERT INTO tasks (id, brand_id, titulo_tarea, estado, parent_task_id, project_id) VALUES (?, ?, ?, ?, ?, ?)', [uuid(), marcaId, 'Sub 2', 'backlog', t1, proyectoId]);
    const t2 = await tareaDelProyecto('Menú de incidencias', { estado: 'entregado' });
    await query("INSERT INTO activity_log (id, entity_type, entity_id, action, field_name, old_value, new_value, user_id, created_at) VALUES (?, 'task', ?, 'status_change', 'estado', 'en_proceso', 'entregado', ?, '2026-09-24 15:00:00')", [uuid(), t2, oriana.id]);
    const otro = uuid();
    await query('INSERT INTO projects (id, brand_id, nombre) VALUES (?, ?, ?)', [otro, marcaId, 'Otro']);
    const ajena = await crearTarea(marcaId, 'De otro proyecto');
    await query('UPDATE tasks SET project_id = ? WHERE id = ?', [otro, ajena]);

    const d = await datosDelReporte(proyectoId, PERIODO);
    expect(d.proyecto).toMatchObject({ id: proyectoId, nombre: 'Bot Proyecta', marca: 'Alba del Bosque', lider: 'Even Fierro' });
    // Same numbers as the Proyectos screen, which counts subtasks too: 2 of 4 done.
    expect(d.avanceProyecto).toEqual({ total: 4, listas: 2 });
    expect(d.tareas.map((t) => t.titulo).sort()).toEqual(['Menú de incidencias', 'Momento de ofrecer cita']);
    expect(d.tareas.find((t) => t.id === t1)).toEqual({
      id: t1, titulo: 'Momento de ofrecer cita', estado: 'en_proceso', fecha_entrega: '2026-10-02', responsable: 'Ana Mora',
      creada: '2026-08-31', cerrada: null, detalle: 'Hola equipo', subtareas: '1/2',
    });
    expect(d.tareas.find((t) => t.id === t2)).toMatchObject({ cerrada: '2026-09-24', subtareas: null });
    expect(d.cambios.get(t2)).toEqual([{ fecha: '2026-09-24', de: 'En proceso', a: 'Entregado', por: 'Oriana Barcia' }]);
  });

  it('solo toma los comentarios del periodo según la hora de Ecuador', async () => {
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
  });
});

describe('cacheIa', () => {
  it('guarda y lee el "de qué trata" y los avances', async () => {
    const t1 = await tareaDelProyecto('Momento de ofrecer cita');
    await cacheIa.guardarResumen(t1, 'h1', 'definir cuándo se ofrece la cita');
    await cacheIa.guardarResumen(t1, 'h2', 'la versión nueva');
    expect(await cacheIa.resumenes([t1, uuid()])).toEqual(new Map([[t1, { hash: 'h2', resumen: 'la versión nueva' }]]));
    expect(await cacheIa.avance('x')).toBeNull();
    await cacheIa.guardarAvance('x', { avance: 'Se definió.', decision: '', bloqueo: '' });
    expect(await cacheIa.avance('x')).toEqual({ avance: 'Se definió.', decision: '', bloqueo: '' });
  });
});
