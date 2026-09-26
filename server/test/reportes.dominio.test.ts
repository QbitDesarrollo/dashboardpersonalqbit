import { describe, it, expect } from 'vitest';
import {
  entregasAbiertas, periodoAnterior, clasificarTareas, lotesPorTamano, lineaSinComentarios, textoPlano,
  filtrarCitas, puede, ErrorReporte, type TareaDelPeriodo,
} from '../src/reportes/dominio.js';

const LUNES_8 = { activo: true, dia_entrega: 1, hora_entrega: '08:00', anticipacion_horas: 3 };

describe('entregasAbiertas', () => {
  it('el lunes 8:00 de Ecuador es 13:00 UTC; el periodo es la semana anterior de lunes a domingo', () => {
    // Monday 28-sep-2026 05:30 Ecuador = 10:30 UTC: the 3-hour window before 08:00 is open.
    expect(entregasAbiertas(LUNES_8, new Date('2026-09-28T10:30:00Z'))).toEqual([
      { entregarEn: new Date('2026-09-28T13:00:00Z'), desde: '2026-09-21', hasta: '2026-09-27' },
    ]);
  });

  it('antes de la ventana de preparación todavía no hay nada que generar', () => {
    expect(entregasAbiertas(LUNES_8, new Date('2026-09-28T09:59:00Z'))).toEqual([]);
    expect(entregasAbiertas(LUNES_8, new Date('2026-09-25T15:00:00Z'))).toEqual([]);
  });

  it('si el servidor estuvo caído, recupera la entrega del mismo día, pero no semanas viejas', () => {
    expect(entregasAbiertas(LUNES_8, new Date('2026-09-28T20:00:00Z'))).toEqual([
      { entregarEn: new Date('2026-09-28T13:00:00Z'), desde: '2026-09-21', hasta: '2026-09-27' },
    ]);
    expect(entregasAbiertas(LUNES_8, new Date('2026-09-30T20:00:00Z'))).toEqual([]);
  });

  it('respeta el día y la hora elegidos, también de noche en Ecuador (ya es otro día en UTC)', () => {
    const viernes22 = { activo: true, dia_entrega: 5, hora_entrega: '22:00', anticipacion_horas: 2 };
    // Friday 2-oct 22:00 Ecuador = Saturday 3-oct 03:00 UTC. Period: Friday 25-sep to Thursday 1-oct.
    expect(entregasAbiertas(viernes22, new Date('2026-10-03T01:30:00Z'))).toEqual([
      { entregarEn: new Date('2026-10-03T03:00:00Z'), desde: '2026-09-25', hasta: '2026-10-01' },
    ]);
  });

  it('desactivado no programa nada', () => {
    expect(entregasAbiertas({ ...LUNES_8, activo: false }, new Date('2026-09-28T12:00:00Z'))).toEqual([]);
  });
});

describe('periodoAnterior', () => {
  it('"generar ahora" usa la última semana completa según el día de entrega', () => {
    // Saturday 26-sep 15:00 Ecuador: the last Monday delivery was 21-sep, covering 14 to 20-sep.
    expect(periodoAnterior(LUNES_8, new Date('2026-09-26T20:00:00Z'))).toEqual({
      entregarEn: new Date('2026-09-21T13:00:00Z'), desde: '2026-09-14', hasta: '2026-09-20',
    });
  });
});

const tarea = (t: Partial<TareaDelPeriodo>): TareaDelPeriodo => ({
  id: 't', titulo: 'Tarea', estado: 'en_proceso', fecha_entrega: null, responsable: 'Ana', creada: '2026-09-01',
  cerrada: null, detalle: '', subtareas: null, ...t,
});

