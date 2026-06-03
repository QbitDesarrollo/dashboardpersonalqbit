import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

/**
 * Proyectos — la capa que faltaba: Cliente (brand) → Proyecto → Tareas.
 * % de avance = tareas entregadas/aprobadas sobre el total del proyecto.
 * Semáforo de salud: manual (columna `salud`) o auto si está NULL.
 */
export const projectsRouter = Router();

async function ensureExec(req: AuthRequest, res: any): Promise<boolean> {
  const ok = await hasRole(req.userId!, ['admin', 'ejecutivo']);
  if (!ok) { res.status(403).json({ error: 'Solo admin/ejecutivo' }); return false; }
  return true;
}

// Salud automática (si no fue seteada a mano): roja si hay tareas vencidas sin entregar,
// amarilla si hay alguna por vencer pronto o el proyecto pasó su fecha_fin, verde si todo en orden.
function autoSalud(row: any): 'verde' | 'amarillo' | 'rojo' {
  if (Number(row.vencidas) > 0) return 'rojo';
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  if (row.fecha_fin) {
    const fin = new Date(String(row.fecha_fin).slice(0, 10) + 'T00:00:00');
    if (fin < hoy && row.estado === 'en_curso') return 'rojo';
  }
  if (Number(row.por_vencer) > 0) return 'amarillo';
  return 'verde';
}

const STATS_SQL = `
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_tareas,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.estado IN ('entregado','aprobado')) AS tareas_listas,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.estado NOT IN ('entregado','aprobado') AND t.fecha_entrega IS NOT NULL AND t.fecha_entrega < CURDATE()) AS vencidas,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.estado NOT IN ('entregado','aprobado') AND t.fecha_entrega IS NOT NULL AND t.fecha_entrega BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)) AS por_vencer`;

function shape(r: any) {
  const total = Number(r.total_tareas) || 0;
  const listas = Number(r.tareas_listas) || 0;
  const avance = total > 0 ? Math.round((listas / total) * 100) : 0;
  const salud = (r.salud as 'verde' | 'amarillo' | 'rojo' | null) || autoSalud(r);
  return {
    id: r.id, brand_id: r.brand_id, brand_nombre: r.brand_nombre,
    nombre: r.nombre, descripcion: r.descripcion, estado: r.estado,
    salud, salud_manual: !!r.salud,
    fecha_inicio: r.fecha_inicio, fecha_fin: r.fecha_fin,
    lider_user_id: r.lider_user_id, lider_nombre: r.lider_nombre,
    desk_id: r.desk_id, color: r.color, activo: !!r.activo,
    total_tareas: total, tareas_listas: listas, vencidas: Number(r.vencidas) || 0,
    avance, created_at: r.created_at,
  };
}

// ── Lista de proyectos (con avance + salud) ──
projectsRouter.get('/projects', requireAuth, async (req: AuthRequest, res) => {
  try {
    const brandFilter = typeof req.query.brand_id === 'string' && req.query.brand_id ? req.query.brand_id : null;
    const estadoFilter = typeof req.query.estado === 'string' && req.query.estado ? req.query.estado : null;
    const conds: string[] = ['p.activo = 1'];
    const params: unknown[] = [];
    if (brandFilter) { conds.push('p.brand_id = ?'); params.push(brandFilter); }
    if (estadoFilter) { conds.push('p.estado = ?'); params.push(estadoFilter); }
    const rows = await query<any[]>(
      `SELECT p.*, b.nombre AS brand_nombre, pr.nombre AS lider_nombre, ${STATS_SQL}
       FROM projects p
       LEFT JOIN brands b ON b.id = p.brand_id
       LEFT JOIN profiles pr ON pr.id = p.lider_user_id
       WHERE ${conds.join(' AND ')}
       ORDER BY FIELD(p.estado,'en_curso','pausado','terminado','cancelado'), p.created_at DESC`,
      params
    );
    res.json(rows.map(shape));
  } catch (e) { console.error('[PROJECTS] list:', e); res.status(500).json({ error: 'Error al cargar proyectos' }); }
});

