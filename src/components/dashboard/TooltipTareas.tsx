import type { Task } from '@/lib/dashboardDatos';

/** Read-only preview; the chart/card click opens a scrollable list with every task. */
export function TooltipTareas({ titulo, grupos }: { titulo: string; grupos: { nombre: string; tareas: Task[] }[] }) {
  return (
    <div className="max-w-xs rounded-lg border bg-card p-3 text-xs text-card-foreground shadow-lg">
      <p className="font-semibold">{titulo}</p>
      {grupos.map((g) => (
        <div key={g.nombre} className="mt-2">
          <p className="font-medium">{g.nombre}: {g.tareas.length}</p>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            {g.tareas.slice(0, 3).map((t) => <li key={t.id} className="break-words">• {t.titulo_tarea}</li>)}
          </ul>
          {g.tareas.length > 3 && <p className="mt-1 text-muted-foreground">Y {g.tareas.length - 3} más.</p>}
        </div>
      ))}
      <p className="mt-2 text-primary">Haz clic para ver las tareas.</p>
    </div>
  );
}
