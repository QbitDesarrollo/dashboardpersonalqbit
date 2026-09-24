import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { hasRole } from '../utils/roles.js';
import { fechaIso } from '../minutas/esquemas.js';
import { soloEquipoInterno } from '../minutas/permisos.js';
import { ErrorBorrador, normalizarBorrador, tieneAcceso } from '../minutas/ia/dominio.js';
import { ErrorRunner, type DatosMinutaIa, type RunnerIa } from '../minutas/ia/runner.js';
import { configuracionIa, crearTrabajo, fallarTrabajo, leerTrabajo, mesasDe, terminarTrabajo, usadosHoy } from '../minutas/ia/consultas.js';

const pedidoSchema = z.object({
  transcripcion: z.string().trim().max(120_000).default(''),
  notas_cliente: z.string().trim().max(30_000).default(''),
  indicaciones: z.string().trim().max(500).default(''),
  fecha: fechaIso,
}).refine((p) => p.transcripcion || p.notas_cliente);

// Express 4 does not catch rejected async handlers: answer 500 instead of leaving the request hanging.
const seguro = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) => (req: AuthRequest, res: Response) => {
  fn(req, res).catch((e) => {
    console.error('[MINUTAS-IA]', e);
    if (!res.headersSent) res.status(500).json({ error: 'Error interno' });
  });
};

/**
 * Minuta drafts written by AI. Only members of the desks chosen in Admin → Config may use it,
 * with a daily cap per person. The sources go to the runner and are never stored.
 */
export function crearRouterMinutasIa(runner: RunnerIa) {
  const router = Router();
  router.use('/minutas/ia', requireAuth, soloEquipoInterno);

  const acceso = async (userId: string) => {
    const { mesas, limite } = await configuracionIa();
    return { permitido: tieneAcceso(mesas, await mesasDe(userId)), limite };
  };

  // Runs in the background: the request answers 202 right away and the screen polls the job.
  const procesar = async (id: string, datos: DatosMinutaIa) => {
    try {
      await terminarTrabajo(id, normalizarBorrador(datos, await runner.generar(datos)));
    } catch (e) {
      const conocido = e instanceof ErrorRunner || e instanceof ErrorBorrador;
      if (!conocido) console.error('[MINUTAS-IA] Error inesperado:', e);
      await fallarTrabajo(id, conocido ? (e as Error).message : 'No se pudo generar la minuta.').catch(() => {});
    }
  };

  router.get('/minutas/ia/estado', seguro(async (req, res) => {
    const { permitido, limite } = await acceso(req.userId!);
    const salud = permitido ? await runner.salud() : null;
    res.json({ permitido, disponible: salud?.listo ?? false, detalle: salud?.detalle ?? null, usados: await usadosHoy(req.userId!), limite });
  }));

  router.get('/minutas/ia/salud', seguro(async (req, res) => {
    if (!(await hasRole(req.userId!, ['admin', 'ejecutivo']))) return res.status(403).json({ error: 'Sin permisos' });
    res.json(await runner.salud());
  }));

  router.post('/minutas/ia/borradores', seguro(async (req, res) => {
    const pedido = pedidoSchema.safeParse(req.body);
    if (!pedido.success) return res.status(400).json({ error: 'Pega la transcripción o lo que mandó el cliente, y elige la fecha.' });
    const { permitido, limite } = await acceso(req.userId!);
    if (!permitido) return res.status(403).json({ error: 'La IA de minutas no está habilitada para tu mesa.' });
    if ((await usadosHoy(req.userId!)) >= limite) {
      return res.status(429).json({ error: `Llegaste al límite de ${limite} ${limite === 1 ? 'minuta' : 'minutas'} con IA por hoy.` });
    }
    const id = await crearTrabajo(req.userId!, pedido.data.transcripcion.length + pedido.data.notas_cliente.length);
    res.status(202).json({ id });
    void procesar(id, pedido.data);
  }));

  router.get('/minutas/ia/borradores/:id', seguro(async (req, res) => {
    const trabajo = await leerTrabajo(String(req.params.id), req.userId!);
    if (!trabajo) return res.status(404).json({ error: 'No existe ese borrador.' });
    if (Number(trabajo.colgado)) {
      const error = 'La generación se interrumpió. Intenta de nuevo.';
      await fallarTrabajo(trabajo.id, error);
      return res.json({ id: trabajo.id, estado: 'error', borrador: null, error });
    }
    res.json({ id: trabajo.id, estado: trabajo.estado, borrador: trabajo.borrador, error: trabajo.error });
  }));

  return router;
}
