import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { minutasRouter } from '../src/routes/minutas.js';
import { levantarApp, limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, crearProyecto, llamar, type Usuario } from './helpers/api.js';

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
