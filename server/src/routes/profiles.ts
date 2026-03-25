import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

export const profilesRouter = Router();

profilesRouter.get('/profiles', requireAuth, async (req: AuthRequest, res) => {
  try {
    const deskId = req.query.desk_id as string | undefined;
    let rows: any[];
    if (deskId) {
      rows = await query<any[]>(
        `SELECT p.* FROM profiles p
         INNER JOIN desk_members dm ON dm.user_id = p.id
         WHERE dm.desk_id = ? AND p.activo = 1 ORDER BY p.nombre`,
        [deskId]
      );
    } else {
      rows = await query<any[]>('SELECT * FROM profiles WHERE activo = 1 ORDER BY nombre');
    }
    res.json(rows.map((r) => ({ ...r, activo: !!r.activo })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar perfiles' });
  }
});

const profilePatchSchema = z.object({
  nombre: z.string().min(1).optional(),
  rol: z.preprocess((v) => (typeof v === 'string' ? v.toLowerCase() : v), z.enum(['admin', 'ejecutivo', 'equipo', 'cliente']).optional()),
  activo: z.preprocess((v) => (v === undefined ? undefined : !!(v === 1 || v === '1' || v === true || v === 'true')), z.boolean().optional()),
}).strict();

profilesRouter.patch('/profiles/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const parsed = profilePatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    const { id } = req.params;
    const { nombre, rol, activo } = parsed.data;
    const updates: string[] = [];
    const values: unknown[] = [];
    if (nombre !== undefined) { updates.push('nombre = ?'); values.push(nombre); }
    if (rol !== undefined) { updates.push('rol = ?'); values.push(rol); }
    if (activo !== undefined) { updates.push('activo = ?'); values.push(activo ? 1 : 0); }
    if (updates.length === 0) return res.status(400).json({ error: 'Ningún campo válido para actualizar' });
    values.push(id);
    await query(`UPDATE profiles SET ${updates.join(', ')} WHERE id = ?`, values);
    // Sincronizar también la tabla users
    const userUpdates: string[] = [];
    const userValues: unknown[] = [];
    if (nombre !== undefined) { userUpdates.push('nombre = ?'); userValues.push(nombre); }
    if (rol !== undefined) { userUpdates.push('rol = ?'); userValues.push(rol); }
    if (activo !== undefined) { userUpdates.push('activo = ?'); userValues.push(activo ? 1 : 0); }
    if (userUpdates.length > 0) {
      userValues.push(id);
      await query(`UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`, userValues);
    }
    if (rol !== undefined) {
      await query('DELETE FROM user_roles WHERE user_id = ?', [id]);
      await query('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)', [uuid(), id, rol]);
    }
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});
