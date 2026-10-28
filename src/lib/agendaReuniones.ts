import { fechaReunion, type Reunion, type VistaReuniones } from './reuniones';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_COMPLETOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const fechaCivil = (dia: string) => new Date(`${dia.slice(0, 10)}T12:00:00Z`);

export function sumarDias(dia: string, cantidad: number) {
  const fecha = fechaCivil(dia);
  fecha.setUTCDate(fecha.getUTCDate() + cantidad);
  return fecha.toISOString().slice(0, 10);
}

export function agruparPorDia(eventos: Reunion[]) {
  const grupos = new Map<string, Reunion[]>();
  for (const reunion of [...eventos].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))) {
    const dia = fechaReunion(reunion.start);
    const grupo = grupos.get(dia) ?? [];
    grupo.push(reunion);
    grupos.set(dia, grupo);
  }
  return [...grupos].sort(([a], [b]) => a.localeCompare(b)).map(([dia, reuniones]) => ({ dia, reuniones }));
}

export function etiquetaDia(dia: string, now: number) {
  const fecha = fechaCivil(dia);
  const hoy = fechaReunion(now);
  const prefijo = dia === hoy ? 'Hoy · ' : dia === sumarDias(hoy, 1) ? 'Mañana · ' : '';
  return `${prefijo}${DIAS[fecha.getUTCDay()]} ${fecha.getUTCDate()} ${MESES[fecha.getUTCMonth()]}`;
}

export function etiquetaPeriodo(inicio: string, fin: string, vista: VistaReuniones) {
  const a = fechaCivil(inicio), b = fechaCivil(fin);
  if (vista === 'Mes') return `${MESES_COMPLETOS[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  const cruzaAno = a.getUTCFullYear() !== b.getUTCFullYear();
  const mesInicial = cruzaAno || a.getUTCMonth() !== b.getUTCMonth() ? ` ${MESES[a.getUTCMonth()]}` : '';
  return `${a.getUTCDate()}${mesInicial}${cruzaAno ? ` ${a.getUTCFullYear()}` : ''} – ${b.getUTCDate()} ${MESES[b.getUTCMonth()]}${cruzaAno ? ` ${b.getUTCFullYear()}` : ''}`;
}

/** Celdas de lunes a domingo, completando únicamente las semanas visibles. */
export function celdasMes(dia: string): (string | null)[] {
  const fecha = fechaCivil(dia);
  const primero = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 1));
  const ultimo = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0));
  const celdas: (string | null)[] = Array((primero.getUTCDay() + 6) % 7).fill(null);
  for (let n = 1; n <= ultimo.getUTCDate(); n++) celdas.push(`${dia.slice(0, 7)}-${String(n).padStart(2, '0')}`);
  while (celdas.length % 7) celdas.push(null);
  return celdas;
}

/** Siguiente cita de los días posteriores; Hoy ya presenta sus propias próximas. */
export function siguienteReunion(eventos: Reunion[], now: number): Reunion | null {
  const hoy = fechaReunion(now);
  return eventos.filter(e => Date.parse(e.start) > now && fechaReunion(e.start) > hoy)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0] ?? null;
}

export function etiquetaSiguiente(reunion: Reunion, now: number) {
  const dia = fechaReunion(reunion.start);
  const etiqueta = dia === sumarDias(fechaReunion(now), 1) ? 'Mañana' : etiquetaDia(dia, now);
  const hora = new Date(reunion.start).toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hour12: false });
  return `${etiqueta.charAt(0).toUpperCase()}${etiqueta.slice(1)} · ${hora} ${reunion.summary}`;
}
