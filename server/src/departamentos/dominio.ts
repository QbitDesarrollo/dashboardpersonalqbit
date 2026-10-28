/**
 * A diferencia de ESTADOS_SIN_ATRASO (dashboardDatos), revisión del cliente
 * sigue abierta: no está terminada. El enum actual de tasks no tiene cancelado,
 * pero se excluye explícitamente si existe en datos históricos o futuros.
 */
export const ESTADOS_CERRADOS = ['entregado', 'aprobado', 'cancelado'];

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
