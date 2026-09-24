import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { crearRouterMinutasIa } from '../src/routes/minutas-ia.js';
import { ErrorRunner, type RunnerIa } from '../src/minutas/ia/runner.js';
import { levantarApp, limpiarBase, cerrarLimpieza, crearUsuario, crearMesa, fijarAjuste, llamar, type Usuario } from './helpers/api.js';
import { query } from '../src/db/mysql.js';

const runner = { salud: vi.fn(), generar: vi.fn() } satisfies RunnerIa;
let api: { url: string; cerrar: () => Promise<void> };
let even: Usuario;
let jonathan: Usuario;

const SALIDA = {
  titulo: 'Revisión de avance', resumen: 'Lanzamiento el 26 de noviembre.',
  puntos: [{ titulo: 'Video en el home', descripcion: 'Sin sonido.', responsable: 'agencia', fecha: '2026-10-03', cita: 'que el video no suene', tareas_sugeridas: [] }],
};
const PEDIDO = { transcripcion: 'Even: revisamos el home. Cliente: que el video no suene.', fecha: '2026-09-24' };

/** Polls the job until it leaves "procesando" (it runs in the background). */
async function esperar(id: string, usuario: Usuario) {
  for (let i = 0; i < 50; i++) {
    const r = await llamar(`${api.url}/minutas/ia/borradores/${id}`, usuario);
    if (r.body?.estado !== 'procesando') return r;
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error('El trabajo no terminó');
}

beforeAll(async () => { api = await levantarApp(crearRouterMinutasIa(runner)); });
afterAll(async () => { await api.cerrar(); await cerrarLimpieza(); });
beforeEach(async () => {
  await limpiarBase();
  runner.salud.mockReset().mockResolvedValue({ listo: true, detalle: 'Logged in using ChatGPT' });
  runner.generar.mockReset().mockResolvedValue(SALIDA);
  even = await crearUsuario('Even', 'equipo');
  jonathan = await crearUsuario('Jonathan', 'equipo');
  const desarrollo = await crearMesa('Desarrollo', [even.id]);
  await crearMesa('Pycca', [jonathan.id]);
  await fijarAjuste('ia_minutas_desk_ids', desarrollo);
});

describe('GET /minutas/ia/estado', () => {
  it('a quien es de una mesa permitida le dice que puede usarla, si Codex está listo y cuánto lleva hoy', async () => {
    const r = await llamar(`${api.url}/minutas/ia/estado`, even);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ permitido: true, disponible: true, detalle: 'Logged in using ChatGPT', usados: 0, limite: 10 });
  });

  it('a quien no es de esas mesas le dice que no, sin consultar a Codex', async () => {
    const r = await llamar(`${api.url}/minutas/ia/estado`, jonathan);
    expect(r.body).toEqual({ permitido: false, disponible: false, detalle: null, usados: 0, limite: 10 });
    expect(runner.salud).not.toHaveBeenCalled();
  });
});

