import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';

const GoogleCalendarWidget = lazy(() => import('@/components/GoogleCalendarWidget'));
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, getInitials } from '@/lib/utils';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  TrendingUp,
  Calendar,
  Users,
  Briefcase,
  Package,
  Timer,
  Building2,
  User,
  Filter,
  Activity,
  Target,
  ListChecks,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

interface Task {
  id: string;
  titulo_tarea: string;
  fecha_entrega: string;
  prioridad: string;
  estado: string;
  responsable_user_id: string | null;
  brand_id: string;
  desk_id: string | null;
  cantidad_entregables: number;
  tiempo_trabajado: number;
  brands?: { nombre: string };
  profiles?: { nombre: string };
}

interface TaskStats {
  total: number;
  backlog: number;
  en_proceso: number;
  en_revision: number;
  aprobado: number;
  entregado: number;
  bloqueado: number;
  atrasadas: number;
}

interface UrgentTask {
  id: string;
  titulo_tarea: string;
  fecha_entrega: string;
  dias_restantes: number;
  prioridad: string;
  estado: string;
  brand_name: string;
}

interface ResponsableMetric {
  nombre: string;
  avatar_url?: string | null;
  total: number;
  completadas: number;
  enProgreso: number;
  tiempoTotal: number;
  entregables: number;
}

interface BrandMetric {
  nombre: string;
  total: number;
  completadas: number;
  tiempoTotal: number;
  entregables: number;
}

interface ActivityEntry {
  id: string;
  user_id: string;
  user_nombre: string;
  entity_type: string;
  entity_id: string;
  action: string;
  field_name?: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
}

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--info))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(220, 70%, 50%)',
  'hsl(280, 70%, 50%)',
  'hsl(340, 70%, 50%)',
];

const formatTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const calcStats = (taskList: Task[]): TaskStats => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const s: TaskStats = {
    total: taskList.length,
    backlog: 0, en_proceso: 0, en_revision: 0,
    aprobado: 0, entregado: 0, bloqueado: 0, atrasadas: 0,
  };
  taskList.forEach(task => {
    if (task.estado in s) {
      s[task.estado as keyof TaskStats]++;
    }
    if (task.fecha_entrega) {
      const [yy, mm, dd] = (task.fecha_entrega || '').split('T')[0].split('-').map(Number);
      const fechaEntrega = new Date(yy, mm - 1, dd);
      const diasRestantes = Math.ceil((fechaEntrega.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diasRestantes < 0 && !['entregado', 'aprobado', 'revision_cliente'].includes(task.estado)) {
        s.atrasadas++;
      }
    }
  });
  return s;
};

