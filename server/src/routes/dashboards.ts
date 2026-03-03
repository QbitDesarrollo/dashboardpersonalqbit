import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';

export const dashboardsRouter = Router();

const widgetSchema = z.object({
  id: z.string(),
  type: z.enum([
    'task_count_by_status',
    'task_count_by_priority',
    'tasks_due_this_week',
    'time_tracked_chart',
    'tasks_by_brand',
    'tasks_by_user',
  ]),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(12),
  config: z.record(z.unknown()).optional(),
});

const createDashboardSchema = z.object({
  name: z.string().min(1).max(255),
  layout: z.array(widgetSchema).max(20),
  is_default: z.boolean().optional().default(false),
});

// GET all dashboards for current user
dashboardsRouter.get('/dashboards', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await query<any[]>(
      'SELECT id, name, is_default, created_at, updated_at FROM user_dashboards WHERE user_id = ? ORDER BY is_default DESC, name',
      [req.userId]
    );
    res.json(rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar dashboards' });
  }
});

// GET single dashboard with layout
dashboardsRouter.get('/dashboards/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const row = await queryOne<any>(
      'SELECT * FROM user_dashboards WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!row) return res.status(404).json({ error: 'Dashboard no encontrado' });
    row.layout = typeof row.layout === 'string' ? JSON.parse(row.layout) : row.layout;
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar dashboard' });
  }
});

// POST create dashboard
dashboardsRouter.post('/dashboards', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = createDashboardSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    const { name, layout, is_default } = parsed.data;
    if (is_default) {
      await query('UPDATE user_dashboards SET is_default = 0 WHERE user_id = ?', [req.userId]);
    }
    const id = uuid();
    await query(
      'INSERT INTO user_dashboards (id, user_id, name, layout, is_default) VALUES (?, ?, ?, ?, ?)',
      [id, req.userId, name, JSON.stringify(layout), is_default ? 1 : 0]
    );
    const row = await queryOne<any>('SELECT * FROM user_dashboards WHERE id = ?', [id]);
    if (row) row.layout = typeof row.layout === 'string' ? JSON.parse(row.layout) : row.layout;
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear dashboard' });
  }
});

// PATCH update dashboard
dashboardsRouter.patch('/dashboards/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const existing = await queryOne<any>('SELECT * FROM user_dashboards WHERE id = ? AND user_id = ?', [id, req.userId]);
    if (!existing) return res.status(404).json({ error: 'No encontrado' });

    const updates: string[] = [];
    const values: unknown[] = [];
    if (req.body.name !== undefined) { updates.push('name = ?'); values.push(req.body.name); }
    if (req.body.layout !== undefined) { updates.push('layout = ?'); values.push(JSON.stringify(req.body.layout)); }
    if (req.body.is_default !== undefined) {
      if (req.body.is_default) {
        await query('UPDATE user_dashboards SET is_default = 0 WHERE user_id = ?', [req.userId]);
      }
      updates.push('is_default = ?');
      values.push(req.body.is_default ? 1 : 0);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Sin campos' });
    values.push(id);
    await query(`UPDATE user_dashboards SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar dashboard' });
  }
});

// DELETE dashboard
dashboardsRouter.delete('/dashboards/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    await query('DELETE FROM user_dashboards WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar dashboard' });
  }
});

// GET widget data (aggregated queries per widget type)
dashboardsRouter.get('/dashboards/widget-data/:type', requireAuth, async (req: AuthRequest, res) => {
  try {
    const type = req.params.type;
    const brandId = req.query.brand_id as string | undefined;
    const brandFilter = brandId ? ' AND t.brand_id = ?' : '';
    const brandParams = brandId ? [brandId] : [];

    switch (type) {
      case 'task_count_by_status': {
        const rows = await query<any[]>(
          `SELECT t.estado, COUNT(*) as count FROM tasks t WHERE (t.parent_task_id IS NULL OR t.parent_task_id = '')${brandFilter} GROUP BY t.estado`,
          brandParams
        );
        return res.json(rows);
      }
      case 'task_count_by_priority': {
        const rows = await query<any[]>(
          `SELECT t.prioridad, COUNT(*) as count FROM tasks t WHERE (t.parent_task_id IS NULL OR t.parent_task_id = '')${brandFilter} GROUP BY t.prioridad`,
          brandParams
        );
        return res.json(rows);
      }
      case 'tasks_due_this_week': {
        const rows = await query<any[]>(
          `SELECT t.id, t.titulo_tarea, t.fecha_entrega, t.estado, t.prioridad, b.nombre as brand_nombre
           FROM tasks t LEFT JOIN brands b ON b.id = t.brand_id
           WHERE t.fecha_entrega BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
           AND t.estado NOT IN ('entregado')
           AND (t.parent_task_id IS NULL OR t.parent_task_id = '')${brandFilter}
           ORDER BY t.fecha_entrega ASC LIMIT 20`,
          brandParams
        );
        return res.json(rows);
      }
      case 'time_tracked_chart': {
        const rows = await query<any[]>(
          `SELECT p.nombre as user_name, SUM(t.tiempo_trabajado) as total_seconds
           FROM tasks t JOIN profiles p ON p.id = t.responsable_user_id
           WHERE t.tiempo_trabajado > 0${brandFilter}
           GROUP BY p.id, p.nombre ORDER BY total_seconds DESC LIMIT 10`,
          brandParams
        );
        return res.json(rows);
      }
      case 'tasks_by_brand': {
        const rows = await query<any[]>(
          `SELECT b.nombre as brand_name, COUNT(*) as count
           FROM tasks t JOIN brands b ON b.id = t.brand_id
           WHERE (t.parent_task_id IS NULL OR t.parent_task_id = '')${brandFilter}
           GROUP BY b.id, b.nombre ORDER BY count DESC`,
          brandParams
        );
        return res.json(rows);
      }
      case 'tasks_by_user': {
        const rows = await query<any[]>(
          `SELECT p.nombre as user_name, COUNT(*) as count
           FROM tasks t JOIN profiles p ON p.id = t.responsable_user_id
           WHERE (t.parent_task_id IS NULL OR t.parent_task_id = '')${brandFilter}
           GROUP BY p.id, p.nombre ORDER BY count DESC LIMIT 10`,
          brandParams
        );
        return res.json(rows);
      }
      default:
        return res.status(400).json({ error: 'Widget type desconocido' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar datos de widget' });
  }
});
