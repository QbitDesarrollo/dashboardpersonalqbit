import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { crearRouterMinutaEnlace, type DepsMinutaEnlace } from '../src/routes/minuta-enlace.js';
import { levantarApp, limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, llamar, type Usuario } from './helpers/api.js';
import { query, queryOne, uuid } from '../src/db/mysql.js';
import { ErrorRunnerOcupado } from '../src/minutas/ia/runner.js';
import type { EmailOptions } from '../src/services/email.js';

const enviados: EmailOptions[] = [];
const llamadasIa: { tipo: string; entrada: any }[] = [];
let respuestaIa: () => Promise<unknown> = async () => ({ resumen: 'Se revisó el panel de alertas y queda un ajuste.' });
let correoFalla = false;

const deps: DepsMinutaEnlace = {
  runner: { async trabajo(tipo, entrada) { llamadasIa.push({ tipo, entrada }); return respuestaIa(); } },
  correo: { async enviar(o) { if (correoFalla) return false; enviados.push(o); return true; } },
  frontendUrl: 'https://tiusdei.test',
};

let api: { url: string; cerrar: () => Promise<void> };
let even: Usuario;
let cliente: Usuario;
let marca: string;
let minutaId: string;

beforeAll(async () => { api = await levantarApp(crearRouterMinutaEnlace(deps)); });
afterAll(async () => { await api.cerrar(); await cerrarLimpieza(); });
beforeEach(async () => {
  await limpiarBase();
  enviados.length = 0;
  llamadasIa.length = 0;
  correoFalla = false;
  respuestaIa = async () => ({ resumen: 'Se revisó el panel de alertas y queda un ajuste.' });
  even = await crearUsuario('Even Fierro', 'admin');
  cliente = await crearUsuario('Cliente', 'cliente');
  marca = await crearMarca('Alba del Bosque');
  minutaId = uuid();
  await query("INSERT INTO minutas (id, brand_id, numero, titulo, fecha, owner_user_id) VALUES (?, ?, 1, 'Seguimiento semanal', '2026-09-24', ?)", [minutaId, marca, even.id]);
  await query("INSERT INTO minuta_items (id, minuta_id, numero, titulo, descripcion, estado, visible_cliente, responsable_user_id) VALUES (?, ?, 1, 'Panel de alertas', 'Revisar alertas', 'completado', 1, ?)", [uuid(), minutaId, even.id]);
  await query("INSERT INTO minuta_items (id, minuta_id, numero, titulo, estado, visible_cliente) VALUES (?, ?, 2, 'Tema interno del equipo', 'pendiente', 0)", [uuid(), minutaId]);
});

const u = (ruta: string) => `${api.url}/minutas/${minutaId}${ruta}`;
const PARA = [{ nombre: 'Antonio Pérez', email: 'antonio@alba.ec' }, { nombre: 'María León', email: 'maria@alba.ec' }];

describe('enlace para el cliente', () => {
  it('una minuta nueva no tiene enlace; al activarlo se crea con un código de 6 caracteres', async () => {
    expect((await llamar(u('/enlace'), even)).body).toMatchObject({ activo: false, url: null, codigo: null, accesos: [], envios: [] });
    const r = await llamar(u('/enlace'), even, 'POST', { accion: 'activar' });
    expect(r.status).toBe(200);
    expect(r.body.activo).toBe(true);
    expect(r.body.url).toMatch(/^https:\/\/tiusdei\.test\/m\/[0-9a-f]{64}$/);
    expect(r.body.codigo).toMatch(/^[A-Z2-9]{6}$/);
  });

  it('apagarlo y cambiar el código invalida lo anterior; prenderlo de nuevo conserva el enlace', async () => {
    const a = (await llamar(u('/enlace'), even, 'POST', { accion: 'activar' })).body;
    const version = async () => Number((await queryOne<any>('SELECT share_version FROM minutas WHERE id = ?', [minutaId])).share_version);
    const v0 = await version();
    expect((await llamar(u('/enlace'), even, 'POST', { accion: 'apagar' })).body.activo).toBe(false);
    expect(await version()).toBe(v0 + 1);
    const prendido = (await llamar(u('/enlace'), even, 'POST', { accion: 'activar' })).body;
    expect(prendido).toMatchObject({ activo: true, url: a.url, codigo: a.codigo });
    const nuevo = (await llamar(u('/enlace'), even, 'POST', { accion: 'cambiar_codigo' })).body;
    expect(nuevo.codigo).not.toBe(a.codigo);
    expect(await version()).toBe(v0 + 2);
  });

  it('muestra quién entró', async () => {
    await llamar(u('/enlace'), even, 'POST', { accion: 'activar' });
    await query("INSERT INTO minuta_accesos (id, minuta_id, nombre) VALUES (?, ?, 'Antonio Pérez')", [uuid(), minutaId]);
    expect((await llamar(u('/enlace'), even)).body.accesos).toEqual([expect.objectContaining({ nombre: 'Antonio Pérez' })]);
  });

  it('solo el equipo interno lo maneja', async () => {
    expect((await llamar(u('/enlace'), cliente)).status).toBe(403);
    expect((await llamar(u('/enlace'), cliente, 'POST', { accion: 'activar' })).status).toBe(403);
  });
});

