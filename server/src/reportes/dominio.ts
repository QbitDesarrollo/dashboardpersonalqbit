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
  /** Last delivery up to the cut; null when the task was closed without a recorded status change. */
  entrega: CambioEstado | null;
  dias_atraso: number | null;
}

export interface Periodo { desde: string; hasta: string; parcial?: boolean }

const CERRADA = new Set(['entregado', 'aprobado']);
/** Waiting on the client: Tiusdei does not count it as overdue. */
const ESPERA_CLIENTE = 'revision_cliente';
const entre = (fecha: string, p: { desde: string; hasta: string }) => fecha >= p.desde && fecha <= p.hasta;
const esEntrega = (c: CambioEstado) => !!c.a && CERRADA.has(c.a) && (!c.de || !CERRADA.has(c.de));

/**
 * First day that counts as "late" for a due date, like Tiusdei's overdue rule (due date before today). For a
 * finished week that is the Monday after it; for the week in progress it is the day of the cut.
 */
export const limiteDelPeriodo = (p: Periodo) => (p.parcial ? p.hasta : sumarDias(p.hasta, 1));

/**
 * The change that closed the task for the last time: walking back from the latest change, closed-to-closed moves
 * (delivered to approved) are skipped; a reopening voids older deliveries.
 */
function ultimaEntrega(cambios: CambioEstado[]): CambioEstado | null {
  for (let i = cambios.length - 1; i >= 0; i--) {
    const c = cambios[i];
    if (!c.a || !CERRADA.has(c.a)) return null;
    if (esEntrega(c)) return c;
  }
  return null;
}

/** Status, due date and last delivery as they were at the end of the period, undoing what changed afterwards. */
function alCorte(t: TareaDelPeriodo, p: Periodo): TareaAlCorte {
  const cambioDespues = t.cambios.find((c) => c.fecha > p.hasta);
  const reprogDespues = t.reprogramaciones.find((r) => r.fecha > p.hasta);
  const estado = cambioDespues ? cambioDespues.de ?? t.estado : t.estado;
  const fecha = reprogDespues ? reprogDespues.anterior : t.fecha_entrega;
  const entrega = CERRADA.has(estado) ? ultimaEntrega(t.cambios.filter((c) => c.fecha <= p.hasta)) : null;
  const limite = limiteDelPeriodo(p);
  const atrasada = !CERRADA.has(estado) && estado !== ESPERA_CLIENTE && !!fecha && fecha < limite;
  return { ...t, estado_al_corte: estado, fecha_al_corte: fecha, entrega, dias_atraso: atrasada ? diasEntre(fecha!, limite) : null };
}

export interface Indicadores {
  /** Tasks due this week and how many of them are delivered. */
  previstas: number;
  cumplidas: number;
  /** Open tasks past their due date (any week), as Tiusdei counts overdue tasks. */
  atrasadas: number;
  postergadas: number;
  proxima_semana: number;
  bloqueadas: number;
  /** Deliveries made during the week, whatever their due date. */
  entregadas_semana: number;
  abiertas: number;
  /** Open tasks due in the three days after the cut (Tiusdei's yellow). */
  por_vencer: number;
}

export interface CambioDeFecha { id: string; titulo: string; responsable: string | null; antes: string | null; ahora: string | null; motivo: string | null; postergada: boolean }

const MOTIVO: Record<string, string> = {
  INTERNO: 'ajuste del equipo', CLIENTE: 'pedido del cliente', ALCANCE: 'cambio de alcance', FUERZA_MAYOR: 'fuerza mayor',
};
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The due-date changes of a task during the week collapsed into one: from the first date to the last. */
function cambioDeFecha(t: TareaAlCorte, p: Periodo): CambioDeFecha | null {
  const rs = t.reprogramaciones.filter((r) => entre(r.fecha, p));
  if (!rs.length) return null;
  const antes = rs[0].anterior;
  const ahora = rs[rs.length - 1].nueva;
  if (antes === ahora) return null;
  const motivos = [...new Set(rs.map((r) => MOTIVO[r.motivo]).filter(Boolean))];
  const comentarios = rs.map((r) => r.comentario?.trim()).filter(Boolean).map((c) => `“${c!.slice(0, 80)}”`);
  const motivo = [motivos.length ? mayuscula(motivos.join(', ')) : '', ...comentarios].filter(Boolean).join(' · ') || null;
  const postergada = !!antes && (!ahora || ahora > antes);
  return { id: t.id, titulo: t.titulo, responsable: t.responsable, antes, ahora, motivo, postergada };
}
const diasMovida = (c: CambioDeFecha) => (c.antes && c.ahora ? diasEntre(c.antes, c.ahora) : Infinity);

