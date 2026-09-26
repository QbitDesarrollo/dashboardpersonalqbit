import { apiRequest } from './apiClient';
import { llamar } from './minutasApi';

/** Weekly project reports (REPORTES-PLAN.md). */

export type EstadoReporte = 'programado' | 'generando' | 'borrador' | 'aprobado' | 'fallido';
export type Grupo = 'completadas' | 'atrasadas' | 'bloqueadas' | 'en_curso' | 'pendientes';

export interface ConfigReportes { activo: boolean; dia_entrega: number; hora_entrega: string; anticipacion_horas?: number }

export interface Destacado { texto: string; task_ids: string[] }
export interface TareaReporte {
  id: string; titulo: string; responsable: string | null; estado: string; estado_texto: string;
  fecha_entrega: string | null; dias_atraso: number | null; subtareas: string | null; comentarios: number;
  linea: string; fuente: 'ia' | 'plantilla';
}
export interface ContenidoReporte {
  proyecto: { id: string; nombre: string; marca: string; lider: string; salud: string };
  periodo: { desde: string; hasta: string };
  indicadores: Record<Grupo, number> & { avance: number };
  resumen_ejecutivo: string;
  destacados: { logros: Destacado[]; decisiones: Destacado[]; riesgos: Destacado[] };
  grupos: { clave: Grupo; titulo: string; tareas: TareaReporte[] }[];
  mensaje_correo: string;
}

export interface Envio { id: string; para: string[]; cc: string[]; enviado_en: string; enviado_por: string | null }

export interface ReporteResumen {
  id: string; project_id: string; periodo_desde: string; periodo_hasta: string; entregar_en: string;
  estado: EstadoReporte; error: string | null; indicaciones: string | null; generado_en: string | null;
  aprobado_por_nombre: string | null; aprobado_en: string | null; resumen: string | null;
}
export interface Reporte extends Omit<ReporteResumen, 'resumen'> {
  contenido: ContenidoReporte | null;
  envios: Envio[];
}

export const leerConfigReportes = (projectId: string) => llamar<ConfigReportes>(`/api/data/projects/${projectId}/reportes/config`);
export const guardarConfigReportes = (projectId: string, c: Pick<ConfigReportes, 'activo' | 'dia_entrega' | 'hora_entrega'>) =>
  llamar<ConfigReportes>(`/api/data/projects/${projectId}/reportes/config`, 'PUT', c);
export const listarReportes = (projectId: string) => llamar<ReporteResumen[]>(`/api/data/projects/${projectId}/reportes`);
export const generarReporte = (projectId: string, periodo?: { desde: string; hasta: string }) =>
  llamar<{ id: string }>(`/api/data/projects/${projectId}/reportes/generar`, 'POST', periodo ?? {});
export const leerReporte = (id: string) => llamar<Reporte>(`/api/data/reportes/${id}`);
export const regenerarReporte = (id: string, indicaciones: string) => llamar<{ id: string }>(`/api/data/reportes/${id}/regenerar`, 'POST', { indicaciones });
export const aprobarReporte = (id: string) => llamar<Reporte>(`/api/data/reportes/${id}/aprobar`, 'POST');
export const enviarReporte = (id: string, para: string[], cc: string[]) =>
  llamar<{ ok: true; envios: Envio[] }>(`/api/data/reportes/${id}/enviar`, 'POST', { para, cc });
export const pendientesReportes = async () => (await llamar<{ pendientes: number }>('/api/data/reportes/pendientes')).pendientes;

/** Polls until the report is no longer being generated. */
export async function esperarReporte(id: string, { intervaloMs = 2500, limiteMs = 15 * 60_000 } = {}): Promise<Reporte> {
  const inicio = Date.now();
  for (;;) {
    const r = await leerReporte(id);
    if (r.estado !== 'generando' && r.estado !== 'programado') return r;
    if (Date.now() - inicio > limiteMs) throw new Error('El reporte está tardando demasiado. Revisa en unos minutos.');
    await new Promise((res) => setTimeout(res, intervaloMs));
  }
}

/** The PDF as a file, fetched with the session so it can be shown inside Tiusdei. */
export async function pdfReporte(id: string): Promise<Blob> {
  const res = await apiRequest(`/api/data/reportes/${id}/pdf`);
  if (!res.ok) throw new Error('No se pudo abrir el PDF del reporte.');
  // Typed explicitly so the viewer always treats it as a PDF.
  return new Blob([await res.arrayBuffer()], { type: 'application/pdf' });
}
