import fs from 'fs';
import path from 'path';
import type { RunnerIa } from '../minutas/ia/runner.js';
import { reporteEnvioEmail, type EmailOptions } from '../services/email.js';
import { cacheIa, datosDelReporte } from './consultas.js';
import { ErrorReporte, fechaCorta, puede } from './dominio.js';
import { generarContenido } from './generador.js';
import { generarPdf, nombreArchivoPdf } from './pdf.js';
import * as repo from './repositorio.js';
import type { FilaReporte } from './repositorio.js';

/** Report operations shared by the routes and the scheduler. */

export interface DepsReportes {
  runner: Pick<RunnerIa, 'trabajo'>;
  correo: { enviar(opciones: EmailOptions): Promise<boolean> };
  /** Waiting while Codex is busy (injected so tests do not sleep). */
  esperar?: (ms: number) => Promise<void>;
  /** Where approved PDFs are kept. */
  dirPdf: string;
  frontendUrl: string;
  /** Clock (injected in tests). */
  ahora?: () => Date;
}

export const periodoTexto = (desde: string, hasta: string) => `${fechaCorta(desde)} – ${fechaCorta(hasta)} ${hasta.slice(0, 4)}`;

/** Gathers the facts, runs the layers and stores the result as a draft. */
export async function generarYGuardar(r: FilaReporte, deps: DepsReportes, { indicaciones = '', usarAnterior = false } = {}): Promise<void> {
  const hoy = new Date(((deps.ahora ?? (() => new Date()))()).getTime() - 5 * 3600_000).toISOString().slice(0, 10);
  // A week still running (its last day is today or later) is a partial report.
  const datos = await datosDelReporte(r.project_id, { desde: r.periodo_desde, hasta: r.periodo_hasta, parcial: r.periodo_hasta >= hoy });
  const anterior = usarAnterior && r.contenido
    ? { resumen_ejecutivo: r.contenido.resumen_ejecutivo, destacados: r.contenido.destacados, mensaje_correo: r.contenido.mensaje_correo }
    : undefined;
  const contenido = await generarContenido(datos, { runner: deps.runner, cache: cacheIa, esperar: deps.esperar }, { indicaciones, anterior });
  await repo.guardarBorrador(r.id, contenido, indicaciones || null);
}

/** The stored PDF of an approved report, or one made on the fly for a draft. */
export function pdfDelReporte(r: FilaReporte): Buffer {
  if (!r.contenido) throw new ErrorReporte(409, 'El reporte todavía no tiene contenido.');
  if (r.pdf_path && fs.existsSync(r.pdf_path)) return fs.readFileSync(r.pdf_path);
  return generarPdf(r.contenido, { aprobadoPor: r.aprobado_por_nombre });
}

export async function aprobarReporte(r: FilaReporte, userId: string, nombre: string, deps: DepsReportes): Promise<void> {
  puede('aprobar', r.estado);
  fs.mkdirSync(deps.dirPdf, { recursive: true });
  const archivo = path.join(deps.dirPdf, `${r.id}.pdf`);
  fs.writeFileSync(archivo, generarPdf(r.contenido!, { aprobadoPor: nombre }));
  if (!(await repo.aprobar(r.id, userId, archivo))) throw new ErrorReporte(409, 'Solo se aprueba un borrador listo.');
}

const saludo = (nombres: string[]) => {
  if (nombres.length === 1) return `Hola ${nombres[0]},`;
  if (nombres.length <= 3) return `Hola ${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]},`;
  return 'Hola a todos,';
};

/** Deletes a report in any state but "generating", with its saved PDF and its sends. */
export async function eliminarReporte(r: FilaReporte): Promise<void> {
  puede('eliminar', r.estado);
  if (!(await repo.eliminar(r.id))) throw new ErrorReporte(409, 'Espera a que termine de generarse para eliminarlo.');
  if (r.pdf_path) fs.rmSync(r.pdf_path, { force: true });
}

/** Sends an approved report to Tiusdei users, with copies and the PDF attached, and records the send. */
export async function enviarReporte(r: FilaReporte, userId: string, para: string[], cc: string[], deps: DepsReportes): Promise<void> {
  puede('enviar', r.estado);
  const unicos = (ids: string[]) => [...new Set(ids)];
  const [idsPara, idsCc] = [unicos(para), unicos(cc).filter((id) => !para.includes(id))];
  if (!idsPara.length) throw new ErrorReporte(400, 'Elige al menos una persona.');
  const personas = await repo.destinatarios([...idsPara, ...idsCc]);
  const buscar = (ids: string[]) => ids.map((id) => personas.find((p) => p.id === id));
  const destinoPara = buscar(idsPara);
  const destinoCc = buscar(idsCc);
  if ([...destinoPara, ...destinoCc].some((p) => !p)) throw new ErrorReporte(400, 'Solo se puede enviar a personas del equipo de Tiusdei.');

  const c = r.contenido!;
  const plantilla = await reporteEnvioEmail({
    saludo: saludo(destinoPara.map((p) => p!.nombre)),
    proyecto: c.proyecto.nombre,
    periodo: periodoTexto(r.periodo_desde, r.periodo_hasta),
    lider: r.aprobado_por_nombre ?? c.proyecto.lider,
    mensaje: c.mensaje_correo,
    semaforo: c.semaforo.frase,
    indicadores: c.indicadores,
    avance: c.avance,
    tiusdeiUrl: deps.frontendUrl,
  });
  const ok = await deps.correo.enviar({
    ...plantilla,
    to: destinoPara.map((p) => p!.email).join(', '),
    cc: destinoCc.length ? destinoCc.map((p) => p!.email).join(', ') : undefined,
    attachments: [{ filename: nombreArchivoPdf(c), content: pdfDelReporte(r), contentType: 'application/pdf' }],
  });
  if (!ok) throw new ErrorReporte(502, 'No se pudo enviar el correo. Intenta de nuevo.');
  await repo.registrarEnvio(r.id, userId, idsPara, idsCc);
}
