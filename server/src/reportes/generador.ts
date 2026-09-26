import { createHash } from 'crypto';
import { ErrorRunnerOcupado, type RunnerIa, type TipoTrabajo } from '../minutas/ia/runner.js';
import {
  clasificarTareas, lotesPorTamano, lineaSinComentarios, filtrarCitas, ErrorReporte, ETIQUETA_ESTADO, GRUPOS,
  type Destacado, type Grupo, type TareaDelPeriodo, type TareaClasificada,
} from './dominio.js';

/**
 * Builds a report in layers (see REPORTES-PLAN.md):
 * 0. Tiusdei: groups, numbers and the fixed line of tasks without comments.
 * A. "What the task is about" once per description, cached by its hash.
 * B. Progress of each task with comments in the period, batched by size and cached by its input.
 * C. The final write-up from the numbers and the lines of A and B.
 */

export interface Comentario { fecha: string; autor: string; texto: string }
export interface CambioEstado { fecha: string; de: string | null; a: string | null; por: string | null }

export interface DatosReporte {
  proyecto: { id: string; nombre: string; marca: string; lider: string; salud: string };
  periodo: { desde: string; hasta: string };
  avanceProyecto: { total: number; listas: number };
  tareas: TareaDelPeriodo[];
  comentarios: Map<string, Comentario[]>;
  cambios: Map<string, CambioEstado[]>;
}

export interface Avance { avance: string; decision: string; bloqueo: string }

export interface DepsGenerador {
  runner: Pick<RunnerIa, 'trabajo'>;
  cache: {
    resumenes(ids: string[]): Promise<Map<string, { hash: string; resumen: string }>>;
    guardarResumen(id: string, hash: string, resumen: string): Promise<void>;
    avance(hash: string): Promise<Avance | null>;
    guardarAvance(hash: string, avance: Avance): Promise<void>;
  };
  esperar?: (ms: number) => Promise<void>;
}

export interface TareaReporte {
  id: string; titulo: string; responsable: string | null; estado: string; estado_texto: string;
  fecha_entrega: string | null; dias_atraso: number | null; subtareas: string | null;
  comentarios: number; linea: string; fuente: 'ia' | 'plantilla';
}

export interface ContenidoReporte {
  version: 1;
  proyecto: DatosReporte['proyecto'];
  periodo: DatosReporte['periodo'];
  indicadores: Record<Grupo, number> & { avance: number; total_proyecto: number; listas_proyecto: number };
  resumen_ejecutivo: string;
  destacados: { logros: Destacado[]; decisiones: Destacado[]; riesgos: Destacado[] };
  grupos: { clave: Grupo; titulo: string; tareas: TareaReporte[] }[];
  proximo_periodo: { id: string; titulo: string; responsable: string | null; fecha_entrega: string | null }[];
  sin_actualizacion: { id: string; titulo: string; responsable: string | null }[];
  mensaje_correo: string;
  generado_en: string;
}

export const TITULO_GRUPO: Record<Grupo, string> = {
  completadas: 'Completadas en el periodo', atrasadas: 'Atrasadas', bloqueadas: 'Bloqueadas', en_curso: 'En curso', pendientes: 'Pendientes',
};

const PRESUPUESTO_DESCRIPCIONES = 12_000;
const PRESUPUESTO_AVANCES = 16_000;
const INTENTOS_OCUPADO = 20;
const ESPERA_OCUPADO_MS = 30_000;

