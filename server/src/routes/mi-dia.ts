import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { miDia } from '../miDia/servicio.js';

export const miDiaRouter = Router();
/** Solo el usuario autenticado; los filtros del dashboard nunca cambian esta identidad. */
miDiaRouter.get('/mi-dia', requireAuth, async (req: AuthRequest, res) => {
  try { res.json(await miDia(req.userId!)); }
  catch (error) {
    console.error('[MI-DIA]', error);
    res.status(500).json({ error: 'No se pudo cargar tu día' });
  }
});
