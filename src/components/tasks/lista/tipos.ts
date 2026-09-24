/** Shapes used by the Tasks page list. */

export interface Task {
  id: string;
  check_done: boolean;
  brand_id: string;
  desk_id: string | null;
  titulo_tarea: string;
  detalle: string | null;
  cantidad_entregables: number;
  responsable_user_id: string | null;
  departamento: string | null;
  department_id: string | null;
  department_nombre?: string | null;
  department_color?: string | null;
  project_id?: string | null;
  prioridad: 'alta' | 'media' | 'baja';
  estado: 'backlog' | 'en_proceso' | 'en_revision' | 'revision_interna' | 'revision_cliente' | 'ajustes' | 'aprobado' | 'entregado' | 'bloqueado';
  ajustes_count?: number;
  fecha_inicio: string | null;
  fecha_entrega: string;
  fecha_cliente?: string | null;
  client_board_id?: string | null;
  folder_id?: string | null;
  folder_nombre?: string | null;
  enlaces: string[] | null;
  estado_envio: 'pendiente' | 'enviado';
  qa_checklist: unknown;
  created_at: string;
  updated_at: string;
  tiempo_trabajado: number;
  timer_activo: boolean;
  timer_inicio: string | null;
  sprint_id?: string | null;
  story_points?: number | null;
  feature_id?: string | null;
  is_favorite?: boolean;
  brands?: { nombre: string };
  desks?: { nombre: string };
  profiles?: { nombre: string };
  responsables?: { user_id: string; nombre: string; avatar_url?: string | null }[];
  feature?: { name: string } | null;
  sprint?: { name: string } | null;
  google_event_id?: string | null;
  task_type_id?: string | null;
  task_type?: { nombre: string } | null;
  tipo_entregable_id?: string | null;
  deliverable_type?: { nombre: string } | null;
  created_by?: string | null;
  created_by_profile?: { nombre: string; avatar_url?: string | null } | null;
  created_by_rol?: string | null;
  is_read?: boolean;
  read_count?: number;
  deliverable_types_list?: { tipo_entregable_id: string; nombre: string; cantidad: number }[];
  estimated_hours?: number | null;
  recurrence_type?: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
  recurrence_interval?: number | null;
  recurrence_end_date?: string | null;
  recurrence_parent_id?: string | null;
  subtask_count?: number;
  subtask_done_count?: number;
  files_count?: number;
  cambios_cliente?: number;
  cambios_internos?: number;
  tiempo_por_persona?: { user_id: string; nombre: string; avatar_url: string | null; segundos: number }[];
  seguidores?: { user_id: string; nombre: string; avatar_url: string | null }[];
  me_sigue?: boolean;
}

export interface Brand {
  id: string;
  nombre: string;
}

export interface Desk {
  id: string;
  nombre: string;
}

export interface Profile {
  id: string;
  nombre: string;
  avatar_url?: string | null;
}

export type ColKey = 'marca' | 'mesa' | 'depto' | 'responsable' | 'entregables' | 'timer' | 'archivos' | 'tipo' | 'prioridad' | 'estado' | 'entrega' | 'dias' | 'enlace' | 'autor' | 'creado';
