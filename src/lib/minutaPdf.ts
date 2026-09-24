import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Minuta } from './minutasApi';
import { estadoPunto, fechaCorta } from './minutas';

interface Opciones { soloVisibles?: boolean }

/** Una fila por punto: código, punto, responsable, estado y lo hecho (o la fecha comprometida). */
export function filasPdf(m: Minuta, { soloVisibles = false }: Opciones = {}): string[][] {
  return m.items
    .filter((p) => !soloVisibles || p.visible_cliente)
    .map((p) => {
      const cerrado = p.estado === 'completado' || p.estado === 'aprobado';
      const detalle = cerrado
        ? [p.resolucion, ...p.evidencias.map((e) => `${e.nombre}: ${e.url}`)].filter(Boolean).join('\n')
        : p.fecha_compromiso ? `Compromiso: ${fechaCorta(p.fecha_compromiso)}` : '';
      return [
        `${m.numero}.${p.numero}`,
        [p.titulo + (p.visible_cliente ? '' : ' (interno)'), p.descripcion].filter(Boolean).join('\n'),
        p.responsable_cliente ? 'Cliente' : p.responsable?.nombre ?? '—',
        estadoPunto(p).texto,
        detalle,
      ];
    });
}

export function nombreArchivoPdf(m: Minuta): string {
  const limpio = (t: string) => t.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `Minuta ${limpio(m.brand_nombre)} ${m.codigo} ${m.fecha}.pdf`;
}

export function exportarMinutaPdf(m: Minuta, opciones: Opciones = {}): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 14;
  let y = 18;

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`${m.brand_nombre} · ${m.codigo} · ${fechaCorta(m.fecha)} ${m.fecha.slice(0, 4)}`, margen, y);
  y += 7;
  doc.setFontSize(16);
  doc.setTextColor(20);
  const titulo = doc.splitTextToSize(m.titulo, ancho - margen * 2) as string[];
  doc.text(titulo, margen, y);
  y += titulo.length * 7;

  doc.setFontSize(9);
  doc.setTextColor(80);
  const meta = [
    m.project_nombre && `Proyecto: ${m.project_nombre}`,
    `Responsable: ${m.owner.nombre}`,
    m.miembros.length > 0 && `Equipo: ${m.miembros.map((x) => x.nombre).join(', ')}`,
  ].filter(Boolean).join('   ·   ');
  doc.text(doc.splitTextToSize(meta, ancho - margen * 2) as string[], margen, y);
  y += 7;

  if (m.resumen) {
    doc.setFontSize(10);
    doc.setTextColor(20);
    doc.text('Resumen y acuerdos', margen, y);
    y += 5;
    doc.setFontSize(9);
    doc.setTextColor(60);
    const lineas = doc.splitTextToSize(m.resumen, ancho - margen * 2) as string[];
    doc.text(lineas, margen, y);
    y += lineas.length * 4.5 + 4;
  }

  autoTable(doc, {
    startY: y,
    head: [['#', 'Punto', 'Responsable', 'Estado', 'Qué se hizo / fecha']],
    body: filasPdf(m, opciones),
    styles: { fontSize: 8, cellPadding: 2, valign: 'top' },
    headStyles: { fillColor: [11, 122, 100] },
    columnStyles: { 0: { cellWidth: 12 }, 2: { cellWidth: 28 }, 3: { cellWidth: 28 } },
    margin: { left: margen, right: margen },
  });

  doc.setFontSize(7);
  doc.setTextColor(140);
  doc.text('Generado desde Tiusdei · Qbit Digital', margen, doc.internal.pageSize.getHeight() - 8);
  doc.save(nombreArchivoPdf(m));
}
