import { describe, it, expect } from 'vitest';
import { aplicarAccion, progreso } from '../src/minutas/domain.js';

describe('aplicarAccion · completar', () => {
  it('rechaza completar un punto sin evidencia', () => {
    const r = aplicarAccion(
      { estado: 'en_curso', responsableCliente: false, evidencias: 0 },
      'completar',
      { resolucion: 'Se implementó el filtro por marca en staging.' },
    );
    expect(r).toEqual({ ok: false, error: 'Falta al menos una evidencia.' });
  });

  it('rechaza completar un punto de la agencia sin explicar qué se hizo', () => {
    const r = aplicarAccion(
      { estado: 'en_curso', responsableCliente: false, evidencias: 1 },
      'completar',
      { resolucion: '   listo   ' },
    );
    expect(r).toEqual({ ok: false, error: 'Explica qué se hizo (mínimo 10 caracteres).' });
  });

  it('completa un punto en curso con evidencia y explicación', () => {
    const r = aplicarAccion(
      { estado: 'en_curso', responsableCliente: false, evidencias: 2 },
      'completar',
      { resolucion: 'Se implementó el filtro por marca en staging.' },
    );
    expect(r).toEqual({ ok: true, estado: 'completado' });
  });

  it('marca como recibido un punto del cliente solo con evidencia, sin nota', () => {
    const r = aplicarAccion({ estado: 'pendiente', responsableCliente: true, evidencias: 1 }, 'completar', {});
    expect(r).toEqual({ ok: true, estado: 'completado' });
  });

  it.each([
    ['aprobado', 'No se puede completar un punto aprobado.'],
    ['descartado', 'No se puede completar un punto descartado.'],
    ['completado', 'No se puede completar un punto completado.'],
  ] as const)('rechaza completar un punto %s', (estado, error) => {
    const r = aplicarAccion(
      { estado, responsableCliente: false, evidencias: 1 },
      'completar',
      { resolucion: 'Se implementó el filtro por marca en staging.' },
    );
    expect(r).toEqual({ ok: false, error });
  });
});

describe('aplicarAccion · iniciar', () => {
  it('pasa un punto pendiente a en curso', () => {
    const r = aplicarAccion({ estado: 'pendiente', responsableCliente: false, evidencias: 0 }, 'iniciar');
    expect(r).toEqual({ ok: true, estado: 'en_curso' });
  });

  it('deja igual un punto que ya está en curso', () => {
    const r = aplicarAccion({ estado: 'en_curso', responsableCliente: false, evidencias: 0 }, 'iniciar');
    expect(r).toEqual({ ok: true, estado: 'en_curso' });
  });

  it.each(['completado', 'aprobado', 'descartado'] as const)('rechaza iniciar un punto %s', (estado) => {
    const r = aplicarAccion({ estado, responsableCliente: false, evidencias: 1 }, 'iniciar');
    expect(r).toEqual({ ok: false, error: `No se puede iniciar un punto ${estado}.` });
  });
});

describe('aplicarAccion · aprobar', () => {
  it('aprueba un punto completado', () => {
    const r = aplicarAccion({ estado: 'completado', responsableCliente: false, evidencias: 1 }, 'aprobar');
    expect(r).toEqual({ ok: true, estado: 'aprobado' });
  });

  it.each([
    ['pendiente', 'No se puede aprobar un punto pendiente.'],
    ['en_curso', 'No se puede aprobar un punto en curso.'],
    ['aprobado', 'No se puede aprobar un punto aprobado.'],
    ['descartado', 'No se puede aprobar un punto descartado.'],
  ] as const)('rechaza aprobar un punto %s', (estado, error) => {
    const r = aplicarAccion({ estado, responsableCliente: false, evidencias: 1 }, 'aprobar');
    expect(r).toEqual({ ok: false, error });
  });
});

