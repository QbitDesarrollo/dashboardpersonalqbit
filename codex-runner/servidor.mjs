import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BYTES = 1024 * 1024;

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
 * HTTP runner for Tiusdei. Only answers requests carrying the shared token and
 * runs one minuta at a time (Codex is a single subscription, used a few times a week).
 */
export function crearServidor({ token, generar, verificarSesion, maxCaracteres = 120_000, log = console }) {
  let ocupado = false;

  return http.createServer(async (req, res) => {
    try {
      if (!autorizado(req, token)) return responder(res, 401, { error: 'No autorizado' });

      if (req.method === 'GET' && req.url === '/salud') return responder(res, 200, await verificarSesion());

      if (req.method === 'POST' && req.url === '/minuta') {
        const { transcripcion, fecha } = await leerJson(req);
        if (typeof transcripcion !== 'string' || !transcripcion.trim()) throw new ErrorHttp(400, 'Falta la transcripción.');
        if (typeof fecha !== 'string' || !FECHA.test(fecha)) throw new ErrorHttp(400, 'La fecha debe tener el formato AAAA-MM-DD.');
        if (transcripcion.length > maxCaracteres) throw new ErrorHttp(413, 'La transcripción es demasiado larga.');
        if (ocupado) throw new ErrorHttp(429, 'Codex está ocupado con otra minuta. Intenta en un minuto.');

        ocupado = true;
        try {
          return responder(res, 200, await generar({ transcripcion, fecha }));
        } catch (e) {
          // The detail stays in the runner log; it may mention local paths.
          log.error('[codex-runner] generar falló:', e instanceof Error ? e.message : e);
          throw new ErrorHttp(502, 'Codex no pudo generar la minuta.');
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
