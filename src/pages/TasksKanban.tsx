import { useEffect, useState, useMemo } from 'react';
import * as api from '@/lib/apiClient';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { cn, getInitials, formatDateSafe } from '@/lib/utils';
import {
  LayoutGrid,
  Calendar,
  User,
  GripVertical,
  Loader2,
  Link as LinkIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export type TaskStatus =
  | 'backlog'
  | 'en_proceso'
  | 'en_revision'
  | 'aprobado'
  | 'entregado'
  | 'bloqueado';

const STATUS_ORDER: TaskStatus[] = [
  'backlog',
  'en_proceso',
  'en_revision',
  'aprobado',
  'entregado',
  'bloqueado',
];

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  en_proceso: 'En proceso',
  en_revision: 'En revisión',
  aprobado: 'Aprobado',
  entregado: 'Entregado',
  bloqueado: 'Bloqueado',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: 'border-l-status-backlog',
  en_proceso: 'border-l-status-in-progress',
  en_revision: 'border-l-status-in-review',
  aprobado: 'border-l-status-approved',
  entregado: 'border-l-status-delivered',
  bloqueado: 'border-l-status-blocked',
};

interface Task {
  id: string;
  titulo_tarea: string;
  estado: TaskStatus;
  prioridad: 'alta' | 'media' | 'baja';
  fecha_entrega: string;
  fecha_inicio: string | null;
  brands?: { nombre: string };
  profiles?: { nombre: string; avatar_url?: string | null };
  desk_id?: string | null;
  brand_id: string;
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
      data-column={status}
      className={cn(
        'flex-shrink-0 w-64 sm:w-72 rounded-lg border bg-muted/30 flex flex-col min-h-[280px] sm:min-h-[300px]',
        isOver && 'ring-2 ring-primary bg-muted/50'
      )}
    >
      <div className="p-3 border-b flex items-center justify-between">
        <span className="font-medium text-sm">{STATUS_LABELS[status]}</span>
        <Badge variant="secondary" className="text-xs">
          {tasks.length}
        </Badge>
      </div>
      <ScrollArea className="flex-1 min-h-[200px] p-2">
        <div className="space-y-2">
          {tasks.map((task) => (
            <KanbanCard key={task.id} task={task} />
          ))}
        </div>
        <ScrollBar orientation="vertical" />
      </ScrollArea>
    </div>
  );
}

