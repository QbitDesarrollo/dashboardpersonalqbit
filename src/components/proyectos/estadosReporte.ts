import type { EstadoReporte } from '@/lib/reportesApi';

/** How each report state reads on screen. */
export const ESTADO_REPORTE: Record<EstadoReporte, { texto: string; clase: string }> = {
  programado: { texto: 'Programado', clase: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300' },
  generando: { texto: 'Generando…', clase: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  borrador: { texto: 'Borrador', clase: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  aprobado: { texto: 'Aprobado', clase: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  fallido: { texto: 'Falló', clase: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
};
