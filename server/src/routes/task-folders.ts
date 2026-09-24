import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

/**
 * Carpetas de tareas (reunión Steven 22-ago-2026).
 *
 * Agrupan tareas dentro de una mesa, estilo ClickUp: "Cronograma Septiembre"
 * con sus tareas de diseño/redacción/producción adentro. NO son proyectos
 * (esa capa ya existe y es de cara al cliente): son organización interna.
 * El ejecutivo crea la carpeta, agrupa las tareas, y puede dejarla como
 * plantilla para el mes siguiente.
 */
export const taskFoldersRouter = Router();

// Carpetas activas de una mesa (cualquier rol: se necesitan para agrupar la vista)
taskFoldersRouter.get('/task-folders', requireAuth, async (req: AuthRequest, res) => {
  try {
    const deskId = String(req.query.desk_id || '');
    if (!deskId) return res.status(400).json({ error: 'desk_id requerido' });
    const rows = await query<any[]>(
      `SELECT id, desk_id, nombre, parent_folder_id, created_at,
              (SELECT COUNT(*) FROM tasks t WHERE t.folder_id = task_folders.id) AS tareas,
              (SELECT COUNT(*) FROM tasks t WHERE t.folder_id = task_folders.id
                AND t.estado IN ('entregado','aprobado')) AS tareas_listas
       FROM task_folders WHERE desk_id = ? AND activo = 1 ORDER BY nombre`,
      [deskId]
    );
    res.json(rows);
  } catch (e) {
    console.error('[FOLDERS] list:', e);
    res.status(500).json({ error: 'Error al cargar carpetas' });
  }
});

taskFoldersRouter.post('/task-folders', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await hasRole(req.userId!, ['admin', 'ejecutivo']))) return res.status(403).json({ error: 'Sin permisos' });
    const deskId = typeof req.body?.desk_id === 'string' ? req.body.desk_id : '';
    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim().slice(0, 160) : '';
    if (!deskId || !nombre) return res.status(400).json({ error: 'desk_id y nombre requeridos' });
    const dup = await queryOne<any>('SELECT id FROM task_folders WHERE desk_id = ? AND nombre = ? AND activo = 1', [deskId, nombre]);
    if (dup) return res.status(409).json({ error: 'Ya existe una carpeta con ese nombre en esta mesa', id: dup.id });
    const id = uuid();
    await query('INSERT INTO task_folders (id, desk_id, nombre, created_by) VALUES (?, ?, ?, ?)', [id, deskId, nombre, req.userId]);
    res.status(201).json({ id, desk_id: deskId, nombre });
  } catch (e) {
    console.error('[FOLDERS] create:', e);
    res.status(500).json({ error: 'Error al crear carpeta' });
  }
});

