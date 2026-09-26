import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { crearRouterReportes, type DepsReportes } from '../src/routes/reportes.js';
import { levantarApp, limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, crearTarea, llamar, type Usuario } from './helpers/api.js';
import { query, uuid } from '../src/db/mysql.js';
import type { EmailOptions } from '../src/services/email.js';

const enviados: EmailOptions[] = [];
const llamadasIa: { tipo: string; indicaciones?: string }[] = [];
const dirPdf = fs.mkdtempSync(path.join(os.tmpdir(), 'reportes-'));

const deps: DepsReportes = {
  runner: {
    async trabajo(tipo, entrada: any, indicaciones) {
      llamadasIa.push({ tipo, indicaciones });
      const ids = (entrada.tareas ?? []).map((t: any) => t.id);
      if (tipo === 'reporte-descripciones') return { tareas: ids.map((id: string) => ({ id, de_que_trata: 'el tema' })) };
      if (tipo === 'reporte-avances') return { tareas: ids.map((id: string) => ({ id, avance: 'Se avanzó.', decision: '', bloqueo: '' })) };
      return { resumen_ejecutivo: indicaciones ? `Versión: ${indicaciones}` : 'Semana tranquila.', logros: [], decisiones: [], riesgos: [], mensaje_correo: 'Todo en orden.' };
    },
  },
  correo: { async enviar(o) { enviados.push(o); return true; } },
  esperar: async () => {},
  dirPdf,
  frontendUrl: 'https://tiusdei.test',
};

let api: { url: string; cerrar: () => Promise<void> };
let admin: Usuario;
let lider: Usuario;
let ana: Usuario;
let proyectoId: string;

beforeAll(async () => { api = await levantarApp(crearRouterReportes(deps)); });
afterAll(async () => { await api.cerrar(); await cerrarLimpieza(); fs.rmSync(dirPdf, { recursive: true, force: true }); });
beforeEach(async () => {
  await limpiarBase();
  enviados.length = 0;
  llamadasIa.length = 0;
  admin = await crearUsuario('Admin', 'admin');
  lider = await crearUsuario('Even Fierro', 'equipo');
  ana = await crearUsuario('Ana Mora', 'equipo');
  const marca = await crearMarca('Alba del Bosque');
  proyectoId = uuid();
  await query('INSERT INTO projects (id, brand_id, nombre, lider_user_id) VALUES (?, ?, ?, ?)', [proyectoId, marca, 'Bot Proyecta', lider.id]);
  const t = await crearTarea(marca, 'Momento de ofrecer cita', 'en_proceso');
  await query("UPDATE tasks SET project_id = ?, fecha_entrega = '2026-10-02', created_at = '2026-09-01 12:00:00' WHERE id = ?", [proyectoId, t]);
  await query("INSERT INTO comments (id, task_id, user_id, comentario, created_at) VALUES (?, ?, ?, 'Se acordó la regla.', '2026-09-23 15:00:00')", [uuid(), t, ana.id]);
});

const u = (ruta: string) => `${api.url}${ruta}`;
async function esperarEstado(id: string, quien: Usuario) {
  for (let i = 0; i < 50; i++) {
    const r = await llamar(u(`/reportes/${id}`), quien);
    if (r.body.estado !== 'generando') return r.body;
    await new Promise((res) => setTimeout(res, 50));
  }
  throw new Error('El reporte no terminó de generarse');
}
async function generado(quien: Usuario = lider) {
  const r = await llamar(u(`/projects/${proyectoId}/reportes/generar`), quien, 'POST', { desde: '2026-09-21', hasta: '2026-09-27' });
  expect(r.status).toBe(202);
  return esperarEstado(r.body.id, quien);
}

