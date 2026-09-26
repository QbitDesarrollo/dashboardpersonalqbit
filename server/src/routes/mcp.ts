import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { AuthRequest } from '../middleware/auth.js';
import { requireApiToken } from '../middleware/apiToken.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { createNotification } from '../utils/notifications.js';
import { autoSyncTaskToCalendar } from '../utils/googleCalendarSync.js';
import { canAccessTask } from '../utils/taskAccess.js';
import { getUserRole } from '../utils/roles.js';
import { logActivity, logTaskChanges } from '../utils/activity.js';
import { spawnNextRecurrence } from './tasks.js';
import { processCommentMentions } from '../utils/mentions.js';
import { fechaSql, hoyEcuador } from '../utils/fechas.js';

/**
 * API del MCP de Tiusdei.
 *
 * Estos endpoints los consume el servidor MCP remoto (desplegado en el VPS,
 * ver carpeta `mcp-server/`, expuesto en https://tiusdei.qbit.ec/mcp). El MCP
 * recibe en cada request el `Authorization: Bearer <token>` del usuario y lo
 * reenvía aquí. El token está ligado a un usuario y todas las respuestas se
 * filtran por SUS permisos — mismo aislamiento que la UI.
 *
 * Contrato:
 *   GET  /api/brands                 -> [{ id, name }]
 *   GET  /api/desks                  -> [{ id, name }]
 *   GET  /api/desks/:id/assignees    -> [{ id, name }]
 *   GET  /api/departments            -> [{ id, name }]
 *   GET  /api/enums                  -> { priority, status, taskType, deliverableType }
 *   POST /api/tasks                  -> { id, url }
 *   POST /api/tasks/bulk             -> { results: [...], created, failed }
 *
 * Reglas: respuestas MÍNIMAS (solo lo que el agente necesita) y errores con
 * NOMBRE (TIUSDEI_*) para que el MCP los pueda mapear.
 */
export const mcpRouter = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec';

// Mapeo de prioridad: lo que ve el agente <-> lo que guarda la DB
const PRIORITY_MAP: Record<string, string> = {
  alta: 'alta', media: 'media', baja: 'baja',
  Alta: 'alta', Media: 'media', Baja: 'baja',
};
const PRIORITY_LABELS = ['Alta', 'Media', 'Baja'];

// Mapeo de estado: label del agente <-> enum de la DB
const STATUS_MAP: Record<string, string> = {
  'Pendiente': 'backlog',
  'En proceso': 'en_proceso',
  'Revisión interna': 'revision_interna',
  'Revisión cliente': 'revision_cliente',
  'Aprobado': 'aprobado',
  'Entregado': 'entregado',
  'Bloqueado': 'bloqueado',
  // también aceptamos el valor crudo del enum por si acaso
  backlog: 'backlog', en_proceso: 'en_proceso', revision_interna: 'revision_interna',
  revision_cliente: 'revision_cliente', aprobado: 'aprobado', entregado: 'entregado', bloqueado: 'bloqueado',
};
const STATUS_LABELS = ['Pendiente', 'En proceso', 'Revisión interna', 'Revisión cliente', 'Aprobado', 'Entregado', 'Bloqueado'];

// Mapas INVERSOS: enum crudo de la DB -> label del agente. Cubren los 8 valores
// del enum, incluido el legacy `en_revision` (existen tareas viejas con ese
// valor). Así search_tasks/get_task nunca devuelven un estado en blanco.
const STATUS_REVERSE: Record<string, string> = {
  backlog: 'Pendiente',
  en_proceso: 'En proceso',
  en_revision: 'Revisión interna', // legacy
  revision_interna: 'Revisión interna',
  revision_cliente: 'Revisión cliente',
  aprobado: 'Aprobado',
  entregado: 'Entregado',
  bloqueado: 'Bloqueado',
};
const PRIORITY_REVERSE: Record<string, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };

// ── Paginación por cursor (keyset sobre updated_at DESC, id DESC) ──
// El cursor es OPACO para el agente: base64url de { u: updated_at, id, f }.
// `f` es una huella de los filtros: si el agente cambia los filtros pero manda
// un cursor viejo, lo detectamos y le pedimos volver a buscar (evita mezclar).
function encodeCursor(u: string, id: string, fp: string): string {
  return Buffer.from(JSON.stringify({ u, id, f: fp }), 'utf8').toString('base64url');
}
function decodeCursor(raw: string): { u: string; id: string; f: string } | null {
  try {
    const o = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (o && typeof o.u === 'string' && typeof o.id === 'string' && typeof o.f === 'string') {
      return o as { u: string; id: string; f: string };
    }
    return null;
  } catch {
    return null;
  }
}
function filtersFingerprint(obj: Record<string, unknown>): string {
  const norm = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('sha1').update(norm).digest('hex').slice(0, 12);
}

const SEARCH_PAGE_DEFAULT = 10;
const SEARCH_PAGE_MAX = 25;

// Motivos válidos al reprogramar la fecha de entrega (espeja tasks.ts).
const MOTIVOS_RESCHEDULE = ['INTERNO', 'CLIENTE', 'ALCANCE', 'FUERZA_MAYOR', 'SIN_CLASIFICAR'];

// ── Notificaciones (réplica inline de los helpers privados de tasks.ts) ──
// notifyUser: fire-and-forget, solo si userId no vacío.
function notifyUser(userId: string | null | undefined, mensaje: string, taskId: string | null): void {
  if (!userId) return;
  createNotification(userId, mensaje, taskId).catch(() => {});
}
// notifySeguidores: avisa a quienes siguen la tarea, menos al actor.
async function notifySeguidores(taskId: string, mensaje: string, exceptUserId?: string | null): Promise<void> {
  try {
    const rows = await query<{ user_id: string }[]>('SELECT user_id FROM task_seguidores WHERE task_id = ?', [taskId]);
    for (const r of rows) {
      if (r.user_id && r.user_id !== exceptUserId) notifyUser(r.user_id, mensaje, taskId);
    }
  } catch { /* best-effort */ }
}

/**
 * Permiso de EDICIÓN de una tarea — espeja tasks.ts (PATCH /tasks/:id).
 *   admin      -> todo
 *   ejecutivo  -> cualquier tarea a la que tenga acceso (canAccessTask)
 *   equipo     -> asignado: en tareas "protegidas" (creadas por admin/ejecutivo)
 *                 solo campos operativos; en el resto, todo. No asignado pero con
 *                 acceso: solo operativo.
 *   cliente/otros -> no edita.
 * `operationalOnly` = true cuando el cambio es operativo (ej. estado): permite a
 * más gente. false para cambios de fondo (reasignar, editar campos).
 */
async function canEditTask(
  oldRow: { created_by?: string | null; responsable_user_id?: string | null },
  role: string | undefined,
  userId: string,
  taskId: string,
  opts: { operationalOnly: boolean },
): Promise<boolean> {
  if (role === 'admin') return true;

  const hasAccess = await canAccessTask(userId, taskId);
  if (role === 'ejecutivo') return hasAccess;

  if (role === 'equipo') {
    const isResponsable = oldRow.responsable_user_id === userId;
    const inResponsables = isResponsable
      ? true
      : !!(await queryOne<{ n: number }>(
          'SELECT 1 as n FROM task_responsables WHERE task_id = ? AND user_id = ? LIMIT 1',
          [taskId, userId],
        ));
    const isAssigned = isResponsable || inResponsables;

    let creatorRole: string | null = null;
    if (oldRow.created_by) creatorRole = await getUserRole(oldRow.created_by);
    const isProtected = creatorRole === 'admin' || creatorRole === 'ejecutivo';

    if (isAssigned) return isProtected ? opts.operationalOnly : true;
    if (hasAccess) return opts.operationalOnly;
    return false;
  }

  return false;
}

