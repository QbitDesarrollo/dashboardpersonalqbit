import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
} from 'lucide-react';

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

export default function Dashboard() {
  const { profile, isCliente } = useAuth();
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
      const { data: tasks, error } = await supabase
        .from('tasks')
        .select(`
          *,
          brands (nombre)
        `);

      if (error) throw error;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const taskStats: TaskStats = {
        total: tasks?.length || 0,
        backlog: 0,
        en_proceso: 0,
        en_revision: 0,
        aprobado: 0,
        entregado: 0,
        bloqueado: 0,
        atrasadas: 0,
      };

      const urgent: UrgentTask[] = [];

      tasks?.forEach(task => {
        // Count by status
        if (task.estado in taskStats) {
          taskStats[task.estado as keyof TaskStats]++;
        }

        // Calculate days remaining
        const fechaEntrega = new Date(task.fecha_entrega);
        fechaEntrega.setHours(0, 0, 0, 0);
        const diasRestantes = Math.ceil((fechaEntrega.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // Count overdue
        if (diasRestantes < 0 && task.estado !== 'entregado') {
          taskStats.atrasadas++;
        }

        // Get urgent tasks (2 days or less)
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

  const kpiCards = [
    {
      title: 'Tareas Activas',
      value: stats.en_proceso + stats.en_revision,
      icon: <Clock className="h-5 w-5" />,
      color: 'text-info',
      bgColor: 'bg-info/10',
    },
    {
      title: 'En Revisión',
      value: stats.en_revision,
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      title: 'Entregadas',
      value: stats.entregado,
      icon: <CheckCircle2 className="h-5 w-5" />,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: 'Atrasadas',
      value: stats.atrasadas,
      icon: <AlertTriangle className="h-5 w-5" />,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
    },
    {
      title: 'Bloqueadas',
      value: stats.bloqueado,
      icon: <XCircle className="h-5 w-5" />,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
    },
    {
      title: 'Total Tareas',
      value: stats.total,
      icon: <Briefcase className="h-5 w-5" />,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
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
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            Bienvenido, {profile?.nombre?.split(' ')[0]}
          </h2>
          <p className="text-muted-foreground">
            Aquí está el resumen de tu día
          </p>
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
              <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Progress overview */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg">Progreso General</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { label: 'Backlog', value: stats.backlog, total: stats.total, color: 'bg-status-backlog' },
              { label: 'En Proceso', value: stats.en_proceso, total: stats.total, color: 'bg-status-in-progress' },
              { label: 'En Revisión', value: stats.en_revision, total: stats.total, color: 'bg-status-in-review' },
              { label: 'Aprobado', value: stats.aprobado, total: stats.total, color: 'bg-status-approved' },
              { label: 'Entregado', value: stats.entregado, total: stats.total, color: 'bg-status-delivered' },
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
              {urgentTasks.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {urgentTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-success" />
              <p>¡No hay tareas urgentes!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {urgentTasks.slice(0, 5).map((task) => (
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
