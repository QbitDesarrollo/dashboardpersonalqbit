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

/** The weeks a leader can pick: this one up to today (partial) and the previous full ones, aligned to the delivery day. */
export function semanasDisponibles(config: Pick<ConfigReporte, 'dia_entrega'>, ahora: Date, cuantas = 8): { desde: string; hasta: string; parcial: boolean }[] {
  const hoy = fechaIso(new Date(ahora.getTime() - DESFASE_MS));
  const dia = new Date(`${hoy}T00:00:00Z`).getUTCDay();
  const inicio = sumarDias(hoy, -((dia - (config.dia_entrega % 7) + 7) % 7));
  const semanas = [{ desde: inicio, hasta: hoy, parcial: true }];
  for (let i = 1; i < cuantas; i++) semanas.push({ desde: sumarDias(inicio, -7 * i), hasta: sumarDias(inicio, -7 * i + 6), parcial: false });
  return semanas;
}

export interface CambioEstado { fecha: string; de: string | null; a: string | null; por: string | null }
export interface Reprogramacion { fecha: string; anterior: string | null; nueva: string | null; motivo: string; comentario: string | null; por: string | null }

export interface TareaDelPeriodo {
  id: string;
  titulo: string;
  /** Status and due date today; the report works out what they were at the cut. */
  estado: string;
  fecha_entrega: string | null;
  responsable: string | null;
  /** Ecuador date the task was created. */
  creada: string;
  /** Every status change and every due-date change, oldest first (Ecuador dates). */
  cambios: CambioEstado[];
  reprogramaciones: Reprogramacion[];
  /** Comments written during the period. */
  comentarios: number;
}

export interface TareaAlCorte extends TareaDelPeriodo {
  estado_al_corte: string;
  fecha_al_corte: string | null;
  dias_atraso: number | null;
}

const CERRADA = new Set(['entregado', 'aprobado']);
const entre = (fecha: string, p: { desde: string; hasta: string }) => fecha >= p.desde && fecha <= p.hasta;

/** Status and due date as they were at the end of the period, undoing what changed afterwards. */
function alCorte(t: TareaDelPeriodo, hasta: string, corte: string): TareaAlCorte {
  const cambioDespues = t.cambios.find((c) => c.fecha > hasta);
  const reprogDespues = t.reprogramaciones.find((r) => r.fecha > hasta);
  const estado = cambioDespues ? cambioDespues.de ?? t.estado : t.estado;
  const fecha = reprogDespues ? reprogDespues.anterior : t.fecha_entrega;
  const atrasada = !CERRADA.has(estado) && !!fecha && fecha <= hasta;
  return { ...t, estado_al_corte: estado, fecha_al_corte: fecha, dias_atraso: atrasada ? diasEntre(fecha!, corte) : null };
}

/** The delivery (to delivered or approved) that happened inside the period, if any. */
const entregaEn = (t: TareaDelPeriodo, p: { desde: string; hasta: string }) =>
  [...t.cambios].reverse().find((c) => entre(c.fecha, p) && c.a && CERRADA.has(c.a) && (!c.de || !CERRADA.has(c.de)));

export interface Indicadores { entregadas: number; atrasadas: number; bloqueadas: number; fechas_movidas: number; proximas: number; abiertas: number }

/**
 * What a weekly report is about: tasks that moved during the week (delivered, changed status or dates, or got
 * comments), risks at the cut (late or blocked), what is due in the next seven days and the rest of the open work.
 */
export function analizarSemana(tareas: TareaDelPeriodo[], periodo: { desde: string; hasta: string }) {
  const corte = sumarDias(periodo.hasta, 1);
  const vigentes = tareas.filter((t) => t.creada <= periodo.hasta).map((t) => alCorte(t, periodo.hasta, corte));
  const abiertas = vigentes.filter((t) => !CERRADA.has(t.estado_al_corte));
  const seMovio = (t: TareaAlCorte) => t.comentarios > 0 || t.cambios.some((c) => entre(c.fecha, periodo)) || t.reprogramaciones.some((r) => entre(r.fecha, periodo));
  const movidas = vigentes.filter(seMovio);
  const atrasadas = abiertas.filter((t) => t.dias_atraso != null).sort((a, b) => b.dias_atraso! - a.dias_atraso!);
  const bloqueadas = abiertas.filter((t) => t.dias_atraso == null && t.estado_al_corte === 'bloqueado');
  const proximas = abiertas
    .filter((t) => t.fecha_al_corte && t.fecha_al_corte > periodo.hasta && t.fecha_al_corte <= sumarDias(periodo.hasta, 7))
    .sort((a, b) => a.fecha_al_corte!.localeCompare(b.fecha_al_corte!));
  const indicadores: Indicadores = {
    entregadas: vigentes.filter((t) => entregaEn(t, periodo)).length,
    atrasadas: atrasadas.length,
    bloqueadas: abiertas.filter((t) => t.estado_al_corte === 'bloqueado').length,
    fechas_movidas: vigentes.filter((t) => t.reprogramaciones.some((r) => entre(r.fecha, periodo))).length,
    proximas: proximas.length,
    abiertas: abiertas.length,
  };
  return {
    movidas,
    riesgos: [...atrasadas, ...bloqueadas],
    proximas,
    resto: abiertas.filter((t) => !seMovio(t)),
    entregadas_antes: vigentes.filter((t) => CERRADA.has(t.estado_al_corte) && !seMovio(t)).length,
    indicadores,
  };
}

