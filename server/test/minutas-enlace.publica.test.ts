import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { crearRouterMinutaPublica } from '../src/routes/public-minuta.js';
import { levantarAppEn, limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, type Usuario } from './helpers/api.js';
import { query, queryOne, uuid } from '../src/db/mysql.js';
import type { EmailOptions } from '../src/services/email.js';

const TOKEN = 'tok_publico_de_prueba_0123456789abcdef';
const CODIGO = 'K7P2QX';
const IMAGEN = `${uuid()}.png`;
const DIR_IMAGENES = path.join(process.cwd(), 'uploads', 'editor');
const BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const correos: EmailOptions[] = [];

let api: { url: string; cerrar: () => Promise<void> };
let even: Usuario;
let minutaId: string;
let visible: string;
let oculto: string;
let descartado: string;

beforeAll(async () => {
  fs.mkdirSync(DIR_IMAGENES, { recursive: true });
  fs.writeFileSync(path.join(DIR_IMAGENES, IMAGEN), BYTES);
  api = await levantarAppEn('/api', crearRouterMinutaPublica({ limitePorMinuto: 10_000, correo: { async enviar(o) { correos.push(o); return true; } }, frontendUrl: 'https://tiusdei.test' }));
});
afterAll(async () => {
  fs.rmSync(path.join(DIR_IMAGENES, IMAGEN), { force: true });
  await api.cerrar();
  await cerrarLimpieza();
});
beforeEach(async () => {
  await limpiarBase();
  correos.length = 0;
  even = await crearUsuario('Even Fierro', 'admin');
  const marca = await crearMarca('Alba del Bosque');
  minutaId = uuid();
  await query(
    `INSERT INTO minutas (id, brand_id, numero, titulo, fecha, owner_user_id, resumen, share_token, share_activo, share_codigo)
     VALUES (?, ?, 1, 'Seguimiento semanal', '2026-09-24', ?, 'Acuerdos de la semana', ?, 1, ?)`,
    [minutaId, marca, even.id, TOKEN, CODIGO],
  );
  const punto = async (numero: number, titulo: string, visibleCliente = 1) => {
    const id = uuid();
    await query(
      `INSERT INTO minuta_items (id, minuta_id, numero, titulo, estado, responsable_user_id, visible_cliente, sort_order)
       VALUES (?, ?, ?, ?, 'completado', ?, ?, ?)`,
      [id, minutaId, numero, titulo, even.id, visibleCliente, numero],
    );
    return id;
  };
  visible = await punto(1, 'Panel de alertas');
  oculto = await punto(2, 'Solo para el equipo', 0);
  descartado = await punto(3, 'Descartado');
  await query("UPDATE minuta_items SET estado = 'descartado' WHERE id = ?", [descartado]);
  const host = new URL(process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec').origin;
  await query("INSERT INTO minuta_item_evidencias (id, item_id, tipo, nombre, url) VALUES (?, ?, 'imagen', 'captura.png', ?)", [uuid(), visible, `${host}/uploads/editor/${IMAGEN}`]);
  await query("INSERT INTO minuta_item_evidencias (id, item_id, tipo, nombre, url) VALUES (?, ?, 'enlace', 'Sitio', 'https://proyecta.ec/')", [uuid(), visible]);
  await query("INSERT INTO minuta_envios (id, minuta_id, medio, para, mensaje, enviado_por) VALUES (?, ?, 'correo', ?, 'x', ?)",
    [uuid(), minutaId, JSON.stringify([{ nombre: 'Antonio Pérez', email: 'antonio@alba.ec' }, { nombre: 'María León', email: 'maria@alba.ec' }]), even.id]);
});

const u = (ruta: string) => `${api.url}/public/minuta/${TOKEN}${ruta}`;
async function pedir(ruta: string, metodo = 'GET', body?: unknown, sesion?: string) {
  const res = await fetch(u(ruta), {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(sesion ? { Authorization: `Bearer ${sesion}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texto = await res.text();
  let json: any = null;
  try { json = JSON.parse(texto); } catch { /* not JSON */ }
  return { status: res.status, body: json };
}
async function entrar(nombre = 'Antonio Pérez') {
  const r = await pedir('/entrar', 'POST', { codigo: CODIGO, nombre });
  expect(r.status).toBe(200);
  return r.body.sesion as string;
}

describe('entrar al enlace', () => {
  it('primero el código: si es correcto, ofrece los nombres de a quienes se envió', async () => {
    const r = await pedir('/entrar', 'POST', { codigo: 'k7p-2qx' });
    expect(r).toMatchObject({ status: 200, body: { titulo: 'Seguimiento semanal', marca: 'Alba del Bosque', nombres: ['Antonio Pérez', 'María León'] } });
    expect(r.body.sesion).toBeUndefined();
  });

  it('con el nombre entra, y queda quién entró', async () => {
    expect(await entrar('María León')).toMatch(/\S+\.\S+\.\S+/);
    expect(await query<any[]>('SELECT nombre FROM minuta_accesos WHERE minuta_id = ?', [minutaId])).toEqual([{ nombre: 'María León' }]);
  });

  it('antes de poner el código no se ven los nombres', async () => {
    expect(await pedir('/entrar', 'POST', { codigo: 'AAAAAA' })).toMatchObject({ status: 401, body: { error: 'El código no es correcto.' } });
  });

  it('cinco códigos errados bloquean el enlace 15 minutos, incluso para el código correcto', async () => {
    for (let i = 0; i < 4; i++) expect((await pedir('/entrar', 'POST', { codigo: 'AAAAAA' })).status).toBe(401);
    expect(await pedir('/entrar', 'POST', { codigo: 'AAAAAA' })).toMatchObject({ status: 429, body: { error: 'Demasiados intentos. Prueba de nuevo en 15 minutos.' } });
    expect((await pedir('/entrar', 'POST', { codigo: CODIGO, nombre: 'Antonio Pérez' })).status).toBe(429);
  });

  it('un enlace apagado o que no existe no dice nada de la minuta', async () => {
    await query('UPDATE minutas SET share_activo = 0 WHERE id = ?', [minutaId]);
    expect(await pedir('/entrar', 'POST', { codigo: CODIGO })).toMatchObject({ status: 404, body: { error: 'Este enlace ya no está disponible.' } });
    const otro = await fetch(`${api.url}/public/minuta/no-existe/entrar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: CODIGO }) });
    expect(otro.status).toBe(404);
  });

  it('el nombre es obligatorio y corto', async () => {
    expect((await pedir('/entrar', 'POST', { codigo: CODIGO, nombre: '   ' })).status).toBe(400);
    expect((await pedir('/entrar', 'POST', { codigo: CODIGO, nombre: 'x'.repeat(121) })).status).toBe(400);
  });
});

