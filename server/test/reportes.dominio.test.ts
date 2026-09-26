import { describe, it, expect } from 'vitest';
import {
  entregasAbiertas, periodoAnterior, semanasDisponibles, analizarSemana, resultado, semaforo, avanceAl, lotesPorTamano, textoPlano,
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
  cambios: [], reprogramaciones: [], comentarios: 0, ...t,
});

describe('semanasDisponibles', () => {
  it('ofrece esta semana hasta hoy y las anteriores completas, alineadas al día de entrega', () => {
    // Saturday 26-sep in Ecuador, deliveries on Mondays: weeks run Monday to Sunday.
    const semanas = semanasDisponibles(LUNES_8, new Date('2026-09-26T20:00:00Z'), 3);
    expect(semanas).toEqual([
      { desde: '2026-09-21', hasta: '2026-09-26', parcial: true },
      { desde: '2026-09-14', hasta: '2026-09-20', parcial: false },
      { desde: '2026-09-07', hasta: '2026-09-13', parcial: false },
    ]);
  });
});

const cerrada = (fecha: string) => [{ fecha, de: 'en_proceso', a: 'entregado', por: 'Ana' }];
const SEMANA_21 = { desde: '2026-09-21', hasta: '2026-09-27' };

describe('analizarSemana', () => {
  it('reparte las tareas por fecha de entrega: las de la semana, las atrasadas de antes, otras entregas, la próxima semana y el resto', () => {
    const r = analizarSemana([
      tarea({ id: 'a', estado: 'entregado', fecha_entrega: '2026-09-23', cambios: cerrada('2026-09-22') }),
      tarea({ id: 'b', estado: 'en_proceso', fecha_entrega: '2026-09-24' }),
      tarea({ id: 'c', estado: 'entregado', fecha_entrega: '2026-09-26', cambios: cerrada('2026-09-18') }),
      tarea({ id: 'd', estado: 'backlog', fecha_entrega: '2026-09-30' }),
      tarea({ id: 'e', estado: 'backlog', fecha_entrega: '2026-09-15' }),
      tarea({ id: 'f', estado: 'entregado', fecha_entrega: '2026-09-17', cambios: cerrada('2026-09-23') }),
      tarea({ id: 'g', estado: 'entregado', fecha_entrega: '2026-10-10', cambios: cerrada('2026-09-25') }),
      tarea({ id: 'h', estado: 'en_proceso', fecha_entrega: '2026-10-20' }),
      tarea({ id: 'i', estado: 'backlog' }),
      tarea({ id: 'j', estado: 'revision_cliente', fecha_entrega: '2026-09-15' }),
      tarea({ id: 'k', estado: 'aprobado', fecha_entrega: '2026-09-01', cambios: cerrada('2026-09-01') }),
      tarea({ id: 'l', estado: 'backlog', fecha_entrega: '2026-09-25', creada: '2026-09-29' }),
    ], SEMANA_21);
    const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
    expect(r.semana).toEqual({ desde: '2026-09-21', hasta: '2026-09-27' });
    expect(r.proxima).toEqual({ desde: '2026-09-28', hasta: '2026-10-04' });
    expect(ids(r.entregas)).toEqual(['a', 'b', 'c']);
    expect(ids(r.atrasadas_anteriores)).toEqual(['e']);
    expect(ids(r.otras_entregas)).toEqual(['f', 'g']);
    expect(ids(r.proxima_semana)).toEqual(['d']);
    expect(ids(r.otras_abiertas)).toEqual(['j', 'h', 'i']);
    expect(r.entregas.map(resultado)).toEqual(['Entregada el 22 sep · 1 día antes', 'En proceso · 4 días de atraso', 'Entregada el 18 sep · 8 días antes']);
    expect(r.otras_entregas.map(resultado)).toEqual(['Entregada el 23 sep · 6 días tarde', 'Entregada el 25 sep · 15 días antes']);
    expect(r.atrasadas_anteriores.map(resultado)).toEqual(['Pendiente · 13 días de atraso']);
    expect(r.indicadores).toEqual({
      previstas: 3, cumplidas: 2, atrasadas: 2, postergadas: 0, proxima_semana: 1, bloqueadas: 0, entregadas_semana: 3, abiertas: 6, por_vencer: 1,
    });
  });

  it('en la semana en curso, lo que vence hoy o después todavía no está atrasado', () => {
    const r = analizarSemana([
      tarea({ id: 'hoy', estado: 'en_proceso', fecha_entrega: '2026-09-24' }),
      tarea({ id: 'sabado', estado: 'backlog', fecha_entrega: '2026-09-26' }),
      tarea({ id: 'ayer', estado: 'en_proceso', fecha_entrega: '2026-09-23' }),
    ], { desde: '2026-09-21', hasta: '2026-09-24', parcial: true });
    expect(r.semana).toEqual({ desde: '2026-09-21', hasta: '2026-09-27' });
    expect(r.entregas.map((t) => [t.id, resultado(t)])).toEqual([['ayer', 'En proceso · 1 día de atraso'], ['hoy', 'En proceso'], ['sabado', 'Pendiente']]);
    expect(r.indicadores).toMatchObject({ previstas: 3, cumplidas: 0, atrasadas: 1, por_vencer: 2 });
  });

  it('toma estados y fechas al cierre de la semana, aunque hoy sean otros', () => {
    const r = analizarSemana([
      // Delivered on the 23rd, reopened on the 29th: at the cut it was delivered.
      tarea({ id: 'a', estado: 'backlog', fecha_entrega: '2026-09-24', cambios: [
        { fecha: '2026-09-23', de: 'en_proceso', a: 'entregado', por: 'Oriana' },
        { fecha: '2026-09-29', de: 'entregado', a: 'backlog', por: 'Even' },
      ] }),
      // Due on the 25th at the cut; moved to the 10th on the 29th.
      tarea({ id: 'b', fecha_entrega: '2026-10-10', reprogramaciones: [{ fecha: '2026-09-29', anterior: '2026-09-25', nueva: '2026-10-10', motivo: 'CLIENTE', comentario: null, por: 'Ana' }] }),
    ], SEMANA_21);
    expect(r.entregas.map((t) => [t.id, resultado(t)])).toEqual([['a', 'Entregada el 23 sep · 1 día antes'], ['b', 'En proceso · 3 días de atraso']]);
  });

  it('una entrega que no quedó en el historial se muestra sin fecha, sin inventarla', () => {
    const r = analizarSemana([
      tarea({ id: 'a', estado: 'entregado', fecha_entrega: '2026-09-23' }),
      // Delivered on the 14th, reopened on the 21st and closed again without a record: the old delivery no longer counts.
      tarea({ id: 'b', estado: 'entregado', fecha_entrega: '2026-09-24', cambios: [
        { fecha: '2026-09-14', de: 'en_proceso', a: 'entregado', por: 'Even' },
        { fecha: '2026-09-21', de: 'entregado', a: 'backlog', por: 'Even' },
      ] }),
    ], SEMANA_21);
    expect(r.entregas.map(resultado)).toEqual(['Entregada (sin fecha registrada)', 'Entregada (sin fecha registrada)']);
    expect(r.indicadores).toMatchObject({ previstas: 2, cumplidas: 2, entregadas_semana: 0 });
  });

  it('una tarea entregada y luego aprobada conserva su fecha de entrega', () => {
    const r = analizarSemana([tarea({ id: 'a', estado: 'aprobado', fecha_entrega: '2026-09-23', cambios: [
      { fecha: '2026-09-22', de: 'en_proceso', a: 'entregado', por: 'Ana' },
      { fecha: '2026-09-24', de: 'entregado', a: 'aprobado', por: 'Even' },
    ] })], SEMANA_21);
    expect(r.entregas.map(resultado)).toEqual(['Entregada el 22 sep · 1 día antes']);
  });

  it('los cambios de fecha de la semana van en una fila por tarea, primero lo que se postergó', () => {
    const mover = (fecha: string, anterior: string | null, nueva: string | null, motivo = 'SIN_CLASIFICAR', comentario: string | null = null) =>
      ({ fecha, anterior, nueva, motivo, comentario, por: 'Ana' });
    const r = analizarSemana([
      tarea({ id: 'post', titulo: 'Derivación', fecha_entrega: '2026-09-29', reprogramaciones: [mover('2026-09-22', '2026-09-25', '2026-09-29', 'ALCANCE')] }),
      tarea({ id: 'traida', fecha_entrega: '2026-09-30', reprogramaciones: [mover('2026-09-23', '2026-10-30', '2026-09-30', 'ALCANCE')] }),
      tarea({ id: 'ida-vuelta', fecha_entrega: '2026-09-25', reprogramaciones: [mover('2026-09-22', '2026-09-25', '2026-10-06'), mover('2026-09-24', '2026-10-06', '2026-09-25')] }),
      tarea({ id: 'dos', fecha_entrega: '2026-10-07', reprogramaciones: [
        mover('2026-09-21', '2026-10-02', '2026-10-08', 'ALCANCE'), mover('2026-09-25', '2026-10-08', '2026-10-07', 'INTERNO', 'Se adelanta un día'),
      ] }),
      tarea({ id: 'vieja', fecha_entrega: '2026-10-01', reprogramaciones: [mover('2026-09-10', '2026-09-20', '2026-10-01', 'CLIENTE')] }),
      tarea({ id: 'con-fecha', fecha_entrega: '2026-10-01', reprogramaciones: [mover('2026-09-22', null, '2026-10-01')] }),
    ], SEMANA_21);
    expect(r.cambios_fecha).toEqual([
      { id: 'dos', titulo: 'Tarea', responsable: 'Ana', antes: '2026-10-02', ahora: '2026-10-07', motivo: 'Cambio de alcance, ajuste del equipo · “Se adelanta un día”', postergada: true },
      { id: 'post', titulo: 'Derivación', responsable: 'Ana', antes: '2026-09-25', ahora: '2026-09-29', motivo: 'Cambio de alcance', postergada: true },
      { id: 'traida', titulo: 'Tarea', responsable: 'Ana', antes: '2026-10-30', ahora: '2026-09-30', motivo: 'Cambio de alcance', postergada: false },
      { id: 'con-fecha', titulo: 'Tarea', responsable: 'Ana', antes: null, ahora: '2026-10-01', motivo: null, postergada: false },
    ]);
    expect(r.indicadores.postergadas).toBe(2);
  });
});

