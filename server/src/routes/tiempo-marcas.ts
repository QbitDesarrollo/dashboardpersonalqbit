import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

// Tiempo por marca en un mes (pedido de Steven, 23-sep-2026): cuántos entregables
// se entregaron por marca, cuántas horas registró el equipo en esa marca y cuánto
// se había estimado, para ver si lo que se hace calza con lo vendido.
//  - entregados: tareas que pasaron a entregado/aprobado dentro del mes (activity_log)
//  - horas registradas: sesiones de timer iniciadas en el mes sobre tareas de la marca
//  - horas estimadas: de las tareas entregadas en el mes (estimado de la tarea, o el
//    estándar por tipo de entregable × cantidad)
export const tiempoMarcasRouter = Router();
const TZ_OFF = '-05:00';

tiempoMarcasRouter.get('/metrics/tiempo-por-marca', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await hasRole(req.userId!, ['admin', 'ejecutivo']))) return res.status(403).json({ error: 'Sin permisos' });
    const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || '')) ? String(req.query.mes) : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date()).slice(0, 7);
    const deskId = typeof req.query.desk_id === 'string' && req.query.desk_id ? req.query.desk_id : null;
    const [y, m] = mes.split('-').map(Number);
    const desde = `${mes}-01 00:00:00`;
    const hasta = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString().slice(0, 10) + ' 00:00:00';
    const deskCond = deskId ? ' AND t.desk_id = ?' : '';
    const deskParam = deskId ? [deskId] : [];

    const [entregas, horas] = await Promise.all([
      query<any[]>(
        `SELECT t.brand_id, COUNT(*) AS tareas,
                SUM(GREATEST(1, COALESCE(t.cantidad_entregables, 1))) AS entregables,
                SUM(COALESCE(NULLIF(t.estimated_hours, 0),
                    (SELECT SUM(tdt.cantidad * dt.minutos_estimados) / 60 FROM task_deliverable_types tdt
                      JOIN deliverable_types dt ON dt.id = tdt.tipo_entregable_id
                      WHERE tdt.task_id = t.id AND dt.minutos_estimados > 0), 0)) AS horas_estimadas,
                SUM(t.estimated_hours IS NULL OR t.estimated_hours = 0) AS sin_estimar
         FROM tasks t
         WHERE t.id IN (
           SELECT al.entity_id FROM activity_log al
           WHERE al.entity_type = 'task' AND al.field_name = 'estado'
             AND al.new_value IN ('entregado','aprobado')
             AND CONVERT_TZ(al.created_at, '+00:00', '${TZ_OFF}') >= ? AND CONVERT_TZ(al.created_at, '+00:00', '${TZ_OFF}') < ?
         )${deskCond}
         GROUP BY t.brand_id`,
        [desde, hasta, ...deskParam],
      ),
      query<any[]>(
        `SELECT t.brand_id, SUM(te.duration_seconds) / 3600 AS horas, COUNT(DISTINCT te.user_id) AS personas
         FROM time_entries te JOIN tasks t ON t.id = te.task_id
         WHERE te.status = 'completed'
           AND CONVERT_TZ(te.start_time, '+00:00', '${TZ_OFF}') >= ? AND CONVERT_TZ(te.start_time, '+00:00', '${TZ_OFF}') < ?${deskCond}
         GROUP BY t.brand_id`,
        [desde, hasta, ...deskParam],
      ),
    ]);
    const ids = Array.from(new Set([...entregas, ...horas].map((r) => r.brand_id).filter(Boolean)));
    const nombres = ids.length
      ? await query<{ id: string; nombre: string }[]>(`SELECT id, nombre FROM brands WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
      : [];
    const nombrePor = new Map(nombres.map((b) => [b.id, b.nombre]));
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const filas = ids.map((id) => {
      const e = entregas.find((x) => x.brand_id === id);
      const h = horas.find((x) => x.brand_id === id);
      const reg = Number(h?.horas || 0);
      const ent = Number(e?.entregables || 0);
      return {
        brand_id: id,
        marca: nombrePor.get(id) || '(sin marca)',
        tareas_entregadas: Number(e?.tareas || 0),
        entregables: ent,
        horas_registradas: r1(reg),
        horas_estimadas: r1(Number(e?.horas_estimadas || 0)),
        sin_estimar: Number(e?.sin_estimar || 0),
        personas: Number(h?.personas || 0),
        horas_por_entregable: ent > 0 ? r1(reg / ent) : null,
        pct_mes_persona: Math.round((reg / 160) * 100),
      };
    }).sort((a, b) => b.horas_registradas - a.horas_registradas);
    res.json({ mes, desk_id: deskId, filas });
  } catch (e) {
    console.error('[TIEMPO-MARCAS]', e);
    res.status(500).json({ error: 'Error al calcular el tiempo por marca' });
  }
});