/** Share of tasks done at a date (%), counting only the tasks that existed then. */
export function avanceAl(tareas: Pick<TareaDelPeriodo, 'creada' | 'estado' | 'cambios' | 'reprogramaciones' | 'fecha_entrega'>[], fecha: string): number {
  const existentes = tareas.filter((t) => t.creada <= fecha);
  if (!existentes.length) return 0;
  const listas = existentes.filter((t) => CERRADA.has(alCorte(t as TareaDelPeriodo, fecha, sumarDias(fecha, 1)).estado_al_corte)).length;
  return Math.round((listas / existentes.length) * 100);
}

export const ETIQUETA_ESTADO: Record<string, string> = {
  backlog: 'Pendiente', en_proceso: 'En proceso', en_revision: 'Revisión interna', revision_interna: 'Revisión interna',
  revision_cliente: 'Revisión cliente', ajustes: 'Ajustes', aprobado: 'Aprobado', entregado: 'Entregado', bloqueado: 'Bloqueado',
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const fechaCorta = (fecha: string) => { const [, m, d] = fecha.split('-').map(Number); return `${d} ${MESES[m - 1]}`; };
const etiqueta = (e: string | null) => (e ? ETIQUETA_ESTADO[e] ?? e : '?');
const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

const MOTIVO: Record<string, string> = {
  INTERNO: 'por un ajuste del equipo', CLIENTE: 'por pedido del cliente', ALCANCE: 'por cambio de alcance', FUERZA_MAYOR: 'por fuerza mayor',
};

/** What happened to a task during the period, one fixed sentence per fact (no AI involved). */
export function eventosDeTarea(t: TareaDelPeriodo, periodo: { desde: string; hasta: string }): string[] {
  const eventos: string[] = [];
  const entrega = entregaEn(t, periodo);
  const limite = alCorte(t, periodo.hasta, sumarDias(periodo.hasta, 1)).fecha_al_corte;
  if (entrega) {
    const diferencia = limite ? diasEntre(entrega.fecha, limite) : null;
    const cuando = diferencia == null ? '' : diferencia > 0 ? ` · ${dias(diferencia)} antes de lo previsto` : diferencia < 0 ? ` · ${dias(-diferencia)} tarde` : ' · a tiempo';
    eventos.push(`Entregada el ${fechaCorta(entrega.fecha)}${entrega.por ? ` por ${entrega.por}` : ''}${cuando}`);
  } else {
    const cambios = t.cambios.filter((c) => entre(c.fecha, periodo));
    if (cambios.length) {
      const ultimo = cambios[cambios.length - 1];
      const ruta = [etiqueta(cambios[0].de), ...cambios.map((c) => etiqueta(c.a))].join(' → ');
      eventos.push(`${ruta} (${fechaCorta(ultimo.fecha)}${ultimo.por ? `, ${ultimo.por}` : ''})`);
    }
  }
  for (const r of t.reprogramaciones.filter((x) => entre(x.fecha, periodo))) {
    const desdeHasta = r.anterior && r.nueva ? `del ${fechaCorta(r.anterior)} al ${fechaCorta(r.nueva)}` : r.nueva ? `al ${fechaCorta(r.nueva)}` : 'sin fecha';
    const comentario = r.comentario?.trim() ? ` · “${r.comentario.trim().slice(0, 80)}”` : '';
    eventos.push(`Fecha movida ${desdeHasta}${MOTIVO[r.motivo] ? ` · ${MOTIVO[r.motivo]}` : ''}${comentario}`);
  }
  return eventos;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const lista = (partes: string[]) => (partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : partes[0]);

/** The traffic light of the week: red with late deliveries, yellow with blocks or several moved dates, green otherwise. */
export function semaforo(i: Indicadores): { color: 'verde' | 'amarillo' | 'rojo'; frase: string } {
  const partes = [
    i.atrasadas && plural(i.atrasadas, 'entrega atrasada', 'entregas atrasadas'),
    i.bloqueadas && plural(i.bloqueadas, 'tarea bloqueada', 'tareas bloqueadas'),
    i.fechas_movidas && plural(i.fechas_movidas, 'fecha movida', 'fechas movidas'),
  ].filter(Boolean) as string[];
  if (i.atrasadas > 0) return { color: 'rojo', frase: `En riesgo: ${lista(partes)}.` };
  if (i.bloqueadas > 0 || i.fechas_movidas >= 2) return { color: 'amarillo', frase: `Atención: ${lista(partes)}.` };
  return { color: 'verde', frase: 'Vamos bien: sin atrasos ni bloqueos.' };
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
