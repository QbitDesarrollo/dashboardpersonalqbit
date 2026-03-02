import { useEffect, useState, useMemo } from 'react';
import * as api from '@/lib/apiClient';
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
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  Loader2,
  Target,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface StatusBreakdown {
  backlog: number;
  en_proceso: number;
  en_revision: number;
  aprobado: number;
  entregado: number;
  bloqueado: number;
}

interface BrandItem {
  brandId: string;
  brandName: string;
  clientName: string | null;
  totalTasks: number;
  completedTasks: number;
  totalPoints: number;
  completedPoints: number;
  progressPercent: number;
  pointsPercent: number;
  timeWorkedSeconds: number;
  statusBreakdown: StatusBreakdown;
}

interface SprintGerencial {
  sprint: {
    id: string;
    name: string;
    goal: string | null;
    startDate: string;
    endDate: string;
    status: 'planned' | 'active' | 'completed';
  };
  overallProgress: {
    totalTasks: number;
    completedTasks: number;
    totalPoints: number;
    completedPoints: number;
    progressPercent: number;
    pointsPercent: number;
  };
  brands: BrandItem[];
}

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog', en_proceso: 'En proceso', en_revision: 'En revisión',
  aprobado: 'Aprobado', entregado: 'Entregado', bloqueado: 'Bloqueado',
};
const STATUS_COLORS: Record<string, string> = {
  backlog: 'bg-slate-400', en_proceso: 'bg-blue-500', en_revision: 'bg-amber-500',
  aprobado: 'bg-emerald-500', entregado: 'bg-green-600', bloqueado: 'bg-red-500',
};

const SPRINT_STATUS_LABEL: Record<string, string> = {
  planned: 'Planificado', active: 'Activo', completed: 'Completado',
};
const SPRINT_STATUS_VARIANT: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-700 border-slate-300',
  active: 'bg-blue-100 text-blue-700 border-blue-300',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-300',
};

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const formatDate = (d: string) => {
  if (!d) return '';
  const str = d.length > 10 ? d.substring(0, 10) : d;
  const date = new Date(str + 'T00:00:00');
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es', { day: 'numeric', month: 'short' });
};

