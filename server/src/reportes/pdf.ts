import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fechaCorta } from './dominio.js';
import type { ContenidoReporte } from './generador.js';

/** Server-side PDF of a weekly project report (same libraries as the minutas PDF in the web app). */

type Rgb = [number, number, number];
const MARCA: Rgb = [26, 188, 156];
const TEXTO: Rgb = [31, 41, 55];
const GRIS: Rgb = [107, 114, 128];
const FONDO: Rgb = [243, 244, 246];
const SALUD: Record<string, { texto: string; color: Rgb }> = {
  verde: { texto: 'A tiempo', color: [16, 185, 129] },
  amarillo: { texto: 'Atención', color: [245, 158, 11] },
  rojo: { texto: 'En riesgo', color: [239, 68, 68] },
};
const LOGO = path.join(process.cwd(), '..', 'public', 'pwa-192x192.png');

// The standard PDF fonts only draw Latin-1 plus a few typographic signs; anything else (arrows, emoji) is replaced or dropped.
const PERMITIDOS = /[^\u0000-ÿ“”‘’—–•…€]/g;
export function limpiarPdf(texto: string): string {
  return texto.replace(/→/g, '->').replace(/←/g, '<-').replace(PERMITIDOS, '').replace(/ {2,}/g, ' ').trim();
}

export function nombreArchivoPdf(c: ContenidoReporte): string {
  const limpio = c.proyecto.nombre.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `Reporte ${limpio} ${c.periodo.desde} a ${c.periodo.hasta}.pdf`;
}

