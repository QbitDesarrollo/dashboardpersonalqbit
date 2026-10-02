import { Clock, TrendingUp, CheckCircle2, AlertTriangle, Package, Timer, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatTime, type TaskStats, type Task } from '@/lib/dashboardDatos';
import { seleccionarTareas, type CriterioDashboard, type MostrarTareas } from '@/lib/dashboardSeleccion';

interface Props {
  stats: TaskStats;
  totals: { entregables: number; tiempoTotal: number };
  isEquipo: boolean;
  tareas: Task[];
  onMostrar: MostrarTareas;
}

export function DashboardKpis({ stats, totals, isEquipo, tareas, onMostrar }: Props) {
  const tarjetas = [
    { title: isEquipo ? 'Mis Tareas Activas' : 'Tareas Activas', value: stats.en_proceso + stats.en_revision,
      icon: isEquipo ? Target : Clock, color: 'text-info', bgColor: 'bg-info/10', criterio: { tipo: 'activas' } },
    { title: 'En Revisión', value: stats.en_revision, icon: TrendingUp, color: 'text-warning', bgColor: 'bg-warning/10',
      criterio: { tipo: 'estado', estado: 'en_revision' } },
    { title: isEquipo ? 'Mis Entregadas' : 'Entregadas', value: stats.entregado, icon: CheckCircle2, color: 'text-success', bgColor: 'bg-success/10',
      criterio: { tipo: 'estado', estado: 'entregado' } },
    { title: 'Atrasadas', value: stats.atrasadas, icon: AlertTriangle, color: 'text-destructive', bgColor: 'bg-destructive/10', criterio: { tipo: 'atrasadas' } },
    { title: isEquipo ? 'Mis Entregables' : 'Total Entregables', value: totals.entregables, icon: Package, color: 'text-primary', bgColor: 'bg-primary/10', criterio: { tipo: 'entregables' } },
    { title: isEquipo ? 'Mi Tiempo' : 'Tiempo Total', value: formatTime(totals.tiempoTotal), icon: Timer, color: 'text-info', bgColor: 'bg-info/10', criterio: { tipo: 'tiempo' } },
  ] satisfies { title: string; value: number | string; icon: typeof Clock; color: string; bgColor: string; criterio: CriterioDashboard }[];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
      {tarjetas.map((kpi) => {
        const grupo = seleccionarTareas(tareas, kpi.criterio);
        const nombres = grupo.slice(0, 3).map((t) => t.titulo_tarea).join('\n');
        return (
          <Card key={kpi.title} className="glass-card hover:border-primary/50 transition-colors">
            <button type="button" className="w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`Ver tareas: ${kpi.title}`} title={nombres ? `${nombres}${grupo.length > 3 ? '\n…' : ''}\nHaz clic para ver todas.` : 'No hay tareas en este grupo.'}
              onClick={() => onMostrar({ titulo: kpi.title, criterio: kpi.criterio })}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <div className={cn('p-1.5 sm:p-2 rounded-lg', kpi.bgColor)}><kpi.icon className={cn(kpi.color, 'h-4 w-4 sm:h-5 sm:w-5')} /></div>
                </div>
                <p className="text-lg sm:text-2xl font-bold text-foreground">{kpi.value}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{kpi.title}</p>
                <span className="mt-1 block text-[10px] text-primary">Ver tareas</span>
              </CardContent>
            </button>
          </Card>
        );
      })}
    </div>
  );
}
