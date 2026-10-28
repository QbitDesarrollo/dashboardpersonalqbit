import type { PuntoIa } from './minutasIaApi';
export type EstadoPunto = 'pendiente' | 'en_curso' | 'completado' | 'aprobado' | 'descartado';
export type Tono = 'slate' | 'blue' | 'teal' | 'green' | 'amber' | 'rose' | 'violet';

const ESTADO: Record<EstadoPunto, { texto: string; tono: Tono }> = {
  pendiente: { texto: 'Pendiente', tono: 'slate' },
  en_curso: { texto: 'En curso', tono: 'blue' },
  completado: { texto: 'Completado', tono: 'teal' },
  aprobado: { texto: 'Aprobado por el cliente', tono: 'green' },
  descartado: { texto: 'Descartado', tono: 'slate' },
};

/** Cómo se muestra el estado de un punto. Los puntos del cliente hablan de "esperar" y "recibir". */
export function estadoPunto(p: { estado: EstadoPunto; responsable_cliente: boolean }): { texto: string; tono: Tono } {
  if (p.responsable_cliente && p.estado !== 'descartado') {
    return p.estado === 'completado' || p.estado === 'aprobado'
      ? { texto: 'Recibido', tono: 'green' }
      : { texto: 'Esperando al cliente', tono: 'amber' };
  }
  return ESTADO[p.estado];
}

/** A linked task counts as done once it was delivered or approved. */
export const tareaLista = (t: { estado: string }) => t.estado === 'entregado' || t.estado === 'aprobado';

/**
 * Every linked task is done but the point is still open: someone should close it
 * with what was done and the evidence. Points owed by the client have no tasks to wait for.
 */
export function listoParaCerrar(p: { estado: EstadoPunto; responsable_cliente: boolean; tareas: { estado: string }[] }): boolean {
  if (p.responsable_cliente || (p.estado !== 'pendiente' && p.estado !== 'en_curso')) return false;
  return p.tareas.length > 0 && p.tareas.every(tareaLista);
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function dias(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000);
}

/** Texto corto de una fecha YYYY-MM-DD: "6 oct". */
export function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
}

/** Aviso de la fecha de compromiso. Los puntos cerrados o sin fecha no muestran nada. */
export function vencimiento(fecha: string | null, estado: EstadoPunto, hoy: string): { texto: string; tono: Tono } | null {
  if (!fecha || estado === 'completado' || estado === 'aprobado' || estado === 'descartado') return null;
  const faltan = dias(hoy, fecha);
  if (faltan < 0) return { texto: `Vencido hace ${-faltan} ${faltan === -1 ? 'día' : 'días'}`, tono: 'rose' };
  if (faltan === 0) return { texto: 'Vence hoy', tono: 'amber' };
  return { texto: fechaCorta(fecha), tono: 'slate' };
}

/**
 * Lo que falta para cerrar un punto, para guiar en pantalla.
 * La regla real la valida el servidor (server/src/minutas/domain.ts).
 */
export function requisitosCierre(p: { responsable_cliente: boolean; resolucion: string; evidencias: number }): { texto: string; ok: boolean }[] {
  const evidencia = { texto: 'Al menos una evidencia', ok: p.evidencias > 0 };
  if (p.responsable_cliente) return [evidencia];
  return [{ texto: 'Explicación de lo que se hizo', ok: p.resolucion.trim().length >= 10 }, evidencia];
}

export interface PuntoPayload {
  titulo: string;
  descripcion: string | null;
  responsable_user_id: string | null;
  responsable_cliente: boolean;
  fecha_compromiso: string | null;
}

/** Del borrador del editor al payload de la API. `responsable` es '' | id de usuario | 'cliente'. */
export function aPuntosNuevos(borrador: { clave?: string; titulo: string; descripcion: string; responsable: string; fecha: string }[]): PuntoPayload[] {
  return borrador
    .filter((p) => p.titulo.trim())
    .map((p) => ({
      titulo: p.titulo.trim(),
      descripcion: p.descripcion.trim() || null,
      responsable_user_id: p.responsable && p.responsable !== 'cliente' ? p.responsable : null,
      responsable_cliente: p.responsable === 'cliente',
      fecha_compromiso: p.fecha || null,
    }));
}