function KanbanCardContent({
  task,
  isDragOverlay,
  dragRef,
  dragListeners,
}: {
  task: Task;
  isDragOverlay?: boolean;
  dragRef?: (el: HTMLDivElement | null) => void;
  dragListeners?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const priorityColor =
    task.prioridad === 'alta'
      ? 'bg-priority-high text-white'
      : task.prioridad === 'media'
        ? 'bg-priority-medium text-black'
        : 'bg-priority-low text-white';

  return (
    <div
      ref={dragRef}
      {...dragListeners}
      className={cn(
        'rounded-lg border bg-card p-3 shadow-sm transition-shadow',
        STATUS_COLORS[task.estado],
        'border-l-4',
        isDragOverlay && 'shadow-lg rotate-1',
        !isDragOverlay && 'cursor-grab active:cursor-grabbing'
      )}
    >
      <div className="flex items-start gap-2">
        {!isDragOverlay && (
          <div className="text-muted-foreground mt-0.5 pointer-events-none">
            <GripVertical className="h-4 w-4" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <Link
            to={`/tareas?task=${task.id}`}
            className="font-medium text-sm hover:underline line-clamp-2 block"
            onClick={(e) => isDragOverlay && e.preventDefault()}
          >
            {task.titulo_tarea}
          </Link>
          <div className="flex flex-wrap gap-1 mt-2">
            <Badge className={cn('text-xs', priorityColor)}>{task.prioridad}</Badge>
            {task.brands?.nombre && (
              <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                {task.brands.nombre}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            {task.fecha_entrega && (
              <span className="flex items-center gap-0.5">
                <Calendar className="h-3 w-3" />
                {formatDateSafe(task.fecha_entrega)}
              </span>
            )}
            {task.profiles?.nombre && (
              <span className="flex items-center gap-1">
                <Avatar className="h-4 w-4">
                  {task.profiles.avatar_url ? <AvatarImage src={task.profiles.avatar_url} alt={task.profiles.nombre} className="object-cover" /> : null}
                  <AvatarFallback className="bg-primary/20 text-primary text-[7px]">{getInitials(task.profiles.nombre)}</AvatarFallback>
                </Avatar>
                {task.profiles.nombre}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KanbanCard({ task, isDragOverlay }: { task: Task; isDragOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: task.id,
    data: { task },
  });
  if (isDragOverlay) {
    return <KanbanCardContent task={task} isDragOverlay />;
  }
  return (
    <KanbanCardContent
      task={task}
      dragRef={setNodeRef}
      dragListeners={{ ...attributes, ...listeners }}
    />
  );
}

function DroppableColumn({
  status,
  tasks,
  activeId,
}: {
  status: TaskStatus;
  tasks: Task[];
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
  });
  return (
    <KanbanColumn
      status={status}
      tasks={tasks}
      isOver={isOver}
      setNodeRef={setNodeRef}
    />
  );
}

export default function TasksKanban() {
  const { pinnedDeskId, pinnedBrandId } = useGlobalFilter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const res = await api.getTasks({ limit: 500 });
      setTasks((res.tasks || []) as Task[]);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar tareas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const tasksByStatus = useMemo(() => {
    let list = tasks;
    if (pinnedBrandId) list = list.filter((t) => t.brand_id === pinnedBrandId);
    if (pinnedDeskId) list = list.filter((t) => t.desk_id === pinnedDeskId);
    const map: Record<TaskStatus, Task[]> = {
      backlog: [],
      en_proceso: [],
      en_revision: [],
      aprobado: [],
      entregado: [],
      bloqueado: [],
    };
    list.forEach((t) => {
      if (map[t.estado]) map[t.estado].push(t);
    });
    return map;
  }, [tasks, pinnedBrandId, pinnedDeskId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const taskId = e.active.id as string;
    const over = e.over;
    if (!over?.id) return;
    const overStr = String(over.id);
    let newStatus: TaskStatus | null = null;
    if (overStr.startsWith('column-')) {
      newStatus = overStr.replace('column-', '') as TaskStatus;
    } else {
      const overTask = tasks.find((t) => t.id === overStr);
      if (overTask) newStatus = overTask.estado;
    }
    if (!newStatus || !STATUS_ORDER.includes(newStatus)) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.estado === newStatus) return;
    setMoving(true);
    try {
      await api.patchTask(taskId, { estado: newStatus });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, estado: newStatus } : t))
      );
      toast.success('Estado actualizado');
    } catch (err) {
      toast.error('Error al actualizar estado');
    } finally {
      setMoving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Tablero Kanban</h2>
          <p className="text-sm text-muted-foreground">
            Arrastra las tarjetas entre columnas para cambiar el estado
          </p>
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/tareas" className="flex items-center gap-1.5">
              <LayoutGrid className="h-4 w-4" />
              Lista
            </Link>
          </Button>
          <Button variant="default" size="sm" className="pointer-events-none">
            Tablero
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/tareas/gantt" className="flex items-center gap-1.5">Cronograma</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/tareas/calendario" className="flex items-center gap-1.5">Calendario</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/tareas/workload" className="flex items-center gap-1.5">Carga</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/tareas/tiempo">Tiempo</Link>
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <ScrollArea className="w-full whitespace-nowrap -mx-3 sm:mx-0 px-3 sm:px-0">
          <div className="flex gap-4 pb-4">
            {STATUS_ORDER.map((status) => (
              <div
                key={status}
                id={`column-${status}`}
                data-droppable
                className="flex-shrink-0"
              >
                <DroppableColumn
                  status={status}
                  tasks={tasksByStatus[status]}
                  activeId={activeId}
                />
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <DragOverlay dropAnimation={null}>
          {activeId ? (() => {
            const task = tasks.find((t) => t.id === activeId);
            return task ? <KanbanCard task={task} isDragOverlay /> : null;
          })() : null}
        </DragOverlay>
      </DndContext>

      {moving && (
        <div className="fixed inset-0 bg-background/50 flex items-center justify-center z-50">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
