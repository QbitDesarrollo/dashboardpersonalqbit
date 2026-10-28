export interface Intervalo { start: number; end: number }
interface EntradaDia {
  now: number; inicio: number; fin: number; ingreso: number | null;
  timers: (Intervalo & { segundos: number })[];
  reuniones: Intervalo[]; reunionesContadasSeg: number;
  tareas: { completadas: number; total: number };
}
type Tipo = 'tareas' | 'reuniones' | 'libre' | 'pendiente';

function segundosUnidos(intervalos: Intervalo[], inicio: number, fin: number) {
  let hasta = inicio, total = 0;
  for (const iv of [...intervalos].sort((a, b) => a.start - b.start)) {
    const a = Math.max(inicio, hasta, iv.start), b = Math.min(fin, iv.end);
    if (b > a) { total += (b - a) / 1000; hasta = b; }
  }
  return total;
}

export function calcularDia(d: EntradaDia) {
  const jornada = d.fin - d.inicio;
  const porcentaje = (n: number) => Math.max(0, Math.min(100, (n - d.inicio) / jornada * 100));
  const limites = [...new Set([d.inicio, d.fin, d.now, ...d.timers.flatMap(t => [t.start, t.end]), ...d.reuniones.flatMap(r => [r.start, r.end])])]
    .filter(n => n >= d.inicio && n <= d.fin).sort((a, b) => a - b);
  const segmentos: { tipo: Tipo; desde: number; hasta: number }[] = [];
  for (let i = 1; i < limites.length; i++) {
    const a = limites[i - 1], b = limites[i];
    const tipo: Tipo = a < d.now && d.timers.some(t => t.start <= a && t.end > a) ? 'tareas'
      : d.reuniones.some(r => r.start <= a && r.end > a) ? 'reuniones' : a < d.now ? 'libre' : 'pendiente';
    const ultimo = segmentos.at(-1);
    if (ultimo?.tipo === tipo) ultimo.hasta = porcentaje(b);
    else segmentos.push({ tipo, desde: porcentaje(a), hasta: porcentaje(b) });
  }
  return {
    ingreso: d.ingreso === null ? null : new Date(d.ingreso).toISOString(),
    inicio: new Date(d.inicio).toISOString(), fin: new Date(d.fin).toISOString(), ahora: porcentaje(d.now), segmentos,
    jornadaSeg: jornada / 1000,
    trabajadoSeg: Math.round(d.timers.reduce((s, t) => s + Math.max(0, t.segundos), 0) + d.reunionesContadasSeg),
    focoSeg: Math.max(0, (d.fin - Math.max(d.inicio, d.now)) / 1000 - segundosUnidos(d.reuniones, Math.max(d.inicio, d.now), d.fin)),
    reuniones: {
      total: d.reuniones.length,
      segundos: segundosUnidos(d.reuniones, -Infinity, Infinity),
      hechas: d.reuniones.filter(r => r.end <= d.now).length,
      enCurso: d.reuniones.filter(r => r.start <= d.now && r.end > d.now).length,
      porVenir: d.reuniones.filter(r => r.start > d.now).length,
    }, tareas: d.tareas,
  };
}

export function cumplimientoSemana(aTiempo: number, tarde: number, anterior: number | null) {
  const porcentaje = aTiempo + tarde > 0 ? Number((100 * aTiempo / (aTiempo + tarde)).toFixed(1)) : null;
  return { porcentaje, estado: porcentaje === null ? 'Sin entregas' : porcentaje >= 80 ? 'Vas bien' : porcentaje >= 60 ? 'Atención' : 'En riesgo',
    delta: porcentaje !== null && anterior !== null ? Number((porcentaje - anterior).toFixed(1)) : null };
}

/** Mismo denominador del reporte: primera entrega y estado actual de revisión/entrega. */
export function contarEntregas(tareas: { estado: string; objetivo: string | null; entregada: Date | null }[]) {
  let aTiempo = 0, tarde = 0;
  for (const t of tareas) {
    if (!t.entregada || !['entregado', 'aprobado', 'revision_cliente', 'revision_interna', 'en_revision'].includes(t.estado)) continue;
    // El reporte compara el cierre del DATE en UTC; no se cambia la regla al mostrarla en Ecuador.
    if (!t.objetivo || t.entregada.getTime() <= Date.parse(`${t.objetivo}T23:59:59.999Z`)) aTiempo++;
    else tarde++;
  }
  return { aTiempo, tarde };
}

export function semanas(now: number) {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(now);
  const lunes = new Date(`${hoy}T00:00:00Z`);
  lunes.setUTCDate(lunes.getUTCDate() - (lunes.getUTCDay() + 6) % 7);
  const fecha = (dias: number) => new Date(lunes.getTime() + dias * 86400000).toISOString().slice(0, 10);
  return { actual: { desde: fecha(0), hasta: fecha(6) }, anterior: { desde: fecha(-7), hasta: fecha(-1) } };
}
