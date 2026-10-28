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
  const limitar = (n: number | undefined, min: number, fallback: number) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.round(Math.max(min, Math.min(520, n))) : fallback;
  return { width: limitar(size.width, 300, 360), height: limitar(size.height, 220, 380) };
}
export function leerTamano(storage: Registro): Tamano {
  try { return limitarTamano(JSON.parse(storage.getItem(TAMANO) ?? '{}') ?? {}); }
  catch { return limitarTamano({}); }
}
export function guardarTamano(storage: Registro, size: Tamano) {
  try { storage.setItem(TAMANO, JSON.stringify(limitarTamano(size))); } catch { /* Almacenamiento bloqueado. */ }
}

export function subtareaLista(task: { check_done?: boolean; estado?: string }): boolean {
  return !!task.check_done || task.estado === 'entregado' || task.estado === 'aprobado';
}
export function entregaFlotante(fecha: string, now: number): string {
  const dia = fecha.slice(0, 10);
  const hora = fecha.match(/[T ](\d{2}:\d{2})/)?.[1];
  const etiqueta = dia === fechaReunion(now) ? 'hoy' : new Date(`${dia}T12:00:00-05:00`).toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil', day: 'numeric', month: 'short' });
  return `Entrega ${etiqueta}${hora ? ` ${hora}` : ''}`;
}
