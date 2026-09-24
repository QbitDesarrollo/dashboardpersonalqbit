/**
 * "Nueva tarea" desde un punto de minuta reutiliza el formulario de siempre de
 * la página Tareas: el punto arma esta URL y Tareas la lee, abre su formulario
 * prellenado y, al guardar, vincula la tarea al punto y vuelve a la minuta.
 */

export interface DatosTareaDesdePunto {
  brandId: string;
  projectId: string | null;
  titulo: string;
  detalle: string;
  fechaEntrega: string | null;
  minutaItemId: string;
  minutaId: string;
}

export interface PrefillNuevaTarea {
  form: {
    titulo_tarea: string;
    detalle: string;
    brand_id: string;
    project_id: string;
    fecha_entrega: string;
    // La mesa se elige a mano: la última usada podría no atender a esta marca.
    desk_id: string;
  };
  minutaItemId: string | null;
  volver: string | null;
}

export function urlNuevaTareaDesdePunto(d: DatosTareaDesdePunto): string {
  const qs = new URLSearchParams({ nueva: '1', brand_id: d.brandId, titulo: d.titulo, detalle: d.detalle, minuta_item: d.minutaItemId, volver: `/minutas/${d.minutaId}` });
  if (d.projectId) qs.set('project_id', d.projectId);
  if (d.fechaEntrega) qs.set('fecha_entrega', d.fechaEntrega);
  return `/tareas?${qs.toString()}`;
}

export function leerPrefillNuevaTarea(qs: URLSearchParams): PrefillNuevaTarea | null {
  if (qs.get('nueva') !== '1') return null;
  const volver = qs.get('volver') ?? '';
  return {
    form: {
      titulo_tarea: qs.get('titulo') ?? '',
      detalle: qs.get('detalle') ?? '',
      brand_id: qs.get('brand_id') ?? '',
      project_id: qs.get('project_id') ?? '',
      fecha_entrega: qs.get('fecha_entrega') ?? '',
      desk_id: '',
    },
    minutaItemId: qs.get('minuta_item'),
    // Solo se vuelve a una minuta: evita que el enlace se use para redirigir a otro sitio.
    volver: /^\/minutas\/[\w-]+$/.test(volver) ? volver : null,
  };
}