/** Puntos que propuso la IA, listos para revisarlos en el editor. La cita no se guarda: solo sirve para verificar. */
export function puntosDesdeIa(
  puntos: PuntoIa[],
): { clave: string; titulo: string; descripcion: string; responsable: string; fecha: string; cita: string; citaFuente: PuntoIa['cita_fuente'] }[] {
  return puntos.map((p) => ({
    clave: crypto.randomUUID(),
    titulo: p.titulo,
    descripcion: p.descripcion,
    responsable: p.responsable_cliente ? 'cliente' : '',
    fecha: p.fecha_compromiso ?? '',
    cita: p.cita,
    citaFuente: p.cita_fuente,
  }));
}

/** Fecha de hoy (YYYY-MM-DD) en Guayaquil. En UTC, después de las 19:00 ya sería mañana. */
export function hoyEcuador(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());
}

const ESTADO_CLIENTE: Record<EstadoPunto, { texto: string; tono: Tono }> = {
  pendiente: { texto: 'Por empezar', tono: 'slate' },
  en_curso: { texto: 'En marcha', tono: 'blue' },
  completado: { texto: 'Listo', tono: 'teal' },
  aprobado: { texto: 'Aprobado', tono: 'green' },
  descartado: { texto: 'Descartado', tono: 'slate' },
};

/** Cómo ve el estado el cliente en el enlace público: en su lenguaje, no en el del equipo. */
export function estadoCliente(p: { estado: EstadoPunto; responsable_cliente: boolean }): { texto: string; tono: Tono } {
  if (p.responsable_cliente && p.estado !== 'descartado') {
    return p.estado === 'completado' || p.estado === 'aprobado'
      ? { texto: 'Recibido', tono: 'green' }
      : { texto: 'Pendiente de tu parte', tono: 'amber' };
  }
  return ESTADO_CLIENTE[p.estado];
}

// Mismas etiquetas que Proyectos para los estados de tarea.
const ESTADO_TAREA: Record<string, string> = {
  backlog: 'Pendiente', en_proceso: 'En proceso', en_revision: 'En revisión', revision_interna: 'Revisión interna',
  revision_cliente: 'Revisión cliente', ajustes: 'Ajustes', aprobado: 'Aprobado', entregado: 'Entregado', bloqueado: 'Bloqueado',
};

export function etiquetaTarea(estado: string): string {
  return ESTADO_TAREA[estado] ?? estado;
}

/** Fecha de un timestamp en hora de Guayaquil: "24 sep 2026". */
export function fechaLocal(iso: string): string {
  return new Date(iso).toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil', day: 'numeric', month: 'short', year: 'numeric' });
}

const horaActividad = new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

/** "28 oct 00:44" en hora de Ecuador. */
export function fechaHoraActividad(iso: string): string {
  const partes = Object.fromEntries(horaActividad.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${partes.day} ${String(partes.month).replace('.', '')} ${partes.hour}:${partes.minute}`;
}

/**
 * Separa lo que dijo el cliente de la actividad interna registrada por el MCP (via 'mcp'),
 * que no es una nota del cliente: de esa actividad solo interesa la más reciente.
 */
export function separarNotas<T extends { texto: string; created_at: string; via?: string; autor?: { nombre: string } | null }>(notas: T[]) {
  const cliente = notas.filter((n) => n.via !== 'mcp');
  const actividad = notas.filter((n) => n.via === 'mcp').sort((a, b) => a.created_at.localeCompare(b.created_at));
  const linea = (n: T) => [n.texto, n.autor?.nombre, fechaHoraActividad(n.created_at)].filter(Boolean).join(' · ');
  const ultima = actividad.at(-1);
  return { cliente, ultimaActividad: ultima ? linea(ultima) : null, historial: actividad.map(linea).join('\n') };
}
