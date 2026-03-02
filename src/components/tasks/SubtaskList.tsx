import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Subtask {
  id: string;
  titulo_tarea: string;
  estado: string;
  check_done: number | boolean;
  prioridad: string;
}

const estadoColors: Record<string, string> = {
  backlog: 'bg-gray-100 text-gray-700',
  en_proceso: 'bg-blue-100 text-blue-700',
  en_revision: 'bg-yellow-100 text-yellow-700',
  aprobado: 'bg-green-100 text-green-700',
  entregado: 'bg-emerald-100 text-emerald-700',
  bloqueado: 'bg-red-100 text-red-700',
};

export function SubtaskList({ taskId, onUpdate }: { taskId: string; onUpdate?: () => void }) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchSubtasks = async () => {
    try {
      const data = await api.getSubtasks(taskId);
      setSubtasks(data || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchSubtasks(); }, [taskId]);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      await api.createSubtask(taskId, { titulo_tarea: newTitle.trim() });
      setNewTitle('');
      await fetchSubtasks();
      onUpdate?.();
      toast.success('Subtarea creada');
    } catch {
      toast.error('Error al crear subtarea');
    }
    setAdding(false);
  };

  const toggleDone = async (st: Subtask) => {
    try {
      const newDone = !(st.check_done);
      await api.patchTask(st.id, {
        check_done: newDone,
        estado: newDone ? 'entregado' : 'en_proceso',
      });
      await fetchSubtasks();
      onUpdate?.();
    } catch {
      toast.error('Error al actualizar');
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground py-2">Cargando subtareas...</div>;

  const completed = subtasks.filter(s => !!s.check_done).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Subtareas ({completed}/{subtasks.length})</span>
        {subtasks.length > 0 && (
          <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${subtasks.length > 0 ? (completed / subtasks.length) * 100 : 0}%` }} />
          </div>
        )}
      </div>

      <div className="space-y-1">
        {subtasks.map((st) => (
          <div key={st.id} className="flex items-center gap-2 py-1">
            <Checkbox
              checked={!!st.check_done}
              onCheckedChange={() => toggleDone(st)}
            />
            <span className={`text-sm flex-1 ${st.check_done ? 'line-through text-muted-foreground' : ''}`}>
              {st.titulo_tarea}
            </span>
            <Badge variant="outline" className={`text-xs ${estadoColors[st.estado] || ''}`}>
              {st.estado}
            </Badge>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Nueva subtarea..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="h-8 text-sm"
        />
        <Button size="sm" variant="outline" onClick={handleAdd} disabled={adding || !newTitle.trim()}>
          {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
        </Button>
      </div>
    </div>
  );
}
