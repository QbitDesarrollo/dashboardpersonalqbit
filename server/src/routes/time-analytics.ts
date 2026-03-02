import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query } from '../db/mysql.js';
import { getUserRole } from '../utils/roles.js';

export const timeAnalyticsRouter = Router();

// GET /api/data/time-analytics — tiempo_trabajado agregado por usuario, marca y top tareas
timeAnalyticsRouter.get('/time-analytics', requireAuth, async (req: AuthRequest, res) => {
  try {
    const role = await getUserRole(req.userId!);
    let brandFilter = '';
    let flatParams: string[] = [];

    if (role === 'cliente') {
      const brandRows = await query<{ brand_id: string }[]>(
        'SELECT brand_id FROM client_brands WHERE user_id = ?',
        [req.userId]
      );
      flatParams = brandRows.map((r) => r.brand_id);
      if (flatParams.length === 0) {
        return res.json({
          by_user: [],
          by_brand: [],
          top_tasks: [],
          total_seconds: 0,
        });
      }
      const placeholders = flatParams.map(() => '?').join(',');
      brandFilter = ` AND t.brand_id IN (${placeholders})`;
    }

    const byUserSql = `
      SELECT p.id as user_id, p.nombre as user_name,
             COALESCE(SUM(t.tiempo_trabajado), 0) as total_seconds,
             COUNT(t.id) as task_count
      FROM profiles p
      LEFT JOIN tasks t ON t.responsable_user_id = p.id AND t.tiempo_trabajado > 0 ${brandFilter}
      WHERE p.activo = 1 AND p.rol IN ('admin', 'ops', 'equipo')
      GROUP BY p.id, p.nombre
      HAVING total_seconds > 0 OR task_count > 0
      ORDER BY total_seconds DESC
    `;

    const byBrandSql = `
      SELECT b.id as brand_id, b.nombre as brand_name,
             COALESCE(SUM(t.tiempo_trabajado), 0) as total_seconds,
             COUNT(t.id) as task_count
      FROM brands b
      LEFT JOIN tasks t ON t.brand_id = b.id AND t.tiempo_trabajado > 0 ${brandFilter}
      WHERE b.activo = 1
      GROUP BY b.id, b.nombre
      HAVING total_seconds > 0
      ORDER BY total_seconds DESC
      LIMIT 20
    `;

    const topTasksSql = `
      SELECT t.id, t.titulo_tarea, t.tiempo_trabajado as total_seconds,
             b.nombre as brand_name, p.nombre as resp_name
      FROM tasks t
      LEFT JOIN brands b ON b.id = t.brand_id
      LEFT JOIN profiles p ON p.id = t.responsable_user_id
      WHERE t.tiempo_trabajado > 0 ${brandFilter}
      ORDER BY t.tiempo_trabajado DESC
      LIMIT 30
    `;

    const [byUser, byBrand, topTasks, totalRow] = await Promise.all([
      query<any[]>(byUserSql, flatParams),
      query<any[]>(byBrandSql, flatParams),
      query<any[]>(topTasksSql, flatParams),
      query<any[]>(
        `SELECT COALESCE(SUM(tiempo_trabajado), 0) as total FROM tasks t WHERE 1=1 ${brandFilter}`,
        flatParams
      ),
    ]);

    const total = Array.isArray(totalRow) && totalRow[0] ? Number(totalRow[0].total) : 0;

    res.json({
      by_user: (byUser || []).map((r) => ({
        user_id: r.user_id,
        user_name: r.user_name,
        total_seconds: Number(r.total_seconds || 0),
        task_count: Number(r.task_count || 0),
      })),
      by_brand: (byBrand || []).map((r) => ({
        brand_id: r.brand_id,
        brand_name: r.brand_name,
        total_seconds: Number(r.total_seconds || 0),
        task_count: Number(r.task_count || 0),
      })),
      top_tasks: (topTasks || []).map((r) => ({
        id: r.id,
        titulo_tarea: r.titulo_tarea,
        total_seconds: Number(r.total_seconds || 0),
        brand_name: r.brand_name,
        resp_name: r.resp_name,
      })),
      total_seconds: total,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar analytics de tiempo' });
  }
});
