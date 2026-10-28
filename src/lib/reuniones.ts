export interface IntervaloReunion { start: string; end: string }
export interface Reunion extends IntervaloReunion {
  id: string;
  summary: string;
  htmlLink: string;
  es_reunion?: boolean;
  enlace?: { url: string; plataforma: 'meet' | 'zoom' | 'teams' | 'otro' } | null;
  ubicacion?: string | null;
}

type Registro = Pick<Storage, 'getItem' | 'setItem'>;
type EventoIngreso = Pick<Reunion, 'id' | 'start'>;
const MINUTO = 60000;

export function estadoReunion(reunion: IntervaloReunion, now: number) {
  if (now >= Date.parse(reunion.end)) return 'terminada';
  return now >= Date.parse(reunion.start) ? 'en_curso' : 'proxima';
}

export function etiquetaRelativa(start: string, now: number) {
  const minutos = Math.max(0, Math.ceil((Date.parse(start) - now) / MINUTO));
  return minutos < 60 ? `en ${minutos} min` : `en ${Math.floor(minutos / 60)}h ${minutos % 60}m`;
}

export function minutosTranscurridos(start: string | number, now: number) {
  return Math.max(0, Math.floor((now - (typeof start === 'number' ? start : Date.parse(start))) / MINUTO));
}

export function progresoReunion(reunion: IntervaloReunion, now: number) {
  const inicio = Date.parse(reunion.start);
  const duracion = Date.parse(reunion.end) - inicio;
  return duracion > 0 ? Math.max(0, Math.min(1, (now - inicio) / duracion)) : 0;
}

export function duracionTotal(reuniones: IntervaloReunion[]) {
  const minutos = Math.round(reuniones.reduce((total, r) => total + Math.max(0, Date.parse(r.end) - Date.parse(r.start)), 0) / MINUTO);
  return `${Math.floor(minutos / 60)}h ${minutos % 60}m`;
}

export function fechaReunion(fecha: string | number) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(fecha));
}

function claveIngreso(reunion: EventoIngreso) {
  return `tiusdei:reunion:ingreso:${encodeURIComponent(reunion.id)}:${fechaReunion(reunion.start)}`;
}

export function leerIngreso(storage: Registro, reunion: EventoIngreso): number | null {
  try {
    const valor = storage.getItem(claveIngreso(reunion));
    const numero = valor === null || valor.trim() === '' ? NaN : Number(valor);
    return Number.isFinite(numero) && numero >= 0 ? numero : null;
  } catch { return null; }
}

export function registrarIngreso(storage: Registro, reunion: EventoIngreso, now: number) {
  try {
    if (leerIngreso(storage, reunion) === null) storage.setItem(claveIngreso(reunion), String(now));
  } catch { /* El navegador puede bloquear el almacenamiento. */ }
}