describe('ver la minuta', () => {
  it('sin sesión no se ve nada', async () => {
    expect((await pedir('')).status).toBe(401);
    expect((await pedir('', 'GET', undefined, 'basura')).status).toBe(401);
  });

  it('solo los puntos visibles, sin gente del equipo, y la imagen con una URL firmada que sí se descarga', async () => {
    const r = await pedir('', 'GET', undefined, await entrar());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ titulo: 'Seguimiento semanal', codigo: 'M-01', brand_nombre: 'Alba del Bosque', visitante: 'Antonio Pérez' });
    expect(r.body.items.map((i: any) => i.id)).toEqual([visible]);
    expect(JSON.stringify(r.body)).not.toContain('Even Fierro');
    expect(JSON.stringify(r.body)).not.toContain('/uploads/editor/');
    const [imagen, enlace] = r.body.items[0].evidencias;
    expect(enlace.url).toBe('https://proyecta.ec/');
    expect(imagen.url).toMatch(new RegExp(`^/api/public/minuta/${TOKEN}/evidencias/`));
    const archivo = await fetch(`${api.url}${imagen.url.replace(/^\/api/, '')}`);
    expect(archivo.status).toBe(200);
    expect(archivo.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await archivo.arrayBuffer())).toEqual(BYTES);
  });

  it('una firma alterada no descarga la imagen', async () => {
    const r = await pedir('', 'GET', undefined, await entrar());
    const url = r.body.items[0].evidencias[0].url.replace(/sig=[0-9a-f]/, 'sig=z');
    expect((await fetch(`${api.url}${url.replace(/^\/api/, '')}`)).status).toBe(404);
  });

  it('al cambiar el código o apagar el enlace, se corta la sesión y dejan de verse las imágenes', async () => {
    const sesion = await entrar();
    const imagen = (await pedir('', 'GET', undefined, sesion)).body.items[0].evidencias[0].url;
    await query("UPDATE minutas SET share_codigo = 'ZZZZZZ', share_version = share_version + 1 WHERE id = ?", [minutaId]);
    expect((await pedir('', 'GET', undefined, sesion)).status).toBe(401);
    expect((await fetch(`${api.url}${imagen.replace(/^\/api/, '')}`)).status).toBe(404);
  });
});