export default function ScrumGerencial() {
  const [data, setData] = useState<SprintGerencial[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [expandedSprints, setExpandedSprints] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await api.getSprintGerencial(statusFilter);
      setData(result);
      const activeSprints = (result as SprintGerencial[])
        .filter((s: SprintGerencial) => s.sprint.status === 'active')
        .map((s: SprintGerencial) => s.sprint.id);
      setExpandedSprints(new Set(activeSprints));
    } catch {
      toast.error('Error al cargar vista gerencial');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [statusFilter]);

  const toggleSprint = (id: string) => {
    setExpandedSprints(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const { brandOptions, clientOptions } = useMemo(() => {
    const brandsMap = new Map<string, string>();
    const clientsSet = new Set<string>();
    data.forEach(s => s.brands.forEach(b => {
      brandsMap.set(b.brandId, b.brandName);
      if (b.clientName) clientsSet.add(b.clientName);
    }));
    return {
      brandOptions: Array.from(brandsMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      clientOptions: Array.from(clientsSet).sort(),
    };
  }, [data]);

  const filteredData = useMemo(() => {
    return data.map(item => {
      let filtered = item.brands;
      if (brandFilter !== 'all') filtered = filtered.filter(b => b.brandId === brandFilter);
      if (clientFilter !== 'all') filtered = filtered.filter(b => b.clientName === clientFilter);

      let totalT = 0, compT = 0, totalP = 0, compP = 0;
      filtered.forEach(b => { totalT += b.totalTasks; compT += b.completedTasks; totalP += b.totalPoints; compP += b.completedPoints; });

      return {
        ...item,
        brands: filtered,
        overallProgress: {
          totalTasks: totalT, completedTasks: compT, totalPoints: totalP, completedPoints: compP,
          progressPercent: totalT > 0 ? Math.round((compT / totalT) * 100) : 0,
          pointsPercent: totalP > 0 ? Math.round((compP / totalP) * 100) : 0,
        },
      };
    }).filter(item => item.brands.length > 0 || (brandFilter === 'all' && clientFilter === 'all'));
  }, [data, brandFilter, clientFilter]);

  const globalStats = useMemo(() => {
    let totalTasks = 0, completedTasks = 0, totalPoints = 0, completedPoints = 0, totalBrands = new Set<string>();
    filteredData.forEach(s => {
      totalTasks += s.overallProgress.totalTasks;
      completedTasks += s.overallProgress.completedTasks;
      totalPoints += s.overallProgress.totalPoints;
      completedPoints += s.overallProgress.completedPoints;
      s.brands.forEach(b => totalBrands.add(b.brandId));
    });
    return {
      totalSprints: filteredData.length,
      activeSprints: filteredData.filter(s => s.sprint.status === 'active').length,
      totalTasks, completedTasks, totalPoints, completedPoints,
      totalBrands: totalBrands.size,
      progressPercent: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };
  }, [filteredData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/scrum"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" /> Vista Gerencial
            </h2>
            <p className="text-sm text-muted-foreground">Progreso de proyectos por sprint</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {clientOptions.length > 0 && (
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="w-[170px]">
                <Building2 className="h-3.5 w-3.5 mr-1.5 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los clientes</SelectItem>
                {clientOptions.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-[170px]">
              <Briefcase className="h-3.5 w-3.5 mr-1.5 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Marca" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las marcas</SelectItem>
              {brandOptions.map(b => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Estado sprint" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los sprints</SelectItem>
              <SelectItem value="active">Solo activos</SelectItem>
              <SelectItem value="planned">Solo planificados</SelectItem>
              <SelectItem value="completed">Solo completados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Global KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{globalStats.activeSprints}</p>
            <p className="text-xs text-muted-foreground">Sprints activos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{globalStats.totalBrands}</p>
            <p className="text-xs text-muted-foreground">Marcas/Proyectos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{globalStats.completedTasks}<span className="text-sm font-normal text-muted-foreground">/{globalStats.totalTasks}</span></p>
            <p className="text-xs text-muted-foreground">Tareas completadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className={cn('text-2xl font-bold', globalStats.progressPercent >= 80 ? 'text-emerald-600' : globalStats.progressPercent >= 50 ? 'text-amber-600' : 'text-red-600')}>
              {globalStats.progressPercent}%
            </p>
            <p className="text-xs text-muted-foreground">Progreso global</p>
          </CardContent>
        </Card>
      </div>

      {/* Sprints */}
      {filteredData.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Target className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>{brandFilter !== 'all' || clientFilter !== 'all' ? 'No hay sprints con tareas para este filtro' : 'No hay sprints con tareas asignadas a marcas'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredData.map(item => {
            const { sprint, overallProgress, brands } = item;
            const isExpanded = expandedSprints.has(sprint.id);
            const pct = overallProgress.progressPercent;
            const pctColor = pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600';

            return (
              <Card key={sprint.id} className={cn(sprint.status === 'active' && 'border-primary/30')}>
                {/* Sprint header */}
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleSprint(sprint.id)}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{sprint.name}</span>
                      <Badge variant="outline" className={cn('text-[10px]', SPRINT_STATUS_VARIANT[sprint.status])}>
                        {SPRINT_STATUS_LABEL[sprint.status]}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(sprint.startDate)} — {formatDate(sprint.endDate)}
                      </span>
                    </div>
                    {sprint.goal && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sprint.goal}</p>}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right hidden sm:block">
                      <span className="text-xs text-muted-foreground">{overallProgress.completedTasks}/{overallProgress.totalTasks} tareas</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 hidden sm:block">
                        <Progress value={pct} className="h-2" />
                      </div>
                      <span className={cn('text-lg font-bold tabular-nums w-12 text-right', pctColor)}>{pct}%</span>
                    </div>
                  </div>
                </div>

                {/* Expanded brands */}
                {isExpanded && (
                  <CardContent className="pt-0 pb-4 px-4 border-t">
                    {brands.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">Sin marcas asignadas en este sprint</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">
                        {brands.map(brand => {
                          const bPct = brand.progressPercent;
                          const bColor = bPct >= 80 ? 'text-emerald-600' : bPct >= 50 ? 'text-amber-600' : 'text-red-600';
                          const barColor = bPct >= 80 ? 'bg-emerald-500' : bPct >= 50 ? 'bg-amber-500' : 'bg-red-500';
                          const totalStatus = Object.values(brand.statusBreakdown).reduce((a, b) => a + b, 0) || 1;
                          const blocked = brand.statusBreakdown.bloqueado || 0;

                          return (
                            <div key={brand.brandId} className="rounded-lg border p-3.5 space-y-2.5 bg-card hover:shadow-sm transition-shadow">
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
                                    bPct >= 80 ? 'bg-emerald-100 text-emerald-700' : bPct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                  )}>
                                    <Briefcase className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium text-sm truncate">{brand.brandName}</p>
                                    {brand.clientName && (
                                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                        <Building2 className="h-3 w-3 shrink-0" /> {brand.clientName}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <span className={cn('text-2xl font-bold tabular-nums', bColor)}>{bPct}%</span>
                              </div>

                              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                                <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${bPct}%` }} />
                              </div>

                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> {brand.completedTasks}/{brand.totalTasks} tareas
                                </span>
                                <span className="flex items-center gap-1">
                                  <TrendingUp className="h-3 w-3" /> {brand.completedPoints}/{brand.totalPoints} pts
                                </span>
                                {brand.timeWorkedSeconds > 0 && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> {formatTime(brand.timeWorkedSeconds)}
                                  </span>
                                )}
                                {blocked > 0 && (
                                  <span className="flex items-center gap-1 text-red-600 font-medium">
                                    <AlertCircle className="h-3 w-3" /> {blocked} bloqueadas
                                  </span>
                                )}
                              </div>

                              {/* Status distribution bar */}
                              <div className="flex gap-0.5 h-2 rounded overflow-hidden">
                                {Object.entries(brand.statusBreakdown).map(([status, count]) =>
                                  count > 0 ? (
                                    <div
                                      key={status}
                                      className={cn(STATUS_COLORS[status] || 'bg-gray-400', 'transition-all')}
                                      style={{ width: `${(count / totalStatus) * 100}%` }}
                                      title={`${STATUS_LABELS[status] || status}: ${count}`}
                                    />
                                  ) : null
                                )}
                              </div>
                              <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
                                {Object.entries(brand.statusBreakdown).map(([status, count]) =>
                                  count > 0 ? (
                                    <div key={status} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                      <span className={cn('h-2 w-2 rounded-full', STATUS_COLORS[status] || 'bg-gray-400')} />
                                      {STATUS_LABELS[status]} ({count})
                                    </div>
                                  ) : null
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