describe('configuración', () => {
  it('por defecto está apagada los lunes a las 8:00; el líder la activa y la cambia', async () => {
    expect((await llamar(u(`/projects/${proyectoId}/reportes/config`), lider)).body).toEqual({ activo: false, dia_entrega: 1, hora_entrega: '08:00', anticipacion_horas: 3 });
    const r = await llamar(u(`/projects/${proyectoId}/reportes/config`), lider, 'PUT', { activo: true, dia_entrega: 5, hora_entrega: '17:30' });
    expect(r.status).toBe(200);
    expect((await llamar(u(`/projects/${proyectoId}/reportes/config`), lider)).body).toMatchObject({ activo: true, dia_entrega: 5, hora_entrega: '17:30' });
  });

  it('valida el día y la hora; solo el líder o un admin la cambian', async () => {
    expect((await llamar(u(`/projects/${proyectoId}/reportes/config`), lider, 'PUT', { activo: true, dia_entrega: 8, hora_entrega: '08:00' })).status).toBe(400);
    expect((await llamar(u(`/projects/${proyectoId}/reportes/config`), lider, 'PUT', { activo: true, dia_entrega: 1, hora_entrega: '25:00' })).status).toBe(400);
    expect((await llamar(u(`/projects/${proyectoId}/reportes/config`), ana, 'PUT', { activo: true, dia_entrega: 1, hora_entrega: '08:00' })).status).toBe(403);
    expect((await llamar(u(`/projects/${proyectoId}/reportes/config`), admin, 'PUT', { activo: true, dia_entrega: 1, hora_entrega: '08:00' })).status).toBe(200);
  });
});

