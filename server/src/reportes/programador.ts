import { queryOne } from '../db/mysql.js';
import { ErrorRunner } from '../minutas/ia/runner.js';
import { createNotification } from '../utils/notifications.js';
import { reporteFallidoEmail, reporteListoEmail } from '../services/email.js';
import { ErrorReporte, entregasAbiertas } from './dominio.js';
import * as repo from './repositorio.js';
import { generarYGuardar, periodoTexto, type DepsReportes } from './servicio.js';

/**
 * Scheduled reports (REPORTES-PLAN.md): each tick queues the deliveries whose preparation window opened,
 * generates what is queued (one Codex job at a time), retries failures and tells the leader when a draft
 * is ready — at the delivery time, not when it was generated.
 */

const MAX_INTENTOS = 3;
/** Opens the project and the report straight from the email. */
const enlace = (deps: DepsReportes, r: repo.FilaReporte) => `${deps.frontendUrl}/proyectos?proyecto=${r.project_id}&reporte=${r.id}`;
const ESPERA_REINTENTO_MIN = [10, 30];

async function lider(projectId: string) {
  return queryOne<{ id: string; nombre: string; email: string | null }>(
    'SELECT pr.id, pr.nombre, pr.email FROM projects p JOIN profiles pr ON pr.id = p.lider_user_id WHERE p.id = ? AND pr.activo = 1',
    [projectId],
  );
}

async function fallo(r: repo.FilaReporte, error: unknown, ahora: Date, deps: DepsReportes) {
  const conocido = error instanceof ErrorRunner || error instanceof ErrorReporte;
  if (!conocido) console.error('[REPORTES] generación programada:', error);
  const mensaje = conocido ? (error as Error).message : 'No se pudo generar el reporte.';
  const intento = r.intentos + 1;
  if (intento < MAX_INTENTOS) {
    await repo.registrarFallo(r.id, mensaje, new Date(ahora.getTime() + ESPERA_REINTENTO_MIN[intento - 1] * 60_000));
    return;
  }
  await repo.registrarFallo(r.id, mensaje, null);
  const l = await lider(r.project_id);
  if (!l) return;
  await createNotification(l.id, `No se pudo generar el reporte semanal de ${r.proyecto_nombre}.`, null);
  if (l.email) {
    const correo = await reporteFallidoEmail({
      recipientName: l.nombre, proyecto: r.proyecto_nombre, periodo: periodoTexto(r.periodo_desde, r.periodo_hasta), proyectoUrl: enlace(deps, r),
    });
    await deps.correo.enviar({ ...correo, to: l.email });
  }
}

export async function tickReportes(deps: DepsReportes, ahora = new Date()): Promise<void> {
  // Left "generating" by a restart: count it as a failed attempt so it is retried.
  for (const r of await repo.colgados(ahora)) await fallo(r, new ErrorReporte(500, 'La generación se interrumpió.'), ahora, deps);
  await repo.descartarSinLider();

  for (const c of await repo.configsActivas()) {
    for (const e of entregasAbiertas(c, ahora)) await repo.asegurarReporte(c.project_id, e);
  }

  for (;;) {
    const r = await repo.tomarSiguiente(ahora);
    if (!r) break;
    try {
      await generarYGuardar(r, deps);
    } catch (e) {
      await fallo(r, e, ahora, deps);
    }
  }

  for (const r of await repo.porNotificar(ahora)) {
    await repo.marcarNotificado(r.id);
    const l = await lider(r.project_id);
    if (!l) continue;
    await createNotification(l.id, `Tu reporte semanal de ${r.proyecto_nombre} está listo para revisar.`, null);
    if (l.email) {
      const correo = await reporteListoEmail({
        recipientName: l.nombre, proyecto: r.proyecto_nombre, periodo: periodoTexto(r.periodo_desde, r.periodo_hasta),
        resumen: r.contenido?.resumen_ejecutivo ?? '', proyectoUrl: enlace(deps, r),
      });
      await deps.correo.enviar({ ...correo, to: l.email });
    }
  }
}

/** Runs the scheduler every two minutes, never two ticks at once. */
export function iniciarProgramadorReportes(deps: DepsReportes): void {
  let corriendo = false;
  const correr = async () => {
    if (corriendo) return;
    corriendo = true;
    try { await tickReportes(deps); } catch (e) { console.error('[REPORTES] programador:', e); } finally { corriendo = false; }
  };
  setTimeout(correr, 90_000);
  setInterval(correr, 2 * 60_000);
}
