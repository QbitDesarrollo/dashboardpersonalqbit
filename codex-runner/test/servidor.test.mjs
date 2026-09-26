import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../servidor.mjs';

const TOKEN = 'x'.repeat(40);

async function levantar(opciones = {}) {
  const servidor = crearServidor({
    token: TOKEN,
    verificarSesion: async () => ({ listo: true, detalle: 'Logged in using ChatGPT' }),
    generar: async (datos) => ({ titulo: `Minuta ${datos.fecha}`, recibido: datos, puntos: [] }),
    trabajar: async (tipo, datos) => ({ tipo, recibido: datos }),
    log: { error: () => {} },
    ...opciones,
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const llamar = (ruta, { token = TOKEN, ...init } = {}) =>
    fetch(`${base}${ruta}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return { servidor, llamar };
}

const cuerpo = (datos) => ({ method: 'POST', body: JSON.stringify(datos) });

test('rechaza pedidos sin token o con un token distinto', async (t) => {
  const { servidor, llamar } = await levantar();
  t.after(() => servidor.close());
  assert.equal((await llamar('/salud', { token: null })).status, 401);
  assert.equal((await llamar('/salud', { token: 'y'.repeat(40) })).status, 401);
  assert.equal((await llamar('/salud', { token: TOKEN.slice(1) })).status, 401);
});

test('salud informa si Codex tiene la sesión iniciada', async (t) => {
  const { servidor, llamar } = await levantar({ verificarSesion: async () => ({ listo: false, detalle: 'Not logged in' }) });
  t.after(() => servidor.close());
  const r = await llamar('/salud');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { listo: false, detalle: 'Not logged in' });
});

test('genera la minuta con la transcripción y la fecha', async (t) => {
  const { servidor, llamar } = await levantar();
  t.after(() => servidor.close());
  const r = await llamar('/minuta', cuerpo({ transcripcion: 'Hola, revisamos el home.', fecha: '2026-09-24' }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {
    titulo: 'Minuta 2026-09-24', puntos: [],
    recibido: { transcripcion: 'Hola, revisamos el home.', notasCliente: '', indicaciones: '', fecha: '2026-09-24' },
  });
});

test('acepta lo que mandó el cliente y las indicaciones, aunque no haya transcripción', async (t) => {
  const { servidor, llamar } = await levantar();
  t.after(() => servidor.close());
  const r = await llamar('/minuta', cuerpo({ notas_cliente: '- Agregar incidencias', indicaciones: 'Solo lo del portal', fecha: '2026-09-24' }));
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).recibido, { transcripcion: '', notasCliente: '- Agregar incidencias', indicaciones: 'Solo lo del portal', fecha: '2026-09-24' });
});

test('valida la transcripción y la fecha', async (t) => {
  const { servidor, llamar } = await levantar({ maxCaracteres: 20 });
  t.after(() => servidor.close());
  const vacia = await llamar('/minuta', cuerpo({ transcripcion: '   ', notas_cliente: ' ', fecha: '2026-09-24' }));
  assert.equal(vacia.status, 400);
  assert.deepEqual(await vacia.json(), { error: 'Falta la transcripción o lo que mandó el cliente.' });
  const notasLargas = await llamar('/minuta', cuerpo({ notas_cliente: 'a'.repeat(30_001), fecha: '2026-09-24' }));
  assert.equal(notasLargas.status, 413);
  assert.deepEqual(await notasLargas.json(), { error: 'Lo que mandó el cliente es demasiado largo.' });
  const indicaciones = await llamar('/minuta', cuerpo({ transcripcion: 'Hola', indicaciones: 'a'.repeat(501), fecha: '2026-09-24' }));
  assert.equal(indicaciones.status, 400);
  assert.deepEqual(await indicaciones.json(), { error: 'Las indicaciones son demasiado largas (máximo 500 caracteres).' });
  const sinFecha = await llamar('/minuta', cuerpo({ transcripcion: 'Hola', fecha: '24/09/2026' }));
  assert.equal(sinFecha.status, 400);
  assert.deepEqual(await sinFecha.json(), { error: 'La fecha debe tener el formato AAAA-MM-DD.' });
  const larga = await llamar('/minuta', cuerpo({ transcripcion: 'a'.repeat(21), fecha: '2026-09-24' }));
  assert.equal(larga.status, 413);
  assert.deepEqual(await larga.json(), { error: 'La transcripción es demasiado larga.' });
  const rota = await llamar('/minuta', { method: 'POST', body: '{no es json' });
  assert.equal(rota.status, 400);
});

test('atiende una minuta a la vez', async (t) => {
  let soltar;
  const { servidor, llamar } = await levantar({ generar: () => new Promise((r) => { soltar = () => r({ titulo: 'x', resumen: '', puntos: [] }); }) });
  t.after(() => servidor.close());
  const primera = llamar('/minuta', cuerpo({ transcripcion: 'Uno', fecha: '2026-09-24' }));
  await new Promise((r) => setTimeout(r, 50));
  const segunda = await llamar('/minuta', cuerpo({ transcripcion: 'Dos', fecha: '2026-09-24' }));
  assert.equal(segunda.status, 429);
  assert.deepEqual(await segunda.json(), { error: 'Codex está ocupado con otra minuta. Intenta en un minuto.' });
  soltar();
  assert.equal((await primera).status, 200);
  const tercera = llamar('/minuta', cuerpo({ transcripcion: 'Tres', fecha: '2026-09-24' }));
  await new Promise((r) => setTimeout(r, 50));
  soltar();
  assert.equal((await tercera).status, 200);
});

test('si Codex falla responde 502 sin filtrar el detalle', async (t) => {
  const { servidor, llamar } = await levantar({ generar: async () => { throw new Error('token /home/codex-ia/.codex/auth.json vencido'); } });
  t.after(() => servidor.close());
  const r = await llamar('/minuta', cuerpo({ transcripcion: 'Hola', fecha: '2026-09-24' }));
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { error: 'Codex no pudo generar la minuta.' });
});

test('corre un trabajo de reportes con su tipo, sus datos y las indicaciones', async (t) => {
  const { servidor, llamar } = await levantar();
  t.after(() => servidor.close());
  const r = await llamar('/trabajo', cuerpo({ tipo: 'reporte-avances', entrada: { tareas: [{ id: 't1' }] }, indicaciones: 'Menos técnico' }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { tipo: 'reporte-avances', recibido: { entrada: { tareas: [{ id: 't1' }] }, indicaciones: 'Menos técnico' } });
});

test('valida el tipo, los datos y las indicaciones del trabajo', async (t) => {
  const { servidor, llamar } = await levantar();
  t.after(() => servidor.close());
  const tipo = await llamar('/trabajo', cuerpo({ tipo: 'borrar-todo', entrada: {} }));
  assert.equal(tipo.status, 400);
  assert.deepEqual(await tipo.json(), { error: 'Tipo de trabajo desconocido.' });
  const sinDatos = await llamar('/trabajo', cuerpo({ tipo: 'reporte-resumen', entrada: 'texto' }));
  assert.equal(sinDatos.status, 400);
  assert.deepEqual(await sinDatos.json(), { error: 'Faltan los datos del trabajo.' });
  const indicaciones = await llamar('/trabajo', cuerpo({ tipo: 'reporte-resumen', entrada: {}, indicaciones: 'a'.repeat(501) }));
  assert.equal(indicaciones.status, 400);
});

test('una minuta y un trabajo no corren a la vez: Codex es uno solo', async (t) => {
  let soltar;
  const { servidor, llamar } = await levantar({ generar: () => new Promise((r) => { soltar = () => r({ titulo: 'x', resumen: '', puntos: [] }); }) });
  t.after(() => servidor.close());
  const minuta = llamar('/minuta', cuerpo({ transcripcion: 'Uno', fecha: '2026-09-24' }));
  await new Promise((r) => setTimeout(r, 50));
  const trabajo = await llamar('/trabajo', cuerpo({ tipo: 'reporte-resumen', entrada: {} }));
  assert.equal(trabajo.status, 429);
  assert.deepEqual(await trabajo.json(), { error: 'Codex está ocupado con otro trabajo. Intenta en un minuto.' });
  soltar();
  assert.equal((await minuta).status, 200);
});

test('si un trabajo falla responde 502 sin filtrar el detalle', async (t) => {
  const { servidor, llamar } = await levantar({ trabajar: async () => { throw new Error('/home/codex-ia/secreto'); } });
  t.after(() => servidor.close());
  const r = await llamar('/trabajo', cuerpo({ tipo: 'reporte-descripciones', entrada: { tareas: [] } }));
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { error: 'Codex no pudo completar el trabajo.' });
});

test('responde 404 a cualquier otra ruta', async (t) => {
  const { servidor, llamar } = await levantar();
  t.after(() => servidor.close());
  assert.equal((await llamar('/otra')).status, 404);
});
