import { useEffect, useState, useMemo } from 'react';
import * as api from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  LayoutGrid,
  ListTodo,
  Plus,
  Calendar,
  Target,
  Loader2,
  ChevronRight,
  ChevronDown,
  Layers,
  Users,
  TrendingUp,
  CheckCircle2,
  Clock,
  Play,
  Square,
  BarChart3,
  User,
  Zap,
  Timer,
  Edit,
  AlertCircle,
  Package,
  Trash2,
  Eye,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
  LabelList,
} from 'recharts';

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

interface SprintStats {
  sprint: Sprint;
  totalTasks: number;
  totalPoints: number;
  completedTasks: number;
  completedPoints: number;
  remainingPoints: number;
  byStatus: Record<string, number>;
  byResponsable: { userId: string; nombre: string; tasks: number; points: number; completed: number }[];
  tasks: {
    id: string; titulo_tarea: string; estado: string; prioridad: string;
    story_points: number | null; check_done: boolean; responsable: string | null;
    responsable_user_id: string | null; tiempo_trabajado: number; fecha_entrega: string;
  }[];
}

interface CapacityData {
  sprintWeeks: number;
  sprintDays: number;
  members: {
    userId: string; nombre: string; weeklyCapacityHours: number;
    totalCapacityHours: number; taskCount: number; totalPoints: number;
    completedCount: number; completedPoints: number; timeWorkedSeconds: number;
  }[];
}

interface BurndownData {
  totalPoints: number;
  days: { date: string; ideal: number; actual: number }[];
}

interface VelocityEntry {
  sprint: string;
  name: string;
  status: string;
  velocity: number;
  buffer: number;
  total: number;
  totalTasks: number;
  completedTasks: number;
  blockedTasks: number;
}

