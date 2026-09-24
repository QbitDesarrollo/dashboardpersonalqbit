/** Pure helpers for the task list: labels, colors and delivery-date math. */

export const getPriorityColor = (prioridad: string) => {
  switch (prioridad) {
    case 'alta': return 'bg-priority-high text-white';
    case 'media': return 'bg-priority-medium text-black';
    case 'baja': return 'bg-priority-low text-white';
    default: return 'bg-muted text-muted-foreground';
  }
};

export const getStatusColor = (estado: string) => {
  const colors: Record<string, string> = {
    backlog: 'bg-status-backlog text-white',
    en_proceso: 'bg-status-in-progress text-white',
    en_revision: 'bg-status-in-review text-black',
    ajustes: 'bg-orange-600 text-white',
    revision_interna: 'bg-amber-500 text-white',
    revision_cliente: 'bg-purple-500 text-white',
    aprobado: 'bg-status-approved text-white',
    entregado: 'bg-status-delivered text-white',
    bloqueado: 'bg-status-blocked text-white',
  };
  return colors[estado] || 'bg-muted text-muted-foreground';
};

export const getStatusLabel = (estado: string) => {
  const labels: Record<string, string> = {
    backlog: 'Pendiente',
    en_proceso: 'En Proceso',
    en_revision: 'En Revisión',
    ajustes: 'Ajustes',
    revision_interna: 'Revisión interna',
    revision_cliente: 'Revisión cliente',
    aprobado: 'Aprobado',
    entregado: 'Entregado',
    bloqueado: 'Bloqueado',
  };
  return labels[estado] || estado;
};

export const getDepartmentColor = (departamento: string | null) => {
  if (!departamento) return 'bg-muted text-muted-foreground';
  const d = departamento.toUpperCase().trim();
  const map: Record<string, string> = {
    MESA: 'bg-blue-500/90 text-white',
    DISEÑO: 'bg-purple-500/90 text-white',
    DISENO: 'bg-purple-500/90 text-white',
    PRODUCCIÓN: 'bg-amber-500/90 text-white',
    PRODUCCION: 'bg-amber-500/90 text-white',
    CUENTAS: 'bg-emerald-500/90 text-white',
    DESARROLLO: 'bg-cyan-500/90 text-white',
    MARKETING: 'bg-pink-500/90 text-white',
    QA: 'bg-orange-500/90 text-white',
    ADMIN: 'bg-slate-500/90 text-white',
  };
  return map[d] || 'bg-primary/80 text-primary-foreground';
};

export const parseLocalDate = (dateStr: string | null | undefined): Date => {
  if (!dateStr) return new Date(NaN);
  // Handle ISO format "2026-02-16T00:00:00.000Z" and plain "2026-02-16"
  const clean = dateStr.substring(0, 10);
  const [y, m, d] = clean.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const getDaysRemaining = (fechaEntrega: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const entrega = parseLocalDate(fechaEntrega);
  return Math.ceil((entrega.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

/** A date-only value (YYYY-MM-DD, with or without time) as d/m/yyyy on the same calendar day, in any time zone. */
export const fechaCorta = (valor: string | null | undefined) =>
  valor ? parseLocalDate(valor).toLocaleDateString('es-ES') : 'Sin fecha';
