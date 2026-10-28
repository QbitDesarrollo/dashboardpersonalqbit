import type { Department } from './apiClient';

interface DepartamentoOrdenado {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

export interface DepartamentoResumen extends Department {
  personas: number;
  tareas_abiertas: number;
  tareas_total: number;
  canales: string[];
}

export function ordenarDepartamentos<T extends DepartamentoOrdenado>(departamentos: readonly T[]): T[] {
  return [...departamentos].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id));
}

export function opcionesSiguienteEtapa<T extends DepartamentoOrdenado>(departamentos: readonly T[], propioId?: string, siguienteId?: string | null): T[] {
  return ordenarDepartamentos(departamentos.filter(d => d.id !== propioId && (d.activo || d.id === siguienteId)));
}

/** Calcula el orden completo de la lista recibida; los límites no producen escrituras. */
export function calcularReorden(departamentos: readonly DepartamentoOrdenado[], id: string, direccion: -1 | 1): { id: string; orden: number }[] {
  const lista = ordenarDepartamentos(departamentos);
  const desde = lista.findIndex(d => d.id === id);
  const hasta = desde + direccion;
  if (desde < 0 || hasta < 0 || hasta >= lista.length) return [];
  [lista[desde], lista[hasta]] = [lista[hasta], lista[desde]];
  return lista.map((d, i) => ({ id: d.id, orden: (i + 1) * 10 }));
}

/** El cliente existente puede lanzar el cuerpo JSON completo de un error HTTP. */
export function mensajeErrorDepartamento(error: unknown): string {
  if (!(error instanceof Error)) return 'No se pudo guardar el departamento';
  try {
    const cuerpo: unknown = JSON.parse(error.message);
    if (cuerpo && typeof cuerpo === 'object' && 'error' in cuerpo && typeof cuerpo.error === 'string') return cuerpo.error;
  } catch { /* El mensaje ya es texto. */ }
  return error.message;
}
