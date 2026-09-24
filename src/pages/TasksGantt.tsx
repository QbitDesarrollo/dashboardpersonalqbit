import { useEffect, useState, useMemo } from 'react';
import * as api from '@/lib/apiClient';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  format,
  addWeeks,
  differenceInDays,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { LayoutGrid, Loader2, User } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Task {
  id: string;
  titulo_tarea: string;
  estado: string;
  prioridad: 'alta' | 'media' | 'baja';
  fecha_inicio: string | null;
  fecha_entrega: string;
  brands?: { nombre: string };
  profiles?: { nombre: string };
  brand_id: string;
  desk_id?: string | null;
}

const ROW_HEIGHT = 44;
const DAY_PX = 28;
const HEADER_HEIGHT = 56;

export default function TasksGantt() {
  const { pinnedBrandId, pinnedDeskId } = useGlobalFilter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [rangeMonths, setRangeMonths] = useState(3);
  const [today] = useState(new Date());

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
      setPrimeraCarga(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const filteredTasks = useMemo(() => {
    let list = tasks.filter((t) => t.fecha_entrega);
    if (pinnedBrandId) list = list.filter((t) => t.brand_id === pinnedBrandId);
    if (pinnedDeskId) list = list.filter((t) => t.desk_id === pinnedDeskId);
    return list.sort((a, b) => {
      const da = a.fecha_inicio ? parseISO(a.fecha_inicio) : parseISO(a.fecha_entrega);
      const db = b.fecha_inicio ? parseISO(b.fecha_inicio) : parseISO(b.fecha_entrega);
      return da.getTime() - db.getTime();
    });
  }, [tasks, pinnedBrandId, pinnedDeskId]);

  const { start, end, days } = useMemo(() => {
    const start = startOfMonth(today);
    const end = endOfMonth(addWeeks(today, rangeMonths * 4));
    const days = eachDayOfInterval({ start, end });
    return { start, end, days };
  }, [today, rangeMonths]);

  const getTaskBar = (task: Task) => {
    const startDate = task.fecha_inicio
      ? parseISO(task.fecha_inicio)
      : parseISO(task.fecha_entrega);
    const endDate = parseISO(task.fecha_entrega);
    const leftDays = differenceInDays(startDate, start);
    const spanDays = Math.max(1, differenceInDays(endDate, startDate) + 1);
    const left = Math.max(0, leftDays * DAY_PX);
    const width = spanDays * DAY_PX;
    return { left, width, startDate, endDate };
  };

  const priorityColor = (p: string) =>
    p === 'alta' ? 'bg-priority-high' : p === 'media' ? 'bg-priority-medium' : 'bg-priority-low';

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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Cronograma (Gantt)</h2>
          <p className="text-sm text-muted-foreground">
            Vista temporal de tareas por fechas de inicio y entrega
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
          <Button
            variant={rangeMonths === 2 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setRangeMonths(2)}
          >
            2 meses
          </Button>
          <Button
            variant={rangeMonths === 3 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setRangeMonths(3)}
          >
            3 meses
          </Button>
          <Button
            variant={rangeMonths === 6 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setRangeMonths(6)}
          >
            6 meses
          </Button>
          <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-muted/50">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tareas" className="flex items-center gap-1.5">
                <LayoutGrid className="h-4 w-4" />
                Lista
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tareas/kanban">Tablero</Link>
            </Button>
            <Button variant="default" size="sm" className="pointer-events-none">Cronograma</Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tareas/calendario">Calendario</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tareas/workload">Carga</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tareas/tiempo">Tiempo</Link>
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-hidden">
          <ScrollArea className="w-full overflow-x-auto">
            <div className="min-w-max" style={{ touchAction: 'pan-x' }}>
              {/* Header: days */}
              <div
                className="flex border-b bg-muted/40 sticky top-0 z-10"
                style={{ height: HEADER_HEIGHT }}
              >
                <div
                  className="flex-shrink-0 border-r px-3 flex items-center font-medium text-sm w-48 sm:w-64"
                  style={{ height: HEADER_HEIGHT }}
                >
                  Tarea / Fecha
                </div>
                <div className="flex" style={{ width: days.length * DAY_PX }}>
                  {days.map((day) => (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        'flex-shrink-0 border-r text-center text-xs',
                        isSameMonth(day, today) ? 'text-foreground bg-muted/30' : 'text-muted-foreground'
                      )}
                      style={{ width: DAY_PX, minWidth: DAY_PX }}
                    >
                      {format(day, 'd')}
                    </div>
                  ))}
                </div>
              </div>

              {/* Rows: task name + bar */}
              {filteredTasks.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  No hay tareas con fecha en el rango
                </div>
              ) : (
                filteredTasks.map((task, index) => {
                  const bar = getTaskBar(task);
                  return (
                    <div
                      key={task.id}
                      className="flex border-b last:border-b-0 hover:bg-muted/20"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <div
                        className="flex-shrink-0 border-r px-3 flex items-center gap-2 w-48 sm:w-64"
                        style={{ height: ROW_HEIGHT }}
                      >
                        <Link
                          to={`/tareas?task=${task.id}`}
                          className="font-medium text-sm hover:underline truncate flex-1"
                        >
                          {task.titulo_tarea}
                        </Link>
                        <Badge className={cn('text-xs flex-shrink-0', priorityColor(task.prioridad))}>
                          {task.prioridad}
                        </Badge>
                      </div>
                      <div
                        className="relative flex-shrink-0"
                        style={{ width: days.length * DAY_PX, height: ROW_HEIGHT }}
                      >
                        <div
                          className={cn(
                            'absolute top-2 h-6 rounded-md flex items-center px-2 text-xs font-medium text-white truncate',
                            priorityColor(task.prioridad)
                          )}
                          style={{
                            left: bar.left,
                            width: Math.max(bar.width, 40),
                            minWidth: 40,
                          }}
                          title={`${format(bar.startDate, 'd MMM yyyy', { locale: es })} - ${format(bar.endDate, 'd MMM yyyy', { locale: es })}`}
                        >
                          {task.profiles?.nombre && (
                            <User className="h-3 w-3 mr-1 flex-shrink-0" />
                          )}
                          {format(bar.startDate, 'd/M')} - {format(bar.endDate, 'd/M')}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