describe('avanceAl', () => {
  it('tareas listas a una fecha, con las que existían a esa fecha', () => {
    const tareas = [
      tarea({ id: '1', estado: 'entregado', cambios: [{ fecha: '2026-09-10', de: 'en_proceso', a: 'entregado', por: null }] }),
      tarea({ id: '2', estado: 'entregado', cambios: [{ fecha: '2026-09-18', de: 'en_proceso', a: 'entregado', por: null }] }),
      tarea({ id: '3', estado: 'backlog' }),
      tarea({ id: '4', estado: 'backlog', creada: '2026-09-19' }),
    ];
    expect(avanceAl(tareas, '2026-09-13')).toEqual({ listas: 1, total: 3, porcentaje: 33 });
    expect(avanceAl(tareas, '2026-09-20')).toEqual({ listas: 2, total: 4, porcentaje: 50 });
    expect(avanceAl([], '2026-09-20')).toEqual({ listas: 0, total: 0, porcentaje: 0 });
  });
});

describe('semaforo', () => {
  const base = { atrasadas: 0, por_vencer: 0 };
  const proyecto = { estado: 'en_curso', fecha_fin: '2026-12-01', salud_manual: null };
  it('usa la misma regla que Tiusdei: rojo con tareas vencidas o la fecha de cierre pasada, amarillo si algo vence en 3 días', () => {
    expect(semaforo(base, proyecto, '2026-09-28')).toEqual({ color: 'verde', frase: 'Vamos bien: nada vencido ni por vencer.', nota: null });
    expect(semaforo({ ...base, por_vencer: 3 }, proyecto, '2026-09-28')).toEqual({ color: 'amarillo', frase: 'Atención: 3 entregas vencen en los próximos 3 días.', nota: null });
    expect(semaforo({ ...base, atrasadas: 1 }, proyecto, '2026-09-28').frase).toBe('En riesgo: 1 tarea vencida sin entregar.');
    expect(semaforo({ ...base, atrasadas: 16 }, { ...proyecto, fecha_fin: '2026-09-25' }, '2026-09-28'))
      .toEqual({ color: 'rojo', frase: 'En riesgo: 16 tareas vencidas sin entregar y la fecha de cierre del proyecto (25 sep) ya pasó.', nota: null });
    expect(semaforo(base, { ...proyecto, estado: 'pausado', fecha_fin: '2026-09-25' }, '2026-09-28').color).toBe('verde');
  });

  it('si en Tiusdei alguien fijó otro color a mano, lo aclara', () => {
    expect(semaforo({ ...base, atrasadas: 2 }, { ...proyecto, salud_manual: 'verde' }, '2026-09-28').nota)
      .toBe('En Tiusdei el proyecto está marcado en verde a mano.');
    expect(semaforo({ ...base, atrasadas: 2 }, { ...proyecto, salud_manual: 'rojo' }, '2026-09-28').nota).toBeNull();
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