const sha = (texto: string) => createHash('sha256').update(texto).digest('hex');
const conPunto = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

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

  // Layer 0
  const { grupos, proximo, indicadores } = clasificarTareas(datos.tareas, datos.periodo);
  const incluidas = GRUPOS.flatMap((g) => grupos[g]);
  const comentariosDe = (id: string) => datos.comentarios.get(id) ?? [];

  // Layer A
  const deQueTrata = new Map<string, string>();
  const conDetalle = incluidas.filter((t) => t.detalle.trim());
  const guardados = await deps.cache.resumenes(conDetalle.map((t) => t.id));
  const faltan = conDetalle.filter((t) => guardados.get(t.id)?.hash !== sha(t.detalle));
  for (const t of conDetalle) if (!faltan.includes(t)) deQueTrata.set(t.id, guardados.get(t.id)!.resumen);
  const itemsA = faltan.map((t) => ({ id: t.id, titulo: t.titulo, descripcion: t.detalle }));
  for (const lote of lotesPorTamano(itemsA.map((i) => ({ ...i, tamano: JSON.stringify(i).length })), PRESUPUESTO_DESCRIPCIONES)) {
    const r = await llamar('reporte-descripciones', { tareas: lote.map(({ tamano: _t, ...i }) => i) });
    for (const x of (r?.tareas ?? []) as { id: string; de_que_trata: string }[]) {
      const t = faltan.find((f) => f.id === x.id);
      if (!t || !x.de_que_trata?.trim()) continue;
      deQueTrata.set(t.id, x.de_que_trata.trim());
      await deps.cache.guardarResumen(t.id, sha(t.detalle), x.de_que_trata.trim().slice(0, 600));
    }
  }
  // Codex skipped a description: fall back to its first words rather than saying there is none.
  for (const t of conDetalle) if (!deQueTrata.has(t.id)) deQueTrata.set(t.id, t.detalle.length > 160 ? `${t.detalle.slice(0, 160).trim()}…` : t.detalle);

  // Layer B
  const avances = new Map<string, Avance>();
  const conComentarios = incluidas.filter((t) => comentariosDe(t.id).length > 0);
  const entradasB = conComentarios.map((t) => ({
    id: t.id, titulo: t.titulo, de_que_trata: deQueTrata.get(t.id) ?? null, estado: ETIQUETA_ESTADO[t.estado] ?? t.estado,
    cambios_de_estado: datos.cambios.get(t.id) ?? [], comentarios: comentariosDe(t.id),
  }));
  const pendientesB: (typeof entradasB[number] & { tamano: number; hash: string })[] = [];
  for (const e of entradasB) {
    const hash = sha(JSON.stringify(e));
    const guardado = await deps.cache.avance(hash);
    if (guardado) avances.set(e.id, guardado);
    else pendientesB.push({ ...e, tamano: JSON.stringify(e).length, hash });
  }
  for (const lote of lotesPorTamano(pendientesB, PRESUPUESTO_AVANCES)) {
    const r = await llamar('reporte-avances', {
      proyecto: datos.proyecto.nombre, periodo: datos.periodo, tareas: lote.map(({ tamano: _t, hash: _h, ...e }) => e),
    });
    for (const x of (r?.tareas ?? []) as ({ id: string } & Avance)[]) {
      const e = lote.find((l) => l.id === x.id);
      if (!e || !x.avance?.trim()) continue;
      const avance = { avance: x.avance.trim(), decision: (x.decision ?? '').trim(), bloqueo: (x.bloqueo ?? '').trim() };
      avances.set(e.id, avance);
      await deps.cache.guardarAvance(e.hash, avance);
    }
  }

  const linea = (t: TareaClasificada): Pick<TareaReporte, 'linea' | 'fuente'> => {
    const n = comentariosDe(t.id).length;
    if (!n) return { linea: lineaSinComentarios(t, deQueTrata.get(t.id) ?? null), fuente: 'plantilla' };
    const a = avances.get(t.id);
    if (!a) return { linea: `Tuvo ${n} ${n === 1 ? 'comentario' : 'comentarios'} del equipo en el periodo; no se pudo resumir automáticamente, revísalo en Tiusdei.`, fuente: 'plantilla' };
    return {
      linea: [conPunto(a.avance), a.decision && `Decisión: ${conPunto(a.decision)}`, a.bloqueo && `Bloqueo: ${conPunto(a.bloqueo)}`].filter(Boolean).join(' '),
      fuente: 'ia',
    };
  };

  const filas = (lista: TareaClasificada[]): TareaReporte[] => lista.map((t) => ({
    id: t.id, titulo: t.titulo, responsable: t.responsable, estado: t.estado, estado_texto: ETIQUETA_ESTADO[t.estado] ?? t.estado,
    fecha_entrega: t.fecha_entrega, dias_atraso: t.dias_atraso, subtareas: t.subtareas, comentarios: comentariosDe(t.id).length, ...linea(t),
  }));
  const gruposReporte = GRUPOS.map((g) => ({ clave: g, titulo: TITULO_GRUPO[g], tareas: filas(grupos[g]) }));
  const { total, listas } = datos.avanceProyecto;
  const indicadoresReporte = { ...indicadores, avance: total ? Math.round((listas / total) * 100) : 0, total_proyecto: total, listas_proyecto: listas };

  // Layer C
  const r = await llamar('reporte-resumen', {
    proyecto: datos.proyecto, periodo: datos.periodo, indicadores: indicadoresReporte,
    tareas: gruposReporte.flatMap((g) => g.tareas.map((t) => ({
      id: t.id, titulo: t.titulo, grupo: g.titulo, estado: t.estado_texto, responsable: t.responsable,
      fecha_entrega: t.fecha_entrega, dias_atraso: t.dias_atraso, linea: t.linea,
    }))),
    ...(anterior ? { borrador_anterior: { resumen_ejecutivo: anterior.resumen_ejecutivo, ...anterior.destacados, mensaje_correo: anterior.mensaje_correo } } : {}),
  }, indicaciones);
  if (typeof r?.resumen_ejecutivo !== 'string' || !r.resumen_ejecutivo.trim()) throw new ErrorReporte(502, 'La IA no devolvió el resumen del reporte.');
  const validos = new Set(incluidas.map((t) => t.id));
  const lista = (v: unknown) => filtrarCitas(Array.isArray(v) ? (v as Destacado[]) : [], validos).slice(0, 5);

  return {
    version: 1,
    proyecto: datos.proyecto,
    periodo: datos.periodo,
    indicadores: indicadoresReporte,
    resumen_ejecutivo: r.resumen_ejecutivo.trim(),
    destacados: { logros: lista(r.logros), decisiones: lista(r.decisiones), riesgos: lista(r.riesgos) },
    grupos: gruposReporte,
    proximo_periodo: proximo.map((t) => ({ id: t.id, titulo: t.titulo, responsable: t.responsable, fecha_entrega: t.fecha_entrega })),
    sin_actualizacion: incluidas
      .filter((t) => !grupos.completadas.includes(t) && comentariosDe(t.id).length === 0)
      .map((t) => ({ id: t.id, titulo: t.titulo, responsable: t.responsable })),
    mensaje_correo: typeof r.mensaje_correo === 'string' ? r.mensaje_correo.trim() : '',
    generado_en: new Date().toISOString(),
  };
}
