import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

export const sprintsRouter = Router();

// ========== SPRINT STATS (tasks count, points, burndown) ==========
sprintsRouter.get('/sprints/:id/stats', requireAuth, async (req: AuthRequest, res) => {
  try {
    const sprintId = String(req.params.id);
    const deskId = req.query.desk_id as string | undefined;
    const sprint = await queryOne<any>('SELECT * FROM sprints WHERE id = ?', [sprintId]);
    if (!sprint) return res.status(404).json({ error: 'Sprint no encontrado' });

    let taskSql = `SELECT t.id, t.titulo_tarea, t.estado, t.prioridad, t.story_points, t.check_done,
              t.responsable_user_id, t.tiempo_trabajado, t.fecha_entrega,
              p.nombre as resp_nombre
       FROM tasks t LEFT JOIN profiles p ON p.id = t.responsable_user_id
       WHERE t.sprint_id = ? AND (t.parent_task_id IS NULL OR t.parent_task_id = '')`;
    const taskParams: string[] = [sprintId];
    if (deskId) {
      taskSql += ' AND t.desk_id = ?';
      taskParams.push(deskId);
    }
    taskSql += ' ORDER BY t.created_at ASC';
    const tasks = await query<any[]>(taskSql, taskParams);

    const totalTasks = tasks.length;
    const totalPoints = tasks.reduce((s, t) => s + (t.story_points ?? 0), 0);
    const completedTasks = tasks.filter(t => ['entregado', 'aprobado'].includes(t.estado) || t.check_done).length;
    const completedPoints = tasks.filter(t => ['entregado', 'aprobado'].includes(t.estado) || t.check_done)
      .reduce((s, t) => s + (t.story_points ?? 0), 0);
    const byStatus: Record<string, number> = {};
    const byResponsable: Record<string, { nombre: string; tasks: number; points: number; completed: number }> = {};
    for (const t of tasks) {
      byStatus[t.estado] = (byStatus[t.estado] || 0) + 1;
      const uid = t.responsable_user_id || '_unassigned_';
      if (!byResponsable[uid]) byResponsable[uid] = { nombre: t.resp_nombre || 'Sin asignar', tasks: 0, points: 0, completed: 0 };
      byResponsable[uid].tasks++;
      byResponsable[uid].points += t.story_points ?? 0;
      if (['entregado', 'aprobado'].includes(t.estado) || t.check_done) byResponsable[uid].completed++;
    }

    res.json({
      sprint,
      totalTasks,
      totalPoints,
      completedTasks,
      completedPoints,
      remainingPoints: totalPoints - completedPoints,
      byStatus,
      byResponsable: Object.entries(byResponsable).map(([id, v]) => ({ userId: id, ...v })),
      tasks: tasks.map(t => ({
        id: t.id, titulo_tarea: t.titulo_tarea, estado: t.estado, prioridad: t.prioridad,
        story_points: t.story_points, check_done: !!t.check_done,
        responsable: t.resp_nombre, responsable_user_id: t.responsable_user_id,
        tiempo_trabajado: t.tiempo_trabajado, fecha_entrega: t.fecha_entrega,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar stats del sprint' });
  }
});

// ========== BURNDOWN CHART ==========
sprintsRouter.get('/sprints/:id/burndown', requireAuth, async (req: AuthRequest, res) => {
  try {
    const sprintId = String(req.params.id);
    const deskId = req.query.desk_id as string | undefined;
    const sprint = await queryOne<any>('SELECT * FROM sprints WHERE id = ?', [sprintId]);
    if (!sprint) return res.status(404).json({ error: 'Sprint no encontrado' });

    let taskSql = `SELECT t.id, t.story_points, t.estado, t.check_done, t.updated_at, t.created_at
       FROM tasks t
       WHERE t.sprint_id = ? AND (t.parent_task_id IS NULL OR t.parent_task_id = '')`;
    const taskParams: string[] = [sprintId];
    if (deskId) {
      taskSql += ' AND t.desk_id = ?';
      taskParams.push(deskId);
    }
    taskSql += ' ORDER BY t.updated_at ASC';
    const tasks = await query<any[]>(taskSql, taskParams);

    const startDate = new Date(sprint.start_date);
    const endDate = new Date(sprint.end_date);
    const totalPoints = tasks.reduce((s: number, t: any) => s + (t.story_points ?? 0), 0);

    const completedTasks = tasks.filter(
      (t: any) => ['entregado', 'aprobado'].includes(t.estado) || t.check_done
    );

    const completionMap: Record<string, number> = {};
    for (const t of completedTasks) {
      const dateStr = new Date(t.updated_at).toISOString().slice(0, 10);
      completionMap[dateStr] = (completionMap[dateStr] || 0) + (t.story_points ?? 0);
    }

    const days: { date: string; ideal: number; actual: number }[] = [];
    const current = new Date(startDate);
    const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const dailyBurn = totalPoints / totalDays;

    let cumulativeBurned = 0;
    let dayIndex = 0;

    while (current <= endDate) {
      const dateStr = current.toISOString().slice(0, 10);
      const ideal = Math.max(0, Math.round((totalPoints - dailyBurn * dayIndex) * 100) / 100);

      if (completionMap[dateStr]) {
        cumulativeBurned += completionMap[dateStr];
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const currentDay = new Date(current);
      currentDay.setHours(0, 0, 0, 0);

      days.push({
        date: dateStr,
        ideal,
        actual: currentDay <= today ? totalPoints - cumulativeBurned : -1,
      });

      current.setDate(current.getDate() + 1);
      dayIndex++;
    }

    res.json({ totalPoints, days });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar burndown' });
  }
});

// ========== TEAM CAPACITY ==========
sprintsRouter.get('/sprints/:id/capacity', requireAuth, async (req: AuthRequest, res) => {
  try {
    const sprintId = String(req.params.id);
    const deskId = req.query.desk_id as string | undefined;
    const sprint = await queryOne<any>('SELECT * FROM sprints WHERE id = ?', [sprintId]);
    if (!sprint) return res.status(404).json({ error: 'Sprint no encontrado' });

    // Get team members who have tasks in this sprint
    let capSql = `SELECT DISTINCT t.responsable_user_id as user_id, p.nombre, p.weekly_capacity_hours,
              COUNT(t.id) as task_count,
              SUM(COALESCE(t.story_points, 0)) as total_points,
              SUM(CASE WHEN t.estado IN ('entregado','aprobado') OR t.check_done THEN 1 ELSE 0 END) as completed_count,
              SUM(CASE WHEN t.estado IN ('entregado','aprobado') OR t.check_done THEN COALESCE(t.story_points,0) ELSE 0 END) as completed_points,
              SUM(COALESCE(t.tiempo_trabajado, 0)) as total_time_worked
       FROM tasks t
       LEFT JOIN profiles p ON p.id = t.responsable_user_id
       WHERE t.sprint_id = ? AND t.responsable_user_id IS NOT NULL
         AND (t.parent_task_id IS NULL OR t.parent_task_id = '')`;
    const capParams: string[] = [sprintId];
    if (deskId) {
      capSql += ' AND t.desk_id = ?';
      capParams.push(deskId);
    }
    capSql += ' GROUP BY t.responsable_user_id, p.nombre, p.weekly_capacity_hours';
    const members = await query<any[]>(capSql, capParams);

    // Calculate sprint duration in weeks
    const startDate = new Date(sprint.start_date);
    const endDate = new Date(sprint.end_date);
    const sprintDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const sprintWeeks = Math.max(1, sprintDays / 7);

    res.json({
      sprintWeeks: Math.round(sprintWeeks * 10) / 10,
      sprintDays,
      members: members.map(m => ({
        userId: m.user_id,
        nombre: m.nombre,
        weeklyCapacityHours: m.weekly_capacity_hours ?? 40,
        totalCapacityHours: Math.round((m.weekly_capacity_hours ?? 40) * sprintWeeks),
        taskCount: Number(m.task_count),
        totalPoints: Number(m.total_points),
        completedCount: Number(m.completed_count),
        completedPoints: Number(m.completed_points),
        timeWorkedSeconds: Number(m.total_time_worked),
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar capacidad' });
  }
});

// ========== BRAND PROGRESS (Vista Gerencial) ==========
sprintsRouter.get('/sprints/:id/brand-progress', requireAuth, async (req: AuthRequest, res) => {
  try {
    const sprintId = String(req.params.id);
    const sprint = await queryOne<any>('SELECT * FROM sprints WHERE id = ?', [sprintId]);
    if (!sprint) return res.status(404).json({ error: 'Sprint no encontrado' });

    const rows = await query<any[]>(
      `SELECT
        b.id AS brand_id,
        b.nombre AS brand_name,
        c.nombre AS client_name,
        COUNT(t.id) AS total_tasks,
        SUM(CASE WHEN t.estado IN ('entregado','aprobado') OR t.check_done THEN 1 ELSE 0 END) AS completed_tasks,
        COALESCE(SUM(t.story_points), 0) AS total_points,
        SUM(CASE WHEN t.estado IN ('entregado','aprobado') OR t.check_done THEN COALESCE(t.story_points, 0) ELSE 0 END) AS completed_points,
        COALESCE(SUM(t.tiempo_trabajado), 0) AS total_time_worked,
        SUM(CASE WHEN t.estado = 'backlog' THEN 1 ELSE 0 END) AS backlog_count,
        SUM(CASE WHEN t.estado = 'en_proceso' THEN 1 ELSE 0 END) AS en_proceso_count,
        SUM(CASE WHEN t.estado = 'en_revision' THEN 1 ELSE 0 END) AS en_revision_count,
        SUM(CASE WHEN t.estado = 'aprobado' THEN 1 ELSE 0 END) AS aprobado_count,
        SUM(CASE WHEN t.estado = 'entregado' THEN 1 ELSE 0 END) AS entregado_count,
        SUM(CASE WHEN t.estado = 'bloqueado' THEN 1 ELSE 0 END) AS bloqueado_count
      FROM tasks t
      INNER JOIN brands b ON b.id = t.brand_id
      LEFT JOIN clients c ON c.id = b.cliente_id
      WHERE t.sprint_id = ?
        AND (t.parent_task_id IS NULL OR t.parent_task_id = '')
      GROUP BY b.id, b.nombre, c.nombre
      ORDER BY total_tasks DESC`,
      [sprintId]
    );

    let overallTotal = 0, overallCompleted = 0, overallPoints = 0, overallCompletedPts = 0;

    const brands = rows.map(r => {
      const totalTasks = Number(r.total_tasks);
      const completedTasks = Number(r.completed_tasks);
      const totalPoints = Number(r.total_points);
      const completedPoints = Number(r.completed_points);
      overallTotal += totalTasks;
      overallCompleted += completedTasks;
      overallPoints += totalPoints;
      overallCompletedPts += completedPoints;

      return {
        brandId: r.brand_id,
        brandName: r.brand_name,
        clientName: r.client_name || null,
        totalTasks,
        completedTasks,
        totalPoints,
        completedPoints,
        progressPercent: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        pointsPercent: totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0,
        timeWorkedSeconds: Number(r.total_time_worked),
        statusBreakdown: {
          backlog: Number(r.backlog_count),
          en_proceso: Number(r.en_proceso_count),
          en_revision: Number(r.en_revision_count),
          aprobado: Number(r.aprobado_count),
          entregado: Number(r.entregado_count),
          bloqueado: Number(r.bloqueado_count),
        },
      };
    });

    res.json({
      sprint: { id: sprint.id, name: sprint.name, status: sprint.status, start_date: sprint.start_date, end_date: sprint.end_date },
      overallProgress: {
        totalTasks: overallTotal,
        completedTasks: overallCompleted,
        totalPoints: overallPoints,
        completedPoints: overallCompletedPts,
        progressPercent: overallTotal > 0 ? Math.round((overallCompleted / overallTotal) * 100) : 0,
        pointsPercent: overallPoints > 0 ? Math.round((overallCompletedPts / overallPoints) * 100) : 0,
      },
      brands,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar progreso por marca' });
  }
});

// ========== VISTA GERENCIAL (all sprints + brand progress) ==========
sprintsRouter.get('/sprints/gerencial', requireAuth, async (req: AuthRequest, res) => {
  try {
    const statusFilter = req.query.status as string | undefined;
    let sprintsSql = 'SELECT id, name, goal, start_date, end_date, status FROM sprints';
    const params: string[] = [];
    if (statusFilter && statusFilter !== 'all') {
      sprintsSql += ' WHERE status = ?';
      params.push(statusFilter);
    }
    sprintsSql += ' ORDER BY FIELD(status, "active", "planned", "completed"), start_date DESC';

    const sprintsRows = await query<any[]>(sprintsSql, params);

    const brandRows = await query<any[]>(
      `SELECT
        t.sprint_id,
        b.id AS brand_id,
        b.nombre AS brand_name,
        c.nombre AS client_name,
        COUNT(t.id) AS total_tasks,
        SUM(CASE WHEN t.estado IN ('entregado','aprobado') OR t.check_done THEN 1 ELSE 0 END) AS completed_tasks,
        COALESCE(SUM(t.story_points), 0) AS total_points,
        SUM(CASE WHEN t.estado IN ('entregado','aprobado') OR t.check_done THEN COALESCE(t.story_points,0) ELSE 0 END) AS completed_points,
        COALESCE(SUM(t.tiempo_trabajado), 0) AS total_time_worked,
        SUM(CASE WHEN t.estado = 'backlog' THEN 1 ELSE 0 END) AS backlog_count,
        SUM(CASE WHEN t.estado = 'en_proceso' THEN 1 ELSE 0 END) AS en_proceso_count,
        SUM(CASE WHEN t.estado = 'en_revision' THEN 1 ELSE 0 END) AS en_revision_count,
        SUM(CASE WHEN t.estado = 'aprobado' THEN 1 ELSE 0 END) AS aprobado_count,
        SUM(CASE WHEN t.estado = 'entregado' THEN 1 ELSE 0 END) AS entregado_count,
        SUM(CASE WHEN t.estado = 'bloqueado' THEN 1 ELSE 0 END) AS bloqueado_count
      FROM tasks t
      INNER JOIN brands b ON b.id = t.brand_id
      LEFT JOIN clients c ON c.id = b.cliente_id
      WHERE t.sprint_id IS NOT NULL
        AND (t.parent_task_id IS NULL OR t.parent_task_id = '')
      GROUP BY t.sprint_id, b.id, b.nombre, c.nombre
      ORDER BY total_tasks DESC`
    );

    const brandsBySprintId: Record<string, any[]> = {};
    for (const r of brandRows) {
      const sid = r.sprint_id;
      if (!brandsBySprintId[sid]) brandsBySprintId[sid] = [];
      const totalTasks = Number(r.total_tasks);
      const completedTasks = Number(r.completed_tasks);
      const totalPoints = Number(r.total_points);
      const completedPoints = Number(r.completed_points);
      brandsBySprintId[sid].push({
        brandId: r.brand_id,
        brandName: r.brand_name,
        clientName: r.client_name || null,
        totalTasks,
        completedTasks,
        totalPoints,
        completedPoints,
        progressPercent: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        pointsPercent: totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0,
        timeWorkedSeconds: Number(r.total_time_worked),
        statusBreakdown: {
          backlog: Number(r.backlog_count),
          en_proceso: Number(r.en_proceso_count),
          en_revision: Number(r.en_revision_count),
          aprobado: Number(r.aprobado_count),
          entregado: Number(r.entregado_count),
          bloqueado: Number(r.bloqueado_count),
        },
      });
    }

    const result = sprintsRows.map(s => {
      const brands = brandsBySprintId[s.id] || [];
      let totalT = 0, compT = 0, totalP = 0, compP = 0;
      brands.forEach((b: any) => { totalT += b.totalTasks; compT += b.completedTasks; totalP += b.totalPoints; compP += b.completedPoints; });
      return {
        sprint: { id: s.id, name: s.name, goal: s.goal, startDate: s.start_date, endDate: s.end_date, status: s.status },
        overallProgress: {
          totalTasks: totalT, completedTasks: compT, totalPoints: totalP, completedPoints: compP,
          progressPercent: totalT > 0 ? Math.round((compT / totalT) * 100) : 0,
          pointsPercent: totalP > 0 ? Math.round((compP / totalP) * 100) : 0,
        },
        brands,
      };
    });

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar vista gerencial' });
  }
});

// ========== TEAM VELOCITY ==========
sprintsRouter.get('/sprints/velocity', requireAuth, async (req: AuthRequest, res) => {
  try {
    const brandId = req.query.brand_id as string | undefined;
    let sprintsSql = `SELECT s.id, s.name, s.status, s.start_date, s.end_date
                      FROM sprints s`;
    const params: string[] = [];
    if (brandId) {
      sprintsSql += ' WHERE s.brand_id = ?';
      params.push(brandId);
    }
    sprintsSql += ' ORDER BY s.start_date ASC';
    const sprints = await query<any[]>(sprintsSql, params);

    const result: {
      sprint: string; name: string; status: string;
      velocity: number; buffer: number; total: number;
      totalTasks: number; completedTasks: number; blockedTasks: number;
    }[] = [];

    for (const s of sprints) {
      const tasks = await query<any[]>(
        `SELECT t.story_points, t.estado, t.check_done
         FROM tasks t
         WHERE t.sprint_id = ? AND (t.parent_task_id IS NULL OR t.parent_task_id = '')`,
        [s.id]
      );

      const completedPoints = tasks
        .filter((t) => ['entregado', 'aprobado'].includes(t.estado) || t.check_done)
        .reduce((sum, t) => sum + (t.story_points ?? 0), 0);

      const blockedPoints = tasks
        .filter((t) => t.estado === 'bloqueado')
        .reduce((sum, t) => sum + (t.story_points ?? 0), 0);

      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(
        (t) => ['entregado', 'aprobado'].includes(t.estado) || t.check_done
      ).length;
      const blockedTasks = tasks.filter((t) => t.estado === 'bloqueado').length;

      result.push({
        sprint: s.id,
        name: s.name,
        status: s.status,
        velocity: completedPoints,
        buffer: blockedPoints,
        total: completedPoints + blockedPoints,
        totalTasks,
        completedTasks,
        blockedTasks,
      });
    }

    const velocities = result.map((r) => r.velocity).filter((v) => v > 0);
    const avgVelocity = velocities.length > 0
      ? Math.round((velocities.reduce((a, b) => a + b, 0) / velocities.length) * 10) / 10
      : 0;

    res.json({ sprints: result, avgVelocity });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar velocidad' });
  }
});

sprintsRouter.get('/sprints', requireAuth, async (req: AuthRequest, res) => {
  try {
    const brandId = req.query.brand_id as string | undefined;
    let rows: any[];
    if (brandId) {
      rows = await query<any[]>('SELECT s.*, b.nombre as brand_nombre FROM sprints s LEFT JOIN brands b ON b.id = s.brand_id WHERE s.brand_id = ? ORDER BY s.start_date DESC', [brandId]);
    } else {
      rows = await query<any[]>('SELECT s.*, b.nombre as brand_nombre FROM sprints s LEFT JOIN brands b ON b.id = s.brand_id ORDER BY s.start_date DESC');
    }
    res.json(rows.map((r) => ({ ...r, brands: r.brand_nombre ? { nombre: r.brand_nombre } : null })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar sprints' });
  }
});

sprintsRouter.post('/sprints', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const body = req.body;
    const id = uuid();
    await query(
      'INSERT INTO sprints (id, name, goal, start_date, end_date, status, brand_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, body.name || 'Sprint', body.goal || null, body.start_date, body.end_date, body.status || 'planned', body.brand_id || null]
    );
    const row = await queryOne<any>('SELECT s.*, b.nombre as brand_nombre FROM sprints s LEFT JOIN brands b ON b.id = s.brand_id WHERE s.id = ?', [id]);
    res.status(201).json({ ...row, brands: row?.brand_nombre ? { nombre: row.brand_nombre } : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear sprint' });
  }
});

sprintsRouter.patch('/sprints/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const body = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    const map: Record<string, string> = { name: 'name', goal: 'goal', start_date: 'start_date', end_date: 'end_date', status: 'status', brand_id: 'brand_id' };
    for (const [k, col] of Object.entries(map)) {
      if (body[k] !== undefined) {
        updates.push(`${col} = ?`);
        values.push(body[k]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });
    values.push(id);
    await query(`UPDATE sprints SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar sprint' });
  }
});

// ========== SPRINT PLANNING DATA ==========
sprintsRouter.get('/sprints/:id/planning', requireAuth, async (req: AuthRequest, res) => {
  try {
    const sprintId = String(req.params.id);
    const deskIdFilter = req.query.desk_id as string | undefined;
    const sprint = await queryOne<any>('SELECT s.*, b.nombre as brand_nombre FROM sprints s LEFT JOIN brands b ON b.id = s.brand_id WHERE s.id = ?', [sprintId]);
    if (!sprint) return res.status(404).json({ error: 'Sprint no encontrado' });

    // Tasks already in this sprint
    const sprintTasks = await query<any[]>(
      `SELECT t.id, t.titulo_tarea, t.estado, t.prioridad, t.story_points, t.check_done,
              t.responsable_user_id, t.tiempo_trabajado, t.fecha_entrega, t.feature_id,
              p.nombre as resp_nombre, f.name as feature_name
       FROM tasks t
       LEFT JOIN profiles p ON p.id = t.responsable_user_id
       LEFT JOIN features f ON f.id = t.feature_id
       WHERE t.sprint_id = ? AND (t.parent_task_id IS NULL OR t.parent_task_id = '')
       ORDER BY FIELD(t.prioridad, 'alta', 'media', 'baja'), t.created_at ASC`,
      [sprintId]
    );

    // Backlog tasks (no sprint assigned), filtered by desk if provided
    let backlogSql = `SELECT t.id, t.titulo_tarea, t.estado, t.prioridad, t.story_points, t.check_done,
              t.responsable_user_id, t.fecha_entrega, t.feature_id,
              p.nombre as resp_nombre, b.nombre as brand_nombre, f.name as feature_name
       FROM tasks t
       LEFT JOIN profiles p ON p.id = t.responsable_user_id
       LEFT JOIN brands b ON b.id = t.brand_id
       LEFT JOIN features f ON f.id = t.feature_id
       WHERE t.sprint_id IS NULL AND (t.parent_task_id IS NULL OR t.parent_task_id = '')
         AND t.estado NOT IN ('entregado', 'aprobado')`;
    const backlogParams: string[] = [];
    if (deskIdFilter) {
      backlogSql += ' AND t.desk_id = ?';
      backlogParams.push(deskIdFilter);
    }
    backlogSql += ' ORDER BY FIELD(t.prioridad, \'alta\', \'media\', \'baja\'), t.created_at ASC';
    const backlogTasks = await query<any[]>(backlogSql, backlogParams);

    // Team capacity
    const startDate = new Date(sprint.start_date);
    const endDate = new Date(sprint.end_date);
    const sprintDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const sprintWeeks = Math.max(1, sprintDays / 7);

    const members = await query<any[]>(
      `SELECT DISTINCT t.responsable_user_id as user_id, p.nombre, p.weekly_capacity_hours,
              COUNT(t.id) as task_count,
              SUM(COALESCE(t.story_points, 0)) as total_points,
              SUM(CASE WHEN t.estado IN ('entregado','aprobado') OR t.check_done THEN 1 ELSE 0 END) as completed_count
       FROM tasks t
       LEFT JOIN profiles p ON p.id = t.responsable_user_id
       WHERE t.sprint_id = ? AND t.responsable_user_id IS NOT NULL
         AND (t.parent_task_id IS NULL OR t.parent_task_id = '')
       GROUP BY t.responsable_user_id, p.nombre, p.weekly_capacity_hours`,
      [sprintId]
    );

    // Velocity average from past sprints
    const pastSprints = await query<any[]>(
      `SELECT s.id FROM sprints s WHERE s.status = 'completed'${sprint.brand_id ? ' AND s.brand_id = ?' : ''} ORDER BY s.end_date DESC LIMIT 5`,
      sprint.brand_id ? [sprint.brand_id] : []
    );
    let avgVelocity = 0;
    if (pastSprints.length > 0) {
      const velocities: number[] = [];
      for (const ps of pastSprints) {
        const pts = await queryOne<any>(
          `SELECT SUM(COALESCE(t.story_points, 0)) as pts FROM tasks t
           WHERE t.sprint_id = ? AND (t.parent_task_id IS NULL OR t.parent_task_id = '')
             AND (t.estado IN ('entregado','aprobado') OR t.check_done)`,
          [ps.id]
        );
        velocities.push(Number(pts?.pts || 0));
      }
      avgVelocity = velocities.length > 0 ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length) : 0;
    }

    const totalCommitted = sprintTasks.reduce((s, t) => s + (t.story_points ?? 0), 0);

    res.json({
      sprint: { ...sprint, brands: sprint.brand_nombre ? { nombre: sprint.brand_nombre } : null },
      sprintTasks: sprintTasks.map(t => ({
        id: t.id, titulo_tarea: t.titulo_tarea, estado: t.estado, prioridad: t.prioridad,
        story_points: t.story_points, responsable: t.resp_nombre,
        responsable_user_id: t.responsable_user_id, fecha_entrega: t.fecha_entrega,
        feature_id: t.feature_id, feature_name: t.feature_name,
      })),
      backlogTasks: backlogTasks.map(t => ({
        id: t.id, titulo_tarea: t.titulo_tarea, estado: t.estado, prioridad: t.prioridad,
        story_points: t.story_points, responsable: t.resp_nombre,
        responsable_user_id: t.responsable_user_id, fecha_entrega: t.fecha_entrega,
        brand_nombre: t.brand_nombre, feature_id: t.feature_id, feature_name: t.feature_name,
      })),
      capacity: {
        sprintDays,
        sprintWeeks: Math.round(sprintWeeks * 10) / 10,
        totalCommitted,
        avgVelocity,
        members: members.map(m => ({
          userId: m.user_id, nombre: m.nombre,
          weeklyCapacityHours: m.weekly_capacity_hours ?? 40,
          totalCapacityHours: Math.round((m.weekly_capacity_hours ?? 40) * sprintWeeks),
          taskCount: Number(m.task_count), totalPoints: Number(m.total_points),
          completedCount: Number(m.completed_count),
        })),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar datos de planning' });
  }
});

sprintsRouter.delete('/sprints/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const sprintId = String(req.params.id);
    await query("UPDATE tasks SET sprint_id = NULL WHERE sprint_id = ?", [sprintId]);
    await query("DELETE FROM release_sprints WHERE sprint_id = ?", [sprintId]);
    await query("DELETE FROM sprints WHERE id = ?", [sprintId]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar sprint' });
  }
});