// ───────────────────────────────────────────────────────────────────────────
// GET /api/brands — marcas visibles para el dueño del token
// ───────────────────────────────────────────────────────────────────────────
mcpRouter.get('/brands', requireApiToken, async (req: AuthRequest, res) => {
  try {
    const role = req.userRole;
    let rows: { id: string; nombre: string }[];

    if (role === 'cliente') {
      const brandIds = await query<{ brand_id: string }[]>(
        'SELECT brand_id FROM client_brands WHERE user_id = ?', [req.userId]
      );
      const ids = brandIds.map((r) => r.brand_id);
      if (ids.length === 0) { res.json([]); return; }
      const ph = ids.map(() => '?').join(',');
      rows = await query<any[]>(
        `SELECT id, nombre FROM brands WHERE id IN (${ph}) AND activo = 1 ORDER BY nombre`, ids
      );
    } else if (role === 'equipo') {
      const deskRows = await query<{ desk_id: string }[]>(
        'SELECT desk_id FROM desk_members WHERE user_id = ?', [req.userId]
      );
      const deskIds = deskRows.map((r) => r.desk_id);
      if (deskIds.length === 0) { res.json([]); return; }
      const ph = deskIds.map(() => '?').join(',');
      const hasDeskBrands = await queryOne<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM desk_brands WHERE desk_id IN (${ph})`, deskIds
      );
      if (Number(hasDeskBrands?.cnt) > 0) {
        rows = await query<any[]>(
          `SELECT DISTINCT b.id, b.nombre FROM brands b
           INNER JOIN desk_brands db ON db.brand_id = b.id
           WHERE db.desk_id IN (${ph}) AND b.activo = 1 ORDER BY b.nombre`, deskIds
        );
      } else {
        rows = await query<any[]>('SELECT id, nombre FROM brands WHERE activo = 1 ORDER BY nombre');
      }
    } else {
      // admin / ejecutivo: todas las marcas activas
      rows = await query<any[]>('SELECT id, nombre FROM brands WHERE activo = 1 ORDER BY nombre');
    }

    res.json(rows.map((r) => ({ id: r.id, name: r.nombre })));
  } catch (e) {
    console.error('[MCP] brands:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al cargar marcas' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/desks — mesas visibles para el dueño del token
// ───────────────────────────────────────────────────────────────────────────
mcpRouter.get('/desks', requireApiToken, async (req: AuthRequest, res) => {
  try {
    let rows: { id: string; nombre: string }[];
    if (req.userRole === 'equipo' || req.userRole === 'cliente') {
      rows = await query<any[]>(
        `SELECT d.id, d.nombre FROM desks d
         INNER JOIN desk_members dm ON dm.desk_id = d.id
         WHERE dm.user_id = ? AND d.activo = 1
         ORDER BY d.nombre`,
        [req.userId]
      );
    } else {
      rows = await query<any[]>('SELECT id, nombre FROM desks WHERE activo = 1 ORDER BY nombre');
    }
    res.json(rows.map((r) => ({ id: r.id, name: r.nombre })));
  } catch (e) {
    console.error('[MCP] desks:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al cargar mesas' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/desks/:id/assignees — miembros activos de una mesa
// ───────────────────────────────────────────────────────────────────────────
mcpRouter.get('/desks/:id/assignees', requireApiToken, async (req: AuthRequest, res) => {
  try {
    const deskId = String(req.params.id);

    // El dueño del token tiene que poder ver la mesa
    if (req.userRole === 'equipo' || req.userRole === 'cliente') {
      const member = await queryOne<{ id: string }>(
        'SELECT id FROM desk_members WHERE desk_id = ? AND user_id = ? LIMIT 1',
        [deskId, req.userId]
      );
      if (!member) {
        res.status(403).json({ error: 'TIUSDEI_DESK_FORBIDDEN', message: 'No tienes acceso a esta mesa' });
        return;
      }
    }

    const rows = await query<{ id: string; nombre: string }[]>(
      `SELECT p.id, p.nombre FROM profiles p
       INNER JOIN desk_members dm ON dm.user_id = p.id
       WHERE dm.desk_id = ? AND p.activo = 1
       ORDER BY p.nombre`,
      [deskId]
    );
    res.json(rows.map((r) => ({ id: r.id, name: r.nombre })));
  } catch (e) {
    console.error('[MCP] assignees:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al cargar responsables' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/departments — etapas de pipeline disponibles (globales, no por mesa)
// ───────────────────────────────────────────────────────────────────────────
mcpRouter.get('/departments', requireApiToken, async (_req: AuthRequest, res) => {
  try {
    const rows = await query<{ id: string; nombre: string }[]>(
      'SELECT id, nombre FROM departments WHERE activo = 1 ORDER BY orden, nombre'
    );
    res.json(rows.map((r) => ({ id: r.id, name: r.nombre })));
  } catch (e) {
    console.error('[MCP] departments:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al cargar departamentos' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/enums — catálogos para armar una tarea
// ───────────────────────────────────────────────────────────────────────────
mcpRouter.get('/enums', requireApiToken, async (_req: AuthRequest, res) => {
  try {
    const [taskTypes, deliverableTypes] = await Promise.all([
      query<{ nombre: string }[]>('SELECT nombre FROM task_types WHERE activo = 1 ORDER BY nombre'),
      query<{ nombre: string }[]>('SELECT nombre FROM deliverable_types WHERE activo = 1 ORDER BY nombre'),
    ]);
    res.json({
      priority: PRIORITY_LABELS,
      status: STATUS_LABELS,
      taskType: taskTypes.map((r) => r.nombre),
      deliverableType: deliverableTypes.map((r) => r.nombre),
    });
  } catch (e) {
    console.error('[MCP] enums:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al cargar catálogos' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/tasks — BÚSQUEDA/LISTADO de tareas (resumen + paginación por cursor)
//
// Filtra por los MISMOS permisos que la lista de la UI (server/src/routes/tasks.ts):
//   admin              -> todas las tareas de primer nivel
//   cliente            -> tareas de sus marcas (client_brands)
//   equipo/ejecutivo   -> tareas de sus mesas, asignadas, co-responsable o seguidas
// Devuelve filas MÍNIMAS (8 campos) + { total, has_more, next_cursor }. Para el
// detalle de una fila se usa GET /tasks/:id. No incluye subtareas.
// ───────────────────────────────────────────────────────────────────────────
mcpRouter.get('/tasks', requireApiToken, async (req: AuthRequest, res) => {
  try {
    const q = req.query;
    const str = (v: unknown): string | undefined => {
      let val = v;
      if (Array.isArray(val)) val = val[0];
      if (typeof val !== 'string') return undefined;
      const t = val.trim();
      return t.length ? t : undefined;
    };
    const bool = (v: unknown): boolean => {
      const s = str(v);
      return s === 'true' || s === '1';
    };

    const fQuery = str(q.query);
    const fBrand = str(q.brandId);
    const fDesk = str(q.deskId);
    const fAssignee = str(q.assigneeId);
    const fMine = bool(q.mine);
    const fOverdue = bool(q.overdue);
    const fDueFrom = str(q.dueFrom);
    const fDueTo = str(q.dueTo);

    // Fechas: validación semántica (mismo formato que create).
    for (const [k, v] of [['dueFrom', fDueFrom], ['dueTo', fDueTo]] as const) {
      if (v && !ISO_DATE.test(v)) {
        res.status(400).json({ error: 'TIUSDEI_INVALID_DATE', message: `${k} debe tener formato YYYY-MM-DD` });
        return;
      }
    }

    // Estado / prioridad: entran como LABEL y se traducen al enum (o error nombrado).
    let estado: string | undefined;
    const fStatusLabel = str(q.status);
    if (fStatusLabel) {
      estado = STATUS_MAP[fStatusLabel];
      if (!estado) {
        res.status(400).json({ error: 'TIUSDEI_INVALID_STATUS', message: `Estado no reconocido: ${fStatusLabel}. Usa get_enums.` });
        return;
      }
    }
    let prioridad: string | undefined;
    const fPriorityLabel = str(q.priority);
    if (fPriorityLabel) {
      prioridad = PRIORITY_MAP[fPriorityLabel];
      if (!prioridad) {
        res.status(400).json({ error: 'TIUSDEI_INVALID_PRIORITY', message: `Prioridad no reconocida: ${fPriorityLabel}. Usa get_enums.` });
        return;
      }
    }

    // pageSize: default 10, tope 25.
    let pageSize = SEARCH_PAGE_DEFAULT;
    const psRaw = str(q.pageSize);
    if (psRaw) {
      const n = parseInt(psRaw, 10);
      if (!Number.isNaN(n)) pageSize = Math.min(Math.max(n, 1), SEARCH_PAGE_MAX);
    }

    const userId = req.userId!;

    // Huella de filtros — todo menos cursor/pageSize. `mine` se resuelve a userId
    // dentro de la huella para que dos usuarios no compartan cursor.
    const fp = filtersFingerprint({
      query: fQuery ?? null, brandId: fBrand ?? null, deskId: fDesk ?? null,
      assigneeId: fAssignee ?? null, mine: fMine ? userId : null, overdue: fOverdue,
      dueFrom: fDueFrom ?? null, dueTo: fDueTo ?? null,
      estado: estado ?? null, prioridad: prioridad ?? null,
    });

    // Cursor (opcional). Si viene, tiene que casar con la huella de filtros.
    let cursor: { u: string; id: string; f: string } | null = null;
    const cursorRaw = str(q.cursor);
    if (cursorRaw) {
      cursor = decodeCursor(cursorRaw);
      if (!cursor) {
        res.status(400).json({ error: 'TIUSDEI_INVALID_CURSOR', message: 'El cursor es inválido. Vuelve a buscar sin cursor.' });
        return;
      }
      if (cursor.f !== fp) {
        res.status(400).json({ error: 'TIUSDEI_CURSOR_MISMATCH', message: 'Los filtros cambiaron respecto al cursor. Vuelve a buscar sin cursor.' });
        return;
      }
    }

    // ── Visibilidad por rol (espeja tasks.ts) ──
    const role = req.userRole;
    let visSql: string;
    const visParams: string[] = [];
    if (role === 'admin') {
      visSql = '1=1';
    } else if (role === 'cliente') {
      visSql = 't.brand_id IN (SELECT brand_id FROM client_brands WHERE user_id = ?)';
      visParams.push(userId);
    } else {
      // equipo / ejecutivo / otros -> scoping de equipo (subqueries inline: manejan
      // el caso "sin mesas" sin ramas ni IN() vacío).
      visSql = `(
        t.desk_id IN (SELECT desk_id FROM desk_members WHERE user_id = ?)
        OR t.responsable_user_id = ?
        OR t.id IN (SELECT task_id FROM task_responsables WHERE user_id = ?)
        OR t.id IN (SELECT task_id FROM task_seguidores WHERE user_id = ?)
      )`;
      visParams.push(userId, userId, userId, userId);
    }

    // ── Filtros comunes ──
    const conds: string[] = [visSql, "(t.parent_task_id IS NULL OR t.parent_task_id = '')"];
    const params: string[] = [...visParams];
    if (fQuery) { conds.push('t.titulo_tarea LIKE ?'); params.push(`%${fQuery}%`); }
    if (fBrand) { conds.push('t.brand_id = ?'); params.push(fBrand); }
    if (fDesk) { conds.push('t.desk_id = ?'); params.push(fDesk); }
    if (fAssignee) {
      conds.push('(t.responsable_user_id = ? OR t.id IN (SELECT task_id FROM task_responsables WHERE user_id = ?))');
      params.push(fAssignee, fAssignee);
    }
    if (fMine) {
      conds.push('(t.responsable_user_id = ? OR t.id IN (SELECT task_id FROM task_responsables WHERE user_id = ?))');
      params.push(userId, userId);
    }
    if (estado) { conds.push('t.estado = ?'); params.push(estado); }
    if (prioridad) { conds.push('t.prioridad = ?'); params.push(prioridad); }
    if (fOverdue) { conds.push(`t.fecha_entrega < ${fechaSql(hoyEcuador())} AND t.estado NOT IN ('entregado','aprobado')`); }
    if (fDueFrom) { conds.push('t.fecha_entrega >= ?'); params.push(fDueFrom); }
    if (fDueTo) { conds.push('t.fecha_entrega <= ?'); params.push(fDueTo); }

    const whereBase = conds.join(' AND ');

    // Keyset: solo afecta al listado, no al COUNT total.
    let whereList = whereBase;
    const listParams: string[] = [...params];
    if (cursor) {
      whereList += ' AND (t.updated_at < ? OR (t.updated_at = ? AND t.id < ?))';
      listParams.push(cursor.u, cursor.u, cursor.id);
    }

    const listSql = `
      SELECT t.id, t.titulo_tarea, b.nombre AS brand_nombre, d.nombre AS desk_nombre,
             t.estado, t.prioridad,
             DATE_FORMAT(t.fecha_entrega, '%Y-%m-%d') AS fecha_entrega,
             p.nombre AS resp_nombre,
             DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s.%f') AS updated_cursor
      FROM tasks t
      LEFT JOIN brands b ON b.id = t.brand_id
      LEFT JOIN desks d ON d.id = t.desk_id
      LEFT JOIN profiles p ON p.id = t.responsable_user_id
      WHERE ${whereList}
      ORDER BY t.updated_at DESC, t.id DESC
      LIMIT ?`;
    const countSql = `SELECT COUNT(*) AS total FROM tasks t WHERE ${whereBase}`;

    // pageSize+1 para saber si hay más sin un COUNT extra por página.
    const [rows, countRow] = await Promise.all([
      query<any[]>(listSql, [...listParams, String(pageSize + 1)]),
      queryOne<{ total: number }>(countSql, params),
    ]);

    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.updated_cursor, last.id, fp) : null;

    // Responsables COMPLETOS por tarea (principal + co-responsables). Sin esto, una
    // tarea donde el usuario es CO-responsable se mostraba con el nombre del principal
    // (otra persona) — parecía que el filtro mine/assigneeId se colaba, cuando no.
    const pageIds = pageRows.map((r) => r.id);
    const respByTask = new Map<string, string[]>();
    if (pageIds.length > 0) {
      const ph = pageIds.map(() => '?').join(',');
      const respRows = await query<{ task_id: string; nombre: string }[]>(
        `SELECT tr.task_id, p.nombre FROM task_responsables tr
         INNER JOIN profiles p ON p.id = tr.user_id
         WHERE tr.task_id IN (${ph}) ORDER BY p.nombre`,
        pageIds,
      );
      for (const r of respRows) {
        const arr = respByTask.get(r.task_id) ?? [];
        arr.push(r.nombre);
        respByTask.set(r.task_id, arr);
      }
    }

    const items = pageRows.map((r) => {
      // Principal primero, luego co-responsables, sin duplicar. Fallback al principal
      // por si una tarea vieja no tiene filas en task_responsables.
      const names: string[] = [];
      const seen = new Set<string>();
      if (r.resp_nombre) { names.push(r.resp_nombre); seen.add(r.resp_nombre); }
      for (const n of respByTask.get(r.id) ?? []) {
        if (!seen.has(n)) { names.push(n); seen.add(n); }
      }
      return {
        id: r.id,
        title: r.titulo_tarea,
        brand: r.brand_nombre ?? null,
        desk: r.desk_nombre ?? null,
        status: STATUS_REVERSE[r.estado] ?? r.estado,
        priority: PRIORITY_REVERSE[r.prioridad] ?? r.prioridad,
        dueDate: r.fecha_entrega ?? null,
        assignees: names,
      };
    });

    res.json({
      total: Number(countRow?.total ?? 0),
      page_size: pageSize,
      has_more: hasMore,
      next_cursor: nextCursor,
      items,
    });
  } catch (e) {
    console.error('[MCP] search tasks:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al buscar tareas' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/tasks/:id — DETALLE de una tarea (bajo demanda, sin comentarios/historial)
// Usa canAccessTask (misma verificación que la UI, incluye herencia de subtareas
// y seguidores). Si no hay acceso -> 404 (no filtramos existencia de tareas ajenas).
// ───────────────────────────────────────────────────────────────────────────
mcpRouter.get('/tasks/:id', requireApiToken, async (req: AuthRequest, res) => {
  try {
    const taskId = String(req.params.id);
    const allowed = await canAccessTask(req.userId!, taskId);
    if (!allowed) {
      res.status(404).json({ error: 'TIUSDEI_TASK_NOT_FOUND', message: 'La tarea no existe o no tienes acceso.' });
      return;
    }

    const row = await queryOne<any>(
      `SELECT t.id, t.titulo_tarea, t.detalle, t.estado, t.prioridad,
              t.brand_id, b.nombre AS brand_nombre,
              t.desk_id, d.nombre AS desk_nombre,
              t.task_type_id, tt.nombre AS task_type_nombre,
              t.department_id, dep.nombre AS department_nombre,
              t.tipo_entregable_id, dt.nombre AS deliverable_type_nombre, t.cantidad_entregables,
              t.responsable_user_id, p.nombre AS resp_nombre,
              t.story_points, t.enlaces,
              DATE_FORMAT(t.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
              DATE_FORMAT(t.fecha_entrega, '%Y-%m-%d') AS fecha_entrega,
              DATE_FORMAT(t.fecha_cliente, '%Y-%m-%d') AS fecha_cliente,
              DATE_FORMAT(t.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
              DATE_FORMAT(t.updated_at, '%Y-%m-%dT%H:%i:%s') AS updated_at
       FROM tasks t
       LEFT JOIN brands b ON b.id = t.brand_id
       LEFT JOIN desks d ON d.id = t.desk_id
       LEFT JOIN task_types tt ON tt.id = t.task_type_id
       LEFT JOIN departments dep ON dep.id = t.department_id
       LEFT JOIN deliverable_types dt ON dt.id = t.tipo_entregable_id
       LEFT JOIN profiles p ON p.id = t.responsable_user_id
       WHERE t.id = ?`,
      [taskId]
    );
    if (!row) {
      res.status(404).json({ error: 'TIUSDEI_TASK_NOT_FOUND', message: 'La tarea no existe o no tienes acceso.' });
      return;
    }

    // Responsables: primario + co-responsables (task_responsables), sin duplicar.
    const respRows = await query<{ id: string; nombre: string }[]>(
      `SELECT p.id, p.nombre FROM task_responsables tr
       INNER JOIN profiles p ON p.id = tr.user_id
       WHERE tr.task_id = ? ORDER BY p.nombre`,
      [taskId]
    );
    const assigneeMap = new Map<string, string>();
    if (row.responsable_user_id && row.resp_nombre) assigneeMap.set(row.responsable_user_id, row.resp_nombre);
    for (const r of respRows) assigneeMap.set(r.id, r.nombre);
    const assignees = Array.from(assigneeMap, ([id, name]) => ({ id, name }));

    // enlaces: columna JSON (mysql2 la entrega ya parseada, pero cubrimos ambos casos).
    let links: string[] = [];
    if (row.enlaces) {
      try {
        const parsed = typeof row.enlaces === 'string' ? JSON.parse(row.enlaces) : row.enlaces;
        if (Array.isArray(parsed)) links = parsed.filter((x: unknown) => typeof x === 'string');
      } catch { /* enlaces malformado: se deja vacío */ }
    }

    res.json({
      id: row.id,
      title: row.titulo_tarea,
      detail: row.detalle ?? null,
      brand: row.brand_id ? { id: row.brand_id, name: row.brand_nombre ?? null } : null,
      desk: row.desk_id ? { id: row.desk_id, name: row.desk_nombre ?? null } : null,
      status: STATUS_REVERSE[row.estado] ?? row.estado,
      priority: PRIORITY_REVERSE[row.prioridad] ?? row.prioridad,
      taskType: row.task_type_nombre ?? null,
      department: row.department_nombre ?? null,
      deliverableType: row.deliverable_type_nombre ?? null,
      deliverableQuantity: row.cantidad_entregables ?? null,
      assignees,
      startDate: row.fecha_inicio ?? null,
      dueDate: row.fecha_entrega ?? null,
      clientDate: row.fecha_cliente ?? null,
      storyPoints: row.story_points ?? null,
      links,
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null,
      url: `${FRONTEND_URL}/tareas?task=${row.id}`,
    });
  } catch (e) {
    console.error('[MCP] get task:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al cargar la tarea' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// Crear tareas — POST /api/tasks (una) y POST /api/tasks/bulk (varias)
// ───────────────────────────────────────────────────────────────────────────
const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  brandId: z.string().min(1),
  deskId: z.string().min(1).nullable().optional(),
  assigneeIds: z.array(z.string()).max(20).optional().default([]),
  department: z.string().max(200).nullable().optional(),
  taskType: z.string().max(200).nullable().optional(),
  deliverableType: z.string().max(200).nullable().optional(),
  deliverableQuantity: z.number().int().min(1).max(999).optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().min(1),
  detail: z.string().max(5000).nullable().optional(),
  links: z.array(z.string()).max(20).optional().default([]),
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Tope de tareas por llamada en lote — guardarraíl de tamaño de input.
const BULK_MAX = 100;

type CreateOk = { ok: true; id: string; url: string; assigneeIds: string[] };
type CreateErr = { ok: false; status: number; error: string; message: string; details?: unknown };
type CreateResult = CreateOk | CreateErr;

/**
 * Crea UNA tarea. Nunca lanza: siempre devuelve un resultado con nombre.
 * Lo usan tanto POST /tasks (singular) como POST /tasks/bulk (lote), así la
 * validación y los errores con NOMBRE (TIUSDEI_*) son idénticos en ambos.
 *
 * `opts.notifyInApp` (default true): si manda la notificación in-app por tarea.
 * El lote lo pone en false y manda en su lugar UN resumen por usuario.
 */
async function createOneTask(
  input: unknown,
  userId: string | null | undefined,
  opts: { notifyInApp?: boolean } = {},
): Promise<CreateResult> {
  try {
    const parsed = createTaskSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false, status: 400, error: 'TIUSDEI_INVALID_INPUT',
        message: 'Datos de tarea inválidos',
        details: parsed.error.flatten().fieldErrors,
      };
    }
    const body = parsed.data;

    // ── Fechas ──
    if (!ISO_DATE.test(body.dueDate)) {
      return { ok: false, status: 400, error: 'TIUSDEI_INVALID_DATE', message: 'dueDate debe tener formato YYYY-MM-DD' };
    }
    if (body.startDate && !ISO_DATE.test(body.startDate)) {
      return { ok: false, status: 400, error: 'TIUSDEI_INVALID_DATE', message: 'startDate debe tener formato YYYY-MM-DD' };
    }
    if (body.startDate && body.startDate > body.dueDate) {
      return { ok: false, status: 400, error: 'TIUSDEI_INVALID_DATE', message: 'startDate no puede ser posterior a dueDate' };
    }

    // ── Prioridad ──
    let prioridad = 'media';
    if (body.priority) {
      const mapped = PRIORITY_MAP[body.priority];
      if (!mapped) {
        return { ok: false, status: 400, error: 'TIUSDEI_INVALID_PRIORITY', message: `Prioridad no reconocida: ${body.priority}. Usa get_enums.` };
      }
      prioridad = mapped;
    }

    // ── Estado ──
    let estado = 'backlog';
    if (body.status) {
      const mapped = STATUS_MAP[body.status];
      if (!mapped) {
        return { ok: false, status: 400, error: 'TIUSDEI_INVALID_STATUS', message: `Estado no reconocido: ${body.status}. Usa get_enums.` };
      }
      estado = mapped;
    }

    // ── Marca ──
    const brand = await queryOne<{ id: string }>(
      'SELECT id FROM brands WHERE id = ? AND activo = 1', [body.brandId]
    );
    if (!brand) {
      return { ok: false, status: 400, error: 'TIUSDEI_INVALID_BRAND', message: 'La marca no existe o está inactiva. Usa list_brands.' };
    }

    // ── Mesa (opcional) ──
    let deskId: string | null = null;
    if (body.deskId) {
      const desk = await queryOne<{ id: string }>(
        'SELECT id FROM desks WHERE id = ? AND activo = 1', [body.deskId]
      );
      if (!desk) {
        return { ok: false, status: 400, error: 'TIUSDEI_INVALID_DESK', message: 'La mesa no existe o está inactiva. Usa list_desks.' };
      }
      deskId = desk.id;

      // Si la mesa tiene marcas asignadas, la marca tiene que ser una de ellas
      const deskBrandCount = await queryOne<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM desk_brands WHERE desk_id = ?', [deskId]
      );
      if (Number(deskBrandCount?.cnt) > 0) {
        const match = await queryOne<{ id: string }>(
          'SELECT id FROM desk_brands WHERE desk_id = ? AND brand_id = ?', [deskId, body.brandId]
        );
        if (!match) {
          return { ok: false, status: 400, error: 'TIUSDEI_BRAND_DESK_MISMATCH', message: 'La marca no está asignada a esa mesa.' };
        }
      }
    }

    // ── Responsables ──
    const assigneeIds = Array.from(new Set(body.assigneeIds.filter((x) => typeof x === 'string' && x.length > 0)));
    if (assigneeIds.length > 0) {
      const ph = assigneeIds.map(() => '?').join(',');
      const found = await query<{ id: string }[]>(
        `SELECT id FROM profiles WHERE id IN (${ph}) AND activo = 1`, assigneeIds
      );
      const foundIds = new Set(found.map((r) => r.id));
      const missing = assigneeIds.filter((x) => !foundIds.has(x));
      if (missing.length > 0) {
        return {
          ok: false, status: 400, error: 'TIUSDEI_STALE_ASSIGNEE',
          message: `Estos responsables no existen o están inactivos: ${missing.join(', ')}. Usa list_assignees.`,
        };
      }
    }

    // ── Tipo de tarea (opcional, por nombre) ──
    let taskTypeId: string | null = null;
    if (body.taskType) {
      const tt = await queryOne<{ id: string }>(
        'SELECT id FROM task_types WHERE nombre = ? AND activo = 1 LIMIT 1', [body.taskType]
      );
      if (!tt) {
        return { ok: false, status: 400, error: 'TIUSDEI_INVALID_TASK_TYPE', message: `Tipo de tarea no reconocido: ${body.taskType}. Usa get_enums.` };
      }
      taskTypeId = tt.id;
    }

    // ── Tipo de entregable (opcional, por nombre) ──
    let deliverableTypeId: string | null = null;
    if (body.deliverableType) {
      const dt = await queryOne<{ id: string }>(
        'SELECT id FROM deliverable_types WHERE nombre = ? AND activo = 1 LIMIT 1', [body.deliverableType]
      );
      if (!dt) {
        return { ok: false, status: 400, error: 'TIUSDEI_INVALID_DELIVERABLE_TYPE', message: `Tipo de entregable no reconocido: ${body.deliverableType}. Usa get_enums.` };
      }
      deliverableTypeId = dt.id;
    }

    // ── Departamento (opcional, por nombre — etapa de pipeline, NO texto libre) ──
    let departmentId: string | null = null;
    if (body.department) {
      const dept = await queryOne<{ id: string }>(
        'SELECT id FROM departments WHERE nombre = ? AND activo = 1 LIMIT 1', [body.department]
      );
      if (!dept) {
        return { ok: false, status: 400, error: 'TIUSDEI_INVALID_DEPARTMENT', message: `Departamento no reconocido: ${body.department}. Usa list_departments.` };
      }
      departmentId = dept.id;
    }

    // ── Insert ──
    const id = uuid();
    const enlaces = body.links && body.links.length > 0 ? JSON.stringify(body.links) : null;
    const primaryResponsable = assigneeIds[0] || null;
    const deliverableQuantity = body.deliverableQuantity ?? 1;

    await query(
      `INSERT INTO tasks (id, check_done, brand_id, desk_id, titulo_tarea, detalle, cantidad_entregables,
        responsable_user_id, department_id, prioridad, estado, fecha_inicio, fecha_entrega, enlaces,
        task_type_id, tipo_entregable_id, created_by, recurrence_type)
       VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none')`,
      [
        id, body.brandId, deskId, body.title, body.detail || null, deliverableTypeId ? deliverableQuantity : 1,
        primaryResponsable, departmentId, prioridad, estado,
        body.startDate || null, body.dueDate, enlaces, taskTypeId, deliverableTypeId, userId ?? null,
      ]
    );

    // Primer registro de history por departamento (si hay) — espeja tasks.ts POST /tasks
    if (departmentId) {
      await query(
        'INSERT INTO task_department_history (id, task_id, department_id, responsable_user_id) VALUES (?, ?, ?, ?)',
        [uuid(), id, departmentId, primaryResponsable]
      );
    }

    // Espejo en task_deliverable_types (si hay) — mismo patrón que tasks.ts POST /tasks
    // para el caso simple de un solo tipo de entregable.
    if (deliverableTypeId) {
      await query(
        'INSERT INTO task_deliverable_types (id, task_id, tipo_entregable_id, cantidad) VALUES (?, ?, ?, ?)',
        [uuid(), id, deliverableTypeId, deliverableQuantity]
      );
    }

    for (const uid of assigneeIds) {
      await query('INSERT IGNORE INTO task_responsables (id, task_id, user_id) VALUES (?, ?, ?)', [uuid(), id, uid]);
    }

    // ── Avisos ── fire-and-forget, no bloquean la respuesta y se tragan errores.
    // Igual que la creación por UI (server/src/routes/tasks.ts):
    //  - in-app: solo si notifyInApp (camino singular). En lote, el handler manda un resumen.
    //  - Google Calendar: SIEMPRE, por tarea, incluido el creador.
    const notifyInApp = opts.notifyInApp ?? true;
    for (const uid of assigneeIds) {
      if (notifyInApp && uid !== userId) {
        createNotification(uid, `Se te asignó la tarea: ${body.title}`, id).catch(() => {});
      }
      autoSyncTaskToCalendar(uid, id).catch(() => {});
    }

    return { ok: true, id, url: `${FRONTEND_URL}/tareas?task=${id}`, assigneeIds };
  } catch (e) {
    console.error('[MCP] createOneTask:', e);
    return { ok: false, status: 500, error: 'TIUSDEI_INTERNAL', message: 'Error al crear la tarea' };
  }
}

// ── POST /api/tasks — crear UNA tarea ──
mcpRouter.post('/tasks', requireApiToken, async (req: AuthRequest, res) => {
  const result = await createOneTask(req.body, req.userId);
  if (result.ok) {
    res.status(201).json({ id: result.id, url: result.url });
    return;
  }
  const payload: Record<string, unknown> = { error: result.error, message: result.message };
  if (result.details !== undefined) payload.details = result.details;
  res.status(result.status).json(payload);
});

// ── POST /api/tasks/bulk — crear VARIAS tareas en una sola llamada ──
// Best-effort, NO todo-o-nada: crea las que pueda; una que falle NO bloquea a
// las demás. Devuelve un resultado POR CADA tarea, en el mismo orden de entrada.
const bulkTasksSchema = z.object({
  tasks: z.array(z.unknown()).min(1).max(BULK_MAX),
});

mcpRouter.post('/tasks/bulk', requireApiToken, async (req: AuthRequest, res) => {
  try {
    const parsed = bulkTasksSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'TIUSDEI_INVALID_INPUT',
        message: `Se espera { tasks: [...] } con entre 1 y ${BULK_MAX} tareas`,
      });
      return;
    }

    const results: Array<
      | { ok: true; id: string; url: string }
      | { ok: false; error: string; message: string }
    > = [];
    let created = 0;
    let failed = 0;
    // Cuántas tareas le tocaron a cada responsable — para el aviso resumen.
    const assigneeCount = new Map<string, number>();

    // Secuencial a propósito: respeta el orden y no satura el pool de conexiones.
    // notifyInApp:false → en lote NO se manda una notif por tarea; va un resumen abajo.
    for (const task of parsed.data.tasks) {
      const r = await createOneTask(task, req.userId, { notifyInApp: false });
      if (r.ok) {
        results.push({ ok: true, id: r.id, url: r.url });
        created++;
        for (const uid of r.assigneeIds) {
          if (uid !== req.userId) {
            assigneeCount.set(uid, (assigneeCount.get(uid) ?? 0) + 1);
          }
        }
      } else {
        results.push({ ok: false, error: r.error, message: r.message });
        failed++;
      }
    }

    // Aviso resumen: UNA notificación in-app por usuario (fire-and-forget).
    // taskId = null porque abarca varias tareas. El sync a Calendar ya se hizo por tarea.
    for (const [uid, n] of assigneeCount) {
      const msg = n === 1 ? 'Se te asignó 1 tarea nueva' : `Se te asignaron ${n} tareas nuevas`;
      createNotification(uid, msg, null).catch(() => {});
    }

    res.json({ results, created, failed });
  } catch (e) {
    console.error('[MCP] bulk create:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al crear las tareas en lote' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// PUT /api/tasks/:id/status — cambiar el ESTADO de una tarea (change_task_status)
// El estado es un campo OPERATIVO: lo puede cambiar cualquiera con acceso a la
// tarea (asignado o miembro de la mesa), igual que en la UI. Dispara los mismos
// efectos: aviso al autor y a seguidores, recurrencia al entregar, y activity log.
// ───────────────────────────────────────────────────────────────────────────
const statusSchema = z.object({ status: z.string().min(1) });

mcpRouter.put('/tasks/:id/status', requireApiToken, async (req: AuthRequest, res) => {
  try {
    const taskId = String(req.params.id);
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'TIUSDEI_INVALID_INPUT', message: 'Se espera { status }' });
      return;
    }
    const estado = STATUS_MAP[parsed.data.status];
    if (!estado) {
      res.status(400).json({ error: 'TIUSDEI_INVALID_STATUS', message: `Estado no reconocido: ${parsed.data.status}. Usa get_enums.` });
      return;
    }

    // Row COMPLETO: spawnNextRecurrence clona la tarea y necesita todos sus campos
    // (brand_id, fechas, prioridad, enlaces, etc.), igual que el PATCH de la UI.
    const oldRow = await queryOne<any>('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!oldRow) {
      res.status(404).json({ error: 'TIUSDEI_TASK_NOT_FOUND', message: 'La tarea no existe o no tienes acceso.' });
      return;
    }

    const allowed = await canEditTask(oldRow, req.userRole, req.userId!, taskId, { operationalOnly: true });
    if (!allowed) {
      res.status(403).json({ error: 'TIUSDEI_FORBIDDEN', message: 'No tienes permiso para cambiar el estado de esta tarea.' });
      return;
    }

    if (estado === oldRow.estado) {
      // No-op: ya está en ese estado. Respondemos ok sin efectos.
      res.json({ ok: true, id: taskId, status: STATUS_REVERSE[estado] ?? estado, url: `${FRONTEND_URL}/tareas?task=${taskId}`, changed: false });
      return;
    }

    await query('UPDATE tasks SET estado = ? WHERE id = ?', [estado, taskId]);

    // ── Efectos secundarios (espejo del PATCH de la UI) ──
    const titulo: string = String(oldRow.titulo_tarea || 'Tarea');
    const estadoLabel = STATUS_REVERSE[estado] ?? estado;
    // Aviso al autor si no es quien hace el cambio.
    if (oldRow.created_by && oldRow.created_by !== req.userId) {
      notifyUser(oldRow.created_by, `La tarea "${titulo}" cambió a estado: ${estadoLabel}`, taskId);
    }
    // Aviso a seguidores.
    notifySeguidores(taskId, `La tarea que sigues "${titulo}" cambió a estado: ${estadoLabel}`, req.userId).catch(() => {});
    // Recurrencia: al ENTREGAR una tarea recurrente, generar la siguiente instancia.
    if (estado === 'entregado' && oldRow.estado !== 'entregado' && oldRow.recurrence_type && oldRow.recurrence_type !== 'none') {
      spawnNextRecurrence(oldRow, req.userId!).catch((e) => console.error('[MCP] recurrence:', e));
    }
    // Activity log.
    logTaskChanges(taskId, oldRow, { estado }, req.userId!).catch(() => {});

    res.json({ ok: true, id: taskId, status: estadoLabel, url: `${FRONTEND_URL}/tareas?task=${taskId}`, changed: true });
  } catch (e) {
    console.error('[MCP] change status:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al cambiar el estado' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// PUT /api/tasks/:id/assignees — REEMPLAZA el conjunto de responsables (assign_task)
// Reasignar NO es operativo: requiere permiso de edición de fondo. Avisa a los
// responsables NUEVOS (in-app + Calendar, sin email, como create).
// ───────────────────────────────────────────────────────────────────────────
const assignSchema = z.object({ assigneeIds: z.array(z.string()).max(20) });

mcpRouter.put('/tasks/:id/assignees', requireApiToken, async (req: AuthRequest, res) => {
  try {
    const taskId = String(req.params.id);
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'TIUSDEI_INVALID_INPUT', message: 'Se espera { assigneeIds: [...] }' });
      return;
    }

    const oldRow = await queryOne<any>(
      'SELECT id, created_by, titulo_tarea, responsable_user_id FROM tasks WHERE id = ?',
      [taskId],
    );
    if (!oldRow) {
      res.status(404).json({ error: 'TIUSDEI_TASK_NOT_FOUND', message: 'La tarea no existe o no tienes acceso.' });
      return;
    }

    const allowed = await canEditTask(oldRow, req.userRole, req.userId!, taskId, { operationalOnly: false });
    if (!allowed) {
      res.status(403).json({ error: 'TIUSDEI_FORBIDDEN', message: 'No tienes permiso para reasignar esta tarea.' });
      return;
    }

    // Validar que los responsables existan y estén activos (patrón de createOneTask).
    const assigneeIds = Array.from(new Set(parsed.data.assigneeIds.filter((x) => typeof x === 'string' && x.length > 0)));
    if (assigneeIds.length > 0) {
      const ph = assigneeIds.map(() => '?').join(',');
      const found = await query<{ id: string }[]>(`SELECT id FROM profiles WHERE id IN (${ph}) AND activo = 1`, assigneeIds);
      const foundIds = new Set(found.map((r) => r.id));
      const missing = assigneeIds.filter((x) => !foundIds.has(x));
      if (missing.length > 0) {
        res.status(400).json({ error: 'TIUSDEI_STALE_ASSIGNEE', message: `Estos responsables no existen o están inactivos: ${missing.join(', ')}. Usa list_assignees.` });
        return;
      }
    }

    // Snapshot de responsables previos (para avisar solo a los NUEVOS).
    const prevRows = await query<{ user_id: string }[]>('SELECT user_id FROM task_responsables WHERE task_id = ?', [taskId]);
    const prevSet = new Set(prevRows.map((r) => r.user_id));
    if (oldRow.responsable_user_id) prevSet.add(String(oldRow.responsable_user_id));

    // Reemplazar el set y sincronizar responsable_user_id con el primero.
    await query('DELETE FROM task_responsables WHERE task_id = ?', [taskId]);
    for (const uid of assigneeIds) {
      await query('INSERT IGNORE INTO task_responsables (id, task_id, user_id) VALUES (?, ?, ?)', [uuid(), taskId, uid]);
    }
    const primary = assigneeIds[0] || null;
    await query('UPDATE tasks SET responsable_user_id = ? WHERE id = ?', [primary, taskId]);

    // Avisos a los nuevos: in-app + Calendar (sin email, como create).
    const titulo: string = String(oldRow.titulo_tarea || 'Tarea');
    for (const uid of assigneeIds) {
      if (!prevSet.has(uid) && uid !== req.userId) {
        notifyUser(uid, `Se te asignó la tarea: ${titulo}`, taskId);
      }
      autoSyncTaskToCalendar(uid, taskId).catch(() => {});
    }

    // Activity log.
    logActivity('task', taskId, 'assign', 'responsable_user_id', oldRow.responsable_user_id ?? null, primary, req.userId!).catch(() => {});

    // Devolver los responsables actuales con nombre.
    let assignees: { id: string; name: string }[] = [];
    if (assigneeIds.length > 0) {
      const ph = assigneeIds.map(() => '?').join(',');
      const rows = await query<{ id: string; nombre: string }[]>(`SELECT id, nombre FROM profiles WHERE id IN (${ph})`, assigneeIds);
      const nameById = new Map(rows.map((r) => [r.id, r.nombre] as const));
      assignees = assigneeIds.map((id) => ({ id, name: nameById.get(id) ?? '' }));
    }

    res.json({ ok: true, id: taskId, assignees, url: `${FRONTEND_URL}/tareas?task=${taskId}` });
  } catch (e) {
    console.error('[MCP] assign task:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al reasignar la tarea' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// PATCH /api/tasks/:id — editar campos de FONDO de una tarea (update_task)
// title, detail, priority, taskType, links, startDate, dueDate. Cambiar la fecha
// de entrega exige rescheduleReason (se registra en task_reschedules), igual que la UI.
// ───────────────────────────────────────────────────────────────────────────
const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  detail: z.string().max(5000).nullable().optional(),
  priority: z.string().optional(),
  taskType: z.string().max(200).optional(),
  department: z.string().max(200).nullable().optional(),
  deliverableType: z.string().max(200).nullable().optional(),
  deliverableQuantity: z.number().int().min(1).max(999).optional(),
  links: z.array(z.string()).max(20).optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().optional(),
  rescheduleReason: z.string().optional(),
});

mcpRouter.patch('/tasks/:id', requireApiToken, async (req: AuthRequest, res) => {
  try {
    const taskId = String(req.params.id);
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'TIUSDEI_INVALID_INPUT', message: 'Datos de actualización inválidos', details: parsed.error.flatten().fieldErrors });
      return;
    }
    const body = parsed.data;

    const oldRow = await queryOne<any>(
      `SELECT id, created_by, responsable_user_id, titulo_tarea, detalle, prioridad,
              task_type_id, department_id, tipo_entregable_id, fecha_inicio, fecha_entrega, fecha_cliente, client_board_id
       FROM tasks WHERE id = ?`,
      [taskId],
    );
    if (!oldRow) {
      res.status(404).json({ error: 'TIUSDEI_TASK_NOT_FOUND', message: 'La tarea no existe o no tienes acceso.' });
      return;
    }

    const allowed = await canEditTask(oldRow, req.userRole, req.userId!, taskId, { operationalOnly: false });
    if (!allowed) {
      res.status(403).json({ error: 'TIUSDEI_FORBIDDEN', message: 'No tienes permiso para editar esta tarea.' });
      return;
    }

    // Construir los campos a actualizar (col DB -> valor).
    const fields: string[] = [];
    const values: unknown[] = [];
    const logData: Record<string, unknown> = {};

    if (body.title !== undefined) { fields.push('titulo_tarea = ?'); values.push(body.title); logData.titulo_tarea = body.title; }
    if (body.detail !== undefined) { fields.push('detalle = ?'); values.push(body.detail || null); logData.detalle = body.detail || null; }

    if (body.priority !== undefined) {
      const prioridad = PRIORITY_MAP[body.priority];
      if (!prioridad) { res.status(400).json({ error: 'TIUSDEI_INVALID_PRIORITY', message: `Prioridad no reconocida: ${body.priority}. Usa get_enums.` }); return; }
      fields.push('prioridad = ?'); values.push(prioridad); logData.prioridad = prioridad;
    }

    if (body.taskType !== undefined) {
      const tt = await queryOne<{ id: string }>('SELECT id FROM task_types WHERE nombre = ? AND activo = 1 LIMIT 1', [body.taskType]);
      if (!tt) { res.status(400).json({ error: 'TIUSDEI_INVALID_TASK_TYPE', message: `Tipo de tarea no reconocido: ${body.taskType}. Usa get_enums.` }); return; }
      fields.push('task_type_id = ?'); values.push(tt.id); logData.task_type_id = tt.id;
    }

    // ── Departamento (opcional, por nombre; null limpia) ──
    let newDepartmentId: string | null | undefined;
    if (body.department !== undefined) {
      if (body.department === null) {
        newDepartmentId = null;
      } else {
        const dept = await queryOne<{ id: string }>('SELECT id FROM departments WHERE nombre = ? AND activo = 1 LIMIT 1', [body.department]);
        if (!dept) { res.status(400).json({ error: 'TIUSDEI_INVALID_DEPARTMENT', message: `Departamento no reconocido: ${body.department}. Usa list_departments.` }); return; }
        newDepartmentId = dept.id;
      }
      fields.push('department_id = ?'); values.push(newDepartmentId); logData.department_id = newDepartmentId;
    }

    // ── Tipo de entregable (opcional, por nombre; null limpia) ──
    let newDeliverableTypeId: string | null | undefined;
    if (body.deliverableType !== undefined) {
      if (body.deliverableType === null) {
        newDeliverableTypeId = null;
      } else {
        const dt = await queryOne<{ id: string }>('SELECT id FROM deliverable_types WHERE nombre = ? AND activo = 1 LIMIT 1', [body.deliverableType]);
        if (!dt) { res.status(400).json({ error: 'TIUSDEI_INVALID_DELIVERABLE_TYPE', message: `Tipo de entregable no reconocido: ${body.deliverableType}. Usa get_enums.` }); return; }
        newDeliverableTypeId = dt.id;
      }
      fields.push('tipo_entregable_id = ?'); values.push(newDeliverableTypeId);
      fields.push('cantidad_entregables = ?'); values.push(newDeliverableTypeId ? (body.deliverableQuantity ?? 1) : 1);
      logData.tipo_entregable_id = newDeliverableTypeId;
    }

    if (body.links !== undefined) {
      const enlaces = body.links.length > 0 ? JSON.stringify(body.links) : null;
      fields.push('enlaces = ?'); values.push(enlaces);
    }

    // Fechas.
    if (body.startDate !== undefined && body.startDate !== null && !ISO_DATE.test(body.startDate)) {
      res.status(400).json({ error: 'TIUSDEI_INVALID_DATE', message: 'startDate debe tener formato YYYY-MM-DD' }); return;
    }
    if (body.dueDate !== undefined && !ISO_DATE.test(body.dueDate)) {
      res.status(400).json({ error: 'TIUSDEI_INVALID_DATE', message: 'dueDate debe tener formato YYYY-MM-DD' }); return;
    }
    if (body.startDate && body.dueDate && body.startDate > body.dueDate) {
      res.status(400).json({ error: 'TIUSDEI_INVALID_DATE', message: 'startDate no puede ser posterior a dueDate' }); return;
    }

    if (body.startDate !== undefined) { fields.push('fecha_inicio = ?'); values.push(body.startDate || null); logData.fecha_inicio = body.startDate || null; }

    // Reschedule: si cambia la fecha de entrega, exigir motivo y registrarlo.
    let rescheduleInfo: { oldFecha: string | null; newFecha: string | null; motivo: string } | null = null;
    if (body.dueDate !== undefined) {
      const normOld = oldRow.fecha_entrega ? new Date(oldRow.fecha_entrega).toISOString().slice(0, 10) : null;
      const normNew = body.dueDate || null;
      if (normOld !== normNew) {
        const motivo = String(body.rescheduleReason || '').toUpperCase();
        if (!MOTIVOS_RESCHEDULE.includes(motivo)) {
          res.status(400).json({ error: 'TIUSDEI_RESCHEDULE_REASON_REQUIRED', message: `Cambiar la fecha de entrega exige rescheduleReason (uno de: ${MOTIVOS_RESCHEDULE.join(', ')}).` });
          return;
        }
        rescheduleInfo = { oldFecha: normOld, newFecha: normNew, motivo };
      }
      fields.push('fecha_entrega = ?'); values.push(body.dueDate); logData.fecha_entrega = body.dueDate;

      // Tablero cliente: si aún no tenía fecha visible, sincronizarla.
      if (oldRow.client_board_id && !oldRow.fecha_cliente) {
        fields.push('fecha_cliente = ?'); values.push(body.dueDate);
      }
    }

    if (fields.length === 0) {
      res.status(400).json({ error: 'TIUSDEI_INVALID_INPUT', message: 'No hay campos para actualizar.' });
      return;
    }

    values.push(taskId);
    await query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values as (string | number | null)[]);

    if (rescheduleInfo) {
      await query(
        'INSERT INTO task_reschedules (id, task_id, fecha_anterior, fecha_nueva, motivo, comentario, changed_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), taskId, rescheduleInfo.oldFecha, rescheduleInfo.newFecha, rescheduleInfo.motivo, null, req.userId],
      );
    }

    // History de departamento: espeja tasks.ts PATCH /tasks/:id — cierra el
    // registro abierto y abre uno nuevo si cambió.
    if (newDepartmentId !== undefined && newDepartmentId !== oldRow.department_id) {
      await query('UPDATE task_department_history SET exited_at = NOW(3) WHERE task_id = ? AND exited_at IS NULL', [taskId]);
      if (newDepartmentId) {
        await query(
          'INSERT INTO task_department_history (id, task_id, department_id, responsable_user_id) VALUES (?, ?, ?, ?)',
          [uuid(), taskId, newDepartmentId, oldRow.responsable_user_id || null],
        );
      }
    }

    // Espejo en task_deliverable_types (caso simple, un solo tipo) — espeja tasks.ts.
    if (newDeliverableTypeId !== undefined) {
      await query('DELETE FROM task_deliverable_types WHERE task_id = ?', [taskId]);
      if (newDeliverableTypeId) {
        await query(
          'INSERT INTO task_deliverable_types (id, task_id, tipo_entregable_id, cantidad) VALUES (?, ?, ?, ?)',
          [uuid(), taskId, newDeliverableTypeId, body.deliverableQuantity ?? 1],
        );
      }
    }

    if (Object.keys(logData).length > 0) {
      logTaskChanges(taskId, oldRow, logData, req.userId!).catch(() => {});
    }

    res.json({ ok: true, id: taskId, url: `${FRONTEND_URL}/tareas?task=${taskId}` });
  } catch (e) {
    console.error('[MCP] update task:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al actualizar la tarea' });
  }
});

