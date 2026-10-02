import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { TaskStats } from '@/lib/dashboardDatos';
import type { MostrarTareas } from '@/lib/dashboardSeleccion';

interface Props { activeStats: TaskStats; isEquipo: boolean; onMostrar: MostrarTareas }
export function DashboardProgreso({ activeStats, isEquipo, onMostrar }: Props) {
  return (
    <Card className="glass-card">
      <CardHeader className="pb-2 sm:pb-4"><CardTitle className="text-base sm:text-lg">{isEquipo ? 'Mi Progreso' : 'Progreso General'}</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3 sm:space-y-4">
          {[
            { label: 'Pendiente', estado: 'backlog', value: activeStats.backlog, color: 'bg-status-backlog' },
            { label: 'En Proceso', estado: 'en_proceso', value: activeStats.en_proceso, color: 'bg-status-in-progress' },
            { label: 'En Revisión', estado: 'en_revision', value: activeStats.en_revision, color: 'bg-status-in-review' },
            { label: 'Aprobado', estado: 'aprobado', value: activeStats.aprobado, color: 'bg-status-approved' },
            { label: 'Entregado', estado: 'entregado', value: activeStats.entregado, color: 'bg-status-delivered' },
          ].map((item) => (
            <button type="button" key={item.estado} aria-label={`Ver progreso: ${item.label}`}
              className="block w-full space-y-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:space-y-2"
              onClick={() => onMostrar({ titulo: item.label, criterio: { tipo: 'estado', estado: item.estado } })}>
              <div className="flex items-center justify-between text-xs sm:text-sm"><span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium text-foreground">{item.value} / {activeStats.total}</span></div>
              <div className="h-1.5 sm:h-2 bg-muted rounded-full overflow-hidden"><div className={cn('h-full rounded-full transition-all', item.color)}
                style={{ width: `${activeStats.total > 0 ? (item.value / activeStats.total) * 100 : 0}%` }} /></div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
