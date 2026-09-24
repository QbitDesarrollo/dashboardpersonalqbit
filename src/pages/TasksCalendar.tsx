import { useEffect, useState, useMemo } from 'react';
import * as api from '@/lib/apiClient';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { LayoutGrid, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Task {
  id: string;
  titulo_tarea: string;
  estado: string;
  prioridad: 'alta' | 'media' | 'baja';
  fecha_inicio: string | null;
  fecha_entrega: string;
  brands?: { nombre: string };
  brand_id: string;
  desk_id?: string | null;
}

export default function TasksCalendar() {
  const { pinnedBrandId, pinnedDeskId } = useGlobalFilter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

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
    return list;
  }, [tasks, pinnedBrandId, pinnedDeskId]);

  const { calendarStart, calendarEnd, days } = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const dayList = eachDayOfInterval({ start: calStart, end: calEnd });
    return { calendarStart: calStart, calendarEnd: calEnd, days: dayList };
  }, [currentMonth]);

  const getTasksForDay = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return filteredTasks.filter((task) => {
      const startRaw = task.fecha_inicio || task.fecha_entrega;
      const endRaw = task.fecha_entrega;
      const startStr = startRaw.length > 10 ? startRaw.substring(0, 10) : startRaw;
      const endStr = endRaw.length > 10 ? endRaw.substring(0, 10) : endRaw;
      return dayStr >= startStr && dayStr <= endStr;
    });
  };

  const priorityColor = (p: string) =>
    p === 'alta' ? 'bg-priority-high' : p === 'media' ? 'bg-priority-medium' : 'bg-priority-low';

  const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

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
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Calendario</h2>
          <p className="text-sm text-muted-foreground">Vista mensual de tareas por fechas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="min-w-[180px] text-center font-semibold text-foreground">
            {format(currentMonth, 'MMMM yyyy', { locale: es })}
          </h3>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
            Hoy
          </Button>
          <div className="flex gap-1 p-1 rounded-lg bg-muted/50 ml-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tareas" className="flex items-center gap-1.5">
                <LayoutGrid className="h-4 w-4" />
                Lista
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tareas/kanban">Tablero</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tareas/gantt">Cronograma</Link>
            </Button>
            <Button variant="default" size="sm" className="pointer-events-none">Calendario</Button>
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
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b">
            {weekDays.map((d) => (
              <div
                key={d}
                className="border-r last:border-r-0 px-2 py-3 text-center text-xs font-medium text-muted-foreground bg-muted/30"
              >
                {d}
              </div>
            ))}
          </div>
          <div
            className="grid grid-cols-7 auto-rows-fr"
            style={{ minHeight: 420 }}
          >
            {days.map((day) => {
              const dayTasks = getTasksForDay(day);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'border-r border-b last:border-r-0 p-2 min-h-[80px] flex flex-col',
                    !isSameMonth(day, currentMonth) && 'bg-muted/20',
                    isToday(day) && 'bg-primary/5'
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex items-center justify-center text-sm font-medium mb-1.5 w-7 h-7',
                      isToday(day) ? 'bg-primary text-primary-foreground rounded-full' : 'text-foreground'
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  <div className="flex-1 overflow-y-auto space-y-1">
                    {dayTasks.slice(0, 4).map((task) => (
                      <Link
                        key={task.id}
                        to={`/tareas?task=${task.id}`}
                        className={cn(
                          'block text-xs px-2 py-1 rounded truncate hover:opacity-90 transition-opacity',
                          priorityColor(task.prioridad),
                          'text-white'
                        )}
                        title={`${task.titulo_tarea} · ${task.brands?.nombre || ''}`}
                      >
                        {task.titulo_tarea}
                      </Link>
                    ))}
                    {dayTasks.length > 4 && (
                      <span className="text-xs text-muted-foreground px-1">+{dayTasks.length - 4} más</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
