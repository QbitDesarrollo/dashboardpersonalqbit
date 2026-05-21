import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query } from '../db/mysql.js';
import { getUserRole } from '../utils/roles.js';

export const metricsRouter = Router();

/** Parsea un old_value de fecha del activity_log que puede venir en formatos varios:
 *  "2026-04-30"
 *  "Fri Apr 30 2026 00:00:00 GMT+0000 (...)"
 *  "Mon Apr 27 2026 00:00:00 GMT+0000 (...)"
 *
 *  Devuelve un Date o null.
 */
function parseDeadlineLogValue(value: string | null): Date | null {
  if (!value) return null;
  const v = value.trim();
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return new Date(v + 'T00:00:00Z');
  }
  // "Fri Apr 30 2026 ..." o ISO con tiempo
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /tasks/:id/deadline-history
// Historial de cambios de fecha_entrega de una tarea + count + fecha original
// ─────────────────────────────────────────────────────────────────────────────
metricsRouter.get('/tasks/:id/deadline-history', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const task = await query<any[]>('SELECT id, fecha_entrega FROM tasks WHERE id = ?', [id]);
    if (!task[0]) return res.status(404).json({ error: 'Tarea no encontrada' });

    const rows = await query<any[]>(
      `SELECT tr.fecha_anterior, tr.fecha_nueva, tr.motivo, tr.comentario, tr.changed_at, p.nombre AS user_nombre, p.id AS user_id
       FROM task_reschedules tr
       LEFT JOIN profiles p ON p.id = tr.changed_by
       WHERE tr.task_id = ?
       ORDER BY tr.changed_at ASC`,
      [id]
    );

    const history = rows.map((r: any) => ({
      old: r.fecha_anterior ? dateOnly(new Date(r.fecha_anterior)) : null,
      new: r.fecha_nueva ? dateOnly(new Date(r.fecha_nueva)) : null,
      motivo: r.motivo || 'SIN_CLASIFICAR',
      comentario: r.comentario || null,
      by: r.user_nombre || 'Sistema',
      by_user_id: r.user_id || null,
      at: r.changed_at,
    }));

    // Fecha original = primer fecha_anterior conocida, si no la actual.
    const firstOld = rows.length > 0 && rows[0].fecha_anterior ? new Date(rows[0].fecha_anterior) : null;
    const fechaOriginal = firstOld ? dateOnly(firstOld) : (task[0].fecha_entrega ? new Date(task[0].fecha_entrega).toISOString().slice(0, 10) : null);

    res.json({
      task_id: id,
      fecha_entrega_actual: task[0].fecha_entrega ? new Date(task[0].fecha_entrega).toISOString().slice(0, 10) : null,
      fecha_entrega_original: fechaOriginal,
      reschedule_count: rows.length,
      history,
    });
  } catch (e) {
    console.error('[METRICS] deadline-history:', e);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /metrics/cumplimiento?from=YYYY-MM-DD&to=YYYY-MM-DD&desk_id=&responsable_id=
// Métricas agregadas de cumplimiento por responsable
// Permisos:
//   - admin: ve todos
//   - ejecutivo: ve solo miembros de sus mesas + a sí mismo
//   - equipo: ve solo a sí mismo
//   - cliente: 403
// ─────────────────────────────────────────────────────────────────────────────
metricsRouter.get('/metrics/cumplimiento', requireAuth, async (req: AuthRequest, res) => {
  try {
    const role = await getUserRole(req.userId!);
    if (role === 'cliente') return res.status(403).json({ error: 'Sin acceso' });

    const from = (req.query.from as string) || new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
    const deskFilter = req.query.desk_id as string | undefined;
    const responsableFilter = req.query.responsable_id as string | undefined;

    // Determinar qué user_ids puede ver según rol
    let allowedUserIds: string[] | null = null; // null = todos (admin)
    if (role === 'ejecutivo') {
      const myDesks = await query<{ desk_id: string }[]>('SELECT desk_id FROM desk_members WHERE user_id = ?', [req.userId]);
      const deskIds = myDesks.map((d) => d.desk_id);
      if (deskIds.length === 0) {
        allowedUserIds = [req.userId!];
      } else {
        const ph = deskIds.map(() => '?').join(',');
        const members = await query<{ user_id: string }[]>(
          `SELECT DISTINCT user_id FROM desk_members WHERE desk_id IN (${ph})`,
          deskIds
        );
        allowedUserIds = Array.from(new Set([req.userId!, ...members.map((m) => m.user_id)]));
      }
    } else if (role === 'equipo') {
      allowedUserIds = [req.userId!];
    }

    // Filtro por responsable específico (solo si está permitido)
    let targetUserIds: string[] | null = null;
    if (responsableFilter) {
      if (allowedUserIds && !allowedUserIds.includes(responsableFilter)) {
        return res.status(403).json({ error: 'Sin acceso a ese responsable' });
      }
      targetUserIds = [responsableFilter];
    } else {
      targetUserIds = allowedUserIds;
    }

    // 1. Tareas relevantes en el rango (responsable principal o co-responsable, no subtareas)
    const params: any[] = [from, to];
    let userScope = '';
    if (targetUserIds) {
      const ph = targetUserIds.map(() => '?').join(',');
      userScope = ` AND user_id IN (${ph})`;
      params.push(...targetUserIds);
    }
    let deskScope = '';
    if (deskFilter) {
      deskScope = ' AND task_desk_id = ?';
      params.push(deskFilter);
    }

    const tasksRows = await query<any[]>(
      `SELECT * FROM (
        SELECT t.id AS task_id, t.titulo_tarea, t.fecha_entrega, t.estado, t.desk_id AS task_desk_id, t.responsable_user_id AS user_id
        FROM tasks t
        WHERE t.responsable_user_id IS NOT NULL
          AND DATE(t.created_at) BETWEEN ? AND ?
          AND (t.parent_task_id IS NULL OR t.parent_task_id = '')
        UNION
        SELECT t.id AS task_id, t.titulo_tarea, t.fecha_entrega, t.estado, t.desk_id AS task_desk_id, tr.user_id AS user_id
        FROM task_responsables tr
        INNER JOIN tasks t ON t.id = tr.task_id
        WHERE DATE(t.created_at) BETWEEN ? AND ?
          AND (t.parent_task_id IS NULL OR t.parent_task_id = '')
      ) ut
      WHERE 1=1${userScope}${deskScope}`,
      [from, to, ...params.slice(0, params.length)] // re-pasar from,to por la segunda mitad del UNION
    );
    // Nota: el SQL de arriba pasa los mismos params para ambas mitades del UNION.
    // Re-armar correctamente:
    const finalParams = [from, to, from, to];
    if (targetUserIds) finalParams.push(...targetUserIds);
    if (deskFilter) finalParams.push(deskFilter);

    const tasksRowsFinal = await query<any[]>(
      `SELECT * FROM (
        SELECT t.id AS task_id, t.titulo_tarea, t.fecha_entrega, t.estado, t.desk_id AS task_desk_id, t.responsable_user_id AS user_id
        FROM tasks t
        WHERE t.responsable_user_id IS NOT NULL
          AND DATE(t.created_at) BETWEEN ? AND ?
          AND (t.parent_task_id IS NULL OR t.parent_task_id = '')
        UNION
        SELECT t.id AS task_id, t.titulo_tarea, t.fecha_entrega, t.estado, t.desk_id AS task_desk_id, tr.user_id AS user_id
        FROM task_responsables tr
        INNER JOIN tasks t ON t.id = tr.task_id
        WHERE DATE(t.created_at) BETWEEN ? AND ?
          AND (t.parent_task_id IS NULL OR t.parent_task_id = '')
      ) ut
      WHERE 1=1${userScope}${deskScope}`,
      finalParams
    );

    const taskIds = Array.from(new Set(tasksRowsFinal.map((r: any) => r.task_id)));

    // 2. Reschedules desde task_reschedules — calcular fecha objetivo JUSTA por tarea.
    //    Lógica: la vara arranca en la fecha original. Cada reschedule INTERNO NO la mueve
    //    (el equipo se comprometió y no cumplió). Cada reschedule CLIENTE/ALCANCE/FUERZA_MAYOR/
    //    SIN_CLASIFICAR SÍ la mueve (no es culpa del equipo → se perdona).
    let reschedRows: any[] = [];
    if (taskIds.length > 0) {
      const ph = taskIds.map(() => '?').join(',');
      reschedRows = await query<any[]>(
        `SELECT task_id, fecha_anterior, fecha_nueva, motivo, changed_at
         FROM task_reschedules WHERE task_id IN (${ph})
         ORDER BY task_id, changed_at ASC`,
        taskIds
      );
    }
    const reschedulesByTask: Record<string, number> = {};
    const reschedulesInternosByTask: Record<string, number> = {};
    const fechaObjetivoByTask: Record<string, Date | null> = {};   // fecha justa contra la que se mide
    const fechaOriginalByTask: Record<string, Date | null> = {};   // primera fecha prometida (para mostrar)
    for (const r of reschedRows) {
      const tid = r.task_id;
      reschedulesByTask[tid] = (reschedulesByTask[tid] || 0) + 1;
      if (r.motivo === 'INTERNO') reschedulesInternosByTask[tid] = (reschedulesInternosByTask[tid] || 0) + 1;
      // fecha original = primer fecha_anterior conocida
      if (!(tid in fechaOriginalByTask)) {
        fechaOriginalByTask[tid] = r.fecha_anterior ? new Date(r.fecha_anterior) : null;
        fechaObjetivoByTask[tid] = r.fecha_anterior ? new Date(r.fecha_anterior) : null;
      }
      // mover la vara solo si NO es interno
      if (r.motivo !== 'INTERNO' && r.fecha_nueva) {
        fechaObjetivoByTask[tid] = new Date(r.fecha_nueva);
      }
    }

    // 3. Cambios a estado entregado/aprobado (para fecha de entrega real)
    let deliveryLogs: any[] = [];
    if (taskIds.length > 0) {
      const ph = taskIds.map(() => '?').join(',');
      deliveryLogs = await query<any[]>(
        `SELECT entity_id AS task_id, MIN(created_at) AS delivered_at
         FROM activity_log
         WHERE entity_type = 'task' AND field_name = 'estado'
           AND new_value IN ('entregado', 'aprobado')
           AND entity_id IN (${ph})
         GROUP BY entity_id`,
        taskIds
      );
    }
    const deliveredAtByTask: Record<string, Date> = {};
    for (const d of deliveryLogs) {
      deliveredAtByTask[d.task_id] = new Date(d.delivered_at);
    }

    // 4. Calcular métricas por usuario
    type UserMetric = {
      user_id: string;
      tareas_total: number;
      entregadas_a_tiempo: number;
      entregadas_tarde: number;
      vencidas_no_entregadas: number;
      en_proceso: number;
      reschedules_total: number;
      reschedules_internos: number;
      task_ids: string[];
    };
    const byUser: Record<string, UserMetric> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const t of tasksRowsFinal) {
      const uid = t.user_id;
      if (!byUser[uid]) {
        byUser[uid] = {
          user_id: uid,
          tareas_total: 0,
          entregadas_a_tiempo: 0,
          entregadas_tarde: 0,
          vencidas_no_entregadas: 0,
          en_proceso: 0,
          reschedules_total: 0,
          reschedules_internos: 0,
          task_ids: [],
        };
      }
      const m = byUser[uid];
      m.tareas_total += 1;
      m.reschedules_total += reschedulesByTask[t.task_id] || 0;
      m.reschedules_internos += reschedulesInternosByTask[t.task_id] || 0;
      m.task_ids.push(t.task_id);

      // Fecha objetivo JUSTA: la vara movida solo por reschedules no-internos.
      // Si no hubo reschedules registrados, la vara es la fecha_entrega actual de la tarea.
      const fechaObjetivo = fechaObjetivoByTask[t.task_id] || (t.fecha_entrega ? new Date(t.fecha_entrega) : null);
      const deliveredAt = deliveredAtByTask[t.task_id];

      if (deliveredAt) {
        if (fechaObjetivo) {
          const fObj = new Date(fechaObjetivo); fObj.setHours(23, 59, 59, 999);
          if (deliveredAt <= fObj) m.entregadas_a_tiempo += 1;
          else m.entregadas_tarde += 1;
        } else {
          // Sin fecha objetivo conocida → no penalizar
          m.entregadas_a_tiempo += 1;
        }
      } else {
        // No entregada — vencida solo si la fecha objetivo justa ya pasó
        const fObjVencer = fechaObjetivo || (t.fecha_entrega ? new Date(t.fecha_entrega) : null);
        if (fObjVencer && fObjVencer < today && !['entregado', 'aprobado'].includes(t.estado)) {
          m.vencidas_no_entregadas += 1;
        } else {
          m.en_proceso += 1;
        }
      }
    }

    // 5. Enriquecer con datos del perfil
    const userIds = Object.keys(byUser);
    let profiles: any[] = [];
    if (userIds.length > 0) {
      const ph = userIds.map(() => '?').join(',');
      profiles = await query<any[]>(
        `SELECT id, nombre, email, avatar_url, rol FROM profiles WHERE id IN (${ph})`,
        userIds
      );
    }
    const profileById = new Map(profiles.map((p: any) => [p.id, p]));

    const result = Object.values(byUser).map((m) => {
      const completadas = m.entregadas_a_tiempo + m.entregadas_tarde;
      const porcentaje = completadas > 0 ? (m.entregadas_a_tiempo / completadas) * 100 : null;
      const promedioReschedules = m.tareas_total > 0 ? m.reschedules_total / m.tareas_total : 0;
      const p = profileById.get(m.user_id);
      return {
        user_id: m.user_id,
        nombre: p?.nombre || 'Desconocido',
        email: p?.email || null,
        avatar_url: p?.avatar_url || null,
        rol: p?.rol || null,
        tareas_total: m.tareas_total,
        entregadas_a_tiempo: m.entregadas_a_tiempo,
        entregadas_tarde: m.entregadas_tarde,
        vencidas_no_entregadas: m.vencidas_no_entregadas,
        en_proceso: m.en_proceso,
        promedio_reschedules: Number(promedioReschedules.toFixed(2)),
        reschedules_internos: m.reschedules_internos,
        reschedules_total: m.reschedules_total,
        porcentaje_cumplimiento: porcentaje !== null ? Number(porcentaje.toFixed(1)) : null,
      };
    });

    result.sort((a, b) => b.tareas_total - a.tareas_total);

    res.json({
      from,
      to,
      total_responsables: result.length,
      total_tareas: result.reduce((sum, r) => sum + r.tareas_total, 0),
      responsables: result,
    });
  } catch (e) {
    console.error('[METRICS] cumplimiento:', e);
    res.status(500).json({ error: 'Error al calcular métricas' });
  }
});

