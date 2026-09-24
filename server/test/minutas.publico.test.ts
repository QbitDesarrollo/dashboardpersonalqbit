import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { minutasRouter, minutasPublicRouter } from '../src/routes/minutas.js';
import { levantarApp, levantarAppEn, limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, llamar, type Usuario } from './helpers/api.js';

let interna: { url: string; cerrar: () => Promise<void> };
let publica: { url: string; cerrar: () => Promise<void> };
let even: Usuario;
let marcaId: string;

beforeAll(async () => {
  interna = await levantarApp(minutasRouter);
  publica = await levantarAppEn('/api', minutasPublicRouter);
});
afterAll(async () => { await interna.cerrar(); await publica.cerrar(); await cerrarLimpieza(); });
beforeEach(async () => {
  await limpiarBase();
  even = await crearUsuario('Even', 'ejecutivo');
  marcaId = await crearMarca('Dinatek');
});

async function minutaCompartida() {
  const diego = await crearUsuario('Diego Ruiz');
  const creada = await llamar(`${interna.url}/minutas`, even, 'POST', {
    brand_id: marcaId, fecha: '2026-09-22', titulo: 'Revisión de avance', resumen: 'Notas internas de la reunión.',
    items: [
      { titulo: 'Filtro por marca', descripcion: 'En celular', responsable_user_id: diego.id, fecha_compromiso: '2026-10-06' },
      { titulo: 'Video en el home' },
      { titulo: 'Costo de licencia' },
      { titulo: 'Idea descartada' },
      { titulo: 'Fichas técnicas', responsable_cliente: true },
    ],
  });
  const [filtro, video, licencia, descartada] = creada.body.items;
  await llamar(`${interna.url}/minuta-items/${video.id}/evidencias`, even, 'POST', { tipo: 'enlace', nombre: 'Home en staging', url: 'https://staging.example.com/home' });
  await llamar(`${interna.url}/minuta-items/${video.id}/accion`, even, 'POST', { accion: 'completar', resolucion: 'Video de 12 s en el home.' });
  await llamar(`${interna.url}/minuta-items/${filtro.id}/evidencias`, even, 'POST', { tipo: 'enlace', nombre: 'Avance', url: 'https://staging.example.com/wip' });
  await llamar(`${interna.url}/minuta-items/${licencia.id}`, even, 'PATCH', { visible_cliente: false });
  await llamar(`${interna.url}/minuta-items/${descartada.id}/accion`, even, 'POST', { accion: 'descartar', motivo: 'No va.' });
  const enlace = await llamar(`${interna.url}/minutas/${creada.body.id}/enlace`, even, 'POST');
  return { id: creada.body.id as string, token: enlace.body.enlace_publico.token as string };
}

describe('GET /public/minutas/:token', () => {
  it('muestra solo los puntos visibles, sin equipo, tareas ni resumen', async () => {
    const { token } = await minutaCompartida();
    const r = await llamar(`${publica.url}/public/minutas/${token}`, null);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      marca: 'Dinatek',
      codigo: 'M-01',
      titulo: 'Revisión de avance',
      fecha: '2026-09-22',
      puntos: [
        { numero: 1, titulo: 'Filtro por marca', descripcion: 'En celular', estado: 'pendiente', responsable_cliente: false, fecha_compromiso: '2026-10-06', resolucion: null, evidencias: [] },
        { numero: 2, titulo: 'Video en el home', descripcion: null, estado: 'completado', responsable_cliente: false, fecha_compromiso: null,
          resolucion: 'Video de 12 s en el home.', evidencias: [{ tipo: 'enlace', nombre: 'Home en staging', url: 'https://staging.example.com/home' }] },
        { numero: 5, titulo: 'Fichas técnicas', descripcion: null, estado: 'pendiente', responsable_cliente: true, fecha_compromiso: null, resolucion: null, evidencias: [] },
      ],
    });
  });

  it('responde 404 si el enlace está desactivado', async () => {
    const { id, token } = await minutaCompartida();
    await llamar(`${interna.url}/minutas/${id}/enlace`, even, 'DELETE');
    const r = await llamar(`${publica.url}/public/minutas/${token}`, null);
    expect(r).toEqual({ status: 404, body: { error: 'Este enlace no existe o fue desactivado.' } });
  });

  it('responde 404 con un token que no existe', async () => {
    const r = await llamar(`${publica.url}/public/minutas/mn_noexiste`, null);
    expect(r.status).toBe(404);
  });
});