const rango = (c: ContenidoReporte) => `${fechaCorta(c.periodo.desde)} – ${fechaCorta(c.periodo.hasta)} ${c.periodo.hasta.slice(0, 4)}`;
const horaEcuador = (iso: string) => new Date(Date.parse(iso) - 5 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
const atraso = (d: number) => `${d} ${d === 1 ? 'día' : 'días'} de atraso`;

export function generarPdf(c: ContenidoReporte, { aprobadoPor }: { aprobadoPor?: string | null } = {}): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const m = 14;
  const util = ancho - m * 2;
  let y = 0;
  const t = (s: string) => limpiarPdf(s);
  const titulos = new Map(c.grupos.flatMap((g) => g.tareas.map((x) => [x.id, x.titulo] as const)));

  const espacio = (necesario: number) => {
    if (y + necesario > alto - 18) { doc.addPage(); y = 18; }
  };
  const seccion = (titulo: string) => {
    espacio(14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...MARCA);
    doc.text(t(titulo), m, y);
    doc.setDrawColor(...MARCA); doc.setLineWidth(0.4); doc.line(m, y + 1.8, m + util, y + 1.8);
    y += 8;
  };
  const parrafo = (texto: string, tam = 10, color: Rgb = TEXTO, sangria = 0) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(tam); doc.setTextColor(...color);
    for (const linea of doc.splitTextToSize(t(texto), util - sangria) as string[]) {
      espacio(tam * 0.5);
      doc.text(linea, m + sangria, y);
      y += tam * 0.45;
    }
  };

  // Header band
  doc.setFillColor(...MARCA);
  doc.rect(0, 0, ancho, 30, 'F');
  let x = m;
  try {
    const logo = fs.readFileSync(LOGO).toString('base64');
    doc.addImage(logo, 'PNG', m, 7, 16, 16);
    x = m + 20;
  } catch { /* no logo on this machine: the band still reads fine */ }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('Reporte semanal de proyecto', x, 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  doc.text(t(`${c.proyecto.nombre} · ${c.proyecto.marca}`), x, 21);
  doc.setFontSize(10);
  doc.text(t(rango(c)), ancho - m, 14, { align: 'right' });
  y = 38;

  // Meta line
  const salud = SALUD[c.proyecto.salud] ?? SALUD.verde;
  doc.setFontSize(9); doc.setTextColor(...GRIS);
  const meta = [`Líder: ${c.proyecto.lider || '—'}`, `Generado el ${horaEcuador(c.generado_en)}`, aprobadoPor ? `Aprobado por ${aprobadoPor}` : 'Borrador sin aprobar'];
  doc.text(t(meta.join('   ·   ')), m, y);
  doc.setFillColor(...salud.color); doc.circle(ancho - m - 24, y - 1.2, 1.6, 'F');
  doc.setTextColor(...TEXTO); doc.text(t(`Salud: ${salud.texto}`), ancho - m, y, { align: 'right' });
  y += 7;

  // Indicator cards
  const tarjetas: [string, number | string][] = [
    ['Completadas', c.indicadores.completadas], ['Atrasadas', c.indicadores.atrasadas], ['Bloqueadas', c.indicadores.bloqueadas],
    ['En curso', c.indicadores.en_curso], ['Pendientes', c.indicadores.pendientes], ['Avance', `${c.indicadores.avance}%`],
  ];
  const anchoTarjeta = (util - 5 * 3) / 6;
  tarjetas.forEach(([etiqueta, valor], i) => {
    const tx = m + i * (anchoTarjeta + 3);
    doc.setFillColor(...FONDO); doc.roundedRect(tx, y, anchoTarjeta, 17, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.setTextColor(...(etiqueta === 'Atrasadas' && Number(valor) > 0 ? SALUD.rojo.color : TEXTO));
    doc.text(String(valor), tx + anchoTarjeta / 2, y + 8.5, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
    doc.text(etiqueta, tx + anchoTarjeta / 2, y + 13.5, { align: 'center' });
  });
  y += 25;

  seccion('Resumen ejecutivo');
  parrafo(c.resumen_ejecutivo, 10.5);
  y += 4;

  seccion('Destacados');
  const destacados: [string, typeof c.destacados.logros][] = [['Logros', c.destacados.logros], ['Decisiones', c.destacados.decisiones], ['Riesgos', c.destacados.riesgos]];
  for (const [nombre, items] of destacados) {
    espacio(10);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...TEXTO);
    doc.text(nombre, m, y); y += 5;
    if (!items.length) { parrafo('Nada que destacar en este periodo.', 9, GRIS, 4); y += 2; continue; }
    for (const d of items) {
      const fuente = d.task_ids.map((id) => titulos.get(id)).filter(Boolean).join(', ');
      parrafo(`• ${d.texto}`, 9.5, TEXTO, 3);
      if (fuente) parrafo(`Tarea: ${fuente}`, 8, GRIS, 6);
      y += 1;
    }
    y += 2;
  }

  seccion('Detalle por estado');
  for (const g of c.grupos.filter((x) => x.tareas.length)) {
    espacio(16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...TEXTO);
    doc.text(t(`${g.titulo} (${g.tareas.length})`), m, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      margin: { left: m, right: m },
      head: [['Tarea', 'Responsable', 'Entrega', 'Estado']],
      body: g.tareas.flatMap((x) => [
        [
          { content: t(x.titulo), styles: { fontStyle: 'bold' as const } },
          t(x.responsable ?? 'Sin responsable'),
          x.fecha_entrega ? fechaCorta(x.fecha_entrega) : '—',
          t(x.dias_atraso != null ? atraso(x.dias_atraso) : `${x.estado_texto}${x.subtareas ? ` · ${x.subtareas} subtareas` : ''}`),
        ],
        [{ content: t(x.linea), colSpan: 4, styles: { textColor: GRIS, fontSize: 8.5, cellPadding: { top: 0.5, bottom: 2.5, left: 2, right: 2 } } }],
      ]),
      styles: { font: 'helvetica', fontSize: 9, textColor: TEXTO, cellPadding: 2, lineWidth: 0 },
      headStyles: { fillColor: MARCA, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: util * 0.46 }, 1: { cellWidth: util * 0.2 }, 2: { cellWidth: util * 0.12 }, 3: { cellWidth: util * 0.22 } },
      theme: 'plain',
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  }

  seccion('Próximo periodo');
  if (!c.proximo_periodo.length) parrafo('No hay entregas en los próximos siete días.', 9.5, GRIS);
  else {
    autoTable(doc, {
      startY: y,
      margin: { left: m, right: m },
      head: [['Tarea', 'Responsable', 'Entrega']],
      body: c.proximo_periodo.map((x) => [t(x.titulo), t(x.responsable ?? 'Sin responsable'), x.fecha_entrega ? fechaCorta(x.fecha_entrega) : '—']),
      styles: { font: 'helvetica', fontSize: 9, textColor: TEXTO, cellPadding: 2 },
      headStyles: { fillColor: MARCA, textColor: [255, 255, 255], fontStyle: 'bold' },
      theme: 'striped',
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  }

  seccion('Sin actualización');
  if (!c.sin_actualizacion.length) parrafo('Todas las tareas abiertas tuvieron comentarios del equipo en el periodo.', 9.5, GRIS);
  else {
    parrafo('Tareas abiertas sin comentarios del equipo en el periodo:', 9.5, GRIS);
    y += 1;
    for (const x of c.sin_actualizacion) parrafo(`• ${x.titulo}${x.responsable ? ` — ${x.responsable}` : ''}`, 9.5, TEXTO, 3);
  }

  // Footer on every page
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
    doc.text(t(`Tiusdei · ${c.proyecto.nombre} · ${rango(c)}${aprobadoPor ? ` · Aprobado por ${aprobadoPor}` : ''}`), m, alto - 8);
    doc.text(`Página ${i} de ${paginas}`, ancho - m, alto - 8, { align: 'right' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}
