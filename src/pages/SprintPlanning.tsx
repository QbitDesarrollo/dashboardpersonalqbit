import { useEffect, useState, useMemo } from 'react';
import * as api from '@/lib/apiClient';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  Loader2,
  User,
  Calendar,
  Target,
  Zap,
  Search,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Users,
  Clock,
  Filter,
  Edit3,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  GripVertical,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

interface PlanningTask {
  id: string;
  titulo_tarea: string;
  estado: string;
  prioridad: string;
  story_points: number | null;
  responsable: string | null;
  responsable_user_id: string | null;
  fecha_entrega: string | null;
  feature_id: string | null;
  feature_name: string | null;
  brand_nombre?: string;
}

interface Sprint {
  id: string;
  name: string;
  goal: string | null;
  start_date: string;
  end_date: string;
  status: 'planned' | 'active' | 'completed';
  brand_id: string | null;
  brands?: { nombre: string } | null;
}

interface CapacityMember {
  userId: string;
  nombre: string;
  weeklyCapacityHours: number;
  totalCapacityHours: number;
  taskCount: number;
  totalPoints: number;
  completedCount: number;
}

interface PlanningData {
  sprint: Sprint;
  sprintTasks: PlanningTask[];
  backlogTasks: PlanningTask[];
  capacity: {
    sprintDays: number;
    sprintWeeks: number;
    totalCommitted: number;
    avgVelocity: number;
    members: CapacityMember[];
  };
}

const PRIORITY_COLORS: Record<string, string> = {
  alta: 'bg-red-500 text-white',
  media: 'bg-amber-500 text-black',
  baja: 'bg-green-500 text-white',
};

const FIBONACCI = [1, 2, 3, 5, 8, 13, 21];

