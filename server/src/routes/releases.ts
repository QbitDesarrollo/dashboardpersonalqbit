import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

export const releasesRouter = Router();

// ========== LIST RELEASES ==========
releasesRouter.get('/releases', requireAuth, async (req: AuthRequest, res) => {
  try {
    const brandId = req.query.brand_id as string | undefined;
    let sql = `
      SELECT r.*, b.nombre as brand_nombre,
        (SELECT COUNT(*) FROM release_sprints rs WHERE rs.release_id = r.id) as sprint_count
      FROM releases r
      LEFT JOIN brands b ON b.id = r.brand_id
    `;
    const params: string[] = [];
    if (brandId) {
      sql += ' WHERE r.brand_id = ?';
      params.push(brandId);
    }
    sql += ' ORDER BY r.target_date ASC, r.created_at DESC';
    const rows = await query<any[]>(sql, params);
    res.json(rows.map((r) => ({
      ...r,
      brands: r.brand_nombre ? { nombre: r.brand_nombre } : null,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar releases' });
  }
});

// ========== GET SINGLE RELEASE WITH FULL STATS ==========
releasesRouter.get('/releases/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const releaseId = String(req.params.id);
    const release = await queryOne<any>(
      `SELECT r.*, b.nombre as brand_nombre
       FROM releases r LEFT JOIN brands b ON b.id = r.brand_id
       WHERE r.id = ?`,
      [releaseId]
    );
    if (!release) return res.status(404).json({ error: 'Release no encontrado' });

    const sprints = await query<any[]>(
      `SELECT s.* FROM sprints s
       INNER JOIN release_sprints rs ON rs.sprint_id = s.id
       WHERE rs.release_id = ?
       ORDER BY s.start_date ASC`,
      [releaseId]
    );

    const sprintIds = sprints.map((s) => s.id);
    let tasks: any[] = [];
    if (sprintIds.length > 0) {
      const placeholders = sprintIds.map(() => '?').join(',');
      tasks = await query<any[]>(
        `SELECT t.id, t.titulo_tarea, t.estado, t.prioridad, t.story_points, t.check_done,
                t.responsable_user_id, t.sprint_id, t.feature_id, t.tiempo_trabajado,
                p.nombre as resp_nombre, f.name as feature_name
         FROM tasks t
         LEFT JOIN profiles p ON p.id = t.responsable_user_id
         LEFT JOIN features f ON f.id = t.feature_id
         WHERE t.sprint_id IN (${placeholders})
           AND (t.parent_task_id IS NULL OR t.parent_task_id = '')
         ORDER BY t.created_at ASC`,
        sprintIds
      );
    }

    const totalTasks = tasks.length;
    const totalPoints = tasks.reduce((s, t) => s + (t.story_points ?? 0), 0);
    const completedTasks = tasks.filter(
      (t) => ['entregado', 'aprobado'].includes(t.estado) || t.check_done
    ).length;
    const completedPoints = tasks
      .filter((t) => ['entregado', 'aprobado'].includes(t.estado) || t.check_done)
      .reduce((s, t) => s + (t.story_points ?? 0), 0);

    const byFeature: Record<string, { name: string; tasks: number; points: number; completed: number }> = {};
    for (const t of tasks) {
      const fid = t.feature_id || '_none_';
      if (!byFeature[fid]) byFeature[fid] = { name: t.feature_name || 'Sin feature', tasks: 0, points: 0, completed: 0 };
      byFeature[fid].tasks++;
      byFeature[fid].points += t.story_points ?? 0;
      if (['entregado', 'aprobado'].includes(t.estado) || t.check_done) byFeature[fid].completed++;
    }

    const byStatus: Record<string, number> = {};
    for (const t of tasks) {
      byStatus[t.estado] = (byStatus[t.estado] || 0) + 1;
    }

    const sprintSummaries = sprints.map((s) => {
      const sTasks = tasks.filter((t) => t.sprint_id === s.id);
      const sTotal = sTasks.length;
      const sCompleted = sTasks.filter(
        (t) => ['entregado', 'aprobado'].includes(t.estado) || t.check_done
      ).length;
      const sPoints = sTasks.reduce((sum, t) => sum + (t.story_points ?? 0), 0);
      const sCompletedPts = sTasks
        .filter((t) => ['entregado', 'aprobado'].includes(t.estado) || t.check_done)
        .reduce((sum, t) => sum + (t.story_points ?? 0), 0);
      return {
        id: s.id,
        name: s.name,
        status: s.status,
        start_date: s.start_date,
        end_date: s.end_date,
        goal: s.goal,
        totalTasks: sTotal,
        completedTasks: sCompleted,
        totalPoints: sPoints,
        completedPoints: sCompletedPts,
      };
    });

    res.json({
      release: { ...release, brands: release.brand_nombre ? { nombre: release.brand_nombre } : null },
      sprints: sprintSummaries,
      totalTasks,
      totalPoints,
      completedTasks,
      completedPoints,
      remainingPoints: totalPoints - completedPoints,
      progressPercent: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      pointsPercent: totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0,
      byFeature: Object.entries(byFeature).map(([id, v]) => ({ featureId: id, ...v })),
      byStatus,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar release' });
  }
});

// ========== CREATE RELEASE ==========
releasesRouter.post('/releases', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const body = req.body;
    const id = uuid();
    await query(
      `INSERT INTO releases (id, name, description, version, status, target_date, brand_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.name || 'Release',
        body.description || null,
        body.version || null,
        body.status || 'planning',
        body.target_date || null,
        body.brand_id || null,
      ]
    );
    const row = await queryOne<any>('SELECT * FROM releases WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear release' });
  }
});

// ========== UPDATE RELEASE ==========
releasesRouter.patch('/releases/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const releaseId = String(req.params.id);
    const body = req.body;
    const map: Record<string, string> = {
      name: 'name', description: 'description', version: 'version',
      status: 'status', target_date: 'target_date', released_date: 'released_date',
      brand_id: 'brand_id',
    };
    const updates: string[] = [];
    const values: unknown[] = [];
    for (const [k, col] of Object.entries(map)) {
      if (body[k] !== undefined) {
        updates.push(`${col} = ?`);
        values.push(body[k]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Sin campos' });
    values.push(releaseId);
    await query(`UPDATE releases SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar release' });
  }
});

// ========== DELETE RELEASE ==========
releasesRouter.delete('/releases/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const releaseId = String(req.params.id);
    await query('DELETE FROM releases WHERE id = ?', [releaseId]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar release' });
  }
});

// ========== ASSIGN/REMOVE SPRINTS TO RELEASE ==========
releasesRouter.post('/releases/:id/sprints', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const releaseId = String(req.params.id);
    const { sprint_ids } = req.body as { sprint_ids: string[] };
    if (!Array.isArray(sprint_ids)) return res.status(400).json({ error: 'sprint_ids requerido' });

    await query('DELETE FROM release_sprints WHERE release_id = ?', [releaseId]);
    for (const sid of sprint_ids) {
      await query(
        'INSERT IGNORE INTO release_sprints (release_id, sprint_id) VALUES (?, ?)',
        [releaseId, sid]
      );
    }
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al asignar sprints' });
  }
});

// ========== GET SPRINTS FOR A RELEASE ==========
releasesRouter.get('/releases/:id/sprints', requireAuth, async (req: AuthRequest, res) => {
  try {
    const releaseId = String(req.params.id);
    const rows = await query<any[]>(
      `SELECT s.* FROM sprints s
       INNER JOIN release_sprints rs ON rs.sprint_id = s.id
       WHERE rs.release_id = ?
       ORDER BY s.start_date ASC`,
      [releaseId]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar sprints del release' });
  }
});