// GET /metrics/department-times — tiempo promedio que las tareas pasan en cada departamento.
// Calculado desde task_department_history (entered_at → exited_at). Períodos abiertos
// (exited_at NULL) cuentan hasta ahora. Filtros opcionales: desk_id, brand_id, from, to.
metricsRouter.get('/metrics/department-times', requireAuth, async (req: AuthRequest, res) => {
  try {
    const deskId = typeof req.query.desk_id === 'string' && req.query.desk_id ? req.query.desk_id : null;
    const brandId = typeof req.query.brand_id === 'string' && req.query.brand_id ? req.query.brand_id : null;
    const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : null;
    const to = typeof req.query.to === 'string' && req.query.to ? req.query.to : null;

    const conds: string[] = ['h.department_id IS NOT NULL'];
    const params: unknown[] = [];
    if (deskId) { conds.push('t.desk_id = ?'); params.push(deskId); }
    if (brandId) { conds.push('t.brand_id = ?'); params.push(brandId); }
    if (from) { conds.push('h.entered_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { conds.push('h.entered_at <= ?'); params.push(to + ' 23:59:59'); }

    const rows = await query<any[]>(
      `SELECT d.id AS department_id, d.nombre, d.color, d.orden,
              COUNT(*) AS periodos,
              COUNT(DISTINCT h.task_id) AS tareas,
              AVG(TIMESTAMPDIFF(SECOND, h.entered_at, COALESCE(h.exited_at, NOW(3)))) AS avg_seconds,
              SUM(CASE WHEN h.exited_at IS NULL THEN 1 ELSE 0 END) AS abiertos
       FROM task_department_history h
       INNER JOIN departments d ON d.id = h.department_id
       LEFT JOIN tasks t ON t.id = h.task_id
       WHERE ${conds.join(' AND ')}
       GROUP BY d.id, d.nombre, d.color, d.orden
       ORDER BY d.orden, d.nombre`,
      params
    );

    res.json({
      from,
      to,
      departments: rows.map((r) => ({
        department_id: r.department_id,
        nombre: r.nombre,
        color: r.color,
        periodos: Number(r.periodos),
        tareas: Number(r.tareas),
        abiertos: Number(r.abiertos),
        avg_seconds: r.avg_seconds != null ? Math.round(Number(r.avg_seconds)) : 0,
        avg_horas: r.avg_seconds != null ? Number((Number(r.avg_seconds) / 3600).toFixed(1)) : 0,
        avg_dias: r.avg_seconds != null ? Number((Number(r.avg_seconds) / 86400).toFixed(1)) : 0,
      })),
    });
  } catch (e) {
    console.error('[METRICS] department-times:', e);
    res.status(500).json({ error: 'Error al calcular tiempos por departamento' });
  }
});
