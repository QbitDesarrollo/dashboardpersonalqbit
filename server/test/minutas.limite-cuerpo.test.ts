import { describe, expect, it, vi } from 'vitest';
import { cuerpoDemasiadoGrande } from '../src/minutas/limiteCuerpo.js';

const respuesta = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

describe('cuerpo de evidencia demasiado grande', () => {
  it('responde TIUSDEI_FILE_TOO_LARGE con 413 cuando el JSON supera el límite del parser', () => {
    const res = respuesta(); const next = vi.fn();
    cuerpoDemasiadoGrande(Object.assign(new Error('request entity too large'), { type: 'entity.too.large' }), {} as never, res as never, next);
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({ error: 'TIUSDEI_FILE_TOO_LARGE', message: 'El archivo pesa más de 10 MB.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('deja pasar cualquier otro error al manejador general', () => {
    const res = respuesta(); const next = vi.fn(); const error = new Error('JSON inválido');
    cuerpoDemasiadoGrande(error, {} as never, res as never, next);
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});