const porFecha = (a: TareaAlCorte, b: TareaAlCorte) =>
  (a.fecha_al_corte ?? '9999').localeCompare(b.fecha_al_corte ?? '9999') || a.titulo.localeCompare(b.titulo);

/**
 * What a weekly report is about, measured by due date over the calendar week (Monday to Sunday): the tasks due
 * this week and how they ended, the late ones from earlier weeks, other deliveries made this week, the date
 * changes, what is due next week and the rest of the open work.
 */
export function analizarSemana(tareas: TareaDelPeriodo[], periodo: Periodo) {
  const semana = { desde: periodo.desde, hasta: sumarDias(periodo.desde, 6) };
  const proxima = { desde: sumarDias(semana.hasta, 1), hasta: sumarDias(semana.hasta, 7) };
  const limite = limiteDelPeriodo(periodo);
  const vigentes = tareas.filter((t) => t.creada <= periodo.hasta).map((t) => alCorte(t, periodo));
  const cerrada = (t: TareaAlCorte) => CERRADA.has(t.estado_al_corte);
  const abiertas = vigentes.filter((t) => !cerrada(t));
  const fecha = (t: TareaAlCorte) => t.fecha_al_corte;

  const entregas = vigentes.filter((t) => fecha(t) && entre(fecha(t)!, semana)).sort(porFecha);
  const atrasadasAnteriores = abiertas.filter((t) => t.dias_atraso != null && fecha(t)! < semana.desde).sort(porFecha);
  const otrasEntregas = vigentes
    .filter((t) => t.entrega && entre(t.entrega.fecha, periodo) && !(fecha(t) && entre(fecha(t)!, semana)))
    .sort((a, b) => a.entrega!.fecha.localeCompare(b.entrega!.fecha));
  const proximaSemana = abiertas.filter((t) => fecha(t) && entre(fecha(t)!, proxima)).sort(porFecha);
  const listadas = new Set([...entregas, ...atrasadasAnteriores, ...proximaSemana].map((t) => t.id));
  const otrasAbiertas = abiertas.filter((t) => !listadas.has(t.id)).sort(porFecha);
  const cambiosFecha = vigentes
    .map((t) => cambioDeFecha(t, periodo))
    .filter((c): c is CambioDeFecha => !!c)
    .sort((a, b) => Number(b.postergada) - Number(a.postergada)
      || (a.postergada ? diasMovida(b) - diasMovida(a) : (a.ahora ?? '9999').localeCompare(b.ahora ?? '9999')));

  const indicadores: Indicadores = {
    previstas: entregas.length,
    cumplidas: entregas.filter(cerrada).length,
    atrasadas: abiertas.filter((t) => t.dias_atraso != null).length,
    postergadas: cambiosFecha.filter((c) => c.postergada).length,
    proxima_semana: proximaSemana.length,
    bloqueadas: abiertas.filter((t) => t.estado_al_corte === 'bloqueado').length,
    entregadas_semana: vigentes.filter((t) => t.entrega && entre(t.entrega.fecha, periodo)).length,
    abiertas: abiertas.length,
    por_vencer: abiertas.filter((t) => fecha(t) && fecha(t)! >= limite && fecha(t)! <= sumarDias(limite, 3)).length,
  };
  return {
    semana, proxima, entregas, atrasadas_anteriores: atrasadasAnteriores, otras_entregas: otrasEntregas,
    cambios_fecha: cambiosFecha, proxima_semana: proximaSemana, otras_abiertas: otrasAbiertas, indicadores,
  };
}

/** Tasks done at a date, counting only the tasks that existed then. */
export function avanceAl(tareas: TareaDelPeriodo[], fecha: string): { listas: number; total: number; porcentaje: number } {
  const existentes = tareas.filter((t) => t.creada <= fecha);
  const listas = existentes.filter((t) => CERRADA.has(alCorte(t, { desde: fecha, hasta: fecha }).estado_al_corte)).length;
  return { listas, total: existentes.length, porcentaje: existentes.length ? Math.round((listas / existentes.length) * 100) : 0 };
}

