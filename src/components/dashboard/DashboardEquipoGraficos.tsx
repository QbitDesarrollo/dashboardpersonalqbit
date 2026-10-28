import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, ListChecks } from 'lucide-react';
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import type { Task, TaskStats } from '@/lib/dashboardDatos';
import { metricasMarcas, seleccionarTareas, type MostrarTareas } from '@/lib/dashboardSeleccion';
import { TooltipTareas } from './TooltipTareas';
import { GraficoMarcas } from './GraficoMarcas';

interface Props { myTasks: Task[]; myStats: TaskStats; onMostrar: MostrarTareas }
export function DashboardEquipoGraficos({ myTasks, myStats, onMostrar }: Props) {
  const marcas = useMemo(() => metricasMarcas(myTasks), [myTasks]);
  const estados = [
    { name: 'Pendiente', estado: 'backlog', value: myStats.backlog, color: 'hsl(var(--muted-foreground))' },
    { name: 'En Proceso', estado: 'en_proceso', value: myStats.en_proceso, color: 'hsl(var(--info))' },
    { name: 'En Revisión', estado: 'en_revision', value: myStats.en_revision, color: 'hsl(var(--warning))' },
    { name: 'Aprobado', estado: 'aprobado', value: myStats.aprobado, color: 'hsl(var(--success))' },
    { name: 'Entregado', estado: 'entregado', value: myStats.entregado, color: 'hsl(var(--primary))' },
    { name: 'Bloqueado', estado: 'bloqueado', value: myStats.bloqueado, color: 'hsl(var(--destructive))' },
  ].filter((d) => d.value > 0);
  const mostrarEstado = (e: { name: string; estado: string }) => onMostrar({ titulo: e.name, criterio: { tipo: 'estado', estado: e.estado } });
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      <Card className="glass-card">
        <CardHeader className="pb-2 sm:pb-4"><div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /><CardTitle className="text-base sm:text-lg">Mis Tareas por Estado</CardTitle>
        </div></CardHeader>
        <CardContent className="px-2 sm:px-6">
          {!myTasks.length ? <div className="text-center py-6 sm:py-8 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 opacity-50" /><p className="text-sm">No tienes tareas asignadas</p>
          </div> : <>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={estados} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80} dataKey="value" cursor="pointer" onClick={mostrarEstado}>
                  {estados.map((e) => <Cell key={e.estado} fill={e.color} />)}
                </Pie>
                <Tooltip content={({ active, payload }) => {
                  const e = payload?.[0]?.payload as { name: string; estado: string } | undefined;
                  return active && e ? <TooltipTareas titulo={e.name} grupos={[{ nombre: 'Tareas', tareas: seleccionarTareas(myTasks, { tipo: 'estado', estado: e.estado }) }]} /> : null;
                }} />
              </PieChart>
            </ResponsiveContainer>
            <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer text-primary">Ver tareas por estado</summary>
              <div className="mt-2 flex flex-wrap gap-2">{estados.map((e) => <button key={e.estado} type="button" className="text-primary underline" onClick={() => mostrarEstado(e)}>{e.name} ({e.value})</button>)}</div>
            </details>
          </>}
        </CardContent>
      </Card>
      <GraficoMarcas brandMetrics={marcas} isEquipo onMostrar={onMostrar} />
    </div>
  );
}
