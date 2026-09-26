import { createHash } from 'crypto';
import { ErrorRunnerOcupado, type RunnerIa, type TipoTrabajo } from '../minutas/ia/runner.js';
import {
  analizarSemana, avanceAl, eventosDeTarea, filtrarCitas, lotesPorTamano, semaforo, ErrorReporte, ETIQUETA_ESTADO,
  type Destacado, type Indicadores, type TareaAlCorte, type TareaDelPeriodo,
} from './dominio.js';

/**
 * Builds a weekly report (see REPORTES-PLAN.md). Tiusdei states the facts with fixed sentences: what moved in the
 * week, deliveries ahead of or behind schedule, moved dates and their reason, risks at the cut. Codex only
 * summarizes the comments of the tasks that moved (cached by input) and writes the short summary on top.
 */

export interface Comentario { fecha: string; autor: string; texto: string }

export interface DatosReporte {
  proyecto: { id: string; nombre: string; marca: string; lider: string; salud: string };
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

export interface FilaMovida { id: string; titulo: string; responsable: string | null; estado_texto: string; eventos: string[]; avance: string | null }
export interface FilaRiesgo { id: string; titulo: string; responsable: string | null; estado_texto: string; fecha_entrega: string | null; dias_atraso: number | null }
export interface FilaCorta { id: string; titulo: string; responsable: string | null; estado_texto: string; fecha_entrega: string | null }

export interface ContenidoReporte {
  version: 2;
  proyecto: DatosReporte['proyecto'];
  periodo: { desde: string; hasta: string; parcial: boolean };
  semaforo: { color: 'verde' | 'amarillo' | 'rojo'; frase: string };
  indicadores: Indicadores & { avance: number; avance_semana: number };
  resumen_ejecutivo: string;
  destacados: { logros: Destacado[]; decisiones: Destacado[]; riesgos: Destacado[] };
  movidas: FilaMovida[];
  riesgos: FilaRiesgo[];
  proximas: FilaCorta[];
  resto: FilaCorta[];
  entregadas_antes: number;
  mensaje_correo: string;
  generado_en: string;
}

const PRESUPUESTO_AVANCES = 16_000;
const INTENTOS_OCUPADO = 20;
const ESPERA_OCUPADO_MS = 30_000;
const MAX_DESTACADOS = 3;

const sha = (texto: string) => createHash('sha256').update(texto).digest('hex');
const diaAntes = (fecha: string) => new Date(Date.parse(`${fecha}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const estadoTexto = (e: string) => ETIQUETA_ESTADO[e] ?? e;
/** The rest of the project, most urgent first: blocked and in progress before what has not started. */
const ORDEN_RESTO = ['bloqueado', 'ajustes', 'en_proceso', 'revision_interna', 'en_revision', 'revision_cliente', 'backlog'];
const ordenResto = (e: string) => { const i = ORDEN_RESTO.indexOf(e); return i < 0 ? ORDEN_RESTO.length : i; };

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
  const eventos = new Map(semana.movidas.map((t) => [t.id, eventosDeTarea(t, periodo)]));
  // Deliveries first: they are what a reader looks for.
  const movidas = [...semana.movidas].sort((a, b) => Number(!eventos.get(a.id)![0]?.startsWith('Entregada')) - Number(!eventos.get(b.id)![0]?.startsWith('Entregada')));

  // Summaries of the comments of the week, one line per task (cached by exact input).
  const avances = new Map<string, Avance>();
  const pendientes: { id: string; entrada: object; hash: string; tamano: number }[] = [];
  for (const t of movidas.filter((m) => m.comentarios > 0)) {
    const entrada = { id: t.id, titulo: t.titulo, estado: estadoTexto(t.estado_al_corte), hechos: eventos.get(t.id), comentarios: datos.comentarios.get(t.id) ?? [] };
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

  const fila = (t: TareaAlCorte): FilaMovida => {
    const n = t.comentarios;
    const resumen = avances.get(t.id)?.avance ?? (n ? `Tuvo ${n} ${n === 1 ? 'comentario' : 'comentarios'} del equipo; revísalo en Tiusdei.` : null);
    return { id: t.id, titulo: t.titulo, responsable: t.responsable, estado_texto: estadoTexto(t.estado_al_corte), eventos: eventos.get(t.id)!, avance: resumen };
  };
  const corta = (t: TareaAlCorte): FilaCorta => ({ id: t.id, titulo: t.titulo, responsable: t.responsable, estado_texto: estadoTexto(t.estado_al_corte), fecha_entrega: t.fecha_al_corte });
  const filasMovidas = movidas.map(fila);
  const riesgos: FilaRiesgo[] = semana.riesgos.map((t) => ({ ...corta(t), dias_atraso: t.dias_atraso }));
  const avance = avanceAl(datos.todas, periodo.hasta);
  const indicadores = { ...semana.indicadores, avance, avance_semana: avance - avanceAl(datos.todas, diaAntes(periodo.desde)) };
  const luz = semaforo(semana.indicadores);

  const r = await llamar('reporte-resumen', {
    proyecto: datos.proyecto,
    periodo,
    semaforo: luz,
    indicadores,
    movidas: filasMovidas.map((m) => ({ ...m, decision: avances.get(m.id)?.decision ?? '', bloqueo: avances.get(m.id)?.bloqueo ?? '' })),
    riesgos,
    proximas: semana.proximas.map(corta),
    sin_movimiento: semana.resto.length,
    ...(anterior ? { borrador_anterior: { resumen_ejecutivo: anterior.resumen_ejecutivo, ...anterior.destacados, mensaje_correo: anterior.mensaje_correo } } : {}),
  }, indicaciones);
  if (typeof r?.resumen_ejecutivo !== 'string' || !r.resumen_ejecutivo.trim()) throw new ErrorReporte(502, 'La IA no devolvió el resumen del reporte.');
  const validos = new Set([...semana.movidas, ...semana.riesgos, ...semana.proximas].map((t) => t.id));
  const lista = (v: unknown) => filtrarCitas(Array.isArray(v) ? (v as Destacado[]) : [], validos).slice(0, MAX_DESTACADOS);

  return {
    version: 2,
    proyecto: datos.proyecto,
    periodo: { desde: periodo.desde, hasta: periodo.hasta, parcial: !!periodo.parcial },
    semaforo: luz,
    indicadores,
    resumen_ejecutivo: r.resumen_ejecutivo.trim(),
    destacados: { logros: lista(r.logros), decisiones: lista(r.decisiones), riesgos: lista(r.riesgos) },
    movidas: filasMovidas,
    riesgos,
    proximas: semana.proximas.map(corta),
    resto: [...semana.resto].sort((a, b) => ordenResto(a.estado_al_corte) - ordenResto(b.estado_al_corte)).map(corta),
    entregadas_antes: semana.entregadas_antes,
    mensaje_correo: typeof r.mensaje_correo === 'string' ? r.mensaje_correo.trim() : '',
    generado_en: new Date().toISOString(),
  };
}
