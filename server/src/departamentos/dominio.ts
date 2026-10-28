/**
 * A diferencia de ESTADOS_SIN_ATRASO (dashboardDatos), revisión del cliente
 * sigue abierta: no está terminada. El enum actual de tasks no tiene cancelado,
 * pero se excluye explícitamente si existe en datos históricos o futuros.
 */
export const ESTADOS_CERRADOS = ['entregado', 'aprobado', 'cancelado'];

export interface DepartamentoArchivo {
  id: string;
  nombre: string;
  activo: number | boolean;
  next_department_id: string | null;
}

export interface Referencias {
  tareas: number;
  historial: number;
  traspasos: number;
  plantillas: number;
  personas: number;
  mesas: number;
  etapas: number;
}

export class ErrorDepartamento extends Error {
  constructor(public status: number, mensaje: string, public referencias?: Referencias) {
    super(mensaje);
  }
}

export function exigirDepartamento(d: DepartamentoArchivo | null): asserts d is DepartamentoArchivo {
  if (!d) throw new ErrorDepartamento(404, 'Departamento no encontrado');
}

export function validarArchivo(origen: DepartamentoArchivo | null, destinoId: string | null, destino: DepartamentoArchivo | null) {
  exigirDepartamento(origen);
  if (!origen.activo) throw new ErrorDepartamento(409, 'El departamento ya está archivado');
  if (destinoId === origen.id) throw new ErrorDepartamento(400, 'El destino debe ser otro departamento');
  if (destinoId && (!destino || !destino.activo)) throw new ErrorDepartamento(400, 'El destino debe estar activo');
}

export function siguienteTrasArchivo(entradaId: string, siguienteId: string | null, origenId: string): string | null {
  return siguienteId === entradaId || siguienteId === origenId ? null : siguienteId;
}

export function validarEliminacion(d: DepartamentoArchivo | null, confirmacion: string, referencias: Referencias) {
  exigirDepartamento(d);
  if (d.activo) throw new ErrorDepartamento(409, 'Primero archívalo');
  if (confirmacion !== d.nombre) throw new ErrorDepartamento(400, 'Escribe el nombre exacto');
  if (Object.values(referencias).some(n => n > 0)) throw new ErrorDepartamento(409, 'El departamento tiene referencias', referencias);
}

export interface FilaResumen {
  id: string;
  nombre: string;
  orden: number;
  color: string | null;
  next_department_id: string | null;
  next_department_nombre: string | null;
  activo: boolean | number;
  personas: number | string;
  tareas_abiertas: number | string;
  tareas_total: number | string;
}

export interface FilaCanal {
  department_id: string;
  nombre: string;
}

export function formarResumen(filas: readonly FilaResumen[], canales: readonly FilaCanal[]) {
  const porDepartamento = new Map<string, string[]>();
  for (const canal of canales) {
    const nombres = porDepartamento.get(canal.department_id) ?? [];
    nombres.push(canal.nombre);
    porDepartamento.set(canal.department_id, nombres);
  }
  return filas.map(fila => ({
    ...fila,
    activo: Boolean(fila.activo),
    personas: Number(fila.personas),
    tareas_abiertas: Number(fila.tareas_abiertas),
    tareas_total: Number(fila.tareas_total),
    canales: porDepartamento.get(fila.id) ?? [],
  }));
}
