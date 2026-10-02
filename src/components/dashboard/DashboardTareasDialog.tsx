import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ArrowUpRight } from 'lucide-react';
import { formatTime, type Task } from '@/lib/dashboardDatos';
import { fechaCorta, getStatusLabel } from '@/lib/tareasLista';

interface Props { titulo: string; tareas: Task[]; onCerrar: () => void; onAbrir: (id: string) => void }
export function DashboardTareasDialog({ titulo, tareas, onCerrar, onAbrir }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const visibles = tareas.filter((t) => t.titulo_tarea.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es')));
  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto) onCerrar(); }}>
      <DialogContent className="max-w-2xl grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle className="pr-6 break-words">{titulo}</DialogTitle>
          <DialogDescription>{tareas.length} {tareas.length === 1 ? 'tarea' : 'tareas'} con los filtros actuales. Elige una para abrir su detalle.</DialogDescription>
        </DialogHeader>
        {tareas.length > 0 && <Input aria-label="Buscar en estas tareas" placeholder="Buscar una tarea…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />}
        {!visibles.length ? <p className="py-6 text-center text-sm text-muted-foreground">{tareas.length ? 'No hay tareas que coincidan con tu búsqueda.' : 'No hay tareas en este grupo.'}</p> : (
          <ul className="space-y-2">
            {visibles.map((t) => <li key={t.id}>
              <button type="button" aria-label={`Abrir ${t.titulo_tarea}`} onClick={() => onAbrir(t.id)}
                className="flex w-full min-w-0 items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium">{t.titulo_tarea}</p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">{[t.brands?.nombre, getStatusLabel(t.estado), t.fecha_entrega && fechaCorta(t.fecha_entrega)].filter(Boolean).join(' · ')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{Number(t.cantidad_entregables) || 0} entregables · {formatTime(Number(t.tiempo_trabajado) || 0)}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-primary" />
              </button>
            </li>)}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
