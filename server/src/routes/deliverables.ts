import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { getUserRole, hasRole } from '../utils/roles.js';

export const deliverablesRouter = Router();

const DELIVERABLES_PAGE_SIZE = 50;
const DELIVERABLES_PAGE_SIZE_MAX = 100;

deliverablesRouter.get('/deliverables', requireAuth, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(
      Math.max(1, parseInt(String(req.query.limit), 10) || DELIVERABLES_PAGE_SIZE),
      DELIVERABLES_PAGE_SIZE_MAX
    );
    const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);

    const role = await getUserRole(req.userId!);
    const baseFrom = `FROM deliverables d
      JOIN tasks t ON t.id = d.task_id
      LEFT JOIN brands b ON b.id = t.brand_id`;
    const baseSelect = `SELECT d.*, t.titulo_tarea, t.brand_id, b.nombre as brand_nombre ${baseFrom}`;
    const orderBy = ' ORDER BY d.created_at DESC';

    let countSql: string;
    let listSql: string;
    let countParams: string[];
    let listParams: string[];

    if (role === 'cliente') {
      const brandIds = await query<{ brand_id: string }[]>('SELECT brand_id FROM client_brands WHERE user_id = ?', [req.userId]);
      const ids = brandIds.map((r) => r.brand_id);
      if (ids.length === 0) {
        res.json({ deliverables: [], total: 0 });
        return;
      }
      const placeholders = ids.map(() => '?').join(',');
      const where = ` WHERE t.brand_id IN (${placeholders})`;
      countSql = `SELECT COUNT(*) as total ${baseFrom}${where}`;
      listSql = `${baseSelect}${where}${orderBy} LIMIT ? OFFSET ?`;
      countParams = ids;
      listParams = [...ids, String(limit), String(offset)];
    } else {
      countSql = `SELECT COUNT(*) as total ${baseFrom}`;
      listSql = `${baseSelect}${orderBy} LIMIT ? OFFSET ?`;
      countParams = [];
      listParams = [String(limit), String(offset)];
    }

    const [countRow, rows] = await Promise.all([
      queryOne<{ total: number }>(countSql, countParams),
      query<any[]>(listSql, listParams),
    ]);
    const total = Number(countRow?.total ?? 0);
    const deliverables = rows.map((r: any) => ({
      ...r,
      tasks: { titulo_tarea: r.titulo_tarea, brands: { nombre: r.brand_nombre } },
    }));
    res.json({ deliverables, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar entregables' });
  }
});

deliverablesRouter.post('/deliverables', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { task_id, tipo_entregable_id, version, estado } = req.body;
    const id = uuid();
    await query('INSERT INTO deliverables (id, task_id, tipo_entregable_id, version, estado) VALUES (?, ?, ?, ?, ?)', [id, task_id, tipo_entregable_id || null, version || 'v1', estado || 'borrador']);
    const row = await queryOne<any>('SELECT * FROM deliverables WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear entregable' });
  }
});

deliverablesRouter.patch('/deliverables/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const { estado, link_final } = req.body;
    if (estado !== undefined) await query('UPDATE deliverables SET estado = ? WHERE id = ?', [estado, id]);
    if (link_final !== undefined) await query('UPDATE deliverables SET link_final = ? WHERE id = ?', [link_final, id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});