export default function SprintPlanning() {
  const { pinnedBrandId, pinnedDeskId } = useGlobalFilter();
  const [searchParams] = useSearchParams();
  const sprintParam = searchParams.get('sprint');

  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string>(sprintParam || '');
  const [data, setData] = useState<PlanningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [loadingPlanning, setLoadingPlanning] = useState(false);

  // Search & filter
  const [backlogSearch, setBacklogSearch] = useState('');
  const [backlogPriorityFilter, setBacklogPriorityFilter] = useState<string>('all');

  // Goal editing
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalValue, setGoalValue] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);

  // Story points voting dialog
  const [votingTask, setVotingTask] = useState<PlanningTask | null>(null);
  const [votedPoints, setVotedPoints] = useState<number | null>(null);

  // Moving tasks
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);

  // Collapsed sections
  const [backlogCollapsed, setBacklogCollapsed] = useState(false);
  const [sprintCollapsed, setSprintCollapsed] = useState(false);

  // Fetch sprints list
  useEffect(() => {
    (async () => {
      try {
        const res = await api.getSprints(pinnedBrandId || undefined) as Sprint[];
        const available = (Array.isArray(res) ? res : []).filter(s => s.status !== 'completed');
        setSprints(available);
        if (!selectedSprintId && available.length > 0) {
          const active = available.find(s => s.status === 'active');
          setSelectedSprintId(active?.id || available[0].id);
        }
      } catch {
        toast.error('Error al cargar sprints');
      } finally {
        setLoading(false);
        setPrimeraCarga(false);
      }
    })();
  }, [pinnedBrandId]);

  // Fetch planning data when sprint selected
  const fetchPlanning = async (sid: string) => {
    if (!sid) return;
    setLoadingPlanning(true);
    try {
      const settings = await api.getSiteSettings().catch((): api.SiteSettings => ({}));
      const scrumDeskId = settings?.scrum_desk_id || undefined;
      const deskFilter = pinnedDeskId || scrumDeskId || undefined;
      const res = await api.getSprintPlanning(sid, deskFilter);
      setData(res);
      setGoalValue(res.sprint.goal || '');
    } catch {
      toast.error('Error al cargar datos de planning');
    } finally {
      setLoadingPlanning(false);
    }
  };

  useEffect(() => {
    if (selectedSprintId) fetchPlanning(selectedSprintId);
  }, [selectedSprintId, pinnedDeskId]);

  // Move task to sprint
  const moveToSprint = async (taskId: string) => {
    if (!data) return;
    setMovingTaskId(taskId);
    try {
      await api.patchTask(taskId, { sprint_id: selectedSprintId });
      await fetchPlanning(selectedSprintId);
      toast.success('Tarea agregada al sprint');
    } catch {
      toast.error('Error al mover tarea');
    } finally {
      setMovingTaskId(null);
    }
  };

  // Remove task from sprint (back to backlog)
  const removeFromSprint = async (taskId: string) => {
    if (!data) return;
    setMovingTaskId(taskId);
    try {
      await api.patchTask(taskId, { sprint_id: null as any });
      await fetchPlanning(selectedSprintId);
      toast.success('Tarea devuelta al backlog');
    } catch {
      toast.error('Error al remover tarea');
    } finally {
      setMovingTaskId(null);
    }
  };

  // Save story points
  const savePoints = async (taskId: string, points: number) => {
    try {
      await api.patchTask(taskId, { story_points: points });
      await fetchPlanning(selectedSprintId);
      setVotingTask(null);
      setVotedPoints(null);
      toast.success(`${points} puntos asignados`);
    } catch {
      toast.error('Error al guardar puntos');
    }
  };

  // Save goal
  const saveGoal = async () => {
    if (!data) return;
    setSavingGoal(true);
    try {
      await api.patchSprint(selectedSprintId, { goal: goalValue });
      setData(prev => prev ? { ...prev, sprint: { ...prev.sprint, goal: goalValue } } : prev);
      setEditingGoal(false);
      toast.success('Objetivo actualizado');
    } catch {
      toast.error('Error al guardar objetivo');
    } finally {
      setSavingGoal(false);
    }
  };

  // Filtered backlog
  const filteredBacklog = useMemo(() => {
    if (!data) return [];
    let tasks = data.backlogTasks;
    if (backlogSearch) {
      const q = backlogSearch.toLowerCase();
      tasks = tasks.filter(t =>
        t.titulo_tarea.toLowerCase().includes(q) ||
        t.responsable?.toLowerCase().includes(q) ||
        t.feature_name?.toLowerCase().includes(q)
      );
    }
    if (backlogPriorityFilter !== 'all') {
      tasks = tasks.filter(t => t.prioridad === backlogPriorityFilter);
    }
    return tasks;
  }, [data, backlogSearch, backlogPriorityFilter]);

  // Computed metrics
  const committedPoints = data?.sprintTasks.reduce((s, t) => s + (t.story_points ?? 0), 0) ?? 0;
  const unestimatedCount = data?.sprintTasks.filter(t => t.story_points == null).length ?? 0;
  const velocityDiff = data ? committedPoints - data.capacity.avgVelocity : 0;
  const overcommitted = data ? data.capacity.avgVelocity > 0 && committedPoints > data.capacity.avgVelocity * 1.2 : false;

  // Solo la PRIMERA carga reemplaza la pantalla. Con `loading` a secas, cada
  // recarga (buscar, filtrar, paginar) desmontaba la pagina entera: se perdia
  // el foco del input y los dialogos abiertos se cerraban solos.
  if (loading && primeraCarga) {
    return <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (sprints.length === 0) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild><Link to="/scrum"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <h2 className="text-xl font-bold">Sprint Planning</h2>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Target className="h-12 w-12 mb-4 text-muted-foreground/50" />
            <p className="text-lg font-medium mb-1">No hay sprints disponibles</p>
            <p className="text-sm mb-4">Crea un sprint planificado o activo para iniciar el planning.</p>
            <Button asChild><Link to="/scrum">Ir a Scrum</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild><Link to="/scrum"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div>
            <h2 className="text-xl font-bold text-foreground">Sprint Planning</h2>
            <p className="text-sm text-muted-foreground">Planifica y asigna tareas al sprint</p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select value={selectedSprintId} onValueChange={setSelectedSprintId}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Seleccionar sprint" />
            </SelectTrigger>
            <SelectContent>
              {sprints.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.status === 'active' ? 'Activo' : 'Planificado'})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/scrum/board?sprint=${selectedSprintId}`}>Ver Board</Link>
            </Button>
          )}
        </div>
      </div>

      {loadingPlanning ? (
        <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : data ? (
        <>
          {/* Sprint Info & Goal */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-lg">{data.sprint.name}</h3>
                    <Badge variant={data.sprint.status === 'active' ? 'default' : 'secondary'}>
                      {data.sprint.status === 'active' ? 'Activo' : 'Planificado'}
                    </Badge>
                    {data.sprint.brands?.nombre && (
                      <Badge variant="outline" className="text-xs">{data.sprint.brands.nombre}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(data.sprint.start_date).toLocaleDateString('es')} – {new Date(data.sprint.end_date).toLocaleDateString('es')}
                    </span>
                    <span>{data.capacity.sprintDays} dias ({data.capacity.sprintWeeks} sem)</span>
                  </div>

                  {/* Sprint Goal */}
                  <div className="border rounded-lg p-3 bg-muted/30">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Objetivo del Sprint</span>
                      {!editingGoal && (
                        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => { setEditingGoal(true); setGoalValue(data.sprint.goal || ''); }}>
                          <Edit3 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    {editingGoal ? (
                      <div className="flex gap-2">
                        <Textarea
                          value={goalValue}
                          onChange={e => setGoalValue(e.target.value)}
                          placeholder="Define el objetivo del sprint..."
                          rows={2}
                          className="text-sm"
                          autoFocus
                        />
                        <div className="flex flex-col gap-1">
                          <Button size="sm" onClick={saveGoal} disabled={savingGoal}>
                            {savingGoal ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingGoal(false)}><X className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm">{data.sprint.goal || <span className="text-muted-foreground italic">Sin objetivo definido</span>}</p>
                    )}
                  </div>
                </div>

                {/* KPI Summary */}
                <div className="grid grid-cols-2 gap-3 w-full md:w-[320px] shrink-0">
                  <div className="border rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-primary">{committedPoints}</div>
                    <div className="text-xs text-muted-foreground">Pts. Comprometidos</div>
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <div className={cn('text-2xl font-bold', data.capacity.avgVelocity > 0 ? (overcommitted ? 'text-red-500' : 'text-emerald-500') : 'text-muted-foreground')}>
                      {data.capacity.avgVelocity > 0 ? data.capacity.avgVelocity : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">Velocidad Prom.</div>
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold">{data.sprintTasks.length}</div>
                    <div className="text-xs text-muted-foreground">Tareas Sprint</div>
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <div className={cn('text-2xl font-bold', unestimatedCount > 0 ? 'text-amber-500' : 'text-emerald-500')}>
                      {unestimatedCount}
                    </div>
                    <div className="text-xs text-muted-foreground">Sin Estimar</div>
                  </div>
                </div>
              </div>

              {/* Capacity warning */}
              {overcommitted && (
                <div className="flex items-center gap-2 mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    El sprint tiene {committedPoints} pts comprometidos, superando la velocidad promedio de {data.capacity.avgVelocity} pts ({velocityDiff > 0 ? '+' : ''}{velocityDiff} pts).
                    Considera remover tareas para mantener un ritmo sostenible.
                  </span>
                </div>
              )}

              {/* Velocity gauge */}
              {data.capacity.avgVelocity > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Capacidad usada vs velocidad promedio</span>
                    <span className="font-medium">{committedPoints} / {data.capacity.avgVelocity} pts</span>
                  </div>
                  <Progress
                    value={Math.min(100, (committedPoints / data.capacity.avgVelocity) * 100)}
                    className={cn('h-3', overcommitted && '[&>div]:bg-red-500')}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Team Workload */}
          {data.capacity.members.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Carga por Miembro</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {data.capacity.members.map(m => (
                    <div key={m.userId} className="border rounded-lg p-3 min-w-[160px] flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <User className="h-3.5 w-3.5 text-primary" />
                        <span className="font-medium text-sm truncate">{m.nombre}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{m.taskCount} tareas</span>
                        <Badge variant="secondary" className="text-xs">{m.totalPoints} pts</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Main 2-column layout: Backlog | Sprint */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* LEFT: Product Backlog */}
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle
                    className="text-sm flex items-center gap-2 cursor-pointer"
                    onClick={() => setBacklogCollapsed(!backlogCollapsed)}
                  >
                    {backlogCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    Product Backlog ({data.backlogTasks.length})
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {data.backlogTasks.reduce((s, t) => s + (t.story_points ?? 0), 0)} pts
                  </Badge>
                </div>
              </CardHeader>
              {!backlogCollapsed && (
                <CardContent>
                  {/* Search & Filter */}
                  <div className="flex gap-2 mb-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Buscar tarea..."
                        value={backlogSearch}
                        onChange={e => setBacklogSearch(e.target.value)}
                        className="pl-8 h-8 text-sm"
                      />
                    </div>
                    <Select value={backlogPriorityFilter} onValueChange={setBacklogPriorityFilter}>
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <Filter className="h-3 w-3 mr-1" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="media">Media</SelectItem>
                        <SelectItem value="baja">Baja</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Backlog tasks list */}
                  <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
                    {filteredBacklog.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">
                        {backlogSearch || backlogPriorityFilter !== 'all' ? 'Sin resultados' : 'Backlog vacio'}
                      </p>
                    ) : (
                      filteredBacklog.map(task => (
                        <div
                          key={task.id}
                          className="group flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium truncate">{task.titulo_tarea}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                              <Badge className={cn('text-[10px] px-1.5 py-0', PRIORITY_COLORS[task.prioridad])}>{task.prioridad}</Badge>
                              {task.story_points != null && <span>{task.story_points} pts</span>}
                              {task.responsable && <span className="truncate">{task.responsable}</span>}
                              {task.brand_nombre && <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">{task.brand_nombre}</Badge>}
                              {task.feature_name && <Badge variant="outline" className="text-[10px]">{task.feature_name}</Badge>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {task.story_points == null && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => { setVotingTask(task); setVotedPoints(null); }}
                              >
                                <Zap className="h-3 w-3 mr-1" /> Estimar
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 px-2 text-xs"
                              disabled={movingTaskId === task.id}
                              onClick={() => moveToSprint(task.id)}
                            >
                              {movingTaskId === task.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <><ArrowRight className="h-3 w-3 mr-1" /> Sprint</>
                              )}
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              )}
            </Card>

            {/* RIGHT: Sprint Committed */}
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle
                    className="text-sm flex items-center gap-2 cursor-pointer"
                    onClick={() => setSprintCollapsed(!sprintCollapsed)}
                  >
                    {sprintCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    Sprint ({data.sprintTasks.length} tareas)
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{committedPoints} pts</Badge>
                    {unestimatedCount > 0 && (
                      <Badge variant="secondary" className="text-xs text-amber-600">{unestimatedCount} sin estimar</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              {!sprintCollapsed && (
                <CardContent>
                  <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
                    {data.sprintTasks.length === 0 ? (
                      <div className="flex flex-col items-center py-12 text-muted-foreground">
                        <ArrowLeftRight className="h-8 w-8 mb-2 text-muted-foreground/40" />
                        <p className="text-sm font-medium">Sin tareas en el sprint</p>
                        <p className="text-xs mt-1">Agrega tareas desde el backlog</p>
                      </div>
                    ) : (
                      data.sprintTasks.map(task => (
                        <div
                          key={task.id}
                          className="group flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {['entregado', 'aprobado'].includes(task.estado) ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              ) : null}
                              <span className="text-sm font-medium truncate">{task.titulo_tarea}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                              <Badge className={cn('text-[10px] px-1.5 py-0', PRIORITY_COLORS[task.prioridad])}>{task.prioridad}</Badge>
                              {task.story_points != null ? (
                                <span className="font-medium">{task.story_points} pts</span>
                              ) : (
                                <span className="text-amber-500 font-medium">? pts</span>
                              )}
                              {task.responsable && <span className="truncate">{task.responsable}</span>}
                              {task.feature_name && <Badge variant="outline" className="text-[10px]">{task.feature_name}</Badge>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => { setVotingTask(task); setVotedPoints(task.story_points); }}
                            >
                              <Zap className="h-3 w-3 mr-1" />
                              {task.story_points != null ? 'Re-estimar' : 'Estimar'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              disabled={movingTaskId === task.id}
                              onClick={() => removeFromSprint(task.id)}
                            >
                              {movingTaskId === task.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <><ArrowLeft className="h-3 w-3 mr-1" /> Quitar</>
                              )}
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Sprint summary footer */}
                  {data.sprintTasks.length > 0 && (
                    <div className="mt-3 pt-3 border-t flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>Alta: <strong>{data.sprintTasks.filter(t => t.prioridad === 'alta').length}</strong></span>
                      <span>Media: <strong>{data.sprintTasks.filter(t => t.prioridad === 'media').length}</strong></span>
                      <span>Baja: <strong>{data.sprintTasks.filter(t => t.prioridad === 'baja').length}</strong></span>
                      <span className="ml-auto">Total: <strong>{committedPoints} pts</strong></span>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          </div>
        </>
      ) : null}

      {/* Story Points Voting Dialog */}
      <Dialog open={!!votingTask} onOpenChange={(open) => { if (!open) { setVotingTask(null); setVotedPoints(null); } }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md" aria-describedby="voting-desc">
          <DialogHeader>
            <DialogTitle>Estimacion de Story Points</DialogTitle>
            <DialogDescription id="voting-desc">
              {votingTask?.titulo_tarea}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge className={cn('text-xs', PRIORITY_COLORS[votingTask?.prioridad || ''])}>{votingTask?.prioridad}</Badge>
              {votingTask?.responsable && <span>{votingTask.responsable}</span>}
              {votingTask?.feature_name && <Badge variant="outline" className="text-xs">{votingTask.feature_name}</Badge>}
            </div>

            <div>
              <p className="text-sm font-medium mb-3">Selecciona los story points (escala Fibonacci):</p>
              <div className="flex flex-wrap gap-2">
                {FIBONACCI.map(pts => (
                  <Button
                    key={pts}
                    variant={votedPoints === pts ? 'default' : 'outline'}
                    className={cn('h-14 w-14 text-lg font-bold', votedPoints === pts && 'ring-2 ring-primary')}
                    onClick={() => setVotedPoints(pts)}
                  >
                    {pts}
                  </Button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Personalizado:</span>
                <Input
                  type="number"
                  min={0}
                  className="w-20 h-8 text-sm"
                  value={votedPoints ?? ''}
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    setVotedPoints(Number.isNaN(v) ? null : v);
                  }}
                />
              </div>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>1</strong> = Trivial &middot; <strong>2</strong> = Simple &middot; <strong>3</strong> = Moderado</p>
              <p><strong>5</strong> = Complejo &middot; <strong>8</strong> = Muy complejo &middot; <strong>13</strong> = Enorme &middot; <strong>21</strong> = Epico</p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setVotingTask(null); setVotedPoints(null); }}>Cancelar</Button>
              <Button
                disabled={votedPoints == null || votedPoints < 0}
                onClick={() => votingTask && votedPoints != null && savePoints(votingTask.id, votedPoints)}
              >
                Guardar {votedPoints != null ? `(${votedPoints} pts)` : ''}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
