import { apiRequest } from './apiClient';
import type { Task } from './dashboardDatos';

export async function getDashboardTasks(): Promise<Task[]> {
  const r = await apiRequest('/api/data/dashboard/tasks');
  if (!r.ok) throw new Error('No se pudieron cargar las tareas del dashboard');
  const data: { tasks?: Task[] } = await r.json();
  if (!Array.isArray(data.tasks)) throw new Error('Respuesta incompleta del dashboard');
  return data.tasks;
}