describe('lo que hace el cliente', () => {
  it('aprueba con el nombre con que entró, no con el que mande después, y avisa al dueño de la minuta', async () => {
    const sesion = await entrar();
    const r = await pedir(`/puntos/${visible}/aprobar`, 'POST', { nombre: 'Otro' }, sesion);
    expect(r.status).toBe(200);
    expect(r.body.items[0]).toMatchObject({ estado: 'aprobado', aprobado_via: 'enlace', aprobado_por_nombre: 'Antonio Pérez' });
    const aviso = await queryOne<{ mensaje: string }>('SELECT mensaje FROM notifications WHERE user_id = ?', [even.id]);
    expect(aviso?.mensaje).toBe('Antonio Pérez aprobó el punto 1.1 de la minuta M-01 · Seguimiento semanal (Alba del Bosque).');
    await new Promise((r) => setTimeout(r, 50));
    expect(correos).toHaveLength(1);
    expect(correos[0].to).toBe(await queryOne<{ email: string }>('SELECT email FROM profiles WHERE id = ?', [even.id]).then((p) => p!.email));
    expect(correos[0].subject).toBe('Antonio Pérez aprobó el punto 1.1 · M-01 Seguimiento semanal');
    expect(correos[0].html).toContain('https://tiusdei.test/minutas/');
  });

  it('pide un ajuste con motivo: el punto vuelve a en curso y el ajuste queda con su nombre', async () => {
    const sesion = await entrar();
    expect((await pedir(`/puntos/${visible}/ajuste`, 'POST', { motivo: '  ' }, sesion)).status).toBe(400);
    const r = await pedir(`/puntos/${visible}/ajuste`, 'POST', { motivo: 'Cambiar el color del botón' }, sesion);
    expect(r.body.items[0]).toMatchObject({ estado: 'en_curso' });
    expect(r.body.items[0].notas).toEqual([expect.objectContaining({ tipo: 'ajuste', texto: 'Cambiar el color del botón', autor_nombre: 'Antonio Pérez' })]);
    expect(await query<any[]>('SELECT autor_user_id, via FROM minuta_item_notas')).toEqual([{ autor_user_id: null, via: 'enlace' }]);
  });

  it('deja una nota', async () => {
    const r = await pedir(`/puntos/${visible}/notas`, 'POST', { texto: 'Se ve muy bien' }, await entrar('María León'));
    expect(r.status).toBe(201);
    expect(r.body.items[0].notas).toEqual([expect.objectContaining({ tipo: 'nota', texto: 'Se ve muy bien', autor_nombre: 'María León' })]);
  });

  it('no toca puntos que no ve ni de otras minutas; aprobar algo no completado explica por qué', async () => {
    const sesion = await entrar();
    expect((await pedir(`/puntos/${oculto}/notas`, 'POST', { texto: 'Hola' }, sesion)).status).toBe(404);
    expect((await pedir(`/puntos/${descartado}/aprobar`, 'POST', {}, sesion)).status).toBe(404);
    await query("UPDATE minuta_items SET estado = 'en_curso' WHERE id = ?", [visible]);
    expect((await pedir(`/puntos/${visible}/aprobar`, 'POST', {}, sesion)).status).toBe(422);
  });
});
