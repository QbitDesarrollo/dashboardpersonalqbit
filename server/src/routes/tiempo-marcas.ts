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
// Desde el 5-oct (reunión Fadel/Steven del 29-sep) también por persona: quién puso
// cuántas horas en cada marca y qué % de su mes (160 h) representa.
export const tiempoMarcasRouter = Router();
const TZ_OFF = '-05:00';
const HORAS_MES = 160;

tiempoMarcasRouter.get('/metrics/tiempo-por-marca', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await hasRole(req.userId!, ['admin', 'ejecutivo']))) return res.status(403).json({ error: 'Sin permisos' });
    const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || '')) ? String(req.query.mes) : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date()).slice(0, 7);
    const deskId = typeof req.query.desk_id === 'string' && req.query.desk_id ? req.query.desk_id : null;
    const userId = typeof req.query.user_id === 'string' && req.query.user_id ? req.query.user_id : null;
    const [y, m] = mes.split('-').map(Number);
    const desde = `${mes}-01 00:00:00`;
    const hasta = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString().slice(0, 10) + ' 00:00:00';
    const deskCond = deskId ? ' AND t.desk_id = ?' : '';
    const deskParam = deskId ? [deskId] : [];
    // Con persona: entregas donde es responsable o co-responsable, y solo sus horas
    const userEntregaCond = userId ? ' AND (t.responsable_user_id = ? OR t.id IN (SELECT task_id FROM task_responsables WHERE user_id = ?))' : '';
    const userEntregaParam = userId ? [userId, userId] : [];
    const userHorasCond = userId ? ' AND te.user_id = ?' : '';
    const userHorasParam = userId ? [userId] : [];

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
         )${deskCond}${userEntregaCond}
         GROUP BY t.brand_id`,
        [desde, hasta, ...deskParam, ...userEntregaParam],
      ),
      // Horas por marca y persona; los totales por marca salen de sumar esto
      query<any[]>(
        `SELECT t.brand_id, te.user_id, SUM(te.duration_seconds) / 3600 AS horas, COUNT(DISTINCT te.task_id) AS tareas
         FROM time_entries te JOIN tasks t ON t.id = te.task_id
         WHERE te.status = 'completed'
           AND CONVERT_TZ(te.start_time, '+00:00', '${TZ_OFF}') >= ? AND CONVERT_TZ(te.start_time, '+00:00', '${TZ_OFF}') < ?${deskCond}${userHorasCond}
         GROUP BY t.brand_id, te.user_id`,
        [desde, hasta, ...deskParam, ...userHorasParam],
      ),
    ]);
    const ids = Array.from(new Set([...entregas, ...horas].map((r) => r.brand_id).filter(Boolean)));
    const userIds = Array.from(new Set(horas.map((r) => r.user_id).filter(Boolean)));
    const [nombres, personasRows] = await Promise.all([
      ids.length ? query<{ id: string; nombre: string }[]>(`SELECT id, nombre FROM brands WHERE id IN (${ids.map(() => '?').join(',')})`, ids) : Promise.resolve([]),
      userIds.length ? query<{ id: string; nombre: string }[]>(`SELECT id, nombre FROM profiles WHERE id IN (${userIds.map(() => '?').join(',')})`, userIds) : Promise.resolve([]),
    ]);
    const nombrePor = new Map(nombres.map((b) => [b.id, b.nombre]));
    const personaPor = new Map(personasRows.map((p) => [p.id, String(p.nombre || '').trim() || 'Sin nombre']));
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const pctMes = (h: number) => Math.round((h / HORAS_MES) * 100);

    const filas = ids.map((id) => {
      const e = entregas.find((x) => x.brand_id === id);
      const deLaMarca = horas.filter((x) => x.brand_id === id);
      const reg = deLaMarca.reduce((a, x) => a + Number(x.horas || 0), 0);
      const ent = Number(e?.entregables || 0);
      const porPersona = deLaMarca
        .map((x) => {
          const h = Number(x.horas || 0);
          return {
            user_id: x.user_id as string,
            nombre: personaPor.get(x.user_id) || 'Sin nombre',
            horas: r1(h),
            tareas: Number(x.tareas || 0),
            pct_mes: pctMes(h),
            pct_marca: reg > 0 ? Math.round((h / reg) * 100) : 0,
          };
        })
        .filter((p) => p.horas > 0)
        .sort((a, b) => b.horas - a.horas);
      return {
        brand_id: id,
        marca: nombrePor.get(id) || '(sin marca)',
        tareas_entregadas: Number(e?.tareas || 0),
        entregables: ent,
        horas_registradas: r1(reg),
        horas_estimadas: r1(Number(e?.horas_estimadas || 0)),
        sin_estimar: Number(e?.sin_estimar || 0),
        personas: porPersona.length,
        horas_por_entregable: ent > 0 ? r1(reg / ent) : null,
        // Suma de horas de todos ÷ 160: 172 % = 1,7 personas a tiempo completo
        pct_mes_persona: pctMes(reg),
        por_persona: porPersona,
      };
    }).sort((a, b) => b.horas_registradas - a.horas_registradas);

    // Vista por persona: en qué marcas puso sus horas del mes
    const personas = userIds.map((uid) => {
      const mias = horas.filter((x) => x.user_id === uid);
      const total = mias.reduce((a, x) => a + Number(x.horas || 0), 0);
      const marcas = mias
        .map((x) => {
          const h = Number(x.horas || 0);
          return { brand_id: x.brand_id as string | null, marca: nombrePor.get(x.brand_id) || '(sin marca)', horas: r1(h), tareas: Number(x.tareas || 0), pct_mes: pctMes(h), pct_persona: total > 0 ? Math.round((h / total) * 100) : 0 };
        })
        .filter((x) => x.horas > 0)
        .sort((a, b) => b.horas - a.horas);
      return { user_id: uid, nombre: personaPor.get(uid) || 'Sin nombre', horas: r1(total), pct_mes: pctMes(total), marcas };
    }).filter((p) => p.horas > 0).sort((a, b) => b.horas - a.horas);

    res.json({ mes, desk_id: deskId, user_id: userId, horas_mes: HORAS_MES, filas, personas });
  } catch (e) {
    console.error('[TIEMPO-MARCAS]', e);
    res.status(500).json({ error: 'Error al calcular el tiempo por marca' });
  }
});
