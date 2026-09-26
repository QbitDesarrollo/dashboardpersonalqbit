import { describe, it, expect } from 'vitest';
import {
  entregasAbiertas, periodoAnterior, semanasDisponibles, analizarSemana, eventosDeTarea, semaforo, avanceAl, lotesPorTamano, textoPlano,
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
const SEMANA = { desde: '2026-09-14', hasta: '2026-09-20' };

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

describe('analizarSemana', () => {
  it('toma estados y fechas al cierre de la semana, aunque hoy sean otros', () => {
    const r = analizarSemana([
      // Delivered on the 18th, reopened on the 21st: at the cut it was delivered.
      tarea({ id: 'a', estado: 'backlog', cambios: [
        { fecha: '2026-09-18', de: 'en_proceso', a: 'entregado', por: 'Oriana' },
        { fecha: '2026-09-21', de: 'entregado', a: 'backlog', por: 'Even' },
      ] }),
      // Due on the 19th at the cut; moved to the 30th on the 22nd.
      tarea({ id: 'b', fecha_entrega: '2026-09-30', reprogramaciones: [{ fecha: '2026-09-22', anterior: '2026-09-19', nueva: '2026-09-30', motivo: 'CLIENTE', comentario: null, por: 'Ana' }] }),
    ], SEMANA);
    expect(r.movidas.map((t) => [t.id, t.estado_al_corte])).toEqual([['a', 'entregado']]);
    expect(r.riesgos.map((t) => [t.id, t.fecha_al_corte, t.dias_atraso])).toEqual([['b', '2026-09-19', 2]]);
  });

  it('separa lo que se movió en la semana, los riesgos, lo próximo y el resto; deja fuera lo creado después', () => {
    const r = analizarSemana([
      tarea({ id: 'hecha', estado: 'entregado', cambios: [{ fecha: '2026-09-17', de: 'en_proceso', a: 'entregado', por: 'Ana' }] }),
      tarea({ id: 'comentada', comentarios: 2, fecha_entrega: '2026-10-10' }),
      tarea({ id: 'bloqueada', estado: 'bloqueado', fecha_entrega: '2026-10-10' }),
      tarea({ id: 'proxima', estado: 'backlog', fecha_entrega: '2026-09-24' }),
      tarea({ id: 'quieta', estado: 'en_proceso', fecha_entrega: '2026-11-01' }),
      tarea({ id: 'vieja', estado: 'aprobado', cambios: [{ fecha: '2026-08-01', de: 'entregado', a: 'aprobado', por: 'Ana' }] }),
      tarea({ id: 'futura', creada: '2026-09-25' }),
    ], SEMANA);
    expect(r.movidas.map((t) => t.id)).toEqual(['hecha', 'comentada']);
    expect(r.riesgos.map((t) => t.id)).toEqual(['bloqueada']);
    expect(r.proximas.map((t) => t.id)).toEqual(['proxima']);
    expect(r.resto.map((t) => t.id)).toEqual(['bloqueada', 'proxima', 'quieta']);
    expect(r.entregadas_antes).toBe(1);
    expect(r.indicadores).toEqual({ entregadas: 1, atrasadas: 0, bloqueadas: 1, fechas_movidas: 0, proximas: 1, abiertas: 4 });
  });
});

describe('eventosDeTarea', () => {
  it('cuenta lo que pasó en una línea cada cosa: entregas adelantadas o tarde, movimientos y fechas movidas con su motivo', () => {
    expect(eventosDeTarea(tarea({ fecha_entrega: '2026-09-25', cambios: [{ fecha: '2026-09-18', de: 'en_proceso', a: 'entregado', por: 'Oriana Barcia' }] }), SEMANA))
      .toEqual(['Entregada el 18 sep por Oriana Barcia · 7 días antes de lo previsto']);
    expect(eventosDeTarea(tarea({ fecha_entrega: '2026-09-15', cambios: [{ fecha: '2026-09-17', de: 'en_proceso', a: 'entregado', por: 'Ana' }] }), SEMANA))
      .toEqual(['Entregada el 17 sep por Ana · 2 días tarde']);
    expect(eventosDeTarea(tarea({ cambios: [
      { fecha: '2026-09-14', de: 'backlog', a: 'en_proceso', por: 'Jonathan Vera' },
      { fecha: '2026-09-15', de: 'en_proceso', a: 'revision_interna', por: 'Jonathan Vera' },
    ] }), SEMANA)).toEqual(['Pendiente → En proceso → Revisión interna (15 sep, Jonathan Vera)']);
    expect(eventosDeTarea(tarea({ reprogramaciones: [
      { fecha: '2026-09-16', anterior: '2026-09-20', nueva: '2026-09-27', motivo: 'CLIENTE', comentario: null, por: 'Ana' },
      { fecha: '2026-09-17', anterior: '2026-09-27', nueva: '2026-09-30', motivo: 'SIN_CLASIFICAR', comentario: null, por: 'Ana' },
    ] }), SEMANA)).toEqual(['Fecha movida del 20 sep al 27 sep · por pedido del cliente', 'Fecha movida del 27 sep al 30 sep']);
  });
});

describe('avanceAl', () => {
  it('porcentaje de tareas listas a una fecha, con las que existían a esa fecha', () => {
    const tareas = [
      tarea({ id: '1', estado: 'entregado', cambios: [{ fecha: '2026-09-10', de: 'en_proceso', a: 'entregado', por: null }] }),
      tarea({ id: '2', estado: 'entregado', cambios: [{ fecha: '2026-09-18', de: 'en_proceso', a: 'entregado', por: null }] }),
      tarea({ id: '3', estado: 'backlog' }),
      tarea({ id: '4', estado: 'backlog', creada: '2026-09-19' }),
    ];
    expect(avanceAl(tareas, '2026-09-13')).toBe(33);
    expect(avanceAl(tareas, '2026-09-20')).toBe(50);
    expect(avanceAl([], '2026-09-20')).toBe(0);
  });
});

describe('semaforo', () => {
  it('rojo con atrasos, amarillo con bloqueos o fechas movidas, verde si todo va bien', () => {
    const base = { entregadas: 2, atrasadas: 0, bloqueadas: 0, fechas_movidas: 0, proximas: 3, abiertas: 10 };
    expect(semaforo(base)).toEqual({ color: 'verde', frase: 'Vamos bien: sin atrasos ni bloqueos.' });
    expect(semaforo({ ...base, bloqueadas: 1, fechas_movidas: 2 })).toEqual({ color: 'amarillo', frase: 'Atención: 1 tarea bloqueada y 2 fechas movidas.' });
    expect(semaforo({ ...base, atrasadas: 3, bloqueadas: 1 })).toEqual({ color: 'rojo', frase: 'En riesgo: 3 entregas atrasadas y 1 tarea bloqueada.' });
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