taskFoldersRouter.patch('/task-folders/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await hasRole(req.userId!, ['admin', 'ejecutivo']))) return res.status(403).json({ error: 'Sin permisos' });
    const id = String(req.params.id);
    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim().slice(0, 160) : '';
    const tieneParent = Object.prototype.hasOwnProperty.call(req.body || {}, 'parent_folder_id');
    if (!nombre && !tieneParent) return res.status(400).json({ error: 'Nada que actualizar' });

    if (nombre) {
      await query('UPDATE task_folders SET nombre = ? WHERE id = ?', [nombre, id]);
    }

    if (tieneParent) {
      const parentId = req.body.parent_folder_id ? String(req.body.parent_folder_id) : null;
      if (parentId === id) return res.status(400).json({ error: 'Una carpeta no puede contenerse a sí misma' });
      const folder = await queryOne<any>('SELECT id, desk_id FROM task_folders WHERE id = ? AND activo = 1', [id]);
      if (!folder) return res.status(404).json({ error: 'Carpeta no encontrada' });
      if (parentId) {
        const parent = await queryOne<any>('SELECT id, desk_id, parent_folder_id FROM task_folders WHERE id = ? AND activo = 1', [parentId]);
        if (!parent) return res.status(404).json({ error: 'Carpeta destino no encontrada' });
        if (parent.desk_id !== folder.desk_id) return res.status(400).json({ error: 'Las carpetas deben ser de la misma mesa' });
        // UN nivel: el destino no puede ser hija, y la que se mueve no puede tener hijas
        if (parent.parent_folder_id) return res.status(400).json({ error: 'Máximo un nivel: esa carpeta ya está dentro de otra' });
        const hijas = await queryOne<any>('SELECT COUNT(*) AS n FROM task_folders WHERE parent_folder_id = ? AND activo = 1', [id]);
        if (Number(hijas?.n) > 0) return res.status(400).json({ error: 'Esta carpeta tiene subcarpetas: sácalas primero' });
      }
      await query('UPDATE task_folders SET parent_folder_id = ? WHERE id = ?', [parentId, id]);
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[FOLDERS] update:', e);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

// Eliminar carpeta: las tareas NO se tocan, solo quedan "sin carpeta"
taskFoldersRouter.delete('/task-folders/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await hasRole(req.userId!, ['admin', 'ejecutivo']))) return res.status(403).json({ error: 'Sin permisos' });
    const id = String(req.params.id);
    await query('UPDATE tasks SET folder_id = NULL WHERE folder_id = ?', [id]);
    await query('UPDATE task_folders SET parent_folder_id = NULL WHERE parent_folder_id = ?', [id]);
    await query('UPDATE task_folders SET activo = 0 WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (e) {
    console.error('[FOLDERS] delete:', e);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

// "Dejar como plantilla": convierte la carpeta en una plantilla del módulo
// Plantillas existente, con fechas relativas al inicio más temprano.
taskFoldersRouter.post('/task-folders/:id/save-template', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await hasRole(req.userId!, ['admin', 'ejecutivo']))) return res.status(403).json({ error: 'Sin permisos' });
    const id = String(req.params.id);
    const folder = await queryOne<any>('SELECT * FROM task_folders WHERE id = ? AND activo = 1', [id]);
    if (!folder) return res.status(404).json({ error: 'Carpeta no encontrada' });

    const tasks = await query<any[]>(
      `SELECT titulo_tarea, detalle, prioridad, departamento, department_id, cantidad_entregables,
              story_points, fecha_inicio, fecha_entrega
       FROM tasks
       WHERE folder_id = ?
          OR folder_id IN (SELECT tf.id FROM task_folders tf WHERE tf.parent_folder_id = ? AND tf.activo = 1)
       ORDER BY fecha_entrega, created_at`,
      [id, id]
    );
    if (tasks.length === 0) return res.status(400).json({ error: 'La carpeta no tiene tareas' });

    const name = (typeof req.body?.name === 'string' && req.body.name.trim())
      ? req.body.name.trim().slice(0, 255)
      : folder.nombre;

    // Día 0 = el inicio más temprano de la carpeta; todo lo demás es relativo a eso
    const fechas = tasks.map((t) => t.fecha_inicio || t.fecha_entrega).filter(Boolean).map((d) => new Date(d).getTime());
    const base = fechas.length ? Math.min(...fechas) : Date.now();
    const dias = (d: any) => (d ? Math.max(0, Math.round((new Date(d).getTime() - base) / 86400000)) : null);

    const templateId = uuid();
    await query(
      'INSERT INTO project_templates (id, name, description, created_by, is_public) VALUES (?, ?, ?, ?, 1)',
      [templateId, name, `Creada desde la carpeta "${folder.nombre}" (${tasks.length} tareas)`, req.userId]
    );
    let order = 0;
    for (const t of tasks) {
      await query(
        `INSERT INTO template_tasks (id, template_id, titulo_tarea, detalle, prioridad, departamento, department_id,
                                     cantidad_entregables, story_points, relative_start_days, relative_due_days, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid(), templateId, t.titulo_tarea, t.detalle || null, t.prioridad || 'media', t.departamento || null,
         t.department_id || null, t.cantidad_entregables || 1, t.story_points || null,
         dias(t.fecha_inicio) ?? 0, dias(t.fecha_entrega) ?? 7, order++]
      );
    }
    res.status(201).json({ template_id: templateId, name, tareas: tasks.length });
  } catch (e) {
    console.error('[FOLDERS] save-template:', e);
    res.status(500).json({ error: 'Error al crear la plantilla' });
  }
});
