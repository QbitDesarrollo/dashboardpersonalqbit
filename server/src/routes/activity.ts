import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne } from '../db/mysql.js';

export const activityRouter = Router();

const ALLOWED_ENTITY_TYPES = ['task', 'deliverable', 'brand', 'desk', 'sprint', 'feature', 'comment', 'release', 'template'] as const;

activityRouter.get('/activity', requireAuth, async (req: AuthRequest, res) => {
  try {
    const entityType = req.query.entity_type as string | undefined;
    const entityId = req.query.entity_id as string | undefined;

    if (entityType && !(ALLOWED_ENTITY_TYPES as readonly string[]).includes(entityType)) {
      res.status(400).json({ error: 'Tipo de entidad no válido' });
      return;
    }
    const limit = Math.min(Math.max(1, parseInt(String(req.query.limit), 10) || 50), 100);
    const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);

    let where = '';
    const params: string[] = [];

    if (entityType && entityId) {
      where = ' WHERE a.entity_type = ? AND a.entity_id = ?';
      params.push(entityType, entityId);
    } else if (entityType) {
      where = ' WHERE a.entity_type = ?';
      params.push(entityType);
    }

    const countRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM activity_log a${where}`,
      params
    );

    const rows = await query<any[]>(
      `SELECT a.*, p.nombre as user_nombre FROM activity_log a LEFT JOIN profiles p ON p.id = a.user_id${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)]
    );

    res.json({ activities: rows, total: Number(countRow?.total ?? 0) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar actividad' });
  }
});

activityRouter.get('/activity/recent', requireAuth, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(String(req.query.limit), 10) || 50), 100);
    const rows = await query<any[]>(
      `SELECT a.*, p.nombre as user_nombre FROM activity_log a LEFT JOIN profiles p ON p.id = a.user_id ORDER BY a.created_at DESC LIMIT ?`,
      [String(limit)]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar actividad reciente' });
  }
});
