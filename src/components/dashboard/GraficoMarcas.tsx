import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2 } from 'lucide-react';
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { CHART_COLORS, type BrandMetric, type Task } from '@/lib/dashboardDatos';
import { seleccionarTareas, type MostrarTareas } from '@/lib/dashboardSeleccion';
import { TooltipTareas } from './TooltipTareas';

interface Props { brandMetrics: BrandMetric[]; tareas: Task[]; onMostrar: MostrarTareas }
export function GraficoMarcas({ brandMetrics, tareas, onMostrar }: Props) {
  const visibles = brandMetrics.slice(0, 6);
  const mostrar = (m: BrandMetric) => onMostrar({ titulo: `Tareas de ${m.nombre}`, criterio: { tipo: 'marca', id: m.id } });
  return (
    <Card className="glass-card">
      <CardHeader className="pb-2 sm:pb-4"><div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /><CardTitle className="text-base sm:text-lg">Tareas por Marca</CardTitle>
      </div></CardHeader>
      <CardContent className="px-2 sm:px-6">
        {!visibles.length ? <div className="text-center py-6 sm:py-8 text-muted-foreground">
          <Building2 className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 opacity-50" /><p className="text-sm">No hay tareas registradas</p>
        </div> : <>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={visibles} cx="50%" cy="50%" labelLine={false} outerRadius={80} dataKey="total" nameKey="nombre" cursor="pointer"
                label={({ nombre, total }: BrandMetric) => `${nombre.substring(0, 8)}${nombre.length > 8 ? '..' : ''}: ${total}`}
                onClick={(m: BrandMetric) => mostrar(m)}>
                {visibles.map((m, index) => <Cell key={m.id} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip content={({ active, payload }) => {
                const m = payload?.[0]?.payload as BrandMetric | undefined;
                return active && m ? <TooltipTareas titulo={m.nombre} grupos={[{ nombre: 'Tareas', tareas: seleccionarTareas(tareas, { tipo: 'marca', id: m.id }) }]} /> : null;
              }} />
            </PieChart>
          </ResponsiveContainer>
          <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer text-primary">Ver tareas por marca</summary>
            <div className="mt-2 flex flex-wrap gap-2">{visibles.map((m) => <button key={m.id} type="button" className="text-primary underline" onClick={() => mostrar(m)}>{m.nombre} ({m.total})</button>)}</div>
          </details>
        </>}
      </CardContent>
    </Card>
  );
}
