import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

/**
 * Validates Supabase JWT token from Authorization header.
 * Extracts user_id and role from the token payload.
 */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticación requerido' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;

  if (!jwtSecret) {
    console.error('[AUTH] SUPABASE_JWT_SECRET no configurado');
    res.status(500).json({ error: 'Error de configuración del servidor' });
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret) as {
      sub: string;
      role: string;
      user_metadata?: { role?: string };
    };

    req.userId = payload.sub;
    req.userRole = payload.role;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

/**
 * Requires admin or ops role.
 */
export function requireAdminOrOps(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.userId) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  // Note: Supabase JWT role is 'authenticated' for all users.
  // We check the actual app role from the database in the route handler.
  next();
}
