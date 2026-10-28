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
  projects?: { nombre: string } | null;
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

/** Estados que Tiusdei da por listos o en manos del cliente: no cuentan como atrasados ni urgentes. */
const ESTADOS_SIN_ATRASO = ['entregado', 'aprobado', 'revision_cliente'];

const diasHastaEntrega = (fechaEntrega: string, hoy: Date): number => {
  const [yy, mm, dd] = fechaEntrega.split('T')[0].split('-').map(Number);
  const fecha = new Date(yy, mm - 1, dd);
  return Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
};

const inicioDelDia = (ahora: Date): Date => {
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  return hoy;
};

/** Pendientes de la más atrasada a la más lejana; ventana predeterminada de 2 días. */
export const tareasUrgentes = (taskList: Task[], ahora = new Date(), ventanaDias = 2): UrgentTask[] => {
  const hoy = inicioDelDia(ahora);
  return taskList
    .filter((task) => !!task.fecha_entrega && !ESTADOS_SIN_ATRASO.includes(task.estado))
    .map((task) => ({
      id: task.id,
      titulo_tarea: task.titulo_tarea,
      fecha_entrega: task.fecha_entrega,
      dias_restantes: diasHastaEntrega(task.fecha_entrega, hoy),
      prioridad: task.prioridad,
      estado: task.estado,
      brand_name: task.brands?.nombre || 'Sin marca',
    }))
    .filter((task) => task.dias_restantes <= ventanaDias)
    .sort((a, b) => a.dias_restantes - b.dias_restantes);
};

export const calcStats = (taskList: Task[], ahora = new Date()): TaskStats => {
  const today = inicioDelDia(ahora);
  const s: TaskStats = {
    total: taskList.length,
    backlog: 0, en_proceso: 0, en_revision: 0,
    aprobado: 0, entregado: 0, bloqueado: 0, atrasadas: 0,
  };
  taskList.forEach(task => {
    if (task.estado in s) {
      s[task.estado as keyof TaskStats]++;
    }
    if (task.fecha_entrega && diasHastaEntrega(task.fecha_entrega, today) < 0 && !ESTADOS_SIN_ATRASO.includes(task.estado)) {
      s.atrasadas++;
    }
  });
  return s;
};
