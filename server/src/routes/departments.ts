import { Router, type Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';
import { consultarResumen } from '../departamentos/consultas.js';
import { servicioArchivo } from '../departamentos/transaccion.js';
import { archivarSchema, eliminarSchema } from '../departamentos/esquemas.js';
import { ErrorDepartamento } from '../departamentos/dominio.js';
import { puedeAdministrarDepartamentos } from '../departamentos/permisos.js';

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
interface DepartmentRow {
  id: string;
  nombre: string;
  orden: number;
  color: string | null;
  next_department_id: string | null;
  next_department_nombre?: string | null;
  activo: number;
}

export const departmentsRouter = Router();

departmentsRouter.get('/departments/resumen', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!await hasRole(req.userId!, ['admin', 'ejecutivo'])) {
      return res.status(403).json({ error: 'Solo admin o ejecutivo puede consultar el resumen de departamentos' });
    }
    res.json(await consultarResumen());
  } catch (e) {
    console.error('[DEPARTMENTS] resumen:', e);
    res.status(500).json({ error: 'Error al cargar el resumen de departamentos' });
  }
});

departmentsRouter.get('/departments', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const rows = await query<DepartmentRow[]>(
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
    const row = await queryOne<DepartmentRow>('SELECT * FROM departments WHERE id = ?', [id]);
    res.status(201).json({ ...row, activo: !!row!.activo });
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
    const existing = await queryOne<DepartmentRow>('SELECT * FROM departments WHERE id = ?', [id]);
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
    const row = await queryOne<DepartmentRow>('SELECT * FROM departments WHERE id = ?', [id]);
    res.json({ ...row, activo: !!row!.activo });
  } catch (e) {
    console.error('[DEPARTMENTS] update:', e);
    res.status(500).json({ error: 'Error al actualizar departamento' });
  }
});

function responderErrorArchivo(error: unknown, res: Response) {
  if (error instanceof ErrorDepartamento) {
    return res.status(error.status).json({ error: error.message, ...(error.referencias ? { referencias: error.referencias } : {}) });
  }
  console.error('[DEPARTMENTS] archivo:', error);
  return res.status(500).json({ error: 'No se pudo completar la operación del departamento' });
}

departmentsRouter.post('/departments/:id/archivar', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!await puedeAdministrarDepartamentos(req.userId!)) return res.status(403).json({ error: 'Solo admin puede archivar departamentos' });
    const body = archivarSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Indica destino_id como UUID o null' });
    res.json(await servicioArchivo.archivar(String(req.params.id), body.data.destino_id));
  } catch (error) { responderErrorArchivo(error, res); }
});

departmentsRouter.post('/departments/:id/restaurar', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!await puedeAdministrarDepartamentos(req.userId!)) return res.status(403).json({ error: 'Solo admin puede restaurar departamentos' });
    res.json(await servicioArchivo.restaurar(String(req.params.id)));
  } catch (error) { responderErrorArchivo(error, res); }
});

// Previsualización de solo lectura; DELETE vuelve a validar dentro de su propia transacción.
departmentsRouter.get('/departments/:id/referencias', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!await puedeAdministrarDepartamentos(req.userId!)) return res.status(403).json({ error: 'Solo admin puede consultar las referencias' });
    res.json(await servicioArchivo.referencias(String(req.params.id)));
  } catch (error) { responderErrorArchivo(error, res); }
});

departmentsRouter.delete('/departments/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!await puedeAdministrarDepartamentos(req.userId!)) return res.status(403).json({ error: 'Solo admin puede eliminar departamentos' });
    const body = eliminarSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Escribe el nombre exacto' });
    res.json(await servicioArchivo.eliminar(String(req.params.id), body.data.confirmacion));
  } catch (error) { responderErrorArchivo(error, res); }
});
