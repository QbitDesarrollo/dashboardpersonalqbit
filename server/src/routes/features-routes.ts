import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

export const featuresRouter = Router();

featuresRouter.get('/features', requireAuth, async (req: AuthRequest, res) => {
  try {
    const brandId = req.query.brand_id as string | undefined;
    let rows: any[];
    if (brandId) {
      rows = await query<any[]>('SELECT f.*, b.nombre as brand_nombre FROM features f LEFT JOIN brands b ON b.id = f.brand_id WHERE f.brand_id = ? ORDER BY f.name', [brandId]);
    } else {
      rows = await query<any[]>('SELECT f.*, b.nombre as brand_nombre FROM features f LEFT JOIN brands b ON b.id = f.brand_id ORDER BY f.name');
    }
    res.json(rows.map((r) => ({ ...r, brands: r.brand_nombre ? { nombre: r.brand_nombre } : null })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar features' });
  }
});

featuresRouter.post('/features', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const body = req.body;
    const id = uuid();
    await query(
      'INSERT INTO features (id, name, description, brand_id, status) VALUES (?, ?, ?, ?, ?)',
      [id, body.name || 'Feature', body.description || null, body.brand_id || null, body.status || 'backlog']
    );
    const row = await queryOne<any>('SELECT f.*, b.nombre as brand_nombre FROM features f LEFT JOIN brands b ON b.id = f.brand_id WHERE f.id = ?', [id]);
    res.status(201).json({ ...row, brands: row?.brand_nombre ? { nombre: row.brand_nombre } : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear feature' });
  }
});

featuresRouter.patch('/features/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const body = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    const map: Record<string, string> = { name: 'name', description: 'description', status: 'status', brand_id: 'brand_id' };
    for (const [k, col] of Object.entries(map)) {
      if (body[k] !== undefined) {
        updates.push(`${col} = ?`);
        values.push(body[k]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });
    values.push(id);
    await query(`UPDATE features SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar feature' });
  }
});
