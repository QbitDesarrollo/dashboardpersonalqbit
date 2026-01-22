import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
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

export default function Dashboard() {
  const { profile, isCliente } = useAuth();
  const { pinnedDeskId, pinnedBrandId } = useGlobalFilter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; nombre: string }[]>([]);
  const [brands, setBrands] = useState<{ id: string; nombre: string }[]>([]);
  const [desks, setDesks] = useState<{ id: string; nombre: string }[]>([]);
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterResponsable, setFilterResponsable] = useState<string>('all');
  const [stats, setStats] = useState<TaskStats>({
    total: 0,
    backlog: 0,
    en_proceso: 0,
    en_revision: 0,
    aprobado: 0,
    entregado: 0,
    bloqueado: 0,
    atrasadas: 0,
  });
  const [urgentTasks, setUrgentTasks] = useState<UrgentTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [profile]);

  const fetchDashboardData = async () => {
    try {
      const [tasksRes, profilesRes, brandsRes, desksRes] = await Promise.all([
        supabase.from('tasks').select(`*, brands (nombre)`),
        supabase.from('profiles').select('id, nombre').eq('activo', true),
        supabase.from('brands').select('id, nombre').eq('activo', true),
        supabase.from('desks').select('id, nombre').eq('activo', true),
      ]);

      if (tasksRes.error) throw tasksRes.error;

      const fetchedTasks = tasksRes.data as Task[];
      setTasks(fetchedTasks);
      setProfiles(profilesRes.data || []);
      setBrands(brandsRes.data || []);
      setDesks(desksRes.data || []);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const taskStats: TaskStats = {
        total: fetchedTasks.length,
        backlog: 0,
        en_proceso: 0,
        en_revision: 0,
        aprobado: 0,
        entregado: 0,
        bloqueado: 0,
        atrasadas: 0,
      };

      const urgent: UrgentTask[] = [];

      fetchedTasks.forEach(task => {
        if (task.estado in taskStats) {
          taskStats[task.estado as keyof TaskStats]++;
        }

        const fechaEntrega = new Date(task.fecha_entrega);
        fechaEntrega.setHours(0, 0, 0, 0);
        const diasRestantes = Math.ceil((fechaEntrega.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diasRestantes < 0 && task.estado !== 'entregado') {
          taskStats.atrasadas++;
        }

        if (diasRestantes <= 2 && task.estado !== 'entregado') {
          urgent.push({
            id: task.id,
            titulo_tarea: task.titulo_tarea,
            fecha_entrega: task.fecha_entrega,
            dias_restantes: diasRestantes,
            prioridad: task.prioridad,
            estado: task.estado,
            brand_name: task.brands?.nombre || 'Sin marca',
          });
        }
      });

      setStats(taskStats);
      setUrgentTasks(urgent.sort((a, b) => a.dias_restantes - b.dias_restantes));
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Apply filters (local + global)
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesBrand = filterBrand === 'all' || task.brand_id === filterBrand;
      const matchesResponsable = filterResponsable === 'all' || task.responsable_user_id === filterResponsable;
      const matchesPinnedDesk = !pinnedDeskId || (task as any).desk_id === pinnedDeskId;
      const matchesPinnedBrand = !pinnedBrandId || task.brand_id === pinnedBrandId;
      return matchesBrand && matchesResponsable && matchesPinnedDesk && matchesPinnedBrand;
    });
  }, [tasks, filterBrand, filterResponsable, pinnedDeskId, pinnedBrandId]);

  // Calculate stats from filtered tasks
  const filteredStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const taskStats: TaskStats = {
      total: filteredTasks.length,
      backlog: 0,
      en_proceso: 0,
      en_revision: 0,
      aprobado: 0,
      entregado: 0,
      bloqueado: 0,
      atrasadas: 0,
    };

    filteredTasks.forEach(task => {
      if (task.estado in taskStats) {
        taskStats[task.estado as keyof TaskStats]++;
      }
      const fechaEntrega = new Date(task.fecha_entrega);
      fechaEntrega.setHours(0, 0, 0, 0);
      const diasRestantes = Math.ceil((fechaEntrega.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diasRestantes < 0 && task.estado !== 'entregado') {
        taskStats.atrasadas++;
      }
    });

    return taskStats;
  }, [filteredTasks]);

  // Filtered urgent tasks
  const filteredUrgentTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return filteredTasks
      .filter(task => {
        const fechaEntrega = new Date(task.fecha_entrega);
        fechaEntrega.setHours(0, 0, 0, 0);
        const diasRestantes = Math.ceil((fechaEntrega.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diasRestantes <= 2 && task.estado !== 'entregado';
      })
      .map(task => {
        const fechaEntrega = new Date(task.fecha_entrega);
        fechaEntrega.setHours(0, 0, 0, 0);
        const diasRestantes = Math.ceil((fechaEntrega.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: task.id,
          titulo_tarea: task.titulo_tarea,
          fecha_entrega: task.fecha_entrega,
          dias_restantes: diasRestantes,
          prioridad: task.prioridad,
          estado: task.estado,
          brand_name: task.brands?.nombre || 'Sin marca',
        };
      })
      .sort((a, b) => a.dias_restantes - b.dias_restantes);
  }, [filteredTasks]);

  // Metrics by Responsable
  const responsableMetrics = useMemo(() => {
    const metricsMap = new Map<string, ResponsableMetric>();
    
    filteredTasks.forEach(task => {
      if (!task.responsable_user_id) return;
      
      const profileName = profiles.find(p => p.id === task.responsable_user_id)?.nombre || 'Sin asignar';
      const existing = metricsMap.get(task.responsable_user_id) || {
        nombre: profileName,
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

  // Metrics by Brand
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
    return {
      entregables: filteredTasks.reduce((sum, t) => sum + t.cantidad_entregables, 0),
      tiempoTotal: filteredTasks.reduce((sum, t) => sum + t.tiempo_trabajado, 0),
    };
  }, [filteredTasks]);

  const kpiCards = [
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
      backlog: 'Backlog',
      en_proceso: 'En Proceso',
      en_revision: 'En Revisión',
      aprobado: 'Aprobado',
      entregado: 'Entregado',
      bloqueado: 'Bloqueado',
    };
    return labels[estado] || estado;
  };

  if (loading) {
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome + Filters */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            Bienvenido, {profile?.nombre?.split(' ')[0]}
          </h2>
          <p className="text-muted-foreground">
            Aquí está el resumen de tu día
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Dashboard Filters */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterBrand} onValueChange={setFilterBrand}>
              <SelectTrigger className="w-40 h-9">
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
            <Select value={filterResponsable} onValueChange={setFilterResponsable}>
              <SelectTrigger className="w-44 h-9">
                <SelectValue placeholder="Responsable" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span className="text-sm">
              {new Date().toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiCards.map((kpi, index) => (
          <Card key={index} className="glass-card hover:border-primary/50 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={cn("p-2 rounded-lg", kpi.bgColor)}>
                  <span className={kpi.color}>{kpi.icon}</span>
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {kpi.isTime ? kpi.value : kpi.value}
              </p>
              <p className="text-xs text-muted-foreground">{kpi.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks by Responsable Chart */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Tareas por Responsable</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {responsableMetrics.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <User className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No hay tareas asignadas</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={responsableMetrics.slice(0, 6)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                  <YAxis 
                    dataKey="nombre" 
                    type="category" 
                    width={100} 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
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
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Tareas por Marca</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {brandMetrics.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No hay tareas registradas</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={brandMetrics.slice(0, 6)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ nombre, total }) => `${nombre}: ${total}`}
                    outerRadius={100}
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Responsable Metrics Table */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Métricas por Responsable</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {responsableMetrics.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No hay datos</p>
              ) : (
                responsableMetrics.slice(0, 5).map((metric, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{metric.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {metric.completadas}/{metric.total} completadas
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <p className="font-semibold text-foreground">{metric.entregables}</p>
                        <p className="text-xs text-muted-foreground">Entregables</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-foreground">{formatTime(metric.tiempoTotal)}</p>
                        <p className="text-xs text-muted-foreground">Tiempo</p>
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
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Métricas por Marca</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {brandMetrics.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No hay datos</p>
              ) : (
                brandMetrics.slice(0, 5).map((metric, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] + '30' }}
                      >
                        <Building2 className="h-4 w-4" style={{ color: CHART_COLORS[index % CHART_COLORS.length] }} />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{metric.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {metric.completadas}/{metric.total} completadas
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <p className="font-semibold text-foreground">{metric.entregables}</p>
                        <p className="text-xs text-muted-foreground">Entregables</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-foreground">{formatTime(metric.tiempoTotal)}</p>
                        <p className="text-xs text-muted-foreground">Tiempo</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress overview */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg">Progreso General</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { label: 'Backlog', value: filteredStats.backlog, total: filteredStats.total, color: 'bg-status-backlog' },
              { label: 'En Proceso', value: filteredStats.en_proceso, total: filteredStats.total, color: 'bg-status-in-progress' },
              { label: 'En Revisión', value: filteredStats.en_revision, total: filteredStats.total, color: 'bg-status-in-review' },
              { label: 'Aprobado', value: filteredStats.aprobado, total: filteredStats.total, color: 'bg-status-approved' },
              { label: 'Entregado', value: filteredStats.entregado, total: filteredStats.total, color: 'bg-status-delivered' },
            ].map((item, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium text-foreground">
                    {item.value} / {item.total}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
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
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <CardTitle className="text-lg">Tareas Urgentes</CardTitle>
            <Badge variant="secondary" className="ml-2">
              {filteredUrgentTasks.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {filteredUrgentTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-success" />
              <p>¡No hay tareas urgentes!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUrgentTasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{task.titulo_tarea}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{task.brand_name}</span>
                      <Badge className={cn("text-[10px]", getPriorityColor(task.prioridad))}>
                        {task.prioridad.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={cn("text-xs", getStatusColor(task.estado))}>
                      {getStatusLabel(task.estado)}
                    </Badge>
                    <div className={cn(
                      "text-sm font-medium px-2 py-1 rounded",
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
    </div>
  );
}
