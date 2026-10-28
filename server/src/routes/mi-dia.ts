import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { miDia } from '../miDia/servicio.js';
import { resolverPersonaDia } from '../calendario/permisos.js';

export const miDiaRouter = Router();
/** Día propio por defecto; userId permite consultar otra persona con permiso. */
miDiaRouter.get('/mi-dia', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = await resolverPersonaDia(req, res);
    if (!userId) return;
    res.json(await miDia(userId));
  }
  catch (error) {
    console.error('[MI-DIA]', error);
    res.status(500).json({ error: 'No se pudo cargar tu día' });
  }
});