describe('generar, regenerar, aprobar', () => {
  it('"generar ahora" deja un borrador con el contenido y aparece en el historial', async () => {
    const r = await generado();
    expect(r).toMatchObject({ estado: 'borrador', periodo_desde: '2026-09-21', periodo_hasta: '2026-09-27' });
    expect(r.contenido.resumen_ejecutivo).toBe('Semana tranquila.');
    expect(r.contenido.grupos.find((g: any) => g.clave === 'en_curso').tareas[0]).toMatchObject({ titulo: 'Momento de ofrecer cita', linea: 'Se avanzó.' });
    const lista = await llamar(u(`/projects/${proyectoId}/reportes`), lider);
    expect(lista.body.map((x: any) => [x.periodo_desde, x.estado])).toEqual([['2026-09-21', 'borrador']]);
  });

  it('regenerar usa la indicación del líder solo en la redacción final y la guarda', async () => {
    const r = await generado();
    llamadasIa.length = 0;
    const g = await llamar(u(`/reportes/${r.id}/regenerar`), lider, 'POST', { indicaciones: 'Resalta los atrasos' });
    expect(g.status).toBe(202);
    const nuevo = await esperarEstado(r.id, lider);
    expect(nuevo).toMatchObject({ estado: 'borrador', indicaciones: 'Resalta los atrasos' });
    expect(nuevo.contenido.resumen_ejecutivo).toBe('Versión: Resalta los atrasos');
    expect(llamadasIa).toEqual([{ tipo: 'reporte-resumen', indicaciones: 'Resalta los atrasos' }]);
  });

  it('al aprobar guarda el PDF; aprobado ya no se regenera', async () => {
    const r = await generado();
    const a = await llamar(u(`/reportes/${r.id}/aprobar`), lider, 'POST');
    expect(a).toMatchObject({ status: 200, body: { estado: 'aprobado', aprobado_por_nombre: 'Even Fierro' } });
    expect(fs.existsSync(path.join(dirPdf, `${r.id}.pdf`))).toBe(true);
    expect(await llamar(u(`/reportes/${r.id}/regenerar`), lider, 'POST', {})).toMatchObject({ status: 409, body: { error: 'Solo se regenera un borrador.' } });
  });

  it('entrega el PDF del reporte', async () => {
    const r = await generado();
    const res = await fetch(u(`/reportes/${r.id}/pdf`), { headers: { Authorization: `Bearer ${lider.token}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('enviar', () => {
  it('solo se envía aprobado, a personas de Tiusdei, con copia y el PDF adjunto; queda registrado', async () => {
    const diego = await crearUsuario('Diego Ruiz', 'equipo');
    const r = await generado();
    expect(await llamar(u(`/reportes/${r.id}/enviar`), lider, 'POST', { para: [ana.id], cc: [] })).toMatchObject({ status: 409, body: { error: 'Primero aprueba el reporte.' } });
    await llamar(u(`/reportes/${r.id}/aprobar`), lider, 'POST');
    const e = await llamar(u(`/reportes/${r.id}/enviar`), lider, 'POST', { para: [ana.id], cc: [diego.id] });
    expect(e.status).toBe(200);
    const [correo] = enviados;
    const email = async (id: string) => (await query<any[]>('SELECT email FROM profiles WHERE id = ?', [id]))[0].email;
    expect(correo.to).toBe(await email(ana.id));
    expect(correo.cc).toBe(await email(diego.id));
    expect(correo.subject).toBe('Reporte semanal · Bot Proyecta · 21 sep – 27 sep 2026');
    expect(correo.html).toContain('Hola Ana Mora,');
    expect(correo.attachments?.[0]).toMatchObject({ filename: 'Reporte Bot Proyecta 2026-09-21 a 2026-09-27.pdf', contentType: 'application/pdf' });
    const detalle = await llamar(u(`/reportes/${r.id}`), lider);
    expect(detalle.body.envios).toHaveLength(1);
    // It can be sent again.
    expect((await llamar(u(`/reportes/${r.id}/enviar`), lider, 'POST', { para: [diego.id], cc: [] })).status).toBe(200);
  });

  it('no envía a clientes ni sin destinatarios', async () => {
    const cliente = await crearUsuario('Cliente', 'cliente');
    const r = await generado();
    await llamar(u(`/reportes/${r.id}/aprobar`), lider, 'POST');
    expect((await llamar(u(`/reportes/${r.id}/enviar`), lider, 'POST', { para: [cliente.id], cc: [] })).status).toBe(400);
    expect((await llamar(u(`/reportes/${r.id}/enviar`), lider, 'POST', { para: [], cc: [] })).status).toBe(400);
    expect(enviados).toEqual([]);
  });
});

describe('permisos', () => {
  it('quien no es líder ni admin no ve ni maneja los reportes del proyecto', async () => {
    const r = await generado(admin);
    expect((await llamar(u(`/reportes/${r.id}`), ana)).status).toBe(403);
    expect((await llamar(u(`/projects/${proyectoId}/reportes`), ana)).status).toBe(403);
    expect((await llamar(u(`/projects/${proyectoId}/reportes/generar`), ana, 'POST', {})).status).toBe(403);
    expect((await llamar(u(`/reportes/${r.id}/aprobar`), ana, 'POST')).status).toBe(403);
  });
});

describe('casos borde', () => {
  it('sin líder, o con el líder desactivado, no se configura ni se genera: primero hay que asignar uno', async () => {
    await query('UPDATE projects SET lider_user_id = NULL WHERE id = ?', [proyectoId]);
    const config = await llamar(u(`/projects/${proyectoId}/reportes/config`), admin, 'PUT', { activo: true, dia_entrega: 1, hora_entrega: '08:00' });
    expect(config).toMatchObject({ status: 409, body: { error: 'Asigna un líder activo al proyecto primero.' } });
    expect((await llamar(u(`/projects/${proyectoId}/reportes/generar`), admin, 'POST', {})).status).toBe(409);

    await query('UPDATE projects SET lider_user_id = ? WHERE id = ?', [lider.id, proyectoId]);
    await query('UPDATE profiles SET activo = 0 WHERE id = ?', [lider.id]);
    expect((await llamar(u(`/projects/${proyectoId}/reportes/generar`), admin, 'POST', {})).status).toBe(409);
  });

  it('no envía a personas desactivadas', async () => {
    const r = await generado();
    await llamar(u(`/reportes/${r.id}/aprobar`), lider, 'POST');
    await query('UPDATE profiles SET activo = 0 WHERE id = ?', [ana.id]);
    expect(await llamar(u(`/reportes/${r.id}/enviar`), lider, 'POST', { para: [ana.id], cc: [] })).toMatchObject({ status: 400 });
    expect(enviados).toEqual([]);
  });
});

