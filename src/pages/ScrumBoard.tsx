import { useEffect, useState, useMemo } from 'react';
import * as api from '@/lib/apiClient';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { cn, formatDateSafe } from '@/lib/utils';
import { ArrowLeft, Calendar, User, GripVertical, Loader2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

type TaskStatus = 'backlog' | 'en_proceso' | 'en_revision' | 'aprobado' | 'entregado' | 'bloqueado';

const STATUS_ORDER: TaskStatus[] = ['backlog', 'en_proceso', 'en_revision', 'aprobado', 'entregado', 'bloqueado'];
const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog', en_proceso: 'En proceso', en_revision: 'En revisión',
  aprobado: 'Aprobado', entregado: 'Entregado', bloqueado: 'Bloqueado',
};
const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: 'border-l-status-backlog', en_proceso: 'border-l-status-in-progress',
  en_revision: 'border-l-status-in-review', aprobado: 'border-l-status-approved',
  entregado: 'border-l-status-delivered', bloqueado: 'border-l-status-blocked',
};

interface Task {
  id: string;
  titulo_tarea: string;
  estado: TaskStatus;
  prioridad: 'alta' | 'media' | 'baja';
  fecha_entrega: string;
  fecha_inicio: string | null;
  brands?: { nombre: string };
  profiles?: { nombre: string };
  brand_id: string;
  story_points?: number | null;
}

interface Sprint {
  id: string;
  name: string;
  goal: string | null;
  start_date: string;
  end_date: string;
  status: string;
}

function KanbanColumn({
  status,
  tasks,
  isOver,
  setNodeRef,
}: {
  status: TaskStatus;
  tasks: Task[];
  isOver?: boolean;
  setNodeRef?: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 w-64 sm:w-72 rounded-lg border bg-muted/30 flex flex-col min-h-[280px] sm:min-h-[300px]',
        isOver && 'ring-2 ring-primary bg-muted/50'
      )}
    >
      <div className="p-3 border-b flex items-center justify-between">
        <span className="font-medium text-sm">{STATUS_LABELS[status]}</span>
        <Badge variant="secondary" className="text-xs">{tasks.length}</Badge>
      </div>
      <ScrollArea className="flex-1 min-h-[200px] p-2">
        <div className="space-y-2">
          {tasks.map((task) => (
            <SprintKanbanCard key={task.id} task={task} />
          ))}
        </div>
        <ScrollBar orientation="vertical" />
      </ScrollArea>
    </div>
  );
}

