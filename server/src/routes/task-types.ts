import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, uuid } from '../db/mysql.js';
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
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { nombre } = req.body;
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
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const { nombre, activo } = req.body;
    await query('UPDATE task_types SET nombre = ?, activo = ? WHERE id = ?', [nombre, activo !== false ? 1 : 0, id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

taskTypesRouter.delete('/task-types/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
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
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { nombre } = req.body;
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
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const { nombre, activo } = req.body;
    await query('UPDATE deliverable_types SET nombre = ?, activo = ? WHERE id = ?', [nombre, activo !== false ? 1 : 0, id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

taskTypesRouter.delete('/deliverable-types/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    await query('DELETE FROM deliverable_types WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});
