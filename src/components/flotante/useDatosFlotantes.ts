import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import * as api from '@/lib/apiClient';
import type { Task } from '@/components/tasks/lista/tipos';
import { fechaReunion, type Reunion } from '@/lib/reuniones';

export type DetalleFlotante = Partial<Task> & Pick<Task, 'id' | 'titulo_tarea'>;
export function useDatosFlotantes(taskId: string, now: number) {
  const { profile } = useAuth();
  const dia = fechaReunion(now);
  const detalle = useQuery({ queryKey: ['flotante', 'detalle', taskId], queryFn: async () => await api.getTask(taskId) as DetalleFlotante, refetchInterval: 30_000 });
  const subtareas = useQuery({ queryKey: ['flotante', 'subtareas', taskId], queryFn: async () => await api.getSubtasks(taskId) as DetalleFlotante[], refetchInterval: 30_000 });
  const proyecto = useQuery({ queryKey: ['flotante', 'proyecto', detalle.data?.project_id], enabled: !!detalle.data?.project_id,
    queryFn: () => api.getProject(detalle.data!.project_id!), staleTime: 60_000 });
  const recientes = useQuery({ queryKey: ['flotante', 'recientes', profile?.id], enabled: !!profile?.id,
    queryFn: async () => (await api.getTasks({ responsable_user_id: profile!.id, estado: 'en_proceso', limit: 10 })).tasks as DetalleFlotante[], refetchInterval: 30_000 });
  const reuniones = useQuery({ queryKey: ['flotante', 'reuniones', dia, profile?.id],
    queryFn: async () => {
      const response: { events?: Reunion[] } = await api.getGoogleCalendarEvents(`${dia}T00:00:00-05:00`, `${dia}T23:59:59.999-05:00`);
      return (response.events ?? []).filter(event => event.es_reunion === true).sort((a, b) => a.start.localeCompare(b.start));
    }, refetchInterval: 300_000, staleTime: 60_000, retry: false });
  return { detalle: detalle.data, subtareas: subtareas.data, proyecto: proyecto.data?.project.nombre, recientes: recientes.data, reuniones: reuniones.data };
}
