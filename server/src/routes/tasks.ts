import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { getUserRole, hasRole } from '../utils/roles.js';
import { logActivity, logTaskChanges } from '../utils/activity.js';
import { canAccessTask } from '../utils/taskAccess.js';
import { createNotification } from '../utils/notifications.js';
import { sendEmail, taskAssignmentEmail, taskHandoffEmail } from '../services/email.js';
import { processCommentMentions } from '../utils/mentions.js';
import { autoSyncTaskToCalendar } from '../utils/googleCalendarSync.js';
import { sinHtmlVacio } from '../utils/html.js';
import { emitirComentario } from '../utils/realtime.js';
import { raizDeRespuesta, avisarRespuesta } from '../utils/commentReplies.js';

const createTaskSchema = z.object({
  titulo_tarea: z.string().min(1, 'Título requerido').max(500),
  folder_id: z.string().uuid().nullish(),
  brand_id: z.string().min(1, 'Marca requerida'),
  desk_id: z.string().nullable().optional(),
  detalle: z.string().max(5000).nullable().optional(),
  cantidad_entregables: z.number().int().min(0).max(999).optional().default(1),
  responsable_user_id: z.string().nullable().optional(),
  responsable_ids: z.array(z.string()).max(20).optional(),
  departamento: z.string().max(200).nullable().optional(),
  department_id: z.string().nullable().optional(),
  project_id: z.string().nullable().optional(),
  prioridad: z.enum(['alta', 'media', 'baja']).optional().default('media'),
  estado: z.enum(['backlog', 'en_proceso', 'en_revision', 'revision_interna', 'revision_cliente', 'ajustes', 'aprobado', 'entregado', 'bloqueado']).optional().default('backlog'),
  fecha_inicio: z.string().nullable().optional(),
  fecha_entrega: z.string().min(1, 'Fecha de entrega requerida'),
  enlaces: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  check_done: z.boolean().optional().default(false),
  sprint_id: z.string().nullable().optional(),
  story_points: z.number().int().min(0).max(100).nullable().optional(),
  feature_id: z.string().nullable().optional(),
  task_type_id: z.string().nullable().optional(),
  tipo_entregable_id: z.string().nullable().optional(),
  entregables: z.array(z.object({
    tipo_entregable_id: z.string().min(1),
    cantidad: z.number().int().min(1).max(999).default(1),
  })).max(20).optional(),
  estimated_hours: z.number().min(0).max(9999).nullable().optional(),
  recurrence_type: z.enum(['none', 'daily', 'weekly', 'biweekly', 'monthly', 'custom']).optional().default('none'),
  recurrence_interval: z.number().int().min(1).max(365).nullable().optional(),
  recurrence_end_date: z.string().nullable().optional(),
});

/** Manda email de asignación de tarea para un user específico. Lee data desde la DB. */
async function sendTaskAssignmentEmailFor(userId: string, taskId: string): Promise<void> {
  try {
    const user = await queryOne<{ email: string; nombre: string }>('SELECT email, nombre FROM profiles WHERE id = ?', [userId]);
    if (!user?.email) return;
    if (!process.env.MAILGUN_API_KEY && !process.env.SMTP_PASS) return;
    const t = await queryOne<any>(
      `SELECT t.titulo_tarea, t.detalle, t.fecha_inicio, t.fecha_entrega, t.prioridad, b.nombre AS brand_nombre
       FROM tasks t LEFT JOIN brands b ON b.id = t.brand_id WHERE t.id = ?`,
      [taskId]
    );
    if (!t) return;
    const frontendUrl = process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec';
    const emailData = await taskAssignmentEmail({
      recipientName: user.nombre || 'Usuario',
      taskTitle: String(t.titulo_tarea || 'Tarea'),
      brandName: String(t.brand_nombre || 'Sin marca'),
      detalle: t.detalle || undefined,
      fechaInicio: t.fecha_inicio ? new Date(t.fecha_inicio).toISOString().slice(0, 10) : null,
      fechaEntrega: t.fecha_entrega ? new Date(t.fecha_entrega).toISOString().slice(0, 10) : '',
      prioridad: String(t.prioridad || 'media'),
      frontendUrl,
      taskId,
    });
    emailData.to = user.email;
    await sendEmail(emailData);
  } catch (e) {
    console.error('[TASK ASSIGN EMAIL] error:', e);
  }
}

/** Fire-and-forget notification. Only sends if userId is a non-empty string. */
function notifyUser(userId: string, mensaje: string, taskId: string): void {
  if (!userId) return;
  createNotification(userId, mensaje, taskId).catch(() => {});
}

/** Notifica a los seguidores de una tarea (los que la pasaron y la siguen mirando). */
async function notifySeguidores(taskId: string, mensaje: string, exceptUserId?: string | null): Promise<void> {
  try {
    const rows = await query<{ user_id: string }[]>('SELECT user_id FROM task_seguidores WHERE task_id = ?', [taskId]);
    for (const r of rows) {
      if (r.user_id && r.user_id !== exceptUserId) notifyUser(r.user_id, mensaje, taskId);
    }
  } catch { /* best-effort */ }
}

/** Safely extract a single string id from an Express body value (could be any). */
function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    const first = v[0];
    return typeof first === 'string' ? first : first != null ? String(first) : '';
  }
  if (v != null) return String(v);
  return '';
}

export const tasksRouter = Router();

const TASKS_PAGE_SIZE = 100;
const TASKS_PAGE_SIZE_MAX = 500;

