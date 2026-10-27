import type { Request, Response, NextFunction } from 'express';
import { query, queryOne, uuid } from '../db/mysql.js';
import { getUserRole } from '../utils/roles.js';
import { avisarAsistencia } from '../utils/realtime.js';

// Ingreso automático (pedido de Steven, 26-oct): si alguien empieza a trabajar en
// Tiusdei sin haber marcado su ingreso —da play a una tarea, crea o edita una tarea,
// comenta o la pasa—, esa primera acción del día queda como su ingreso. Así no se le
// exige un marcaje a quien trabaja por servicios prestados y deja de aparecer como
// "sin ingreso". Solo de lunes a viernes de 06:00 a 18:00 (Ecuador) y nunca para
// clientes. Se marca con `attendance.auto_check_in = 1`; si nadie marca la salida, se
// cierra con la última actividad del día (jobs/inactivityMonitor.ts).
const TZ = 'America/Guayaquil';
const hechoHoy = new Map<string, string>();          // userId → fecha ya resuelta
const enCurso = new Map<string, Promise<void>>();    // evita dos ingresos por peticiones simultáneas

function ahoraEcuador() {
  const d = new Date();
  const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hour12: false, weekday: 'short' }).formatToParts(d);
  const hora = Number(p.find((x) => x.type === 'hour')?.value || 0) % 24;
  const dia = p.find((x) => x.type === 'weekday')?.value || 'Mon';
  return { fecha, hora, laborable: !['Sat', 'Sun'].includes(dia) };
}

export async function asegurarIngreso(userId: string | undefined | null): Promise<void> {
  if (!userId) return;
  const { fecha, hora, laborable } = ahoraEcuador();
  if (!laborable || hora < 6 || hora >= 18) return;
  if (hechoHoy.get(userId) === fecha) return;
  const previo = enCurso.get(userId);
  if (previo) return previo;
  const trabajo = (async () => {
    try {
      if ((await getUserRole(userId)) === 'cliente') { hechoHoy.set(userId, fecha); return; }
      const ya = await queryOne<{ id: string }>(
        `SELECT id FROM attendance WHERE user_id = ? AND DATE(CONVERT_TZ(check_in, '+00:00', '-05:00')) = ? LIMIT 1`,
        [userId, fecha],
      );
      if (!ya) {
        const ahora = new Date().toISOString().replace('T', ' ').replace('Z', '');
        await query(
          `INSERT INTO attendance (id, user_id, check_in, notes, auto_check_in) VALUES (?, ?, ?, ?, 1)`,
          [uuid(), userId, ahora, 'Ingreso automático: primera actividad del día en Tiusdei'],
        );
        avisarAsistencia(userId);
        console.log(`[INGRESO AUTO] ${userId} ${fecha}`);
      }
      hechoHoy.set(userId, fecha);
    } catch (e) {
      console.error('[INGRESO AUTO]', (e as Error).message);
    } finally {
      enCurso.delete(userId);
    }
  })();
  enCurso.set(userId, trabajo);
  return trabajo;
}

// Acciones de trabajo que cuentan como ingreso (cuando la respuesta terminó bien)
const ACCIONES = [
  /^\/time-sessions\/(start|resume-auto)$/,
  /^\/time-sessions\/[^/]+\/resume$/,
  /^\/tasks$/,
  /^\/tasks\/[^/]+$/,
  /^\/tasks\/[^/]+\/(comments|handoff|subtasks)$/,
  /^\/tasks\/bulk/,
];
export function ingresoAutomaticoMiddleware(req: Request, res: Response, next: NextFunction): void {
  if ((req.method === 'POST' || req.method === 'PATCH') && ACCIONES.some((r) => r.test(req.path))) {
    res.on('finish', () => {
      if (res.statusCode < 400) asegurarIngreso((req as Request & { userId?: string }).userId).catch(() => {});
    });
  }
  next();
}
