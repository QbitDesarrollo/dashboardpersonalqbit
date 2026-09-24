import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

export const taskTypesRouter = Router();

// ========== TASK TYPES ==========
taskTypesRouter.get('/task-types', requireAuth, async (_req, res) => {
  try {
    const rows = await query<any[]>('SELECT * FROM task_types ORDER BY nombre');
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar tipos' });
  }
});

taskTypesRouter.post('/task-types', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim().slice(0, 255) : '';
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const exists = await queryOne<{ id: string }>('SELECT id FROM task_types WHERE nombre = ? LIMIT 1', [nombre]);
    if (exists) return res.status(409).json({ error: 'Ya existe un tipo de tarea con ese nombre' });
    const id = uuid();
    await query('INSERT INTO task_types (id, nombre) VALUES (?, ?)', [id, nombre]);
    res.status(201).json({ id, nombre, activo: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear' });
  }
});

taskTypesRouter.patch('/task-types/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const { nombre, activo } = req.body;
    if (typeof nombre === 'string' && nombre.trim()) {
      const dup = await queryOne<{ id: string }>('SELECT id FROM task_types WHERE nombre = ? AND id != ? LIMIT 1', [nombre.trim(), id]);
      if (dup) return res.status(409).json({ error: 'Ya existe un tipo de tarea con ese nombre' });
    }
    await query('UPDATE task_types SET nombre = ?, activo = ? WHERE id = ?', [nombre, activo !== false ? 1 : 0, id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

taskTypesRouter.delete('/task-types/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    await query('DELETE FROM task_types WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

// ========== DELIVERABLE TYPES ==========
taskTypesRouter.get('/deliverable-types', requireAuth, async (_req, res) => {
  try {
    const rows = await query<any[]>('SELECT * FROM deliverable_types ORDER BY nombre');
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar tipos' });
  }
});

taskTypesRouter.post('/deliverable-types', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim().slice(0, 255) : '';
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const exists = await queryOne<{ id: string }>('SELECT id FROM deliverable_types WHERE nombre = ? LIMIT 1', [nombre]);
    if (exists) return res.status(409).json({ error: 'Ya existe un tipo de entregable con ese nombre' });
    const id = uuid();
    await query('INSERT INTO deliverable_types (id, nombre) VALUES (?, ?)', [id, nombre]);
    res.status(201).json({ id, nombre, activo: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear' });
  }
});

taskTypesRouter.patch('/deliverable-types/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const { nombre, activo } = req.body;
    if (typeof nombre === 'string' && nombre.trim()) {
      const dup = await queryOne<{ id: string }>('SELECT id FROM deliverable_types WHERE nombre = ? AND id != ? LIMIT 1', [nombre.trim(), id]);
      if (dup) return res.status(409).json({ error: 'Ya existe un tipo de entregable con ese nombre' });
    }
    await query('UPDATE deliverable_types SET nombre = ?, activo = ? WHERE id = ?', [nombre, activo !== false ? 1 : 0, id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

// Tiempo estándar por unidad (minutos): con él se autocompletan las horas estimadas de la tarea
taskTypesRouter.patch('/deliverable-types/:id/minutos', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const raw = req.body?.minutos_estimados;
    const minutos = raw === null || raw === '' || raw === undefined ? null : Math.round(Number(raw));
    if (minutos !== null && (!Number.isFinite(minutos) || minutos < 0 || minutos > 6000)) return res.status(400).json({ error: 'Minutos inválidos (0 a 6000)' });
    await query('UPDATE deliverable_types SET minutos_estimados = ? WHERE id = ?', [minutos || null, String(req.params.id)]);
    res.json({ success: true, minutos_estimados: minutos || null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al guardar' });
  }
});

taskTypesRouter.delete('/deliverable-types/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    await query('DELETE FROM deliverable_types WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});
