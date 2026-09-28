import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * Signatures of the client link. They use a key derived from JWT_SECRET, so a client session can never pass as a
 * Tiusdei session (and the other way round). Both carry the link version: turning the link off or changing the
 * code bumps it, which voids every session and every signed image at once.
 */

const clave = () => crypto.createHmac('sha256', process.env.JWT_SECRET || '').update('minuta-cliente').digest();
const DURACION_SESION = '7d';
const DURACION_IMAGEN_S = 3600;

export interface SesionCliente { minutaId: string; nombre: string; version: number }

export function firmarSesion(s: SesionCliente): string {
  return jwt.sign({ mid: s.minutaId, nombre: s.nombre, v: s.version }, clave(), { algorithm: 'HS256', expiresIn: DURACION_SESION, audience: 'minuta-cliente' });
}

export function leerSesion(token: string | undefined): SesionCliente | null {
  if (!token || token.length > 2048) return null;
  try {
    const p = jwt.verify(token, clave(), { algorithms: ['HS256'], audience: 'minuta-cliente' }) as { mid?: unknown; nombre?: unknown; v?: unknown };
    if (typeof p.mid !== 'string' || typeof p.nombre !== 'string' || typeof p.v !== 'number') return null;
    return { minutaId: p.mid, nombre: p.nombre, version: p.v };
  } catch {
    return null;
  }
}

const firma = (texto: string) => crypto.createHmac('sha256', clave()).update(texto).digest('hex').slice(0, 40);

/** Path of an evidence image for the public page, valid for an hour and for this link version only. */
export function rutaImagenFirmada(token: string, evidenciaId: string, version: number, ahora = Date.now()): string {
  const exp = Math.floor(ahora / 1000) + DURACION_IMAGEN_S;
  return `/api/public/minuta/${token}/evidencias/${evidenciaId}?exp=${exp}&sig=${firma(`${token}:${evidenciaId}:${version}:${exp}`)}`;
}

export function imagenFirmadaValida(token: string, evidenciaId: string, version: number, exp: unknown, sig: unknown, ahora = Date.now()): boolean {
  if (typeof exp !== 'string' || typeof sig !== 'string' || !/^\d+$/.test(exp) || Number(exp) * 1000 < ahora) return false;
  const esperada = Buffer.from(firma(`${token}:${evidenciaId}:${version}:${exp}`));
  const recibida = Buffer.from(sig);
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}