tasksRouter.get('/tasks', requireAuth, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(
      Math.max(1, parseInt(String(req.query.limit), 10) || TASKS_PAGE_SIZE),
      TASKS_PAGE_SIZE_MAX
    );
    const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);
    const sprintId = req.query.sprint_id as string | undefined;
    const backlogOnly = req.query.backlog === '1' || req.query.backlog === 'true';
    const deskIdFilter = req.query.desk_id as string | undefined;
    const responsableFilter = req.query.responsable_user_id as string | undefined;
    const brandFilter = req.query.brand_id as string | undefined;
    const statusFilter = req.query.estado as string | undefined;
    const priorityFilter = req.query.prioridad as string | undefined;
    const searchFilter = req.query.search as string | undefined;
    const projectFilter = req.query.project_id as string | undefined;

    const role = await getUserRole(req.userId!);
    const baseFrom = `FROM tasks t
         LEFT JOIN brands b ON b.id = t.brand_id
         LEFT JOIN desks d ON d.id = t.desk_id
         LEFT JOIN profiles p ON p.id = t.responsable_user_id
         LEFT JOIN features f ON f.id = t.feature_id
         LEFT JOIN sprints sp ON sp.id = t.sprint_id
         LEFT JOIN task_types tt ON tt.id = t.task_type_id
         LEFT JOIN deliverable_types dt ON dt.id = t.tipo_entregable_id
         LEFT JOIN departments dep ON dep.id = t.department_id
         LEFT JOIN profiles cb ON cb.id = t.created_by
         LEFT JOIN task_folders tf ON tf.id = t.folder_id`;
    const baseSelect = `SELECT t.*, b.nombre as brand_nombre, d.nombre as desk_nombre, dep.nombre as department_nombre, dep.color as department_color, t.fecha_cliente, t.cliente_visible, t.client_board_id, t.project_id, p.nombre as resp_nombre, p.avatar_url as resp_avatar_url, f.name as feature_name, sp.name as sprint_name, tt.nombre as task_type_nombre, dt.nombre as deliverable_type_nombre, cb.nombre as created_by_nombre, cb.avatar_url as created_by_avatar_url, cb.rol as created_by_rol, tf.nombre as folder_nombre,
       (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id) AS subtask_count,
       (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND (st.check_done = 1 OR st.estado IN ('entregado','aprobado'))) AS subtask_done_count,
       (SELECT COUNT(*) FROM files fl WHERE fl.task_id = t.id) AS files_count
       ${baseFrom}`;
    // orden=entrega (Tasks page): open tasks first, soonest due date first and undated last;
    // then closed ones, most recent first. Without it, newest created first as always.
    const orderBy = req.query.orden === 'entrega'
      ? ` ORDER BY (t.estado IN ('entregado','aprobado')) ASC,
          CASE WHEN t.estado IN ('entregado','aprobado') THEN NULL ELSE (t.fecha_entrega IS NULL) END ASC,
          CASE WHEN t.estado IN ('entregado','aprobado') THEN NULL ELSE t.fecha_entrega END ASC,
          CASE WHEN t.estado IN ('entregado','aprobado') THEN t.fecha_entrega END DESC,
          t.created_at DESC`
      : ' ORDER BY t.created_at DESC';

    let countSql: string;
    let listSql: string;
    let countParams: (string | undefined)[];
    let listParams: (string | undefined)[];

    let sprintCondition = '';
    const sprintParam: (string | undefined)[] = [];
    if (backlogOnly) {
      sprintCondition = ' AND (t.sprint_id IS NULL OR t.sprint_id = \'\')';
    } else if (sprintId) {
      sprintCondition = ' AND t.sprint_id = ?';
      sprintParam.push(sprintId);
    }
    // Solo tareas de primer nivel (no subtareas)
    const noSubtasksCondition = ' AND (t.parent_task_id IS NULL OR t.parent_task_id = \'\')';

    // Common filters (applied in all role branches)
    let extraConditions = '';
    const extraParams: string[] = [];
    if (deskIdFilter) {
      // Estricto: solo tareas cuya mesa es la pedida. Antes incluia tambien las
      // tareas de los miembros de la mesa en otras mesas; con mesas de 30+
      // personas eso devolvia 2/3 de todas las tareas y el frontend (que filtra
      // por t.desk_id) mostraba paginas vacias.
      // Mesas que son de un departamento (Planning, Creatividad, Desarrollo):
      // también traen las tareas de ese departamento aunque vivan en la mesa de
      // la marca (pedido de Steven, 5-oct: así el planner ve la tarea que le creó
      // la ejecutiva y no la duplica).
      extraConditions += ' AND (t.desk_id = ? OR t.department_id = (SELECT dk.department_id FROM desks dk WHERE dk.id = ?))';
      extraParams.push(deskIdFilter, deskIdFilter);
    }
    if (responsableFilter) {
      extraConditions += ' AND (t.responsable_user_id = ? OR t.id IN (SELECT task_id FROM task_responsables WHERE user_id = ?))';
      extraParams.push(responsableFilter, responsableFilter);
    }
    if (brandFilter) {
      extraConditions += ' AND t.brand_id = ?';
      extraParams.push(brandFilter);
    }
    if (statusFilter) {
      extraConditions += ' AND t.estado = ?';
      extraParams.push(statusFilter);
    }
    if (priorityFilter) {
      extraConditions += ' AND t.prioridad = ?';
      extraParams.push(priorityFilter);
    }
    if (projectFilter) {
      extraConditions += ' AND t.project_id = ?';
      extraParams.push(projectFilter);
    }
    if (searchFilter) {
      extraConditions += ' AND t.titulo_tarea LIKE ?';
      extraParams.push(`%${searchFilter}%`);
    }

    if (role === 'cliente') {
      const brandIds = await query<{ brand_id: string }[]>('SELECT brand_id FROM client_brands WHERE user_id = ?', [req.userId]);
      const ids = brandIds.map((r) => r.brand_id);
      if (ids.length === 0) {
        res.json({ tasks: [], total: 0 });
        return;
      }
      const placeholders = ids.map(() => '?').join(',');
      const where = ` WHERE t.brand_id IN (${placeholders})${noSubtasksCondition}${sprintCondition}${extraConditions}`;
      countSql = `SELECT COUNT(*) as total ${baseFrom}${where}`;
      listSql = `${baseSelect}${where}${orderBy} LIMIT ? OFFSET ?`;
      countParams = [...ids, ...sprintParam, ...extraParams];
      listParams = [...ids, ...sprintParam, ...extraParams, String(limit), String(offset)];
    } else if (role === 'equipo' || role === 'ejecutivo') {
      // Equipo y ejecutivo solo ven tareas de su mesa o asignadas a ellos
      const deskRows = await query<{ desk_id: string }[]>('SELECT desk_id FROM desk_members WHERE user_id = ?', [req.userId]);
      const deskIds = deskRows.map((r) => r.desk_id);
      // FIX: incluir también tareas donde el usuario es co-responsable (task_responsables)
      const coRespCondition = ' OR t.id IN (SELECT task_id FROM task_responsables WHERE user_id = ?) OR t.id IN (SELECT task_id FROM task_seguidores WHERE user_id = ?)';
      // + tareas del departamento de sus mesas-departamento (Planning, Creatividad...)
      const deskPh = deskIds.map(() => '?').join(',');
      const where = deskIds.length > 0
        ? ` WHERE ((t.desk_id IN (${deskPh})) OR t.department_id IN (SELECT dk.department_id FROM desks dk WHERE dk.id IN (${deskPh}) AND dk.department_id IS NOT NULL) OR t.responsable_user_id = ?${coRespCondition})${noSubtasksCondition}${sprintCondition}${extraConditions}`
        : ` WHERE (t.responsable_user_id = ?${coRespCondition})${noSubtasksCondition}${sprintCondition}${extraConditions}`;
      countParams = deskIds.length > 0 ? [...deskIds, ...deskIds, req.userId!, req.userId!, req.userId!, ...sprintParam, ...extraParams] : [req.userId!, req.userId!, req.userId!, ...sprintParam, ...extraParams];
      listParams = deskIds.length > 0 ? [...deskIds, ...deskIds, req.userId!, req.userId!, req.userId!, ...sprintParam, ...extraParams, String(limit), String(offset)] : [req.userId!, req.userId!, req.userId!, ...sprintParam, ...extraParams, String(limit), String(offset)];
      countSql = `SELECT COUNT(*) as total ${baseFrom}${where}`;
      listSql = `${baseSelect}${where}${orderBy} LIMIT ? OFFSET ?`;
    } else {
      // admin: ve todas las tareas (solo primer nivel)
      const baseWhere = ' WHERE (t.parent_task_id IS NULL OR t.parent_task_id = \'\')';
      const where = baseWhere + (backlogOnly ? ' AND (t.sprint_id IS NULL OR t.sprint_id = \'\')' : sprintId ? ' AND t.sprint_id = ?' : '') + extraConditions;
      countSql = `SELECT COUNT(*) as total ${baseFrom}${where}`;
      listSql = `${baseSelect}${where}${orderBy} LIMIT ? OFFSET ?`;
      countParams = [...sprintParam, ...extraParams];
      listParams = [...sprintParam, ...extraParams, String(limit), String(offset)];
    }

    const [countRow, rows] = await Promise.all([
      queryOne<{ total: number }>(countSql, countParams),
      query<any[]>(listSql, listParams),
    ]);
    const total = Number(countRow?.total ?? 0);

    // Fetch multiple responsables for all tasks
    const taskIds = rows.map((r: any) => r.id);
    let respMap: Record<string, { user_id: string; nombre: string; avatar_url: string | null }[]> = {};
    if (taskIds.length > 0) {
      const ph = taskIds.map(() => '?').join(',');
      const respRows = await query<any[]>(
        `SELECT tr.task_id, tr.user_id, p.nombre, p.avatar_url FROM task_responsables tr LEFT JOIN profiles p ON p.id = tr.user_id WHERE tr.task_id IN (${ph})`,
        taskIds
      );
      for (const r of respRows) {
        if (!respMap[r.task_id]) respMap[r.task_id] = [];
        respMap[r.task_id].push({ user_id: r.user_id, nombre: r.nombre, avatar_url: r.avatar_url || null });
      }
    }

    // Fetch read status for current user and read counts
    let readMap: Record<string, boolean> = {};
    let readCountMap: Record<string, number> = {};
    if (taskIds.length > 0) {
      const readPh = taskIds.map(() => '?').join(',');
      const [readRows, readCountRows] = await Promise.all([
        query<any[]>(
          `SELECT task_id FROM task_reads WHERE user_id = ? AND task_id IN (${readPh})`,
          [req.userId!, ...taskIds]
        ),
        query<any[]>(
          `SELECT task_id, COUNT(*) as cnt FROM task_reads WHERE task_id IN (${readPh}) GROUP BY task_id`,
          taskIds
        ),
      ]);
      for (const r of readRows) { readMap[r.task_id] = true; }
      for (const r of readCountRows) { readCountMap[r.task_id] = Number(r.cnt); }
    }

    // Fetch multiple deliverable types per task
    let taskDelTypesMap: Record<string, { tipo_entregable_id: string; nombre: string; cantidad: number }[]> = {};
    if (taskIds.length > 0) {
      const dtPh = taskIds.map(() => '?').join(',');
      const tdtRows = await query<any[]>(
        `SELECT tdt.task_id, tdt.tipo_entregable_id, dt.nombre, tdt.cantidad
         FROM task_deliverable_types tdt
         LEFT JOIN deliverable_types dt ON dt.id = tdt.tipo_entregable_id
         WHERE tdt.task_id IN (${dtPh})`,
        taskIds
      );
      for (const r of tdtRows) {
        if (!taskDelTypesMap[r.task_id]) taskDelTypesMap[r.task_id] = [];
        taskDelTypesMap[r.task_id].push({
          tipo_entregable_id: r.tipo_entregable_id,
          nombre: r.nombre,
          cantidad: r.cantidad,
        });
      }
    }

    const tasks = rows.map((r: any) => ({
      ...r,
      brands: r.brand_nombre ? { nombre: r.brand_nombre } : null,
      desks: r.desk_nombre ? { nombre: r.desk_nombre } : null,
      profiles: r.resp_nombre ? { nombre: r.resp_nombre, avatar_url: r.resp_avatar_url || null } : null,
      responsables: respMap[r.id] || [],
      feature: r.feature_name ? { name: r.feature_name } : null,
      sprint: r.sprint_name ? { name: r.sprint_name } : null,
      task_type: r.task_type_nombre ? { nombre: r.task_type_nombre } : null,
      deliverable_type: r.deliverable_type_nombre ? { nombre: r.deliverable_type_nombre } : null,
      deliverable_types_list: taskDelTypesMap[r.id] || [],
      created_by_profile: r.created_by_nombre ? { nombre: r.created_by_nombre, avatar_url: r.created_by_avatar_url || null } : null,
      created_by_rol: r.created_by_rol || null,
      is_read: readMap[r.id] || false,
      read_count: readCountMap[r.id] || 0,
    }));
    res.json({ tasks, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar tareas' });
  }
});


// GET active timers — devuelve las tareas con timer activo del usuario actual.
// Se usa al iniciar un timer en una tarea para detectar conflictos y ofrecer
// pausar la anterior. Idealmente solo hay una (un usuario = un timer activo),
// pero pueden ser varias si quedaron pegadas.
tasksRouter.get("/tasks/active-timer", requireAuth, async (req: AuthRequest, res) => {
  try {
    // OJO: `tasks.timer_activo` es una bandera POR TAREA (no tiene dueño). Si se
    // filtra por "soy responsable", el timer que arranca un COMPANERO en una tarea
    // compartida aparece como propio -> "tarea fantasma" (incidencia a4df370e), y
    // al aceptar el conflicto se pausaba el timer del companero.
    // La verdad por persona son las SESIONES (time_entries.user_id).
    const rows = await query<any[]>(
      `SELECT t.id, t.titulo_tarea, t.timer_inicio, t.tiempo_trabajado,
              b.nombre AS brand_nombre
       FROM tasks t
       LEFT JOIN brands b ON b.id = t.brand_id
       WHERE t.timer_activo = 1
         AND (
           EXISTS (SELECT 1 FROM time_entries te
                    WHERE te.task_id = t.id AND te.user_id = ? AND te.status = 'active')
           OR (
             t.responsable_user_id = ?
             AND NOT EXISTS (SELECT 1 FROM time_entries te2
                              WHERE te2.task_id = t.id AND te2.status = 'active')
           )
         )
       ORDER BY t.timer_inicio DESC`,
      [req.userId, req.userId]
    );
    res.json(rows.map((r) => ({
      id: r.id,
      titulo: r.titulo_tarea,
      brand_nombre: r.brand_nombre,
      timer_inicio: r.timer_inicio,
      tiempo_trabajado: Number(r.tiempo_trabajado || 0),
    })));
  } catch (e) {
    console.error("[TIMER] active-timer error:", e);
    res.status(500).json({ error: "Error al consultar timers activos" });
  }
});

