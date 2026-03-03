import { Badge } from '@/components/ui/badge';

const PRIORITY_COLORS: Record<string, string> = { alta: 'bg-red-500 text-white', media: 'bg-yellow-500 text-black', baja: 'bg-green-500 text-white' };

export function TasksDueThisWeek({ data }: { data: { id: string; titulo_tarea: string; fecha_entrega: string; estado: string; prioridad: string; brand_nombre?: string }[] }) {
  if (!data.length) return <div className="text-sm text-muted-foreground text-center py-4">Sin tareas esta semana</div>;
  return (
    <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
      {data.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-2 text-sm border-b border-border/50 pb-1.5">
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">{t.titulo_tarea}</div>
            <div className="text-xs text-muted-foreground">{t.brand_nombre || ''} · {new Date(t.fecha_entrega).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</div>
          </div>
          <Badge className={`text-[10px] shrink-0 ${PRIORITY_COLORS[t.prioridad] || ''}`}>{t.prioridad.toUpperCase()}</Badge>
        </div>
      ))}
    </div>
  );
}
