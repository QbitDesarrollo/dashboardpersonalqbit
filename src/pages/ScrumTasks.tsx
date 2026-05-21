import { useEffect, useState, useMemo } from 'react';
import * as api from '@/lib/apiClient';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { cn, getInitials, formatDateSafe } from '@/lib/utils';
import {
  ArrowLeft,
  Loader2,
  User,
  Calendar,
  Search,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Zap,
  CheckCircle2,
  ListTodo,
  Target,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface Task {
  id: string;
  titulo_tarea: string;
  estado: string;
  prioridad: string;
  fecha_entrega: string;
  story_points: number | null;
  sprint_id: string | null;
  feature_id: string | null;
  check_done: boolean;
  responsable_user_id?: string | null;
  brands?: { nombre: string };
  profiles?: { nombre: string };
  responsables?: { user_id: string; nombre: string }[];
  feature?: { name: string } | null;
  sprint?: { name: string } | null;
}

interface Sprint {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
}

interface Feature {
  id: string;
  name: string;
}

const FIBONACCI = [1, 2, 3, 5, 8, 13];

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  en_proceso: 'En proceso',
  en_revision: 'En revisión',
  aprobado: 'Aprobado',
  entregado: 'Entregado',
  bloqueado: 'Bloqueado',
};

const STATUS_COLORS: Record<string, string> = {
  backlog: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  en_proceso: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  en_revision: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  aprobado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  entregado: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  bloqueado: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const PRIORITY_COLORS: Record<string, string> = {
  alta: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  media: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  baja: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
};

const SP_LEGEND = [
  { points: 1, effort: '~1-2 horas', example: 'Cambio de texto, fix CSS' },
  { points: 2, effort: '~medio dia (3-4h)', example: 'Componente simple, ajuste menor' },
  { points: 3, effort: '~1 dia', example: 'Feature pequena, integracion simple' },
  { points: 5, effort: '~2-3 dias', example: 'Feature mediana, varios componentes' },
  { points: 8, effort: '~1 semana', example: 'Feature compleja, multiples partes' },
  { points: 13, effort: '~2 semanas', example: 'Epica, requiere diseno + implementacion' },
];

export default function ScrumTasks() {
  const { pinnedBrandId } = useGlobalFilter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);

  const [filterSprint, setFilterSprint] = useState<string>('all');
  const [filterFeature, setFilterFeature] = useState<string>('all');
  const [filterResponsable, setFilterResponsable] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const settings = await api.getSiteSettings().catch(() => ({}));
      const scrumDeskId = settings?.scrum_desk_id || undefined;
      const opts: api.GetTasksOptions = { limit: 500, desk_id: scrumDeskId };
      if (filterSprint === 'backlog') {
        opts.backlog = true;
      } else if (filterSprint !== 'all') {
        opts.sprint_id = filterSprint;
      }

      const [tasksRes, sprintsRes, featuresRes] = await Promise.all([
        api.getTasks(opts),
        api.getSprints(pinnedBrandId || undefined) as Promise<Sprint[]>,
        api.getFeatures().catch(() => []) as Promise<Feature[]>,
      ]);
      setTasks((tasksRes.tasks || []) as Task[]);
      setSprints(Array.isArray(sprintsRes) ? sprintsRes : []);
      setFeatures(Array.isArray(featuresRes) ? featuresRes : []);
    } catch {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [pinnedBrandId, filterSprint]);

  const uniqueResponsables = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks) {
      if (t.responsables?.length) {
        for (const r of t.responsables) {
          if (r.user_id && r.nombre) map.set(r.user_id, r.nombre);
        }
      } else if (t.profiles?.nombre) {
        const uid = (t as any).responsable_user_id;
        if (uid) map.set(uid, t.profiles.nombre);
      }
    }
    return Array.from(map.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (filterFeature !== 'all') {
      if (filterFeature === 'none') {
        result = result.filter((t) => !t.feature_id);
      } else {
        result = result.filter((t) => t.feature_id === filterFeature);
      }
    }
    if (filterResponsable !== 'all') {
      if (filterResponsable === 'none') {
        result = result.filter(
          (t) => !t.responsables?.length && !t.profiles?.nombre
        );
      } else {
        result = result.filter((t) => {
          if (t.responsables?.length) {
            return t.responsables.some((r) => r.user_id === filterResponsable);
          }
          return (t as any).responsable_user_id === filterResponsable;
        });
      }
    }
    if (filterDateFrom) {
      result = result.filter((t) => {
        if (!t.fecha_entrega) return false;
        return (t.fecha_entrega || "").slice(0, 10) >= filterDateFrom;
      });
    }
    if (filterDateTo) {
      result = result.filter((t) => {
        if (!t.fecha_entrega) return false;
        return (t.fecha_entrega || "").slice(0, 10) <= filterDateTo;
      });
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (t) =>
          t.titulo_tarea.toLowerCase().includes(term) ||
          t.brands?.nombre?.toLowerCase().includes(term) ||
          t.profiles?.nombre?.toLowerCase().includes(term)
      );
    }
    return result;
  }, [tasks, filterFeature, filterResponsable, filterDateFrom, filterDateTo, searchTerm]);

  const totalPoints = filteredTasks.reduce((s, t) => s + (t.story_points ?? 0), 0);
  const completedTasks = filteredTasks.filter(
    (t) => ['entregado', 'aprobado'].includes(t.estado) || t.check_done
  );
  const completedPoints = completedTasks.reduce((s, t) => s + (t.story_points ?? 0), 0);

  const updateStoryPoints = async (taskId: string, points: number | null) => {
    try {
      await api.patchTask(taskId, { story_points: points });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, story_points: points } : t))
      );
    } catch {
      toast.error('Error al guardar puntos');
    }
  };

  const updateSprint = async (taskId: string, sprintId: string | null) => {
    try {
      await api.patchTask(taskId, { sprint_id: sprintId });
      const sprintObj = sprintId ? sprints.find((s) => s.id === sprintId) : null;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, sprint_id: sprintId, sprint: sprintObj ? { name: sprintObj.name } : null }
            : t
        )
      );
      toast.success('Sprint actualizado');
    } catch {
      toast.error('Error al cambiar sprint');
    }
  };

  const updateFeature = async (taskId: string, featureId: string | null) => {
    try {
      await api.patchTask(taskId, { feature_id: featureId });
      const featureObj = featureId ? features.find((f) => f.id === featureId) : null;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, feature_id: featureId, feature: featureObj ? { name: featureObj.name } : null }
            : t
        )
      );
    } catch {
      toast.error('Error al cambiar feature');
    }
  };

  const updatePriority = async (taskId: string, prioridad: string) => {
    try {
      await api.patchTask(taskId, { prioridad });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, prioridad } : t))
      );
    } catch {
      toast.error('Error al cambiar prioridad');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/scrum">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-xl font-bold text-foreground">Scrum Tareas</h2>
            <p className="text-sm text-muted-foreground">
              Gestiona puntos, sprints y features de todas las tareas
            </p>
          </div>
        </div>
      </div>

      {/* Story Points Legend */}
      <Collapsible open={legendOpen} onOpenChange={setLegendOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="text-sm flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-primary" />
                Guia de Story Points (Fibonacci)
                {legendOpen ? (
                  <ChevronDown className="h-4 w-4 ml-auto" />
                ) : (
                  <ChevronRight className="h-4 w-4 ml-auto" />
                )}
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground mb-3">
                Los story points miden <strong>complejidad relativa</strong>, no horas exactas. Las
                horas son orientativas para calibrar al equipo. Usa la secuencia Fibonacci: 1, 2, 3,
                5, 8, 13.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {SP_LEGEND.map((item) => (
                  <div
                    key={item.points}
                    className="flex items-start gap-3 p-2.5 rounded-lg border bg-muted/30"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
                      {item.points}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{item.effort}</div>
                      <div className="text-xs text-muted-foreground">{item.example}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <ListTodo className="h-6 w-6 text-primary" />
            <div>
              <div className="text-lg font-bold">{filteredTasks.length}</div>
              <div className="text-xs text-muted-foreground">Tareas</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <Zap className="h-6 w-6 text-blue-500" />
            <div>
              <div className="text-lg font-bold">{totalPoints}</div>
              <div className="text-xs text-muted-foreground">Story Points</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            <div>
              <div className="text-lg font-bold">{completedTasks.length}</div>
              <div className="text-xs text-muted-foreground">Completadas</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <Target className="h-6 w-6 text-amber-500" />
            <div>
              <div className="text-lg font-bold">{completedPoints}</div>
              <div className="text-xs text-muted-foreground">Pts completados</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar tarea..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 w-48 text-sm"
              />
            </div>
            <Select value={filterSprint} onValueChange={setFilterSprint}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Sprint" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los sprints</SelectItem>
                <SelectItem value="backlog">Backlog (sin sprint)</SelectItem>
                {sprints.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}{' '}
                    {s.status === 'active'
                      ? '(Activo)'
                      : s.status === 'completed'
                        ? '(Completado)'
                        : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {uniqueResponsables.length > 0 && (
              <Select value={filterResponsable} onValueChange={setFilterResponsable}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <User className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Responsable" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los responsables</SelectItem>
                  <SelectItem value="none">Sin responsable</SelectItem>
                  {uniqueResponsables.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {features.length > 0 && (
              <Select value={filterFeature} onValueChange={setFilterFeature}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Feature" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los features</SelectItem>
                  <SelectItem value="none">Sin feature</SelectItem>
                  {features.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="h-8 w-[130px] text-xs"
                title="Fecha desde"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="h-8 w-[130px] text-xs"
                title="Fecha hasta"
              />
              {(filterDateFrom || filterDateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5"
                  onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); }}
                  title="Limpiar fechas"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <span className="ml-auto text-xs text-muted-foreground">
              {filteredTasks.length} tareas · {totalPoints} pts
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Task Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Tarea</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead className="text-center min-w-[200px]">Story Points</TableHead>
                  <TableHead className="min-w-[150px]">Sprint</TableHead>
                  <TableHead className="min-w-[140px]">Feature</TableHead>
                  <TableHead className="min-w-[100px]">Prioridad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Entrega</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No hay tareas con los filtros seleccionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTasks.map((task) => {
                    const isCompleted =
                      ['entregado', 'aprobado'].includes(task.estado) || task.check_done;
                    return (
                      <TableRow
                        key={task.id}
                        className={cn(isCompleted && 'opacity-60')}
                      >
                        {/* Task name */}
                        <TableCell>
                          <Link
                            to={`/tareas?task=${task.id}`}
                            className="text-sm font-medium hover:underline line-clamp-2"
                          >
                            {task.titulo_tarea}
                          </Link>
                        </TableCell>

                        {/* Brand */}
                        <TableCell className="text-xs text-muted-foreground">
                          {task.brands?.nombre || '—'}
                        </TableCell>

                        {/* Responsable */}
                        <TableCell>
                          {task.responsables && task.responsables.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              {task.responsables.map((r) => (
                                <span
                                  key={r.user_id}
                                  className="text-xs flex items-center gap-1"
                                >
                                  <Avatar className="h-3.5 w-3.5">
                                    {r.avatar_url ? <AvatarImage src={r.avatar_url} alt={r.nombre} className="object-cover" /> : null}
                                    <AvatarFallback className="bg-primary/20 text-primary text-[6px]">{getInitials(r.nombre)}</AvatarFallback>
                                  </Avatar>
                                  {r.nombre}
                                </span>
                              ))}
                            </div>
                          ) : task.profiles?.nombre ? (
                            <span className="text-xs flex items-center gap-1">
                              <Avatar className="h-3.5 w-3.5">
                                {task.profiles.avatar_url ? <AvatarImage src={task.profiles.avatar_url} alt={task.profiles.nombre} className="object-cover" /> : null}
                                <AvatarFallback className="bg-primary/20 text-primary text-[6px]">{getInitials(task.profiles.nombre)}</AvatarFallback>
                              </Avatar>
                              {task.profiles.nombre}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Story Points - Fibonacci buttons */}
                        <TableCell>
                          <div className="flex items-center gap-0.5 justify-center">
                            {FIBONACCI.map((pt) => (
                              <button
                                key={pt}
                                onClick={() =>
                                  updateStoryPoints(
                                    task.id,
                                    task.story_points === pt ? null : pt
                                  )
                                }
                                className={cn(
                                  'w-7 h-7 rounded-md text-xs font-bold transition-all border',
                                  task.story_points === pt
                                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                    : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:border-border'
                                )}
                              >
                                {pt}
                              </button>
                            ))}
                          </div>
                        </TableCell>

                        {/* Sprint */}
                        <TableCell>
                          <Select
                            value={task.sprint_id || 'none'}
                            onValueChange={(v) =>
                              updateSprint(task.id, v === 'none' ? null : v)
                            }
                          >
                            <SelectTrigger className="h-7 text-xs w-full">
                              <SelectValue placeholder="Sprint" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sin sprint</SelectItem>
                              {sprints.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>

                        {/* Feature */}
                        <TableCell>
                          <Select
                            value={task.feature_id || 'none'}
                            onValueChange={(v) =>
                              updateFeature(task.id, v === 'none' ? null : v)
                            }
                          >
                            <SelectTrigger className="h-7 text-xs w-full">
                              <SelectValue placeholder="Feature" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sin feature</SelectItem>
                              {features.map((f) => (
                                <SelectItem key={f.id} value={f.id}>
                                  {f.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>

                        {/* Priority */}
                        <TableCell>
                          <Select
                            value={task.prioridad}
                            onValueChange={(v) => updatePriority(task.id, v)}
                          >
                            <SelectTrigger
                              className={cn(
                                'h-7 text-xs font-semibold border-0 w-full',
                                PRIORITY_COLORS[task.prioridad]
                              )}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="alta">Alta</SelectItem>
                              <SelectItem value="media">Media</SelectItem>
                              <SelectItem value="baja">Baja</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <Badge
                            className={cn(
                              'text-[10px] font-semibold whitespace-nowrap',
                              STATUS_COLORS[task.estado]
                            )}
                          >
                            {STATUS_LABELS[task.estado] || task.estado}
                          </Badge>
                        </TableCell>

                        {/* Due date */}
                        <TableCell>
                          {task.fecha_entrega ? (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                              <Calendar className="h-3 w-3" />
                              {formatDateSafe(task.fecha_entrega)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
