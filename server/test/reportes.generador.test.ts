import { describe, it, expect, vi } from 'vitest';
import { generarContenido, type DatosReporte, type DepsGenerador } from '../src/reportes/generador.js';
import { ErrorRunnerOcupado, type TipoTrabajo } from '../src/minutas/ia/runner.js';
import type { TareaDelPeriodo } from '../src/reportes/dominio.js';

const tarea = (t: Partial<TareaDelPeriodo>): TareaDelPeriodo => ({
  id: 't', titulo: 'Tarea', estado: 'en_proceso', fecha_entrega: '2026-10-10', responsable: 'Ana', creada: '2026-09-01',
  cambios: [], reprogramaciones: [], comentarios: 0, ...t,
});

function datos(extra: Partial<DatosReporte> = {}): DatosReporte {
  const tareas = [
    tarea({ id: 'con', titulo: 'Momento de ofrecer cita', responsable: 'Jonathan Vera', comentarios: 1 }),
    tarea({ id: 'hecha', titulo: 'Menú de incidencias', estado: 'entregado', fecha_entrega: '2026-09-25', responsable: 'Oriana Barcia',
      cambios: [{ fecha: '2026-09-18', de: 'en_proceso', a: 'entregado', por: 'Oriana Barcia' }] }),
    tarea({ id: 'tarde', titulo: 'Ficha de ingresos', fecha_entrega: '2026-09-17', responsable: 'Diego' }),
    tarea({ id: 'quieta', titulo: 'Pruebas de carga', estado: 'backlog', fecha_entrega: '2026-11-01' }),
  ];
  return {
    proyecto: { id: 'p1', nombre: 'Bot Proyecta', marca: 'Alba del Bosque', lider: 'Even Fierro', salud: 'amarillo' },
    periodo: { desde: '2026-09-14', hasta: '2026-09-20' },
    tareas,
    todas: tareas,
    comentarios: new Map([['con', [{ fecha: '2026-09-16', autor: 'Jonathan Vera', texto: 'Se acordó ofrecerla solo con presupuesto.' }]]]),
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
    if (tipo === 'reporte-avances') {
      const ids = entrada.tareas.map((t: any) => t.id).filter((id: string) => !opciones.omitir?.includes(id));
      return { tareas: ids.map((id: string) => ({ id, avance: `Avance de ${id}.`, decision: 'Ofrecer la cita solo con presupuesto.', bloqueo: '' })) };
    }
    return {
      resumen_ejecutivo: 'Semana con avances en citas y una entrega atrasada.',
      logros: [{ texto: 'Se entregó el menú.', task_ids: opciones.citas ?? ['hecha'] }],
      decisiones: [{ texto: 'Cita solo con presupuesto.', task_ids: ['con'] }],
      riesgos: [{ texto: 'La ficha va tarde.', task_ids: ['tarde'] }],
      mensaje_correo: 'El proyecto avanza con un atraso.',
    };
  });
  return { runner: { trabajo }, llamadas };
}

function cacheFalsa() {
  const avances = new Map<string, unknown>();
  const cache: DepsGenerador['cache'] = {
    avance: async (hash) => (avances.get(hash) as any) ?? null,
    guardarAvance: async (hash, a) => { avances.set(hash, a); },
  };
  return cache;
}

const deps = (runner: any, cache = cacheFalsa()): DepsGenerador => ({ runner, cache, esperar: async () => {} });

describe('generarContenido', () => {
  it('arma el reporte de la semana: semáforo, números, lo que se movió con sus hechos, riesgos y el resto compacto', async () => {
    const { runner, llamadas } = runnerFalso();
    const c = await generarContenido(datos(), deps(runner));
    expect(c.version).toBe(2);
    expect(c.semaforo).toEqual({ color: 'rojo', frase: 'En riesgo: 1 entrega atrasada.' });
    expect(c.indicadores).toMatchObject({ entregadas: 1, atrasadas: 1, abiertas: 3, avance: 25, avance_semana: 25 });
    expect(c.movidas.map((m) => [m.id, m.eventos, m.avance])).toEqual([
      ['hecha', ['Entregada el 18 sep por Oriana Barcia · 7 días antes de lo previsto'], null],
      ['con', [], 'Avance de con.'],
    ]);
    expect(c.riesgos).toEqual([{ id: 'tarde', titulo: 'Ficha de ingresos', responsable: 'Diego', estado_texto: 'En proceso', fecha_entrega: '2026-09-17', dias_atraso: 4 }]);
    expect(c.resto.map((t) => [t.titulo, t.responsable, t.estado_texto])).toEqual([['Ficha de ingresos', 'Diego', 'En proceso'], ['Pruebas de carga', 'Ana', 'Pendiente']]);
    // Only tasks with comments go to Codex, with their facts; nothing about quiet tasks.
    expect(llamadas.find((l) => l.tipo === 'reporte-avances')!.entrada.tareas.map((t: any) => t.id)).toEqual(['con']);
    expect(llamadas.map((l) => l.tipo)).toEqual(['reporte-avances', 'reporte-resumen']);
    expect(c.resumen_ejecutivo).toBe('Semana con avances en citas y una entrega atrasada.');
  });

  it('reutiliza los avances ya resumidos si los comentarios no cambiaron', async () => {
    const cache = cacheFalsa();
    await generarContenido(datos(), deps(runnerFalso().runner, cache));
    const segunda = runnerFalso();
    await generarContenido(datos(), deps(segunda.runner, cache));
    expect(segunda.llamadas.map((l) => l.tipo)).toEqual(['reporte-resumen']);
  });

  it('si Codex está ocupado, espera y vuelve a intentar', async () => {
    const { runner, llamadas } = runnerFalso({ ocupadoVeces: 2 });
    const esperar = vi.fn(async () => {});
    await generarContenido(datos(), { runner, cache: cacheFalsa(), esperar });
    expect(esperar).toHaveBeenCalledTimes(2);
    expect(llamadas.map((l) => l.tipo)).toEqual(['reporte-avances', 'reporte-resumen']);
  });

  it('descarta destacados que citan tareas que no están en el reporte', async () => {
    const { runner } = runnerFalso({ citas: ['inventada'] });
    const c = await generarContenido(datos(), deps(runner));
    expect(c.destacados.logros).toEqual([]);
    expect(c.destacados.riesgos).toEqual([{ texto: 'La ficha va tarde.', task_ids: ['tarde'] }]);
  });

  it('si Codex se salta una tarea con comentarios, lo dice en vez de dejarla vacía', async () => {
    const { runner } = runnerFalso({ omitir: ['con'] });
    const c = await generarContenido(datos(), deps(runner));
    expect(c.movidas.find((m) => m.id === 'con')!.avance).toBe('Tuvo 1 comentario del equipo; revísalo en Tiusdei.');
  });

  it('las indicaciones del líder y el borrador anterior solo van a la redacción final', async () => {
    const { runner, llamadas } = runnerFalso();
    const anterior = { resumen_ejecutivo: 'Antes', destacados: { logros: [], decisiones: [], riesgos: [] }, mensaje_correo: 'x' };
    await generarContenido(datos(), deps(runner), { indicaciones: 'Resalta los atrasos', anterior });
    expect(llamadas.find((l) => l.tipo === 'reporte-avances')!.indicaciones).toBeFalsy();
    const resumen = llamadas.find((l) => l.tipo === 'reporte-resumen')!;
    expect(resumen.indicaciones).toBe('Resalta los atrasos');
    expect(resumen.entrada.borrador_anterior).toMatchObject({ resumen_ejecutivo: 'Antes' });
  });
});
