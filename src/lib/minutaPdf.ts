import { jsPDF } from 'jspdf';
import type { Minuta, Punto } from './minutasApi';
import { estadoPunto, fechaCorta, type Tono } from './minutas';

/**
 * PDF of a minuta, drawn in the browser with the same visual language as the weekly project reports: branded band,
 * progress at a glance, then one block per point with what was done and its evidence (screenshots as images).
 */

export interface Opciones { soloVisibles?: boolean }
export interface Imagen { dataUrl: string; ancho: number; alto: number; formato: 'PNG' | 'JPEG' }
export interface DepsPdf {
  cargarImagen?: (url: string, opciones?: { transparente?: boolean }) => Promise<Imagen | null>;
  guardar?: (pdf: Blob, nombre: string) => void;
}

export interface PuntoPdf {
  codigo: string;
  titulo: string;
  descripcion: string | null;
  responsable: string;
  estado: { texto: string; tono: Tono };
  compromiso: string | null;
  queSeHizo: { titulo: string; texto: string | null } | null;
  imagenes: { nombre: string; url: string }[];
  enlaces: { nombre: string; origen: string; url: string }[];
  notas: { etiqueta: string; texto: string }[];
  interno: boolean;
}

const cerrado = (p: Pick<Punto, 'estado'>) => p.estado === 'completado' || p.estado === 'aprobado';
const origen = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

/** What each point shows. The client version leaves out internal and discarded points, like the presentation. */
export function puntosPdf(m: Minuta, { soloVisibles = false }: Opciones = {}): PuntoPdf[] {
  return m.items
    .filter((p) => !soloVisibles || (p.visible_cliente && p.estado !== 'descartado'))
    .map((p) => ({
      codigo: `${m.numero}.${p.numero}`,
      titulo: p.titulo,
      descripcion: p.descripcion,
      responsable: p.responsable_cliente ? 'Cliente' : p.responsable?.nombre ?? 'Sin responsable',
      estado: estadoPunto(p),
      compromiso: !cerrado(p) && p.estado !== 'descartado' && p.fecha_compromiso ? fechaCorta(p.fecha_compromiso) : null,
      queSeHizo: p.resolucion || p.evidencias.length
        ? { titulo: p.responsable_cliente ? 'Qué llegó' : 'Qué se hizo', texto: p.resolucion }
        : null,
      imagenes: p.evidencias.filter((e) => e.tipo === 'imagen').map((e) => ({ nombre: e.nombre, url: e.url })),
      enlaces: p.evidencias.filter((e) => e.tipo !== 'imagen').map((e) => ({ nombre: e.nombre, origen: origen(e.url), url: e.url })),
      notas: p.notas.map((n) => ({
        etiqueta: `${n.tipo === 'ajuste' ? 'Ajuste pedido' : 'Nota'}${n.autor_nombre ? ` por ${n.autor_nombre}` : ''}`,
        texto: n.texto,
      })),
      interno: !p.visible_cliente,
    }));
}

export function nombreArchivoPdf(m: Minuta): string {
  const limpio = (t: string) => t.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `Minuta ${limpio(m.brand_nombre)} ${m.codigo} ${m.fecha}.pdf`;
}

type Rgb = [number, number, number];
const MARCA: Rgb = [26, 188, 156];
const TEXTO: Rgb = [31, 41, 55];
const GRIS: Rgb = [107, 114, 128];
const FONDO: Rgb = [243, 244, 246];
const LINEA: Rgb = [229, 231, 235];
const TONO: Record<Tono, Rgb> = {
  slate: [71, 85, 105], blue: [37, 99, 235], teal: [13, 148, 136], green: [5, 150, 105], amber: [180, 83, 9], rose: [225, 29, 72], violet: [124, 58, 237],
};
const claro = (c: Rgb): Rgb => c.map((v) => Math.round(v + (255 - v) * 0.88)) as Rgb;
const LOGO = '/pwa-192x192.png';

// The standard PDF fonts draw Latin-1 plus a few typographic signs; anything else (arrows, emoji) is replaced or dropped.
const PERMITIDOS = /[^\u0000-ÿ“”‘’—–•…€›]/g;
const limpiar = (t: string) => t.replace(/→/g, '›').replace(/←/g, '‹').replace(PERMITIDOS, '').replace(/ {2,}/g, ' ').trim();

