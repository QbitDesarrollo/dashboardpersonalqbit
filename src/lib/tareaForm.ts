/**
 * Pure rules of the task form: initial values, values from an existing task,
 * validation and the payload sent to the API. Shared by every place that creates or edits tasks.
 */

export type EstadoTarea =
  | 'backlog' | 'en_proceso' | 'en_revision' | 'revision_interna' | 'revision_cliente' | 'ajustes' | 'aprobado' | 'entregado' | 'bloqueado';
export type PrioridadTarea = 'alta' | 'media' | 'baja';

export interface EntregableForm {
  tipo_entregable_id: string;
  cantidad: number;
}

export interface TareaFormValues {
  titulo_tarea: string;
  detalle: string;
  fecha_cliente: string;
  brand_id: string;
  project_id: string;
  desk_id: string;
  responsable_user_id: string;
  responsable_ids: string[];
  departamento: string;
  department_id: string;
  prioridad: PrioridadTarea;
  estado: EstadoTarea;
  fecha_inicio: string;
  fecha_entrega: string;
  cantidad_entregables: number;
  enlaces: string;
  task_type_id: string;
  tipo_entregable_id: string;
  entregables: EntregableForm[];
  estimated_hours: string;
  recurrence_type: string;
  recurrence_interval: number;
  recurrence_end_date: string;
}

/** Selection remembered from the last created task (localStorage 'nueva_tarea_defaults'). */
export type Recordados = Partial<Pick<TareaFormValues,
  'brand_id' | 'desk_id' | 'departamento' | 'department_id' | 'project_id' | 'task_type_id' | 'prioridad'>>;

/** Fields of an existing task that the form edits. */
export interface TareaEditable {
  titulo_tarea: string;
  detalle: string | null;
  brand_id: string;
  desk_id: string | null;
  responsable_user_id: string | null;
  responsables?: { user_id: string }[];
  departamento: string | null;
  department_id: string | null;
  project_id?: string | null;
  prioridad: PrioridadTarea;
  estado: EstadoTarea;
  fecha_inicio: string | null;
  fecha_entrega: string;
  fecha_cliente?: string | null;
  cantidad_entregables: number;
  enlaces: string[] | null;
  task_type_id?: string | null;
  tipo_entregable_id?: string | null;
  deliverable_types_list?: { tipo_entregable_id: string; cantidad: number }[];
  estimated_hours?: number | null;
  recurrence_type?: string | null;
  recurrence_interval?: number | null;
  recurrence_end_date?: string | null;
}

export function valoresNuevos({ recordados = {}, mesaPorDefecto = '', prellenado = {} }: {
  recordados?: Recordados;
  mesaPorDefecto?: string;
  prellenado?: Partial<TareaFormValues>;
}): TareaFormValues {
  return {
    titulo_tarea: '',
    detalle: '',
    brand_id: recordados.brand_id || '',
    project_id: recordados.project_id || '',
    desk_id: mesaPorDefecto || recordados.desk_id || '',
    responsable_user_id: '',
    responsable_ids: [],
    departamento: recordados.departamento || '',
    department_id: recordados.department_id || '',
    prioridad: recordados.prioridad || 'media',
    estado: 'backlog',
    fecha_inicio: '',
    fecha_entrega: '',
    fecha_cliente: '',
    cantidad_entregables: 1,
    enlaces: '',
    task_type_id: recordados.task_type_id || '',
    tipo_entregable_id: '',
    entregables: [{ tipo_entregable_id: '', cantidad: 1 }],
    estimated_hours: '',
    recurrence_type: 'none',
    recurrence_interval: 7,
    recurrence_end_date: '',
    ...prellenado,
  };
}

export function valoresDeTarea(task: TareaEditable): TareaFormValues {
  // Multi-type list first; tasks created before it only have a single type.
  const entregables = task.deliverable_types_list && task.deliverable_types_list.length > 0
    ? task.deliverable_types_list.map((dt) => ({ tipo_entregable_id: dt.tipo_entregable_id, cantidad: dt.cantidad }))
    : task.tipo_entregable_id
      ? [{ tipo_entregable_id: task.tipo_entregable_id, cantidad: task.cantidad_entregables || 1 }]
      : [{ tipo_entregable_id: '', cantidad: 1 }];

  return {
    titulo_tarea: task.titulo_tarea,
    detalle: task.detalle || '',
    brand_id: task.brand_id,
    desk_id: task.desk_id || '',
    responsable_user_id: task.responsable_user_id || '',
    responsable_ids: task.responsables?.map((r) => r.user_id) || (task.responsable_user_id ? [task.responsable_user_id] : []),
    departamento: task.departamento || '',
    department_id: task.department_id || '',
    project_id: task.project_id || '',
    prioridad: task.prioridad,
    estado: task.estado,
    fecha_inicio: task.fecha_inicio ? task.fecha_inicio.substring(0, 10) : '',
    fecha_entrega: task.fecha_entrega ? task.fecha_entrega.substring(0, 10) : '',
    fecha_cliente: task.fecha_cliente ? String(task.fecha_cliente).substring(0, 10) : '',
    cantidad_entregables: task.cantidad_entregables,
    enlaces: task.enlaces?.join('\n') || '',
    task_type_id: task.task_type_id || '',
    tipo_entregable_id: task.tipo_entregable_id || '',
    entregables,
    estimated_hours: task.estimated_hours != null ? String(task.estimated_hours) : '',
    recurrence_type: task.recurrence_type || 'none',
    recurrence_interval: task.recurrence_interval || 7,
    recurrence_end_date: task.recurrence_end_date ? task.recurrence_end_date.substring(0, 10) : '',
  };
}

