import { calcStats, type Task, type ResponsableMetric, type BrandMetric } from './dashboardDatos';

export type CriterioDashboard =
  | { tipo: 'activas' | 'atrasadas' | 'entregables' | 'tiempo' }
  | { tipo: 'estado'; estado: string }
  | { tipo: 'responsable'; id: string; grupo: 'completadas' | 'enProgreso' }
  | { tipo: 'marca'; id: string };
export interface SeleccionDashboard { titulo: string; criterio: CriterioDashboard }
export type MostrarTareas = (seleccion: SeleccionDashboard) => void;

/** Receives the SAME filtered tasks used by the cards/charts. Never fetches or expands their scope. */
export function seleccionarTareas(tareas: Task[], criterio: CriterioDashboard, ahora = new Date()): Task[] {
  return tareas.filter((t) => {
    switch (criterio.tipo) {
      case 'activas': return ['en_proceso', 'en_revision'].includes(t.estado);
      case 'estado': return t.estado === criterio.estado;
      case 'atrasadas': return calcStats([t], ahora).atrasadas === 1;
      case 'entregables': return Number(t.cantidad_entregables) > 0;
      case 'tiempo': return Number(t.tiempo_trabajado) > 0;
      case 'marca': return t.brand_id === criterio.id;
      case 'responsable': return t.responsable_user_id === criterio.id && (criterio.grupo === 'completadas'
        ? ['aprobado', 'entregado'].includes(t.estado) : ['en_proceso', 'en_revision'].includes(t.estado));
    }
  });
}

export function metricasResponsables(tareas: Task[], personas: { id: string; nombre: string; avatar_url?: string | null }[]): ResponsableMetric[] {
  const personasPorId = new Map(personas.map((p) => [p.id, p]));
  const mapa = new Map<string, ResponsableMetric>();
  for (const t of tareas) {
    if (!t.responsable_user_id) continue;
    const persona = personasPorId.get(t.responsable_user_id);
    const m = mapa.get(t.responsable_user_id) ?? { id: t.responsable_user_id, nombre: persona?.nombre ?? 'Sin asignar',
      avatar_url: persona?.avatar_url ?? null, total: 0, completadas: 0, enProgreso: 0, tiempoTotal: 0, entregables: 0 };
    m.total++; m.entregables += Number(t.cantidad_entregables) || 0; m.tiempoTotal += Number(t.tiempo_trabajado) || 0;
    if (['entregado', 'aprobado'].includes(t.estado)) m.completadas++;
    else if (['en_proceso', 'en_revision'].includes(t.estado)) m.enProgreso++;
    mapa.set(m.id, m);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

export function metricasMarcas(tareas: Task[]): BrandMetric[] {
  const mapa = new Map<string, BrandMetric>();
  for (const t of tareas) {
    const m = mapa.get(t.brand_id) ?? { id: t.brand_id, nombre: t.brands?.nombre ?? 'Sin marca', total: 0,
      completadas: 0, tiempoTotal: 0, entregables: 0 };
    m.total++; m.entregables += Number(t.cantidad_entregables) || 0; m.tiempoTotal += Number(t.tiempo_trabajado) || 0;
    if (['entregado', 'aprobado'].includes(t.estado)) m.completadas++;
    mapa.set(m.id, m);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}
