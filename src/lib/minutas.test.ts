import { describe, it, expect, vi, afterEach } from 'vitest';
import { estadoPunto, estadoCliente, vencimiento, requisitosCierre, aPuntosNuevos, hoyEcuador, puntosDesdeIa } from './minutas';

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

describe('aPuntosNuevos', () => {
  it('traduce el borrador al payload de la API', () => {
    expect(aPuntosNuevos([
      { clave: 'a', titulo: ' Filtro por marca ', descripcion: 'En celular', responsable: 'u1', fecha: '2026-10-06' },
      { clave: 'b', titulo: 'Fichas técnicas', descripcion: '  ', responsable: 'cliente', fecha: '' },
      { clave: 'c', titulo: 'Botón de WhatsApp', descripcion: '', responsable: '', fecha: '' },
      { clave: 'd', titulo: '   ', descripcion: 'sin título', responsable: '', fecha: '' },
    ])).toEqual([
      { titulo: 'Filtro por marca', descripcion: 'En celular', responsable_user_id: 'u1', responsable_cliente: false, fecha_compromiso: '2026-10-06' },
      { titulo: 'Fichas técnicas', descripcion: null, responsable_user_id: null, responsable_cliente: true, fecha_compromiso: null },
      { titulo: 'Botón de WhatsApp', descripcion: null, responsable_user_id: null, responsable_cliente: false, fecha_compromiso: null },
    ]);
  });
});

describe('hoyEcuador', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('a las 20:00 de Guayaquil sigue siendo el mismo día aunque en UTC ya sea mañana', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T01:00:00Z')); // 24 sep, 20:00 en Guayaquil (UTC-5)
    expect(hoyEcuador()).toBe('2026-09-24');
  });
});

describe('estadoCliente', () => {
  it.each([
    ['pendiente', false, 'Por empezar', 'slate'],
    ['en_curso', false, 'En marcha', 'blue'],
    ['completado', false, 'Listo', 'teal'],
    ['aprobado', false, 'Aprobado', 'green'],
    ['pendiente', true, 'Pendiente de tu parte', 'amber'],
    ['completado', true, 'Recibido', 'green'],
  ] as const)('%s (del cliente: %s) se le muestra al cliente como "%s"', (estado, responsable_cliente, texto, tono) => {
    expect(estadoCliente({ estado, responsable_cliente })).toEqual({ texto, tono });
  });
});

describe('puntosDesdeIa', () => {
  it('convierte los puntos de la IA en puntos del editor, con el cliente como responsable y la cita para revisar', () => {
    const puntos = puntosDesdeIa([
      { titulo: 'Video en el home', descripcion: 'Sin sonido.', responsable_cliente: false, fecha_compromiso: '2026-10-03', cita: 'que no suene', tareas_sugeridas: [] },
      { titulo: 'Fichas técnicas', descripcion: '', responsable_cliente: true, fecha_compromiso: null, cita: 'te las mando el lunes', tareas_sugeridas: [] },
    ]);
    expect(puntos.map(({ clave: _, ...p }) => p)).toEqual([
      { titulo: 'Video en el home', descripcion: 'Sin sonido.', responsable: '', fecha: '2026-10-03', cita: 'que no suene' },
      { titulo: 'Fichas técnicas', descripcion: '', responsable: 'cliente', fecha: '', cita: 'te las mando el lunes' },
    ]);
    expect(new Set(puntos.map((p) => p.clave)).size).toBe(2);
  });
});
