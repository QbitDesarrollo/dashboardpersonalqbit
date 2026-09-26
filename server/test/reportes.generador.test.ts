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
    tarea({ id: 'semana', titulo: 'Roles del panel', estado: 'entregado', fecha_entrega: '2026-09-16',
      cambios: [{ fecha: '2026-09-16', de: 'en_proceso', a: 'entregado', por: 'Ana' }] }),
    tarea({ id: 'tarde', titulo: 'Ficha de ingresos', fecha_entrega: '2026-09-17', responsable: 'Diego' }),
    tarea({ id: 'vieja', titulo: 'Contrato de integración', estado: 'backlog', fecha_entrega: '2026-09-10' }),
    tarea({ id: 'proxima', titulo: 'Derivación', estado: 'backlog', fecha_entrega: '2026-09-22',
      reprogramaciones: [{ fecha: '2026-09-15', anterior: '2026-09-18', nueva: '2026-09-22', motivo: 'CLIENTE', comentario: null, por: 'Ana' }] }),
    tarea({ id: 'quieta', titulo: 'Pruebas de carga', estado: 'backlog', fecha_entrega: '2026-11-01' }),
  ];
  return {
    proyecto: { id: 'p1', nombre: 'Bot Proyecta', marca: 'Alba del Bosque', lider: 'Even Fierro', salud: 'amarillo', salud_manual: 'amarillo', estado: 'en_curso', fecha_fin: null },
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
  it('arma el reporte por fecha de entrega: semáforo como Tiusdei, avance con contexto y una tabla por pregunta', async () => {
    const { runner } = runnerFalso();
    const c = await generarContenido(datos(), deps(runner));
    expect(c.version).toBe(3);
    expect(c.semana).toEqual({ desde: '2026-09-14', hasta: '2026-09-20' });
    expect(c.proxima).toEqual({ desde: '2026-09-21', hasta: '2026-09-27' });
    expect(c.semaforo).toEqual({ color: 'rojo', frase: 'En riesgo: 2 tareas vencidas sin entregar.', nota: 'En Tiusdei el proyecto está marcado en amarillo a mano.' });
    expect(c.indicadores).toEqual({
      previstas: 2, cumplidas: 1, atrasadas: 2, postergadas: 1, proxima_semana: 1, bloqueadas: 0, entregadas_semana: 2, abiertas: 5, por_vencer: 1,
    });
    expect(c.avance).toEqual({ listas: 2, total: 7, porcentaje: 29, porcentaje_inicio: 0 });
    const filas = (xs: { id: string; vence: string | null; resultado: string }[]) => xs.map((x) => [x.id, x.vence, x.resultado]);
    expect(filas(c.entregas)).toEqual([['semana', '2026-09-16', 'Entregada el 16 sep · a tiempo'], ['tarde', '2026-09-17', 'En proceso · 4 días de atraso']]);
    expect(filas(c.atrasadas_anteriores)).toEqual([['vieja', '2026-09-10', 'Pendiente · 11 días de atraso']]);
    expect(filas(c.otras_entregas)).toEqual([['hecha', '2026-09-25', 'Entregada el 18 sep · 7 días antes']]);
    expect(c.cambios_fecha).toEqual([{ id: 'proxima', titulo: 'Derivación', responsable: 'Ana', antes: '2026-09-18', ahora: '2026-09-22', motivo: 'Pedido del cliente', postergada: true }]);
    expect(filas(c.proxima_semana)).toEqual([['proxima', '2026-09-22', 'Pendiente']]);
    expect(filas(c.otras_abiertas)).toEqual([['con', '2026-10-10', 'En proceso'], ['quieta', '2026-11-01', 'Pendiente']]);
    expect(c.entregas[1]).toMatchObject({ titulo: 'Ficha de ingresos', responsable: 'Diego' });
    expect(c.resumen_ejecutivo).toBe('Semana con avances en citas y una entrega atrasada.');
  });

  it('a Codex le llegan los números ya redactados, para que no invente métricas', async () => {
    const { runner, llamadas } = runnerFalso();
    await generarContenido(datos(), deps(runner));
    expect(llamadas.find((l) => l.tipo === 'reporte-avances')!.entrada.tareas.map((t: any) => t.id)).toEqual(['con']);
    const resumen = llamadas.find((l) => l.tipo === 'reporte-resumen')!.entrada;
    expect(resumen.hechos_clave).toEqual([
      'De las 2 tareas que vencían esta semana, 1 está entregada.',
      'Hay 2 tareas vencidas sin entregar; 1 de ellas viene de semanas anteriores.',
      'Además se entregó 1 tarea que vencía en otra semana.',
      '1 tarea se postergó esta semana.',
      'La próxima semana (21 sep – 27 sep) vence 1 tarea.',
      'Avance general del proyecto: 29% (2 de 7 tareas terminadas); al empezar la semana era 0%.',
    ]);
    expect(resumen.otras_abiertas.find((t: any) => t.id === 'con')).toMatchObject({ avance: 'Avance de con.', decision: 'Ofrecer la cita solo con presupuesto.' });
  });

  it('en la semana en curso lo aclara y sin tareas en la semana no inventa porcentajes', async () => {
    const { runner, llamadas } = runnerFalso();
    await generarContenido(datos({ periodo: { desde: '2026-09-28', hasta: '2026-09-30', parcial: true } }), deps(runner));
    const hechos = llamadas.find((l) => l.tipo === 'reporte-resumen')!.entrada.hechos_clave;
    expect(hechos[0]).toBe('Ninguna tarea vencía esta semana.');
    expect(hechos[hechos.length - 1]).toBe('La semana todavía está en curso: los datos llegan hasta el 30 sep.');
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