// GET single task by ID (for deep-linking from emails / daily)
// Tareas abiertas parecidas a un título (misma marca), para avisar antes de crear
// una duplicada (pedido de Steven, 5-oct: la ejecutiva y el planner creaban la misma).
const PALABRAS_VACIAS = new Set(['para', 'por', 'con', 'del', 'las', 'los', 'una', 'uno', 'que', 'sus', 'mas', 'sin', 'the', 'and', 'tarea', 'post', 'posts']);
function palabrasTitulo(t: string): Set<string> {
  const norm = String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ');
  return new Set(norm.split(/\s+/).filter((w) => w.length >= 3 && !PALABRAS_VACIAS.has(w)));
}
tasksRouter.get('/tasks/similares', requireAuth, async (req: AuthRequest, res) => {
  try {
    const role = await getUserRole(req.userId!);
    if (role === 'cliente') return res.status(403).json({ error: 'Sin permisos' });
    const titulo = String(req.query.titulo || '').slice(0, 300);
    const brandId = typeof req.query.brand_id === 'string' ? req.query.brand_id : '';
    const excluir = typeof req.query.excluir_id === 'string' ? req.query.excluir_id : '';
    // Las palabras del nombre de la marca no cuentan ("Catálogo Alba del Bosque" no se parece
    // a "Salesforce | Alba de Bosque" solo por la marca)
    const marca = brandId ? await queryOne<{ nombre: string }>('SELECT nombre FROM brands WHERE id = ?', [brandId]) : null;
    const deMarca = palabrasTitulo(marca?.nombre || '');
    const sinMarca = (ws: Set<string>) => new Set([...ws].filter((w) => !deMarca.has(w)));
    const buscadas = sinMarca(palabrasTitulo(titulo));
    if (!brandId || buscadas.size === 0) return res.json({ similares: [] });
    const candidatas = await query<any[]>(
      `SELECT t.id, t.titulo_tarea, t.estado, DATE_FORMAT(t.fecha_entrega, '%Y-%m-%d') AS fecha_entrega,
              p.nombre AS responsable, dep.nombre AS departamento, d.nombre AS mesa, cb.nombre AS creada_por
       FROM tasks t
       LEFT JOIN profiles p ON p.id = t.responsable_user_id
       LEFT JOIN departments dep ON dep.id = t.department_id
       LEFT JOIN desks d ON d.id = t.desk_id
       LEFT JOIN profiles cb ON cb.id = t.created_by
       WHERE t.brand_id = ? AND t.estado NOT IN ('entregado','aprobado')
         AND (t.parent_task_id IS NULL OR t.parent_task_id = '')
         AND t.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY) AND t.id <> ?
       ORDER BY t.created_at DESC LIMIT 400`,
      [brandId, excluir],
    );
    const similares = candidatas
      .map((c) => {
        const suyas = sinMarca(palabrasTitulo(c.titulo_tarea));
        let comunes = 0;
        for (const w of buscadas) if (suyas.has(w)) comunes++;
        // Coincidencia sobre el título más corto: "Planner octubre" ~ "Planner de contenidos octubre"
        const score = comunes / Math.max(1, Math.min(buscadas.size, suyas.size));
        return { ...c, responsable: c.responsable ? String(c.responsable).trim() : null, comunes, score };
      })
      .filter((c) => c.comunes >= Math.min(2, buscadas.size) && c.score >= 0.6)
      .sort((a, b) => b.score - a.score || b.comunes - a.comunes)
      .slice(0, 5)
      .map((c) => ({
        id: c.id, titulo_tarea: c.titulo_tarea, estado: c.estado, fecha_entrega: c.fecha_entrega,
        responsable: c.responsable, departamento: c.departamento, mesa: c.mesa,
        creada_por: c.creada_por ? String(c.creada_por).trim() : null, parecido: Math.round(c.score * 100),
      }));
    res.json({ similares });
  } catch (e) {
    console.error('[TASKS] similares:', e);
    res.status(500).json({ error: 'Error al buscar tareas parecidas' });
  }
});

tasksRouter.get('/tasks/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.id;
    const row = await queryOne<any>(
      `SELECT t.*, b.nombre as brand_nombre, d.nombre as desk_nombre,
              dep.nombre as department_nombre, dep.color as department_color,
              p.nombre as resp_nombre, p.avatar_url as resp_avatar_url,
              f.name as feature_name, sp.name as sprint_name,
              tt.nombre as task_type_nombre, dt.nombre as deliverable_type_nombre,
              cb.nombre as created_by_nombre, cb.avatar_url as created_by_avatar_url, cb.rol as created_by_rol
       FROM tasks t
       LEFT JOIN brands b ON b.id = t.brand_id
       LEFT JOIN desks d ON d.id = t.desk_id
       LEFT JOIN profiles p ON p.id = t.responsable_user_id
       LEFT JOIN features f ON f.id = t.feature_id
       LEFT JOIN sprints sp ON sp.id = t.sprint_id
       LEFT JOIN task_types tt ON tt.id = t.task_type_id
       LEFT JOIN deliverable_types dt ON dt.id = t.tipo_entregable_id
       LEFT JOIN departments dep ON dep.id = t.department_id
       LEFT JOIN profiles cb ON cb.id = t.created_by
       WHERE t.id = ?`,
      [taskId]
    );
    if (!row) return res.status(404).json({ error: 'Tarea no encontrada' });

    // Seguridad: verificar acceso antes de devolver la tarea (evita IDOR entre mesas/tenants)
    const allowed = await canAccessTask(req.userId!, String(taskId));
    if (!allowed) return res.status(403).json({ error: 'Sin acceso a esta tarea' });

    const respRows = await query<any[]>(
      `SELECT tr.user_id, p.nombre, p.avatar_url FROM task_responsables tr LEFT JOIN profiles p ON p.id = tr.user_id WHERE tr.task_id = ?`,
      [taskId]
    );
    const tdtRows = await query<any[]>(
      `SELECT tdt.tipo_entregable_id, dt.nombre, tdt.cantidad FROM task_deliverable_types tdt LEFT JOIN deliverable_types dt ON dt.id = tdt.tipo_entregable_id WHERE tdt.task_id = ?`,
      [taskId]
    );
    const readRow = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM task_reads WHERE task_id = ? AND user_id = ?`,
      [taskId, req.userId!]
    );
    const readCountRow = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM task_reads WHERE task_id = ?`,
      [taskId]
    );

    // C) Cambios/vueltas: de 'revision_cliente' -> lo pidió el CLIENTE; de revisión interna -> INTERNO.
    const cambiosRow = await queryOne<any>(
      `SELECT COALESCE(SUM(old_value = 'revision_cliente'), 0) AS cliente,
              COALESCE(SUM(old_value IN ('revision_interna','en_revision')), 0) AS internos
       FROM activity_log
       WHERE entity_type = 'task' AND entity_id = ? AND field_name = 'estado' AND new_value = 'en_proceso'`,
      [taskId]
    );
    // E) Tiempo por persona (desde las sesiones de tiempo).
    const tiempoPersona = await query<any[]>(
      `SELECT te.user_id, p.nombre, p.avatar_url, SUM(te.duration_seconds) AS segundos
       FROM time_entries te LEFT JOIN profiles p ON p.id = te.user_id
       WHERE te.task_id = ? AND te.status = 'completed'
       GROUP BY te.user_id, p.nombre, p.avatar_url
       HAVING segundos > 0 ORDER BY segundos DESC`,
      [taskId]
    );
    // B) Seguidores de la tarea.
    const seguidoresRows = await query<any[]>(
      `SELECT ts.user_id, p.nombre, p.avatar_url FROM task_seguidores ts
       LEFT JOIN profiles p ON p.id = ts.user_id WHERE ts.task_id = ? ORDER BY p.nombre`,
      [taskId]
    );
    const meSigue = req.userId ? seguidoresRows.some((r) => r.user_id === req.userId) : false;

    const task = {
      ...row,
      brands: row.brand_nombre ? { nombre: row.brand_nombre } : null,
      desks: row.desk_nombre ? { nombre: row.desk_nombre } : null,
      profiles: row.resp_nombre ? { nombre: row.resp_nombre, avatar_url: row.resp_avatar_url || null } : null,
      responsables: respRows.map((r: any) => ({ user_id: r.user_id, nombre: r.nombre, avatar_url: r.avatar_url || null })),
      feature: row.feature_name ? { name: row.feature_name } : null,
      sprint: row.sprint_name ? { name: row.sprint_name } : null,
      task_type: row.task_type_nombre ? { nombre: row.task_type_nombre } : null,
      deliverable_type: row.deliverable_type_nombre ? { nombre: row.deliverable_type_nombre } : null,
      deliverable_types_list: tdtRows.map((r: any) => ({ tipo_entregable_id: r.tipo_entregable_id, nombre: r.nombre, cantidad: r.cantidad })),
      created_by_profile: row.created_by_nombre ? { nombre: row.created_by_nombre, avatar_url: row.created_by_avatar_url || null } : null,
      created_by_rol: row.created_by_rol || null,
      is_read: Number(readRow?.cnt ?? 0) > 0,
      read_count: Number(readCountRow?.cnt ?? 0),
      cambios_cliente: Number(cambiosRow?.cliente ?? 0),
      cambios_internos: Number(cambiosRow?.internos ?? 0),
      tiempo_por_persona: tiempoPersona.map((r: any) => ({ user_id: r.user_id, nombre: r.nombre, avatar_url: r.avatar_url || null, segundos: Number(r.segundos || 0) })),
      seguidores: seguidoresRows.map((r: any) => ({ user_id: r.user_id, nombre: r.nombre, avatar_url: r.avatar_url || null })),
      me_sigue: meSigue,
    };
    res.json(task);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar tarea' });
  }
});

