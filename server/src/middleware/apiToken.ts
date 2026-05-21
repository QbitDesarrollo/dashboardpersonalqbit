import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthRequest } from './auth.js';
import { query, queryOne } from '../db/mysql.js';

/**
 * Middleware de autenticación por token de API (para el MCP de Tiusdei).
 *
 * El MCP corre local en la PC de cada usuario y se conecta a Tiusdei por HTTPS
 * con `Authorization: Bearer <token>`. El token está ligado a un usuario; las
 * respuestas se filtran por SUS permisos (mismo aislamiento que la UI).
 *
 * Distinto de `requireAuth` (que valida un JWT de sesión de la app web).
 */

/** Hash de un token plano — sha256 hex. Lo que se guarda en DB. */
export function hashApiToken(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

/** Genera un token nuevo. Formato: tiusdei_<48 hex chars>. */
export function generateApiToken(): { plain: string; hash: string; prefix: string } {
  const raw = crypto.randomBytes(24).toString('hex'); // 48 chars
  const plain = `tiusdei_${raw}`;
  return {
    plain,
    hash: hashApiToken(plain),
    prefix: plain.slice(0, 16), // "tiusdei_xxxxxxxx" para mostrar en UI
  };
}

/**
 * Valida el Bearer token contra api_tokens. Si es válido:
 *  - setea req.userId y req.userRole con el dueño del token
 *  - actualiza last_used_at (fire-and-forget)
 * Si no, responde 401 con error nombrado.
 */
export async function requireApiToken(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'TIUSDEI_TOKEN_MISSING', message: 'Falta el token de API (Authorization: Bearer ...)' });
    return;
  }
  const token = authHeader.split(' ')[1];
  if (!token || token.length > 256) {
    res.status(401).json({ error: 'TIUSDEI_TOKEN_INVALID', message: 'Token de API malformado' });
    return;
  }

  try {
    const hash = hashApiToken(token);
    const row = await queryOne<{ id: string; user_id: string; revoked_at: string | null; rol: string; activo: number }>(
      `SELECT t.id, t.user_id, t.revoked_at, p.rol, p.activo
       FROM api_tokens t
       INNER JOIN profiles p ON p.id = t.user_id
       WHERE t.token_hash = ? LIMIT 1`,
      [hash]
    );
    if (!row) {
      res.status(401).json({ error: 'TIUSDEI_TOKEN_INVALID', message: 'Token de API no reconocido' });
      return;
    }
    if (row.revoked_at) {
      res.status(401).json({ error: 'TIUSDEI_TOKEN_REVOKED', message: 'Este token de API fue revocado' });
      return;
    }
    if (!row.activo) {
      res.status(403).json({ error: 'TIUSDEI_USER_INACTIVE', message: 'El usuario de este token está inactivo' });
      return;
    }

    req.userId = row.user_id;
    req.userRole = row.rol;

    // last_used_at — fire-and-forget
    query('UPDATE api_tokens SET last_used_at = NOW(3) WHERE id = ?', [row.id]).catch(() => {});

    next();
  } catch (e) {
    console.error('[API-TOKEN] Error validando token:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error validando el token' });
  }
}