export async function generarMinutaPdf(m: Minuta, opciones: Opciones = {}, deps: DepsPdf = {}): Promise<ArrayBuffer> {
  const cargar = deps.cargarImagen ?? cargarImagenNavegador;
  const puntos = puntosPdf(m, opciones);
  // Every image is fetched up front, in parallel; one that fails leaves a note in its place.
  const urls = [...new Set(puntos.flatMap((p) => p.imagenes.map((i) => i.url)))];
  const [logo, ...cargadas] = await Promise.all([cargar(LOGO, { transparente: true }), ...urls.map((u) => cargar(u).catch(() => null))]);
  const imagenes = new Map(urls.map((u, i) => [u, cargadas[i]]));

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const mg = 14;
  const util = ancho - mg * 2;
  let y = 0;

  const espacio = (n: number) => { if (y + n > alto - 16) { doc.addPage(); y = 18; } };
  const letra = (tam: number, color: Rgb, estilo: 'normal' | 'bold' | 'italic' = 'normal') => {
    doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(...color);
  };
  const parrafo = (texto: string, tam: number, color: Rgb, x = mg, ancho_ = util, estilo: 'normal' | 'italic' = 'normal') => {
    letra(tam, color, estilo);
    for (const l of doc.splitTextToSize(limpiar(texto), ancho_) as string[]) { espacio(tam * 0.5); doc.text(l, x, y); y += tam * 0.45; }
  };
  const seccion = (titulo: string) => {
    espacio(18);
    y += 2;
    letra(12, MARCA, 'bold'); doc.text(titulo, mg, y);
    doc.setDrawColor(...MARCA); doc.setLineWidth(0.4); doc.line(mg, y + 1.8, mg + util, y + 1.8);
    y += 7;
  };

  // Header band: title wraps on its own lines, brand · code · date below it (same as the weekly reports).
  const x = logo ? mg + 20 : mg;
  letra(15, [255, 255, 255], 'bold');
  const titulo = doc.splitTextToSize(limpiar(m.titulo), ancho - mg - x) as string[];
  const banda = 14 + titulo.length * 6.5 + 6;
  doc.setFillColor(...MARCA); doc.rect(0, 0, ancho, banda, 'F');
  if (logo) doc.addImage(logo.dataUrl, logo.formato, mg, (banda - 16) / 2, 16, 16);
  letra(15, [255, 255, 255], 'bold'); doc.text(titulo, x, 12);
  letra(10, [255, 255, 255]);
  doc.text(limpiar([m.brand_nombre, m.codigo, `${fechaCorta(m.fecha)} ${m.fecha.slice(0, 4)}`, m.project_nombre].filter(Boolean).join('   ·   ')), x, 12 + titulo.length * 6.5 + 1);
  y = banda + 7;
  letra(8.5, GRIS);
  const meta = [`Responsable: ${m.owner.nombre}`, m.miembros.length ? `Equipo: ${m.miembros.map((p) => p.nombre).join(', ')}` : '', opciones.soloVisibles ? 'Versión para el cliente' : 'Versión interna completa'];
  doc.text(doc.splitTextToSize(limpiar(meta.filter(Boolean).join('   ·   ')), util) as string[], mg, y);
  y += 6;

  // At a glance: how many points are closed.
  const vigentes = puntos.filter((p) => p.estado.texto !== 'Descartado');
  const listos = m.items.filter((p) => cerrado(p) && vigentes.some((v) => v.codigo === `${m.numero}.${p.numero}`)).length;
  doc.setFillColor(...FONDO); doc.roundedRect(mg, y, util, 18, 3, 3, 'F');
  letra(12, TEXTO, 'bold'); doc.text(`${listos} de ${vigentes.length} puntos cerrados`, mg + 6, y + 8);
  const porEstado = [...vigentes.reduce((acc, p) => acc.set(p.estado.texto, (acc.get(p.estado.texto) ?? 0) + 1), new Map<string, number>())];
  letra(8.5, GRIS); doc.text(limpiar(porEstado.map(([t, n]) => `${n} ${t.toLowerCase()}`).join('  ·  ')), mg + 6, y + 13.5);
  const barra = util * 0.3;
  doc.setFillColor(255, 255, 255); doc.roundedRect(mg + util - barra - 6, y + 7.5, barra, 2.4, 1, 1, 'F');
  doc.setFillColor(...MARCA); doc.roundedRect(mg + util - barra - 6, y + 7.5, Math.max(1, barra * (vigentes.length ? listos / vigentes.length : 0)), 2.4, 1, 1, 'F');
  y += 24;

  if (m.resumen) { seccion('Resumen y acuerdos'); parrafo(m.resumen, 10, TEXTO); y += 2; }

  seccion('Puntos');
  for (const p of puntos) {
    espacio(26);
    // Code chip, title and status pill.
    letra(8.5, GRIS, 'bold');
    const chip = doc.getTextWidth(p.codigo) + 4;
    doc.setFillColor(...FONDO); doc.roundedRect(mg, y - 4, chip, 5.6, 1.2, 1.2, 'F');
    doc.text(p.codigo, mg + 2, y);
    letra(8, TONO[p.estado.tono], 'bold');
    const pill = doc.getTextWidth(limpiar(p.estado.texto)) + 6;
    doc.setFillColor(...claro(TONO[p.estado.tono])); doc.roundedRect(mg + util - pill, y - 4, pill, 5.6, 2.8, 2.8, 'F');
    doc.text(limpiar(p.estado.texto), mg + util - pill + 3, y);
    letra(11.5, TEXTO, 'bold');
    const lineasTitulo = doc.splitTextToSize(limpiar(p.titulo), util - chip - pill - 8) as string[];
    doc.text(lineasTitulo, mg + chip + 3, y);
    y += lineasTitulo.length * 5 + 1;
    if (p.interno) parrafo('Solo interno: no se muestra al cliente.', 8.5, TONO.amber, mg, util, 'italic');
    if (p.descripcion) parrafo(p.descripcion, 9.5, GRIS);
    parrafo([`Responsable: ${p.responsable}`, p.compromiso && `Compromiso: ${p.compromiso}`].filter(Boolean).join('   ·   '), 8.5, GRIS);
    y += 1.5;

    if (p.queSeHizo) {
      espacio(10);
      letra(8.5, MARCA, 'bold'); doc.text(p.queSeHizo.titulo.toUpperCase(), mg, y); y += 4.5;
      if (p.queSeHizo.texto) parrafo(p.queSeHizo.texto, 9.5, TEXTO);
      y += 1;
    }

    // Screenshots: full width when alone, two per row otherwise; never taller than a third of the page.
    const col = p.imagenes.length > 1 ? (util - 4) / 2 : util;
    for (let i = 0; i < p.imagenes.length; i += p.imagenes.length > 1 ? 2 : 1) {
      const fila = p.imagenes.slice(i, i + (p.imagenes.length > 1 ? 2 : 1));
      const medidas = fila.map((f) => {
        const img = imagenes.get(f.url);
        if (!img) return { img, w: col, h: 6 };
        const h = Math.min(col * (img.alto / img.ancho), alto / 3);
        return { img, w: h * (img.ancho / img.alto), h };
      });
      const altoFila = Math.max(...medidas.map((d) => d.h));
      espacio(altoFila + 3);
      medidas.forEach((d, j) => {
        const xi = mg + j * (col + 4);
        if (d.img) {
          doc.setDrawColor(...LINEA); doc.setLineWidth(0.2); doc.rect(xi, y, d.w, d.h);
          doc.addImage(d.img.dataUrl, d.img.formato, xi, y, d.w, d.h);
        } else {
          letra(8.5, GRIS, 'italic'); doc.text(limpiar(`Captura no disponible: ${fila[j].nombre}`), xi, y + 4);
        }
      });
      y += altoFila + 3;
    }

    for (const e of p.enlaces) {
      espacio(6);
      letra(9, MARCA);
      doc.textWithLink(limpiar(`• ${e.nombre}`), mg, y, { url: e.url });
      const w = doc.getTextWidth(limpiar(`• ${e.nombre}`));
      letra(8.5, GRIS); doc.text(limpiar(`  ${e.origen}`), mg + w, y);
      y += 4.8;
    }

    if (p.notas.length) {
      y += 1;
      for (const n of p.notas) parrafo(`${n.etiqueta}: ${n.texto}`, 8.5, TONO.amber);
    }

    y += 2;
    doc.setDrawColor(...LINEA); doc.setLineWidth(0.25); doc.line(mg, y, mg + util, y);
    y += 7;
  }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    letra(8, GRIS);
    doc.text(limpiar(`Tiusdei · ${m.brand_nombre} · ${m.codigo}`), mg, alto - 8);
    doc.text(`Página ${i} de ${paginas}`, ancho - mg, alto - 8, { align: 'right' });
  }
  return doc.output('arraybuffer');
}