/** Deliverable type and quantity are mandatory. Returns the message to show, or null when valid. */
export function validarEntregables(entregables: EntregableForm[]): { titulo: string; descripcion: string } | null {
  const validos = entregables.filter((e) => e.tipo_entregable_id);
  if (validos.length === 0) {
    return { titulo: 'Indica el tipo de entregable', descripcion: 'El tipo y el número de entregables son obligatorios.' };
  }
  if (validos.some((e) => !e.cantidad || e.cantidad < 1)) {
    return { titulo: 'Indica el número de entregables', descripcion: 'Cada tipo de entregable necesita su cantidad.' };
  }
  return null;
}

/** Body for POST /tasks and PATCH /tasks/:id. The client date is only sent for tasks on a client board. */
export function armarPayload(v: TareaFormValues, { conFechaCliente }: { conFechaCliente: boolean }) {
  const validos = v.entregables.filter((e) => e.tipo_entregable_id);
  return {
    titulo_tarea: v.titulo_tarea,
    detalle: v.detalle || null,
    brand_id: v.brand_id,
    desk_id: v.desk_id || null,
    responsable_user_id: v.responsable_ids[0] || v.responsable_user_id || null,
    responsable_ids: v.responsable_ids.length > 0 ? v.responsable_ids : (v.responsable_user_id ? [v.responsable_user_id] : []),
    departamento: v.departamento || null,
    department_id: v.department_id || null,
    project_id: v.project_id || null,
    prioridad: v.prioridad,
    estado: v.estado,
    fecha_inicio: v.fecha_inicio || null,
    fecha_entrega: v.fecha_entrega,
    ...(conFechaCliente ? { fecha_cliente: v.fecha_cliente || null } : {}),
    cantidad_entregables: validos.length > 0 ? validos.reduce((sum, e) => sum + e.cantidad, 0) : v.cantidad_entregables,
    enlaces: v.enlaces ? v.enlaces.split('\n').filter(Boolean) : null,
    task_type_id: v.task_type_id || null,
    tipo_entregable_id: validos[0]?.tipo_entregable_id || v.tipo_entregable_id || null,
    entregables: validos.map((e) => ({ tipo_entregable_id: e.tipo_entregable_id, cantidad: e.cantidad })),
    estimated_hours: v.estimated_hours ? parseFloat(v.estimated_hours) : null,
    recurrence_type: v.recurrence_type || 'none',
    recurrence_interval: v.recurrence_type === 'custom' ? v.recurrence_interval : null,
    recurrence_end_date: v.recurrence_end_date || null,
  };
}

export type PayloadTarea = ReturnType<typeof armarPayload>;

/** When an existing task's due date changes, the reason must be asked before saving. */
export function cambioDeFecha(anterior: string | null | undefined, nueva: string): { oldFecha: string | null; newFecha: string | null } | null {
  const oldFecha = anterior ? String(anterior).slice(0, 10) : null;
  const newFecha = nueva ? String(nueva).slice(0, 10) : null;
  return oldFecha !== newFecha ? { oldFecha, newFecha } : null;
}

/** Estimated hours from each deliverable type's standard time, rounded to quarter hours. */
export function horasEstimadas(
  entregables: EntregableForm[],
  tipos: { id: string; minutos_estimados?: number | null }[],
): number | null {
  const minutos = entregables.reduce((acc, e) => {
    const dt = tipos.find((d) => d.id === e.tipo_entregable_id);
    return acc + (dt?.minutos_estimados ? Number(dt.minutos_estimados) * (e.cantidad || 1) : 0);
  }, 0);
  return minutos > 0 ? Math.round((minutos / 60) * 4) / 4 : null;
}

/** What the next "Nueva tarea" starts with. */
export function recordables(v: TareaFormValues): Required<Recordados> {
  return {
    brand_id: v.brand_id, desk_id: v.desk_id, departamento: v.departamento, department_id: v.department_id,
    project_id: v.project_id, task_type_id: v.task_type_id, prioridad: v.prioridad,
  };
}
