import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import type { DepartmentMetric } from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Workflow } from 'lucide-react';

function fmtDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  const d = seconds / 86400;
  if (d >= 1) return `${d.toFixed(1)} d`;
  const h = seconds / 3600;
  if (h >= 1) return `${h.toFixed(1)} h`;
  return `${Math.round(seconds / 60)} min`;
}

export function DepartmentTimesCard({ from, to, deskId }: { from: string; to: string; deskId?: string }) {
  const [metrics, setMetrics] = useState<DepartmentMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getDepartmentMetrics({ from, to, desk_id: deskId && deskId !== 'all' ? deskId : undefined })
      .then((r) => { if (!cancelled) setMetrics(r.departments || []); })
      .catch(() => { if (!cancelled) setMetrics([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to, deskId]);

  // Ordenar por tiempo promedio desc (cuellos de botella primero)
  const sorted = [...metrics].filter((m) => m.tareas > 0).sort((a, b) => b.avg_seconds - a.avg_seconds);
  const max = sorted.length > 0 ? Math.max(...sorted.map((m) => m.avg_seconds)) : 0;

  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Workflow className="h-4 w-4 text-primary" />
          Tiempo promedio por etapa
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Cuánto tiempo pasan las tareas en cada departamento. Los de arriba son los cuellos de botella.
        </p>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin datos en el rango seleccionado.</p>
        ) : (
          <div className="space-y-2.5">
            {sorted.map((m) => {
              const pct = max > 0 ? Math.max(3, (m.avg_seconds / max) * 100) : 0;
              const color = m.color || '#6366f1';
              return (
                <div key={m.department_id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      {m.nombre}
                    </span>
                    <span className="text-muted-foreground">
                      <strong className="text-foreground">{fmtDuration(m.avg_seconds)}</strong>
                      {' · '}{m.tareas} tarea{m.tareas !== 1 ? 's' : ''}
                      {m.abiertos > 0 && <span className="text-amber-600"> · {m.abiertos} en curso</span>}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
