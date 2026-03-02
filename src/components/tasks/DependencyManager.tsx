import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Link2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

interface Dependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: string;
  titulo_tarea: string;
  estado: string;
}

interface TaskOption {
  id: string;
  titulo_tarea: string;
}

export function DependencyManager({ taskId, allTasks }: { taskId: string; allTasks?: TaskOption[] }) {
  const [deps, setDeps] = useState<Dependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState('');

  const fetchDeps = async () => {
    try {
      const data = await api.getDependencies(taskId);
      setDeps(data || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchDeps(); }, [taskId]);

  const handleAdd = async () => {
    if (!selectedTask) return;
    try {
      await api.createDependency(taskId, selectedTask, 'blocks');
      setSelectedTask('');
      await fetchDeps();
      toast.success('Dependencia agregada');
    } catch {
      toast.error('Error al agregar dependencia');
    }
  };

  const handleRemove = async (depId: string) => {
    try {
      await api.deleteDependency(taskId, depId);
      await fetchDeps();
      toast.success('Dependencia eliminada');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground py-2">Cargando dependencias...</div>;

  const blocks = deps.filter(d => d.task_id === taskId);
  const blockedBy = deps.filter(d => d.depends_on_task_id === taskId);
  const availableTasks = (allTasks || []).filter(t => t.id !== taskId && !deps.some(d => d.task_id === t.id || d.depends_on_task_id === t.id));

  return (
    <div className="space-y-3">
      <span className="text-sm font-medium flex items-center gap-1">
        <Link2 className="w-4 h-4" /> Dependencias
      </span>

      {blocks.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Bloquea a:</span>
          {blocks.map(d => (
            <div key={d.id} className="flex items-center gap-2 text-sm">
              <ArrowRight className="w-3 h-3 text-orange-500" />
              <span className="flex-1 truncate">{d.titulo_tarea}</span>
              <Badge variant="outline" className="text-xs">{d.estado}</Badge>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleRemove(d.id)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {blockedBy.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Bloqueada por:</span>
          {blockedBy.map(d => (
            <div key={d.id} className="flex items-center gap-2 text-sm">
              <ArrowRight className="w-3 h-3 text-red-500 rotate-180" />
              <span className="flex-1 truncate">{d.titulo_tarea}</span>
              <Badge variant="outline" className="text-xs">{d.estado}</Badge>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleRemove(d.id)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {blocks.length === 0 && blockedBy.length === 0 && (
        <div className="text-xs text-muted-foreground">Sin dependencias</div>
      )}

      {availableTasks.length > 0 && (
        <div className="flex gap-2">
          <Select value={selectedTask} onValueChange={setSelectedTask}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Agregar dependencia..." />
            </SelectTrigger>
            <SelectContent>
              {availableTasks.map(t => (
                <SelectItem key={t.id} value={t.id} className="text-xs">{t.titulo_tarea}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handleAdd} disabled={!selectedTask} className="h-8">
            Agregar
          </Button>
        </div>
      )}
    </div>
  );
}
