import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { hasRole } from '../utils/roles.js';

/** Las minutas son internas: mismos roles que pueden crear tareas. */
export async function soloEquipoInterno(req: AuthRequest, res: Response, next: NextFunction) {
  if (!(await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']))) {
    res.status(403).json({ error: 'Sin permisos' });
    return;
  }
  next();
}
