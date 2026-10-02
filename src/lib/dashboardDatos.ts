export interface Task {
  id: string;
  titulo_tarea: string;
  fecha_entrega: string;
  prioridad: string;
  estado: string;
  responsable_user_id: string | null;
  brand_id: string;
  desk_id: string | null;
  cantidad_entregables: number;
  tiempo_trabajado: number;
  brands?: { nombre: string };
  profiles?: { nombre: string };
}

export interface TaskStats {
  total: number;
  backlog: number;
  en_proceso: number;
  en_revision: number;
  aprobado: number;
  entregado: number;
  bloqueado: number;
  atrasadas: number;
}

export interface UrgentTask {
  id: string;
  titulo_tarea: string;
  fecha_entrega: string;
  dias_restantes: number;
  prioridad: string;
  estado: string;
  brand_name: string;
}

export interface ResponsableMetric {
  id: string;
  nombre: string;
  avatar_url?: string | null;
  total: number;
  completadas: number;
  enProgreso: number;
  tiempoTotal: number;
  entregables: number;
}

export interface BrandMetric {
  id: string;
  nombre: string;
  total: number;
  completadas: number;
  tiempoTotal: number;
  entregables: number;
}

export const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--info))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(220, 70%, 50%)',
  'hsl(280, 70%, 50%)',
  'hsl(340, 70%, 50%)',
];

export const formatTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

export const calcStats = (taskList: Task[], ahora = new Date()): TaskStats => {
  const today = new Date(ahora);
  today.setHours(0, 0, 0, 0);
  const s: TaskStats = {
    total: taskList.length,
    backlog: 0, en_proceso: 0, en_revision: 0,
    aprobado: 0, entregado: 0, bloqueado: 0, atrasadas: 0,
  };
  taskList.forEach(task => {
    if (task.estado in s) {
      s[task.estado as keyof TaskStats]++;
    }
    if (task.fecha_entrega) {
      const [yy, mm, dd] = (task.fecha_entrega || '').split('T')[0].split('-').map(Number);
      const fechaEntrega = new Date(yy, mm - 1, dd);
      const diasRestantes = Math.ceil((fechaEntrega.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diasRestantes < 0 && !['entregado', 'aprobado', 'revision_cliente'].includes(task.estado)) {
        s.atrasadas++;
      }
    }
  });
  return s;
};
