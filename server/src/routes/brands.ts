import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { getUserRole, hasRole } from '../utils/roles.js';

export const brandsRouter = Router();

brandsRouter.get('/brands', requireAuth, async (req: AuthRequest, res) => {
  try {
    const role = await getUserRole(req.userId!);
    let rows: any[];
    if (role === 'cliente') {
      const brandIds = await query<{ brand_id: string }[]>('SELECT brand_id FROM client_brands WHERE user_id = ?', [req.userId]);
      const ids = brandIds.map((r) => r.brand_id);
      if (ids.length === 0) { res.json([]); return; }
      const placeholders = ids.map(() => '?').join(',');
      rows = await query<any[]>(`SELECT b.*, c.nombre as cliente_nombre FROM brands b LEFT JOIN clients c ON c.id = b.cliente_id WHERE b.id IN (${placeholders}) ORDER BY b.nombre`, ids);
    } else if (role === 'equipo') {
      // Equipo solo ve marcas de las tareas en sus mesas o asignadas a él
      rows = await query<any[]>(
        `SELECT DISTINCT b.*, c.nombre as cliente_nombre
         FROM brands b
         LEFT JOIN clients c ON c.id = b.cliente_id
         INNER JOIN tasks t ON t.brand_id = b.id
         LEFT JOIN desk_members dm ON dm.desk_id = t.desk_id AND dm.user_id = ?
         WHERE dm.user_id IS NOT NULL OR t.responsable_user_id = ?
         ORDER BY b.nombre`,
        [req.userId, req.userId]
      );
    } else {
      rows = await query<any[]>(`SELECT b.*, c.nombre as cliente_nombre FROM brands b LEFT JOIN clients c ON c.id = b.cliente_id ORDER BY b.nombre`);
    }
    const mapped = rows.map((r) => ({ ...r, clients: r.cliente_nombre ? { nombre: r.cliente_nombre } : null }));
    res.json(mapped);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar marcas' });
  }
});

brandsRouter.post('/brands', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { nombre, cliente_id, activo } = req.body;
    const id = uuid();
    await query('INSERT INTO brands (id, nombre, cliente_id, activo) VALUES (?, ?, ?, ?)', [id, nombre, cliente_id || null, activo !== false ? 1 : 0]);
    const row = await queryOne<any>('SELECT * FROM brands WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear marca' });
  }
});

brandsRouter.patch('/brands/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const { nombre, cliente_id, activo } = req.body;
    await query('UPDATE brands SET nombre = ?, cliente_id = ?, activo = ? WHERE id = ?', [nombre, cliente_id || null, activo !== false ? 1 : 0, id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});