// ── Detalle + tareas ──
projectsRouter.get('/projects/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const r = await queryOne<any>(
      `SELECT p.*, b.nombre AS brand_nombre, pr.nombre AS lider_nombre, ${STATS_SQL}
       FROM projects p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN profiles pr ON pr.id = p.lider_user_id
       WHERE p.id = ?`, [id]);
    if (!r) return res.status(404).json({ error: 'Proyecto no encontrado' });
    const tasks = await query<any[]>(
      `SELECT t.id, t.titulo_tarea, t.estado, t.prioridad, t.fecha_entrega, t.fecha_cliente, t.created_at,
              p.nombre AS responsable_nombre, p.avatar_url AS responsable_avatar
       FROM tasks t LEFT JOIN profiles p ON p.id = t.responsable_user_id
       WHERE t.project_id = ? AND t.parent_task_id IS NULL
       ORDER BY FIELD(t.estado,'backlog','en_proceso','en_revision','revision_interna','revision_cliente','aprobado','entregado','bloqueado'), t.fecha_entrega`,
      [id]
    );
    res.json({ project: shape(r), tasks });
  } catch (e) { console.error('[PROJECTS] detail:', e); res.status(500).json({ error: 'Error' }); }
});

// ── Crear ──
projectsRouter.post('/projects', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureExec(req, res))) return;
    const b = req.body || {};
    const brandId = typeof b.brand_id === 'string' ? b.brand_id : '';
    const nombre = typeof b.nombre === 'string' ? b.nombre.trim().slice(0, 160) : '';
    if (!brandId || !nombre) return res.status(400).json({ error: 'brand_id y nombre requeridos' });
    const brand = await queryOne<any>('SELECT id FROM brands WHERE id = ?', [brandId]);
    if (!brand) return res.status(400).json({ error: 'Marca no encontrada' });
    const id = uuid();
    await query(
      `INSERT INTO projects (id, brand_id, nombre, descripcion, estado, fecha_inicio, fecha_fin, lider_user_id, desk_id, color, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, brandId, nombre, b.descripcion || null, b.estado || 'en_curso', b.fecha_inicio || null, b.fecha_fin || null,
       b.lider_user_id || null, b.desk_id || null, b.color || null, req.userId ?? null]
    );
    const r = await queryOne<any>(
      `SELECT p.*, b.nombre AS brand_nombre, pr.nombre AS lider_nombre, ${STATS_SQL}
       FROM projects p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN profiles pr ON pr.id = p.lider_user_id WHERE p.id = ?`, [id]);
    res.status(201).json(shape(r));
  } catch (e) { console.error('[PROJECTS] create:', e); res.status(500).json({ error: 'Error al crear proyecto' }); }
});

// ── Editar ──
projectsRouter.patch('/projects/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureExec(req, res))) return;
    const id = String(req.params.id);
    const existing = await queryOne<any>('SELECT id FROM projects WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    const map: Record<string, string> = {
      nombre: 'nombre', descripcion: 'descripcion', estado: 'estado', salud: 'salud',
      fecha_inicio: 'fecha_inicio', fecha_fin: 'fecha_fin', lider_user_id: 'lider_user_id',
      desk_id: 'desk_id', color: 'color', activo: 'activo',
    };
    const sets: string[] = []; const vals: unknown[] = [];
    for (const [k, col] of Object.entries(map)) {
      if (k in b) { sets.push(`${col} = ?`); vals.push(k === 'activo' ? (b[k] ? 1 : 0) : (b[k] === '' ? null : b[k])); }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada para actualizar' });
    vals.push(id);
    await query(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, vals);
    const r = await queryOne<any>(
      `SELECT p.*, b.nombre AS brand_nombre, pr.nombre AS lider_nombre, ${STATS_SQL}
       FROM projects p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN profiles pr ON pr.id = p.lider_user_id WHERE p.id = ?`, [id]);
    res.json(shape(r));
  } catch (e) { console.error('[PROJECTS] update:', e); res.status(500).json({ error: 'Error al actualizar' }); }
});

// ── Asignar tareas a un proyecto (bulk) ──
projectsRouter.post('/projects/:id/assign-tasks', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureExec(req, res))) return;
    const id = String(req.params.id);
    const ids: string[] = Array.isArray(req.body?.task_ids) ? req.body.task_ids.filter((x: unknown) => typeof x === 'string') : [];
    if (ids.length === 0) return res.status(400).json({ error: 'task_ids requerido' });
    const ph = ids.map(() => '?').join(',');
    await query(`UPDATE tasks SET project_id = ? WHERE id IN (${ph})`, [id, ...ids]);
    res.json({ ok: true, count: ids.length });
  } catch (e) { console.error('[PROJECTS] assign:', e); res.status(500).json({ error: 'Error' }); }
});

// ── Eliminar (soft: desactiva; las tareas quedan sin proyecto) ──
projectsRouter.delete('/projects/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureExec(req, res))) return;
    const id = String(req.params.id);
    await query('UPDATE projects SET activo = 0 WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) { console.error('[PROJECTS] delete:', e); res.status(500).json({ error: 'Error' }); }
});
