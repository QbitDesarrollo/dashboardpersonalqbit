import { randomInt } from 'crypto';

/**
 * Pure rules of the client link of a minuta (MINUTAS-ENLACE-PLAN.md): the access code and its lockout, what the
 * client may see and the message that goes with the link. No database, no network.
 */

/** No characters that get mixed up when copied by hand: 0/O and 1/I/L are left out. */
export const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LARGO_CODIGO = 6;
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60_000;

export function generarCodigo(azar: (max: number) => number = randomInt): string {
  let codigo = '';
  for (let i = 0; i < LARGO_CODIGO; i++) codigo += ALFABETO_CODIGO[azar(ALFABETO_CODIGO.length) % ALFABETO_CODIGO.length];
  return codigo;
}

export const normalizarCodigo = (texto: string) => texto.toUpperCase().replace(/[\s-]+/g, '');

export interface EstadoCodigo { codigo: string | null; intentos: number; bloqueadoHasta: Date | null }
export type Intento =
  | { ok: true }
  | { ok: false; motivo: 'codigo' | 'bloqueado'; intentos: number; bloqueadoHasta: Date | null };

/** One attempt at the code: five wrong ones lock the link for fifteen minutes, even for the right code. */
export function evaluarIntento(estado: EstadoCodigo, ingresado: string, ahora: Date): Intento {
  if (estado.bloqueadoHasta && estado.bloqueadoHasta > ahora) {
    return { ok: false, motivo: 'bloqueado', intentos: estado.intentos, bloqueadoHasta: estado.bloqueadoHasta };
  }
  if (estado.codigo && normalizarCodigo(ingresado) === estado.codigo) return { ok: true };
  const intentos = estado.intentos + 1;
  if (intentos >= MAX_INTENTOS) return { ok: false, motivo: 'bloqueado', intentos: 0, bloqueadoHasta: new Date(ahora.getTime() + BLOQUEO_MS) };
  return { ok: false, motivo: 'codigo', intentos, bloqueadoHasta: null };
}

interface EvidenciaInterna { id: string; tipo: string; nombre: string; url: string }
interface NotaInterna { id: string; tipo: string; texto: string; created_at: unknown; autor_nombre?: string | null; via?: string }
interface PuntoInterno {
  id: string; numero: number; titulo: string; descripcion: string | null; estado: string; visible_cliente: boolean;
  responsable_cliente: boolean; fecha_compromiso: string | null; resolucion: string | null;
  aprobado_via: string | null; aprobado_por_nombre: string | null; aprobado_en: unknown;
  evidencias: EvidenciaInterna[]; notas: NotaInterna[];
}
interface MinutaInterna {
  id: string; numero: number; codigo: string; titulo: string; fecha: string; resumen: string | null;
  brand_nombre: string; project_nombre: string | null; items: PuntoInterno[];
}

/**
 * The minuta as the client sees it: only visible, non-discarded points, with no tasks and no team members.
 * Uploaded images get the URL the caller signs; links and Drive files keep theirs, the team chose to share them.
 * Notes the team typed during a meeting carry no author; the client's own notes carry the name they entered.
 */
export function minutaParaCliente(m: MinutaInterna, urlImagen: (e: EvidenciaInterna) => string) {
  return {
    id: m.id, numero: m.numero, codigo: m.codigo, titulo: m.titulo, fecha: m.fecha, resumen: m.resumen,
    brand_nombre: m.brand_nombre, project_nombre: m.project_nombre,
    items: m.items
      .filter((p) => p.visible_cliente && p.estado !== 'descartado')
      .map((p) => ({
        id: p.id, numero: p.numero, titulo: p.titulo, descripcion: p.descripcion, estado: p.estado, visible_cliente: true,
        responsable_cliente: p.responsable_cliente, fecha_compromiso: p.fecha_compromiso, resolucion: p.resolucion,
        aprobado_via: p.aprobado_via, aprobado_por_nombre: p.aprobado_via === 'enlace' ? p.aprobado_por_nombre : null, aprobado_en: p.aprobado_en,
        evidencias: p.evidencias.map((e) => ({ id: e.id, tipo: e.tipo, nombre: e.nombre, url: e.tipo === 'imagen' ? urlImagen(e) : e.url })),
        notas: p.notas.map((n) => ({ id: n.id, tipo: n.tipo, texto: n.texto, created_at: n.created_at, autor_nombre: n.via === 'enlace' ? n.autor_nombre ?? null : null })),
      })),
  };
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (fecha: string) => { const [, mes, dia] = fecha.split('-').map(Number); return `${dia} ${MESES[mes - 1]}`; };
const enumerar = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs[0] ?? '');

export interface DatosMensaje {
  nombres: string[]; fecha: string; titulo: string; marca: string; resumen: string; enlace: string; codigo: string;
}

/** Lines of a bullet list ("- " or "• "), or null when the text is not a list (a paragraph written by hand). */
export function lineasDeLista(texto: string): string[] | null {
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lineas.length || !lineas.every((l) => /^[-•]/.test(l))) return null;
  return lineas.map((l) => l.replace(/^[-•]\s*/, ''));
}

/** The message that goes to the client, by email or copied by hand. It is Tiusdei speaking, not a person. */
export function mensajeCliente(d: DatosMensaje): string {
  const varios = d.nombres.length > 1;
  const resumen = d.resumen.trim();
  return [
    d.nombres.length ? `Hola ${enumerar(d.nombres)}:` : 'Hola:',
    '',
    `${varios ? 'Les' : 'Te'} enviamos la minuta de la reunión del ${fechaCorta(d.fecha)}, «${d.titulo}» (${d.marca}).`,
    ...(resumen ? ['', 'Lo que acordamos:', resumen] : []),
    '',
    // The client reads what was agreed, not that work starts now: the link shows how far each point got.
    `En este enlace puedes ver el avance de cada punto, aprobar lo que ya está listo y dejarnos ${varios ? 'sus' : 'tus'} comentarios:`,
    d.enlace,
    `Código de acceso: ${d.codigo}`,
  ].join('\n');
}

/** Names offered at the entry page: whoever the minuta was sent to, once each, first time first. */
export function nombresDeEnvios(envios: { para: { nombre: string; email?: string }[] }[]): string[] {
  const vistos = new Set<string>();
  const nombres: string[] = [];
  for (const e of envios) {
    for (const p of e.para) {
      const nombre = p.nombre.trim();
      const clave = nombre.toLocaleLowerCase('es');
      if (!nombre || vistos.has(clave)) continue;
      vistos.add(clave);
      nombres.push(nombre);
    }
  }
  return nombres;
}

/**
 * Plain Spanish prose only: letters, digits, spaces and the usual punctuation. The model sometimes appends noise
 * (braces, unassigned characters, "(oops)"-like tails); that must never reach a client.
 */
const PROSA = /^[\p{L}\p{M}\p{N}\s.,;:¡!¿?()«»"“”'‘’\-–—%/&+°·…]+$/u;
export function resumenValido(texto: string): boolean {
  const t = texto.trim();
  return t.length > 0 && t.length <= 1500 && PROSA.test(t);
}