describe('clasificarTareas', () => {
  const periodo = { desde: '2026-09-21', hasta: '2026-09-27' };

  it('pone cada tarea en un solo grupo: completadas, atrasadas, bloqueadas, en curso y pendientes', () => {
    const r = clasificarTareas([
      tarea({ id: 'c', estado: 'entregado', cerrada: '2026-09-23' }),
      tarea({ id: 'a', estado: 'en_proceso', fecha_entrega: '2026-09-25' }),
      tarea({ id: 'b', estado: 'bloqueado', fecha_entrega: '2026-10-10' }),
      tarea({ id: 'e', estado: 'revision_cliente', fecha_entrega: '2026-10-01' }),
      tarea({ id: 'p', estado: 'backlog', fecha_entrega: '2026-10-20' }),
    ], periodo);
    expect(Object.fromEntries(Object.entries(r.grupos).map(([k, v]) => [k, v.map((t) => t.id)]))).toEqual({
      completadas: ['c'], atrasadas: ['a'], bloqueadas: ['b'], en_curso: ['e'], pendientes: ['p'],
    });
    // Counted up to the cut, the day after the period ends (Monday 28): due Friday 25 is 3 days late.
    expect(r.grupos.atrasadas[0].dias_atraso).toBe(3);
  });

  it('una atrasada que además está bloqueada cuenta como atrasada', () => {
    const r = clasificarTareas([tarea({ id: 'x', estado: 'bloqueado', fecha_entrega: '2026-09-22' })], periodo);
    expect(r.grupos.atrasadas.map((t) => t.id)).toEqual(['x']);
  });

  it('deja fuera las cerradas antes del periodo y las creadas después', () => {
    const r = clasificarTareas([
      tarea({ id: 'vieja', estado: 'aprobado', cerrada: '2026-09-10' }),
      tarea({ id: 'nueva', creada: '2026-09-28' }),
    ], periodo);
    expect(Object.values(r.grupos).flat()).toEqual([]);
  });

  it('próximo periodo: lo abierto que vence en los siete días siguientes', () => {
    const r = clasificarTareas([
      tarea({ id: 'pronto', fecha_entrega: '2026-10-02' }),
      tarea({ id: 'lejos', fecha_entrega: '2026-10-20' }),
      tarea({ id: 'hecha', estado: 'entregado', cerrada: '2026-09-24', fecha_entrega: '2026-10-01' }),
    ], periodo);
    expect(r.proximo.map((t) => t.id)).toEqual(['pronto']);
  });

  it('cuenta los indicadores', () => {
    const r = clasificarTareas([
      tarea({ id: 'c', estado: 'entregado', cerrada: '2026-09-23' }),
      tarea({ id: 'a', fecha_entrega: '2026-09-22' }),
      tarea({ id: 'p', estado: 'backlog' }),
    ], periodo);
    expect(r.indicadores).toEqual({ completadas: 1, atrasadas: 1, bloqueadas: 0, en_curso: 0, pendientes: 1 });
  });
});

describe('lotesPorTamano', () => {
  it('agrupa las cortas y manda sola la que no entra con otras', () => {
    const lotes = lotesPorTamano([
      { id: 'a', tamano: 400 }, { id: 'b', tamano: 500 }, { id: 'c', tamano: 3000 }, { id: 'd', tamano: 200 },
    ], 1000);
    expect(lotes.map((l) => l.map((x) => x.id))).toEqual([['a', 'b'], ['c'], ['d']]);
  });
});

describe('lineaSinComentarios', () => {
  it('describe la tarea con lo que hay, sin inventar', () => {
    expect(lineaSinComentarios(tarea({ estado: 'en_proceso', responsable: 'Ana Mora', fecha_entrega: '2026-10-02' }), 'el rediseño del home'))
      .toBe('Consiste en el rediseño del home. Está en En proceso, a cargo de Ana Mora, con entrega el 2 oct. No hay comentarios del equipo en este periodo.');
    expect(lineaSinComentarios(tarea({ estado: 'backlog', responsable: null, fecha_entrega: null }), null))
      .toBe('No tiene descripción. Está en Pendiente, sin responsable, sin fecha de entrega. No hay comentarios del equipo en este periodo.');
  });
});

describe('textoPlano', () => {
  it('quita el HTML, marca las imágenes y borra los datos en base64', () => {
    expect(textoPlano('<p>Hola&nbsp;<b>equipo</b></p><img src="data:image/png;base64,AAAA"><p>Listo &amp; revisado</p>'))
      .toBe('Hola equipo [imagen] Listo & revisado');
    expect(textoPlano(null)).toBe('');
  });
});

describe('filtrarCitas', () => {
  it('descarta citas a tareas que no están en el reporte y los destacados sin respaldo', () => {
    expect(filtrarCitas([
      { texto: 'Se publicó el home', task_ids: ['t1', 'inventada'] },
      { texto: 'Algo sin respaldo', task_ids: ['otra'] },
    ], new Set(['t1']))).toEqual([{ texto: 'Se publicó el home', task_ids: ['t1'] }]);
  });
});

describe('puede', () => {
  it('regenerar solo en borrador o fallido; aprobar solo en borrador; enviar solo aprobado', () => {
    expect(() => puede('regenerar', 'borrador')).not.toThrow();
    expect(() => puede('regenerar', 'fallido')).not.toThrow();
    expect(() => puede('regenerar', 'aprobado')).toThrow(ErrorReporte);
    expect(() => puede('aprobar', 'borrador')).not.toThrow();
    expect(() => puede('aprobar', 'generando')).toThrow(ErrorReporte);
    expect(() => puede('enviar', 'aprobado')).not.toThrow();
    expect(() => puede('enviar', 'borrador')).toThrow('Primero aprueba el reporte.');
  });
});
