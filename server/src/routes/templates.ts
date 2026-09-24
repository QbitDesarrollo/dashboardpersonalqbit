import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';
import { addDays, format } from 'date-fns';

export const templatesRouter = Router();

// GET /api/data/templates — listar plantillas
templatesRouter.get('/templates', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });

    const rows = await query<any[]>(
      `SELECT pt.*, p.nombre as created_by_nombre,
        (SELECT COUNT(*) FROM template_tasks tt WHERE tt.template_id = pt.id) as task_count
       FROM project_templates pt
       LEFT JOIN profiles p ON p.id = pt.created_by
       ORDER BY pt.updated_at DESC`
    );
    res.json(rows.map((r) => ({ ...r, task_count: Number(r.task_count ?? 0) })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar plantillas' });
  }
});

// GET /api/data/templates/:id — detalle de plantilla con tareas
templatesRouter.get('/templates/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });

    const { id } = req.params;
    const template = await queryOne<any>(
      `SELECT pt.*, p.nombre as created_by_nombre FROM project_templates pt
       LEFT JOIN profiles p ON p.id = pt.created_by WHERE pt.id = ?`,
      [id]
    );
    if (!template) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const tasks = await query<any[]>(
      `SELECT * FROM template_tasks WHERE template_id = ? ORDER BY sort_order ASC`,
      [id]
    );
    res.json({ ...template, tasks });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar plantilla' });
  }
});

// POST /api/data/templates — crear plantilla
templatesRouter.post('/templates', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });

    const body = req.body;
    const id = uuid();
    await query(
      `INSERT INTO project_templates (id, name, description, created_by, is_public)
       VALUES (?, ?, ?, ?, ?)`,
      [
        id,
        body.name || 'Nueva plantilla',
        body.description || null,
        req.userId,
        body.is_public !== false ? 1 : 0,
      ]
    );
    const row = await queryOne<any>('SELECT * FROM project_templates WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear plantilla' });
  }
});

// PATCH /api/data/templates/:id — actualizar plantilla
templatesRouter.patch('/templates/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });

    const { id } = req.params;
    const body = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    const map: Record<string, string> = { name: 'name', description: 'description', is_public: 'is_public' };
    for (const [k, col] of Object.entries(map)) {
      if (body[k] !== undefined) {
        if (k === 'is_public') {
          updates.push(`${col} = ?`);
          values.push(body[k] ? 1 : 0);
        } else {
          updates.push(`${col} = ?`);
          values.push(body[k]);
        }
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });
    values.push(id);
    await query(`UPDATE project_templates SET ${updates.join(', ')} WHERE id = ?`, values);
    const row = await queryOne<any>('SELECT * FROM project_templates WHERE id = ?', [id]);
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar plantilla' });
  }
});

// DELETE /api/data/templates/:id
templatesRouter.delete('/templates/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });

    const { id } = req.params;
    await query('DELETE FROM project_templates WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar plantilla' });
  }
});

