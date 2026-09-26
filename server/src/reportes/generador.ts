import { createHash } from 'crypto';
import { ErrorRunnerOcupado, type RunnerIa, type TipoTrabajo } from '../minutas/ia/runner.js';
import {
  analizarSemana, avanceAl, fechaCorta, filtrarCitas, limiteDelPeriodo, lotesPorTamano, resultado, semaforo, ErrorReporte,
  type CambioDeFecha, type Destacado, type Indicadores, type Periodo, type TareaAlCorte, type TareaDelPeriodo,
} from './dominio.js';

/**
 * Builds a weekly report (see REPORTES-PLAN.md). The week is the calendar week, measured by due date. Tiusdei
 * states the facts with fixed sentences: what was due and how it ended, what is late, other deliveries, date
 * changes, next week and the rest. Codex only summarizes the comments of the week (cached by input) and writes
 * the short summary on top, from numbers that are already worded.
 */

export interface Comentario { fecha: string; autor: string; texto: string }

export interface DatosReporte {
  proyecto: {
    id: string; nombre: string; marca: string; lider: string; salud: string;
    /** Color set by hand in Tiusdei, if any; the report's traffic light always follows the automatic rule. */
    salud_manual: string | null; estado: string | null; fecha_fin: string | null;
  };
  periodo: { desde: string; hasta: string; parcial?: boolean };
  /** Main tasks of the project (the ones the report lists). */
  tareas: TareaDelPeriodo[];
  /** Main tasks and subtasks (progress counts both, like the Projects screen). */
  todas: TareaDelPeriodo[];
  comentarios: Map<string, Comentario[]>;
}

export interface Avance { avance: string; decision: string; bloqueo: string }

export interface DepsGenerador {
  runner: Pick<RunnerIa, 'trabajo'>;
  cache: {
    avance(hash: string): Promise<Avance | null>;
    guardarAvance(hash: string, avance: Avance): Promise<void>;
  };
  esperar?: (ms: number) => Promise<void>;
}

/** One task in a table: due date at the cut and how it stood, in a fixed sentence. */
export interface Fila { id: string; titulo: string; responsable: string | null; vence: string | null; resultado: string }

export interface ContenidoReporte {
  version: 3;
  proyecto: DatosReporte['proyecto'];
  periodo: { desde: string; hasta: string; parcial: boolean };
  /** Calendar week of the report and the one after it. */
  semana: { desde: string; hasta: string };
  proxima: { desde: string; hasta: string };
  semaforo: { color: 'verde' | 'amarillo' | 'rojo'; frase: string; nota: string | null };
  indicadores: Indicadores;
  /** Whole project (main tasks and subtasks) at the cut, and the percentage when the week started. */
  avance: { listas: number; total: number; porcentaje: number; porcentaje_inicio: number };
  resumen_ejecutivo: string;
  destacados: { logros: Destacado[]; decisiones: Destacado[]; riesgos: Destacado[] };
  entregas: Fila[];
  atrasadas_anteriores: Fila[];
  otras_entregas: Fila[];
  cambios_fecha: CambioDeFecha[];
  proxima_semana: Fila[];
  otras_abiertas: Fila[];
  mensaje_correo: string;
  generado_en: string;
}

const PRESUPUESTO_AVANCES = 16_000;
const INTENTOS_OCUPADO = 20;
const ESPERA_OCUPADO_MS = 30_000;
const MAX_DESTACADOS = 3;