describe('preparar el resumen con Codex', () => {
  it('le pasa solo los puntos visibles para el cliente y devuelve el resumen', async () => {
    const r = await llamar(u('/resumen-cliente'), even, 'POST');
    expect(r).toMatchObject({ status: 200, body: { resumen: 'Se revisó el panel de alertas y queda un ajuste.' } });
    expect(llamadasIa).toHaveLength(1);
    expect(llamadasIa[0].tipo).toBe('minuta-resumen-cliente');
    expect(JSON.stringify(llamadasIa[0].entrada)).toContain('Panel de alertas');
    expect(JSON.stringify(llamadasIa[0].entrada)).not.toContain('Tema interno del equipo');
    expect(JSON.stringify(llamadasIa[0].entrada)).not.toContain('Even Fierro');
  });

  it('a Codex solo le llega de qué trata cada punto, no su estado ni su avance: eso el cliente lo ve al entrar', async () => {
    await query("UPDATE minuta_items SET resolucion = 'Se corrigió el filtro', fecha_compromiso = '2026-09-30' WHERE numero = 1 AND minuta_id = ?", [minutaId]);
    await llamar(u('/resumen-cliente'), even, 'POST');
    expect(llamadasIa[0].entrada.puntos).toEqual([{ titulo: 'Panel de alertas', descripcion: 'Revisar alertas', lo_debe_el_cliente: false }]);
    expect(JSON.stringify(llamadasIa[0].entrada)).not.toContain('Se corrigió el filtro');
  });

  it('si Codex devuelve texto con basura lo intenta otra vez, y si insiste no lo usa', async () => {
    const respuestas = ['Revisamos el panel.} dake\u{5F154}-vesm} (oops)', 'Revisamos el panel de alertas.'];
    respuestaIa = async () => ({ resumen: respuestas.shift() });
    expect(await llamar(u('/resumen-cliente'), even, 'POST')).toMatchObject({ status: 200, body: { resumen: 'Revisamos el panel de alertas.' } });
    expect(llamadasIa).toHaveLength(2);
    respuestaIa = async () => ({ resumen: 'Mal } otra vez' });
    expect((await llamar(u('/resumen-cliente'), even, 'POST')).status).toBe(502);
  });

  it('si Codex está ocupado o falla, lo dice para que el resumen se escriba a mano', async () => {
    respuestaIa = async () => { throw new ErrorRunnerOcupado('ocupado'); };
    expect((await llamar(u('/resumen-cliente'), even, 'POST')).status).toBe(429);
    respuestaIa = async () => ({ nada: true });
    expect(await llamar(u('/resumen-cliente'), even, 'POST')).toMatchObject({ status: 502, body: { error: 'No se pudo preparar el resumen. Escríbelo tú o intenta de nuevo.' } });
  });
});