export async function exportarMinutaPdf(m: Minuta, opciones: Opciones = {}, deps: DepsPdf = {}): Promise<void> {
  const pdf = new Blob([await generarMinutaPdf(m, opciones, deps)], { type: 'application/pdf' });
  (deps.guardar ?? guardarNavegador)(pdf, nombreArchivoPdf(m));
}

function guardarNavegador(pdf: Blob, nombre: string) {
  const url = URL.createObjectURL(pdf);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Fetches an image and prepares it for the PDF: scaled down to 1400 px and re-encoded as JPEG so a minuta with
 * many screenshots stays light. The logo keeps PNG for its transparency over the band.
 */
async function cargarImagenNavegador(url: string, { transparente = false } = {}): Promise<Imagen | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const escala = Math.min(1, 1400 / bmp.width);
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bmp.width * escala);
    lienzo.height = Math.round(bmp.height * escala);
    const ctx = lienzo.getContext('2d');
    if (!ctx) return null;
    if (!transparente) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, lienzo.width, lienzo.height); }
    ctx.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    return transparente
      ? { dataUrl: lienzo.toDataURL('image/png'), ancho: lienzo.width, alto: lienzo.height, formato: 'PNG' }
      : { dataUrl: lienzo.toDataURL('image/jpeg', 0.85), ancho: lienzo.width, alto: lienzo.height, formato: 'JPEG' };
  } catch {
    return null;
  }
}
