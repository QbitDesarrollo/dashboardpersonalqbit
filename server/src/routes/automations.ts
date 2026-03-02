import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

export const automationsRouter = Router();

automationsRouter.get('/automations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const brandId = req.query.brand_id as string | undefined;
    const where = brandId ? ' WHERE a.brand_id = ?' : '';
    const params = brandId ? [brandId] : [];
    const rows = await query<any[]>(
      `SELECT a.*, b.nombre as brand_nombre
       FROM automations a
       LEFT JOIN brands b ON b.id = a.brand_id
       ${where}
       ORDER BY a.created_at DESC`,
      params
    );
    res.json(rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar automatizaciones' });
  }
});

automationsRouter.get('/automations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const row = await queryOne<any>(
      'SELECT a.*, b.nombre as brand_nombre FROM automations a LEFT JOIN brands b ON b.id = a.brand_id WHERE a.id = ?',
      [id]
    );
    if (!row) return res.status(404).json({ error: 'No encontrada' });
    row.trigger_config = typeof row.trigger_config === 'string' ? JSON.parse(row.trigger_config) : row.trigger_config;
    row.action_config = typeof row.action_config === 'string' ? JSON.parse(row.action_config) : row.action_config;
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar' });
  }
});

automationsRouter.post('/automations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { name, brand_id, desk_id, trigger_type, trigger_config, action_type, action_config } = req.body;
    if (!name || !trigger_type || !action_type) return res.status(400).json({ error: 'name, trigger_type y action_type requeridos' });
    const id = uuid();
    await query(
      `INSERT INTO automations (id, name, brand_id, desk_id, trigger_type, trigger_config, action_type, action_config, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, name, brand_id || null, desk_id || null,
        trigger_type, JSON.stringify(trigger_config || {}), action_type, JSON.stringify(action_config || {}),
        req.userId,
      ]
    );
    const row = await queryOne<any>('SELECT * FROM automations WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear' });
  }
});

automationsRouter.patch('/automations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const { name, brand_id, desk_id, is_active, trigger_type, trigger_config, action_type, action_config } = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    const map: Record<string, string> = { name: 'name', brand_id: 'brand_id', desk_id: 'desk_id', trigger_type: 'trigger_type', action_type: 'action_type' };
    for (const [k, col] of Object.entries(map)) {
      if (req.body[k] !== undefined) { updates.push(`${col} = ?`); values.push(req.body[k]); }
    }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (trigger_config !== undefined) { updates.push('trigger_config = ?'); values.push(JSON.stringify(trigger_config)); }
    if (action_config !== undefined) { updates.push('action_config = ?'); values.push(JSON.stringify(action_config)); }
    if (updates.length === 0) return res.status(400).json({ error: 'Sin campos' });
    values.push(id);
    await query(`UPDATE automations SET ${updates.join(', ')} WHERE id = ?`, values);
    const row = await queryOne<any>('SELECT * FROM automations WHERE id = ?', [id]);
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

automationsRouter.delete('/automations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    await query('DELETE FROM automations WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

automationsRouter.get('/automations/:id/logs', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const rows = await query<any[]>(
      'SELECT id, automation_id, task_id, success, error_message, created_at FROM automation_log WHERE automation_id = ? ORDER BY created_at DESC LIMIT 50',
      [id]
    );
    res.json(rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar logs' });
  }
});
