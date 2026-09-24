/**
 * Filters of the Tasks page remembered in this browser, per person, so the list opens
 * the next day the way it was left. Only the dropdown filters: the search text is not kept.
 */
export interface FiltrosTareas {
  brand: string;
  project: string;
  desk: string;
  status: string;
  priority: string;
  responsable: string;
}

export const SIN_FILTROS: FiltrosTareas = { brand: 'all', project: 'all', desk: 'all', status: 'all', priority: 'all', responsable: 'all' };

const clave = (userId: string) => `tareas_filtros:${userId}`;

/** The remembered filters, or null when this person has none saved (or storage is unavailable). */
export function leerFiltros(userId: string | null | undefined): FiltrosTareas | null {
  if (!userId) return null;
  try {
    const crudo = localStorage.getItem(clave(userId));
    if (!crudo) return null;
    const guardado = JSON.parse(crudo) as Record<string, unknown>;
    if (!guardado || typeof guardado !== 'object') return null;
    const filtros = { ...SIN_FILTROS };
    for (const k of Object.keys(SIN_FILTROS) as (keyof FiltrosTareas)[]) {
      if (typeof guardado[k] === 'string' && guardado[k]) filtros[k] = guardado[k] as string;
    }
    return filtros;
  } catch {
    return null;
  }
}

export function guardarFiltros(userId: string | null | undefined, filtros: FiltrosTareas): void {
  if (!userId) return;
  try {
    localStorage.setItem(clave(userId), JSON.stringify(filtros));
  } catch {
    // Private mode or blocked storage: the page works the same, it just will not remember.
  }
}
