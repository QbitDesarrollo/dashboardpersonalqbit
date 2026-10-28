import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { queryOne } from '../db/mysql.js';

/** Misma configuración para la daily y la consulta del día de otra persona. */
export async function puedeVerDiaDeOtros(role: string | undefined): Promise<boolean> {
  const row = await queryOne<{ value: string | null }>(
    "SELECT value FROM site_settings WHERE `key` = 'daily_meetings_roles'",
  );
  const roles = (row?.value || 'admin,ejecutivo').split(',').map(r => r.trim()).filter(Boolean);
  return roles.includes(role || '');
}

/** La identidad propia conserva el acceso anterior, sin consultar el ajuste. */
export async function resolverPersonaDia(req: AuthRequest, res: Response): Promise<string | null> {
  const target = req.query.userId;
  if (target === undefined || target === req.userId) return req.userId!;
  if (!await puedeVerDiaDeOtros(req.userRole)) {
    res.status(403).json({ error: 'Sin permisos para ver reuniones' });
    return null;
  }
  const persona = typeof target === 'string'
    ? await queryOne<{ id: string }>('SELECT id FROM profiles WHERE id=? AND activo=1', [target])
    : null;
  if (!persona) {
    res.status(404).json({ error: 'Persona no encontrada' });
    return null;
  }
  return persona.id;
}
