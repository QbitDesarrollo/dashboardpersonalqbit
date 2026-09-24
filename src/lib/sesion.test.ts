import { describe, it, expect } from 'vitest';
import { debeRenovar } from './sesion';

// Unsigned token with the given payload: only the payload is read client-side.
const token = (payload: object) => `x.${btoa(JSON.stringify(payload)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.y`;
const AHORA = Date.UTC(2026, 8, 24, 15, 0, 0);
const hace = (horas: number) => Math.floor((AHORA - horas * 3600_000) / 1000);

describe('debeRenovar', () => {
  it('renueva un token emitido hace más de 12 horas', () => {
    expect(debeRenovar(token({ iat: hace(13) }), AHORA)).toBe(true);
    expect(debeRenovar(token({ iat: hace(11) }), AHORA)).toBe(false);
  });

  it('no intenta nada con un token ilegible o sin fecha', () => {
    expect(debeRenovar('no-es-un-token', AHORA)).toBe(false);
    expect(debeRenovar(token({ sub: 'u1' }), AHORA)).toBe(false);
    expect(debeRenovar(null, AHORA)).toBe(false);
  });
});