describe('mandar al cliente', () => {
  it('por correo: crea el enlace si no había, envía el mensaje con el código y guarda los contactos de la marca', async () => {
    const r = await llamar(u('/enviar-cliente'), even, 'POST', { medio: 'correo', para: PARA, resumen: 'Quedó un ajuste.' });
    expect(r.status).toBe(200);
    const enlace = r.body.enlace;
    expect(enlace).toMatchObject({ activo: true });
    expect(enviados).toHaveLength(1);
    expect(enviados[0].to).toBe('antonio@alba.ec, maria@alba.ec');
    expect(enviados[0].subject).toBe('Minuta M-01 · Seguimiento semanal · Alba del Bosque');
    expect(enviados[0].html).toContain('Hola Antonio Pérez y María León:');
    expect(enviados[0].html).toContain('Les enviamos la minuta de la reunión del 24 sep');
    expect(enviados[0].html).toContain(enlace.codigo);
    expect(enviados[0].html).toContain(enlace.url);
    expect(r.body.mensaje).toContain(`Código de acceso: ${enlace.codigo}`);
    expect(enlace.envios).toEqual([expect.objectContaining({ medio: 'correo', para: PARA, enviado_por: 'Even Fierro' })]);
    expect((await llamar(u('/contactos'), even)).body.map((c: any) => [c.nombre, c.email])).toEqual([['Antonio Pérez', 'antonio@alba.ec'], ['María León', 'maria@alba.ec']]);
  });

  it('copiado: no manda correo, devuelve el mensaje para pegarlo y lo deja en el historial; los destinatarios son opcionales', async () => {
    const r = await llamar(u('/enviar-cliente'), even, 'POST', { medio: 'copiado', para: [], resumen: '' });
    expect(r.status).toBe(200);
    expect(enviados).toEqual([]);
    expect(r.body.mensaje).toMatch(/^Hola:\n\nTe enviamos la minuta/);
    expect(r.body.enlace.envios).toEqual([expect.objectContaining({ medio: 'copiado', para: [], enviado_por: 'Even Fierro' })]);
  });

  it('un contacto que ya existía se actualiza sin duplicarse', async () => {
    await llamar(u('/enviar-cliente'), even, 'POST', { medio: 'copiado', para: [PARA[0]], resumen: '' });
    await llamar(u('/enviar-cliente'), even, 'POST', { medio: 'copiado', para: [{ nombre: 'Antonio Pérez Vera', email: 'ANTONIO@alba.ec' }], resumen: '' });
    expect((await llamar(u('/contactos'), even)).body.map((c: any) => [c.nombre, c.email])).toEqual([['Antonio Pérez Vera', 'antonio@alba.ec']]);
  });

  it('por correo hace falta al menos un destinatario con correo válido; si el correo falla no queda registrado', async () => {
    expect((await llamar(u('/enviar-cliente'), even, 'POST', { medio: 'correo', para: [], resumen: '' })).status).toBe(400);
    expect((await llamar(u('/enviar-cliente'), even, 'POST', { medio: 'correo', para: [{ nombre: 'Antonio', email: 'no-es-correo' }], resumen: '' })).status).toBe(400);
    correoFalla = true;
    expect((await llamar(u('/enviar-cliente'), even, 'POST', { medio: 'correo', para: PARA, resumen: '' })).status).toBe(502);
    expect(await query<any[]>('SELECT id FROM minuta_envios')).toEqual([]);
  });

  it('la vista previa arma el mismo mensaje sin mandar, registrar ni crear el enlace', async () => {
    const r = await llamar(u('/enviar-cliente'), even, 'POST', { medio: 'vista_previa', para: [PARA[0]], resumen: 'Quedó un ajuste.' });
    expect(r.status).toBe(200);
    expect(r.body.mensaje).toContain('Hola Antonio Pérez:');
    expect(r.body.mensaje).toContain('En resumen: Quedó un ajuste.');
    expect(r.body.mensaje).toContain('[el enlace se crea al enviar]');
    expect(enviados).toEqual([]);
    expect(await query<any[]>('SELECT id FROM minuta_envios')).toEqual([]);
    expect((await llamar(u('/enlace'), even)).body.activo).toBe(false);
    const { codigo } = (await llamar(u('/enlace'), even, 'POST', { accion: 'activar' })).body;
    expect((await llamar(u('/enviar-cliente'), even, 'POST', { medio: 'vista_previa', para: [], resumen: '' })).body.mensaje).toContain(`Código de acceso: ${codigo}`);
  });

  it('si el enlace estaba apagado, al mandar lo vuelve a prender', async () => {
    await llamar(u('/enlace'), even, 'POST', { accion: 'activar' });
    await llamar(u('/enlace'), even, 'POST', { accion: 'apagar' });
    const r = await llamar(u('/enviar-cliente'), even, 'POST', { medio: 'copiado', para: [], resumen: '' });
    expect(r.body.enlace.activo).toBe(true);
  });
});