export const ETIQUETA_ESTADO: Record<string, string> = {
  backlog: 'Pendiente', en_proceso: 'En proceso', en_revision: 'Revisión interna', revision_interna: 'Revisión interna',
  revision_cliente: 'Revisión cliente', ajustes: 'Ajustes', aprobado: 'Aprobado', entregado: 'Entregado', bloqueado: 'Bloqueado',
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const fechaCorta = (fecha: string) => { const [, m, d] = fecha.split('-').map(Number); return `${d} ${MESES[m - 1]}`; };
const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

/** How a task stood at the cut, in one fixed sentence (no AI involved). */
export function resultado(t: TareaAlCorte): string {
  if (CERRADA.has(t.estado_al_corte)) {
    if (!t.entrega) return 'Entregada (sin fecha registrada)';
    const d = t.fecha_al_corte ? diasEntre(t.entrega.fecha, t.fecha_al_corte) : null;
    const cuando = d == null ? '' : d > 0 ? ` · ${dias(d)} antes` : d < 0 ? ` · ${dias(-d)} tarde` : ' · a tiempo';
    return `Entregada el ${fechaCorta(t.entrega.fecha)}${cuando}`;
  }
  const estado = ETIQUETA_ESTADO[t.estado_al_corte] ?? t.estado_al_corte;
  return t.dias_atraso != null ? `${estado} · ${dias(t.dias_atraso)} de atraso` : estado;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * The traffic light, with Tiusdei's own rule for project health so both always agree: red with overdue tasks or
 * the project's end date already past, yellow when something is due in the next three days, green otherwise.
 * When someone set another color by hand in Tiusdei, the note says so.
 */
export function semaforo(
  i: Pick<Indicadores, 'atrasadas' | 'por_vencer'>,
  proyecto: { estado?: string | null; fecha_fin?: string | null; salud_manual?: string | null },
  limite: string,
): { color: 'verde' | 'amarillo' | 'rojo'; frase: string; nota: string | null } {
  const finPasado = proyecto.estado === 'en_curso' && !!proyecto.fecha_fin && proyecto.fecha_fin < limite;
  const riesgos = [
    i.atrasadas > 0 && plural(i.atrasadas, 'tarea vencida sin entregar', 'tareas vencidas sin entregar'),
    finPasado && `la fecha de cierre del proyecto (${fechaCorta(proyecto.fecha_fin!)}) ya pasó`,
  ].filter(Boolean) as string[];
  const luz = riesgos.length
    ? { color: 'rojo' as const, frase: `En riesgo: ${riesgos.join(' y ')}.` }
    : i.por_vencer > 0
      ? { color: 'amarillo' as const, frase: `Atención: ${i.por_vencer === 1 ? '1 entrega vence' : `${i.por_vencer} entregas vencen`} en los próximos 3 días.` }
      : { color: 'verde' as const, frase: 'Vamos bien: nada vencido ni por vencer.' };
  const manual = proyecto.salud_manual;
  return { ...luz, nota: manual && manual !== luz.color ? `En Tiusdei el proyecto está marcado en ${manual} a mano.` : null };
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

const PERMITIDO: Record<'regenerar' | 'aprobar' | 'enviar' | 'eliminar', { estados: EstadoReporte[]; mensaje: string }> = {
  regenerar: { estados: ['borrador', 'fallido'], mensaje: 'Solo se regenera un borrador.' },
  aprobar: { estados: ['borrador'], mensaje: 'Solo se aprueba un borrador listo.' },
  enviar: { estados: ['aprobado'], mensaje: 'Primero aprueba el reporte.' },
  eliminar: { estados: ['programado', 'borrador', 'aprobado', 'fallido'], mensaje: 'Espera a que termine de generarse para eliminarlo.' },
};

export function puede(accion: keyof typeof PERMITIDO, estado: EstadoReporte): void {
  const regla = PERMITIDO[accion];
  if (!regla.estados.includes(estado)) throw new ErrorReporte(409, regla.mensaje);
}
