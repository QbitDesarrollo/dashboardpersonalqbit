import { useEffect, useState, useMemo } from 'react';
import * as api from '@/lib/apiClient';
import type { Department } from '@/lib/apiClient';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Loader2, Workflow, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { cn, getInitials, formatDateSafe } from '@/lib/utils';
import { HandoffDialog } from '@/components/tasks/HandoffDialog';

interface PipelineTask {
  id: string;
  titulo_tarea: string;
  brand_id: string;
  desk_id: string | null;
  department_id: string | null;
  department_nombre?: string | null;
  department_color?: string | null;
  estado: string;
  prioridad: string;
  fecha_entrega: string | null;
  brands?: { nombre: string } | null;
  responsables?: { user_id: string; nombre: string; avatar_url?: string | null }[];
}

const PRIORITY_COLORS: Record<string, string> = {
  alta: 'bg-red-100 text-red-700 border-red-200',
  media: 'bg-amber-100 text-amber-700 border-amber-200',
  baja: 'bg-slate-100 text-slate-600 border-slate-200',
};

// Estados que se consideran "cerrados" — no aparecen en el pipeline de trabajo activo.
const CLOSED_STATES = new Set(['entregado']);

function PipelineCardContent({ task, isDragOverlay }: { task: PipelineTask; isDragOverlay?: boolean }) {
  return (
    <Card className={cn('w-[260px] shrink-0', isDragOverlay && 'shadow-lg rotate-1')}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug line-clamp-2">{task.titulo_tarea}</p>
          <Badge variant="outline" className={cn('text-[9px] shrink-0', PRIORITY_COLORS[task.prioridad] || '')}>
            {task.prioridad.toUpperCase()}
          </Badge>
        </div>
        {task.brands?.nombre && (
          <p className="text-xs text-muted-foreground truncate">{task.brands.nombre}</p>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex -space-x-1.5">
            {(task.responsables || []).slice(0, 3).map((r) => (
              <Avatar key={r.user_id} className="h-5 w-5 border border-background">
                {r.avatar_url && <AvatarImage src={r.avatar_url} />}
                <AvatarFallback className="text-[8px]">{getInitials(r.nombre || '?')}</AvatarFallback>
              </Avatar>
            ))}
          </div>
          {task.fecha_entrega && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDateSafe(task.fecha_entrega)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PipelineCard({ task }: { task: PipelineTask }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
      <PipelineCardContent task={task} />
    </div>
  );
}

function DroppableColumn({ dept, tasks }: { dept: Department; tasks: PipelineTask[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `dept-${dept.id}` });
  const color = dept.color || '#94a3b8';
  return (
    <div className="flex-shrink-0 w-[284px]">
      <div
        className="flex items-center justify-between px-3 py-2 rounded-t-lg border-b-2"
        style={{ borderColor: color }}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          {dept.nombre}
        </span>
        <Badge variant="secondary" className="text-[10px]">{tasks.length}</Badge>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'min-h-[200px] p-2 space-y-2 rounded-b-lg bg-muted/20 transition-colors',
          isOver && 'bg-primary/10 ring-2 ring-primary/40'
        )}
      >
        {tasks.map((t) => <PipelineCard key={t.id} task={t} />)}
        {tasks.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">Sin tareas</p>
        )}
      </div>
    </div>
  );
}

export default function PipelineBoard() {
  const { pinnedDeskId, pinnedBrandId } = useGlobalFilter();
  const [tasks, setTasks] = useState<PipelineTask[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<{ id: string; nombre: string; avatar_url?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Handoff dialog state cuando se arrastra a una columna
  const [handoffTask, setHandoffTask] = useState<PipelineTask | null>(null);
  const [handoffToDept, setHandoffToDept] = useState<string | null>(null);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [tasksRes, depts, profs] = await Promise.all([
        api.getTasks({ limit: 500 }),
        api.getDepartments(),
        api.getProfiles(),
      ]);
      setTasks((tasksRes.tasks || []) as unknown as PipelineTask[]);
      setDepartments((depts || []).filter((d) => d.activo));
      setUsers(Array.isArray(profs) ? profs as any : []);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar el pipeline');
    } finally {
      setLoading(false);
      setPrimeraCarga(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const tasksByDept = useMemo(() => {
    let list = tasks.filter((t) => !CLOSED_STATES.has(t.estado));
    if (pinnedBrandId) list = list.filter((t) => t.brand_id === pinnedBrandId);
    if (pinnedDeskId) list = list.filter((t) => t.desk_id === pinnedDeskId);
    const map: Record<string, PipelineTask[]> = {};
    for (const d of departments) map[d.id] = [];
    const sinDept: PipelineTask[] = [];
    for (const t of list) {
      if (t.department_id && map[t.department_id]) map[t.department_id].push(t);
      else sinDept.push(t);
    }
    return { map, sinDept };
  }, [tasks, departments, pinnedBrandId, pinnedDeskId]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const taskId = e.active.id as string;
    const over = e.over;
    if (!over?.id) return;
    const overStr = String(over.id);
    if (!overStr.startsWith('dept-')) return;
    const toDeptId = overStr.slice('dept-'.length);
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.department_id === toDeptId) return;
    // Abrir el dialog de handoff pre-cargado con la columna destino
    setHandoffTask(task);
    setHandoffToDept(toDeptId);
  };

  // Solo la PRIMERA carga reemplaza la pantalla. Con `loading` a secas, cada
  // recarga (buscar, filtrar, paginar) desmontaba la pagina entera: se perdia
  // el foco del input y los dialogos abiertos se cerraban solos.
  if (loading && primeraCarga) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Workflow className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Pipeline por departamento</h1>
          <p className="text-sm text-muted-foreground">
            Arrastra una tarea a otra columna para pasarla de etapa. Te va a pedir el responsable a cargo.
          </p>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)}
        onDragEnd={handleDragEnd}
      >
        <ScrollArea className="w-full whitespace-nowrap pb-4">
          <div className="flex gap-3" style={{ touchAction: 'pan-x' }}>
            {departments.map((d) => (
              <DroppableColumn key={d.id} dept={d} tasks={tasksByDept.map[d.id] || []} />
            ))}
            {tasksByDept.sinDept.length > 0 && (
              <div className="flex-shrink-0 w-[284px]">
                <div className="flex items-center justify-between px-3 py-2 rounded-t-lg border-b-2 border-muted-foreground/30">
                  <span className="text-sm font-semibold text-muted-foreground">Sin departamento</span>
                  <Badge variant="secondary" className="text-[10px]">{tasksByDept.sinDept.length}</Badge>
                </div>
                <div className="min-h-[200px] p-2 space-y-2 rounded-b-lg bg-muted/20">
                  {tasksByDept.sinDept.map((t) => <PipelineCard key={t.id} task={t} />)}
                </div>
              </div>
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <DragOverlay dropAnimation={null}>
          {activeId ? (() => {
            const t = tasks.find((x) => x.id === activeId);
            return t ? <PipelineCardContent task={t} isDragOverlay /> : null;
          })() : null}
        </DragOverlay>
      </DndContext>

      <HandoffDialog
        open={!!handoffTask}
        onClose={() => { setHandoffTask(null); setHandoffToDept(null); }}
        task={handoffTask as any}
        users={users}
        initialToDeptId={handoffToDept}
        onDone={() => { fetchAll(); }}
      />
    </div>
  );
}
