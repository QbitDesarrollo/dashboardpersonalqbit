import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { Loader2 } from 'lucide-react';
import { TaskCountByStatus } from './TaskCountByStatus';
import { TaskCountByPriority } from './TaskCountByPriority';
import { TasksDueThisWeek } from './TasksDueThisWeek';
import { TimeTrackedChart } from './TimeTrackedChart';
import { TasksByBrand } from './TasksByBrand';
import { TasksByUser } from './TasksByUser';

interface WidgetRendererProps {
  type: string;
  config?: Record<string, unknown>;
}

export function WidgetRenderer({ type, config }: WidgetRendererProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getWidgetData(type, config?.brand_id as string | undefined)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [type, config?.brand_id]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return <div className="text-center text-sm text-muted-foreground py-4">Sin datos</div>;

  switch (type) {
    case 'task_count_by_status': return <TaskCountByStatus data={data} />;
    case 'task_count_by_priority': return <TaskCountByPriority data={data} />;
    case 'tasks_due_this_week': return <TasksDueThisWeek data={data} />;
    case 'time_tracked_chart': return <TimeTrackedChart data={data} />;
    case 'tasks_by_brand': return <TasksByBrand data={data} />;
    case 'tasks_by_user': return <TasksByUser data={data} />;
    default: return <div className="text-sm text-muted-foreground">Widget desconocido: {type}</div>;
  }
}
