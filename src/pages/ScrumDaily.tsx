import { useEffect, useState, useMemo } from 'react';
import * as api from '@/lib/apiClient';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn, formatDateSafe } from '@/lib/utils';
import {
  ArrowLeft,
  Loader2,
  Target,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Zap,
  User,
  Calendar,
  TrendingUp,
  LayoutGrid,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface SprintTask {
  id: string;
  titulo_tarea: string;
  estado: string;
  prioridad: string;
  story_points: number | null;
  check_done: boolean;
  responsable: string | null;
  responsable_user_id: string | null;
  tiempo_trabajado: number | null;
  fecha_entrega: string | null;
}

interface Sprint {
  id: string;
  name: string;
  goal: string | null;
  start_date: string;
  end_date: string;
  status: 'planned' | 'active' | 'completed';
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
  tasks: SprintTask[];
}

const STATUS_ORDER = ['bloqueado', 'en_proceso', 'en_revision', 'backlog', 'aprobado', 'entregado'];
const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog', en_proceso: 'En proceso', en_revision: 'En revision',
  aprobado: 'Aprobado', entregado: 'Entregado', bloqueado: 'Bloqueado',
};
const STATUS_COLORS: Record<string, string> = {
  backlog: 'bg-slate-400', en_proceso: 'bg-blue-500', en_revision: 'bg-amber-500',
  aprobado: 'bg-emerald-500', entregado: 'bg-green-600', bloqueado: 'bg-red-500',
};
const STATUS_BG: Record<string, string> = {
  backlog: 'bg-slate-50 border-slate-200 dark:bg-slate-900/40 dark:border-slate-700',
  en_proceso: 'bg-blue-50 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800',
  en_revision: 'bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800',
  aprobado: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800',
  entregado: 'bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-800',
  bloqueado: 'bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-800',
};
const PRIORITY_COLORS: Record<string, string> = {
  alta: 'bg-red-500 text-white', media: 'bg-amber-500 text-black', baja: 'bg-green-500 text-white',
};