const sha = (texto: string) => createHash('sha256').update(texto).digest('hex');
const diaAntes = (fecha: string) => new Date(Date.parse(`${fecha}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const tareas = (n: number) => `${n} ${n === 1 ? 'tarea' : 'tareas'}`;
const rangoCorto = (r: { desde: string; hasta: string }) => `${fechaCorta(r.desde)} – ${fechaCorta(r.hasta)}`;

type Semana = ReturnType<typeof analizarSemana>;

/** The key numbers of the week, worded by Tiusdei so Codex repeats them instead of computing its own. */
function hechosClave(s: Semana, avance: ContenidoReporte['avance'], periodo: Periodo): string[] {
  const i = s.indicadores;
  const hechos: string[] = [];
  if (!i.previstas) hechos.push('Ninguna tarea vencía esta semana.');
  else if (i.previstas === 1) hechos.push(`La única tarea que vencía esta semana ${i.cumplidas ? 'está entregada' : 'no está entregada'}.`);
  else hechos.push(`De las ${i.previstas} tareas que vencían esta semana, ${i.cumplidas} ${i.cumplidas === 1 ? 'está entregada' : 'están entregadas'}.`);

  const anteriores = s.atrasadas_anteriores.length;
  if (!i.atrasadas) hechos.push('No hay tareas vencidas sin entregar.');
  else {
    const origen = !anteriores ? ''
      : anteriores < i.atrasadas ? `; ${anteriores} de ellas ${anteriores === 1 ? 'viene' : 'vienen'} de semanas anteriores`
        : i.atrasadas === 1 ? '; viene de una semana anterior' : '; todas vienen de semanas anteriores';
    hechos.push(`Hay ${i.atrasadas === 1 ? '1 tarea vencida' : `${i.atrasadas} tareas vencidas`} sin entregar${origen}.`);
  }

  const otras = s.otras_entregas.length;
  if (otras) {
    const sinFecha = s.otras_entregas.some((t) => !t.fecha_al_corte);
    const uno = otras === 1;
    hechos.push(`Además se ${uno ? 'entregó' : 'entregaron'} ${tareas(otras)} que ${uno ? 'vencía' : 'vencían'} en otra semana${sinFecha ? ` o no ${uno ? 'tenía' : 'tenían'} fecha` : ''}.`);
  }
  if (i.postergadas) hechos.push(`${tareas(i.postergadas)} se ${i.postergadas === 1 ? 'postergó' : 'postergaron'} esta semana.`);
  hechos.push(i.proxima_semana
    ? `La próxima semana (${rangoCorto(s.proxima)}) ${i.proxima_semana === 1 ? 'vence' : 'vencen'} ${tareas(i.proxima_semana)}.`
    : `La próxima semana (${rangoCorto(s.proxima)}) no vence ninguna tarea.`);
  hechos.push(`Avance general del proyecto: ${avance.porcentaje}% (${avance.listas} de ${avance.total} tareas terminadas); al empezar la semana era ${avance.porcentaje_inicio}%.`);
  if (periodo.parcial) hechos.push(`La semana todavía está en curso: los datos llegan hasta el ${fechaCorta(periodo.hasta)}.`);
  return hechos;
}

type Anterior = Pick<ContenidoReporte, 'resumen_ejecutivo' | 'destacados' | 'mensaje_correo'>;

export async function generarContenido(
  datos: DatosReporte,
  deps: DepsGenerador,
  { indicaciones = '', anterior }: { indicaciones?: string; anterior?: Anterior } = {},
): Promise<ContenidoReporte> {
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  // Codex is one subscription shared with the minutas: when it is busy, wait and try again.
  const llamar = async (tipo: TipoTrabajo, entrada: unknown, extra?: string): Promise<any> => {
    for (let intento = 1; ; intento++) {
      try {
        return await deps.runner.trabajo(tipo, entrada, extra);
      } catch (e) {
        if (!(e instanceof ErrorRunnerOcupado) || intento >= INTENTOS_OCUPADO) throw e;
        await esperar(ESPERA_OCUPADO_MS);
      }
    }
  };

  const periodo = datos.periodo;
  const semana = analizarSemana(datos.tareas, periodo);
  const cambios = new Map(semana.cambios_fecha.map((c) => [c.id, c]));
  const textoCambio = (c: CambioDeFecha) => `Fecha cambiada ${c.antes ? `del ${fechaCorta(c.antes)} ` : ''}al ${c.ahora ? fechaCorta(c.ahora) : 'sin fecha'}${c.motivo ? ` (${c.motivo})` : ''}`;

  // Summaries of the comments of the week, one line per task (cached by exact input).
  const conComentarios = new Map<string, TareaAlCorte>();
  for (const t of [...semana.entregas, ...semana.atrasadas_anteriores, ...semana.otras_entregas, ...semana.proxima_semana, ...semana.otras_abiertas]) {
    if (t.comentarios > 0) conComentarios.set(t.id, t);
  }
  const avances = new Map<string, Avance>();
  const pendientes: { id: string; entrada: object; hash: string; tamano: number }[] = [];
  for (const t of conComentarios.values()) {
    const cambio = cambios.get(t.id);
    const entrada = { id: t.id, titulo: t.titulo, estado: resultado(t), hechos: cambio ? [textoCambio(cambio)] : [], comentarios: datos.comentarios.get(t.id) ?? [] };
    const hash = sha(JSON.stringify(entrada));
    const guardado = await deps.cache.avance(hash);
    if (guardado) avances.set(t.id, guardado);
    else pendientes.push({ id: t.id, entrada, hash, tamano: JSON.stringify(entrada).length });
  }
  for (const lote of lotesPorTamano(pendientes, PRESUPUESTO_AVANCES)) {
    const r = await llamar('reporte-avances', { proyecto: datos.proyecto.nombre, periodo, tareas: lote.map((l) => l.entrada) });
    for (const x of (r?.tareas ?? []) as ({ id: string } & Avance)[]) {
      const l = lote.find((p) => p.id === x.id);
      if (!l || !x.avance?.trim()) continue;
      const avance = { avance: x.avance.trim(), decision: (x.decision ?? '').trim(), bloqueo: (x.bloqueo ?? '').trim() };
      avances.set(l.id, avance);
      await deps.cache.guardarAvance(l.hash, avance);
    }
  }

  const fila = (t: TareaAlCorte): Fila => ({ id: t.id, titulo: t.titulo, responsable: t.responsable, vence: t.fecha_al_corte, resultado: resultado(t) });
  const conAvance = (f: Fila) => ({ ...f, ...(avances.get(f.id) ?? {}) });
  const actual = avanceAl(datos.todas, periodo.hasta);
  const avance = { ...actual, porcentaje_inicio: avanceAl(datos.todas, diaAntes(periodo.desde)).porcentaje };
  const luz = semaforo(semana.indicadores, datos.proyecto, limiteDelPeriodo(periodo));
  const tablas = {
    entregas: semana.entregas.map(fila),
    atrasadas_anteriores: semana.atrasadas_anteriores.map(fila),
    otras_entregas: semana.otras_entregas.map(fila),
    proxima_semana: semana.proxima_semana.map(fila),
    otras_abiertas: semana.otras_abiertas.map(fila),
  };
  // The rest of the open work only goes to Codex when the team commented on it this week.
  const otrasComentadas = tablas.otras_abiertas.filter((f) => avances.has(f.id)).map(conAvance);

  const r = await llamar('reporte-resumen', {
    proyecto: { nombre: datos.proyecto.nombre, marca: datos.proyecto.marca, lider: datos.proyecto.lider },
    periodo,
    semaforo: { color: luz.color, frase: luz.frase },
    hechos_clave: hechosClave(semana, avance, periodo),
    entregas: tablas.entregas.map(conAvance),
    atrasadas_anteriores: tablas.atrasadas_anteriores.map(conAvance),
    otras_entregas: tablas.otras_entregas.map(conAvance),
    cambios_fecha: semana.cambios_fecha,
    proxima_semana: tablas.proxima_semana.map(conAvance),
    otras_abiertas: otrasComentadas,
    ...(anterior ? { borrador_anterior: { resumen_ejecutivo: anterior.resumen_ejecutivo, ...anterior.destacados, mensaje_correo: anterior.mensaje_correo } } : {}),
  }, indicaciones);
  if (typeof r?.resumen_ejecutivo !== 'string' || !r.resumen_ejecutivo.trim()) throw new ErrorReporte(502, 'La IA no devolvió el resumen del reporte.');
  const validos = new Set([
    ...[tablas.entregas, tablas.atrasadas_anteriores, tablas.otras_entregas, tablas.proxima_semana, otrasComentadas].flat().map((f) => f.id),
    ...semana.cambios_fecha.map((c) => c.id),
  ]);
  const lista = (v: unknown) => filtrarCitas(Array.isArray(v) ? (v as Destacado[]) : [], validos).slice(0, MAX_DESTACADOS);

  return {
    version: 3,
    proyecto: datos.proyecto,
    periodo: { desde: periodo.desde, hasta: periodo.hasta, parcial: !!periodo.parcial },
    semana: semana.semana,
    proxima: semana.proxima,
    semaforo: luz,
    indicadores: semana.indicadores,
    avance,
    resumen_ejecutivo: r.resumen_ejecutivo.trim(),
    destacados: { logros: lista(r.logros), decisiones: lista(r.decisiones), riesgos: lista(r.riesgos) },
    ...tablas,
    cambios_fecha: semana.cambios_fecha,
    mensaje_correo: typeof r.mensaje_correo === 'string' ? r.mensaje_correo.trim() : '',
    generado_en: new Date().toISOString(),
  };
}