describe('POST /minutas/ia/borradores', () => {
  it('genera el borrador en segundo plano y lo entrega al dueño ya limpio', async () => {
    const r = await llamar(`${api.url}/minutas/ia/borradores`, even, 'POST', PEDIDO);
    expect(r.status).toBe(202);
    const listo = await esperar(r.body.id, even);
    expect(listo.body).toEqual({
      id: r.body.id, estado: 'listo', error: null,
      borrador: {
        titulo: 'Revisión de avance', resumen: 'Lanzamiento el 26 de noviembre.',
        puntos: [{ titulo: 'Video en el home', descripcion: 'Sin sonido.', responsable_cliente: false, origen: 'reunion', fecha_compromiso: '2026-10-03', cita: 'que el video no suene', cita_fuente: 'reunion', tareas_sugeridas: [] }],
      },
    });
    expect(runner.generar).toHaveBeenCalledWith({ ...PEDIDO, notas_cliente: '', indicaciones: '' });
  });

  it('acepta solo lo que mandó el cliente, con indicaciones del equipo', async () => {
    const pedido = { notas_cliente: 'Even,\n- Agregar incidencias\nGracias', indicaciones: 'Solo lo del portal', fecha: '2026-09-24' };
    const r = await llamar(`${api.url}/minutas/ia/borradores`, even, 'POST', pedido);
    expect(r.status).toBe(202);
    await esperar(r.body.id, even);
    expect(runner.generar).toHaveBeenCalledWith({ transcripcion: '', ...pedido });
    const [fila] = await query<any[]>('SELECT * FROM minuta_ia_trabajos WHERE id = ?', [r.body.id]);
    expect(fila.caracteres).toBe(pedido.notas_cliente.length);
    expect(JSON.stringify(fila)).not.toContain('Agregar incidencias');
    expect(JSON.stringify(fila)).not.toContain('Solo lo del portal');
  });

  it('no guarda la transcripción, solo su largo', async () => {
    const r = await llamar(`${api.url}/minutas/ia/borradores`, even, 'POST', PEDIDO);
    await esperar(r.body.id, even);
    const [fila] = await query<any[]>('SELECT * FROM minuta_ia_trabajos WHERE id = ?', [r.body.id]);
    expect(fila.caracteres).toBe(PEDIDO.transcripcion.length);
    expect(JSON.stringify(fila)).not.toContain('revisamos el home');
  });

  it('rechaza a quien no es de una mesa permitida', async () => {
    const r = await llamar(`${api.url}/minutas/ia/borradores`, jonathan, 'POST', PEDIDO);
    expect(r).toEqual({ status: 403, body: { error: 'La IA de minutas no está habilitada para tu mesa.' } });
    expect(runner.generar).not.toHaveBeenCalled();
  });

  it('rechaza a los clientes aunque estén en la mesa', async () => {
    const cliente = await crearUsuario('Cliente', 'cliente');
    await fijarAjuste('ia_minutas_desk_ids', await crearMesa('Con cliente', [cliente.id]));
    const r = await llamar(`${api.url}/minutas/ia/borradores`, cliente, 'POST', PEDIDO);
    expect(r.status).toBe(403);
  });

  it('respeta el límite diario; los intentos fallidos no cuentan', async () => {
    await fijarAjuste('ia_minutas_limite_diario', '1');
    runner.generar.mockRejectedValueOnce(new ErrorRunner('El servicio de IA no responde.'));
    const fallida = await llamar(`${api.url}/minutas/ia/borradores`, even, 'POST', PEDIDO);
    await esperar(fallida.body.id, even);
    const primera = await llamar(`${api.url}/minutas/ia/borradores`, even, 'POST', PEDIDO);
    expect(primera.status).toBe(202);
    await esperar(primera.body.id, even);
    const segunda = await llamar(`${api.url}/minutas/ia/borradores`, even, 'POST', PEDIDO);
    expect(segunda).toEqual({ status: 429, body: { error: 'Llegaste al límite de 1 minuta con IA por hoy.' } });
    expect((await llamar(`${api.url}/minutas/ia/estado`, even)).body).toMatchObject({ usados: 1, limite: 1 });
  });

  it('valida que haya una fuente, la fecha y el largo de las indicaciones', async () => {
    const sinFuente = await llamar(`${api.url}/minutas/ia/borradores`, even, 'POST', { transcripcion: '   ', notas_cliente: ' ', fecha: '2026-09-24' });
    expect(sinFuente).toEqual({ status: 400, body: { error: 'Pega la transcripción o lo que mandó el cliente, y elige la fecha.' } });
    expect((await llamar(`${api.url}/minutas/ia/borradores`, even, 'POST', { ...PEDIDO, indicaciones: 'a'.repeat(501) })).status).toBe(400);
    expect((await llamar(`${api.url}/minutas/ia/borradores`, even, 'POST', { ...PEDIDO, fecha: 'ayer' })).status).toBe(400);
  });

  it('si Codex falla, el trabajo queda con un error que se puede mostrar', async () => {
    runner.generar.mockRejectedValue(new ErrorRunner('Codex está ocupado con otra minuta. Intenta en un minuto.'));
    const r = await llamar(`${api.url}/minutas/ia/borradores`, even, 'POST', PEDIDO);
    expect((await esperar(r.body.id, even)).body).toEqual({
      id: r.body.id, estado: 'error', borrador: null, error: 'Codex está ocupado con otra minuta. Intenta en un minuto.',
    });
  });

  it('si la IA devuelve algo sin la forma esperada, no se inventa un borrador', async () => {
    runner.generar.mockResolvedValue({ texto: 'hola' });
    const r = await llamar(`${api.url}/minutas/ia/borradores`, even, 'POST', PEDIDO);
    expect((await esperar(r.body.id, even)).body).toMatchObject({ estado: 'error', error: 'La IA devolvió un formato inesperado.' });
  });

  it('un error inesperado no filtra detalles internos y queda en el log del servidor', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    runner.generar.mockRejectedValue(new Error('ECONNRESET /home/codex-ia/.codex'));
    const r = await llamar(`${api.url}/minutas/ia/borradores`, even, 'POST', PEDIDO);
    expect((await esperar(r.body.id, even)).body).toMatchObject({ estado: 'error', error: 'No se pudo generar la minuta.' });
    expect(log).toHaveBeenCalledWith('[MINUTAS-IA] Error inesperado:', expect.any(Error));
    log.mockRestore();
  });
});

describe('GET /minutas/ia/borradores/:id', () => {
  it('nadie más puede ver el borrador de otra persona', async () => {
    const r = await llamar(`${api.url}/minutas/ia/borradores`, even, 'POST', PEDIDO);
    await esperar(r.body.id, even);
    expect((await llamar(`${api.url}/minutas/ia/borradores/${r.body.id}`, jonathan)).status).toBe(404);
  });

  it('un trabajo que quedó colgado más de 10 minutos se da por fallido', async () => {
    const r = await llamar(`${api.url}/minutas/ia/borradores`, even, 'POST', PEDIDO);
    await esperar(r.body.id, even);
    await query("UPDATE minuta_ia_trabajos SET estado = 'procesando', borrador = NULL, created_at = NOW(3) - INTERVAL 11 MINUTE WHERE id = ?", [r.body.id]);
    const colgado = await llamar(`${api.url}/minutas/ia/borradores/${r.body.id}`, even);
    expect(colgado.body).toMatchObject({ estado: 'error', error: 'La generación se interrumpió. Intenta de nuevo.' });
  });
});

describe('errores', () => {
  it('si algo falla, responde 500 en vez de dejar la petición colgada', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    runner.salud.mockRejectedValue(new Error('se cayó'));
    const r = await llamar(`${api.url}/minutas/ia/estado`, even);
    expect(r).toEqual({ status: 500, body: { error: 'Error interno' } });
    log.mockRestore();
  });
});

describe('GET /minutas/ia/salud', () => {
  it('solo administración puede probar la conexión con Codex', async () => {
    expect((await llamar(`${api.url}/minutas/ia/salud`, even)).status).toBe(403);
    const admin = await crearUsuario('Admin', 'admin');
    expect(await llamar(`${api.url}/minutas/ia/salud`, admin)).toEqual({ status: 200, body: { listo: true, detalle: 'Logged in using ChatGPT' } });
  });
});
