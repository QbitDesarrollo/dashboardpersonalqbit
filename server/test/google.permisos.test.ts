import { describe, expect, it } from 'vitest';
import { esFaltaDePermiso, permisosGoogle } from '../src/utils/googlePermisos.js';

const IDENTIDAD = 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';

describe('permisos de Google según el token guardado', () => {
  it('un login normal solo trae identidad: hay conexión pero falta Calendar, Drive y Chat', () => {
    expect(permisosGoogle(true, IDENTIDAD)).toEqual({ conectado: true, calendar: false, drive: false, chat: false });
  });

  it('con los servicios concedidos se reconoce cada permiso', () => {
    const scope = `${IDENTIDAD} https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/chat.spaces.readonly https://www.googleapis.com/auth/chat.messages.readonly`;
    expect(permisosGoogle(true, scope)).toEqual({ conectado: true, calendar: true, drive: true, chat: true });
  });

  it('sin token no hay conexión ni permisos, aunque llegue un scope', () => {
    expect(permisosGoogle(false, null)).toEqual({ conectado: false, calendar: false, drive: false, chat: false });
    expect(permisosGoogle(false, IDENTIDAD)).toEqual({ conectado: false, calendar: false, drive: false, chat: false });
  });

  it('reconoce cuando Google rechaza por permisos insuficientes y no confunde otros errores', () => {
    expect(esFaltaDePermiso({ code: 403, errors: [{ reason: 'insufficientPermissions' }] })).toBe(true);
    expect(esFaltaDePermiso({ code: 403, message: 'Request had insufficient authentication scopes.' })).toBe(true);
    expect(esFaltaDePermiso({ code: 403, errors: [{ reason: 'rateLimitExceeded' }] })).toBe(false);
    expect(esFaltaDePermiso({ code: 401, message: 'invalid_grant' })).toBe(false);
    expect(esFaltaDePermiso(new Error('socket hang up'))).toBe(false);
  });
});
