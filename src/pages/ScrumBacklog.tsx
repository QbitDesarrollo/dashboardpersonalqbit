import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn, formatDateSafe } from '@/lib/utils';
import { ArrowLeft, Loader2, User, Calendar } from 'lucide-react';
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
  brands?: { nombre: string };
  profiles?: { nombre: string };
  feature?: { name: string } | null;
}

interface Feature {
  id: string;
  name: string;
}

interface Sprint {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
}

export default function ScrumBacklog() {
  const { pinnedBrandId, pinnedDeskId } = useGlobalFilter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [pointsEditingId, setPointsEditingId] = useState<string | null>(null);
  const [pointsValue, setPointsValue] = useState<string>('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const settings = await api.getSiteSettings().catch((): api.SiteSettings => ({}));
      const scrumDeskId = settings?.scrum_desk_id || undefined;
      const deskFilter = pinnedDeskId || scrumDeskId || undefined;
      const [tasksRes, sprintsRes, featuresRes] = await Promise.all([
        api.getTasks({ limit: 200, backlog: true, desk_id: deskFilter }),
        api.getSprints(pinnedBrandId || undefined) as Promise<Sprint[]>,
        api.getFeatures().catch(() => []) as Promise<Feature[]>,
      ]);
      setTasks((tasksRes.tasks || []) as Task[]);
      setSprints(Array.isArray(sprintsRes) ? sprintsRes.filter((s) => s.status !== 'completed') : []);
      setFeatures(Array.isArray(featuresRes) ? featuresRes : []);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar backlog');
    } finally {
      setLoading(false);
      setPrimeraCarga(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [pinnedBrandId, pinnedDeskId]);

  const assignToSprint = async (taskId: string, sprintId: string) => {
    setAssigningId(taskId);
    try {
      await api.patchTask(taskId, { sprint_id: sprintId });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, sprint_id: sprintId } : t)));
      toast.success('Tarea añadida al sprint');
      fetchData();
    } catch {
      toast.error('Error al asignar');
    } finally {
      setAssigningId(null);
    }
  };

  const saveStoryPoints = async (taskId: string) => {
    const val = parseInt(pointsValue, 10);
    if (Number.isNaN(val) || val < 0) return;
    setPointsEditingId(null);
    try {
      await api.patchTask(taskId, { story_points: val });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, story_points: val } : t)));
      toast.success('Puntos actualizados');
    } catch {
      toast.error('Error al guardar');
    }
  };

  const assignFeature = async (taskId: string, featureId: string | null) => {
    try {
      await api.patchTask(taskId, { feature_id: featureId });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, feature_id: featureId, feature: featureId ? { name: features.find(f => f.id === featureId)?.name || '' } : null } : t)));
      toast.success('Feature actualizado');
    } catch {
      toast.error('Error al asignar feature');
    }
  };

  const totalPoints = tasks.reduce((acc, t) => acc + (t.story_points ?? 0), 0);

  // Solo la PRIMERA carga reemplaza la pantalla. Con `loading` a secas, cada
  // recarga (buscar, filtrar, paginar) desmontaba la pagina entera: se perdia
  // el foco del input y los dialogos abiertos se cerraban solos.
  if (loading && primeraCarga) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/scrum"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h2 className="text-xl font-bold text-foreground">Product Backlog</h2>
            <p className="text-sm text-muted-foreground">
              Tareas sin sprint · Total: {tasks.length} · {totalPoints} pts
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Priorizar y asignar a sprint
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {tasks.length === 0 ? (
              <li className="py-8 text-center text-muted-foreground text-sm">
                No hay tareas en backlog. Asigna tareas desde la lista de tareas o quita el sprint de tareas.
              </li>
            ) : (
              tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/tareas?task=${task.id}`}
                      className="font-medium text-sm hover:underline truncate block"
                    >
                      {task.titulo_tarea}
                    </Link>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {task.brands?.nombre && <span>{task.brands.nombre}</span>}
                      {task.fecha_entrega && (
                        <span className="flex items-center gap-0.5">
                          <Calendar className="h-3 w-3" />
                          {formatDateSafe(task.fecha_entrega)}
                        </span>
                      )}
                      {task.profiles?.nombre && (
                        <span className="flex items-center gap-0.5">
                          <User className="h-3 w-3" />
                          {task.profiles.nombre}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pointsEditingId === task.id ? (
                      <>
                        <Input
                          type="number"
                          min={0}
                          className="w-16 h-8 text-sm"
                          value={pointsValue}
                          onChange={(e) => setPointsValue(e.target.value)}
                          onBlur={() => saveStoryPoints(task.id)}
                          onKeyDown={(e) => e.key === 'Enter' && saveStoryPoints(task.id)}
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" onClick={() => setPointsEditingId(null)}>Cancelar</Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-16"
                        onClick={() => {
                          setPointsEditingId(task.id);
                          setPointsValue(String(task.story_points ?? ''));
                        }}
                      >
                        {task.story_points != null ? `${task.story_points} pts` : 'pts'}
                      </Button>
                    )}
                    <Select
                      value={task.sprint_id || 'none'}
                      onValueChange={(v) => v !== 'none' && assignToSprint(task.id, v)}
                      disabled={!!assigningId}
                    >
                      <SelectTrigger className="w-40 h-8 text-xs">
                        <SelectValue placeholder="Sprint" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin sprint</SelectItem>
                        {sprints.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} ({s.status})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {features.length > 0 && (
                      <Select
                        value={task.feature_id || 'none'}
                        onValueChange={(v) => assignFeature(task.id, v === 'none' ? null : v)}
                      >
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue placeholder="Feature" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin feature</SelectItem>
                          {features.map((f) => (
                            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {assigningId === task.id && <Loader2 className="h-4 w-4 animate-spin" />}
                  </div>
                  <Badge variant="secondary" className="text-xs">{task.prioridad}</Badge>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
