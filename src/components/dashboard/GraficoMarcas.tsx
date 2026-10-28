import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2 } from 'lucide-react';
import type { BrandMetric } from '@/lib/dashboardDatos';
import { rankingMarcas, type MostrarTareas } from '@/lib/dashboardSeleccion';

interface Props { brandMetrics: BrandMetric[]; isEquipo?: boolean; onMostrar: MostrarTareas }
export function GraficoMarcas({ brandMetrics, isEquipo = false, onMostrar }: Props) {
  const { visibles, restantes } = rankingMarcas(brandMetrics);
  const mostrar = (m: BrandMetric) => onMostrar({ titulo: `${isEquipo ? 'Mis tareas' : 'Tareas'} de ${m.nombre}`, criterio: { tipo: 'marca', id: m.id } });
  return (
    <Card className="glass-card min-w-0">
      <CardHeader className="pb-2 sm:pb-4"><div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" /><CardTitle className="text-base sm:text-lg">{isEquipo ? 'Mis Tareas por Marca' : 'Tareas por Marca'}</CardTitle>
      </div></CardHeader>
      <CardContent>
        {!visibles.length ? <p className="py-8 text-center text-sm text-muted-foreground">No hay tareas registradas</p> : <>
          <div data-testid="marcas-barras" className="my-3 space-y-3">
            {visibles.map((m) => <button key={m.id} type="button" aria-label={`Ver tareas de ${m.nombre}`}
              onClick={() => mostrar(m)} className="grid w-full grid-cols-[minmax(0,125px)_minmax(0,1fr)] items-center gap-3 rounded text-left text-xs hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary">
              <span className="truncate" title={m.nombre}>{m.nombre}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="h-[18px] shrink-0 rounded bg-primary" style={{ width: `${m.total / visibles[0].total * 82}%` }} />
                <strong>{m.total}</strong>
              </span>
            </button>)}
          </div>
          <details className="mt-4 text-xs text-muted-foreground"><summary className="cursor-pointer text-primary focus-visible:ring-2 focus-visible:ring-primary">
            {restantes ? `+${restantes} marcas más · Ver todas` : 'Ver todas las marcas'}
          </summary>
            <div className="mt-3 flex flex-wrap gap-2">{[...brandMetrics].sort((a, b) => b.total - a.total).map((m) => <button key={m.id} type="button" className="rounded border px-2 py-1 text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`Ver tareas de ${m.nombre}`} onClick={() => mostrar(m)}>{m.nombre} ({m.total})</button>)}</div>
          </details>
        </>}
      </CardContent>
    </Card>
  );
}
