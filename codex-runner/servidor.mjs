import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BYTES = 1024 * 1024;
const MAX_NOTAS = 30_000;
const MAX_INDICACIONES = 500;
const TIPOS_TRABAJO = new Set(['reporte-descripciones', 'reporte-avances', 'reporte-resumen']);

class ErrorHttp extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}

function autorizado(req, token) {
  const recibido = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /, ''));
  const esperado = Buffer.from(token);
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

async function leerJson(req) {
  let tam = 0;
  const partes = [];
  for await (const parte of req) {
    tam += parte.length;
    if (tam > MAX_BYTES) throw new ErrorHttp(413, 'La transcripción es demasiado larga.');
    partes.push(parte);
  }
  try { return JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { throw new ErrorHttp(400, 'El cuerpo no es JSON válido.'); }
}

function responder(res, status, datos) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(datos));
}

/**
 * HTTP runner for Tiusdei. Only answers requests carrying the shared token and runs one Codex job at a time,
 * whether a minuta or a report step (Codex is a single subscription).
 */
export function crearServidor({ token, generar, trabajar, verificarSesion, maxCaracteres = 120_000, log = console }) {
  let ocupado = false;

  return http.createServer(async (req, res) => {
    try {
      if (!autorizado(req, token)) return responder(res, 401, { error: 'No autorizado' });

      if (req.method === 'GET' && req.url === '/salud') return responder(res, 200, await verificarSesion());

      if (req.method === 'POST' && req.url === '/minuta') {
        const cuerpo = await leerJson(req);
        const texto = (v) => (typeof v === 'string' ? v : '');
        const transcripcion = texto(cuerpo.transcripcion);
        const notasCliente = texto(cuerpo.notas_cliente);
        const indicaciones = texto(cuerpo.indicaciones);
        const { fecha } = cuerpo;
        if (!transcripcion.trim() && !notasCliente.trim()) throw new ErrorHttp(400, 'Falta la transcripción o lo que mandó el cliente.');
        if (typeof fecha !== 'string' || !FECHA.test(fecha)) throw new ErrorHttp(400, 'La fecha debe tener el formato AAAA-MM-DD.');
        if (transcripcion.length > maxCaracteres) throw new ErrorHttp(413, 'La transcripción es demasiado larga.');
        if (notasCliente.length > MAX_NOTAS) throw new ErrorHttp(413, 'Lo que mandó el cliente es demasiado largo.');
        if (indicaciones.length > MAX_INDICACIONES) throw new ErrorHttp(400, 'Las indicaciones son demasiado largas (máximo 500 caracteres).');
        if (ocupado) throw new ErrorHttp(429, 'Codex está ocupado con otra minuta. Intenta en un minuto.');

        ocupado = true;
        try {
          return responder(res, 200, await generar({ transcripcion, notasCliente, indicaciones, fecha }));
        } catch (e) {
          // The detail stays in the runner log; it may mention local paths.
          log.error('[codex-runner] generar falló:', e instanceof Error ? e.message : e);
          throw new ErrorHttp(502, 'Codex no pudo generar la minuta.');
        } finally {
          ocupado = false;
        }
      }

      if (req.method === 'POST' && req.url === '/trabajo') {
        const cuerpo = await leerJson(req);
        const indicaciones = typeof cuerpo.indicaciones === 'string' ? cuerpo.indicaciones : '';
        if (!TIPOS_TRABAJO.has(cuerpo.tipo)) throw new ErrorHttp(400, 'Tipo de trabajo desconocido.');
        if (!cuerpo.entrada || typeof cuerpo.entrada !== 'object' || Array.isArray(cuerpo.entrada)) throw new ErrorHttp(400, 'Faltan los datos del trabajo.');
        if (indicaciones.length > MAX_INDICACIONES) throw new ErrorHttp(400, 'Las indicaciones son demasiado largas (máximo 500 caracteres).');
        if (ocupado) throw new ErrorHttp(429, 'Codex está ocupado con otro trabajo. Intenta en un minuto.');

        ocupado = true;
        try {
          return responder(res, 200, await trabajar(cuerpo.tipo, { entrada: cuerpo.entrada, indicaciones }));
        } catch (e) {
          log.error('[codex-runner] trabajo falló:', cuerpo.tipo, e instanceof Error ? e.message : e);
          throw new ErrorHttp(502, 'Codex no pudo completar el trabajo.');
        } finally {
          ocupado = false;
        }
      }

      responder(res, 404, { error: 'No encontrado' });
    } catch (e) {
      if (e instanceof ErrorHttp) return responder(res, e.status, { error: e.message });
      log.error('[codex-runner] error inesperado:', e);
      responder(res, 500, { error: 'Error interno' });
    }
  });
}