tasksRouter.post('/tasks', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos de tarea inválidos', details: parsed.error.flatten().fieldErrors });
    }
    const body = parsed.data;

    // Validate desk+brand compatibility if desk has brands assigned
    if (body.desk_id && body.brand_id) {
      const deskBrandCount = await queryOne<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM desk_brands WHERE desk_id = ?', [body.desk_id]
      );
      if (Number(deskBrandCount?.cnt) > 0) {
        const match = await queryOne<{ id: string }>(
          'SELECT id FROM desk_brands WHERE desk_id = ? AND brand_id = ?', [body.desk_id, body.brand_id]
        );
        if (!match) {
          return res.status(400).json({ error: 'La marca seleccionada no está asignada a esta mesa' });
        }
      }
    }

    const id = uuid();
    const enlaces = body.enlaces ? (Array.isArray(body.enlaces) ? JSON.stringify(body.enlaces) : body.enlaces) : null;
    // Support both single responsable_user_id and array responsable_ids
    const responsableIds: string[] = Array.isArray(body.responsable_ids) ? body.responsable_ids : (body.responsable_user_id ? [body.responsable_user_id] : []);
    const primaryResponsable = responsableIds[0] || null;

    await query(
      `INSERT INTO tasks (id, check_done, brand_id, desk_id, titulo_tarea, detalle, cantidad_entregables, responsable_user_id, departamento, department_id, project_id, folder_id, prioridad, estado, fecha_inicio, fecha_entrega, enlaces, sprint_id, story_points, feature_id, task_type_id, tipo_entregable_id, created_by, estimated_hours, recurrence_type, recurrence_interval, recurrence_end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, body.check_done ? 1 : 0, body.brand_id, body.desk_id || null, body.titulo_tarea, sinHtmlVacio(body.detalle) || null,
        body.cantidad_entregables ?? 1, primaryResponsable, body.departamento || null, body.department_id || null, body.project_id || null,
        body.folder_id || null,
        body.prioridad || 'media', body.estado || 'backlog', body.fecha_inicio || null, body.fecha_entrega,
        enlaces, body.sprint_id || null, body.story_points ?? null, body.feature_id || null, body.task_type_id || null, body.tipo_entregable_id || null, req.userId ?? null,
        body.estimated_hours ?? null, body.recurrence_type || 'none', body.recurrence_interval ?? null, body.recurrence_end_date || null
      ]
    );

    // Insert into task_responsables
    for (const uid of responsableIds) {
      await query('INSERT IGNORE INTO task_responsables (id, task_id, user_id) VALUES (?, ?, ?)', [uuid(), id, uid]);
    }

    // Primer registro de history por departamento (si hay)
    if (body.department_id) {
      await query(
        'INSERT INTO task_department_history (id, task_id, department_id, responsable_user_id) VALUES (?, ?, ?, ?)',
        [uuid(), id, body.department_id, primaryResponsable]
      ).catch((e) => console.error('[TASKS] history insert (create):', e));
    }

    // Insert deliverable types (multi-type support)
    if (Array.isArray(body.entregables) && body.entregables.length > 0) {
      for (const ent of body.entregables) {
        await query(
          'INSERT INTO task_deliverable_types (id, task_id, tipo_entregable_id, cantidad) VALUES (?, ?, ?, ?)',
          [uuid(), id, ent.tipo_entregable_id, ent.cantidad]
        );
      }
    } else if (body.tipo_entregable_id) {
      await query(
        'INSERT INTO task_deliverable_types (id, task_id, tipo_entregable_id, cantidad) VALUES (?, ?, ?, ?)',
        [uuid(), id, body.tipo_entregable_id, body.cantidad_entregables ?? 1]
      );
    }

    // Notify each assignee and auto-sync to their Google Calendar
    const titulo: string = asString(body.titulo_tarea) || 'Tarea';
    for (const uid of responsableIds) {
      if (uid && uid !== req.userId) {
        notifyUser(uid, `Se te asignó la tarea: ${titulo}`, id);
      }
      if (uid) {
        autoSyncTaskToCalendar(uid, id).catch(() => {});
      }
    }

    const row = await queryOne<any>(`SELECT t.*, b.nombre as brand_nombre, d.nombre as desk_nombre, dep.nombre AS department_nombre, dep.color AS department_color FROM tasks t LEFT JOIN brands b ON b.id = t.brand_id LEFT JOIN desks d ON d.id = t.desk_id LEFT JOIN departments dep ON dep.id = t.department_id WHERE t.id = ?`, [id]);
    res.status(201).json({ ...row, brands: row?.brand_nombre ? { nombre: row.brand_nombre } : null, desks: row?.desk_nombre ? { nombre: row.desk_nombre } : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear tarea' });
  }
});

tasksRouter.patch('/tasks/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const body = req.body;
    const role = await getUserRole(req.userId!);

    const oldRow = await queryOne<any>('SELECT * FROM tasks WHERE id = ?', [id]);
    const onlyFavorite = Object.keys(body).length === 1 && body.is_favorite !== undefined;

    // Tasks created by admin or ejecutivo are protected: only admin or the creator can edit
    let creatorRole: string | null = null;
    if (oldRow?.created_by) {
      creatorRole = await getUserRole(oldRow.created_by);
    }
    const isProtected = creatorRole === 'admin' || creatorRole === 'ejecutivo';

    // Fields that equipo can always change on assigned tasks (even protected ones)
    const operationalFields = new Set(['estado', 'timer_activo', 'timer_inicio', 'tiempo_trabajado', 'tiempo_trabajado_delta', 'check_done', 'is_favorite']);
    const bodyKeys = Object.keys(body);
    const onlyOperational = bodyKeys.every(k => operationalFields.has(k));

    const isResponsable = oldRow?.responsable_user_id === req.userId;
    const isInResponsables = await queryOne<{ n: number }>(
      'SELECT 1 as n FROM task_responsables WHERE task_id = ? AND user_id = ? LIMIT 1',
      [id, req.userId!]
    );
    const isAssigned = isResponsable || !!isInResponsables;

    // Acceso a la tarea por mesa/asignacion (mismo criterio que para verla)
    const hasAccess = await canAccessTask(req.userId!, id);

    let allowed = false;
    if (role === 'admin') {
      allowed = true;
    } else if (role === 'ejecutivo') {
      // Un ejecutivo edita cualquier tarea de su mesa (o asignada/creada por el),
      // no solo las que creo el mismo. Antes una tarea "protegida" bloqueaba a los demas ejecutivos.
      allowed = hasAccess;
    } else if (role === 'equipo') {
      if (isAssigned) {
        // Asignado: edita todo (en protegidas, solo campos operativos: el jefe define, el equipo ejecuta)
        allowed = isProtected ? (onlyOperational || onlyFavorite) : true;
      } else if (hasAccess) {
        // Companero de mesa no asignado: puede hacer acciones operativas (timer, estado, hecho, favorito)
        allowed = onlyOperational || onlyFavorite;
      }
    }
    if (!allowed) {
      console.log('[PATCH TASK] DENIED', { id, role, userId: req.userId, bodyKeys, onlyOperational, isAssigned, isProtected, creatorRole, responsable: oldRow?.responsable_user_id });
      return res.status(403).json({ error: 'Sin permisos' });
    }

    // Auto-play: al iniciar el timer, si la tarea sigue en "backlog" (pendiente),
    // pasa sola a "en_proceso" (antes le daban play y no actualizaban el estado).
    if ((body.timer_activo === true || body.timer_activo === 1) && oldRow?.estado === 'backlog' && body.estado === undefined) {
      body.estado = 'en_proceso';
    }

    // ── Reschedule: si cambia fecha_entrega, exigir motivo ──────────────────
    const MOTIVOS_RESCHEDULE = ['INTERNO', 'CLIENTE', 'ALCANCE', 'FUERZA_MAYOR', 'SIN_CLASIFICAR'];
    let rescheduleInfo: { oldFecha: string | null; newFecha: string | null; motivo: string; comentario: string | null } | null = null;
    if (body.fecha_entrega !== undefined && oldRow) {
      const normOld = oldRow.fecha_entrega ? new Date(oldRow.fecha_entrega).toISOString().slice(0, 10) : null;
      const normNew = body.fecha_entrega ? String(body.fecha_entrega).slice(0, 10) : null;
      if (normOld !== normNew) {
        const motivo = String(body.motivo_reschedule || '').toUpperCase();
        if (!MOTIVOS_RESCHEDULE.includes(motivo)) {
          return res.status(400).json({ error: 'Debes indicar el motivo del cambio de fecha (motivo_reschedule)' });
        }
        rescheduleInfo = {
          oldFecha: normOld,
          newFecha: normNew,
          motivo,
          comentario: typeof body.comentario_reschedule === 'string' && body.comentario_reschedule.trim()
            ? body.comentario_reschedule.trim().slice(0, 500) : null,
        };
      }
    }

    // Tareas de tablero cliente: si se setea fecha interna y el cliente aún no tiene
    // fecha visible, sincronizar fecha_cliente para que su tablero no quede sin "Entrega".
    if (body.fecha_entrega !== undefined && body.fecha_cliente === undefined && oldRow?.client_board_id && !oldRow?.fecha_cliente) {
      body.fecha_cliente = body.fecha_entrega;
    }

    if (body.detalle !== undefined) body.detalle = sinHtmlVacio(body.detalle);

    const fields: string[] = [];
    const values: any[] = [];
    const map: Record<string, string> = {
      check_done: 'check_done', brand_id: 'brand_id', desk_id: 'desk_id', titulo_tarea: 'titulo_tarea',
      detalle: 'detalle', cantidad_entregables: 'cantidad_entregables', responsable_user_id: 'responsable_user_id',
      departamento: 'departamento', department_id: 'department_id', project_id: 'project_id', prioridad: 'prioridad', estado: 'estado', fecha_inicio: 'fecha_inicio',
      fecha_entrega: 'fecha_entrega', fecha_cliente: 'fecha_cliente', cliente_visible: 'cliente_visible', enlaces: 'enlaces', estado_envio: 'estado_envio',
      tiempo_trabajado: 'tiempo_trabajado', timer_activo: 'timer_activo', timer_inicio: 'timer_inicio',
      sprint_id: 'sprint_id', story_points: 'story_points', feature_id: 'feature_id',
      task_type_id: 'task_type_id', tipo_entregable_id: 'tipo_entregable_id', is_favorite: 'is_favorite', sort_order: 'sort_order',
      folder_id: 'folder_id',
      estimated_hours: 'estimated_hours', recurrence_type: 'recurrence_type',
      recurrence_interval: 'recurrence_interval', recurrence_end_date: 'recurrence_end_date',
    };

    for (const [k, col] of Object.entries(map)) {
      if (body[k] !== undefined) {
        if (k === 'enlaces') {
          fields.push(`${col} = ?`);
          values.push(Array.isArray(body[k]) ? JSON.stringify(body[k]) : body[k]);
        } else if (['check_done', 'timer_activo', 'is_favorite', 'cliente_visible'].includes(k)) {
          fields.push(`${col} = ?`);
          values.push(body[k] ? 1 : 0);
        } else if (k === 'timer_inicio' && body[k] != null) {
          const d = new Date(body[k] as string);
          fields.push(`${col} = ?`);
          values.push(isNaN(d.getTime()) ? body[k] : d.toISOString().slice(0, 19).replace('T', ' '));
        } else {
          fields.push(`${col} = ?`);
          values.push(body[k]);
        }
      }
    }
    // Contador de ajustes: suma cada vez que la tarea ENTRA al estado "ajustes"
    // (la reactivaron con correcciones). Lo decide el server mirando el estado viejo.
    if (body.estado === 'ajustes' && oldRow?.estado !== 'ajustes') {
      fields.unshift('ajustes_count = ajustes_count + 1');
    }

    // ── Timer idempotente y autoritativo (bug "se remarca") ────────────────
    // La UI puede quedar desincronizada (pestana vieja, panel sin refrescar) y
    // mandar pausas repetidas o deltas inflados. El SERVER decide:
    //   - pausa con tarea ACTIVA: delta real = now - timer_inicio; se usa
    //     min(delta_cliente, delta_real) para respetar "pausar sin sumar" (0).
    //   - pausa con tarea YA PAUSADA: no se suma nada (multi-clic inofensivo).
    //   - reset explicito (tiempo_trabajado=0): se respeta.
    //   - doble play con tarea ya activa: NO resetea timer_inicio.
    {
      const wasActive = Number(oldRow?.timer_activo) === 1;
      const pausing = body.timer_activo === false || body.timer_activo === 0;
      const starting = body.timer_activo === true || body.timer_activo === 1;
      const isReset = body.tiempo_trabajado === 0;

      if (starting && wasActive) {
        delete body.timer_inicio; // doble play: conservar el inicio real del tramo
      }

      let deltaFinal: number | null = null;
      if (pausing && !isReset) {
        delete body.tiempo_trabajado; // en pausas manda el server, no numeros absolutos del cliente
        if (wasActive && oldRow?.timer_inicio) {
          const realSecs = Math.max(0, Math.floor((Date.now() - new Date(oldRow.timer_inicio).getTime()) / 1000));
          const clientDelta = Number.isFinite(Number(body.tiempo_trabajado_delta)) ? Math.max(0, Number(body.tiempo_trabajado_delta)) : Infinity;
          deltaFinal = Math.min(realSecs, clientDelta, 43200);
        } else {
          deltaFinal = 0; // ya estaba pausada: idempotente
        }
        delete body.tiempo_trabajado_delta;
      } else if (body.tiempo_trabajado_delta !== undefined) {
        const d = Number(body.tiempo_trabajado_delta);
        if (Number.isFinite(d)) deltaFinal = Math.max(-43200, Math.min(43200, Math.round(d)));
        delete body.tiempo_trabajado_delta;
      }

      if (deltaFinal !== null && deltaFinal !== 0) {
        fields.push('tiempo_trabajado = GREATEST(0, tiempo_trabajado + ?)');
        values.push(deltaFinal);
      }
    }

    // Permitimos PATCH solo con responsable_ids/entregables (sin otros fields del map)
    const hasOtherFields = fields.length > 0;
    const hasResponsableIds = Array.isArray(body.responsable_ids);
    const hasEntregables = Array.isArray(body.entregables);
    if (!hasOtherFields && !hasResponsableIds && !hasEntregables) {
      return res.status(400).json({ error: 'Sin campos para actualizar' });
    }

    if (hasOtherFields) {
      values.push(id);
      await query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    // Registrar el reschedule (después de aplicar el UPDATE)
    if (rescheduleInfo) {
      await query(
        'INSERT INTO task_reschedules (id, task_id, fecha_anterior, fecha_nueva, motivo, comentario, changed_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), id, rescheduleInfo.oldFecha, rescheduleInfo.newFecha, rescheduleInfo.motivo, rescheduleInfo.comentario, req.userId]
      );
    }

    // History de departamento: si cambio department_id, cerrar el registro
    // actual abierto (set exited_at) y abrir uno nuevo con el nuevo depto.
    if (body.department_id !== undefined && body.department_id !== oldRow?.department_id) {
      try {
        await query(
          'UPDATE task_department_history SET exited_at = NOW(3) WHERE task_id = ? AND exited_at IS NULL',
          [id]
        );
        if (body.department_id) {
          const respForHistory = Array.isArray(body.responsable_ids) && body.responsable_ids.length > 0
            ? body.responsable_ids[0]
            : (body.responsable_user_id !== undefined ? body.responsable_user_id : oldRow?.responsable_user_id);
          await query(
            'INSERT INTO task_department_history (id, task_id, department_id, responsable_user_id) VALUES (?, ?, ?, ?)',
            [uuid(), id, body.department_id, respForHistory || null]
          );
        }
      } catch (e) {
        console.error('[TASKS] history hook (patch):', e);
      }
    }

    // Handle multiple responsables
    if (Array.isArray(body.responsable_ids)) {
      await query('DELETE FROM task_responsables WHERE task_id = ?', [id]);
      for (const uid of body.responsable_ids) {
        await query('INSERT IGNORE INTO task_responsables (id, task_id, user_id) VALUES (?, ?, ?)', [uuid(), id, uid]);
      }
      // Keep responsable_user_id in sync with first responsable
      const primary = body.responsable_ids[0] || null;
      await query('UPDATE tasks SET responsable_user_id = ? WHERE id = ?', [primary, id]);
      // Notify NEW assignees: in-app + email + Google Calendar sync.
      // Solo mandamos email/notif a los que NO estaban antes.
      const tituloNotif: string = asString(oldRow?.titulo_tarea) || 'Tarea';
      const oldRespRows = await query<{ user_id: string }[]>(
        // Old responsables snapshot (antes del DELETE de arriba ya no existen, así que comparamos contra la primera lectura)
        'SELECT 1 as n', []
      );
      // Obtener old responsables del oldRow + tabla legacy: usamos la lista que existía ANTES del PATCH.
      // En este punto la tabla ya fue actualizada, así que reconstruimos los old desde oldRow.responsable_user_id
      // y de un snapshot que tomamos al inicio (TODO: si se necesita lista completa pre-PATCH, leer al principio).
      const oldRespSet = new Set<string>();
      if (oldRow?.responsable_user_id) oldRespSet.add(String(oldRow.responsable_user_id));

      for (const uid of body.responsable_ids) {
        const uidStr: string = asString(uid);
        if (!uidStr) continue;
        const isNew = !oldRespSet.has(uidStr);
        if (uidStr !== req.userId) {
          // Notif in-app siempre (al menos para nuevos)
          if (isNew) notifyUser(uidStr, `Se te asignó la tarea: ${tituloNotif}`, id);
        }
        autoSyncTaskToCalendar(uidStr, id).catch(() => {});

        // Email solo a nuevos asignados (no al autor, no a quien ya estaba)
        if (isNew && uidStr !== req.userId) {
          sendTaskAssignmentEmailFor(uidStr, id).catch((e) => console.error('[PATCH TASK] email fail:', e));
        }
      }
    }

    // Handle multiple deliverable types
    if (Array.isArray(body.entregables)) {
      await query('DELETE FROM task_deliverable_types WHERE task_id = ?', [id]);
      for (const ent of body.entregables) {
        if (ent.tipo_entregable_id) {
          await query(
            'INSERT INTO task_deliverable_types (id, task_id, tipo_entregable_id, cantidad) VALUES (?, ?, ?, ?)',
            [uuid(), id, ent.tipo_entregable_id, ent.cantidad || 1]
          );
        }
      }
      // Keep legacy columns in sync with first entry
      if (body.entregables.length > 0 && body.entregables[0].tipo_entregable_id) {
        await query('UPDATE tasks SET tipo_entregable_id = ?, cantidad_entregables = ? WHERE id = ?',
          [body.entregables[0].tipo_entregable_id, body.entregables[0].cantidad || 1, id]);
      }
    }

    // If only responsable_user_id was updated (single), notif + email + auto-sync
    if (body.responsable_user_id !== undefined && !Array.isArray(body.responsable_ids)) {
      const singleResp: string = asString(body.responsable_user_id);
      if (singleResp) {
        autoSyncTaskToCalendar(singleResp, id).catch(() => {});
        const wasAlreadyAssigned = String(oldRow?.responsable_user_id || '') === singleResp;
        if (!wasAlreadyAssigned && singleResp !== req.userId) {
          const tituloNotif2: string = asString(oldRow?.titulo_tarea) || 'Tarea';
          notifyUser(singleResp, `Se te asignó la tarea: ${tituloNotif2}`, id);
          sendTaskAssignmentEmailFor(singleResp, id).catch((e) => console.error('[PATCH TASK] email single fail:', e));
        }
      }
    }

    // Notify author when status or check_done changes (assignee finished or changed status)
    const estadoChanged = body.estado !== undefined && oldRow?.estado !== body.estado;
    const checkDoneChanged = body.check_done !== undefined && Number(oldRow?.check_done) !== (body.check_done ? 1 : 0);
    const authorId: string = asString(oldRow?.created_by);
    if ((estadoChanged || checkDoneChanged) && authorId && authorId !== req.userId) {
      const tituloNotif: string = asString(oldRow?.titulo_tarea) || 'Tarea';
      if (checkDoneChanged && body.check_done) {
        notifyUser(authorId, `La tarea "${tituloNotif}" fue marcada como terminada`, id);
      } else if (estadoChanged) {
        const estadoStr: string = asString(body.estado);
        notifyUser(authorId, `La tarea "${tituloNotif}" cambió a estado: ${estadoStr}`, id);
      }
    }
    // Avisar a los seguidores de la tarea cuando cambia de estado.
    if (estadoChanged) {
      const tituloSeg: string = asString(oldRow?.titulo_tarea) || 'Tarea';
      notifySeguidores(id, `La tarea que sigues "${tituloSeg}" cambió a estado: ${asString(body.estado)}`, req.userId).catch(() => {});
    }

    // If only responsable_user_id was updated (single assignee change), notify new assignee
    const newRespId: string = asString(body.responsable_user_id);
    if (body.responsable_user_id !== undefined && !Array.isArray(body.responsable_ids) && oldRow?.responsable_user_id !== newRespId && newRespId && newRespId !== req.userId) {
      const tituloNotif: string = asString(oldRow?.titulo_tarea) || 'Tarea';
      notifyUser(newRespId, `Se te asignó la tarea: ${tituloNotif}`, id);
    }

    // Recurrence: spawn next instance when a recurring task is completed
    const isNowCompleted = (
      (body.check_done === true && !Number(oldRow?.check_done)) ||
      (body.estado === 'entregado' && oldRow?.estado !== 'entregado')
    );
    const recurrenceType = oldRow?.recurrence_type;
    let recurrenceSpawned = false;
    if (isNowCompleted && recurrenceType && recurrenceType !== 'none') {
      recurrenceSpawned = true;
      spawnNextRecurrence(oldRow, req.userId!).catch((e) => console.error('[Recurrence] Error spawning next:', e));
    }

    // Log changes
    if (oldRow) {
      const changeData: Record<string, any> = {};
      for (const [k] of Object.entries(map)) {
        if (body[k] !== undefined) changeData[k] = body[k];
      }
      logTaskChanges(String(id), oldRow, changeData, req.userId!).catch(() => {});
    }

    res.json({ success: true, recurrence_spawned: recurrenceSpawned });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar tarea' });
  }
});

// ========== TASK READS ==========
tasksRouter.post('/tasks/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const taskId = String(req.params.id);
    const userId = req.userId!;
    const id = uuid();
    await query(
      `INSERT IGNORE INTO task_reads (id, task_id, user_id, read_at) VALUES (?, ?, ?, NOW())`,
      [id, taskId, userId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al registrar lectura' });
  }
});

tasksRouter.get('/tasks/:id/reads', requireAuth, async (req: AuthRequest, res) => {
  try {
    const taskId = String(req.params.id);
    const rows = await query<any[]>(
      `SELECT tr.user_id, tr.read_at, p.nombre, p.avatar_url
       FROM task_reads tr
       LEFT JOIN profiles p ON p.id = tr.user_id
       WHERE tr.task_id = ?
       ORDER BY tr.read_at DESC`,
      [taskId]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar lecturas' });
  }
});

// ========== SUBTASKS ==========
// POST /tasks/:id/handoff — pasar una tarea al siguiente departamento (handoff de etapa)
// POST /tasks/:id/seguir — seguir manualmente una tarea
tasksRouter.post('/tasks/:id/seguir', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    if (!(await canAccessTask(req.userId!, id))) return res.status(403).json({ error: 'Sin acceso a esta tarea' });
    await query('INSERT IGNORE INTO task_seguidores (id, task_id, user_id, motivo) VALUES (?, ?, ?, ?)', [uuid(), id, req.userId, 'manual']);
    res.json({ ok: true, siguiendo: true });
  } catch (e) {
    console.error('[TASKS] seguir error:', e);
    res.status(500).json({ error: 'Error al seguir la tarea' });
  }
});

// DELETE /tasks/:id/seguir — dejar de seguir
tasksRouter.delete('/tasks/:id/seguir', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    await query('DELETE FROM task_seguidores WHERE task_id = ? AND user_id = ?', [id, req.userId]);
    res.json({ ok: true, siguiendo: false });
  } catch (e) {
    console.error('[TASKS] dejar de seguir error:', e);
    res.status(500).json({ error: 'Error al dejar de seguir la tarea' });
  }
});

tasksRouter.post('/tasks/:id/handoff', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const src = await queryOne<any>(
      `SELECT t.*, b.nombre AS brand_nombre, dep.nombre AS department_nombre
       FROM tasks t
       LEFT JOIN brands b ON b.id = t.brand_id
       LEFT JOIN departments dep ON dep.id = t.department_id
       WHERE t.id = ?`,
      [id]
    );
    if (!src) return res.status(404).json({ error: 'Tarea no encontrada' });

    const canAccess = await canAccessTask(req.userId!, id);
    if (!canAccess) return res.status(403).json({ error: 'Sin acceso a esta tarea' });

    const toDeptId = asString(req.body?.to_department_id);
    if (!toDeptId) return res.status(400).json({ error: 'to_department_id requerido' });

    const toDept = await queryOne<any>('SELECT id, nombre FROM departments WHERE id = ? AND activo = 1', [toDeptId]);
    if (!toDept) return res.status(400).json({ error: 'Departamento destino inválido o inactivo' });

    const respIds: string[] = Array.isArray(req.body?.to_responsable_ids)
      ? req.body.to_responsable_ids.filter((x: unknown) => typeof x === 'string' && x.length > 0)
      : [];
    const primaryResp = respIds[0] || null;
    const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim().slice(0, 1000) : null;
    const dueDate = typeof req.body?.due_date === 'string' && req.body.due_date ? req.body.due_date : null;
    const createNew = req.body?.create_new_task === true;

    // Si al pasar la tarea se cambia la fecha de entrega, exigir motivo y registrarlo
    // (mismo criterio que PATCH /tasks/:id). Antes se movia la vara del cumplimiento sin registro.
    const MOTIVOS_RESCHEDULE_HANDOFF = ['INTERNO', 'CLIENTE', 'ALCANCE', 'FUERZA_MAYOR', 'SIN_CLASIFICAR'];
    let handoffReschedule: { oldFecha: string | null; newFecha: string; motivo: string; comentario: string | null } | null = null;
    if (!createNew && dueDate) {
      const normOld = src.fecha_entrega ? new Date(src.fecha_entrega).toISOString().slice(0, 10) : null;
      const normNew = String(dueDate).slice(0, 10);
      if (normOld !== normNew) {
        const mr = String(req.body?.motivo_reschedule || '').toUpperCase();
        if (!MOTIVOS_RESCHEDULE_HANDOFF.includes(mr)) {
          return res.status(400).json({ error: 'Debes indicar el motivo del cambio de fecha (motivo_reschedule)' });
        }
        handoffReschedule = {
          oldFecha: normOld,
          newFecha: normNew,
          motivo: mr,
          comentario: typeof req.body?.comentario_reschedule === 'string' && req.body.comentario_reschedule.trim()
            ? req.body.comentario_reschedule.trim().slice(0, 500) : null,
        };
      }
    }

    const fromDeptId = src.department_id || null;
    const fromResp = src.responsable_user_id || null;
    let targetTaskId: string | null = null;

    // D) Pausar el timer de quien tenía la tarea y cerrar su sesión, para que
    //    el tiempo no se le cuente a quien la recibe (cada quien con su tiempo).
    if (!createNew) {
      if (src.timer_activo && src.timer_inicio) {
        const startMs = new Date(src.timer_inicio).getTime();
        const elapsed = Math.max(0, Math.min(12 * 3600, Math.floor((Date.now() - startMs) / 1000)));
        await query('UPDATE tasks SET tiempo_trabajado = tiempo_trabajado + ?, timer_activo = 0, timer_inicio = NULL WHERE id = ?', [elapsed, id]);
      } else if (src.timer_activo) {
        await query('UPDATE tasks SET timer_activo = 0, timer_inicio = NULL WHERE id = ?', [id]);
      }
      await query(
        `UPDATE time_entries
           SET end_time = NOW(), status = 'completed',
               duration_seconds = GREATEST(0, TIMESTAMPDIFF(SECOND, start_time, NOW()) - COALESCE(idle_seconds, 0))
         WHERE task_id = ? AND status IN ('active','paused')`,
        [id]
      );

      // B) Seguidores: quien la pasa (y responsables previos) la siguen viendo.
      const seguidores = new Set<string>();
      if (fromResp) seguidores.add(fromResp);
      const prevResps = await query<{ user_id: string }[]>('SELECT user_id FROM task_responsables WHERE task_id = ?', [id]);
      for (const r of prevResps) if (r.user_id) seguidores.add(r.user_id);
      for (const nid of respIds) seguidores.delete(nid); // los nuevos responsables no son "seguidores"
      for (const sid of seguidores) {
        await query('INSERT IGNORE INTO task_seguidores (id, task_id, user_id, motivo) VALUES (?, ?, ?, ?)', [uuid(), id, sid, 'handoff']);
      }
    }

    if (createNew) {
      // Crear una tarea nueva relacionada en el nuevo departamento
      const newId = uuid();
      await query(
        `INSERT INTO tasks (id, check_done, brand_id, desk_id, titulo_tarea, detalle, cantidad_entregables,
          responsable_user_id, departamento, department_id, prioridad, estado, fecha_inicio, fecha_entrega,
          enlaces, task_type_id, created_by)
         VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'backlog', ?, ?, ?, ?, ?)`,
        [
          newId, src.brand_id, src.desk_id, src.titulo_tarea, src.detalle, src.cantidad_entregables ?? 1,
          primaryResp, toDept.nombre, toDeptId, src.prioridad || 'media',
          src.fecha_inicio || null, dueDate || src.fecha_entrega, src.enlaces, src.task_type_id || null, req.userId ?? null,
        ]
      );
      for (const uid of respIds) {
        await query('INSERT IGNORE INTO task_responsables (id, task_id, user_id) VALUES (?, ?, ?)', [uuid(), newId, uid]);
      }
      await query(
        'INSERT INTO task_department_history (id, task_id, department_id, responsable_user_id) VALUES (?, ?, ?, ?)',
        [uuid(), newId, toDeptId, primaryResp]
      );
      targetTaskId = newId;
    } else {
      // Pasar la MISMA tarea: cambiar departamento + responsables
      const updates: string[] = ['department_id = ?'];
      const vals: unknown[] = [toDeptId];
      if (primaryResp) { updates.push('responsable_user_id = ?'); vals.push(primaryResp); }
      if (dueDate) { updates.push('fecha_entrega = ?'); vals.push(dueDate); }
      vals.push(id);
      await query(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, vals);

      if (respIds.length > 0) {
        await query('DELETE FROM task_responsables WHERE task_id = ?', [id]);
        for (const uid of respIds) {
          await query('INSERT IGNORE INTO task_responsables (id, task_id, user_id) VALUES (?, ?, ?)', [uuid(), id, uid]);
        }
      }
      // Cerrar history actual y abrir nuevo
      await query('UPDATE task_department_history SET exited_at = NOW(3) WHERE task_id = ? AND exited_at IS NULL', [id]);
      await query(
        'INSERT INTO task_department_history (id, task_id, department_id, responsable_user_id) VALUES (?, ?, ?, ?)',
        [uuid(), id, toDeptId, primaryResp]
      );
    }

    // Registrar el reagendamiento (si el handoff movio la fecha de entrega)
    if (handoffReschedule) {
      await query(
        'INSERT INTO task_reschedules (id, task_id, fecha_anterior, fecha_nueva, motivo, comentario, changed_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), id, handoffReschedule.oldFecha, handoffReschedule.newFecha, handoffReschedule.motivo, handoffReschedule.comentario, req.userId]
      );
    }

    // Registro del handoff
    await query(
      `INSERT INTO task_handoffs (id, source_task_id, target_task_id, from_department_id, to_department_id,
        from_responsable_id, to_responsable_id, motivo, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), id, targetTaskId, fromDeptId, toDeptId, fromResp, primaryResp, motivo, req.userId ?? null]
    );

    // Actividad
    await logActivity('task', id, 'handoff', 'department_id', src.department_nombre || null, toDept.nombre, req.userId ?? null).catch(() => {});

    // Notificar + email a los nuevos responsables
    const notifyTaskId = targetTaskId || id;
    const frontendUrl = process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec';
    let fromRespNombre: string | null = null;
    if (fromResp) {
      const fr = await queryOne<{ nombre: string }>('SELECT nombre FROM profiles WHERE id = ?', [fromResp]);
      fromRespNombre = fr?.nombre || null;
    }
    for (const uid of respIds) {
      notifyUser(uid, `Te pasaron una tarea a ${toDept.nombre}: ${src.titulo_tarea}`, notifyTaskId);
      try {
        const u = await queryOne<{ email: string; nombre: string }>('SELECT email, nombre FROM profiles WHERE id = ?', [uid]);
        if (u?.email && (process.env.MAILGUN_API_KEY || process.env.SMTP_PASS)) {
          const emailData = await taskHandoffEmail({
            recipientName: u.nombre || 'Usuario',
            taskTitle: String(src.titulo_tarea || 'Tarea'),
            brandName: String(src.brand_nombre || 'Sin marca'),
            fromDepartment: src.department_nombre || null,
            toDepartment: toDept.nombre,
            fromResponsable: fromRespNombre,
            motivo,
            fechaEntrega: (dueDate || src.fecha_entrega) ? new Date(dueDate || src.fecha_entrega).toISOString().slice(0, 10) : null,
            frontendUrl,
            taskId: notifyTaskId,
          });
          emailData.to = u.email;
          await sendEmail(emailData);
        }
      } catch (e) {
        console.error('[HANDOFF EMAIL] error:', e);
      }
    }

    res.status(201).json({ ok: true, target_task_id: targetTaskId, same_task: !createNew });
  } catch (e) {
    console.error('[TASKS] handoff error:', e);
    res.status(500).json({ error: 'Error al pasar la tarea de etapa' });
  }
});

