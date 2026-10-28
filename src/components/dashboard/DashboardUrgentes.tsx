import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { agruparUrgentes, textoVencimiento } from '@/lib/dashboardUrgentes';
import { ESTADOS_PROGRESO } from '@/lib/dashboardProgreso';
import type { Task } from '@/lib/dashboardDatos';
import { cn } from '@/lib/utils';

interface Props {
  tareas: Task[];
  personas: { id: string; nombre: string }[];
  isEquipo: boolean;
  onAbrir: (id: string) => void;
}
const prioridad: Record<string, string> = { alta: 'priority-high', media: 'priority-medium', baja: 'priority-low' };
export function DashboardUrgentes({ tareas, personas, isEquipo, onAbrir }: Props) {
  const [filtro, setFiltro] = useState<string | null>(null);
  const grupos = agruparUrgentes(tareas);
  const titulo = isEquipo ? 'Mis Tareas Urgentes' : 'Tareas Urgentes';
  const porId = new Map(tareas.map((t) => [t.id, t]));
  const nombres = new Map(personas.map((p) => [p.id, p.nombre]));
  const total = grupos.reduce((n, g) => n + g.tareas.length, 0);
  return (
    <Card role="region" aria-label={titulo} className="glass-card min-w-0">
      <CardHeader className="pb-2"><div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-warning" /><CardTitle className="text-base sm:text-lg">{titulo}</CardTitle>
        <span className="rounded-full bg-muted px-2 text-xs">{total}</span>
      </div></CardHeader>
      <CardContent>
        <div aria-label="Filtrar por urgencia" className="mb-3 flex gap-1 rounded-lg bg-muted p-1">
          {grupos.map((g) => <button key={g.nombre} type="button" aria-pressed={filtro === null || filtro === g.nombre}
            className={cn('flex-1 rounded px-1 py-1.5 text-xs focus-visible:ring-2 focus-visible:ring-primary', (filtro === null || filtro === g.nombre) && 'bg-card shadow-sm')}
            onClick={() => setFiltro(filtro === g.nombre ? null : g.nombre)}>{g.nombre} {g.tareas.length}</button>)}
        </div>
        <div className="max-h-[384px] overflow-y-auto">
          {grupos.filter((g) => filtro === null || filtro === g.nombre).map((g) => <section key={g.nombre} aria-label={g.nombre}>
            <h4 className="py-2 text-[10px] uppercase tracking-wider text-muted-foreground">{g.nombre}</h4>
            {!g.tareas.length ? <p className="py-3 text-xs text-muted-foreground">No hay tareas en este grupo</p> : g.tareas.map((t) => {
              const original = porId.get(t.id);
              const estado = ESTADOS_PROGRESO.find((s) => s.estado === t.estado);
              return <article key={t.id} className="group flex items-center gap-2 border-b border-l-[3px] px-2 py-2 hover:bg-muted/60 focus-within:bg-muted/60"
                style={{ borderLeftColor: `hsl(var(--${prioridad[t.prioridad] ?? 'muted-foreground'}))` }}>
                <div className="min-w-0 flex-1">
                  <button type="button" title={t.titulo_tarea} onClick={() => onAbrir(t.id)} className="block w-full truncate rounded text-left text-[13px] font-medium focus-visible:ring-2 focus-visible:ring-primary">{t.titulo_tarea}</button>
                  <p className="truncate text-[11px] text-muted-foreground">{[t.brand_name, original?.projects?.nombre].filter(Boolean).join(' · ')}</p>
                  {!isEquipo && <p className="truncate text-[10px] text-muted-foreground">{original?.profiles?.nombre ?? nombres.get(original?.responsable_user_id ?? '') ?? 'Sin asignar'}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full border bg-muted px-1.5 text-[10px]">{estado?.label ?? t.estado}</span>
                  <span className={cn('text-[10px]', t.dias_restantes < 0 ? 'text-destructive' : 'text-muted-foreground')}>{textoVencimiento(t.dias_restantes)}</span>
                </div>
                <button type="button" aria-label={`Abrir tarea · ${t.titulo_tarea}`} title={`Abrir tarea · ${t.titulo_tarea}`} onClick={() => onAbrir(t.id)}
                  className="shrink-0 rounded border p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:ring-2 focus-visible:ring-primary [@media(hover:none)]:opacity-100">
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </article>;
            })}
          </section>)}
        </div>
        <Link to="/tareas" className="mt-3 block border-t pt-3 text-xs underline focus-visible:ring-2 focus-visible:ring-primary">Ver todas mis tareas</Link>
      </CardContent>
    </Card>
  );
}
