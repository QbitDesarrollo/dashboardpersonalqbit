import { apiRequest } from './apiClient';
import type { EstadoPunto } from './minutas';

export interface Persona { id: string; nombre: string; avatar_url?: string | null }

export interface Evidencia {
  id: string;
  tipo: 'enlace' | 'drive' | 'archivo' | 'imagen';
  nombre: string;
  url: string;
  drive_file_id: string | null;
  origen_task_id: string | null;
}

export interface TareaVinculada {
  id: string;
  titulo_tarea: string;
  estado: string;
  fecha_entrega: string | null;
  responsable: Persona | null;
}

export interface Nota {
  id: string;
  tipo: 'nota' | 'ajuste';
  texto: string;
  created_at: string;
  autor: Persona | null;
  /** Name the client entered when the note came through the link. */
  autor_nombre?: string | null;
  via?: 'interno' | 'enlace' | 'mcp';
}

export interface Punto {
  id: string;
  numero: number;
  titulo: string;
  descripcion: string | null;
  responsable: Persona | null;
  responsable_cliente: boolean;
  fecha_compromiso: string | null;
  estado: EstadoPunto;
  visible_cliente: boolean;
  resolucion: string | null;
  completado_por: Persona | null;
  completado_en: string | null;
  aprobado_via: 'enlace' | 'reunion' | null;
  aprobado_por_nombre: string | null;
  aprobado_en: string | null;
  motivo_descarte: string | null;
  evidencias: Evidencia[];
  tareas: TareaVinculada[];
  notas: Nota[];
}

export interface Progreso { total: number; cerrados: number; enCurso: number }

export interface MinutaResumen {
  id: string;
  brand_id: string;
  brand_nombre: string;
  project_id: string | null;
  project_nombre: string | null;
  numero: number;
  codigo: string;
  titulo: string;
  fecha: string;
  estado: 'borrador' | 'publicada';
  owner: Persona;
  progreso: Progreso;
}

export interface Minuta extends MinutaResumen {
  resumen: string | null;
  miembros: Persona[];
  items: Punto[];
}

/**
 * What the presentation screens need from a minuta: the team's full minuta and the one the client sees through the
 * link (visible points only, no tasks, no team members) both fit.
 */
export type EvidenciaVista = Pick<Evidencia, 'id' | 'tipo' | 'nombre' | 'url'>;
export interface NotaVista { id: string; tipo: 'nota' | 'ajuste'; texto: string; created_at: string; autor_nombre?: string | null }
export type PuntoVista = Pick<Punto, 'id' | 'numero' | 'titulo' | 'descripcion' | 'estado' | 'responsable_cliente' | 'fecha_compromiso' | 'resolucion' | 'visible_cliente'>
  & { evidencias: EvidenciaVista[]; notas: NotaVista[] };
export type MinutaVista = Pick<Minuta, 'id' | 'numero' | 'codigo' | 'titulo' | 'fecha' | 'resumen' | 'brand_nombre' | 'project_nombre'> & { items: PuntoVista[] };

export interface PuntoNuevo {
  titulo: string;
  descripcion?: string | null;
  responsable_user_id?: string | null;
  responsable_cliente?: boolean;
  fecha_compromiso?: string | null;
}

export interface MinutaNueva {
  brand_id: string;
  project_id?: string | null;
  fecha: string;
  titulo: string;
  owner_user_id?: string;
  miembros?: string[];
  resumen?: string | null;
  estado?: 'borrador' | 'publicada';
  items?: PuntoNuevo[];
}

export type AccionPunto = 'iniciar' | 'completar' | 'aprobar' | 'reabrir' | 'descartar' | 'restaurar' | 'pedir_ajuste';

/** Llama a la API y lanza un Error con el mensaje del servidor si la respuesta no es OK. */
export async function llamar<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await apiRequest(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const texto = await res.text();
  let datos: unknown = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  if (!res.ok) {
    const mensaje = datos && typeof datos === 'object' && 'error' in datos ? String((datos as { error: unknown }).error) : 'Error de la API';
    throw new Error(mensaje);
  }
  return datos as T;
}

export function listarMinutas(filtros: { brand_id?: string; project_id?: string; q?: string } = {}): Promise<MinutaResumen[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) if (v) qs.set(k, v);
  const q = qs.toString();
  return llamar<MinutaResumen[]>(`/api/data/minutas${q ? `?${q}` : ''}`);
}

export function accionPunto(itemId: string, accion: AccionPunto, datos: { resolucion?: string; motivo?: string }): Promise<Minuta> {
  return llamar<Minuta>(`/api/data/minuta-items/${itemId}/accion`, 'POST', { accion, ...datos });
}

export function obtenerMinuta(id: string): Promise<Minuta> {
  return llamar<Minuta>(`/api/data/minutas/${id}`);
}

export function crearMinuta(datos: MinutaNueva): Promise<Minuta> {
  return llamar<Minuta>('/api/data/minutas', 'POST', datos);
}

export function editarMinuta(
  id: string,
  cambios: Partial<Pick<MinutaNueva, 'titulo' | 'fecha' | 'project_id' | 'owner_user_id' | 'miembros' | 'resumen' | 'estado'>>,
): Promise<Minuta> {
  return llamar<Minuta>(`/api/data/minutas/${id}`, 'PATCH', cambios);
}

export function borrarMinuta(id: string): Promise<{ ok: true }> {
  return llamar<{ ok: true }>(`/api/data/minutas/${id}`, 'DELETE');
}

/** New order of all the points; their codes follow the position. */
export function reordenarPuntos(minutaId: string, itemIds: string[]): Promise<Minuta> {
  return llamar<Minuta>(`/api/data/minutas/${minutaId}/orden`, 'PUT', { items: itemIds });
}

export function agregarPunto(minutaId: string, punto: PuntoNuevo): Promise<Minuta> {
  return llamar<Minuta>(`/api/data/minutas/${minutaId}/items`, 'POST', punto);
}

export function editarPunto(itemId: string, cambios: Partial<PuntoNuevo> & { visible_cliente?: boolean }): Promise<Minuta> {
  return llamar<Minuta>(`/api/data/minuta-items/${itemId}`, 'PATCH', cambios);
}

export function borrarPunto(itemId: string): Promise<Minuta> {
  return llamar<Minuta>(`/api/data/minuta-items/${itemId}`, 'DELETE');
}

export function agregarEvidencia(
  itemId: string,
  evidencia: { tipo: 'enlace' | 'drive' | 'imagen' | 'archivo'; nombre: string; url: string; drive_file_id?: string | null },
): Promise<Minuta> {
  return llamar<Minuta>(`/api/data/minuta-items/${itemId}/evidencias`, 'POST', evidencia);
}

export function quitarEvidencia(evidenciaId: string): Promise<Minuta> {
  return llamar<Minuta>(`/api/data/minuta-evidencias/${evidenciaId}`, 'DELETE');
}

export function vincularTarea(itemId: string, taskId: string): Promise<Minuta> {
  return llamar<Minuta>(`/api/data/minuta-items/${itemId}/tareas`, 'POST', { task_id: taskId });
}

export function desvincularTarea(itemId: string, taskId: string): Promise<Minuta> {
  return llamar<Minuta>(`/api/data/minuta-items/${itemId}/tareas/${taskId}`, 'DELETE');
}

export function agregarNota(itemId: string, texto: string): Promise<Minuta> {
  return llamar<Minuta>(`/api/data/minuta-items/${itemId}/notas`, 'POST', { texto });
}