tasksRouter.get('/tasks/:id/subtasks', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    if (!(await canAccessTask(req.userId!, String(id)))) return res.status(403).json({ error: 'Sin acceso a esta tarea' });
    const rows = await query<any[]>(
      `SELECT t.*, b.nombre as brand_nombre, p.nombre as resp_nombre, p.avatar_url as resp_avatar_url,
              d.nombre as department_nombre, d.color as department_color
       FROM tasks t
       LEFT JOIN brands b ON b.id = t.brand_id
       LEFT JOIN profiles p ON p.id = t.responsable_user_id
       LEFT JOIN departments d ON d.id = t.department_id
       WHERE t.parent_task_id = ? ORDER BY t.sort_order ASC, t.created_at ASC`,
      [id]
    );

    // Cargar responsables múltiples (task_responsables) para todas las subtareas en una sola query
    const subIds = rows.map((r: any) => r.id);
    const respMap: Record<string, { user_id: string; nombre: string; avatar_url: string | null }[]> = {};
    if (subIds.length > 0) {
      const ph = subIds.map(() => '?').join(',');
      const respRows = await query<any[]>(
        `SELECT tr.task_id, tr.user_id, p.nombre, p.avatar_url
         FROM task_responsables tr
         LEFT JOIN profiles p ON p.id = tr.user_id
         WHERE tr.task_id IN (${ph})`,
        subIds
      );
      for (const r of respRows) {
        if (!respMap[r.task_id]) respMap[r.task_id] = [];
        respMap[r.task_id].push({ user_id: r.user_id, nombre: r.nombre, avatar_url: r.avatar_url || null });
      }
    }

    const subtasks = rows.map((r: any) => ({
      ...r,
      brands: r.brand_nombre ? { nombre: r.brand_nombre } : null,
      profiles: r.resp_nombre ? { nombre: r.resp_nombre, avatar_url: r.resp_avatar_url || null } : null,
      responsables: respMap[r.id] || [],
    }));
    res.json(subtasks);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar subtareas' });
  }
});

