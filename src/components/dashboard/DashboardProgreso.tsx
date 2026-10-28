import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Task } from '@/lib/dashboardDatos';
import { calcularProgreso } from '@/lib/dashboardProgreso';
import type { MostrarTareas } from '@/lib/dashboardSeleccion';

interface Props { tareas: Task[]; isEquipo: boolean; onMostrar: MostrarTareas }
export function DashboardProgreso({ tareas, isEquipo, onMostrar }: Props) {
  const { total, segmentos, porcentajeEntregadas } = calcularProgreso(tareas);
  return (
    <Card className="glass-card">
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-base sm:text-lg">{isEquipo ? 'Mi Progreso' : 'Progreso'}</CardTitle>
        <span className="text-xs text-muted-foreground">{total} tareas</span>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground"><strong className="text-3xl font-semibold text-foreground">{porcentajeEntregadas}%</strong> entregadas</p>
        {/* The loaded task data has no status-transition date: do not invent a weekly delta. */}
        <div role="img" aria-label={`${total} tareas: ${segmentos.map((s) => `${s.label} ${s.cantidad}`).join(', ')}`}
          className="flex h-2.5 overflow-hidden rounded-full bg-muted">
          {segmentos.filter((s) => s.cantidad > 0).map((s) => <span key={s.estado} style={{ width: `${s.proporcion}%`, backgroundColor: `hsl(var(--${s.token}))` }} />)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {segmentos.filter((s) => s.cantidad > 0 || ['backlog', 'en_proceso', 'en_revision', 'aprobado', 'entregado', 'bloqueado'].includes(s.estado)).map((s) => (
            <button type="button" key={s.estado} aria-label={`Ver progreso: ${s.label}`} title={`${s.label}: ${s.cantidad} tareas, ${s.porcentaje}%`}
              className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-left text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => onMostrar({ titulo: s.label, criterio: { tipo: 'estado', estado: s.estado } })}>
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: `hsl(var(--${s.token}))` }} />
              <span>{s.label}</span><strong>{s.cantidad}</strong><small className="ml-auto text-muted-foreground">{s.porcentaje}%</small>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
