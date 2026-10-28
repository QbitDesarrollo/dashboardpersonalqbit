import { reunionesDeHoy } from '../services/meetingsNow.js';
import { consultarDia, consultarCumplimiento } from './consultas.js';
import { calcularDia, contarEntregas, cumplimientoSemana, semanas } from './dominio.js';

export async function miDia(userId: string, now = Date.now()) {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(now);
  const inicioDia = new Date(`${hoy}T00:00:00-05:00`), finDia = new Date(inicioDia.getTime() + 86400000);
  const rango = semanas(now);
  const [datos, reuniones, actual, anterior] = await Promise.all([
    consultarDia(userId, hoy, inicioDia, finDia), reunionesDeHoy([userId], { visibles: true }),
    consultarCumplimiento(userId, rango.actual.desde, rango.actual.hasta),
    consultarCumplimiento(userId, rango.anterior.desde, rango.anterior.hasta),
  ]);
  const reu = reuniones.get(userId);
  const timers = datos.timers.map(t => {
    const start = Math.max(inicioDia.getTime(), new Date(t.start_time).getTime());
    const end = Math.min(now, t.end_time ? new Date(t.end_time).getTime() : t.status === 'active' ? now : start);
    const segundos = t.status === 'active'
      ? Math.min(12 * 3600, Math.max(0, (end - start) / 1000 - Number(t.idle_seconds || 0)))
      : Math.min(Math.max(0, (end - start) / 1000), Number(t.duration_seconds || 0));
    return { start, end, segundos };
  });
  const a = contarEntregas(actual), b = contarEntregas(anterior);
  const previo = cumplimientoSemana(b.aTiempo, b.tarde, null).porcentaje;
  return {
    ...calcularDia({ now, inicio: Date.parse(`${hoy}T08:00:00-05:00`), fin: Date.parse(`${hoy}T18:00:00-05:00`),
      ingreso: datos.ingreso ? new Date(datos.ingreso).getTime() : null, timers,
      reuniones: (reu?.eventos ?? []).map(r => ({ start: Date.parse(r.start), end: Date.parse(r.end) })),
      reunionesContadasSeg: reu?.hasta_ahora_seg ?? 0, tareas: datos.tareas }),
    calendarioDisponible: reu?.conectado ?? false,
    cumplimiento: cumplimientoSemana(a.aTiempo, a.tarde, previo),
  };
}
