import { apiRequest, type ApiRequestOptions } from '@/lib/apiClient';

export interface ReferenciasDepartamento {
  tareas: number;
  historial: number;
  traspasos: number;
  plantillas: number;
  personas: number;
  mesas: number;
  etapas: number;
}

export class ErrorArchivo extends Error {
  constructor(mensaje: string, public referencias?: ReferenciasDepartamento) { super(mensaje); }
}

/**
 * Contratos admin bajo /api/data/departments/:id:
 * GET /referencias: siete conteos, sin mutación; DELETE siempre los vuelve a comprobar.
 * POST /archivar { destino_id: UUID | null }: { tareas, personas, mesas, etapas }.
 * POST /restaurar: { ok: true }; no devuelve los elementos movidos.
 * DELETE { confirmacion: nombre exacto }: { ok: true }; 409 incluye referencias si hay uso.
 * 400: entrada inválida; 403: sin permiso; 404: inexistente; 409: estado incompatible.
 */
export async function solicitarArchivo<T>(id: string, accion: string, options?: ApiRequestOptions): Promise<T> {
  const respuesta = await apiRequest(`/api/data/departments/${id}${accion}`, options);
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new ErrorArchivo(datos.error || 'No se pudo completar la operación', datos.referencias);
  return datos as T;
}
