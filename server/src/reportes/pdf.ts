import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import { ErrorReporte, fechaCorta } from './dominio.js';
import type { ContenidoReporte, Fila } from './generador.js';

/**
 * Server-side PDF of a weekly project report (same libraries as the minutas PDF in the web app).
 * Page one answers "how are we doing?" at a glance; the detail of the week and the rest of the project follow.
 */

type Rgb = [number, number, number];
const MARCA: Rgb = [26, 188, 156];
const TEXTO: Rgb = [31, 41, 55];
const GRIS: Rgb = [107, 114, 128];
const FONDO: Rgb = [243, 244, 246];
const LINEA: Rgb = [229, 231, 235];
const LUZ: Record<string, Rgb> = { verde: [16, 185, 129], amarillo: [245, 158, 11], rojo: [239, 68, 68] };
const ROJO_TEXTO: Rgb = [185, 28, 28];
const VERDE_TEXTO: Rgb = [4, 120, 87];
const AMBAR_TEXTO: Rgb = [180, 83, 9];
const LOGO = path.join(process.cwd(), '..', 'public', 'pwa-192x192.png');

// The standard PDF fonts only draw Latin-1 plus a few typographic signs; anything else (arrows, emoji) is replaced or dropped.
const PERMITIDOS = /[^\u0000-ÿ“”‘’—–•…€›]/g;
export function limpiarPdf(texto: string): string {
  return texto.replace(/→/g, '›').replace(/←/g, '‹').replace(PERMITIDOS, '').replace(/ {2,}/g, ' ').trim();
}

export function nombreArchivoPdf(c: Pick<ContenidoReporte, 'proyecto' | 'periodo'>): string {
  const limpio = c.proyecto.nombre.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `Reporte ${limpio} ${c.periodo.desde} a ${c.periodo.hasta}.pdf`;
}

