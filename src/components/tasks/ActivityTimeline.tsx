import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { User, Clock, ArrowRight } from 'lucide-react';

interface ActivityEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  user_nombre: string | null;
  created_at: string;
}

const fieldLabels: Record<string, string> = {
  estado: 'Estado',
  prioridad: 'Prioridad',
  responsable_user_id: 'Responsable',
  titulo_tarea: 'Título',
  detalle: 'Detalle',
  fecha_entrega: 'Fecha entrega',
  fecha_inicio: 'Fecha inicio',
  sprint_id: 'Sprint',
  story_points: 'Story Points',
  desk_id: 'Mesa',
  brand_id: 'Marca',
  check_done: 'Completada',
  timer_activo: 'Timer',
  tiempo_trabajado: 'Tiempo trabajado',
};

const actionLabels: Record<string, string> = {
  create: 'Creó',
  update: 'Actualizó',
  delete: 'Eliminó',
  status_change: 'Cambió estado',
  assign: 'Asignó',
  comment: 'Comentó',
};

const actionColors: Record<string, string> = {
  create: 'bg-green-500/10 text-green-700 dark:text-green-400',
  update: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  delete: 'bg-red-500/10 text-red-700 dark:text-red-400',
  status_change: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  assign: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  comment: 'bg-gray-500/10 text-gray-700 dark:text-gray-400',
};

export function ActivityTimeline({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entityId) return;
    setLoading(true);
    api.getActivityLog(entityType, entityId, { limit: 50 })
      .then((data) => setActivities(data.activities || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  if (loading) return <div className="text-sm text-muted-foreground py-4 text-center">Cargando historial...</div>;
  if (activities.length === 0) return <div className="text-sm text-muted-foreground py-4 text-center">Sin actividad registrada</div>;

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return d; }
  };

  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-3 pr-4">
        {activities.map((a) => (
          <div key={a.id} className="flex gap-3 text-sm">
            <div className="flex-shrink-0 mt-1">
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                <User className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{a.user_nombre || 'Sistema'}</span>
                <Badge variant="outline" className={actionColors[a.action] || ''}>
                  {actionLabels[a.action] || a.action}
                </Badge>
                {a.field_name && (
                  <span className="text-muted-foreground">{fieldLabels[a.field_name] || a.field_name}</span>
                )}
              </div>
              {(a.old_value || a.new_value) && (
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  {a.old_value && <span className="line-through">{a.old_value}</span>}
                  {a.old_value && a.new_value && <ArrowRight className="w-3 h-3" />}
                  {a.new_value && <span className="font-medium text-foreground">{a.new_value}</span>}
                </div>
              )}
              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {formatDate(a.created_at)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
