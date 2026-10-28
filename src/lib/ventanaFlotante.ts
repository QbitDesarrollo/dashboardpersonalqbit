import { fechaReunion } from './reuniones';

type Registro = Pick<Storage, 'getItem' | 'setItem'>;
export interface Tamano { width: number; height: number }
export interface VentanaCompatible {
  self: unknown;
  top: unknown;
  documentPictureInPicture?: unknown;
}
const PREFERENCIA = 'tiusdei:pip:auto';
const TAMANO = 'tiusdei:pip:size';

export function soportada(win: VentanaCompatible): boolean {
  try { return !!win.documentPictureInPicture && win.self === win.top; } catch { return false; }
}
export function leerPreferencia(storage: Registro): boolean {
  try { return storage.getItem(PREFERENCIA) !== 'false'; } catch { return true; }
}
export function guardarPreferencia(storage: Registro, activa: boolean) {
  try { storage.setItem(PREFERENCIA, String(activa)); } catch { /* Almacenamiento bloqueado. */ }
}
export function limitarTamano(size: Partial<Tamano>): Tamano {
  const limitar = (n: number | undefined, min: number, max: number, fallback: number) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.round(Math.max(min, Math.min(max, n))) : fallback;
  return { width: limitar(size.width, 280, 480, 320), height: limitar(size.height, 160, 360, 210) };
}
export function leerTamano(storage: Registro): Tamano {
  try {
    const size: Partial<Tamano> = JSON.parse(storage.getItem(TAMANO) ?? '{}') ?? {};
    return limitarTamano((size.width ?? 0) > 480 || (size.height ?? 0) > 360 ? {} : size);
  }
  catch { return limitarTamano({}); }
}
export function guardarTamano(storage: Registro, size: Tamano) {
  try { storage.setItem(TAMANO, JSON.stringify(limitarTamano(size))); } catch { /* Almacenamiento bloqueado. */ }
}

/** Extract editor content without rendering its markup in the UI. */
export function textoPreview(html?: string | null): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html.replace(/<\/?(?:p|div|li|ul|ol|br|h[1-6]|blockquote)\b[^>]*>/gi, ' '), 'text/html');
  doc.querySelectorAll('script, style, template').forEach(node => node.remove());
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export interface FilasFlotantes { descripcion?: boolean; personas?: boolean; reunion?: boolean; estimacion?: boolean }
export function alturaFlotante(filas: FilasFlotantes): number {
  return 160 + (filas.descripcion ? 44 : 0) + (filas.personas ? 22 : 0)
    + (filas.reunion ? 32 : 0) + (filas.estimacion ? 18 : 0);
}

export function subtareaLista(task: { check_done?: boolean; estado?: string }): boolean {
  return !!task.check_done || task.estado === 'entregado' || task.estado === 'aprobado';
}
export function entregaFlotante(fecha: string, now: number): string {
  const dia = fecha.slice(0, 10);
  const hoy = fechaReunion(now);
  if (dia === hoy) return 'Entrega hoy';
  const manana = new Date(`${hoy}T12:00:00-05:00`).getTime() + 86400000;
  if (dia === fechaReunion(manana)) return 'Entrega mañana';
  const fechaCivil = new Date(`${dia}T12:00:00-05:00`);
  const formato = new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', day: 'numeric', month: 'short', ...(dia > hoy ? { weekday: 'short' as const } : {}) });
  const partes = formato.formatToParts(fechaCivil);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find(p => p.type === tipo)?.value.replace(/\.$/, '') ?? '';
  const etiqueta = [dia > hoy ? parte('weekday') : '', parte('day'), parte('month')].filter(Boolean).join(' ');
  return dia < hoy ? `Vencida · ${etiqueta}` : `Entrega ${etiqueta}`;
}
