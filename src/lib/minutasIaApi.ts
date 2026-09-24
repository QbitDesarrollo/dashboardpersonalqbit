import { llamar } from './minutasApi';

/** Minutas drafted by AI (Codex runner on the server). The sources are sent, never stored. */

export interface EstadoIa { permitido: boolean; disponible: boolean; detalle: string | null; usados: number; limite: number }
export interface SaludIa { listo: boolean; detalle: string }
/** Where a point came from: the meeting transcript, the client's own notes, or both. */
export type OrigenPunto = 'reunion' | 'cliente' | 'ambos';

export interface PuntoIa {
  titulo: string;
  descripcion: string;
  responsable_cliente: boolean;
  origen: OrigenPunto;
  fecha_compromiso: string | null;
  cita: string;
  tareas_sugeridas: { titulo: string; departamento: string }[];
}
export interface BorradorIa { titulo: string; resumen: string; puntos: PuntoIa[] }
interface Trabajo { id: string; estado: 'procesando' | 'listo' | 'error'; borrador: BorradorIa | null; error: string | null }

export const estadoIa = () => llamar<EstadoIa>('/api/data/minutas/ia/estado');
export const saludIa = () => llamar<SaludIa>('/api/data/minutas/ia/salud');
/** At least one source is needed: the transcript or what the client sent. `indicaciones` come from the team. */
export const pedirBorrador = (datos: { transcripcion: string; notas_cliente: string; indicaciones: string; fecha: string }) =>
  llamar<{ id: string }>('/api/data/minutas/ia/borradores', 'POST', datos);

/** Polls the job until the draft is ready. Rejects with the server's message if it fails. */
export async function esperarBorrador(id: string, { intervaloMs = 2000, limiteMs = 5 * 60_000 } = {}): Promise<BorradorIa> {
  const inicio = Date.now();
  for (;;) {
    const t = await llamar<Trabajo>(`/api/data/minutas/ia/borradores/${id}`);
    if (t.estado === 'listo' && t.borrador) return t.borrador;
    if (t.estado === 'error') throw new Error(t.error ?? 'No se pudo generar la minuta.');
    if (Date.now() - inicio > limiteMs) throw new Error('La IA está tardando demasiado. Intenta de nuevo en unos minutos.');
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
}
