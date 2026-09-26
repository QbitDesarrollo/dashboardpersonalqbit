import { describe, it, expect, vi } from 'vitest';
import { generarContenido, type DatosReporte, type DepsGenerador } from '../src/reportes/generador.js';
import { ErrorRunnerOcupado, type TipoTrabajo } from '../src/minutas/ia/runner.js';
import type { TareaDelPeriodo } from '../src/reportes/dominio.js';

const tarea = (t: Partial<TareaDelPeriodo>): TareaDelPeriodo => ({
  id: 't', titulo: 'Tarea', estado: 'en_proceso', fecha_entrega: '2026-10-10', responsable: 'Ana', creada: '2026-09-01',
  cerrada: null, detalle: '', subtareas: null, ...t,
});

function datos(extra: Partial<DatosReporte> = {}): DatosReporte {
  return {
    proyecto: { id: 'p1', nombre: 'Bot Proyecta', marca: 'Alba del Bosque', lider: 'Even Fierro', salud: 'amarillo' },
    periodo: { desde: '2026-09-21', hasta: '2026-09-27' },
    avanceProyecto: { total: 10, listas: 4 },
    tareas: [
      tarea({ id: 'con', titulo: 'Momento de ofrecer cita', detalle: 'Definir cuándo se ofrece la cita. '.repeat(20) }),
      tarea({ id: 'sin', titulo: 'Ficha de ingresos', detalle: 'Tomar ingresos como capacidad de compra.', responsable: 'Diego' }),
      tarea({ id: 'hecha', titulo: 'Menú de incidencias', estado: 'entregado', cerrada: '2026-09-24', detalle: '' }),
    ],
    comentarios: new Map([['con', [{ fecha: '2026-09-23', autor: 'Jonathan Vera', texto: 'Se acordó ofrecerla solo con presupuesto.' }]]]),
    cambios: new Map([['hecha', [{ fecha: '2026-09-24', de: 'en_proceso', a: 'entregado', por: 'Oriana' }]]]),
    ...extra,
  };
}

/** Fake runner: answers each step from the ids it receives; records every call. */
function runnerFalso(opciones: { omitir?: string[]; citas?: string[]; ocupadoVeces?: number } = {}) {
  const llamadas: { tipo: TipoTrabajo; entrada: any; indicaciones?: string }[] = [];
  let ocupado = opciones.ocupadoVeces ?? 0;
  const trabajo = vi.fn(async (tipo: TipoTrabajo, entrada: any, indicaciones?: string) => {
    if (ocupado > 0) { ocupado--; throw new ErrorRunnerOcupado('Codex está ocupado con otro trabajo.'); }
    llamadas.push({ tipo, entrada, indicaciones });
    const ids = (entrada.tareas ?? []).map((t: any) => t.id).filter((id: string) => !opciones.omitir?.includes(id));
    if (tipo === 'reporte-descripciones') return { tareas: ids.map((id: string) => ({ id, de_que_trata: `el tema de ${id}` })) };
    if (tipo === 'reporte-avances') return { tareas: ids.map((id: string) => ({ id, avance: `Avance de ${id}.`, decision: 'Ofrecer la cita solo con presupuesto.', bloqueo: '' })) };
    return {
      resumen_ejecutivo: 'Semana con avances en citas.',
      logros: [{ texto: 'Se entregó el menú.', task_ids: opciones.citas ?? ['hecha'] }],
      decisiones: [{ texto: 'Cita solo con presupuesto.', task_ids: ['con'] }],
      riesgos: [],
      mensaje_correo: 'El proyecto avanza bien.',
    };
  });
  return { runner: { trabajo }, llamadas };
}

function cacheFalsa() {
  const resumenes = new Map<string, { hash: string; resumen: string }>();
  const avances = new Map<string, unknown>();
  const cache: DepsGenerador['cache'] = {
    resumenes: async (ids) => new Map(ids.filter((id) => resumenes.has(id)).map((id) => [id, resumenes.get(id)!])),
    guardarResumen: async (id, hash, resumen) => { resumenes.set(id, { hash, resumen }); },
    avance: async (hash) => (avances.get(hash) as any) ?? null,
    guardarAvance: async (hash, a) => { avances.set(hash, a); },
  };
  return cache;
}

const deps = (runner: any, cache = cacheFalsa()): DepsGenerador => ({ runner, cache, esperar: async () => {} });

