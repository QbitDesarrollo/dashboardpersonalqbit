import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query } from '../db/mysql.js';
import { getUserRole } from '../utils/roles.js';

export const searchRouter = Router();

// GET /api/data/search?q=xxx — búsqueda global en tareas y entregables
searchRouter.get('/search', requireAuth, async (req: AuthRequest, res) => {
  try {
    const q = (req.query.q as string)?.trim();
    if (!q || q.length < 2) {
      return res.json({ tasks: [], deliverables: [] });
    }

    const role = await getUserRole(req.userId!);
    const term = `%${q}%`;

    let brandFilter = '';
    let brandParams: string[] = [];

    if (role === 'cliente') {
      const brandIds = await query<{ brand_id: string }[]>(
        'SELECT brand_id FROM client_brands WHERE user_id = ?',
        [req.userId]
      );
      brandParams = brandIds.map((r) => r.brand_id);
      if (brandParams.length === 0) {
        return res.json({ tasks: [], deliverables: [] });
      }
      const placeholders = brandParams.map(() => '?').join(',');
      brandFilter = ` AND t.brand_id IN (${placeholders})`;
    }

    const taskParams = role === 'cliente' ? [...brandParams, term, term] : [term, term];
    const tasksSql = `
      SELECT t.id, t.titulo_tarea, t.estado, t.brand_id, b.nombre as brand_nombre
      FROM tasks t
      LEFT JOIN brands b ON b.id = t.brand_id
      WHERE (t.titulo_tarea LIKE ? OR t.detalle LIKE ?) ${brandFilter}
      ORDER BY t.updated_at DESC
      LIMIT 15
    `;

    const delivParams = role === 'cliente' ? [...brandParams, term] : [term];
    const delivSql = `
      SELECT d.id, d.task_id, t.titulo_tarea, t.brand_id, b.nombre as brand_nombre, d.estado
      FROM deliverables d
      JOIN tasks t ON t.id = d.task_id
      LEFT JOIN brands b ON b.id = t.brand_id
      WHERE (t.titulo_tarea LIKE ?) ${brandFilter}
      ORDER BY d.created_at DESC
      LIMIT 10
    `;

    const [tasks, deliverables] = await Promise.all([
      query<any[]>(tasksSql, taskParams),
      query<any[]>(delivSql, delivParams),
    ]);

    res.json({
      tasks: (tasks || []).map((r) => ({
        id: r.id,
        titulo_tarea: r.titulo_tarea,
        estado: r.estado,
        brand_nombre: r.brand_nombre,
      })),
      deliverables: (deliverables || []).map((r) => ({
        id: r.id,
        task_id: r.task_id,
        titulo_tarea: r.titulo_tarea,
        brand_nombre: r.brand_nombre,
        estado: r.estado,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error en búsqueda' });
  }
});
