/**
 * Pure rules of the weekly project reports (see REPORTES-PLAN.md): when a report is due,
 * which tasks go in and where, how inputs are batched for Codex and the fixed wording
 * used when there is nothing to summarize. No database, no network.
 */

export type EstadoReporte = 'programado' | 'generando' | 'borrador' | 'aprobado' | 'fallido';

/** Errors that can be shown as-is, with the HTTP status to answer. */
export class ErrorReporte extends Error {
  constructor(readonly status: number, mensaje: string) { super(mensaje); }
}

export interface ConfigReporte {
  activo: boolean;
  /** 1 = Monday … 7 = Sunday. */
  dia_entrega: number;
  /** HH:MM in Ecuador time. */
  hora_entrega: string;
  anticipacion_horas: number;
}

export interface Entrega { entregarEn: Date; desde: string; hasta: string }

// Ecuador is UTC-5 all year (no daylight saving).
const DESFASE_MS = 5 * 3600_000;
const DIA_MS = 86_400_000;

const fechaIso = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (fecha: string, dias: number) => fechaIso(new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS));
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);

/** The delivery slot of this week (possibly already past) and the one before it. */
function entregasCercanas(config: ConfigReporte, ahora: Date): Date[] {
  const [hh, mm] = config.hora_entrega.split(':').map(Number);
  const local = new Date(ahora.getTime() - DESFASE_MS);
  const faltan = ((config.dia_entrega % 7) - local.getUTCDay() + 7) % 7;
  const fecha = sumarDias(fechaIso(local), faltan);
  const esta = new Date(Date.parse(`${fecha}T00:00:00Z`) + ((hh || 0) * 60 + (mm || 0)) * 60_000 + DESFASE_MS);
  return [new Date(esta.getTime() - 7 * DIA_MS), esta];
}

/** A report delivered at `entregarEn` covers the seven days before the delivery day (Ecuador dates). */
function entregaDe(entregarEn: Date): Entrega {
  const dia = fechaIso(new Date(entregarEn.getTime() - DESFASE_MS));
  const hasta = sumarDias(dia, -1);
  return { entregarEn, desde: sumarDias(hasta, -6), hasta };
}

/**
 * Deliveries whose preparation window is open now: generation starts `anticipacion_horas` before the
 * delivery time. A delivery missed while the server was down is still made the same day, not later.
 */
export function entregasAbiertas(config: ConfigReporte, ahora: Date): Entrega[] {
  if (!config.activo) return [];
  return entregasCercanas(config, ahora)
    .filter((s) => s.getTime() - config.anticipacion_horas * 3600_000 <= ahora.getTime() && ahora.getTime() - s.getTime() < DIA_MS)
    .map(entregaDe);
}

/** The most recent delivery that already happened: what "generate now" reports on. */
export function periodoAnterior(config: ConfigReporte, ahora: Date): Entrega {
  const [anterior, esta] = entregasCercanas(config, ahora);
  return entregaDe(esta.getTime() <= ahora.getTime() ? esta : anterior);
}

export interface TareaDelPeriodo {
  id: string;
  titulo: string;
  estado: string;
  fecha_entrega: string | null;
  responsable: string | null;
  /** Ecuador date the task was created. */
  creada: string;
  /** Ecuador date it was delivered or approved, if it is. */
  cerrada: string | null;
  /** Description as plain text. */
  detalle: string;
  /** Subtasks done over total, e.g. "3/5". */
  subtareas: string | null;
}

export type TareaClasificada = TareaDelPeriodo & { dias_atraso: number | null };
export type Grupo = 'completadas' | 'atrasadas' | 'bloqueadas' | 'en_curso' | 'pendientes';
export const GRUPOS: Grupo[] = ['completadas', 'atrasadas', 'bloqueadas', 'en_curso', 'pendientes'];

const CERRADA = new Set(['entregado', 'aprobado']);

/**
 * Which tasks the report covers and in which single group each one goes: the ones delivered during the
 * period, and every task still open at its end. "Late" counts days up to the cut, the day after the period.
 */
