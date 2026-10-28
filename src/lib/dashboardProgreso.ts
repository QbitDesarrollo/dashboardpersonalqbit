export const ESTADOS_PROGRESO = [
  { estado: 'backlog', label: 'Pendiente', token: 'status-backlog' },
  { estado: 'en_proceso', label: 'En Proceso', token: 'status-in-progress' },
  { estado: 'en_revision', label: 'En Revisión', token: 'status-in-review' },
  { estado: 'revision_interna', label: 'Revisión interna', token: 'status-in-review' },
  { estado: 'aprobado', label: 'Aprobado', token: 'status-approved' },
  { estado: 'entregado', label: 'Entregado', token: 'status-delivered' },
  { estado: 'bloqueado', label: 'Bloqueado', token: 'status-blocked' },
  { estado: 'revision_cliente', label: 'Revisión del cliente', token: 'status-in-review' },
  { estado: 'ajustes', label: 'Ajustes', token: 'status-in-review' },
];

export function calcularProgreso(tareas: { estado: string }[]) {
  const conteos = new Map<string, number>();
  for (const t of tareas) conteos.set(t.estado, (conteos.get(t.estado) ?? 0) + 1);
  const estados = [...ESTADOS_PROGRESO];
  for (const estado of conteos.keys()) {
    if (!estados.some((s) => s.estado === estado)) estados.push({ estado, label: estado, token: 'status-backlog' });
  }
  const total = tareas.length;
  const porcentaje = (cantidad: number) => total ? cantidad * 100 / total : 0;
  return {
    total,
    porcentajeEntregadas: Math.round(porcentaje((conteos.get('entregado') ?? 0) + (conteos.get('aprobado') ?? 0))),
    segmentos: estados.map((s) => {
      const cantidad = conteos.get(s.estado) ?? 0;
      return { ...s, cantidad, proporcion: porcentaje(cantidad), porcentaje: Math.round(porcentaje(cantidad)) };
    }),
  };
}
