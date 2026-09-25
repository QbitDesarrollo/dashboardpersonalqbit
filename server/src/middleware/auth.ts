import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getUserRole } from '../utils/roles.js';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

const JWT_SECRET = process.env.JWT_SECRET!;

/**
 * 401 because the session itself is missing or invalid. The header lets the web app tell it
 * apart from other 401s (e.g. "Google no conectado") and only then close the session.
 */
function sesionInvalida(res: Response, error: string): void {
  res.setHeader('X-Tiusdei-Sesion', 'invalida');
  res.status(401).json({ error });
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sesionInvalida(res, 'Token de autenticación requerido');
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token || token.length > 2048) {
    sesionInvalida(res, 'Token inválido');
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      maxAge: '7d',
    }) as {
      sub: string;
      role: string;
    };

    if (!payload.sub || !payload.role) {
      sesionInvalida(res, 'Token malformado');
      return;
    }

    req.userId = payload.sub;
    req.userRole = payload.role;
    next();
  } catch (error) {
    sesionInvalida(res, 'Token inválido o expirado');
  }
}

export async function requireAdminOrEjecutivo(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  // Consultar rol actual de la BD para reflejar cambios inmediatos
  const currentRole = await getUserRole(req.userId);
  req.userRole = currentRole;
  if (currentRole !== 'admin' && currentRole !== 'ejecutivo') {
    res.status(403).json({ error: 'Se requieren permisos de administrador o ejecutivo' });
    return;
  }
  next();
}
