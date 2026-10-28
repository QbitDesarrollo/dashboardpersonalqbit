import { tareasUrgentes, type Task } from './dashboardDatos';

/** Reuses the KPI's finished-state exclusions; only the upcoming window grows. */
export function agruparUrgentes(tareas: Task[], ahora = new Date()) {
  const urgentes = tareasUrgentes(tareas, ahora, 7);
  return [
    { nombre: 'Atrasadas', tareas: urgentes.filter((t) => t.dias_restantes < 0) },
    { nombre: 'Hoy', tareas: urgentes.filter((t) => t.dias_restantes === 0) },
    { nombre: 'Esta semana', tareas: urgentes.filter((t) => t.dias_restantes >= 1 && t.dias_restantes <= 7) },
  ];
}

export function textoVencimiento(dias: number): string {
  if (dias < -1) return `Venció hace ${Math.abs(dias)} días`;
  if (dias === -1) return 'Venció ayer';
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  return `Vence en ${dias} días`;
}
