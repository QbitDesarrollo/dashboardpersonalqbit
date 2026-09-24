import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { Minuta, Punto } from '@/lib/minutasApi';
import { FilaPunto } from './FilaPunto';
import type { VistaPunto } from './PuntoDialog';

interface Props {
  minuta: Minuta;
  hoy: string;
  onAbrir: (puntoId: string, vista: VistaPunto) => void;
  /** New order of the point ids after a drag. */
  onReordenar: (ids: string[]) => void;
}

function FilaOrdenable({ minuta, p, hoy, onAbrir }: { minuta: Minuta; p: Punto; hoy: string; onAbrir: (vista: VistaPunto) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: p.id });
  const agarradera = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      aria-label={`Mover el punto ${minuta.numero}.${p.numero}`}
      title="Arrastra para cambiar el orden"
      className="mt-0.5 grid h-6 w-[18px] cursor-grab touch-none place-items-center rounded text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return (
    <FilaPunto
      minuta={minuta}
      p={p}
      hoy={hoy}
      onAbrir={onAbrir}
      arrastre={{ ref: setNodeRef, estilo: { transform: CSS.Transform.toString(transform), transition }, agarradera, arrastrando: isDragging }}
    />
  );
}

/** Points of a minuta; each can be dragged by its grip (or moved with the keyboard) to reorder them. */
export function ListaPuntos({ minuta, hoy, onAbrir, onReordenar }: Props) {
  const sensores = useSensors(
    // A few pixels before a drag starts, so clicks on the row buttons still work.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = minuta.items.map((p) => p.id);

  const alSoltar = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReordenar(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  return (
    <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={alSoltar}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul>
          {minuta.items.map((p) => (
            <FilaOrdenable key={p.id} minuta={minuta} p={p} hoy={hoy} onAbrir={(vista) => onAbrir(p.id, vista)} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
