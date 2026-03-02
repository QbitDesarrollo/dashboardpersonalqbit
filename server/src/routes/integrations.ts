import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

export const integrationsRouter = Router();

integrationsRouter.get('/integrations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const brandId = req.query.brand_id as string | undefined;
    const where = brandId ? ' WHERE i.brand_id = ?' : '';
    const params = brandId ? [brandId] : [];
    const rows = await query<any[]>(
      `SELECT i.*, b.nombre as brand_nombre FROM integrations i
       LEFT JOIN brands b ON b.id = i.brand_id ${where} ORDER BY i.created_at DESC`,
      params
    );
    res.json((rows || []).map((r) => ({ ...r, config: typeof r.config === 'string' ? JSON.parse(r.config) : r.config })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar integraciones' });
  }
});

integrationsRouter.post('/integrations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { type, name, config, brand_id } = req.body;
    if (!type || !name) return res.status(400).json({ error: 'type y name requeridos' });
    const id = uuid();
    await query(
      'INSERT INTO integrations (id, type, name, config, brand_id, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [id, type, name || type, JSON.stringify(config || {}), brand_id || null, req.userId]
    );
    const row = await queryOne<any>('SELECT * FROM integrations WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear' });
  }
});

integrationsRouter.patch('/integrations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const { name, config, brand_id, is_active } = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (config !== undefined) { updates.push('config = ?'); values.push(JSON.stringify(config)); }
    if (brand_id !== undefined) { updates.push('brand_id = ?'); values.push(brand_id); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (updates.length === 0) return res.status(400).json({ error: 'Sin campos' });
    values.push(id);
    await query(`UPDATE integrations SET ${updates.join(', ')} WHERE id = ?`, values);
    const row = await queryOne<any>('SELECT * FROM integrations WHERE id = ?', [id]);
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

integrationsRouter.delete('/integrations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    await query('DELETE FROM integrations WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});