describe('aplicarAccion · reabrir', () => {
  it('devuelve a en curso un punto completado', () => {
    const r = aplicarAccion({ estado: 'completado', responsableCliente: false, evidencias: 1 }, 'reabrir');
    expect(r).toEqual({ ok: true, estado: 'en_curso' });
  });

  it('rechaza reabrir un punto que no está completado', () => {
    const r = aplicarAccion({ estado: 'pendiente', responsableCliente: false, evidencias: 0 }, 'reabrir');
    expect(r).toEqual({ ok: false, error: 'No se puede reabrir un punto pendiente.' });
  });
});

describe('aplicarAccion · descartar', () => {
  it('descarta un punto con motivo', () => {
    const r = aplicarAccion(
      { estado: 'en_curso', responsableCliente: false, evidencias: 0 },
      'descartar',
      { motivo: 'El cliente retiró el pedido.' },
    );
    expect(r).toEqual({ ok: true, estado: 'descartado' });
  });

  it('rechaza descartar sin motivo', () => {
    const r = aplicarAccion({ estado: 'pendiente', responsableCliente: false, evidencias: 0 }, 'descartar', { motivo: '  ' });
    expect(r).toEqual({ ok: false, error: 'Indica por qué se descarta el punto.' });
  });

  it('rechaza descartar un punto aprobado', () => {
    const r = aplicarAccion(
      { estado: 'aprobado', responsableCliente: false, evidencias: 1 },
      'descartar',
      { motivo: 'Ya no aplica.' },
    );
    expect(r).toEqual({ ok: false, error: 'No se puede descartar un punto aprobado.' });
  });
});

describe('aplicarAccion · restaurar', () => {
  it('devuelve a pendiente un punto descartado', () => {
    const r = aplicarAccion({ estado: 'descartado', responsableCliente: false, evidencias: 0 }, 'restaurar');
    expect(r).toEqual({ ok: true, estado: 'pendiente' });
  });

  it('rechaza restaurar un punto que no está descartado', () => {
    const r = aplicarAccion({ estado: 'en_curso', responsableCliente: false, evidencias: 0 }, 'restaurar');
    expect(r).toEqual({ ok: false, error: 'No se puede restaurar un punto en curso.' });
  });
});

describe('progreso', () => {
  it('cuenta cerrados y en curso sin contar los descartados', () => {
    const r = progreso(['pendiente', 'en_curso', 'completado', 'aprobado', 'descartado']);
    expect(r).toEqual({ total: 4, cerrados: 2, enCurso: 1 });
  });

  it('devuelve ceros para una minuta sin puntos', () => {
    expect(progreso([])).toEqual({ total: 0, cerrados: 0, enCurso: 0 });
  });
});

describe('aplicarAccion · pedir ajuste', () => {
  it('devuelve a en curso un punto completado cuando el cliente pide un ajuste', () => {
    const r = aplicarAccion(
      { estado: 'completado', responsableCliente: false, evidencias: 1 },
      'pedir_ajuste',
      { motivo: 'Que el video no tenga sonido.' },
    );
    expect(r).toEqual({ ok: true, estado: 'en_curso' });
  });

  it('exige decir qué ajuste pidió el cliente', () => {
    const r = aplicarAccion({ estado: 'completado', responsableCliente: false, evidencias: 1 }, 'pedir_ajuste', { motivo: ' ' });
    expect(r).toEqual({ ok: false, error: 'Indica qué ajuste pidió el cliente.' });
  });

  it('rechaza pedir ajuste de un punto que no está completado', () => {
    const r = aplicarAccion({ estado: 'en_curso', responsableCliente: false, evidencias: 0 }, 'pedir_ajuste', { motivo: 'Otro color.' });
    expect(r).toEqual({ ok: false, error: 'No se puede pedir un ajuste de un punto en curso.' });
  });
});

describe('aplicarAccion · acción desconocida', () => {
  it('devuelve un error en vez de fallar', () => {
    const r = aplicarAccion(
      { estado: 'pendiente', responsableCliente: false, evidencias: 0 },
      'borrar' as unknown as Parameters<typeof aplicarAccion>[1],
    );
    expect(r).toEqual({ ok: false, error: 'Acción desconocida.' });
  });
});
