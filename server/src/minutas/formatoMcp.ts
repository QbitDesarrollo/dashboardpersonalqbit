/**
 * Shape minutas for the MCP agent: plain labels, names instead of ids where it helps,
 * and every instant shown in Ecuador time (the server and MySQL run in UTC).
 */

const ZONA = 'America/Guayaquil';

const ESTADO_MINUTA: Record<string, string> = { borrador: 'Borrador', publicada: 'Publicada' };

// Same labels as search_tasks/get_task in the MCP API.
const ESTADO_TAREA: Record<string, string> = {
  backlog: 'Pendiente', en_proceso: 'En proceso', en_revision: 'Revisión interna', revision_interna: 'Revisión interna',
  revision_cliente: 'Revisión cliente', ajustes: 'Ajustes', aprobado: 'Aprobado', entregado: 'Entregado', bloqueado: 'Bloqueado',
};

/** 'YYYY-MM-DD HH:mm' in Guayaquil (UTC-5, no daylight saving). */
export function horaEcuador(valor: Date | string | null | undefined): string | null {
  if (!valor) return null;
  const d = new Date(new Date(valor).getTime() - 5 * 3600_000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

/** Today's date (YYYY-MM-DD) in Guayaquil: after 19:00 there, UTC is already tomorrow. */
export const hoyEcuador = (ahora = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(ahora);

/** Point status as the screen names it; points owed by the client read differently. */
export function etiquetaEstadoPunto(estado: string, responsableCliente: boolean): string {
  if (responsableCliente && (estado === 'pendiente' || estado === 'en_curso')) return 'Esperando al cliente';
  if (responsableCliente && (estado === 'completado' || estado === 'aprobado')) return 'Recibido';
  const etiquetas: Record<string, string> = {
    pendiente: 'Pendiente', en_curso: 'En curso', completado: 'Completado', aprobado: 'Aprobado por el cliente', descartado: 'Descartado',
  };
  return etiquetas[estado] ?? estado;
}

const progresoEn = (p: { total: number; cerrados: number; enCurso: number }) => ({ total: p.total, closed: p.cerrados, inProgress: p.enCurso });

/* eslint-disable @typescript-eslint/no-explicit-any -- shapes come from cargarDetalle/listarMinutas */
export function resumenParaAgente(m: any, frontendUrl: string) {
  return {
    id: m.id,
    code: m.codigo,
    brand: m.brand_nombre,
    project: m.project_nombre ?? null,
    title: m.titulo,
    date: m.fecha,
    status: ESTADO_MINUTA[m.estado] ?? m.estado,
    owner: m.owner?.nombre ?? null,
    progress: progresoEn(m.progreso),
    url: `${frontendUrl}/minutas/${m.id}`,
  };
}

export function minutaParaAgente(m: any, frontendUrl: string) {
  return {
    id: m.id,
    code: m.codigo,
    brand: m.brand_nombre,
    project: m.project_nombre ?? null,
    title: m.titulo,
    date: m.fecha,
    status: ESTADO_MINUTA[m.estado] ?? m.estado,
    owner: m.owner?.nombre ?? null,
    members: (m.miembros ?? []).map((p: any) => p.nombre),
    summary: m.resumen ?? null,
    progress: progresoEn(m.progreso),
    url: `${frontendUrl}/minutas/${m.id}`,
    timezone: ZONA,
    points: (m.items ?? []).map((i: any) => ({
      id: i.id,
      code: `${m.numero}.${i.numero}`,
      title: i.titulo,
      description: i.descripcion ?? null,
      status: etiquetaEstadoPunto(i.estado, i.responsable_cliente),
      assignee: i.responsable_cliente ? 'Cliente' : i.responsable?.nombre ?? null,
      dueDate: i.fecha_compromiso ?? null,
      visibleToClient: i.visible_cliente,
      whatWasDone: i.resolucion ?? null,
      closedBy: i.completado_por?.nombre ?? null,
      closedAt: horaEcuador(i.completado_en),
      approvedAt: horaEcuador(i.aprobado_en),
      discardReason: i.motivo_descarte ?? null,
      evidence: (i.evidencias ?? []).map((e: any) => ({ type: e.tipo, name: e.nombre, url: e.url })),
      tasks: (i.tareas ?? []).map((t: any) => ({
        id: t.id, title: t.titulo_tarea, status: ESTADO_TAREA[t.estado] ?? t.estado, dueDate: t.fecha_entrega ?? null, assignee: t.responsable?.nombre ?? null,
      })),
      notes: (i.notas ?? []).map((n: any) => ({ type: n.tipo, text: n.texto, at: horaEcuador(n.created_at), author: n.autor?.nombre ?? null })),
    })),
  };
}
