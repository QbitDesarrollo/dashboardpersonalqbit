import { describe, expect, it, vi } from 'vitest';
import { revocarGoogle } from '../src/utils/googlePermisos.js';

const desconectado = { conectado: false, calendar: false, drive: false, chat: false };

describe('revocar la conexión Google', () => {
  it('revoca primero el refresh token y luego elimina la conexión', async () => {
    const pasos: string[] = [];
    const revoke = vi.fn(async (token: string) => { pasos.push(token); });
    const eliminar = vi.fn(async () => { pasos.push('eliminar'); });
    const log = vi.fn();
    expect(await revocarGoogle({ access_token: 'access', refresh_token: 'refresh' }, revoke, eliminar, log))
      .toEqual({ ok: true, permisos: desconectado });
    expect(pasos).toEqual(['refresh', 'eliminar']);
    expect(log).not.toHaveBeenCalled();
  });

  it('usa el access token cuando no hay refresh token', async () => {
    const revoke = vi.fn().mockResolvedValue(undefined);
    const eliminar = vi.fn().mockResolvedValue(undefined);
    expect(await revocarGoogle({ access_token: 'access', refresh_token: null }, revoke, eliminar, vi.fn()))
      .toEqual({ ok: true, permisos: desconectado });
    expect(revoke).toHaveBeenCalledExactlyOnceWith('access');
    expect(eliminar).toHaveBeenCalledOnce();
  });

  it('registra el error de Google y aun así elimina la fila', async () => {
    const error = new Error('already revoked');
    const revoke = vi.fn().mockRejectedValue(error);
    const eliminar = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();
    expect(await revocarGoogle({ access_token: 'access', refresh_token: 'refresh' }, revoke, eliminar, log))
      .toEqual({ ok: true, permisos: desconectado });
    expect(log).toHaveBeenCalledExactlyOnceWith(error);
    expect(eliminar).toHaveBeenCalledOnce();
  });

  it('sin fila no intenta revocar y la operación es idempotente', async () => {
    const revoke = vi.fn();
    const eliminar = vi.fn().mockResolvedValue(undefined);
    expect(await revocarGoogle(null, revoke, eliminar, vi.fn())).toEqual({ ok: true, permisos: desconectado });
    expect(revoke).not.toHaveBeenCalled();
    expect(eliminar).toHaveBeenCalledOnce();
  });

  it('no informa éxito si falla la eliminación local', async () => {
    const error = new Error('delete failed');
    await expect(revocarGoogle(null, vi.fn(), vi.fn().mockRejectedValue(error), vi.fn())).rejects.toThrow(error);
  });
});