tasksRouter.post('/tasks/:id/subtasks', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const parentId = req.params.id;
    if (!(await canAccessTask(req.userId!, String(parentId)))) return res.status(403).json({ error: 'Sin acceso a esta tarea' });
    const parent = await queryOne<any>('SELECT brand_id, desk_id, fecha_entrega, department_id, departamento, project_id, task_type_id FROM tasks WHERE id = ?', [parentId]);
    if (!parent) return res.status(404).json({ error: 'Tarea padre no encontrada' });

    const body = req.body;
    const id = uuid();
    const fechaEntrega = body.fecha_entrega || parent.fecha_entrega || new Date().toISOString().slice(0, 10);
    const responsableId = body.responsable_user_id || null;
    // La subtarea hereda la estructura del padre (departamento/proyecto/tipo) para
    // que las fases de una campana mantengan el mismo contexto y colores.
    await query(
      `INSERT INTO tasks (id, parent_task_id, brand_id, desk_id, titulo_tarea, detalle, prioridad, estado, fecha_entrega, responsable_user_id, department_id, departamento, project_id, task_type_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, parentId, parent.brand_id, parent.desk_id, body.titulo_tarea, body.detalle || null, body.prioridad || 'media', 'backlog', fechaEntrega, responsableId, parent.department_id || null, parent.departamento || null, parent.project_id || null, parent.task_type_id || null, req.userId ?? null]
    );
    const rid: string = asString(responsableId);
    if (rid && rid !== req.userId) {
      const subtaskTitle: string = asString(body.titulo_tarea) || 'Subtarea';
      notifyUser(rid, `Se te asignó la subtarea: ${subtaskTitle}`, id);
    }
    logActivity('task', id, 'create', null, null, body.titulo_tarea, req.userId!).catch(() => {});
    const row = await queryOne<any>('SELECT * FROM tasks WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear subtarea' });
  }
});

// DELETE subtarea (solo subtareas, no tareas padre)
tasksRouter.delete('/tasks/:id/subtasks/:subId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id, subId } = req.params;
    if (!(await canAccessTask(req.userId!, String(id)))) return res.status(403).json({ error: 'Sin acceso a esta tarea' });
    // Verificar que la subtarea pertenezca al padre
    const sub = await queryOne<any>('SELECT id, parent_task_id, titulo_tarea FROM tasks WHERE id = ? AND parent_task_id = ?', [subId, id]);
    if (!sub) return res.status(404).json({ error: 'Subtarea no encontrada' });
    await query('DELETE FROM tasks WHERE id = ? AND parent_task_id = ?', [subId, id]);
    logActivity("task", String(subId), 'delete', null, sub.titulo_tarea, null, req.userId!).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar subtarea' });
  }
});

// PATCH reorder subtareas: body { ordered_ids: string[] }
tasksRouter.patch('/tasks/:id/subtasks/reorder', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id: parentId } = req.params;
    if (!(await canAccessTask(req.userId!, String(parentId)))) return res.status(403).json({ error: 'Sin acceso a esta tarea' });
    const ids = Array.isArray(req.body?.ordered_ids) ? req.body.ordered_ids.filter((x: unknown) => typeof x === 'string') : [];
    if (ids.length === 0) return res.status(400).json({ error: 'ordered_ids requerido' });
    // Update cada id con su posición
    for (let i = 0; i < ids.length; i++) {
      await query('UPDATE tasks SET sort_order = ? WHERE id = ? AND parent_task_id = ?', [String(i), ids[i], parentId]);
    }
    res.json({ ok: true, count: ids.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al reordenar subtareas' });
  }
});

// ========== DEPENDENCIES ==========
tasksRouter.get('/tasks/:id/dependencies', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    if (!(await canAccessTask(req.userId!, String(id)))) return res.status(403).json({ error: 'Sin acceso a esta tarea' });
    const rows = await query<any[]>(
      `SELECT td.*, t.titulo_tarea, t.estado
       FROM task_dependencies td
       JOIN tasks t ON t.id = td.depends_on_task_id
       WHERE td.task_id = ?
       UNION ALL
       SELECT td.*, t.titulo_tarea, t.estado
       FROM task_dependencies td
       JOIN tasks t ON t.id = td.task_id
       WHERE td.depends_on_task_id = ?`,
      [id, id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar dependencias' });
  }
});

tasksRouter.post('/tasks/:id/dependencies', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const taskId = req.params.id;
    const { depends_on_task_id, dependency_type } = req.body;
    if (!depends_on_task_id) return res.status(400).json({ error: 'depends_on_task_id requerido' });
    if (taskId === depends_on_task_id) return res.status(400).json({ error: 'No se puede depender de sí misma' });
    if (!(await canAccessTask(req.userId!, String(taskId))) || !(await canAccessTask(req.userId!, String(depends_on_task_id)))) {
      return res.status(403).json({ error: 'Sin acceso a esta tarea' });
    }

    const id = uuid();
    await query(
      'INSERT INTO task_dependencies (id, task_id, depends_on_task_id, dependency_type) VALUES (?, ?, ?, ?)',
      [id, taskId, depends_on_task_id, dependency_type || 'blocks']
    );
    res.status(201).json({ id, task_id: taskId, depends_on_task_id, dependency_type: dependency_type || 'blocks' });
  } catch (e: any) {
    if (e?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Dependencia ya existe' });
    console.error(e);
    res.status(500).json({ error: 'Error al crear dependencia' });
  }
});

tasksRouter.delete('/tasks/:id/dependencies/:depId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const dep = await queryOne<any>('SELECT task_id FROM task_dependencies WHERE id = ?', [req.params.depId]);
    if (!dep) return res.status(404).json({ error: 'Dependencia no encontrada' });
    if (!(await canAccessTask(req.userId!, String(dep.task_id)))) return res.status(403).json({ error: 'Sin acceso a esta tarea' });
    await query('DELETE FROM task_dependencies WHERE id = ?', [req.params.depId]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar dependencia' });
  }
});

// ========== COMMENTS ==========
tasksRouter.get('/tasks/:taskId/comments', requireAuth, async (req: AuthRequest, res) => {
  try {
    const taskId = String(req.params.taskId || '');
    const userId = req.userId!;
    const allowed = await canAccessTask(userId, taskId);
    if (!allowed) return res.status(403).json({ error: 'Sin acceso a esta tarea' });

    const rows = await query<any[]>(
      `SELECT c.id, c.task_id, c.user_id, c.reply_to_id, c.comentario, c.contenido_html, c.image_url, c.created_at,
              p.nombre as user_nombre, p.avatar_url as user_avatar_url,
              COUNT(cl.id) as likes_count,
              MAX(CASE WHEN cl.user_id = ? THEN 1 ELSE 0 END) as liked_by_me
       FROM comments c
       LEFT JOIN profiles p ON p.id = c.user_id
       LEFT JOIN comment_likes cl ON cl.comment_id = c.id
       WHERE c.task_id = ?
       GROUP BY c.id
       ORDER BY c.created_at ASC`,
      [userId, taskId]
    );
    res.json(rows.map((r) => ({
      ...r,
      user: r.user_nombre ? { nombre: r.user_nombre, avatar_url: r.user_avatar_url || null } : null,
      likes_count: Number(r.likes_count) || 0,
      liked_by_me: r.liked_by_me === 1 || r.liked_by_me === '1',
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar comentarios' });
  }
});

tasksRouter.post('/tasks/:taskId/comments', requireAuth, async (req: AuthRequest, res) => {
  try {
    const taskId = String(req.params.taskId || '');
    const { comentario, contenido_html, image_url } = req.body || {};
    const allowed = await canAccessTask(req.userId!, String(taskId));
    if (!allowed) return res.status(403).json({ error: 'Sin acceso a esta tarea' });

    const text = typeof comentario === 'string' ? comentario.trim() : '';
    const html = typeof contenido_html === 'string' ? contenido_html.trim() : null;
    const imgUrl = typeof image_url === 'string' && image_url.startsWith('http') ? image_url : null;
    if (!text && !html && !imgUrl) return res.status(400).json({ error: 'El comentario no puede estar vacío' });

    // Respuesta a otro comentario: se cuelga del comentario original de la tarea
    const replyTo = req.body?.reply_to_id ? await raizDeRespuesta(taskId, req.body.reply_to_id) : null;
    if (req.body?.reply_to_id && !replyTo) return res.status(400).json({ error: 'El comentario al que respondes ya no existe' });

    const id = uuid();
    await query(
      'INSERT INTO comments (id, task_id, user_id, reply_to_id, comentario, contenido_html, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, taskId, req.userId, replyTo, text || '', html, imgUrl]
    );

    const row = await queryOne<any>(
      `SELECT c.id, c.task_id, c.user_id, c.reply_to_id, c.comentario, c.contenido_html, c.image_url, c.created_at,
              p.nombre as user_nombre, p.avatar_url as user_avatar_url
       FROM comments c LEFT JOIN profiles p ON p.id = c.user_id WHERE c.id = ?`,
      [id]
    );
    const comment = row ? { ...row, user: row.user_nombre ? { nombre: row.user_nombre, avatar_url: row.user_avatar_url || null } : null, likes_count: 0, liked_by_me: false } : null;
    // En vivo para quienes tienen la tarea abierta (antes solo salía por socket)
    emitirComentario(taskId, comment);
    if (replyTo && req.userId) avisarRespuesta(taskId, replyTo, req.userId).catch(() => {});

    // Avisar a los seguidores de la tarea que hay un comentario nuevo.
    (async () => {
      try {
        const t = await queryOne<{ titulo_tarea: string }>('SELECT titulo_tarea FROM tasks WHERE id = ?', [taskId]);
        await notifySeguidores(taskId, `Nuevo comentario en la tarea que sigues: ${t?.titulo_tarea || 'Tarea'}`, req.userId);
      } catch { /* best-effort */ }
    })();

    // Detectar @menciones y notificar (in-app + email con link a la tarea). Fire-and-forget.
    const mentionText = text || (typeof contenido_html === 'string' ? contenido_html.replace(/<[^>]*>/g, ' ') : '');
    if (mentionText && req.userId) {
      processCommentMentions({ taskId, authorUserId: req.userId, text: mentionText }).catch((e) => {
        console.error('[COMMENTS REST] processCommentMentions failed:', e);
      });
    }

    res.status(201).json(comment);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear comentario' });
  }
});

// ========== DELETE COMMENT ==========
tasksRouter.delete('/comments/:commentId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const commentId = String(req.params.commentId || '');
    const userId = req.userId!;
    const comment = await queryOne<{ user_id: string }>('SELECT user_id FROM comments WHERE id = ?', [commentId]);
    if (!comment) return res.status(404).json({ error: 'Comentario no encontrado' });
    const isAdmin = await hasRole(userId, ['admin']);
    if (comment.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'No puedes eliminar este comentario' });
    }
    await query('DELETE FROM comment_likes WHERE comment_id = ?', [commentId]);
    await query('DELETE FROM comments WHERE id = ?', [commentId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar comentario' });
  }
});

// ========== COMMENT LIKES ==========
tasksRouter.post('/comments/:commentId/like', requireAuth, async (req: AuthRequest, res) => {
  try {
    const commentId = String(req.params.commentId || '');
    const userId = req.userId!;
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ?', [commentId, userId]
    );
    if (existing) {
      await query('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?', [commentId, userId]);
    } else {
      await query('INSERT INTO comment_likes (id, comment_id, user_id) VALUES (?, ?, ?)', [uuid(), commentId, userId]);
    }
    const row = await queryOne<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM comment_likes WHERE comment_id = ?', [commentId]
    );
    res.json({ liked: !existing, likes_count: Number(row?.cnt) || 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al procesar like' });
  }
});

// ========== BULK ACTIONS ==========
tasksRouter.post('/tasks/bulk-update', requireAuth, async (req: AuthRequest, res) => {
  try {
    const role = await getUserRole(req.userId!);
    if (!['admin', 'ejecutivo', 'equipo'].includes(role)) return res.status(403).json({ error: 'Sin permisos' });
    const { task_ids, updates } = req.body;
    if (!Array.isArray(task_ids) || task_ids.length === 0) return res.status(400).json({ error: 'task_ids requerido' });
    if (task_ids.length > 50) return res.status(400).json({ error: 'Máximo 50 tareas por operación' });
    if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'updates requerido' });

    // Verificar acceso a cada tarea (mismo criterio que GET /tasks/:id)
    if (role !== 'admin') {
      for (const tid of task_ids) {
        if (!(await canAccessTask(req.userId!, String(tid)))) {
          return res.status(403).json({ error: 'Sin acceso a una o más tareas seleccionadas' });
        }
      }
    }

    // Equipo can only bulk-update operational fields (estado, check_done)
    const operationalFields = new Set(['estado', 'check_done']);
    if (role === 'equipo') {
      const updateKeys = Object.keys(updates);
      if (!updateKeys.every(k => operationalFields.has(k))) {
        return res.status(403).json({ error: 'Sin permisos para modificar esos campos' });
      }
    }

    const allowedFields: Record<string, string> = {
      estado: 'estado', prioridad: 'prioridad', responsable_user_id: 'responsable_user_id',
      sprint_id: 'sprint_id', desk_id: 'desk_id', check_done: 'check_done', folder_id: 'folder_id',
    };

    const fields: string[] = [];
    const vals: any[] = [];
    for (const [k, col] of Object.entries(allowedFields)) {
      if (updates[k] !== undefined) {
        fields.push(`${col} = ?`);
        vals.push(updates[k]);
      }
    }
    if (updates.estado === 'ajustes') {
      // va ANTES de `estado = ?` en el SET: el IF ve el estado anterior
      fields.unshift(`ajustes_count = ajustes_count + IF(estado <> 'ajustes', 1, 0)`);
    }
    if (fields.length === 0) return res.status(400).json({ error: 'Sin campos válidos para actualizar' });

    const placeholders = task_ids.map(() => '?').join(',');
    await query(`UPDATE tasks SET ${fields.join(', ')} WHERE id IN (${placeholders})`, [...vals, ...task_ids]);

    // Log bulk activity
    for (const tid of task_ids) {
      for (const [k] of Object.entries(allowedFields)) {
        if (updates[k] !== undefined) {
          logActivity('task', tid, k === 'estado' ? 'status_change' : 'update', k, null, String(updates[k]), req.userId!).catch(() => {});
        }
      }
    }

    res.json({ success: true, updated: task_ids.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error en operación masiva' });
  }
});

tasksRouter.post('/tasks/bulk-delete', requireAuth, async (req: AuthRequest, res) => {
  try {
    const role = await getUserRole(req.userId!);
    const settingsRow = await queryOne<{ value: string | null }>("SELECT value FROM site_settings WHERE `key` = 'can_delete_tasks_roles'");
    const rolesStr = settingsRow?.value || 'admin,ejecutivo';
    const allowedRoles = rolesStr.split(',').map((r) => r.trim()).filter(Boolean);
    if (!allowedRoles.includes(role)) return res.status(403).json({ error: 'Sin permisos para borrar tareas' });
    const { task_ids } = req.body;
    if (!Array.isArray(task_ids) || task_ids.length === 0) return res.status(400).json({ error: 'task_ids requerido' });
    if (task_ids.length > 50) return res.status(400).json({ error: 'Máximo 50 tareas por operación' });

    // Verificar acceso a cada tarea (mismo criterio que GET /tasks/:id)
    if (role !== 'admin') {
      for (const tid of task_ids) {
        if (!(await canAccessTask(req.userId!, String(tid)))) {
          return res.status(403).json({ error: 'Sin acceso a una o más tareas seleccionadas' });
        }
      }
    }

    // Protect tasks created by admin/ejecutivo: only admin or the creator can delete
    if (role !== 'admin') {
      const placeholdersCheck = task_ids.map(() => '?').join(',');
      const protectedTasks = await query<{ id: string }[]>(
        `SELECT t.id FROM tasks t INNER JOIN profiles cb ON cb.id = t.created_by WHERE t.id IN (${placeholdersCheck}) AND cb.rol IN ('admin','ejecutivo') AND t.created_by != ?`,
        [...task_ids, req.userId!]
      );
      if (protectedTasks.length > 0) {
        return res.status(403).json({ error: 'No puedes eliminar tareas creadas por un admin o ejecutivo' });
      }
    }

    const placeholders = task_ids.map(() => '?').join(',');
    await query(`DELETE FROM tasks WHERE id IN (${placeholders})`, task_ids);

    for (const tid of task_ids) {
      logActivity('task', tid, 'delete', null, null, null, req.userId!).catch(() => {});
    }

    res.json({ success: true, deleted: task_ids.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar tareas' });
  }
});

// ========== RECURRENCE HELPERS ==========
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export async function spawnNextRecurrence(parentTask: any, userId: string): Promise<void> {
  if (parentTask.recurrence_end_date) {
    const endDate = new Date(parentTask.recurrence_end_date);
    if (new Date() > endDate) return;
  }

  const currentDue = new Date(parentTask.fecha_entrega);
  let nextDue: Date;
  switch (parentTask.recurrence_type) {
    case 'daily': nextDue = addDays(currentDue, 1); break;
    case 'weekly': nextDue = addDays(currentDue, 7); break;
    case 'biweekly': nextDue = addDays(currentDue, 14); break;
    case 'monthly': nextDue = addMonths(currentDue, 1); break;
    case 'custom': nextDue = addDays(currentDue, parentTask.recurrence_interval || 7); break;
    default: return;
  }

  let nextStart: string | null = null;
  if (parentTask.fecha_inicio) {
    const origStart = new Date(parentTask.fecha_inicio);
    const origDue = new Date(parentTask.fecha_entrega);
    const diffMs = origDue.getTime() - origStart.getTime();
    nextStart = new Date(nextDue.getTime() - diffMs).toISOString().slice(0, 10);
  }

  const newId = uuid();
  const recurrenceParent = parentTask.recurrence_parent_id || parentTask.id;
  const nextDueStr = nextDue.toISOString().slice(0, 10);

  // GUARD anti-duplicado: si ya existe una ocurrencia para esta serie con esta misma
  // fecha de entrega, NO crear otra. Hace el spawn idempotente — si el trigger se dispara
  // 2 veces (ej. PATCH de check_done + PATCH de estado por separado) solo se crea una.
  const yaExiste = await queryOne<{ id: string }>(
    `SELECT id FROM tasks
     WHERE fecha_entrega = ?
       AND (recurrence_parent_id = ? OR id = ?)
       AND recurrence_parent_id IS NOT NULL
     LIMIT 1`,
    [nextDueStr, recurrenceParent, recurrenceParent]
  );
  if (yaExiste) {
    console.log('[Recurrence] Ocurrencia ya existe para', recurrenceParent, nextDueStr, '— no se duplica');
    return;
  }

  await query(
    `INSERT INTO tasks (id, check_done, brand_id, desk_id, titulo_tarea, detalle,
     cantidad_entregables, responsable_user_id, departamento, department_id, prioridad, estado,
     fecha_inicio, fecha_entrega, enlaces, feature_id, task_type_id,
     tipo_entregable_id, created_by, estimated_hours, recurrence_type, recurrence_interval,
     recurrence_end_date, recurrence_parent_id)
     VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'backlog', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId, parentTask.brand_id, parentTask.desk_id, parentTask.titulo_tarea,
     parentTask.detalle, parentTask.cantidad_entregables, parentTask.responsable_user_id,
     parentTask.departamento, parentTask.department_id, parentTask.prioridad, nextStart,
     nextDueStr, parentTask.enlaces,
     parentTask.feature_id, parentTask.task_type_id, parentTask.tipo_entregable_id,
     userId, parentTask.estimated_hours, parentTask.recurrence_type,
     parentTask.recurrence_interval, parentTask.recurrence_end_date, recurrenceParent]
  );

  // Copy responsables
  const resps = await query<any[]>('SELECT user_id FROM task_responsables WHERE task_id = ?', [parentTask.id]);
  for (const r of resps) {
    await query('INSERT IGNORE INTO task_responsables (id, task_id, user_id) VALUES (?, ?, ?)', [uuid(), newId, r.user_id]);
  }
}