function getDaysRemaining(endDate: string): number {
  const end = new Date(endDate.slice(0, 10) + 'T23:59:59');
  const now = new Date();
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

function getSprintDayProgress(startDate: string, endDate: string): number {
  const start = new Date(startDate.slice(0, 10) + 'T00:00:00').getTime();
  const end = new Date(endDate.slice(0, 10) + 'T23:59:59').getTime();
  const now = Date.now();
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

function isUrgent(fechaEntrega: string | null): boolean {
  if (!fechaEntrega) return false;
  const delivery = new Date(fechaEntrega.slice(0, 10) + 'T23:59:59');
  const now = new Date();
  const diffDays = (delivery.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= 1 && diffDays >= -1;
}

function isOverdue(fechaEntrega: string | null): boolean {
  if (!fechaEntrega) return false;
  const delivery = new Date(fechaEntrega.slice(0, 10) + 'T23:59:59');
  return delivery.getTime() < Date.now();
}

function isCompleted(task: SprintTask): boolean {
  return ['entregado', 'aprobado'].includes(task.estado) || task.check_done;
}

export default function ScrumDaily() {
  const { pinnedBrandId, pinnedDeskId } = useGlobalFilter();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [activeSprint, setActiveSprint] = useState<string>('');
  const [stats, setStats] = useState<SprintStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [collapsedMembers, setCollapsedMembers] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getSprints(pinnedBrandId || undefined) as Sprint[];
        const available = (Array.isArray(res) ? res : []).filter(s => s.status !== 'completed');
        setSprints(available);
        const active = available.find(s => s.status === 'active');
        if (active) setActiveSprint(active.id);
        else if (available.length > 0) setActiveSprint(available[0].id);
      } catch {
        toast.error('Error al cargar sprints');
      } finally {
        setLoading(false);
      }
    })();
  }, [pinnedBrandId]);

  const fetchStats = async (sprintId: string) => {
    if (!sprintId) return;
    setLoadingStats(true);
    try {
      const settings = await api.getSiteSettings().catch(() => ({}));
      const deskId = pinnedDeskId || settings?.scrum_desk_id || undefined;
      const data = await api.getSprintStats(sprintId, deskId);
      setStats(data);
    } catch {
      toast.error('Error al cargar datos del sprint');
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (activeSprint) fetchStats(activeSprint);
  }, [activeSprint, pinnedDeskId]);

  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    setUpdatingTaskId(taskId);
    try {
      await api.patchTask(taskId, { estado: newStatus });
      setStats(prev => {
        if (!prev) return prev;
        const updatedTasks = prev.tasks.map(t => t.id === taskId ? { ...t, estado: newStatus } : t);
        const completed = updatedTasks.filter(t => isCompleted(t));
        const byStatus: Record<string, number> = {};
        updatedTasks.forEach(t => { byStatus[t.estado] = (byStatus[t.estado] || 0) + 1; });
        const byResponsable = prev.byResponsable.map(r => {
          const memberTasks = updatedTasks.filter(t => t.responsable_user_id === r.userId);
          return { ...r, tasks: memberTasks.length, completed: memberTasks.filter(t => isCompleted(t)).length };
        });
        return {
          ...prev,
          tasks: updatedTasks,
          completedTasks: completed.length,
          completedPoints: completed.reduce((s, t) => s + (t.story_points ?? 0), 0),
          remainingPoints: prev.totalPoints - completed.reduce((s, t) => s + (t.story_points ?? 0), 0),
          byStatus,
          byResponsable,
        };
      });
      toast.success('Estado actualizado');
    } catch {
      toast.error('Error al cambiar estado');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const toggleMember = (userId: string) => {
    setCollapsedMembers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const sprint = stats?.sprint;
  const daysRemaining = sprint ? getDaysRemaining(sprint.end_date) : 0;
  const dayProgress = sprint ? getSprintDayProgress(sprint.start_date, sprint.end_date) : 0;
  const progressPct = stats && stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;
  const pointsPct = stats && stats.totalPoints > 0 ? Math.round((stats.completedPoints / stats.totalPoints) * 100) : 0;
  const blockedCount = stats?.byStatus?.bloqueado ?? 0;

  const blockedTasks = useMemo(() =>
    stats?.tasks.filter(t => t.estado === 'bloqueado') ?? [],
    [stats]
  );

  const urgentTasks = useMemo(() =>
    stats?.tasks.filter(t => !isCompleted(t) && t.estado !== 'bloqueado' && (isUrgent(t.fecha_entrega) || isOverdue(t.fecha_entrega))) ?? [],
    [stats]
  );

  const memberSwimlanes = useMemo(() => {
    if (!stats) return [];
    const memberMap = new Map<string, { userId: string; nombre: string; tasks: SprintTask[]; completed: number; total: number; points: number }>();
    for (const r of stats.byResponsable) {
      memberMap.set(r.userId, { userId: r.userId, nombre: r.nombre, tasks: [], completed: 0, total: 0, points: 0 });
    }
    for (const t of stats.tasks) {
      const uid = t.responsable_user_id || '_unassigned_';
      if (!memberMap.has(uid)) {
        memberMap.set(uid, { userId: uid, nombre: t.responsable || 'Sin asignar', tasks: [], completed: 0, total: 0, points: 0 });
      }
      const m = memberMap.get(uid)!;
      m.tasks.push(t);
      m.total++;
      m.points += t.story_points ?? 0;
      if (isCompleted(t)) m.completed++;
    }
    return Array.from(memberMap.values()).sort((a, b) => {
      const aBlocked = a.tasks.filter(t => t.estado === 'bloqueado').length;
      const bBlocked = b.tasks.filter(t => t.estado === 'bloqueado').length;
      if (aBlocked !== bBlocked) return bBlocked - aBlocked;
      const aPct = a.total > 0 ? a.completed / a.total : 1;
      const bPct = b.total > 0 ? b.completed / b.total : 1;
      return aPct - bPct;
    });
  }, [stats]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (sprints.length === 0) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild><Link to="/scrum"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <h2 className="text-xl font-bold">Daily Standup</h2>
        </div>
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <p className="text-lg font-medium">No hay sprints disponibles</p>
          <p className="text-sm mt-1">Crea un sprint activo para usar la vista diaria.</p>
        </CardContent></Card>
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
            <h2 className="text-xl font-bold text-foreground">Daily Standup</h2>
            <p className="text-sm text-muted-foreground">Revision diaria del sprint activo</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={activeSprint} onValueChange={setActiveSprint}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Sprint" />
            </SelectTrigger>
            <SelectContent>
              {sprints.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} {s.status === 'active' ? '(Activo)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeSprint && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/scrum/board?sprint=${activeSprint}`}><LayoutGrid className="h-4 w-4 mr-1" /> Board</Link>
            </Button>
          )}
        </div>
      </div>

      {loadingStats ? (
        <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : stats && sprint ? (
        <>
          {/* Sprint Overview Card */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Sprint info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="h-5 w-5 text-primary shrink-0" />
                    <h3 className="font-semibold text-lg truncate">{sprint.name}</h3>
                    <Badge variant={sprint.status === 'active' ? 'default' : 'secondary'}>
                      {sprint.status === 'active' ? 'Activo' : 'Planificado'}
                    </Badge>
                  </div>
                  {sprint.goal && (
                    <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{sprint.goal}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDateSafe(sprint.start_date)} – {formatDateSafe(sprint.end_date)}
                    </span>
                    <Badge variant="outline" className={cn('text-xs', daysRemaining <= 2 ? 'border-red-400 text-red-600' : '')}>
                      {daysRemaining === 0 ? 'Ultimo dia' : `${daysRemaining} dias restantes`}
                    </Badge>
                  </div>
                  {/* Time progress bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Tiempo del sprint</span>
                      <span>{dayProgress}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-muted-foreground/30 rounded-full transition-all" style={{ width: `${dayProgress}%` }} />
                    </div>
                  </div>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:w-auto shrink-0">
                  <div className="border rounded-lg p-3 text-center min-w-[100px]">
                    <div className="text-2xl font-bold text-primary">{progressPct}%</div>
                    <div className="text-[11px] text-muted-foreground">Progreso</div>
                    <Progress value={progressPct} className="h-1.5 mt-1" />
                  </div>
                  <div className="border rounded-lg p-3 text-center min-w-[100px]">
                    <div className="text-2xl font-bold text-emerald-500">{stats.completedTasks}<span className="text-sm text-muted-foreground font-normal">/{stats.totalTasks}</span></div>
                    <div className="text-[11px] text-muted-foreground">Tareas</div>
                  </div>
                  <div className="border rounded-lg p-3 text-center min-w-[100px]">
                    <div className="text-2xl font-bold text-blue-500">{stats.completedPoints}<span className="text-sm text-muted-foreground font-normal">/{stats.totalPoints}</span></div>
                    <div className="text-[11px] text-muted-foreground">Puntos</div>
                  </div>
                  <div className="border rounded-lg p-3 text-center min-w-[100px]">
                    <div className={cn('text-2xl font-bold', blockedCount > 0 ? 'text-red-500' : 'text-muted-foreground')}>{blockedCount}</div>
                    <div className="text-[11px] text-muted-foreground">Bloqueadas</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Alerts: Blocked + Urgent */}
          {(blockedTasks.length > 0 || urgentTasks.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {blockedTasks.length > 0 && (
                <Card className="border-red-300 dark:border-red-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-red-600 dark:text-red-400">
                      <AlertCircle className="h-4 w-4" /> Bloqueadas ({blockedTasks.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {blockedTasks.map(t => (
                      <div key={t.id} className="flex items-center gap-2 p-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                        <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <Link to={`/tareas?task=${t.id}`} className="text-sm font-medium hover:underline truncate block">{t.titulo_tarea}</Link>
                          <span className="text-xs text-muted-foreground">{t.responsable || 'Sin asignar'}</span>
                        </div>
                        <Select value={t.estado} onValueChange={(v) => updateTaskStatus(t.id, v)}>
                          <SelectTrigger className="h-6 w-28 text-[10px] border-red-300">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
              {urgentTasks.length > 0 && (
                <Card className="border-amber-300 dark:border-amber-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4" /> Urgentes — vencen hoy/manana ({urgentTasks.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {urgentTasks.map(t => (
                      <div key={t.id} className="flex items-center gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <Link to={`/tareas?task=${t.id}`} className="text-sm font-medium hover:underline truncate block">{t.titulo_tarea}</Link>
                          <span className="text-xs text-muted-foreground">
                            {t.responsable || 'Sin asignar'}
                            {t.fecha_entrega && (
                              <> · {isOverdue(t.fecha_entrega) ? <span className="text-red-500 font-semibold">Vencida</span> : formatDateSafe(t.fecha_entrega)}</>
                            )}
                          </span>
                        </div>
                        <Select value={t.estado} onValueChange={(v) => updateTaskStatus(t.id, v)}>
                          <SelectTrigger className="h-6 w-28 text-[10px] border-amber-300">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Member Swimlanes */}
          <div className="space-y-3">
            {memberSwimlanes.map(member => {
              const memberPct = member.total > 0 ? Math.round((member.completed / member.total) * 100) : 0;
              const memberBlocked = member.tasks.filter(t => t.estado === 'bloqueado').length;
              const isCollapsed = collapsedMembers.has(member.userId);

              const tasksByStatus = new Map<string, SprintTask[]>();
              member.tasks.forEach(t => {
                const list = tasksByStatus.get(t.estado) || [];
                list.push(t);
                tasksByStatus.set(t.estado, list);
              });

              return (
                <Card key={member.userId} className={cn(memberBlocked > 0 && 'border-red-300/50 dark:border-red-800/50')}>
                  {/* Member Header */}
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleMember(member.userId)}
                  >
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <span className="font-semibold text-sm truncate">{member.nombre}</span>
                    </div>
                    <div className="flex items-center gap-3 ml-auto shrink-0">
                      {memberBlocked > 0 && (
                        <Badge variant="destructive" className="text-xs">{memberBlocked} bloqueada{memberBlocked > 1 ? 's' : ''}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {member.completed}/{member.total} tareas · {member.points} pts
                      </span>
                      <div className="w-20 hidden sm:block">
                        <Progress value={memberPct} className={cn('h-2', memberPct === 100 && '[&>div]:bg-emerald-500')} />
                      </div>
                      <Badge variant="outline" className={cn('text-xs font-bold', memberPct === 100 ? 'text-emerald-600 border-emerald-400' : '')}>{memberPct}%</Badge>
                    </div>
                  </div>

                  {/* Member Tasks */}
                  {!isCollapsed && (
                    <CardContent className="pt-0 pb-4">
                      <div className="space-y-3">
                        {STATUS_ORDER.filter(s => tasksByStatus.has(s)).map(status => {
                          const statusTasks = tasksByStatus.get(status)!;
                          return (
                            <div key={status}>
                              <div className="flex items-center gap-2 mb-1.5">
                                <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', STATUS_COLORS[status])} />
                                <span className="text-xs font-medium text-muted-foreground">{STATUS_LABELS[status]} ({statusTasks.length})</span>
                              </div>
                              <div className="space-y-1 ml-4">
                                {statusTasks.map(task => (
                                  <div
                                    key={task.id}
                                    className={cn(
                                      'flex items-center gap-2 p-2 rounded-md border transition-colors',
                                      STATUS_BG[status],
                                      isCompleted(task) && 'opacity-60',
                                    )}
                                  >
                                    {isCompleted(task) ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                    ) : status === 'bloqueado' ? (
                                      <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                    ) : (
                                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <Link to={`/tareas?task=${task.id}`} className="text-sm hover:underline truncate block">{task.titulo_tarea}</Link>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Badge className={cn('text-[10px] px-1.5 py-0', PRIORITY_COLORS[task.prioridad])}>{task.prioridad}</Badge>
                                      {task.story_points != null && <span className="text-xs text-muted-foreground">{task.story_points}pts</span>}
                                      {task.fecha_entrega && (
                                        <span className={cn('text-[10px]', isOverdue(task.fecha_entrega) && !isCompleted(task) ? 'text-red-500 font-bold' : 'text-muted-foreground')}>
                                          {formatDateSafe(task.fecha_entrega)}
                                        </span>
                                      )}
                                      <Select
                                        value={task.estado}
                                        onValueChange={(v) => updateTaskStatus(task.id, v)}
                                        disabled={updatingTaskId === task.id}
                                      >
                                        <SelectTrigger className={cn('h-6 w-[110px] text-[10px] font-medium', STATUS_COLORS[task.estado], 'text-white border-0')}>
                                          {updatingTaskId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <SelectValue />}
                                        </SelectTrigger>
                                        <SelectContent>
                                          {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {member.tasks.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">Sin tareas asignadas</p>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Status Distribution Summary */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Distribucion del sprint</span>
              </div>
              <div className="flex gap-0.5 h-6 rounded-lg overflow-hidden mb-2">
                {Object.entries(stats.byStatus).map(([status, count]) => {
                  const pct = stats.totalTasks > 0 ? (count / stats.totalTasks) * 100 : 0;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={status}
                      className={cn('transition-all flex items-center justify-center', STATUS_COLORS[status])}
                      style={{ width: `${pct}%` }}
                      title={`${STATUS_LABELS[status]}: ${count}`}
                    >
                      {pct > 8 && <span className="text-[10px] text-white font-bold">{count}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {Object.entries(stats.byStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center gap-1.5 text-xs">
                    <div className={cn('w-2.5 h-2.5 rounded-full', STATUS_COLORS[status])} />
                    <span className="text-muted-foreground">{STATUS_LABELS[status]}: <strong className="text-foreground">{count}</strong></span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
