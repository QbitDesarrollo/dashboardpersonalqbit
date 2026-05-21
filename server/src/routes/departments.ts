import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

/**
 * Departamentos = etapas del flujo de producción (Contenido → Diseño → Producción → ...).
 *
 * Distinto de `task_types` (la naturaleza del trabajo): un mismo tipo de tarea
 * puede pasar por varios departamentos durante su ciclo de vida. Los handoffs
 * entre departamentos (POST /tasks/:id/handoff) se basan en esta tabla.
 *
 * Lectura: cualquier usuario autenticado.
 * Mutaciones: solo admin (las usa el panel de configuración).
 */
export const departmentsRouter = Router();

departmentsRouter.get('/departments', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const rows = await query<any[]>(
      `SELECT d.id, d.nombre, d.orden, d.color, d.next_department_id, d.activo,
              dn.nombre AS next_department_nombre
       FROM departments d
       LEFT JOIN departments dn ON dn.id = d.next_department_id
       ORDER BY d.orden, d.nombre`
    );
    res.json(rows.map((r) => ({ ...r, activo: !!r.activo })));
  } catch (e) {
    console.error('[DEPARTMENTS] list:', e);
    res.status(500).json({ error: 'Error al cargar departamentos' });
  }
});

departmentsRouter.post('/departments', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin']);
    if (!allowed) return res.status(403).json({ error: 'Solo admin puede crear departamentos' });

    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim().slice(0, 100) : '';
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });

    const orden = Number.isFinite(req.body?.orden) ? Math.trunc(req.body.orden) : 0;
    const color = typeof req.body?.color === 'string' ? req.body.color.trim().slice(0, 20) : null;
    const next_department_id = req.body?.next_department_id || null;

    // Validar unicidad
    const exists = await queryOne<{ id: string }>('SELECT id FROM departments WHERE nombre = ? LIMIT 1', [nombre]);
    if (exists) return res.status(409).json({ error: 'Ya existe un departamento con ese nombre' });

    const id = uuid();
    await query(
      'INSERT INTO departments (id, nombre, orden, color, next_department_id, activo) VALUES (?, ?, ?, ?, ?, 1)',
      [id, nombre, orden, color, next_department_id]
    );
    const row = await queryOne<any>('SELECT * FROM departments WHERE id = ?', [id]);
    res.status(201).json({ ...row, activo: !!row.activo });
  } catch (e) {
    console.error('[DEPARTMENTS] create:', e);
    res.status(500).json({ error: 'Error al crear departamento' });
  }
});

departmentsRouter.patch('/departments/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin']);
    if (!allowed) return res.status(403).json({ error: 'Solo admin puede editar departamentos' });

    const id = String(req.params.id);
    const existing = await queryOne<any>('SELECT * FROM departments WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Departamento no encontrado' });

    const updates: string[] = [];
    const values: unknown[] = [];

    if (typeof req.body?.nombre === 'string') {
      const nombre = req.body.nombre.trim().slice(0, 100);
      if (nombre && nombre !== existing.nombre) {
        const dup = await queryOne<{ id: string }>('SELECT id FROM departments WHERE nombre = ? AND id != ? LIMIT 1', [nombre, id]);
        if (dup) return res.status(409).json({ error: 'Ya existe un departamento con ese nombre' });
        updates.push('nombre = ?'); values.push(nombre);
      }
    }
    if (Number.isFinite(req.body?.orden)) { updates.push('orden = ?'); values.push(Math.trunc(req.body.orden)); }
    if (typeof req.body?.color === 'string') { updates.push('color = ?'); values.push(req.body.color.trim().slice(0, 20) || null); }
    if ('next_department_id' in (req.body || {})) {
      const next = req.body.next_department_id || null;
      if (next === id) return res.status(400).json({ error: 'Un departamento no puede apuntarse a sí mismo' });
      updates.push('next_department_id = ?'); values.push(next);
    }
    if (typeof req.body?.activo === 'boolean') { updates.push('activo = ?'); values.push(req.body.activo ? 1 : 0); }

    if (updates.length === 0) return res.status(400).json({ error: 'Nada para actualizar' });

    values.push(id);
    await query(`UPDATE departments SET ${updates.join(', ')} WHERE id = ?`, values);
    const row = await queryOne<any>('SELECT * FROM departments WHERE id = ?', [id]);
    res.json({ ...row, activo: !!row.activo });
  } catch (e) {
    console.error('[DEPARTMENTS] update:', e);
    res.status(500).json({ error: 'Error al actualizar departamento' });
  }
});

departmentsRouter.delete('/departments/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin']);
    if (!allowed) return res.status(403).json({ error: 'Solo admin puede eliminar departamentos' });

    const id = String(req.params.id);
    // No permitir eliminar si hay tareas asignadas
    const inUse = await queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM tasks WHERE department_id = ?', [id]);
    if ((inUse?.n ?? 0) > 0) {
      return res.status(409).json({
        error: `No se puede eliminar: hay ${inUse?.n} tarea(s) en este departamento. Pasalas a otro o desactivalo en lugar de eliminar.`,
      });
    }
    // Limpiar referencias next_department_id que apuntan a este
    await query('UPDATE departments SET next_department_id = NULL WHERE next_department_id = ?', [id]);
    await query('DELETE FROM departments WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[DEPARTMENTS] delete:', e);
    res.status(500).json({ error: 'Error al eliminar departamento' });
  }
});
