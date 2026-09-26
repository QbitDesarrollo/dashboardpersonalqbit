import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { queryOne } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';
import { ErrorRunner } from '../minutas/ia/runner.js';
import { ErrorReporte, puede, semanasDisponibles, type Entrega } from '../reportes/dominio.js';
import { nombreArchivoPdf } from '../reportes/pdf.js';
import * as repo from '../reportes/repositorio.js';
import { aprobarReporte, enviarReporte, generarYGuardar, pdfDelReporte, type DepsReportes } from '../reportes/servicio.js';

export type { DepsReportes } from '../reportes/servicio.js';

/**
 * Weekly project reports (REPORTES-PLAN.md). Only the project leader or an admin sees and handles them.
 * Generation runs in the background: the request answers 202 and the screen polls the report.
 */

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const configSchema = z.object({
  activo: z.boolean(),
  dia_entrega: z.number().int().min(1).max(7),
  hora_entrega: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
const generarSchema = z.object({ desde: fecha.optional() });
const SEMANAS = 12;
const envioSchema = z.object({ para: z.array(z.string()).max(50), cc: z.array(z.string()).max(50).default([]) });

const conocido = (e: unknown) => e instanceof ErrorReporte || e instanceof ErrorRunner;
const mensaje = (e: unknown) => (conocido(e) ? (e as Error).message : 'No se pudo generar el reporte.');

// Express 4 does not catch rejected async handlers: answer instead of hanging.
const seguro = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) => (req: AuthRequest, res: Response) => {
  fn(req, res).catch((e) => {
    if (e instanceof ErrorReporte) return res.status(e.status).json({ error: e.message });
    console.error('[REPORTES]', e);
    if (!res.headersSent) res.status(500).json({ error: 'Error interno' });
  });
};

async function permitido(userId: string, liderId: string | null): Promise<boolean> {
  return userId === liderId || hasRole(userId, ['admin']);
}

export function crearRouterReportes(deps: DepsReportes) {
  const router = Router();
  const ahora = deps.ahora ?? (() => new Date());

  /** Loads a project and checks the caller may handle its reports. */
  const proyecto = async (req: AuthRequest, res: Response) => {
    const p = await queryOne<{ id: string; lider_user_id: string | null; lider_activo: number | null }>(
      'SELECT p.id, p.lider_user_id, pr.activo AS lider_activo FROM projects p LEFT JOIN profiles pr ON pr.id = p.lider_user_id WHERE p.id = ?',
      [String(req.params.id)],
    );
    if (!p) { res.status(404).json({ error: 'Proyecto no encontrado' }); return null; }
    if (!(await permitido(req.userId!, p.lider_user_id))) { res.status(403).json({ error: 'Solo el líder del proyecto o un admin manejan sus reportes.' }); return null; }
    return p;
  };
  /** Reports need someone to receive and approve them: no active leader, no reports. */
  const sinLider = (p: { lider_user_id: string | null; lider_activo: number | null }, res: Response) => {
    if (p.lider_user_id && Number(p.lider_activo)) return false;
    res.status(409).json({ error: 'Asigna un líder activo al proyecto primero.' });
    return true;
  };
  const reporte = async (req: AuthRequest, res: Response) => {
    const r = await repo.leerReporte(String(req.params.id));
    if (!r) { res.status(404).json({ error: 'Reporte no encontrado' }); return null; }
    if (!(await permitido(req.userId!, r.lider_user_id))) { res.status(403).json({ error: 'Solo el líder del proyecto o un admin manejan sus reportes.' }); return null; }
    return r;
  };

  /** Background generation started by a person; on failure the previous content stays, with the error. */
  const generarAhora = (r: repo.FilaReporte, opciones: { indicaciones?: string; usarAnterior?: boolean }) => {
    void generarYGuardar(r, deps, opciones).catch(async (e) => {
      if (!conocido(e)) console.error('[REPORTES] generar:', e);
      await repo.volverABorrador(r.id, r.contenido ? 'borrador' : 'fallido', mensaje(e)).catch(() => {});
    });
  };

  router.get('/reportes/pendientes', requireAuth, seguro(async (req, res) => {
    res.json({ pendientes: await repo.pendientesDe(req.userId!) });
  }));

  router.get('/projects/:id/reportes/config', requireAuth, seguro(async (req, res) => {
    const p = await proyecto(req, res);
    if (p) res.json(await repo.leerConfig(p.id));
  }));

  router.put('/projects/:id/reportes/config', requireAuth, seguro(async (req, res) => {
    const p = await proyecto(req, res);
    if (!p || sinLider(p, res)) return;
    const b = configSchema.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Revisa el día (1 a 7) y la hora (HH:MM).' });
    await repo.guardarConfig(p.id, b.data, req.userId!);
    res.json(await repo.leerConfig(p.id));
  }));

  router.get('/projects/:id/reportes', requireAuth, seguro(async (req, res) => {
    const p = await proyecto(req, res);
    if (!p) return;
    const filas = await repo.listarReportes(p.id);
    res.json(filas.map(({ contenido, ...f }) => ({ ...f, resumen: contenido?.resumen_ejecutivo ?? null, parcial: !!(contenido as { periodo?: { parcial?: boolean } } | null)?.periodo?.parcial })));
  }));

  /** Weeks aligned to the project's delivery day: this one up to today, then the previous full ones. */
  const semanas = async (projectId: string) => semanasDisponibles(await repo.leerConfig(projectId), ahora(), SEMANAS);

  router.get('/projects/:id/reportes/semanas', requireAuth, seguro(async (req, res) => {
    const p = await proyecto(req, res);
    if (p) res.json(await semanas(p.id));
  }));

  router.post('/projects/:id/reportes/generar', requireAuth, seguro(async (req, res) => {
    const p = await proyecto(req, res);
    if (!p || sinLider(p, res)) return;
    const b = generarSchema.safeParse(req.body ?? {});
    if (!b.success) return res.status(400).json({ error: 'Elige una semana.' });
    const lista = await semanas(p.id);
    const semana = b.data.desde ? lista.find((s) => s.desde === b.data.desde) : lista[0];
    if (!semana) return res.status(400).json({ error: 'Elige una de las semanas disponibles.' });
    const entrega: Entrega = { entregarEn: ahora(), desde: semana.desde, hasta: semana.hasta };
    const id = await repo.asegurarReporte(p.id, entrega, 'programado');
    const r = (await repo.leerReporte(id))!;
    if (r.estado === 'aprobado') return res.status(409).json({ error: 'Ese periodo ya tiene un reporte aprobado.' });
    if (!(await repo.marcarGenerando(id, ['programado', 'borrador', 'fallido']))) return res.status(409).json({ error: 'Ese reporte ya se está generando.' });
    // Asked by a person: no "your report is ready" email for it.
    await repo.marcarNotificado(id);
    res.status(202).json({ id });
    generarAhora(r, {});
  }));

  router.get('/reportes/:id', requireAuth, seguro(async (req, res) => {
    const r = await reporte(req, res);
    if (r) res.json({ ...r, envios: await repo.envios(r.id) });
  }));

  router.get('/reportes/:id/pdf', requireAuth, seguro(async (req, res) => {
    const r = await reporte(req, res);
    if (!r) return;
    const pdf = pdfDelReporte(r);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(nombreArchivoPdf(r.contenido!))}"`);
    res.send(pdf);
  }));

  router.post('/reportes/:id/regenerar', requireAuth, seguro(async (req, res) => {
    const r = await reporte(req, res);
    if (!r) return;
    puede('regenerar', r.estado);
    const indicaciones = typeof req.body?.indicaciones === 'string' ? req.body.indicaciones.trim().slice(0, 500) : '';
    if (!(await repo.marcarGenerando(r.id, ['borrador', 'fallido']))) return res.status(409).json({ error: 'Ese reporte ya se está generando.' });
    res.status(202).json({ id: r.id });
    generarAhora(r, { indicaciones, usarAnterior: true });
  }));

  router.post('/reportes/:id/aprobar', requireAuth, seguro(async (req, res) => {
    const r = await reporte(req, res);
    if (!r) return;
    const yo = await queryOne<{ nombre: string }>('SELECT nombre FROM profiles WHERE id = ?', [req.userId]);
    await aprobarReporte(r, req.userId!, yo?.nombre ?? 'Tiusdei', deps);
    res.json(await repo.leerReporte(r.id));
  }));

  router.post('/reportes/:id/enviar', requireAuth, seguro(async (req, res) => {
    const r = await reporte(req, res);
    if (!r) return;
    const b = envioSchema.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Elige a quién enviarlo.' });
    await enviarReporte(r, req.userId!, b.data.para, b.data.cc, deps);
    res.json({ ok: true, envios: await repo.envios(r.id) });
  }));

  return router;
}
