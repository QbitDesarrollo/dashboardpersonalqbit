import { z } from 'zod';

/** Pure rules of the minutas AI: who may use it, the daily cap and cleaning up what the model returns. */

export interface TareaSugerida { titulo: string; departamento: string }
/** Where a point came from: the meeting transcript, the client's own notes, or both. */
export type OrigenPunto = 'reunion' | 'cliente' | 'ambos';

export interface PuntoIa {
  titulo: string;
  descripcion: string;
  responsable_cliente: boolean;
  origen: OrigenPunto;
  fecha_compromiso: string | null;
  /** Verbatim quote backing the point, checked against the sources ('' if it was not found). */
  cita: string;
  cita_fuente: 'reunion' | 'cliente' | null;
  tareas_sugeridas: TareaSugerida[];
}
export interface BorradorIa { titulo: string; resumen: string; puntos: PuntoIa[] }

export class ErrorBorrador extends Error {}

export const listaDeMesas = (valor: string | null | undefined): string[] =>
  (valor ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export const tieneAcceso = (permitidas: string[], delUsuario: string[]): boolean =>
  delUsuario.some((mesa) => permitidas.includes(mesa));

export function limiteDiario(valor: string | null | undefined): number {
  const n = Number.parseInt(valor ?? '', 10);
  if (Number.isNaN(n)) return 10;
  return Math.min(Math.max(n, 0), 100);
}

/** Midnight in Guayaquil (UTC-5, no daylight saving) of the day `ahora` falls on there. */
export function inicioDelDiaEcuador(ahora: Date): Date {
  const enEcuador = new Date(ahora.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(enEcuador.getUTCFullYear(), enEcuador.getUTCMonth(), enEcuador.getUTCDate(), 5));
}

function fechaReal(valor: unknown): string | null {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor ? valor : null;
}

export interface FuentesIa { transcripcion: string; notas_cliente: string }

const compactar = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
const BORDES = /^[\s«»"'“”‘’.,;:!?¡¿()[\]-]+|[\s«»"'“”‘’.,;:!?¡¿()[\]-]+$/g;

/**
 * Where a quote really appears: in the transcript, in the client's notes, or nowhere (made up).
 * The model's own label is not trusted for this.
 */
export function ubicarCita(cita: string, fuentes: FuentesIa): 'reunion' | 'cliente' | null {
  const buscada = compactar(cita).replace(BORDES, '');
  if (!buscada) return null;
  if (compactar(fuentes.transcripcion).includes(buscada)) return 'reunion';
  if (compactar(fuentes.notas_cliente).includes(buscada)) return 'cliente';
  return null;
}

const texto = (max: number) => z.string().transform((s) => s.trim().slice(0, max));

const salidaSchema = z.object({
  titulo: texto(200),
  resumen: texto(5000),
  puntos: z.array(z.object({
    titulo: texto(300),
    descripcion: texto(5000),
    responsable: z.enum(['agencia', 'cliente']),
    origen: z.unknown(),
    fecha: z.unknown(),
    cita: texto(500),
    tareas_sugeridas: z.array(z.object({ titulo: texto(300), departamento: texto(60) })),
  })),
});

/**
 * Validates the model output and turns it into a draft. Never trust it as-is: trims, caps,
 * drops invalid dates and keeps only quotes that really appear in the sources.
 */
export function normalizarBorrador(fuentes: FuentesIa, salida: unknown): BorradorIa {
  const r = salidaSchema.safeParse(salida);
  if (!r.success) throw new ErrorBorrador('La IA devolvió un formato inesperado.');
  return {
    titulo: r.data.titulo,
    resumen: r.data.resumen,
    puntos: r.data.puntos
      .filter((p) => p.titulo)
      .slice(0, 50)
      .map((p) => {
        const cita_fuente = ubicarCita(p.cita, fuentes);
        return {
          titulo: p.titulo,
          descripcion: p.descripcion,
          responsable_cliente: p.responsable === 'cliente',
          origen: p.origen === 'cliente' || p.origen === 'ambos' ? p.origen : 'reunion',
          fecha_compromiso: fechaReal(p.fecha),
          cita: cita_fuente ? p.cita : '',
          cita_fuente,
          tareas_sugeridas: p.tareas_sugeridas.filter((t) => t.titulo).slice(0, 3),
        };
      }),
  };
}
