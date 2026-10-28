import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { hasRole } from '../utils/roles.js';

export const puedeGestionarMinutas = (userId: string) => hasRole(userId, ['admin', 'ejecutivo', 'equipo']);

/** Las minutas son internas: mismos roles que pueden crear tareas. */
export async function soloEquipoInterno(req: AuthRequest, res: Response, next: NextFunction) {
  if (!(await puedeGestionarMinutas(req.userId!))) {
    res.status(403).json({ error: 'Sin permisos' });
    return;
  }
  next();
}