// Tope de filas para comentarios/historial (guardarraíl de contexto).
const LIST_LIMIT_DEFAULT = 30;
const LIST_LIMIT_MAX = 100;
function clampLimit(raw: unknown, def: number): number {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== 'string') return def;
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(Math.max(n, 1), LIST_LIMIT_MAX);
}

// ───────────────────────────────────────────────────────────────────────────
// GET /api/tasks/:id/comments — comentarios de una tarea (list_task_comments)
// Permiso: canAccessTask. Devuelve los más recientes (limit) en orden cronológico.
// ───────────────────────────────────────────────────────────────────────────
mcpRouter.get('/tasks/:id/comments', requireApiToken, async (req: AuthRequest, res) => {
  try {
    const taskId = String(req.params.id);
    if (!(await canAccessTask(req.userId!, taskId))) {
      res.status(404).json({ error: 'TIUSDEI_TASK_NOT_FOUND', message: 'La tarea no existe o no tienes acceso.' });
      return;
    }
    const limit = clampLimit(req.query.limit, LIST_LIMIT_DEFAULT);

    const [countRow, rows] = await Promise.all([
      queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM comments WHERE task_id = ?', [taskId]),
      query<any[]>(
        `SELECT c.id, c.comentario, c.image_url,
                DATE_FORMAT(c.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
                p.nombre AS author
         FROM comments c
         LEFT JOIN profiles p ON p.id = c.user_id
         WHERE c.task_id = ?
         ORDER BY c.created_at DESC
         LIMIT ?`,
        [taskId, String(limit)],
      ),
    ]);

    // Traer los N más recientes DESC y devolverlos en orden cronológico (ASC).
    const items = rows.reverse().map((r) => ({
      id: r.id,
      author: r.author ?? null,
      text: r.comentario ?? '',
      imageUrl: r.image_url ?? null,
      createdAt: r.created_at ?? null,
    }));

    res.json({ total: Number(countRow?.total ?? 0), page_size: limit, items });
  } catch (e) {
    console.error('[MCP] list comments:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al cargar los comentarios' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// POST /api/tasks/:id/comments — agregar un comentario (add_task_comment)
// Permiso: canAccessTask. Avisa a seguidores y procesa @menciones, igual que la UI.
// ───────────────────────────────────────────────────────────────────────────
const commentSchema = z.object({ comment: z.string().min(1).max(5000) });

mcpRouter.post('/tasks/:id/comments', requireApiToken, async (req: AuthRequest, res) => {
  try {
    const taskId = String(req.params.id);
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'TIUSDEI_INVALID_INPUT', message: 'El comentario no puede estar vacío. Se espera { comment }' });
      return;
    }
    const text = parsed.data.comment.trim();
    if (!text) {
      res.status(400).json({ error: 'TIUSDEI_INVALID_INPUT', message: 'El comentario no puede estar vacío.' });
      return;
    }

    if (!(await canAccessTask(req.userId!, taskId))) {
      res.status(404).json({ error: 'TIUSDEI_TASK_NOT_FOUND', message: 'La tarea no existe o no tienes acceso.' });
      return;
    }

    const id = uuid();
    await query(
      'INSERT INTO comments (id, task_id, user_id, comentario, contenido_html, image_url) VALUES (?, ?, ?, ?, NULL, NULL)',
      [id, taskId, req.userId, text],
    );

    // Efectos (espejo de tasks.ts): aviso a seguidores + @menciones. Fire-and-forget.
    (async () => {
      try {
        const t = await queryOne<{ titulo_tarea: string }>('SELECT titulo_tarea FROM tasks WHERE id = ?', [taskId]);
        await notifySeguidores(taskId, `Nuevo comentario en la tarea que sigues: ${t?.titulo_tarea || 'Tarea'}`, req.userId);
      } catch { /* best-effort */ }
    })();
    if (req.userId) {
      processCommentMentions({ taskId, authorUserId: req.userId, text }).catch((e) => console.error('[MCP] mentions:', e));
    }

    const row = await queryOne<{ created_at: string }>(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s') AS created_at FROM comments WHERE id = ?`,
      [id],
    );
    res.status(201).json({ ok: true, id, createdAt: row?.created_at ?? null, url: `${FRONTEND_URL}/tareas?task=${taskId}` });
  } catch (e) {
    console.error('[MCP] add comment:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al agregar el comentario' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/tasks/:id/activity — historial de cambios (get_task_activity)
// Permiso: canAccessTask. Filtra el RUIDO del timer y traduce estado/prioridad.
// ───────────────────────────────────────────────────────────────────────────
mcpRouter.get('/tasks/:id/activity', requireApiToken, async (req: AuthRequest, res) => {
  try {
    const taskId = String(req.params.id);
    if (!(await canAccessTask(req.userId!, taskId))) {
      res.status(404).json({ error: 'TIUSDEI_TASK_NOT_FOUND', message: 'La tarea no existe o no tienes acceso.' });
      return;
    }
    const limit = clampLimit(req.query.limit, LIST_LIMIT_DEFAULT);

    const rows = await query<any[]>(
      `SELECT a.action, a.field_name, a.old_value, a.new_value,
              DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
              p.nombre AS user_nombre
       FROM activity_log a
       LEFT JOIN profiles p ON p.id = a.user_id
       WHERE a.entity_type = 'task' AND a.entity_id = ?
         AND (a.field_name IS NULL OR a.field_name NOT IN ('timer_activo', 'timer_inicio', 'tiempo_trabajado'))
       ORDER BY a.created_at DESC
       LIMIT ?`,
      [taskId, String(limit)],
    );

    // Traduce enums a label legible cuando el campo es estado/prioridad.
    const humanize = (field: string | null, value: string | null): string | null => {
      if (value == null) return null;
      if (field === 'estado') return STATUS_REVERSE[value] ?? value;
      if (field === 'prioridad') return PRIORITY_REVERSE[value] ?? value;
      return value;
    };

    const items = rows.map((r) => ({
      action: r.action,
      field: r.field_name ?? null,
      from: humanize(r.field_name, r.old_value),
      to: humanize(r.field_name, r.new_value),
      user: r.user_nombre ?? null,
      at: r.created_at ?? null,
    }));

    res.json({ items });
  } catch (e) {
    console.error('[MCP] task activity:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al cargar el historial' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// DELETE de tareas — POST /api/tasks/:id/delete (delete_task)
//
// DESTRUCTIVO e IRREVERSIBLE, con confirmación en DOS PASOS:
//   Paso 1 (sin confirmToken): valida permiso y devuelve un PREVIEW de la tarea
//           + un confirmToken firmado (NO borra). El agente debe mostrar la tarea
//           y pedir confirmación explícita al usuario.
//   Paso 2 (con confirmToken): valida el token (atado a taskId + usuario, caduca a
//           los 5 min) y recién ahí borra. Una tarea a la vez.
// Permiso: mismo criterio que la UI (site_settings.can_delete_tasks_roles).
// ───────────────────────────────────────────────────────────────────────────
const DELETE_SECRET = process.env.JWT_SECRET || 'tiusdei-mcp-delete-fallback';
const DELETE_TOKEN_TTL_MS = 5 * 60 * 1000;

function makeDeleteToken(taskId: string, userId: string): string {
  const exp = Date.now() + DELETE_TOKEN_TTL_MS;
  const sig = crypto.createHmac('sha256', DELETE_SECRET).update(`${taskId}.${exp}.${userId}`).digest('hex').slice(0, 32);
  return Buffer.from(`${exp}.${sig}`, 'utf8').toString('base64url');
}
function verifyDeleteToken(tokenStr: string, taskId: string, userId: string): { ok: boolean; expired?: boolean } {
  try {
    const [expStr, sig] = Buffer.from(tokenStr, 'base64url').toString('utf8').split('.');
    const exp = Number(expStr);
    if (!exp || !sig) return { ok: false };
    const expected = crypto.createHmac('sha256', DELETE_SECRET).update(`${taskId}.${exp}.${userId}`).digest('hex').slice(0, 32);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return { ok: false };
    if (Date.now() > exp) return { ok: false, expired: true };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

mcpRouter.post('/tasks/:id/delete', requireApiToken, async (req: AuthRequest, res) => {
  try {
    const taskId = String(req.params.id);
    const userId = req.userId!;
    const role = req.userRole;
    const confirmToken = typeof req.body?.confirmToken === 'string' ? req.body.confirmToken : '';

    // ── Permiso por rol (espejo de tasks.ts bulk-delete) ──
    const settingsRow = await queryOne<{ value: string | null }>(
      "SELECT value FROM site_settings WHERE `key` = 'can_delete_tasks_roles'",
    );
    const rolesStr = settingsRow?.value || 'admin,ejecutivo';
    const allowedRoles = rolesStr.split(',').map((r) => r.trim()).filter(Boolean);
    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({ error: 'TIUSDEI_FORBIDDEN', message: 'Tu usuario no tiene permiso para borrar tareas.' });
      return;
    }

    const task = await queryOne<any>(
      `SELECT t.id, t.titulo_tarea, t.estado, t.created_by, b.nombre AS brand_nombre
       FROM tasks t LEFT JOIN brands b ON b.id = t.brand_id WHERE t.id = ?`,
      [taskId],
    );
    if (!task) {
      res.status(404).json({ error: 'TIUSDEI_TASK_NOT_FOUND', message: 'La tarea no existe o no tienes acceso.' });
      return;
    }

    // Acceso + protección para no-admin (espejo de bulk-delete).
    if (role !== 'admin') {
      if (!(await canAccessTask(userId, taskId))) {
        res.status(404).json({ error: 'TIUSDEI_TASK_NOT_FOUND', message: 'La tarea no existe o no tienes acceso.' });
        return;
      }
      if (task.created_by && task.created_by !== userId) {
        const creatorRole = await getUserRole(task.created_by);
        if (creatorRole === 'admin' || creatorRole === 'ejecutivo') {
          res.status(403).json({ error: 'TIUSDEI_FORBIDDEN', message: 'No puedes borrar una tarea creada por un admin o ejecutivo.' });
          return;
        }
      }
    }

    // ── Paso 1: sin token → preview + confirmToken (NO borra) ──
    if (!confirmToken) {
      res.json({
        needsConfirmation: true,
        task: {
          id: task.id,
          title: task.titulo_tarea,
          brand: task.brand_nombre ?? null,
          status: STATUS_REVERSE[task.estado] ?? task.estado,
        },
        confirmToken: makeDeleteToken(taskId, userId),
        message: 'CONFIRMACIÓN REQUERIDA: muéstrale esta tarea al usuario y pide su confirmación EXPLÍCITA. Si confirma, vuelve a llamar delete_task con el mismo taskId y este confirmToken. El borrado es IRREVERSIBLE.',
      });
      return;
    }

    // ── Paso 2: con token → validar y borrar ──
    const v = verifyDeleteToken(confirmToken, taskId, userId);
    if (!v.ok) {
      res.status(400).json({
        error: v.expired ? 'TIUSDEI_CONFIRM_EXPIRED' : 'TIUSDEI_CONFIRM_INVALID',
        message: v.expired
          ? 'El token de confirmación expiró. Vuelve a llamar delete_task SIN confirmToken para obtener uno nuevo.'
          : 'Token de confirmación inválido. Vuelve a llamar delete_task SIN confirmToken.',
      });
      return;
    }

    await query('DELETE FROM tasks WHERE id = ?', [taskId]);
    logActivity('task', taskId, 'delete', null, task.titulo_tarea ?? null, null, userId).catch(() => {});

    res.json({ ok: true, deleted: 1, id: taskId, title: task.titulo_tarea });
  } catch (e) {
    console.error('[MCP] delete task:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al borrar la tarea' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// TIMER — start_timer / stop_timer / get_active_timer
//
// Espeja time-sessions.ts: usa la tabla `time_entries` (+ los campos
// timer_activo/timer_inicio/tiempo_trabajado de `tasks`, por compatibilidad con
// la UI). Regla clave: UN timer activo a la vez por usuario. El tiempo se acumula
// en tasks.tiempo_trabajado al parar. El servidor corre en UTC, así que se replica
// el mismo manejo de fechas de la UI (proven en producción).
// ───────────────────────────────────────────────────────────────────────────
function humanDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
function nowSql(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

// POST /api/tasks/:id/timer/start — arranca el timer en una tarea.
mcpRouter.post('/tasks/:id/timer/start', requireApiToken, async (req: AuthRequest, res) => {
  try {
    const taskId = String(req.params.id);
    const userId = req.userId!;
    if (!(await canAccessTask(userId, taskId))) {
      res.status(404).json({ error: 'TIUSDEI_TASK_NOT_FOUND', message: 'La tarea no existe o no tienes acceso.' });
      return;
    }

    // Uno a la vez: si ya hay una sesión activa del usuario, avisar (o no-op si es la misma tarea).
    const active = await queryOne<{ id: string; task_id: string; titulo_tarea: string }>(
      `SELECT te.id, te.task_id, t.titulo_tarea
       FROM time_entries te JOIN tasks t ON t.id = te.task_id
       WHERE te.user_id = ? AND te.status = 'active' LIMIT 1`,
      [userId],
    );
    if (active) {
      if (active.task_id === taskId) {
        res.json({ ok: true, alreadyRunning: true, taskId, message: 'El timer ya estaba corriendo en esta tarea.' });
        return;
      }
      res.status(409).json({
        error: 'TIUSDEI_TIMER_ACTIVE',
        message: `Ya tienes un timer activo en otra tarea: "${active.titulo_tarea}". Párala primero (stop_timer) o pregúntale al usuario si quiere cambiar.`,
        activeTaskId: active.task_id,
        activeTaskTitle: active.titulo_tarea,
      });
      return;
    }

    const now = nowSql();
    const id = uuid();
    await query(
      `INSERT INTO time_entries (id, task_id, user_id, start_time, status) VALUES (?, ?, ?, ?, 'active')`,
      [id, taskId, userId, now],
    );
    await query('UPDATE tasks SET timer_activo = 1, timer_inicio = ? WHERE id = ?', [now, taskId]);

    // Auto-play: si la tarea estaba en backlog, pasa a en_proceso (mismo comportamiento que la UI).
    const t = await queryOne<{ estado: string }>('SELECT estado FROM tasks WHERE id = ?', [taskId]);
    let newStatus: string | null = null;
    if (t && t.estado === 'backlog') {
      await query('UPDATE tasks SET estado = ? WHERE id = ?', ['en_proceso', taskId]);
      newStatus = 'en_proceso';
      logActivity('task', taskId, 'status_change', 'estado', 'backlog', 'en_proceso', userId).catch(() => {});
    }

    res.status(201).json({
      ok: true,
      started: true,
      sessionId: id,
      taskId,
      startedAt: now,
      autoStatus: newStatus ? (STATUS_REVERSE[newStatus] ?? newStatus) : null,
    });
  } catch (e) {
    console.error('[MCP] start timer:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al iniciar el timer' });
  }
});

// POST /api/timer/stop — para el timer activo del usuario (solo hay uno).
mcpRouter.post('/timer/stop', requireApiToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const session = await queryOne<{ id: string; task_id: string; start_time: string; idle_seconds: number | null; titulo_tarea: string }>(
      `SELECT te.id, te.task_id, te.start_time, te.idle_seconds, t.titulo_tarea
       FROM time_entries te JOIN tasks t ON t.id = te.task_id
       WHERE te.user_id = ? AND te.status IN ('active', 'paused')
       ORDER BY te.start_time DESC LIMIT 1`,
      [userId],
    );
    if (!session) {
      res.json({ ok: true, wasRunning: false, message: 'No tenías ningún timer activo.' });
      return;
    }

    const totalSeconds = Math.floor((Date.now() - new Date(session.start_time).getTime()) / 1000);
    const effective = Math.max(0, totalSeconds - (session.idle_seconds || 0));
    const nowStr = nowSql();

    await query(
      `UPDATE time_entries SET end_time = ?, duration_seconds = ?, status = 'completed' WHERE id = ?`,
      [nowStr, effective, session.id],
    );
    await query(
      'UPDATE tasks SET tiempo_trabajado = tiempo_trabajado + ?, timer_activo = 0, timer_inicio = NULL WHERE id = ?',
      [effective, session.task_id],
    );

    res.json({
      ok: true,
      wasRunning: true,
      taskId: session.task_id,
      taskTitle: session.titulo_tarea,
      durationSeconds: effective,
      duration: humanDuration(effective),
    });
  } catch (e) {
    console.error('[MCP] stop timer:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al detener el timer' });
  }
});

// GET /api/timer/active — qué está cronometrando el usuario ahora.
mcpRouter.get('/timer/active', requireApiToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const session = await queryOne<{ task_id: string; start_time: string; titulo_tarea: string; brand_nombre: string | null }>(
      `SELECT te.task_id, te.start_time, t.titulo_tarea, b.nombre AS brand_nombre
       FROM time_entries te JOIN tasks t ON t.id = te.task_id
       LEFT JOIN brands b ON b.id = t.brand_id
       WHERE te.user_id = ? AND te.status = 'active' LIMIT 1`,
      [userId],
    );
    if (!session) {
      res.json({ active: null });
      return;
    }
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(session.start_time).getTime()) / 1000));
    res.json({
      active: {
        taskId: session.task_id,
        taskTitle: session.titulo_tarea,
        brand: session.brand_nombre ?? null,
        startedAt: session.start_time,
        elapsedSeconds: elapsed,
        elapsed: humanDuration(elapsed),
        url: `${FRONTEND_URL}/tareas?task=${session.task_id}`,
      },
    });
  } catch (e) {
    console.error('[MCP] active timer:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al consultar el timer' });
  }
});
