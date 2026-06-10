import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || '';

function hmac(payload: string): string {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 32);
}

/** Firma una ruta de archivo con expiración (URL para <img> sin headers de auth). */
export function signPath(filePath: string, ttlSeconds = 6 * 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${filePath}?exp=${exp}&sig=${hmac(`${filePath}:${exp}`)}`;
}

/** Verifica firma + expiración de una ruta firmada con signPath. */
export function verifySignedPath(filePath: string, exp: string | undefined, sig: string | undefined): boolean {
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (parseInt(exp, 10) < Math.floor(Date.now() / 1000)) return false;
  const expected = hmac(`${filePath}:${exp}`);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