function SprintKanbanCardContent({ task, dragRef, dragListeners }: { task: Task; dragRef?: (el: HTMLDivElement | null) => void; dragListeners?: React.HTMLAttributes<HTMLDivElement> }) {
  const priorityColor = task.prioridad === 'alta' ? 'bg-priority-high text-white' : task.prioridad === 'media' ? 'bg-priority-medium text-black' : 'bg-priority-low text-white';
  return (
    <div
      ref={dragRef}
      {...dragListeners}
      className={cn(
        'rounded-lg border bg-card p-3 shadow-sm border-l-4',
        STATUS_COLORS[task.estado],
        dragListeners && 'cursor-grab active:cursor-grabbing'
      )}
    >
      <div className="flex items-start gap-2">
        {dragListeners && <div className="text-muted-foreground mt-0.5 pointer-events-none"><GripVertical className="h-4 w-4" /></div>}
        <div className="flex-1 min-w-0">
          <Link to={`/tareas?task=${task.id}`} className="font-medium text-sm hover:underline line-clamp-2 block">
            {task.titulo_tarea}
          </Link>
          <div className="flex flex-wrap gap-1 mt-2">
            <Badge className={cn('text-xs', priorityColor)}>{task.prioridad}</Badge>
            {task.story_points != null && <span className="text-xs text-muted-foreground">{task.story_points} pts</span>}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            {task.fecha_entrega && <span className="flex items-center gap-0.5"><Calendar className="h-3 w-3" />{formatDateSafe(task.fecha_entrega)}</span>}
            {task.profiles?.nombre && <span className="flex items-center gap-0.5"><User className="h-3 w-3" />{task.profiles.nombre}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SprintKanbanCard({ task, isDragOverlay }: { task: Task; isDragOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id, data: { task } });
  if (isDragOverlay) return <SprintKanbanCardContent task={task} />;
  return <SprintKanbanCardContent task={task} dragRef={setNodeRef} dragListeners={{ ...attributes, ...listeners }} />;
}

function DroppableColumn({ status, tasks }: { status: TaskStatus; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${status}` });
  return <KanbanColumn status={status} tasks={tasks} isOver={isOver} setNodeRef={setNodeRef} />;
}

export default function ScrumBoard() {
  const [searchParams] = useSearchParams();
  const sprintId = searchParams.get('sprint');
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!sprintId) return;
    (async () => {
      try {
        setLoading(true);
        const [sprintsRes, settings] = await Promise.all([
          api.getSprints() as Promise<Sprint[]>,
          api.getSiteSettings().catch((): api.SiteSettings => ({})),
        ]);
        const scrumDeskId = settings?.scrum_desk_id || undefined;
        const tasksRes = await api.getTasks({ limit: 500, sprint_id: sprintId, desk_id: scrumDeskId });
        const list = Array.isArray(sprintsRes) ? sprintsRes : [];
        setSprint(list.find((s) => s.id === sprintId) || null);
        setTasks((tasksRes.tasks || []) as Task[]);
      } catch (e) {
        console.error(e);
        toast.error('Error al cargar sprint');
      } finally {
        setLoading(false);
        setPrimeraCarga(false);
      }
    })();
  }, [sprintId]);

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { backlog: [], en_proceso: [], en_revision: [], aprobado: [], entregado: [], bloqueado: [] };
    tasks.forEach((t) => { if (map[t.estado]) map[t.estado].push(t); });
    return map;
  }, [tasks]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);
  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const taskId = e.active.id as string;
    const over = e.over;
    if (!over?.id) return;
    const overStr = String(over.id);
    let newStatus: TaskStatus | null = overStr.startsWith('column-') ? (overStr.replace('column-', '') as TaskStatus) : (tasks.find((t) => t.id === overStr)?.estado ?? null);
    if (!newStatus || !STATUS_ORDER.includes(newStatus)) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.estado === newStatus) return;
    setMoving(true);
    try {
      await api.patchTask(taskId, { estado: newStatus });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, estado: newStatus } : t)));
      toast.success('Estado actualizado');
    } catch { toast.error('Error al actualizar'); } finally { setMoving(false); }
  };

  if (!sprintId) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" asChild><Link to="/scrum"><ArrowLeft className="h-4 w-4 mr-2" />Scrum</Link></Button>
        <p className="text-muted-foreground">Selecciona un sprint desde Scrum.</p>
      </div>
    );
  }

  // Solo la PRIMERA carga reemplaza la pantalla. Con `loading` a secas, cada
  // recarga (buscar, filtrar, paginar) desmontaba la pagina entera: se perdia
  // el foco del input y los dialogos abiertos se cerraban solos.
  if (loading && primeraCarga) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in w-full overflow-hidden">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild><Link to="/scrum"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div>
            <h2 className="text-xl font-bold text-foreground">Tablero: {sprint?.name ?? 'Sprint'}</h2>
            <p className="text-sm text-muted-foreground">
              {sprint?.goal || 'Arrastra las tarjetas para cambiar el estado'}
              {sprint?.start_date && ` · ${new Date(sprint.start_date).toLocaleDateString('es')} – ${new Date(sprint.end_date).toLocaleDateString('es')}`}
            </p>
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <ScrollArea className="w-full whitespace-nowrap overflow-x-auto">
          <div className="flex gap-4 pb-4" style={{ touchAction: 'pan-x' }}>
            {STATUS_ORDER.map((status) => (
              <div key={status} className="flex-shrink-0">
                <DroppableColumn status={status} tasks={tasksByStatus[status]} />
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <DragOverlay dropAnimation={null}>
          {activeId ? (() => { const task = tasks.find((t) => t.id === activeId); return task ? <SprintKanbanCard task={task} isDragOverlay /> : null; })() : null}
        </DragOverlay>
      </DndContext>

      {moving && <div className="fixed inset-0 bg-background/50 flex items-center justify-center z-50"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
    </div>
  );
}
