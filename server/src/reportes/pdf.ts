import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import { ErrorReporte, fechaCorta } from './dominio.js';
import type { ContenidoReporte } from './generador.js';

/**
 * Server-side PDF of a weekly project report (same libraries as the minutas PDF in the web app).
 * Page one answers "how are we doing?" at a glance; the detail of the week and the rest of the project follow.
 */

type Rgb = [number, number, number];
const MARCA: Rgb = [26, 188, 156];
const TEXTO: Rgb = [31, 41, 55];
const GRIS: Rgb = [107, 114, 128];
const FONDO: Rgb = [243, 244, 246];
const LUZ: Record<string, Rgb> = { verde: [16, 185, 129], amarillo: [245, 158, 11], rojo: [239, 68, 68] };
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

const rango = (c: ContenidoReporte) => `${fechaCorta(c.periodo.desde)} – ${fechaCorta(c.periodo.hasta)} ${c.periodo.hasta.slice(0, 4)}`;
const horaEcuador = (iso: string) => new Date(Date.parse(iso) - 5 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

export function generarPdf(c: ContenidoReporte, { aprobadoPor }: { aprobadoPor?: string | null } = {}): Buffer {
  if (c.version !== 2) throw new ErrorReporte(409, 'Regenera este reporte para verlo con el formato nuevo.');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const m = 14;
  const util = ancho - m * 2;
  const t = (s: string) => limpiarPdf(s);
  let y = 0;

  const espacio = (necesario: number) => { if (y + necesario > alto - 18) { doc.addPage(); y = 18; } };
  const seccion = (titulo: string) => {
    espacio(16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...MARCA);
    doc.text(t(titulo), m, y);
    doc.setDrawColor(...MARCA); doc.setLineWidth(0.4); doc.line(m, y + 1.8, m + util, y + 1.8);
    y += 7;
  };
  const parrafo = (texto: string, tam = 10, color: Rgb = TEXTO, sangria = 0) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(tam); doc.setTextColor(...color);
    for (const linea of doc.splitTextToSize(t(texto), util - sangria) as string[]) {
      espacio(tam * 0.5);
      doc.text(linea, m + sangria, y);
      y += tam * 0.45;
    }
  };
  const tabla = (head: string[], body: RowInput[], anchos: number[], opciones: { tam?: number; relleno?: number; titulosEnNegrita?: boolean } = {}) => {
    autoTable(doc, {
      startY: y,
      margin: { left: m, right: m },
      head: [head],
      body,
      styles: { font: 'helvetica', fontSize: opciones.tam ?? 9, textColor: TEXTO, cellPadding: opciones.relleno ?? 1.8, lineWidth: 0 },
      headStyles: { fillColor: MARCA, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: Object.fromEntries(anchos.map((a, i) => [i, { cellWidth: util * a }])),
      theme: 'plain',
      didParseCell: (d) => {
        if (opciones.titulosEnNegrita && d.section === 'body' && d.column.index === 0 && d.cell.colSpan === 1) d.cell.styles.fontStyle = 'bold';
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  };

  // Header band
  doc.setFillColor(...MARCA);
  doc.rect(0, 0, ancho, 28, 'F');
  let x = m;
  try {
    doc.addImage(fs.readFileSync(LOGO).toString('base64'), 'PNG', m, 6, 16, 16);
    x = m + 20;
  } catch { /* no logo on this machine: the band still reads fine */ }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(t(`Reporte semanal · ${c.proyecto.nombre}`), x, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(t(c.proyecto.marca), x, 20);
  doc.text(t(`${rango(c)}${c.periodo.parcial ? ' (semana en curso)' : ''}`), ancho - m, 13, { align: 'right' });
  y = 35;
  doc.setFontSize(8.5); doc.setTextColor(...GRIS);
  doc.text(t([`Líder: ${c.proyecto.lider || '—'}`, `Generado el ${horaEcuador(c.generado_en)}`, aprobadoPor ? `Aprobado por ${aprobadoPor}` : 'Borrador sin aprobar'].join('   ·   ')), m, y);
  y += 5;

  // At a glance: traffic light and its sentence, progress, four numbers
  const color = LUZ[c.semaforo.color] ?? LUZ.verde;
  doc.setFillColor(...FONDO); doc.roundedRect(m, y, util, 26, 3, 3, 'F');
  doc.setFillColor(...color); doc.circle(m + 11, y + 13, 6.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(...TEXTO);
  doc.text(doc.splitTextToSize(t(c.semaforo.frase), util * 0.55) as string[], m + 22, y + 11);
  const ax = m + util * 0.68;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text(`${c.indicadores.avance}%`, ax, y + 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRIS);
  const delta = c.indicadores.avance_semana;
  doc.text(t(`avance del proyecto · ${delta >= 0 ? '+' : ''}${delta} esta semana`), ax, y + 17.5);
  doc.setFillColor(255, 255, 255); doc.roundedRect(ax, y + 20, util * 0.3, 2.2, 1, 1, 'F');
  doc.setFillColor(...color); doc.roundedRect(ax, y + 20, Math.max(1, util * 0.3 * (c.indicadores.avance / 100)), 2.2, 1, 1, 'F');
  y += 31;
  const numeros: [string, number][] = [
    ['Entregadas en la semana', c.indicadores.entregadas], ['Atrasadas', c.indicadores.atrasadas],
    ['Fechas movidas', c.indicadores.fechas_movidas], ['Vencen en 7 días', c.indicadores.proximas],
  ];
  const anchoTarjeta = (util - 3 * 3) / 4;
  numeros.forEach(([etiqueta, valor], i) => {
    const tx = m + i * (anchoTarjeta + 3);
    doc.setFillColor(...FONDO); doc.roundedRect(tx, y, anchoTarjeta, 15, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.setTextColor(...(etiqueta === 'Atrasadas' && valor > 0 ? LUZ.rojo : TEXTO));
    doc.text(String(valor), tx + anchoTarjeta / 2, y + 7.5, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
    doc.text(etiqueta, tx + anchoTarjeta / 2, y + 12, { align: 'center' });
  });
  y += 22;

  seccion('Resumen ejecutivo');
  parrafo(c.resumen_ejecutivo, 10.5);
  y += 3;
  for (const [nombre, items] of [['Logros', c.destacados.logros], ['Decisiones', c.destacados.decisiones], ['Riesgos', c.destacados.riesgos]] as const) {
    if (!items.length) continue;
    espacio(9);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...TEXTO);
    doc.text(nombre, m, y); y += 4.5;
    for (const d of items) parrafo(`• ${d.texto}`, 9.5, TEXTO, 3);
    y += 2;
  }

  seccion('Esta semana');
  if (!c.movidas.length) parrafo('No hubo movimiento en las tareas esta semana.', 9.5, GRIS);
  else tabla(['Tarea', 'Responsable', 'Estado al cierre'], c.movidas.flatMap((x): RowInput[] => {
    const detalle = [x.eventos.join(' · '), x.avance].filter(Boolean).join('\n');
    return [
      [t(x.titulo), t(x.responsable ?? 'Sin responsable'), t(x.estado_texto)],
      ...(detalle ? [[{ content: t(detalle), colSpan: 3, styles: { textColor: GRIS, fontSize: 8.5, cellPadding: { top: 0, bottom: 2.4, left: 1.8, right: 1.8 } } }]] : []),
    ];
  }), [0.56, 0.22, 0.22], { titulosEnNegrita: true });

  if (c.riesgos.length) {
    seccion('Riesgos al cierre de la semana');
    tabla(['Tarea', 'Responsable', 'Situación'], c.riesgos.map((x) => [
      t(x.titulo), t(x.responsable ?? 'Sin responsable'), t(x.dias_atraso != null ? `${dias(x.dias_atraso)} de atraso` : 'Bloqueada'),
    ]), [0.56, 0.22, 0.22]);
  }

  seccion('Próxima semana');
  if (!c.proximas.length) parrafo('No hay entregas en los próximos siete días.', 9.5, GRIS);
  else tabla(['Tarea', 'Responsable', 'Entrega'], c.proximas.map((x) => [t(x.titulo), t(x.responsable ?? 'Sin responsable'), x.fecha_entrega ? fechaCorta(x.fecha_entrega) : '—']), [0.56, 0.22, 0.22]);

  seccion('Resto del proyecto');
  if (c.resto.length) tabla(['Tarea', 'Responsable', 'Estado'], c.resto.map((x) => [t(x.titulo), t(x.responsable ?? 'Sin responsable'), t(x.estado_texto)]), [0.56, 0.22, 0.22], { tam: 8, relleno: 1 });
  parrafo(`Entregadas antes de esta semana: ${c.entregadas_antes}`, 9, GRIS);

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
    doc.text(t(`Tiusdei · ${c.proyecto.nombre} · ${rango(c)}${aprobadoPor ? ` · Aprobado por ${aprobadoPor}` : ''}`), m, alto - 8);
    doc.text(`Página ${i} de ${paginas}`, ancho - m, alto - 8, { align: 'right' });
  }
  return Buffer.from(doc.output('arraybuffer'));
}
