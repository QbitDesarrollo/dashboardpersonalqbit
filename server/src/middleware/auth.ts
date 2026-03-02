import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getUserRole } from '../utils/roles.js';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

const JWT_SECRET = process.env.JWT_SECRET!;

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticación requerido' });
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token || token.length > 2048) {
    res.status(401).json({ error: 'Token inválido' });
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
      res.status(401).json({ error: 'Token malformado' });
      return;
    }

    req.userId = payload.sub;
    req.userRole = payload.role;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

export async function requireAdminOrOps(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  // Consultar rol actual de la BD para reflejar cambios inmediatos
  const currentRole = await getUserRole(req.userId);
  req.userRole = currentRole;
  if (currentRole !== 'admin' && currentRole !== 'ops') {
    res.status(403).json({ error: 'Se requieren permisos de administrador u OPS' });
    return;
  }
  next();
}
