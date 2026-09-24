import { describe, it, expect } from 'vitest';
import { estadoPunto, vencimiento, requisitosCierre } from './minutas';

describe('estadoPunto', () => {
  it.each([
    ['pendiente', false, 'Pendiente', 'slate'],
    ['en_curso', false, 'En curso', 'blue'],
    ['completado', false, 'Completado', 'teal'],
    ['aprobado', false, 'Aprobado por el cliente', 'green'],
    ['descartado', false, 'Descartado', 'slate'],
    ['pendiente', true, 'Esperando al cliente', 'amber'],
    ['en_curso', true, 'Esperando al cliente', 'amber'],
    ['completado', true, 'Recibido', 'green'],
  ] as const)('%s (del cliente: %s) se muestra como "%s"', (estado, responsable_cliente, texto, tono) => {
    expect(estadoPunto({ estado, responsable_cliente })).toEqual({ texto, tono });
  });
});

describe('vencimiento', () => {
  const hoy = '2026-09-24';
  it.each([
    ['2026-09-19', 'en_curso', { texto: 'Vencido hace 5 días', tono: 'rose' }],
    ['2026-09-23', 'pendiente', { texto: 'Vencido hace 1 día', tono: 'rose' }],
    ['2026-09-24', 'pendiente', { texto: 'Vence hoy', tono: 'amber' }],
    ['2026-10-06', 'en_curso', { texto: '6 oct', tono: 'slate' }],
  ] as const)('fecha %s en estado %s', (fecha, estado, esperado) => {
    expect(vencimiento(fecha, estado, hoy)).toEqual(esperado);
  });

  it.each(['completado', 'aprobado', 'descartado'] as const)('no muestra nada si el punto está %s', (estado) => {
    expect(vencimiento('2026-09-01', estado, hoy)).toBeNull();
  });

  it('no muestra nada sin fecha', () => {
    expect(vencimiento(null, 'pendiente', hoy)).toBeNull();
  });
});

describe('requisitosCierre', () => {
  it('un punto de la agencia pide explicación (10+ caracteres) y evidencia', () => {
    expect(requisitosCierre({ responsable_cliente: false, resolucion: '  listo  ', evidencias: 1 })).toEqual([
      { texto: 'Explicación de lo que se hizo', ok: false },
      { texto: 'Al menos una evidencia', ok: true },
    ]);
  });

  it('un punto del cliente solo pide evidencia', () => {
    expect(requisitosCierre({ responsable_cliente: true, resolucion: '', evidencias: 0 })).toEqual([
      { texto: 'Al menos una evidencia', ok: false },
    ]);
  });
});
