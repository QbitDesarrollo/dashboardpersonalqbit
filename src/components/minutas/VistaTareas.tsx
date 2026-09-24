import { useEffect, useState } from 'react';
import { Plus, Search, SquareCheck, X } from 'lucide-react';
import { desvincularTarea, vincularTarea, type Minuta, type Punto } from '@/lib/minutasApi';
import { getTasks } from '@/lib/apiClient';
import { toast } from 'sonner';
import { etiquetaTarea } from '@/lib/minutas';
import { prellenadoDesdePunto } from '@/lib/tareaDesdePunto';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TaskFormDialog } from '@/components/tasks/form/TaskFormDialog';
import { usePuntoAcciones } from './usePuntoAcciones';

interface Props {
  minuta: Minuta;
  punto: Punto;
  onActualizada: (minuta: Minuta) => void;
}

interface TareaEncontrada { id: string; titulo_tarea: string; estado: string }

/** Tareas del punto: las vinculadas, crear nuevas aquí mismo o vincular una existente de la misma marca. */
export function VistaTareas({ minuta, punto, onActualizada }: Props) {
  const { conError } = usePuntoAcciones(punto.id, onActualizada);
  const [busqueda, setBusqueda] = useState('');
  const [creando, setCreando] = useState(false);
  const [encontradas, setEncontradas] = useState<TareaEncontrada[]>([]);

  // The task already exists at this point; if linking fails it can still be linked from the search below.
  const vincularNueva = async ({ id }: { id: string }) => {
    try {
      onActualizada(await vincularTarea(punto.id, id));
      toast.success('Tarea vinculada al punto');
    } catch {
      toast.error('La tarea se creó, pero no se pudo vincular al punto. Búscala abajo para vincularla.');
    }
  };

  useEffect(() => {
    const texto = busqueda.trim();
    if (texto.length < 2) { setEncontradas([]); return; }
    let vigente = true;
    const t = setTimeout(() => {
      getTasks({ brand_id: minuta.brand_id, search: texto, limit: 8 })
        .then((r) => { if (vigente) setEncontradas(r.tasks as TareaEncontrada[]); })
        .catch(() => { if (vigente) setEncontradas([]); });
    }, 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [busqueda, minuta.brand_id]);

  return (
    <div className="space-y-4">
      {punto.tareas.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          Este punto todavía no tiene tareas. Si es algo rápido, ciérralo directo con evidencia.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {punto.tareas.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <SquareCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.titulo_tarea}</p>
                <p className="text-xs text-muted-foreground">
                  {etiquetaTarea(t.estado)}
                  {t.responsable && ` · ${t.responsable.nombre}`}
                  {t.fecha_entrega && ` · entrega ${t.fecha_entrega}`}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Desvincular ${t.titulo_tarea}`}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => conError(() => desvincularTarea(punto.id, t.id), 'No se pudo desvincular la tarea')}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setCreando(true)}>
          <Plus className="h-4 w-4" />Nueva tarea
        </Button>
        <span className="text-xs text-muted-foreground">Se crea con el formulario de Tareas, ya prellenado, y queda vinculada a este punto.</span>
      </div>
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={`Buscar una tarea de ${minuta.brand_nombre}`}
            className="pl-9"
            placeholder={`Vincular una tarea existente de ${minuta.brand_nombre}`}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        {encontradas.filter((t) => !punto.tareas.some((v) => v.id === t.id)).map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={`Vincular ${t.titulo_tarea}`}
            className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={async () => { if (await conError(() => vincularTarea(punto.id, t.id), 'No se pudo vincular la tarea')) setBusqueda(''); }}
          >
            <span className="truncate">{t.titulo_tarea}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{etiquetaTarea(t.estado)}</span>
          </button>
        ))}
      </div>
      <TaskFormDialog
        open={creando}
        onOpenChange={setCreando}
        prellenado={prellenadoDesdePunto(minuta, punto)}
        onGuardada={vincularNueva}
      />
    </div>
  );
}