const rango = (r: { desde: string; hasta: string }) => `${fechaCorta(r.desde)} – ${fechaCorta(r.hasta)}`;
const rangoAnio = (c: ContenidoReporte) => `${rango(c.periodo)} ${c.periodo.hasta.slice(0, 4)}`;
const horaEcuador = (iso: string) => new Date(Date.parse(iso) - 5 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
const fecha = (f: string | null) => (f ? fechaCorta(f) : 'Sin fecha');
const quien = (r: string | null) => r ?? 'Sin responsable';
/** Overdue work in red, late deliveries in amber and deliveries on time in green, so a table reads at a glance. */
export function colorResultado(texto: string): 'rojo' | 'ambar' | 'verde' | null {
  if (texto.startsWith('Entregada')) return /tarde/.test(texto) ? 'ambar' : 'verde';
  return /atraso/.test(texto) ? 'rojo' : null;
}
const TONO: Record<'rojo' | 'ambar' | 'verde', Rgb> = { rojo: ROJO_TEXTO, ambar: AMBAR_TEXTO, verde: VERDE_TEXTO };

export function generarPdf(c: ContenidoReporte, { aprobadoPor }: { aprobadoPor?: string | null } = {}): Buffer {
  if (c.version !== 3) throw new ErrorReporte(409, 'Regenera este reporte para verlo con el formato nuevo.');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const m = 14;
  const util = ancho - m * 2;
  const t = (s: string) => limpiarPdf(s);
  let y = 0;

  const espacio = (necesario: number) => { if (y + necesario > alto - 18) { doc.addPage(); y = 18; } };
  const parrafo = (texto: string, tam = 10, color: Rgb = TEXTO, sangria = 0, estilo: 'normal' | 'italic' = 'normal') => {
    doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(...color);
    for (const linea of doc.splitTextToSize(t(texto), util - sangria) as string[]) {
      espacio(tam * 0.5);
      doc.text(linea, m + sangria, y);
      y += tam * 0.45;
    }
  };
  /** Section title with a one-line explanation of what the table holds. */
  const seccion = (titulo: string, explicacion?: string) => {
    espacio(26);
    y += 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...MARCA);
    doc.text(t(titulo), m, y);
    doc.setDrawColor(...MARCA); doc.setLineWidth(0.4); doc.line(m, y + 1.8, m + util, y + 1.8);
    y += 6.5;
    if (explicacion) { parrafo(explicacion, 8.5, GRIS, 0, 'italic'); y += 1.5; }
  };
  const tabla = (head: string[], body: RowInput[], anchos: number[], colorear?: (fila: number, columna: number) => Rgb | null) => {
    autoTable(doc, {
      startY: y,
      margin: { left: m, right: m, top: 18, bottom: 18 },
      head: [head],
      body,
      theme: 'plain',
      // A task never splits across two pages.
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica', fontSize: 8.5, textColor: TEXTO, valign: 'middle', overflow: 'linebreak',
        cellPadding: { top: 2.4, bottom: 2.4, left: 2, right: 2 }, lineColor: LINEA, lineWidth: { bottom: 0.25 },
      },
      headStyles: { fillColor: MARCA, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, lineWidth: 0 },
      columnStyles: Object.fromEntries(anchos.map((a, i) => [i, { cellWidth: util * a }])),
      didParseCell: (d) => {
        if (d.section !== 'body') return;
        if (d.column.index === 0) d.cell.styles.fontStyle = 'bold';
        const color = colorear?.(d.row.index, d.column.index);
        if (color) d.cell.styles.textColor = color;
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  };
  /** The usual table of tasks: title, owner, due date and how it stood. */
  const tablaTareas = (filas: Fila[], columnaFecha: string, columnaResultado: string) =>
    tabla(
      ['Tarea', 'Responsable', columnaFecha, columnaResultado],
      filas.map((f) => [t(f.titulo), t(quien(f.responsable)), fecha(f.vence), t(f.resultado)]),
      [0.4, 0.17, 0.1, 0.33],
      (fila, columna) => { const tono = columna === 3 ? colorResultado(filas[fila].resultado) : null; return tono ? TONO[tono] : null; },
    );

  // Header band: the title wraps on its own lines; brand and dates go below it, never beside it.
  let x = m;
  const logo = (() => { try { return fs.readFileSync(LOGO).toString('base64'); } catch { return null; } })();
  if (logo) x = m + 20;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  const titulo = doc.splitTextToSize(t(`Reporte semanal · ${c.proyecto.nombre}`), ancho - m - x) as string[];
  const banda = 14 + titulo.length * 6.5 + 6;
  doc.setFillColor(...MARCA);
  doc.rect(0, 0, ancho, banda, 'F');
  if (logo) doc.addImage(logo, 'PNG', m, (banda - 16) / 2, 16, 16);
  doc.setTextColor(255, 255, 255);
  doc.text(titulo, x, 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(t(`${c.proyecto.marca ? `${c.proyecto.marca}   ·   ` : ''}${rangoAnio(c)}${c.periodo.parcial ? ' (semana en curso)' : ''}`), x, 12 + titulo.length * 6.5 + 1);
  y = banda + 7;
  doc.setFontSize(8.5); doc.setTextColor(...GRIS);
  doc.text(t([`Líder: ${c.proyecto.lider || '—'}`, `Generado el ${horaEcuador(c.generado_en)}`, aprobadoPor ? `Aprobado por ${aprobadoPor}` : 'Borrador sin aprobar'].join('   ·   ')), m, y);
  y += 5;

  // At a glance: traffic light and its sentence on the left, overall progress on the right.
  const color = LUZ[c.semaforo.color] ?? LUZ.verde;
  const anchoFrase = util * 0.56;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  const frase = doc.splitTextToSize(t(c.semaforo.frase), anchoFrase) as string[];
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  const nota = c.semaforo.nota ? (doc.splitTextToSize(t(c.semaforo.nota), anchoFrase) as string[]) : [];
  const alturaCaja = Math.max(30, 10 + frase.length * 5.5 + nota.length * 4 + 4);
  doc.setFillColor(...FONDO); doc.roundedRect(m, y, util, alturaCaja, 3, 3, 'F');
  doc.setFillColor(...color); doc.circle(m + 11, y + alturaCaja / 2, 6.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...TEXTO);
  doc.text(frase, m + 22, y + 10);
  if (nota.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRIS);
    doc.text(nota, m + 22, y + 10 + frase.length * 5.5);
  }
  const ax = m + util * 0.66;
  const anchoBarra = util * 0.31;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
  doc.text('AVANCE GENERAL DEL PROYECTO', ax, y + 7);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...TEXTO);
  doc.text(`${c.avance.porcentaje}%`, ax, y + 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
  doc.text(t(`${c.avance.listas} de ${c.avance.total} tareas terminadas`), ax + 17, y + 15);
  doc.setFillColor(255, 255, 255); doc.roundedRect(ax, y + 18, anchoBarra, 2.2, 1, 1, 'F');
  doc.setFillColor(...MARCA); doc.roundedRect(ax, y + 18, Math.max(1, anchoBarra * (c.avance.porcentaje / 100)), 2.2, 1, 1, 'F');
  doc.text(t(`al empezar la semana: ${c.avance.porcentaje_inicio}%`), ax, y + 25);
  y += alturaCaja + 4;

  const i = c.indicadores;
  const tarjetas: [string, string, boolean][] = [
    ['Entregas de la semana', `${i.cumplidas} de ${i.previstas}`, false],
    ['Vencidas sin entregar', String(i.atrasadas), i.atrasadas > 0],
    ['Postergadas esta semana', String(i.postergadas), false],
    ['Vencen la próxima semana', String(i.proxima_semana), false],
  ];
  const anchoTarjeta = (util - 3 * 3) / 4;
  tarjetas.forEach(([etiqueta, valor, alerta], n) => {
    const tx = m + n * (anchoTarjeta + 3);
    doc.setFillColor(...FONDO); doc.roundedRect(tx, y, anchoTarjeta, 16, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...(alerta ? LUZ.rojo : TEXTO));
    doc.text(valor, tx + anchoTarjeta / 2, y + 8, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
    doc.text(t(etiqueta), tx + anchoTarjeta / 2, y + 13, { align: 'center' });
  });
  y += 22;

  seccion('Resumen ejecutivo');
  parrafo(c.resumen_ejecutivo, 10.5);
  y += 3;
  for (const [nombre, items] of [['Logros', c.destacados.logros], ['Decisiones', c.destacados.decisiones], ['Riesgos', c.destacados.riesgos]] as const) {
    if (!items.length) continue;
    espacio(10);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...TEXTO);
    doc.text(nombre, m, y); y += 4.8;
    for (const d of items) { parrafo(`• ${d.texto}`, 9.5, TEXTO, 3); y += 0.8; }
    y += 2;
  }

  seccion(`Entregas de la semana (${rango(c.semana)})`, 'Tareas que vencían esta semana y cómo terminaron.');
  if (c.entregas.length) tablaTareas(c.entregas, 'Vencía', 'Resultado');
  else { parrafo('Ninguna tarea vencía esta semana.', 9.5, GRIS); y += 3; }

  if (c.atrasadas_anteriores.length) {
    seccion('Atrasadas de semanas anteriores', 'Tareas que vencieron antes de esta semana y siguen sin entregarse.');
    tablaTareas(c.atrasadas_anteriores, 'Vencía', 'Situación');
  }

  if (c.otras_entregas.length) {
    seccion('Otras entregas de la semana', 'Tareas entregadas esta semana que vencían en otra semana o no tenían fecha.');
    tablaTareas(c.otras_entregas, 'Vencía', 'Resultado');
  }

  if (c.cambios_fecha.length) {
    seccion('Cambios de fecha', 'Tareas a las que se les cambió la fecha de entrega esta semana. Primero las que se postergaron.');
    tabla(
      ['Tarea', 'Responsable', 'Antes', 'Ahora', 'Motivo'],
      c.cambios_fecha.map((f) => [t(f.titulo), t(quien(f.responsable)), fecha(f.antes), fecha(f.ahora), t(f.motivo ?? '—')]),
      [0.36, 0.17, 0.1, 0.1, 0.27],
      (fila, columna) => (columna === 3 && c.cambios_fecha[fila].postergada ? AMBAR_TEXTO : null),
    );
  }

  seccion(`Próxima semana (${rango(c.proxima)})`, 'Tareas sin terminar que vencen la próxima semana.');
  if (c.proxima_semana.length) tablaTareas(c.proxima_semana, 'Vence', 'Estado');
  else { parrafo('No vence ninguna tarea la próxima semana.', 9.5, GRIS); y += 3; }

  if (c.otras_abiertas.length) {
    seccion('Otras tareas abiertas', 'Tareas sin terminar que vencen más adelante o no tienen fecha de entrega.');
    tablaTareas(c.otras_abiertas, 'Vence', 'Estado');
  }

  const paginas = doc.getNumberOfPages();
  for (let n = 1; n <= paginas; n++) {
    doc.setPage(n);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
    doc.text(t(`Tiusdei · ${c.proyecto.nombre} · ${rangoAnio(c)}${aprobadoPor ? ` · Aprobado por ${aprobadoPor}` : ''}`), m, alto - 8);
    doc.text(`Página ${n} de ${paginas}`, ancho - m, alto - 8, { align: 'right' });
  }
  return Buffer.from(doc.output('arraybuffer'));
}