// POST /api/data/templates/:id/tasks — agregar tarea al template
templatesRouter.post('/templates/:id/tasks', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });

    const { id: templateId } = req.params;
    const t = await queryOne<any>('SELECT id FROM project_templates WHERE id = ?', [templateId]);
    if (!t) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const body = req.body;

    // ── Departamento (opcional, por id — FK real, no texto libre) ──
    if (body.department_id) {
      const dept = await queryOne<{ id: string }>(
        'SELECT id FROM departments WHERE id = ? AND activo = 1', [body.department_id]
      );
      if (!dept) return res.status(400).json({ error: 'Departamento no válido' });
    }

    const taskId = uuid();
    await query(
      `INSERT INTO template_tasks (id, template_id, titulo_tarea, detalle, prioridad, departamento, department_id, cantidad_entregables, story_points, relative_start_days, relative_due_days, parent_template_task_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        templateId,
        body.titulo_tarea || 'Nueva tarea',
        body.detalle || null,
        body.prioridad || 'media',
        body.departamento || null,
        body.department_id || null,
        body.cantidad_entregables ?? 1,
        body.story_points ?? null,
        body.relative_start_days ?? 0,
        body.relative_due_days ?? 7,
        body.parent_template_task_id || null,
        body.sort_order ?? 0,
      ]
    );
    const row = await queryOne<any>('SELECT * FROM template_tasks WHERE id = ?', [taskId]);
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al agregar tarea' });
  }
});

// PATCH /api/data/templates/:templateId/tasks/:taskId
templatesRouter.patch('/templates/:templateId/tasks/:taskId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });

    const { templateId, taskId } = req.params;
    const body = req.body;

    // ── Departamento (opcional, por id — FK real, no texto libre) ──
    if (body.department_id) {
      const dept = await queryOne<{ id: string }>(
        'SELECT id FROM departments WHERE id = ? AND activo = 1', [body.department_id]
      );
      if (!dept) return res.status(400).json({ error: 'Departamento no válido' });
    }

    const map: Record<string, string> = {
      titulo_tarea: 'titulo_tarea', detalle: 'detalle', prioridad: 'prioridad', departamento: 'departamento',
      department_id: 'department_id',
      cantidad_entregables: 'cantidad_entregables', story_points: 'story_points',
      relative_start_days: 'relative_start_days', relative_due_days: 'relative_due_days',
      parent_template_task_id: 'parent_template_task_id', sort_order: 'sort_order',
    };
    const updates: string[] = [];
    const values: unknown[] = [];
    for (const [k, col] of Object.entries(map)) {
      if (body[k] !== undefined) {
        updates.push(`${col} = ?`);
        values.push(body[k]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });
    values.push(templateId, taskId);
    await query(`UPDATE template_tasks SET ${updates.join(', ')} WHERE template_id = ? AND id = ?`, values);
    const row = await queryOne<any>('SELECT * FROM template_tasks WHERE id = ?', [taskId]);
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar tarea' });
  }
});

// DELETE /api/data/templates/:templateId/tasks/:taskId
templatesRouter.delete('/templates/:templateId/tasks/:taskId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });

    const { templateId, taskId } = req.params;
    await query('DELETE FROM template_tasks WHERE template_id = ? AND id = ?', [templateId, taskId]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar tarea' });
  }
});

// POST /api/data/templates/:id/apply — aplicar plantilla y crear tareas
templatesRouter.post('/templates/:id/apply', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });

    const { id } = req.params;
    const { brand_id, desk_id, start_date } = req.body;

    if (!brand_id) return res.status(400).json({ error: 'brand_id es obligatorio' });

    const template = await queryOne<any>('SELECT * FROM project_templates WHERE id = ?', [id]);
    if (!template) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const tasks = await query<any[]>(
      'SELECT * FROM template_tasks WHERE template_id = ? ORDER BY sort_order ASC',
      [id]
    );
    if (tasks.length === 0) return res.status(400).json({ error: 'La plantilla no tiene tareas' });

    const baseDate = start_date ? new Date(start_date) : new Date();
    const dateStr = (d: Date) => format(d, 'yyyy-MM-dd');

    // Construir árbol y orden topológico (padres antes que hijos)
    const byId = new Map<string, typeof tasks[0]>();
    tasks.forEach((t) => byId.set(t.id, t));
    const sorted: typeof tasks = [];
    const added = new Set<string>();
    const addWithParents = (t: typeof tasks[0]) => {
      if (added.has(t.id)) return;
      if (t.parent_template_task_id && byId.has(t.parent_template_task_id)) {
        addWithParents(byId.get(t.parent_template_task_id)!);
      }
      added.add(t.id);
      sorted.push(t);
    };
    tasks.forEach((t) => addWithParents(t));

    const oldToNew = new Map<string, string>();

    for (const tt of sorted) {
      const start = addDays(baseDate, tt.relative_start_days ?? 0);
      const due = addDays(baseDate, tt.relative_due_days ?? 7);
      const taskId = uuid();
      const parentId = tt.parent_template_task_id ? oldToNew.get(tt.parent_template_task_id) : null;

      if (parentId) {
        const parent = await queryOne<any>('SELECT brand_id, desk_id FROM tasks WHERE id = ?', [parentId]);
        if (!parent) continue;
        await query(
          `INSERT INTO tasks (id, parent_task_id, brand_id, desk_id, titulo_tarea, detalle, prioridad, departamento, department_id, cantidad_entregables, story_points, estado, fecha_inicio, fecha_entrega)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'backlog', ?, ?)`,
          [
            taskId, parentId, parent.brand_id, parent.desk_id, tt.titulo_tarea, tt.detalle, tt.prioridad,
            tt.departamento, tt.department_id || null, tt.cantidad_entregables ?? 1, tt.story_points, dateStr(start), dateStr(due),
          ]
        );
      } else {
        await query(
          `INSERT INTO tasks (id, check_done, brand_id, desk_id, titulo_tarea, detalle, cantidad_entregables, departamento, department_id, prioridad, estado, fecha_inicio, fecha_entrega, story_points)
           VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'backlog', ?, ?, ?)`,
          [
            taskId, brand_id, desk_id || null, tt.titulo_tarea, tt.detalle, tt.cantidad_entregables ?? 1,
            tt.departamento, tt.department_id || null, tt.prioridad, dateStr(start), dateStr(due), tt.story_points,
          ]
        );
      }
      if (tt.department_id) {
        await query(
          'INSERT INTO task_department_history (id, task_id, department_id, responsable_user_id) VALUES (?, ?, ?, ?)',
          [uuid(), taskId, tt.department_id, null]
        );
      }
      oldToNew.set(tt.id, taskId);
    }

    const created = Array.from(oldToNew.values());
    res.status(201).json({ success: true, task_ids: created, count: created.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al aplicar plantilla' });
  }
});
