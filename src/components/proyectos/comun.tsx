/** Labels, colors and small pieces shared by the Projects screens. */

export const ESTADO_LABEL: Record<string, string> = { en_curso: 'En curso', pausado: 'Pausado', terminado: 'Terminado', cancelado: 'Cancelado' };
export const ESTADO_CLS: Record<string, string> = {
  en_curso: 'bg-blue-100 text-blue-700 border-blue-200', pausado: 'bg-amber-100 text-amber-700 border-amber-200',
  terminado: 'bg-emerald-100 text-emerald-700 border-emerald-200', cancelado: 'bg-slate-100 text-slate-500 border-slate-200',
};
export const SALUD_DOT: Record<string, string> = { verde: 'bg-emerald-500', amarillo: 'bg-amber-500', rojo: 'bg-rose-500' };
export const SALUD_LABEL: Record<string, string> = { verde: 'A tiempo', amarillo: 'Atención', rojo: 'En riesgo' };

export function fmt(s: string | null): string {
  if (!s) return '—';
  try { return new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return s; }
}

export function ProgressBar({ pct, salud }: { pct: number; salud: string }) {
  const color = salud === 'rojo' ? '#ef4444' : salud === 'amarillo' ? '#f59e0b' : '#10b981';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} /></div>
      <span className="text-xs font-medium text-muted-foreground w-9 text-right">{pct}%</span>
    </div>
  );
}