const buildUrgentTasks = (taskList: Task[]): UrgentTask[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return taskList
    .filter(task => {
      if (!task.fecha_entrega) return false;
      const [yy, mm, dd] = (task.fecha_entrega || '').split('T')[0].split('-').map(Number);
      const fechaEntrega = new Date(yy, mm - 1, dd);
      const diasRestantes = Math.ceil((fechaEntrega.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diasRestantes <= 2 && task.estado !== 'entregado';
    })
    .map(task => {
      const [yy, mm, dd] = (task.fecha_entrega || '').split('T')[0].split('-').map(Number);
      const fechaEntrega = new Date(yy, mm - 1, dd);
      const diasRestantes = Math.ceil((fechaEntrega.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: task.id, titulo_tarea: task.titulo_tarea, fecha_entrega: task.fecha_entrega,
        dias_restantes: diasRestantes, prioridad: task.prioridad, estado: task.estado,
        brand_name: task.brands?.nombre || 'Sin marca',
      };
    })
    .sort((a, b) => a.dias_restantes - b.dias_restantes);
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile, isCliente, isAdmin, isEjecutivo, isEquipo, canViewAll } = useAuth();
  const { pinnedDeskId, pinnedBrandId } = useGlobalFilter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; nombre: string }[]>([]);
  const [brands, setBrands] = useState<{ id: string; nombre: string }[]>([]);
  const [desks, setDesks] = useState<{ id: string; nombre: string }[]>([]);
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterResponsable, setFilterResponsable] = useState<string>('all');
  // Período por fecha de entrega ("hay como dejarlo x dia o mes?" — Steven)
  const [filterPeriodo, setFilterPeriodo] = useState<string>(() => {
    try { return localStorage.getItem('dashboard_periodo') || 'all'; } catch { return 'all'; }
  });
  const [periodoDesde, setPeriodoDesde] = useState<string>(() => {
    try { return localStorage.getItem('dashboard_periodo_desde') || ''; } catch { return ''; }
  });
  const [periodoHasta, setPeriodoHasta] = useState<string>(() => {
    try { return localStorage.getItem('dashboard_periodo_hasta') || ''; } catch { return ''; }
  });
  const [recentActivity, setRecentActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [profile]);

  const fetchDashboardData = async () => {
    try {
      const fetchPromises: Promise<any>[] = [
        api.getTasks({ limit: 500 }),
        api.getProfiles(),
        api.getBrands(),
        api.getDesks(),
      ];

      if (isAdmin || isEjecutivo) {
        fetchPromises.push(api.getRecentActivity(20));
      }

      const results = await Promise.all(fetchPromises);
      const tasksRes = results[0];
      const profilesData = results[1];
      const brandsData = results[2];
      const desksData = results[3];

      const fetchedTasks = (tasksRes.tasks || []) as Task[];
      setTasks(fetchedTasks);
      setProfiles(Array.isArray(profilesData) ? profilesData.filter((p: any) => p.activo) : []);
      setBrands(Array.isArray(brandsData) ? brandsData.filter((b: any) => b.activo) : []);
      setDesks(Array.isArray(desksData) ? desksData.filter((d: any) => d.activo) : []);

      if (isAdmin || isEjecutivo) {
        setRecentActivity(Array.isArray(results[4]) ? results[4] : []);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Error al cargar los datos del dashboard');
    } finally {
      setLoading(false);
      setPrimeraCarga(false);
    }
  };

  // Apply filters (local + global)
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesBrand = filterBrand === 'all' || task.brand_id === filterBrand;
      const matchesResponsable = filterResponsable === 'all' || task.responsable_user_id === filterResponsable;
      const matchesPinnedDesk = !pinnedDeskId || task.desk_id === pinnedDeskId;
      const matchesPinnedBrand = !pinnedBrandId || task.brand_id === pinnedBrandId;
      const matchesPeriodo = (() => {
        if (filterPeriodo === 'all') return true;
        if (!task.fecha_entrega) return false;
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const fe = new Date(task.fecha_entrega.substring(0, 10) + 'T00:00:00');
        if (filterPeriodo === 'custom') {
          if (periodoDesde && fe < new Date(periodoDesde + 'T00:00:00')) return false;
          if (periodoHasta && fe > new Date(periodoHasta + 'T00:00:00')) return false;
          return true;
        }
        if (filterPeriodo === 'hoy') return fe.getTime() === hoy.getTime();
        if (filterPeriodo === 'mes') return fe.getMonth() === hoy.getMonth() && fe.getFullYear() === hoy.getFullYear();
        const dias = parseInt(filterPeriodo, 10); // '7' | '15' | '30': últimos N días hasta hoy
        const desde = new Date(hoy); desde.setDate(desde.getDate() - dias);
        return fe >= desde && fe <= hoy;
      })();
      return matchesBrand && matchesResponsable && matchesPinnedDesk && matchesPinnedBrand && matchesPeriodo;
    });
  }, [tasks, filterBrand, filterResponsable, filterPeriodo, periodoDesde, periodoHasta, pinnedDeskId, pinnedBrandId]);

  // My tasks (for equipo)
  const myTasks = useMemo(() => {
    if (!isEquipo || !profile?.id) return filteredTasks;
    return filteredTasks.filter(task => task.responsable_user_id === profile.id);
  }, [filteredTasks, isEquipo, profile]);

  // Stats for admin/ops (all filtered tasks)
  const filteredStats = useMemo(() => calcStats(filteredTasks), [filteredTasks]);

  // Stats for equipo (my tasks only)
  const myStats = useMemo(() => calcStats(myTasks), [myTasks]);

  // Urgent tasks for admin/ops
  const filteredUrgentTasks = useMemo(() => buildUrgentTasks(filteredTasks), [filteredTasks]);

  // Urgent tasks for equipo
  const myUrgentTasks = useMemo(() => buildUrgentTasks(myTasks), [myTasks]);

  // Metrics by Responsable (admin/ops only)
  const responsableMetrics = useMemo(() => {
    const metricsMap = new Map<string, ResponsableMetric>();

    filteredTasks.forEach(task => {
      if (!task.responsable_user_id) return;

      const profileMatch = profiles.find(p => p.id === task.responsable_user_id);
      const existing = metricsMap.get(task.responsable_user_id) || {
        nombre: profileMatch?.nombre || 'Sin asignar',
        avatar_url: profileMatch?.avatar_url || null,
        total: 0,
        completadas: 0,
        enProgreso: 0,
        tiempoTotal: 0,
        entregables: 0,
      };

      existing.total++;
      existing.entregables += task.cantidad_entregables;
      existing.tiempoTotal += task.tiempo_trabajado;

      if (task.estado === 'entregado' || task.estado === 'aprobado') {
        existing.completadas++;
      } else if (task.estado === 'en_proceso' || task.estado === 'en_revision') {
        existing.enProgreso++;
      }

      metricsMap.set(task.responsable_user_id, existing);
    });

    return Array.from(metricsMap.values()).sort((a, b) => b.total - a.total);
  }, [filteredTasks, profiles]);

  // Metrics by Brand (admin/ops only)
  const brandMetrics = useMemo(() => {
    const metricsMap = new Map<string, BrandMetric>();

    filteredTasks.forEach(task => {
      const brandName = task.brands?.nombre || 'Sin marca';
      const existing = metricsMap.get(task.brand_id) || {
        nombre: brandName,
        total: 0,
        completadas: 0,
        tiempoTotal: 0,
        entregables: 0,
      };

      existing.total++;
      existing.entregables += task.cantidad_entregables;
      existing.tiempoTotal += task.tiempo_trabajado;

      if (task.estado === 'entregado' || task.estado === 'aprobado') {
        existing.completadas++;
      }

      metricsMap.set(task.brand_id, existing);
    });

    return Array.from(metricsMap.values()).sort((a, b) => b.total - a.total);
  }, [filteredTasks]);

  // Total metrics
  const totals = useMemo(() => {
    const source = isEquipo ? myTasks : filteredTasks;
    return {
      entregables: source.reduce((sum, t) => sum + t.cantidad_entregables, 0),
      tiempoTotal: source.reduce((sum, t) => sum + t.tiempo_trabajado, 0),
    };
  }, [filteredTasks, myTasks, isEquipo]);

  // Active stats based on role
  const activeStats = isEquipo ? myStats : filteredStats;

  // KPI cards for admin/ops
  const adminKpiCards = [
    {
      title: 'Tareas Activas',
      value: filteredStats.en_proceso + filteredStats.en_revision,
      icon: <Clock className="h-5 w-5" />,
      color: 'text-info',
      bgColor: 'bg-info/10',
    },
    {
      title: 'En Revisión',
      value: filteredStats.en_revision,
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      title: 'Entregadas',
      value: filteredStats.entregado,
      icon: <CheckCircle2 className="h-5 w-5" />,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: 'Atrasadas',
      value: filteredStats.atrasadas,
      icon: <AlertTriangle className="h-5 w-5" />,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
    },
    {
      title: 'Total Entregables',
      value: totals.entregables,
      icon: <Package className="h-5 w-5" />,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Tiempo Total',
      value: formatTime(totals.tiempoTotal),
      icon: <Timer className="h-5 w-5" />,
      color: 'text-info',
      bgColor: 'bg-info/10',
      isTime: true,
    },
  ];

  // KPI cards for equipo (personal)
  const equipoKpiCards = [
    {
      title: 'Mis Tareas Activas',
      value: myStats.en_proceso + myStats.en_revision,
      icon: <Target className="h-5 w-5" />,
      color: 'text-info',
      bgColor: 'bg-info/10',
    },
    {
      title: 'En Revisión',
      value: myStats.en_revision,
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      title: 'Mis Entregadas',
      value: myStats.entregado,
      icon: <CheckCircle2 className="h-5 w-5" />,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: 'Atrasadas',
      value: myStats.atrasadas,
      icon: <AlertTriangle className="h-5 w-5" />,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
    },
    {
      title: 'Mis Entregables',
      value: totals.entregables,
      icon: <Package className="h-5 w-5" />,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Mi Tiempo',
      value: formatTime(totals.tiempoTotal),
      icon: <Timer className="h-5 w-5" />,
      color: 'text-info',
      bgColor: 'bg-info/10',
      isTime: true,
    },
  ];

  const kpiCards = isEquipo ? equipoKpiCards : adminKpiCards;

  const getPriorityColor = (prioridad: string) => {
    switch (prioridad) {
      case 'alta': return 'bg-priority-high text-white';
      case 'media': return 'bg-priority-medium text-black';
      case 'baja': return 'bg-priority-low text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusColor = (estado: string) => {
    const colors: Record<string, string> = {
      backlog: 'bg-status-backlog text-white',
      en_proceso: 'bg-status-in-progress text-white',
      en_revision: 'bg-status-in-review text-black',
      aprobado: 'bg-status-approved text-white',
      entregado: 'bg-status-delivered text-white',
      bloqueado: 'bg-status-blocked text-white',
    };
    return colors[estado] || 'bg-muted text-muted-foreground';
  };

  const getStatusLabel = (estado: string) => {
    const labels: Record<string, string> = {
      backlog: 'Pendiente',
      en_proceso: 'En Proceso',
      en_revision: 'En Revisión',
      aprobado: 'Aprobado',
      entregado: 'Entregado',
      bloqueado: 'Bloqueado',
    };
    return labels[estado] || estado;
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      create: 'creó',
      update: 'actualizó',
      delete: 'eliminó',
      status_change: 'cambió estado',
    };
    return labels[action] || action;
  };

  const getEntityLabel = (type: string) => {
    const labels: Record<string, string> = {
      task: 'tarea',
      deliverable: 'entregable',
      sprint: 'sprint',
      feature: 'feature',
      comment: 'comentario',
    };
    return labels[type] || type;
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `hace ${diffMin}m`;
    if (diffHours < 24) return `hace ${diffHours}h`;
    if (diffDays < 7) return `hace ${diffDays}d`;
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  // Solo la PRIMERA carga reemplaza la pantalla. Con `loading` a secas, cada
  // recarga (buscar, filtrar, paginar) desmontaba la pagina entera: se perdia
  // el foco del input y los dialogos abiertos se cerraban solos.
  if (loading && primeraCarga) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="glass-card animate-pulse">
              <CardContent className="p-4">
                <div className="h-16 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const activeUrgentTasks = isEquipo ? myUrgentTasks : filteredUrgentTasks;

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* Welcome + Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              Bienvenido, {profile?.nombre?.split(' ')[0]}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isEquipo ? 'Aquí está el resumen de tus tareas' : 'Aquí está el resumen general'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4 shrink-0" />
            <span className="text-xs sm:text-sm truncate">
              {new Date().toLocaleDateString('es-ES', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
        </div>

        {/* Dashboard Filters - admin/ops only */}
        {canViewAll && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground sm:hidden">Filtros:</span>
            </div>
            <div className="grid grid-cols-2 sm:flex gap-2 flex-1 sm:flex-initial">
              <Select value={filterBrand} onValueChange={setFilterBrand}>
                <SelectTrigger className="w-full sm:w-40 h-9">
                  <SelectValue placeholder="Marca" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las marcas</SelectItem>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterPeriodo} onValueChange={(v) => { setFilterPeriodo(v); try { localStorage.setItem('dashboard_periodo', v); } catch { /* ignore */ } }}>
                <SelectTrigger className="w-full sm:w-44 h-9">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo el histórico</SelectItem>
                  <SelectItem value="hoy">Hoy</SelectItem>
                  <SelectItem value="7">Últimos 7 días</SelectItem>
                  <SelectItem value="15">Últimos 15 días</SelectItem>
                  <SelectItem value="30">Últimos 30 días</SelectItem>
                  <SelectItem value="mes">Este mes</SelectItem>
                  <SelectItem value="custom">Personalizado…</SelectItem>
                </SelectContent>
              </Select>
              {filterPeriodo === 'custom' && (
                <>
                  <input
                    type="date"
                    value={periodoDesde}
                    onChange={(e) => { setPeriodoDesde(e.target.value); try { localStorage.setItem('dashboard_periodo_desde', e.target.value); } catch { /* ignore */ } }}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    title="Desde"
                  />
                  <input
                    type="date"
                    value={periodoHasta}
                    onChange={(e) => { setPeriodoHasta(e.target.value); try { localStorage.setItem('dashboard_periodo_hasta', e.target.value); } catch { /* ignore */ } }}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    title="Hasta"
                  />
                </>
              )}
              <Select value={filterResponsable} onValueChange={setFilterResponsable}>
                <SelectTrigger className="w-full sm:w-44 h-9">
                  <SelectValue placeholder="Responsable" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
        {kpiCards.map((kpi, index) => (
          <Card key={index} className="glass-card hover:border-primary/50 transition-colors">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <div className={cn("p-1.5 sm:p-2 rounded-lg", kpi.bgColor)}>
                  <span className={cn(kpi.color, "[&>svg]:h-4 [&>svg]:w-4 sm:[&>svg]:h-5 sm:[&>svg]:w-5")}>{kpi.icon}</span>
                </div>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-foreground">
                {kpi.isTime ? kpi.value : kpi.value}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{kpi.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ====== ADMIN/OPS DASHBOARD ====== */}
      {canViewAll && (
        <>
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Tasks by Responsable Chart */}
            <Card className="glass-card">
              <CardHeader className="pb-2 sm:pb-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  <CardTitle className="text-base sm:text-lg">Tareas por Responsable</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                {responsableMetrics.length === 0 ? (
                  <div className="text-center py-6 sm:py-8 text-muted-foreground">
                    <User className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No hay tareas asignadas</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={responsableMetrics.slice(0, 5)} layout="vertical" margin={{ left: 0, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                      <YAxis
                        dataKey="nombre"
                        type="category"
                        width={70}
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(value) => value.length > 10 ? value.substring(0, 10) + '...' : value}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(value: number, name: string) => {
                          const labels: Record<string, string> = {
                            completadas: 'Completadas',
                            enProgreso: 'En Progreso',
                            total: 'Total',
                          };
                          return [value, labels[name] || name];
                        }}
                      />
                      <Bar dataKey="completadas" fill="hsl(var(--success))" name="completadas" stackId="a" />
                      <Bar dataKey="enProgreso" fill="hsl(var(--info))" name="enProgreso" stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Tasks by Brand Chart */}
            <Card className="glass-card">
              <CardHeader className="pb-2 sm:pb-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  <CardTitle className="text-base sm:text-lg">Tareas por Marca</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                {brandMetrics.length === 0 ? (
                  <div className="text-center py-6 sm:py-8 text-muted-foreground">
                    <Building2 className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No hay tareas registradas</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={brandMetrics.slice(0, 6)}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ nombre, total }) => `${nombre.substring(0, 8)}${nombre.length > 8 ? '..' : ''}: ${total}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="total"
                      >
                        {brandMetrics.slice(0, 6).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(value: number) => [`${value} tareas`, 'Total']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Detailed Metrics Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Responsable Metrics Table */}
            <Card className="glass-card">
              <CardHeader className="pb-2 sm:pb-4">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  <CardTitle className="text-base sm:text-lg">Métricas por Responsable</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 sm:space-y-3">
                  {responsableMetrics.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4 text-sm">No hay datos</p>
                  ) : (
                    responsableMetrics.slice(0, 5).map((metric, index) => (
                      <div key={index} className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          <Avatar className="h-7 w-7 sm:h-8 sm:w-8 shrink-0">
                            {metric.avatar_url ? <AvatarImage src={metric.avatar_url} alt={metric.nombre} className="object-cover" /> : null}
                            <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                              {getInitials(metric.nombre)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground text-sm sm:text-base truncate">{metric.nombre}</p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground">
                              {metric.completadas}/{metric.total} completadas
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm shrink-0">
                          <div className="text-center">
                            <p className="font-semibold text-foreground">{metric.entregables}</p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">Entregables</p>
                          </div>
                          <div className="text-center">
                            <p className="font-semibold text-foreground">{formatTime(metric.tiempoTotal)}</p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">Tiempo</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Brand Metrics Table */}
            <Card className="glass-card">
              <CardHeader className="pb-2 sm:pb-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  <CardTitle className="text-base sm:text-lg">Métricas por Marca</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 sm:space-y-3">
                  {brandMetrics.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4 text-sm">No hay datos</p>
                  ) : (
                    brandMetrics.slice(0, 5).map((metric, index) => (
                      <div key={index} className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          <div
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0"
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] + '30' }}
                          >
                            <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color: CHART_COLORS[index % CHART_COLORS.length] }} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground text-sm sm:text-base truncate">{metric.nombre}</p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground">
                              {metric.completadas}/{metric.total} completadas
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm shrink-0">
                          <div className="text-center">
                            <p className="font-semibold text-foreground">{metric.entregables}</p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">Entregables</p>
                          </div>
                          <div className="text-center">
                            <p className="font-semibold text-foreground">{formatTime(metric.tiempoTotal)}</p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">Tiempo</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Activity Feed */}
          <Card className="glass-card">
            <CardHeader className="pb-2 sm:pb-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                <CardTitle className="text-base sm:text-lg">Actividad Reciente del Equipo</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <div className="text-center py-6 sm:py-8 text-muted-foreground">
                  <Activity className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No hay actividad reciente</p>
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {recentActivity.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground">
                            <span className="font-medium">{entry.user_nombre || 'Usuario'}</span>
                            {' '}
                            <span className="text-muted-foreground">{getActionLabel(entry.action)}</span>
                            {' '}
                            <span className="text-muted-foreground">{getEntityLabel(entry.entity_type)}</span>
                            {entry.field_name && (
                              <span className="text-muted-foreground"> ({entry.field_name})</span>
                            )}
                          </p>
                          {entry.new_value && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {entry.old_value && (
                                <><span className="line-through">{entry.old_value}</span> → </>
                              )}
                              {entry.new_value}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{formatTimeAgo(entry.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ====== EQUIPO DASHBOARD ====== */}
      {isEquipo && (
        <>
          {/* My Tasks Overview - Pie chart of my task statuses */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Card className="glass-card">
              <CardHeader className="pb-2 sm:pb-4">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  <CardTitle className="text-base sm:text-lg">Mis Tareas por Estado</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                {myTasks.length === 0 ? (
                  <div className="text-center py-6 sm:py-8 text-muted-foreground">
                    <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No tienes tareas asignadas</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Pendiente', value: myStats.backlog },
                          { name: 'En Proceso', value: myStats.en_proceso },
                          { name: 'En Revisión', value: myStats.en_revision },
                          { name: 'Aprobado', value: myStats.aprobado },
                          { name: 'Entregado', value: myStats.entregado },
                          { name: 'Bloqueado', value: myStats.bloqueado },
                        ].filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={80}
                        dataKey="value"
                      >
                        {[
                          'hsl(var(--muted-foreground))',
                          'hsl(var(--info))',
                          'hsl(var(--warning))',
                          'hsl(var(--success))',
                          'hsl(var(--primary))',
                          'hsl(var(--destructive))',
                        ].map((color, index) => (
                          <Cell key={`cell-${index}`} fill={color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* My Tasks by Brand */}
            <Card className="glass-card">
              <CardHeader className="pb-2 sm:pb-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  <CardTitle className="text-base sm:text-lg">Mis Tareas por Marca</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                {(() => {
                  const myBrandMap = new Map<string, { nombre: string; total: number }>();
                  myTasks.forEach(t => {
                    const bName = t.brands?.nombre || 'Sin marca';
                    const existing = myBrandMap.get(t.brand_id) || { nombre: bName, total: 0 };
                    existing.total++;
                    myBrandMap.set(t.brand_id, existing);
                  });
                  const myBrandData = Array.from(myBrandMap.values()).sort((a, b) => b.total - a.total);

                  if (myBrandData.length === 0) {
                    return (
                      <div className="text-center py-6 sm:py-8 text-muted-foreground">
                        <Building2 className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No hay tareas registradas</p>
                      </div>
                    );
                  }

                  return (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={myBrandData.slice(0, 5)} layout="vertical" margin={{ left: 0, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                        <YAxis
                          dataKey="nombre"
                          type="category"
                          width={70}
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(value) => value.length > 10 ? value.substring(0, 10) + '...' : value}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                          formatter={(value: number) => [`${value} tareas`, 'Total']}
                        />
                        <Bar dataKey="total" fill="hsl(var(--primary))" />
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Progress overview - shared but with different data */}
      <Card className="glass-card">
        <CardHeader className="pb-2 sm:pb-4">
          <CardTitle className="text-base sm:text-lg">
            {isEquipo ? 'Mi Progreso' : 'Progreso General'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 sm:space-y-4">
            {[
              { label: 'Pendiente', value: activeStats.backlog, total: activeStats.total, color: 'bg-status-backlog' },
              { label: 'En Proceso', value: activeStats.en_proceso, total: activeStats.total, color: 'bg-status-in-progress' },
              { label: 'En Revisión', value: activeStats.en_revision, total: activeStats.total, color: 'bg-status-in-review' },
              { label: 'Aprobado', value: activeStats.aprobado, total: activeStats.total, color: 'bg-status-approved' },
              { label: 'Entregado', value: activeStats.entregado, total: activeStats.total, color: 'bg-status-delivered' },
            ].map((item, index) => (
              <div key={index} className="space-y-1 sm:space-y-2">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium text-foreground">
                    {item.value} / {item.total}
                  </span>
                </div>
                <div className="h-1.5 sm:h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", item.color)}
                    style={{ width: `${item.total > 0 ? (item.value / item.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Urgent tasks */}
      <Card className="glass-card">
        <CardHeader className="pb-2 sm:pb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-warning" />
            <CardTitle className="text-base sm:text-lg">
              {isEquipo ? 'Mis Tareas Urgentes' : 'Tareas Urgentes'}
            </CardTitle>
            <Badge variant="secondary" className="ml-2 text-xs">
              {activeUrgentTasks.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {activeUrgentTasks.length === 0 ? (
            <div className="text-center py-6 sm:py-8 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 text-success" />
              <p className="text-sm">
                {isEquipo ? '¡No tienes tareas urgentes!' : '¡No hay tareas urgentes!'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {activeUrgentTasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  onClick={() => navigate(`/tareas?task=${task.id}`)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-2 sm:p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors gap-2 cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm sm:text-base truncate">{task.titulo_tarea}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] sm:text-xs text-muted-foreground truncate">{task.brand_name}</span>
                      <Badge className={cn("text-[10px] px-1.5", getPriorityColor(task.prioridad))}>
                        {task.prioridad.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 justify-between sm:justify-end">
                    <Badge className={cn("text-[10px] sm:text-xs", getStatusColor(task.estado))}>
                      {getStatusLabel(task.estado)}
                    </Badge>
                    <div className={cn(
                      "text-xs sm:text-sm font-medium px-2 py-1 rounded whitespace-nowrap",
                      task.dias_restantes < 0
                        ? "bg-destructive/20 text-destructive"
                        : task.dias_restantes === 0
                        ? "bg-warning/20 text-warning"
                        : "bg-info/20 text-info"
                    )}>
                      {task.dias_restantes < 0
                        ? `${Math.abs(task.dias_restantes)}d atrasada`
                        : task.dias_restantes === 0
                        ? 'Hoy'
                        : `${task.dias_restantes}d`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Google Calendar */}
      {profile?.google_connected && (
        <Suspense fallback={null}>
          <GoogleCalendarWidget />
        </Suspense>
      )}
    </div>
  );
}
