import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, User } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ResponsableMetric, Task } from '@/lib/dashboardDatos';
import { seleccionarTareas, type MostrarTareas } from '@/lib/dashboardSeleccion';
import { TooltipTareas } from './TooltipTareas';

interface Props { responsableMetrics: ResponsableMetric[]; tareas: Task[]; onMostrar: MostrarTareas }
export function GraficoResponsables({ responsableMetrics, tareas, onMostrar }: Props) {
  const mostrar = (m: ResponsableMetric, grupo: 'completadas' | 'enProgreso') => onMostrar({
    titulo: `${m.nombre} · ${grupo === 'completadas' ? 'Completadas' : 'En progreso'}`,
    criterio: { tipo: 'responsable', id: m.id, grupo },
  });
  const visibles = responsableMetrics.slice(0, 5);
  return (
    <Card className="glass-card">
      <CardHeader className="pb-2 sm:pb-4"><div className="flex items-center gap-2">
        <Users className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /><CardTitle className="text-base sm:text-lg">Tareas por Responsable</CardTitle>
      </div></CardHeader>
      <CardContent className="px-2 sm:px-6">
        {!visibles.length ? <div className="text-center py-6 sm:py-8 text-muted-foreground">
          <User className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 opacity-50" /><p className="text-sm">No hay tareas asignadas</p>
        </div> : <>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={visibles} layout="vertical" margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" allowDecimals={false} stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
              <YAxis dataKey="nombre" type="category" width={70} stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }}
                tickFormatter={(value: string) => value.length > 10 ? value.substring(0, 10) + '...' : value} />
              <Tooltip content={({ active, payload }) => {
                const m = payload?.[0]?.payload as ResponsableMetric | undefined;
                return active && m ? <TooltipTareas titulo={m.nombre} grupos={[
                  { nombre: 'Completadas', tareas: seleccionarTareas(tareas, { tipo: 'responsable', id: m.id, grupo: 'completadas' }) },
                  { nombre: 'En progreso', tareas: seleccionarTareas(tareas, { tipo: 'responsable', id: m.id, grupo: 'enProgreso' }) },
                ]} /> : null;
              }} />
              <Bar dataKey="completadas" fill="hsl(var(--success))" name="completadas" stackId="a" cursor="pointer"
                onClick={(dato: { payload: ResponsableMetric }) => mostrar(dato.payload, 'completadas')} />
              <Bar dataKey="enProgreso" fill="hsl(var(--info))" name="enProgreso" stackId="a" cursor="pointer"
                onClick={(dato: { payload: ResponsableMetric }) => mostrar(dato.payload, 'enProgreso')} />
            </BarChart>
          </ResponsiveContainer>
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer text-primary">Ver tareas por responsable</summary>
            <div className="mt-2 grid gap-2">
              {visibles.map((m) => <div key={m.id} className="flex flex-wrap gap-2">
                <span>{m.nombre}:</span>
                <button type="button" className="text-primary underline" onClick={() => mostrar(m, 'completadas')}>Completadas ({m.completadas})</button>
                <button type="button" className="text-primary underline" onClick={() => mostrar(m, 'enProgreso')}>En progreso ({m.enProgreso})</button>
              </div>)}
            </div>
          </details>
        </>}
      </CardContent>
    </Card>
  );
}
