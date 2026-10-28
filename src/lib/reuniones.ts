export interface IntervaloReunion { start: string; end: string }
export interface Reunion extends IntervaloReunion {
  id: string;
  summary: string;
  htmlLink: string;
  es_reunion?: boolean;
  es_tarea_tiusdei?: boolean;
  enlace?: { url: string; plataforma: 'meet' | 'zoom' | 'teams' | 'otro' } | null;
  ubicacion?: string | null;
}

export type VistaReuniones = 'Hoy' | 'Semana' | 'Mes';

/** Rangos y cuadrícula del calendario existente, usando días civiles de Ecuador. */
export function calendarioReuniones(now: number, vista: VistaReuniones, desplazamiento = 0) {
  const dia = new Date(`${fechaReunion(now)}T00:00:00Z`);
  let inicio: Date, fin: Date;
  const dias: (string | null)[] = [];
  if (vista === 'Mes') {
    inicio = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth() + desplazamiento, 1));
    fin = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 0));
    for (let i = 0; i < inicio.getUTCDay(); i++) dias.push(null);
  } else {
    inicio = new Date(dia);
    if (vista === 'Semana') inicio.setUTCDate(inicio.getUTCDate() - inicio.getUTCDay() + desplazamiento * 7);
    fin = new Date(inicio);
    if (vista === 'Semana') fin.setUTCDate(fin.getUTCDate() + 6);
  }
  for (let d = inicio.getTime(); d <= fin.getTime(); d += 86400000) dias.push(new Date(d).toISOString().slice(0, 10));
  return { inicio: `${inicio.toISOString().slice(0, 10)}T00:00:00-05:00`, fin: `${fin.toISOString().slice(0, 10)}T23:59:59.999-05:00`, dias };
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