export function clasificarTareas(tareas: TareaDelPeriodo[], periodo: { desde: string; hasta: string }) {
  const grupos: Record<Grupo, TareaClasificada[]> = { completadas: [], atrasadas: [], bloqueadas: [], en_curso: [], pendientes: [] };
  const proximo: TareaClasificada[] = [];
  const corte = sumarDias(periodo.hasta, 1);
  for (const t of tareas) {
    if (t.creada > periodo.hasta) continue;
    if (CERRADA.has(t.estado)) {
      if (t.cerrada && t.cerrada >= periodo.desde && t.cerrada <= periodo.hasta) grupos.completadas.push({ ...t, dias_atraso: null });
      continue;
    }
    const atrasada = !!t.fecha_entrega && t.fecha_entrega <= periodo.hasta;
    const fila = { ...t, dias_atraso: atrasada ? diasEntre(t.fecha_entrega!, corte) : null };
    if (atrasada) grupos.atrasadas.push(fila);
    else if (t.estado === 'bloqueado') grupos.bloqueadas.push(fila);
    else if (t.estado === 'backlog') grupos.pendientes.push(fila);
    else grupos.en_curso.push(fila);
    if (t.fecha_entrega && t.fecha_entrega > periodo.hasta && t.fecha_entrega <= sumarDias(periodo.hasta, 7)) proximo.push(fila);
  }
  const indicadores = Object.fromEntries(GRUPOS.map((g) => [g, grupos[g].length])) as Record<Grupo, number>;
  return { grupos, proximo, indicadores };
}

/** Greedy batches under a size budget; an item bigger than the budget goes alone. */
export function lotesPorTamano<T extends { tamano: number }>(items: T[], presupuesto: number): T[][] {
  const lotes: T[][] = [];
  let actual: T[] = [];
  let usado = 0;
  for (const item of items) {
    if (actual.length && usado + item.tamano > presupuesto) { lotes.push(actual); actual = []; usado = 0; }
    actual.push(item);
    usado += item.tamano;
  }
  if (actual.length) lotes.push(actual);
  return lotes;
}

export const ETIQUETA_ESTADO: Record<string, string> = {
  backlog: 'Pendiente', en_proceso: 'En proceso', en_revision: 'Revisión interna', revision_interna: 'Revisión interna',
  revision_cliente: 'Revisión cliente', ajustes: 'Ajustes', aprobado: 'Aprobado', entregado: 'Entregado', bloqueado: 'Bloqueado',
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const fechaCorta = (fecha: string) => { const [, m, d] = fecha.split('-').map(Number); return `${d} ${MESES[m - 1]}`; };

/** Fixed wording for a task with no comments in the period: only what Tiusdei knows, nothing invented. */
export function lineaSinComentarios(t: TareaDelPeriodo, deQueTrata: string | null): string {
  const trata = deQueTrata?.trim().replace(/\.+$/, '');
  return [
    trata ? `Consiste en ${trata}.` : 'No tiene descripción.',
    `Está en ${ETIQUETA_ESTADO[t.estado] ?? t.estado}, ${t.responsable ? `a cargo de ${t.responsable}` : 'sin responsable'}, ${t.fecha_entrega ? `con entrega el ${fechaCorta(t.fecha_entrega)}` : 'sin fecha de entrega'}.`,
    'No hay comentarios del equipo en este periodo.',
  ].join(' ');
}

const ENTIDADES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/** Rich text as plain text for Codex: no tags, images as [imagen], no base64 payloads. */
export function textoPlano(html: string | null | undefined): string {
  return (html ?? '')
    .replace(/<img\b[^>]*>/gi, ' [imagen] ')
    .replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, ' [imagen] ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (e) => ENTIDADES[e] ?? e)
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Destacado { texto: string; task_ids: string[] }

/** Keeps only citations of tasks that are in the report; a highlight with no valid task is dropped. */
export function filtrarCitas(items: Destacado[], validos: Set<string>): Destacado[] {
  return items
    .map((d) => ({ texto: d.texto, task_ids: d.task_ids.filter((id) => validos.has(id)) }))
    .filter((d) => d.task_ids.length > 0 && d.texto.trim());
}

const PERMITIDO: Record<'regenerar' | 'aprobar' | 'enviar', { estados: EstadoReporte[]; mensaje: string }> = {
  regenerar: { estados: ['borrador', 'fallido'], mensaje: 'Solo se regenera un borrador.' },
  aprobar: { estados: ['borrador'], mensaje: 'Solo se aprueba un borrador listo.' },
  enviar: { estados: ['aprobado'], mensaje: 'Primero aprueba el reporte.' },
};

export function puede(accion: keyof typeof PERMITIDO, estado: EstadoReporte): void {
  const regla = PERMITIDO[accion];
  if (!regla.estados.includes(estado)) throw new ErrorReporte(409, regla.mensaje);
}