interface VelocityData {
  sprints: VelocityEntry[];
  avgVelocity: number;
}

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog', en_proceso: 'En proceso', en_revision: 'En revisión',
  aprobado: 'Aprobado', entregado: 'Entregado', bloqueado: 'Bloqueado',
};
const STATUS_COLORS: Record<string, string> = {
  backlog: 'bg-slate-400', en_proceso: 'bg-blue-500', en_revision: 'bg-amber-500',
  aprobado: 'bg-emerald-500', entregado: 'bg-green-600', bloqueado: 'bg-red-500',
};
const PRIORITY_COLORS: Record<string, string> = {
  alta: 'bg-red-500 text-white', media: 'bg-amber-500 text-black', baja: 'bg-green-500 text-white',
};

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export default function Scrum() {
  const { isAdmin } = useAuth();
  const { pinnedBrandId } = useGlobalFilter();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [brands, setBrands] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedSprintId, setExpandedSprintId] = useState<string | null>(null);
  const [sprintStats, setSprintStats] = useState<SprintStats | null>(null);
  const [capacityData, setCapacityData] = useState<CapacityData | null>(null);
  const [burndownData, setBurndownData] = useState<BurndownData | null>(null);
  const [velocityData, setVelocityData] = useState<VelocityData | null>(null);
  const [loadingVelocity, setLoadingVelocity] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [form, setForm] = useState({
    name: '', goal: '', start_date: '', end_date: '', brand_id: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      setLoadingVelocity(true);
      const [sprintsRes, brandsRes, velocityRes] = await Promise.all([
        api.getSprints(pinnedBrandId || undefined) as Promise<Sprint[]>,
        api.getBrands() as Promise<{ id: string; nombre: string; activo?: boolean }[]>,
        api.getTeamVelocity(pinnedBrandId || undefined).catch(() => null),
      ]);
      setSprints(Array.isArray(sprintsRes) ? sprintsRes : []);
      setBrands(Array.isArray(brandsRes) ? brandsRes.filter((b) => b.activo !== false) : []);
      setVelocityData(velocityRes);
    } catch {
      toast.error('Error al cargar sprints');
    } finally {
      setLoading(false);
      setLoadingVelocity(false);
    }
  };

  useEffect(() => { fetchData(); }, [pinnedBrandId]);

  const expandSprint = async (sprintId: string) => {
    if (expandedSprintId === sprintId) {
      setExpandedSprintId(null);
      setSprintStats(null);
      setCapacityData(null);
      setBurndownData(null);
      return;
    }
    setExpandedSprintId(sprintId);
    setLoadingStats(true);
    try {
      const settings = await api.getSiteSettings().catch(() => ({}));
      const scrumDeskId = settings?.scrum_desk_id || undefined;
      const statsPromise = api.getSprintStats(sprintId, scrumDeskId);
      const capacityPromise = api.getSprintCapacity(sprintId, scrumDeskId).catch(() => null);
      const burndownPromise = api.getSprintBurndown(sprintId, scrumDeskId).catch(() => null);
      const [stats, capacity, burndown] = await Promise.all([statsPromise, capacityPromise, burndownPromise]);
      setSprintStats(stats);
      setCapacityData(capacity);
      setBurndownData(burndown);
    } catch {
      toast.error('Error al cargar datos del sprint');
    } finally {
      setLoadingStats(false);
    }
  };

  const handleCreateSprint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.start_date || !form.end_date) {
      toast.error('Nombre y fechas obligatorios');
      return;
    }
    setSaving(true);
    try {
      await api.createSprint({
        name: form.name, goal: form.goal || undefined,
        start_date: form.start_date, end_date: form.end_date,
        status: 'planned', brand_id: form.brand_id || undefined,
      });
      toast.success('Sprint creado');
      setDialogOpen(false);
      setForm({ name: '', goal: '', start_date: '', end_date: '', brand_id: '' });
      fetchData();
    } catch { toast.error('Error al crear sprint'); }
    finally { setSaving(false); }
  };

  const handleStatusChange = async (sprintId: string, newStatus: 'planned' | 'active' | 'completed') => {
    try {
      await api.patchSprint(sprintId, { status: newStatus });
      toast.success(`Sprint ${newStatus === 'active' ? 'activado' : newStatus === 'completed' ? 'completado' : 'planificado'}`);
      fetchData();
      if (expandedSprintId === sprintId) expandSprint(sprintId);
    } catch { toast.error('Error al cambiar estado'); }
  };

  const handleDeleteSprint = async (sprintId: string) => {
    if (!confirm('¿Eliminar este sprint? Las tareas asignadas volverán al backlog.')) return;
    try {
      await api.deleteSprint(sprintId);
      toast.success('Sprint eliminado');
      if (expandedSprintId === sprintId) { setExpandedSprintId(null); setSprintStats(null); setCapacityData(null); setBurndownData(null); }
      fetchData();
    } catch { toast.error('Error al eliminar sprint'); }
  };

  const activeSprint = sprints.find((s) => s.status === 'active');
  const plannedSprints = sprints.filter((s) => s.status === 'planned');
  const completedSprints = sprints.filter((s) => s.status === 'completed');

  if (loading) {
    return <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const progressPercent = sprintStats ? (sprintStats.totalTasks > 0 ? Math.round((sprintStats.completedTasks / sprintStats.totalTasks) * 100) : 0) : 0;
  const pointsPercent = sprintStats ? (sprintStats.totalPoints > 0 ? Math.round((sprintStats.completedPoints / sprintStats.totalPoints) * 100) : 0) : 0;

  const renderSprintRow = (sprint: Sprint) => {
    const isExpanded = expandedSprintId === sprint.id;
    const statusBadge = sprint.status === 'active'
      ? <Badge className="bg-primary text-primary-foreground">Activo</Badge>
      : sprint.status === 'completed'
        ? <Badge variant="outline">Completado</Badge>
        : <Badge variant="secondary">Planificado</Badge>;

    return (
      <div key={sprint.id} className="border rounded-lg overflow-hidden">
        <div
          className={cn(
            'flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors',
            isExpanded && 'bg-muted/30 border-b'
          )}
          onClick={() => expandSprint(sprint.id)}
        >
          {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{sprint.name}</span>
              {statusBadge}
              {sprint.brands?.nombre && <Badge variant="outline" className="text-xs">{sprint.brands.nombre}</Badge>}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(sprint.start_date).toLocaleDateString('es')} – {new Date(sprint.end_date).toLocaleDateString('es')}</span>
              {sprint.goal && <span className="truncate max-w-[200px]">{sprint.goal}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {sprint.status === 'planned' && (
              <Button size="sm" variant="default" onClick={(e) => { e.stopPropagation(); handleStatusChange(sprint.id, 'active'); }}>
                <Play className="h-3 w-3 mr-1" /> Iniciar
              </Button>
            )}
            {sprint.status === 'active' && (
              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleStatusChange(sprint.id, 'completed'); }}>
                <Square className="h-3 w-3 mr-1" /> Completar
              </Button>
            )}
            {sprint.status === 'completed' && (
              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleStatusChange(sprint.id, 'planned'); }}>
                Reabrir
              </Button>
            )}
            <Button size="sm" variant="ghost" asChild onClick={(e) => e.stopPropagation()}>
              <Link to={`/scrum/board?sprint=${sprint.id}`}><LayoutGrid className="h-4 w-4" /></Link>
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteSprint(sprint.id); }} title="Eliminar sprint">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {isExpanded && (
          <div className="p-4 space-y-6 bg-muted/10">
            {loadingStats ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : sprintStats ? (
              <>
                {/* KPIs Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-primary">{sprintStats.totalTasks}</div>
                      <div className="text-xs text-muted-foreground">Tareas totales</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-emerald-500">{sprintStats.completedTasks}</div>
                      <div className="text-xs text-muted-foreground">Completadas</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-blue-500">{sprintStats.totalPoints}</div>
                      <div className="text-xs text-muted-foreground">Story Points</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-amber-500">{sprintStats.remainingPoints}</div>
                      <div className="text-xs text-muted-foreground">Puntos restantes</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Progress Bars */}
                <div className="grid md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Progreso de Tareas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span>{sprintStats.completedTasks} / {sprintStats.totalTasks}</span>
                        <span className="font-bold">{progressPercent}%</span>
                      </div>
                      <Progress value={progressPercent} className="h-3" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4" /> Progreso de Puntos</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span>{sprintStats.completedPoints} / {sprintStats.totalPoints} pts</span>
                        <span className="font-bold">{pointsPercent}%</span>
                      </div>
                      <Progress value={pointsPercent} className="h-3" />
                    </CardContent>
                  </Card>
                </div>

                {/* Burndown Chart */}
                {burndownData && burndownData.days.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Burndown Chart</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={burndownData.days.map((d) => ({
                              ...d,
                              actual: d.actual === -1 ? undefined : d.actual,
                              dateLabel: new Date(d.date + 'T12:00:00').toLocaleDateString('es', { day: '2-digit', month: 'short' }),
                            }))}
                            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis
                              dataKey="dateLabel"
                              tick={{ fontSize: 11 }}
                              className="text-muted-foreground"
                            />
                            <YAxis
                              tick={{ fontSize: 11 }}
                              className="text-muted-foreground"
                              allowDecimals={false}
                              domain={[0, 'dataMax']}
                              label={{ value: 'Story Points', angle: -90, position: 'insideLeft', style: { fontSize: 11 }, offset: 0 }}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                                fontSize: '12px',
                              }}
                              formatter={(value: number, name: string) => [
                                `${value} pts`,
                                name === 'ideal' ? 'Ideal' : 'Real',
                              ]}
                              labelFormatter={(label) => `Día: ${label}`}
                            />
                            <Legend
                              formatter={(value) => (value === 'ideal' ? 'Ideal' : 'Real')}
                            />
                            <Line
                              type="linear"
                              dataKey="ideal"
                              stroke="hsl(var(--muted-foreground))"
                              strokeDasharray="6 4"
                              strokeWidth={2}
                              dot={false}
                              connectNulls
                            />
                            <Line
                              type="monotone"
                              dataKey="actual"
                              stroke="hsl(var(--primary))"
                              strokeWidth={2.5}
                              dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                              activeDot={{ r: 5 }}
                              connectNulls
                            />
                            {(() => {
                              const todayStr = new Date().toLocaleDateString('es', { day: '2-digit', month: 'short' });
                              return (
                                <ReferenceLine
                                  x={todayStr}
                                  stroke="hsl(var(--destructive))"
                                  strokeDasharray="4 4"
                                  strokeWidth={1.5}
                                  label={{ value: 'Hoy', position: 'top', fontSize: 10, fill: 'hsl(var(--destructive))' }}
                                />
                              );
                            })()}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex items-center justify-center gap-6 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className="w-4 h-0.5 bg-muted-foreground inline-block" style={{ borderTop: '2px dashed' }} />
                          Línea ideal ({burndownData.totalPoints} pts)
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-4 h-0.5 bg-primary inline-block" />
                          Progreso real
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Status Distribution Chart */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Distribución por Estado</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-1 h-8 rounded-lg overflow-hidden mb-3">
                      {Object.entries(sprintStats.byStatus).map(([status, count]) => {
                        const pct = sprintStats.totalTasks > 0 ? (count / sprintStats.totalTasks) * 100 : 0;
                        if (pct === 0) return null;
                        return (
                          <div
                            key={status}
                            className={cn('transition-all', STATUS_COLORS[status] || 'bg-gray-400')}
                            style={{ width: `${pct}%` }}
                            title={`${STATUS_LABELS[status] || status}: ${count}`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(sprintStats.byStatus).map(([status, count]) => (
                        <div key={status} className="flex items-center gap-1.5 text-xs">
                          <div className={cn('w-2.5 h-2.5 rounded-full', STATUS_COLORS[status] || 'bg-gray-400')} />
                          <span>{STATUS_LABELS[status] || status}: <strong>{count}</strong></span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Team Capacity */}
                {capacityData && capacityData.members.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Capacidad del Equipo</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xs text-muted-foreground mb-3">
                        Duración del sprint: {capacityData.sprintDays} días ({capacityData.sprintWeeks} semanas)
                      </div>
                      <div className="space-y-4">
                        {capacityData.members.map((member) => {
                          const completionPct = member.taskCount > 0 ? Math.round((member.completedCount / member.taskCount) * 100) : 0;
                          const timeUsedHours = Math.round(member.timeWorkedSeconds / 3600 * 10) / 10;
                          const capacityUsedPct = member.totalCapacityHours > 0 ? Math.min(100, Math.round((timeUsedHours / member.totalCapacityHours) * 100)) : 0;
                          return (
                            <div key={member.userId} className="border rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <User className="h-4 w-4 text-primary" />
                                  <span className="font-medium text-sm">{member.nombre}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>{member.completedCount}/{member.taskCount} tareas</span>
                                  <Badge variant="secondary" className="text-xs">{member.totalPoints} pts</Badge>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="text-muted-foreground">Tareas completadas</span>
                                    <span className="font-medium">{completionPct}%</span>
                                  </div>
                                  <Progress value={completionPct} className="h-2" />
                                </div>
                                <div>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="text-muted-foreground">Capacidad usada</span>
                                    <span className="font-medium">{timeUsedHours}h / {member.totalCapacityHours}h</span>
                                  </div>
                                  <Progress value={capacityUsedPct} className={cn('h-2', capacityUsedPct > 90 && '[&>div]:bg-red-500')} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Task List */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><ListTodo className="h-4 w-4" /> Tareas del Sprint ({sprintStats.tasks.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {sprintStats.tasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        No hay tareas en este sprint. Asigna tareas desde el <Link to="/scrum/backlog" className="text-primary underline">Backlog</Link>.
                      </p>
                    ) : (
                      <div className="divide-y">
                        {sprintStats.tasks.map((task) => (
                          <div key={task.id} className="flex items-center gap-3 py-2.5">
                            {task.check_done || ['entregado', 'aprobado'].includes(task.estado) ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                            ) : task.estado === 'bloqueado' ? (
                              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                            ) : (
                              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <Link to={`/tareas?task=${task.id}`} className="text-sm font-medium hover:underline truncate block">
                                {task.titulo_tarea}
                              </Link>
                            </div>
                            <Badge className={cn('text-xs shrink-0', PRIORITY_COLORS[task.prioridad])}>{task.prioridad}</Badge>
                            <Badge variant="outline" className="text-xs shrink-0">{STATUS_LABELS[task.estado] || task.estado}</Badge>
                            {task.story_points != null && <span className="text-xs text-muted-foreground shrink-0">{task.story_points} pts</span>}
                            {task.responsable && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                                <User className="h-3 w-3" />{task.responsable}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* By Responsable Chart */}
                {sprintStats.byResponsable.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Por Responsable</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {sprintStats.byResponsable.map((r) => {
                          const maxTasks = Math.max(...sprintStats.byResponsable.map(x => x.tasks), 1);
                          const pct = (r.tasks / maxTasks) * 100;
                          return (
                            <div key={r.userId}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium">{r.nombre}</span>
                                <span className="text-muted-foreground">{r.completed}/{r.tasks} tareas · {r.points} pts</span>
                              </div>
                              <div className="flex gap-0.5 h-5 rounded overflow-hidden bg-muted/50" style={{ width: `${pct}%`, minWidth: '60px' }}>
                                <div className="bg-emerald-500 transition-all" style={{ width: r.tasks > 0 ? `${(r.completed / r.tasks) * 100}%` : '0%' }} />
                                <div className="bg-blue-400 flex-1" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

              </>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Scrum</h2>
          <p className="text-sm text-muted-foreground">Sprints, backlog y tablero para metodología ágil</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-primary/30 text-primary" asChild>
            <Link to="/scrum/daily"><Users className="h-4 w-4 mr-1.5" /> Daily</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/scrum/planning"><Target className="h-4 w-4 mr-1.5" /> Planning</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/scrum/backlog"><ListTodo className="h-4 w-4 mr-1.5" /> Backlog</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/scrum/features"><Layers className="h-4 w-4 mr-1.5" /> Features</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/scrum/releases"><Package className="h-4 w-4 mr-1.5" /> Releases</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/scrum/tasks"><Zap className="h-4 w-4 mr-1.5" /> Tareas</Link>
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" className="border-primary/30 text-primary" asChild>
              <Link to="/scrum/gerencial"><Eye className="h-4 w-4 mr-1.5" /> Gerencial</Link>
            </Button>
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary"><Plus className="h-4 w-4 mr-2" /> Nuevo Sprint</Button>
            </DialogTrigger>
            <DialogContent aria-describedby="scrum-sprint-desc">
              <DialogHeader>
                <DialogTitle>Crear Sprint</DialogTitle>
                <DialogDescription id="scrum-sprint-desc">Define un nuevo sprint con fechas y objetivo.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateSprint} className="space-y-4">
                <div>
                  <Label>Nombre *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sprint 1" required />
                </div>
                <div>
                  <Label>Objetivo (goal)</Label>
                  <Textarea value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="Objetivo del sprint" rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Inicio *</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required /></div>
                  <div><Label>Fin *</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required /></div>
                </div>
                <div>
                  <Label>Marca / Proyecto</Label>
                  <Select value={form.brand_id || 'none'} onValueChange={(v) => setForm({ ...form, brand_id: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Todas</SelectItem>
                      {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3"><Target className="h-8 w-8 text-primary" /><div><div className="text-xl font-bold">{activeSprint ? 1 : 0}</div><div className="text-xs text-muted-foreground">Sprint activo</div></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><Calendar className="h-8 w-8 text-blue-500" /><div><div className="text-xl font-bold">{plannedSprints.length}</div><div className="text-xs text-muted-foreground">Planificados</div></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><CheckCircle2 className="h-8 w-8 text-emerald-500" /><div><div className="text-xl font-bold">{completedSprints.length}</div><div className="text-xs text-muted-foreground">Completados</div></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><BarChart3 className="h-8 w-8 text-amber-500" /><div><div className="text-xl font-bold">{sprints.length}</div><div className="text-xs text-muted-foreground">Total sprints</div></div></CardContent></Card>
      </div>

      {/* Velocity Chart */}
      {velocityData && velocityData.sprints.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Velocidad del Equipo en los últimos sprints
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                Promedio: {velocityData.avgVelocity} pts/sprint
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={velocityData.sprints.map((s, i) => ({
                    ...s,
                    label: s.name.length > 12 ? `S${i + 1}` : s.name,
                  }))}
                  margin={{ top: 20, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                    allowDecimals={false}
                    label={{ value: 'Puntos', angle: -90, position: 'insideLeft', style: { fontSize: 11 }, offset: 0 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => [
                      `${value} pts`,
                      name === 'velocity' ? 'Velocidad' : 'Búfer (bloqueado)',
                    ]}
                    labelFormatter={(_label, payload) => {
                      if (payload && payload.length > 0) {
                        const d = payload[0].payload;
                        return `${d.name} — ${d.completedTasks}/${d.totalTasks} tareas`;
                      }
                      return _label;
                    }}
                  />
                  <Legend
                    formatter={(value) => (value === 'velocity' ? 'Velocidad' : 'Búfer')}
                  />
                  <ReferenceLine
                    y={velocityData.avgVelocity}
                    stroke="hsl(var(--destructive))"
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    label={{ value: `Avg: ${velocityData.avgVelocity}`, position: 'right', fontSize: 10, fill: 'hsl(var(--destructive))' }}
                  />
                  <Bar dataKey="buffer" stackId="a" fill="#4ade80" radius={[0, 0, 0, 0]} name="buffer">
                    <LabelList dataKey="buffer" position="inside" fontSize={11} fill="#fff" formatter={(v: number) => v > 0 ? v : ''} />
                  </Bar>
                  <Bar dataKey="velocity" stackId="a" fill="#86efac" radius={[4, 4, 0, 0]} name="velocity">
                    <LabelList dataKey="velocity" position="inside" fontSize={11} fill="#166534" formatter={(v: number) => v > 0 ? v : ''} />
                    <LabelList dataKey="total" position="top" fontSize={11} fill="hsl(var(--foreground))" offset={5} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#4ade80] inline-block" />
                Búfer (bloqueados)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#86efac] inline-block" />
                Velocidad (completados)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-0 border-t-2 border-dashed border-destructive inline-block" />
                Promedio: {velocityData.avgVelocity} pts
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sprint List */}
      {sprints.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Layers className="h-12 w-12 mb-4 text-muted-foreground/50" />
            <p className="text-lg font-medium mb-1">No hay sprints</p>
            <p className="text-sm mb-4">Crea tu primer sprint para empezar con Scrum.</p>
            <Button onClick={() => setDialogOpen(true)} className="gradient-primary">
              <Plus className="h-4 w-4 mr-2" /> Crear Sprint
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Active sprint first */}
          {activeSprint && renderSprintRow(activeSprint)}
          {/* Planned */}
          {plannedSprints.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-muted-foreground pt-2">Planificados ({plannedSprints.length})</h3>
              {plannedSprints.map(renderSprintRow)}
            </>
          )}
          {/* Completed */}
          {completedSprints.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-muted-foreground pt-2">Completados ({completedSprints.length})</h3>
              {completedSprints.map(renderSprintRow)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
