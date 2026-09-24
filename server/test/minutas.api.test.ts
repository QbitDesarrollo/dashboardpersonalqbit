import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { minutasRouter } from '../src/routes/minutas.js';
import {
  levantarApp, limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, crearProyecto, crearTarea, llamar, type Usuario,
} from './helpers/api.js';
import { query } from '../src/db/mysql.js';

let api: { url: string; cerrar: () => Promise<void> };
let even: Usuario;
let marcaId: string;

beforeAll(async () => { api = await levantarApp(minutasRouter); });
afterAll(async () => { await api.cerrar(); await cerrarLimpieza(); });
beforeEach(async () => {
  await limpiarBase();
  even = await crearUsuario('Even', 'ejecutivo');
  marcaId = await crearMarca('Dinatek');
});

describe('POST /minutas', () => {
  it('crea la primera minuta de la marca como M-01 con sus puntos numerados', async () => {
    const r = await llamar(`${api.url}/minutas`, even, 'POST', {
      brand_id: marcaId,
      fecha: '2026-09-22',
      titulo: 'Revisión de avance: home y catálogo',
      items: [
        { titulo: 'Filtro por categoría y marca en el catálogo' },
        { titulo: 'Enviar las fichas técnicas', responsable_cliente: true },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      numero: 1,
      codigo: 'M-01',
      titulo: 'Revisión de avance: home y catálogo',
      fecha: '2026-09-22',
      estado: 'borrador',
      owner: { id: even.id, nombre: 'Even' },
      progreso: { total: 2, cerrados: 0, enCurso: 0 },
    });
    expect(r.body.items.map((i: any) => [i.numero, i.titulo, i.responsable_cliente, i.estado])).toEqual([
      [1, 'Filtro por categoría y marca en el catálogo', false, 'pendiente'],
      [2, 'Enviar las fichas técnicas', true, 'pendiente'],
    ]);
  });

  it('numera por marca: la segunda de la marca es M-02 y otra marca empieza en M-01', async () => {
    const otraMarca = await crearMarca('Alba del Bosque');
    const base = { fecha: '2026-09-22', titulo: 'Reunión' };
    await llamar(`${api.url}/minutas`, even, 'POST', { ...base, brand_id: marcaId });
    const segunda = await llamar(`${api.url}/minutas`, even, 'POST', { ...base, brand_id: marcaId });
    const deOtra = await llamar(`${api.url}/minutas`, even, 'POST', { ...base, brand_id: otraMarca });
    expect([segunda.body.codigo, deOtra.body.codigo]).toEqual(['M-02', 'M-01']);
  });

  it('responde 400 si la marca no existe', async () => {
    const r = await llamar(`${api.url}/minutas`, even, 'POST', {
      brand_id: '00000000-0000-4000-8000-000000000000', fecha: '2026-09-22', titulo: 'Reunión',
    });
    expect(r).toEqual({ status: 400, body: { error: 'La marca no existe.' } });
  });

  it('responde 400 si el proyecto es de otra marca', async () => {
    const otraMarca = await crearMarca('Alba del Bosque');
    const proyectoAjeno = await crearProyecto(otraMarca, 'Asistente Proyecta · Bot');
    const r = await llamar(`${api.url}/minutas`, even, 'POST', {
      brand_id: marcaId, project_id: proyectoAjeno, fecha: '2026-09-22', titulo: 'Reunión',
    });
    expect(r).toEqual({ status: 400, body: { error: 'El proyecto no pertenece a esa marca.' } });
  });

  it('guarda el proyecto de la marca y devuelve su nombre', async () => {
    const proyecto = await crearProyecto(marcaId, 'Rediseño del sitio web Dinatek');
    const r = await llamar(`${api.url}/minutas`, even, 'POST', {
      brand_id: marcaId, project_id: proyecto, fecha: '2026-09-22', titulo: 'Reunión',
    });
    expect(r.body).toMatchObject({ project_id: proyecto, project_nombre: 'Rediseño del sitio web Dinatek', brand_nombre: 'Dinatek' });
  });

  it('guarda el equipo de la minuta con usuarios de Tiusdei', async () => {
    const carla = await crearUsuario('Carla Mora');
    const diego = await crearUsuario('Diego Ruiz');
    const r = await llamar(`${api.url}/minutas`, even, 'POST', {
      brand_id: marcaId, fecha: '2026-09-22', titulo: 'Reunión', miembros: [diego.id, carla.id, diego.id],
    });
    expect(r.body.miembros.map((m: any) => m.nombre)).toEqual(['Carla Mora', 'Diego Ruiz']);
  });

  it('responde 403 a un usuario con rol cliente', async () => {
    const cliente = await crearUsuario('Contacto del cliente', 'cliente');
    const r = await llamar(`${api.url}/minutas`, cliente, 'POST', { brand_id: marcaId, fecha: '2026-09-22', titulo: 'Reunión' });
    expect(r).toEqual({ status: 403, body: { error: 'Sin permisos' } });
  });
});

async function crearMinuta(usuario: Usuario, datos: Record<string, unknown>) {
  const r = await llamar(`${api.url}/minutas`, usuario, 'POST', { fecha: '2026-09-22', titulo: 'Reunión', ...datos });
  if (r.status !== 201) throw new Error(`No se creó la minuta: ${JSON.stringify(r.body)}`);
  return r.body;
}

describe('GET /minutas', () => {
  it('lista de la más reciente a la más antigua, con código, marca y avance', async () => {
    await crearMinuta(even, { brand_id: marcaId, fecha: '2026-09-01', titulo: 'Levantamiento' });
    await crearMinuta(even, { brand_id: marcaId, fecha: '2026-09-22', titulo: 'Revisión de avance', items: [{ titulo: 'Filtro' }] });
    const r = await llamar(`${api.url}/minutas`, even);
    expect(r.status).toBe(200);
    expect(r.body.map((m: any) => [m.codigo, m.titulo, m.brand_nombre, m.progreso.total])).toEqual([
      ['M-02', 'Revisión de avance', 'Dinatek', 1],
      ['M-01', 'Levantamiento', 'Dinatek', 0],
    ]);
  });

  it('filtra por marca y por proyecto', async () => {
    const alba = await crearMarca('Alba del Bosque');
    const bot = await crearProyecto(alba, 'Asistente Proyecta · Bot');
    await crearMinuta(even, { brand_id: marcaId, titulo: 'De Dinatek' });
    await crearMinuta(even, { brand_id: alba, titulo: 'De Alba, sin proyecto' });
    await crearMinuta(even, { brand_id: alba, project_id: bot, titulo: 'De Alba, del bot' });
    const porMarca = await llamar(`${api.url}/minutas?brand_id=${alba}`, even);
    const porProyecto = await llamar(`${api.url}/minutas?brand_id=${alba}&project_id=${bot}`, even);
    expect(porMarca.body.map((m: any) => m.titulo).sort()).toEqual(['De Alba, del bot', 'De Alba, sin proyecto']);
    expect(porProyecto.body.map((m: any) => m.titulo)).toEqual(['De Alba, del bot']);
  });

  it('busca en el título de la minuta y en sus puntos', async () => {
    await crearMinuta(even, { brand_id: marcaId, titulo: 'Kickoff del rediseño' });
    await crearMinuta(even, { brand_id: marcaId, titulo: 'Revisión', items: [{ titulo: 'Botón de WhatsApp en todas las páginas' }] });
    await crearMinuta(even, { brand_id: marcaId, titulo: 'Otra', items: [{ titulo: 'Descuento del 100% en envíos' }] });
    const porTitulo = await llamar(`${api.url}/minutas?q=kickoff`, even);
    const porPunto = await llamar(`${api.url}/minutas?q=whatsapp`, even);
    const comodin = await llamar(`${api.url}/minutas?q=${encodeURIComponent('%')}`, even);
    expect(porTitulo.body.map((m: any) => m.titulo)).toEqual(['Kickoff del rediseño']);
    expect(porPunto.body.map((m: any) => m.titulo)).toEqual(['Revisión']);
    expect(comodin.body.map((m: any) => m.titulo)).toEqual(['Otra']);
  });
});

describe('GET /minutas/:id', () => {
  it('devuelve el detalle con sus puntos', async () => {
    const creada = await crearMinuta(even, { brand_id: marcaId, items: [{ titulo: 'Filtro', descripcion: 'Por marca y categoría' }] });
    const r = await llamar(`${api.url}/minutas/${creada.id}`, even);
    expect(r.status).toBe(200);
    expect(r.body).toEqual(creada);
  });

  it('responde 404 si no existe', async () => {
    const r = await llamar(`${api.url}/minutas/00000000-0000-4000-8000-000000000000`, even);
    expect(r).toEqual({ status: 404, body: { error: 'Minuta no encontrada' } });
  });
});

describe('PATCH /minutas/:id', () => {
  it('edita título, resumen y la publica', async () => {
    const creada = await crearMinuta(even, { brand_id: marcaId });
    const r = await llamar(`${api.url}/minutas/${creada.id}`, even, 'PATCH', {
      titulo: 'Revisión de avance: home y catálogo',
      resumen: 'Acuerdo: el lanzamiento pasa al 26 de noviembre.',
      estado: 'publicada',
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      titulo: 'Revisión de avance: home y catálogo',
      resumen: 'Acuerdo: el lanzamiento pasa al 26 de noviembre.',
      estado: 'publicada',
      codigo: 'M-01',
    });
  });

  it('reemplaza el equipo y cambia o quita el proyecto', async () => {
    const carla = await crearUsuario('Carla Mora');
    const diego = await crearUsuario('Diego Ruiz');
    const proyecto = await crearProyecto(marcaId, 'Rediseño del sitio web Dinatek');
    const creada = await crearMinuta(even, { brand_id: marcaId, miembros: [carla.id] });
    const conProyecto = await llamar(`${api.url}/minutas/${creada.id}`, even, 'PATCH', { project_id: proyecto, miembros: [diego.id] });
    expect(conProyecto.body.project_nombre).toBe('Rediseño del sitio web Dinatek');
    expect(conProyecto.body.miembros.map((m: any) => m.nombre)).toEqual(['Diego Ruiz']);
    const sinProyecto = await llamar(`${api.url}/minutas/${creada.id}`, even, 'PATCH', { project_id: null });
    expect(sinProyecto.body.project_id).toBeNull();
  });

  it('rechaza un proyecto de otra marca', async () => {
    const alba = await crearMarca('Alba del Bosque');
    const ajeno = await crearProyecto(alba, 'Asistente Proyecta · Bot');
    const creada = await crearMinuta(even, { brand_id: marcaId });
    const r = await llamar(`${api.url}/minutas/${creada.id}`, even, 'PATCH', { project_id: ajeno });
    expect(r).toEqual({ status: 400, body: { error: 'El proyecto no pertenece a esa marca.' } });
  });
});

describe('POST /minutas/:id/items', () => {
  it('agrega un punto con el número siguiente', async () => {
    const creada = await crearMinuta(even, { brand_id: marcaId, items: [{ titulo: 'Filtro' }] });
    const r = await llamar(`${api.url}/minutas/${creada.id}/items`, even, 'POST', { titulo: 'Botón de WhatsApp' });
    expect(r.status).toBe(201);
    expect(r.body.items.map((i: any) => [i.numero, i.titulo])).toEqual([[1, 'Filtro'], [2, 'Botón de WhatsApp']]);
  });

  it('responde 404 si la minuta no existe', async () => {
    const r = await llamar(`${api.url}/minutas/00000000-0000-4000-8000-000000000000/items`, even, 'POST', { titulo: 'X' });
    expect(r).toEqual({ status: 404, body: { error: 'Minuta no encontrada' } });
  });
});

describe('PATCH /minuta-items/:id', () => {
  it('edita descripción, responsable, fecha y visibilidad', async () => {
    const diego = await crearUsuario('Diego Ruiz');
    const creada = await crearMinuta(even, { brand_id: marcaId, items: [{ titulo: 'Filtro' }] });
    const itemId = creada.items[0].id;
    const r = await llamar(`${api.url}/minuta-items/${itemId}`, even, 'PATCH', {
      descripcion: 'Por marca y categoría, sobre todo en celular.',
      responsable_user_id: diego.id,
      fecha_compromiso: '2026-10-06',
      visible_cliente: false,
    });
    expect(r.status).toBe(200);
    expect(r.body.items[0]).toMatchObject({
      descripcion: 'Por marca y categoría, sobre todo en celular.',
      responsable: { id: diego.id, nombre: 'Diego Ruiz' },
      fecha_compromiso: '2026-10-06',
      visible_cliente: false,
    });
  });

  it('al pasar el punto al cliente le quita el responsable del equipo', async () => {
    const diego = await crearUsuario('Diego Ruiz');
    const creada = await crearMinuta(even, { brand_id: marcaId, items: [{ titulo: 'Fichas técnicas', responsable_user_id: diego.id }] });
    const r = await llamar(`${api.url}/minuta-items/${creada.items[0].id}`, even, 'PATCH', { responsable_cliente: true });
    expect(r.body.items[0]).toMatchObject({ responsable: null, responsable_cliente: true });
  });

  it('al asignarle alguien del equipo deja de ser del cliente', async () => {
    const diego = await crearUsuario('Diego Ruiz');
    const creada = await crearMinuta(even, { brand_id: marcaId, items: [{ titulo: 'Fichas técnicas', responsable_cliente: true }] });
    const r = await llamar(`${api.url}/minuta-items/${creada.items[0].id}`, even, 'PATCH', { responsable_user_id: diego.id });
    expect(r.body.items[0]).toMatchObject({ responsable: { id: diego.id }, responsable_cliente: false });
  });

  it('responde 404 si el punto no existe', async () => {
    const r = await llamar(`${api.url}/minuta-items/00000000-0000-4000-8000-000000000000`, even, 'PATCH', { titulo: 'X' });
    expect(r).toEqual({ status: 404, body: { error: 'Punto no encontrado' } });
  });
});

describe('POST /minuta-items/:id/evidencias', () => {
  it('adjunta un enlace y un archivo de Drive al punto', async () => {
    const creada = await crearMinuta(even, { brand_id: marcaId, items: [{ titulo: 'Video en el home' }] });
    const itemId = creada.items[0].id;
    await llamar(`${api.url}/minuta-items/${itemId}/evidencias`, even, 'POST', {
      tipo: 'enlace', nombre: 'Home en staging', url: 'https://staging.example.com/home',
    });
    const r = await llamar(`${api.url}/minuta-items/${itemId}/evidencias`, even, 'POST', {
      tipo: 'drive', nombre: 'Video planta v2.mp4', url: 'https://drive.google.com/file/d/abc/view', drive_file_id: 'abc',
    });
    expect(r.status).toBe(201);
    expect(r.body.items[0].evidencias.map((e: any) => [e.tipo, e.nombre])).toEqual([
      ['enlace', 'Home en staging'],
      ['drive', 'Video planta v2.mp4'],
    ]);
  });

  it('rechaza una URL que no es http(s)', async () => {
    const creada = await crearMinuta(even, { brand_id: marcaId, items: [{ titulo: 'Video en el home' }] });
    const r = await llamar(`${api.url}/minuta-items/${creada.items[0].id}/evidencias`, even, 'POST', {
      tipo: 'enlace', nombre: 'Raro', url: 'javascript:alert(1)',
    });
    expect(r.status).toBe(400);
  });
});

async function puntoCon(datos: Record<string, unknown> = {}) {
  const creada = await crearMinuta(even, { brand_id: marcaId, items: [{ titulo: 'Video en el home', ...datos }] });
  return creada.items[0].id as string;
}

async function adjuntarEnlace(itemId: string) {
  await llamar(`${api.url}/minuta-items/${itemId}/evidencias`, even, 'POST', {
    tipo: 'enlace', nombre: 'Home en staging', url: 'https://staging.example.com/home',
  });
}

describe('POST /minuta-items/:id/accion', () => {
  it('no deja completar sin evidencia (lo valida el servidor)', async () => {
    const itemId = await puntoCon();
    const r = await llamar(`${api.url}/minuta-items/${itemId}/accion`, even, 'POST', {
      accion: 'completar', resolucion: 'Se reemplazó la imagen por un video de 12 s.',
    });
    expect(r).toEqual({ status: 422, body: { error: 'Falta al menos una evidencia.' } });
  });

  it('completa con evidencia y guarda qué se hizo, quién y cuándo', async () => {
    const itemId = await puntoCon();
    await adjuntarEnlace(itemId);
    const r = await llamar(`${api.url}/minuta-items/${itemId}/accion`, even, 'POST', {
      accion: 'completar', resolucion: '  Se reemplazó la imagen por un video de 12 s.  ',
    });
    expect(r.status).toBe(200);
    const punto = r.body.items[0];
    expect(punto).toMatchObject({
      estado: 'completado',
      resolucion: 'Se reemplazó la imagen por un video de 12 s.',
      completado_por: { id: even.id, nombre: 'Even' },
    });
    expect(punto.completado_en).toEqual(expect.any(String));
    expect(r.body.progreso).toEqual({ total: 1, cerrados: 1, enCurso: 0 });
  });

  it('aprueba en reunión y registra quién lo marcó', async () => {
    const itemId = await puntoCon();
    await adjuntarEnlace(itemId);
    await llamar(`${api.url}/minuta-items/${itemId}/accion`, even, 'POST', { accion: 'completar', resolucion: 'Video de 12 s en el home.' });
    const r = await llamar(`${api.url}/minuta-items/${itemId}/accion`, even, 'POST', { accion: 'aprobar' });
    expect(r.body.items[0]).toMatchObject({ estado: 'aprobado', aprobado_via: 'reunion', aprobado_por_nombre: 'Even' });
    expect(r.body.items[0].aprobado_en).toEqual(expect.any(String));
  });

  it('descarta con motivo y lo guarda', async () => {
    const itemId = await puntoCon();
    const r = await llamar(`${api.url}/minuta-items/${itemId}/accion`, even, 'POST', {
      accion: 'descartar', motivo: '  El cliente retiró el pedido.  ',
    });
    expect(r.body.items[0]).toMatchObject({ estado: 'descartado', motivo_descarte: 'El cliente retiró el pedido.' });
    expect(r.body.progreso.total).toBe(0);
  });

  it('al reabrir limpia quién y cuándo lo completó, pero conserva el texto', async () => {
    const itemId = await puntoCon();
    await adjuntarEnlace(itemId);
    await llamar(`${api.url}/minuta-items/${itemId}/accion`, even, 'POST', { accion: 'completar', resolucion: 'Video de 12 s en el home.' });
    const r = await llamar(`${api.url}/minuta-items/${itemId}/accion`, even, 'POST', { accion: 'reabrir' });
    expect(r.body.items[0]).toMatchObject({
      estado: 'en_curso', completado_por: null, completado_en: null, resolucion: 'Video de 12 s en el home.',
    });
  });

  it('al restaurar un descartado limpia el motivo', async () => {
    const itemId = await puntoCon();
    await llamar(`${api.url}/minuta-items/${itemId}/accion`, even, 'POST', { accion: 'descartar', motivo: 'Ya no aplica.' });
    const r = await llamar(`${api.url}/minuta-items/${itemId}/accion`, even, 'POST', { accion: 'restaurar' });
    expect(r.body.items[0]).toMatchObject({ estado: 'pendiente', motivo_descarte: null });
  });

  it('responde 422 con una acción desconocida (el dominio la rechaza)', async () => {
    const itemId = await puntoCon();
    const r = await llamar(`${api.url}/minuta-items/${itemId}/accion`, even, 'POST', { accion: 'constructor' });
    expect(r).toEqual({ status: 422, body: { error: 'Acción desconocida.' } });
  });
});

describe('POST /minuta-items/:id/tareas', () => {
  it('vincula una tarea de la misma marca y el punto la muestra', async () => {
    const itemId = await puntoCon();
    const tareaId = await crearTarea(marcaId, 'Editar el video de planta');
    const r = await llamar(`${api.url}/minuta-items/${itemId}/tareas`, even, 'POST', { task_id: tareaId });
    expect(r.status).toBe(200);
    expect(r.body.items[0].tareas).toEqual([
      expect.objectContaining({ id: tareaId, titulo_tarea: 'Editar el video de planta', estado: 'backlog' }),
    ]);
  });

  it('rechaza una tarea de otra marca', async () => {
    const itemId = await puntoCon();
    const alba = await crearMarca('Alba del Bosque');
    const ajena = await crearTarea(alba, 'Tarea de otro cliente');
    const r = await llamar(`${api.url}/minuta-items/${itemId}/tareas`, even, 'POST', { task_id: ajena });
    expect(r).toEqual({ status: 400, body: { error: 'La tarea es de otra marca.' } });
  });
});

describe('POST /minuta-items/:id/tareas · arranque automático', () => {
  it('pasa el punto a en curso si la tarea vinculada ya está en proceso', async () => {
    const itemId = await puntoCon();
    const tareaId = await crearTarea(marcaId, 'Implementar el filtro', 'en_proceso');
    const r = await llamar(`${api.url}/minuta-items/${itemId}/tareas`, even, 'POST', { task_id: tareaId });
    expect(r.body.items[0].estado).toBe('en_curso');
  });

  it('deja el punto pendiente si la tarea está en backlog', async () => {
    const itemId = await puntoCon();
    const tareaId = await crearTarea(marcaId, 'QA en móvil', 'backlog');
    const r = await llamar(`${api.url}/minuta-items/${itemId}/tareas`, even, 'POST', { task_id: tareaId });
    expect(r.body.items[0].estado).toBe('pendiente');
  });
});

describe('arranque automático cuando la tarea arranca después', () => {
  it('el punto aparece en curso en el detalle y en la lista', async () => {
    const creada = await crearMinuta(even, { brand_id: marcaId, items: [{ titulo: 'Filtro' }] });
    const itemId = creada.items[0].id;
    const tareaId = await crearTarea(marcaId, 'Implementar el filtro', 'backlog');
    await llamar(`${api.url}/minuta-items/${itemId}/tareas`, even, 'POST', { task_id: tareaId });
    // Alguien arranca el timer de la tarea desde otra pantalla de Tiusdei.
    await query("UPDATE tasks SET estado = 'en_proceso' WHERE id = ?", [tareaId]);
    const lista = await llamar(`${api.url}/minutas`, even);
    const detalle = await llamar(`${api.url}/minutas/${creada.id}`, even);
    expect(lista.body[0].progreso.enCurso).toBe(1);
    expect(detalle.body.items[0].estado).toBe('en_curso');
  });
});

describe('DELETE /minuta-items/:id/tareas/:taskId', () => {
  it('desvincula la tarea sin borrarla', async () => {
    const itemId = await puntoCon();
    const tareaId = await crearTarea(marcaId, 'Editar el video de planta');
    await llamar(`${api.url}/minuta-items/${itemId}/tareas`, even, 'POST', { task_id: tareaId });
    const r = await llamar(`${api.url}/minuta-items/${itemId}/tareas/${tareaId}`, even, 'DELETE');
    expect(r.status).toBe(200);
    expect(r.body.items[0].tareas).toEqual([]);
    const [tarea] = await query<any[]>('SELECT id, minuta_item_id FROM tasks WHERE id = ?', [tareaId]);
    expect(tarea).toEqual({ id: tareaId, minuta_item_id: null });
  });
});

describe('DELETE /minuta-evidencias/:id', () => {
  it('quita una evidencia de un punto abierto', async () => {
    const itemId = await puntoCon();
    await adjuntarEnlace(itemId);
    const antes = await llamar(`${api.url}/minutas`, even);
    const detalle = await llamar(`${api.url}/minutas/${antes.body[0].id}`, even);
    const evidenciaId = detalle.body.items[0].evidencias[0].id;
    const r = await llamar(`${api.url}/minuta-evidencias/${evidenciaId}`, even, 'DELETE');
    expect(r.status).toBe(200);
    expect(r.body.items[0].evidencias).toEqual([]);
  });

  it('no deja quitar la última evidencia de un punto cerrado', async () => {
    const itemId = await puntoCon();
    await adjuntarEnlace(itemId);
    const cerrado = await llamar(`${api.url}/minuta-items/${itemId}/accion`, even, 'POST', {
      accion: 'completar', resolucion: 'Video de 12 s en el home.',
    });
    const evidenciaId = cerrado.body.items[0].evidencias[0].id;
    const r = await llamar(`${api.url}/minuta-evidencias/${evidenciaId}`, even, 'DELETE');
    expect(r).toEqual({ status: 422, body: { error: 'Un punto cerrado necesita al menos una evidencia. Reábrelo para cambiarla.' } });
  });
});

describe('DELETE /minuta-items/:id', () => {
  it('borra un punto pendiente sin avance y no renumera los demás', async () => {
    const creada = await crearMinuta(even, { brand_id: marcaId, items: [{ titulo: 'Uno' }, { titulo: 'Dos' }, { titulo: 'Tres' }] });
    const r = await llamar(`${api.url}/minuta-items/${creada.items[1].id}`, even, 'DELETE');
    expect(r.status).toBe(200);
    expect(r.body.items.map((i: any) => [i.numero, i.titulo])).toEqual([[1, 'Uno'], [3, 'Tres']]);
  });

  it('no borra un punto que ya tiene tareas: hay que descartarlo', async () => {
    const itemId = await puntoCon();
    const tareaId = await crearTarea(marcaId, 'Editar el video');
    await llamar(`${api.url}/minuta-items/${itemId}/tareas`, even, 'POST', { task_id: tareaId });
    const r = await llamar(`${api.url}/minuta-items/${itemId}`, even, 'DELETE');
    expect(r).toEqual({ status: 422, body: { error: 'Este punto ya tiene avance. Descártalo en vez de borrarlo.' } });
  });
});

describe('DELETE /minutas/:id', () => {
  it('el responsable la borra y las tareas vinculadas siguen existiendo', async () => {
    const creada = await crearMinuta(even, { brand_id: marcaId, items: [{ titulo: 'Filtro' }] });
    const tareaId = await crearTarea(marcaId, 'Implementar el filtro');
    await llamar(`${api.url}/minuta-items/${creada.items[0].id}/tareas`, even, 'POST', { task_id: tareaId });
    const r = await llamar(`${api.url}/minutas/${creada.id}`, even, 'DELETE');
    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect((await llamar(`${api.url}/minutas/${creada.id}`, even)).status).toBe(404);
    const [tarea] = await query<any[]>('SELECT minuta_item_id FROM tasks WHERE id = ?', [tareaId]);
    expect(tarea.minuta_item_id).toBeNull();
  });

  it('alguien del equipo que no es el responsable no puede borrarla', async () => {
    const carla = await crearUsuario('Carla Mora', 'equipo');
    const creada = await crearMinuta(even, { brand_id: marcaId });
    const r = await llamar(`${api.url}/minutas/${creada.id}`, carla, 'DELETE');
    expect(r).toEqual({ status: 403, body: { error: 'Solo el responsable de la minuta o un administrador puede borrarla.' } });
  });
});

describe('enlace público · gestión', () => {
  it('activa el enlace y al activarlo de nuevo devuelve el mismo token', async () => {
    const creada = await crearMinuta(even, { brand_id: marcaId });
    const primero = await llamar(`${api.url}/minutas/${creada.id}/enlace`, even, 'POST');
    expect(primero.status).toBe(200);
    expect(primero.body.enlace_publico).toEqual({ activo: true, token: expect.stringMatching(/^mn_[0-9a-f]{40}$/) });
    const segundo = await llamar(`${api.url}/minutas/${creada.id}/enlace`, even, 'POST');
    expect(segundo.body.enlace_publico.token).toBe(primero.body.enlace_publico.token);
  });

  it('desactiva el enlace', async () => {
    const creada = await crearMinuta(even, { brand_id: marcaId });
    await llamar(`${api.url}/minutas/${creada.id}/enlace`, even, 'POST');
    const r = await llamar(`${api.url}/minutas/${creada.id}/enlace`, even, 'DELETE');
    expect(r.body.enlace_publico.activo).toBe(false);
  });
});

describe('evidencia con imagen', () => {
  it('acepta una imagen subida a Tiusdei', async () => {
    const itemId = await puntoCon();
    const r = await llamar(`${api.url}/minuta-items/${itemId}/evidencias`, even, 'POST', {
      tipo: 'imagen', nombre: 'captura-home.png', url: 'https://tiusdei.qbit.ec/uploads/editor/3f2a9c1e-7b1d-4c2a-9f10-8e5d2b7a1c44.png',
    });
    expect(r.status).toBe(201);
    expect(r.body.items[0].evidencias[0]).toMatchObject({ tipo: 'imagen', nombre: 'captura-home.png' });
  });

  it('rechaza una imagen que no se subió a Tiusdei', async () => {
    const itemId = await puntoCon();
    const r = await llamar(`${api.url}/minuta-items/${itemId}/evidencias`, even, 'POST', {
      tipo: 'imagen', nombre: 'pixel.png', url: 'https://tracker.example.com/pixel.png',
    });
    expect(r).toEqual({ status: 400, body: { error: 'La imagen debe subirse a Tiusdei.' } });
  });
});
