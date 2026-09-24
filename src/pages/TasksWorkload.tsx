import { useEffect, useState, useMemo } from 'react';
import * as api from '@/lib/apiClient';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { cn, getInitials } from '@/lib/utils';
import {
  LayoutGrid,
  Loader2,
  User,
  CheckCircle2,
  Clock,
  AlertCircle,
  Package,
  Timer,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface Task {
  id: string;
  titulo_tarea: string;
  estado: string;
  prioridad: string;
  responsable_user_id: string | null;
  brand_id: string;
  desk_id: string | null;
  story_points: number | null;
  cantidad_entregables: number;
  tiempo_trabajado: number;
}

interface Profile {
  id: string;
  nombre: string;
  avatar_url?: string | null;
}

interface WorkloadRow {
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  total: number;
  backlog: number;
  enProgreso: number;
  enRevision: number;
  completadas: number;
  storyPoints: number;
  tiempoTrabajado: number;
  entregables: number;
}

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export default function TasksWorkload() {
  const { pinnedBrandId, pinnedDeskId } = useGlobalFilter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tasksRes, profilesData] = await Promise.all([
        api.getTasks({ limit: 500 }),
        api.getProfiles(),
      ]);
      setTasks((tasksRes.tasks || []) as Task[]);
      setProfiles(Array.isArray(profilesData) ? profilesData : []);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
      setPrimeraCarga(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (pinnedBrandId) list = list.filter((t) => t.brand_id === pinnedBrandId);
    if (pinnedDeskId) list = list.filter((t) => t.desk_id === pinnedDeskId);
    return list;
  }, [tasks, pinnedBrandId, pinnedDeskId]);

  const workload = useMemo(() => {
    const map = new Map<string, WorkloadRow>();

    const add = (userId: string, userName: string, avatarUrl: string | null | undefined, task: Task) => {
      let row = map.get(userId);
      if (!row) {
        row = {
          userId,
          userName,
          avatarUrl,
          total: 0,
          backlog: 0,
          enProgreso: 0,
          enRevision: 0,
          completadas: 0,
          storyPoints: 0,
          tiempoTrabajado: 0,
          entregables: 0,
        };
        map.set(userId, row);
      }
      row.total++;
      row.storyPoints += task.story_points ?? 0;
      row.tiempoTrabajado += task.tiempo_trabajado ?? 0;
      row.entregables += task.cantidad_entregables ?? 1;
      if (task.estado === 'backlog' || task.estado === 'bloqueado') row.backlog++;
      else if (task.estado === 'en_proceso') row.enProgreso++;
      else if (task.estado === 'en_revision') row.enRevision++;
      else if (task.estado === 'entregado' || task.estado === 'aprobado') row.completadas++;
    };

    filteredTasks.forEach((task) => {
      if (task.responsable_user_id) {
        const p = profiles.find((p) => p.id === task.responsable_user_id);
        add(task.responsable_user_id, p?.nombre ?? 'Desconocido', p?.avatar_url, task);
      } else {
        add('_unassigned_', 'Sin asignar', null, task);
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.userId === '_unassigned_') return 1;
      if (b.userId === '_unassigned_') return -1;
      return b.total - a.total;
    });
  }, [filteredTasks, profiles]);

  const maxTotal = useMemo(() => Math.max(...workload.map((w) => w.total), 1), [workload]);

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
          <h2 className="text-xl font-bold text-foreground">Carga de trabajo</h2>
          <p className="text-sm text-muted-foreground">
            Distribución de tareas por responsable
          </p>
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
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
          <Button variant="ghost" size="sm" asChild>
            <Link to="/tareas/calendario">Calendario</Link>
          </Button>
          <Button variant="default" size="sm" className="pointer-events-none">Carga</Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/tareas/tiempo">Tiempo</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {workload.map((row) => (
          <Card key={row.userId} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="h-6 w-6 shrink-0">
                    {row.avatarUrl ? <AvatarImage src={row.avatarUrl} alt={row.userName} className="object-cover" /> : null}
                    <AvatarFallback className={cn('text-[10px] font-semibold', row.userId === '_unassigned_' ? 'bg-muted text-muted-foreground' : 'bg-primary/20 text-primary')}>
                      {getInitials(row.userName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-semibold truncate">
                    {row.userName}
                  </span>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {row.total} tareas
                </Badge>
              </div>

              <Progress
                value={(row.total / maxTotal) * 100}
                className="h-2 mb-3"
              />

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-status-backlog" />
                  <span>Backlog: {row.backlog}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-status-in-progress" />
                  <span>En proceso: {row.enProgreso}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="h-3 w-3 text-status-in-review" />
                  <span>En revisión: {row.enRevision}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-status-delivered" />
                  <span>Completadas: {row.completadas}</span>
                </div>
                {row.storyPoints > 0 && (
                  <div className="flex items-center gap-1.5 col-span-2">
                    <Package className="h-3 w-3" />
                    <span>Story points: {row.storyPoints}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 col-span-2">
                  <Timer className="h-3 w-3" />
                  <span>Tiempo: {formatTime(row.tiempoTrabajado)}</span>
                </div>
              </div>

              {row.userId !== '_unassigned_' && (
                <Button variant="outline" size="sm" className="w-full mt-3" asChild>
                  <Link to={`/tareas?responsable=${row.userId}`}>
                    Ver tareas
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {workload.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            No hay tareas para mostrar. Aplica filtros o crea tareas.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