describe('generarContenido', () => {
  it('arma el reporte por capas: la tarea sin comentarios usa la plantilla y nunca pasa por la capa de avances', async () => {
    const { runner, llamadas } = runnerFalso();
    const c = await generarContenido(datos(), deps(runner));
    const avances = llamadas.find((l) => l.tipo === 'reporte-avances')!;
    expect(avances.entrada.tareas.map((t: any) => t.id)).toEqual(['con']);
    expect(avances.entrada.tareas[0].comentarios).toEqual([{ fecha: '2026-09-23', autor: 'Jonathan Vera', texto: 'Se acordó ofrecerla solo con presupuesto.' }]);
    const fila = (id: string) => c.grupos.flatMap((g) => g.tareas).find((t) => t.id === id)!;
    expect(fila('con')).toMatchObject({ fuente: 'ia', linea: 'Avance de con. Decisión: Ofrecer la cita solo con presupuesto.' });
    expect(fila('sin')).toMatchObject({ fuente: 'plantilla', linea: 'Consiste en el tema de sin. Está en En proceso, a cargo de Diego, con entrega el 10 oct. No hay comentarios del equipo en este periodo.' });
    expect(c.sin_actualizacion.map((t) => t.id)).toEqual(['sin']);
    expect(c.indicadores).toMatchObject({ completadas: 1, en_curso: 2, avance: 40 });
    expect(c.resumen_ejecutivo).toBe('Semana con avances en citas.');
    expect(c.mensaje_correo).toBe('El proyecto avanza bien.');
  });

  it('reutiliza el "de qué trata" guardado si la descripción no cambió, y lo recalcula si cambió', async () => {
    const cache = cacheFalsa();
    await generarContenido(datos(), deps(runnerFalso().runner, cache));
    const segunda = runnerFalso();
    await generarContenido(datos(), deps(segunda.runner, cache));
    expect(segunda.llamadas.map((l) => l.tipo)).toEqual(['reporte-resumen']);
    const tercera = runnerFalso();
    const cambiada = datos({ tareas: [tarea({ id: 'sin', titulo: 'Ficha de ingresos', detalle: 'Ahora también la edad.' })] });
    await generarContenido(cambiada, deps(tercera.runner, cache));
    expect(tercera.llamadas.find((l) => l.tipo === 'reporte-descripciones')!.entrada.tareas.map((t: any) => t.id)).toEqual(['sin']);
  });

  it('si Codex está ocupado, espera y vuelve a intentar', async () => {
    const { runner, llamadas } = runnerFalso({ ocupadoVeces: 2 });
    const esperar = vi.fn(async () => {});
    await generarContenido(datos(), { runner, cache: cacheFalsa(), esperar });
    expect(esperar).toHaveBeenCalledTimes(2);
    expect(llamadas.map((l) => l.tipo)).toEqual(['reporte-descripciones', 'reporte-avances', 'reporte-resumen']);
  });

  it('descarta destacados que citan tareas que no están en el reporte', async () => {
    const { runner } = runnerFalso({ citas: ['inventada'] });
    const c = await generarContenido(datos(), deps(runner));
    expect(c.destacados.logros).toEqual([]);
    expect(c.destacados.decisiones).toEqual([{ texto: 'Cita solo con presupuesto.', task_ids: ['con'] }]);
  });

  it('si Codex se salta una tarea con comentarios, no la deja vacía', async () => {
    const { runner } = runnerFalso({ omitir: ['con'] });
    const c = await generarContenido(datos(), deps(runner));
    const fila = c.grupos.flatMap((g) => g.tareas).find((t) => t.id === 'con')!;
    expect(fila.linea).toBe('Tuvo 1 comentario del equipo en el periodo; no se pudo resumir automáticamente, revísalo en Tiusdei.');
  });

  it('las indicaciones del líder y el borrador anterior solo van a la redacción final', async () => {
    const { runner, llamadas } = runnerFalso();
    const anterior = { resumen_ejecutivo: 'Antes', destacados: { logros: [], decisiones: [], riesgos: [] }, mensaje_correo: 'x' };
    await generarContenido(datos(), deps(runner), { indicaciones: 'Resalta los atrasos', anterior });
    expect(llamadas.filter((l) => l.tipo !== 'reporte-resumen').every((l) => !l.indicaciones)).toBe(true);
    const resumen = llamadas.find((l) => l.tipo === 'reporte-resumen')!;
    expect(resumen.indicaciones).toBe('Resalta los atrasos');
    expect(resumen.entrada.borrador_anterior).toMatchObject({ resumen_ejecutivo: 'Antes' });
  });
});
