import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';
import { reunionesEntre } from '../services/meetingsNow.js';

// Tiempo por marca en un mes (pedido de Steven, 23-sep-2026): cuántos entregables
// se entregaron por marca, cuántas horas registró el equipo en esa marca y cuánto
// se había estimado, para ver si lo que se hace calza con lo vendido.
//  - entregados: tareas que pasaron a entregado/aprobado dentro del mes (activity_log)
//  - horas de tareas: sesiones de timer iniciadas en el mes sobre tareas de la marca
//  - horas de reuniones: reuniones del calendario del mes (mismas reglas que el resto
//    de Tiusdei, ver meetingsNow.ts), asignadas a la marca cuyo nombre (o el de uno
//    de sus proyectos) aparece en el título; las demás van a "internas / sin marca"
//  - horas estimadas: de las tareas entregadas en el mes (estimado de la tarea, o el
//    estándar por tipo de entregable × cantidad)
// Desde el 5-oct también por persona (% de su mes de 160 h) y desde el 6-oct con
// reuniones aparte de tareas (reunión con Steven).
export const tiempoMarcasRouter = Router();
const TZ_OFF = '-05:00';
const HORAS_MES = 160;

// ---- Asignar una reunión a una marca por su título ----
const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// Palabras demasiado comunes para identificar una marca por sí solas
const GENERICAS = new Set(['qbit', 'grupo', 'alimentos', 'real', 'moderna', 'solution', 'solutions', 'comercial', 'industrial',
  'universidad', 'catolica', 'mall', 'norte', 'cafe', 'agua', 'precio', 'vista', 'ciudad', 'salud', 'prime', 'life', 'vision',
  'reunion', 'reporte', 'pauta', 'daily', 'sync', 'revision', 'status', 'equipo', 'cliente', 'clientes', 'proyecto', 'marca', 'web',
  'plan', 'club', 'show', 'group', 'security', 'medios', 'contenido', 'contenidos', 'diseno', 'campana', 'campanas', 'estrategia',
  'propuesta', 'kickoff', 'seguimiento', 'presentacion', 'interna', 'interno', 'mensual', 'semanal']);
interface Regla { brand_id: string; frase: string; tokens: string[] }
async function reglasDeMarcas(): Promise<Regla[]> {
  const [brands, projects] = await Promise.all([
    // Con las tareas de los últimos 6 meses, para desempatar palabras compartidas
    query<{ id: string; nombre: string; alias: string | null; tareas: number }[]>(
      `SELECT b.id, b.nombre, b.alias, (SELECT COUNT(*) FROM tasks t WHERE t.brand_id = b.id AND t.created_at >= DATE_SUB(NOW(), INTERVAL 180 DAY)) AS tareas
       FROM brands b WHERE b.activo = 1`),
    query<{ brand_id: string; nombre: string }[]>('SELECT brand_id, nombre FROM projects WHERE brand_id IS NOT NULL'),
  ]);
  // Una palabra identifica a una sola marca: si varias la usan ("Pycca" en Club Pycca y en
  // Pycca - Plan de Fidelización), se la queda la que más tareas tiene
  const duenoDe = new Map<string, { id: string; tareas: number }>();
  const tokensDe = (n: string) => Array.from(new Set(n.split(' ').filter((w) => w.length >= 4 && !GENERICAS.has(w))));
  for (const b of brands) for (const w of tokensDe(norm(b.nombre))) {
    const d = duenoDe.get(w);
    if (!d || Number(b.tareas) > d.tareas) duenoDe.set(w, { id: b.id, tareas: Number(b.tareas) });
  }
  const reglas: Regla[] = [];
  for (const b of brands) {
    const n = norm(b.nombre);
    if (n.length < 2 || n === 'qbit') continue;
    reglas.push({ brand_id: b.id, frase: n, tokens: tokensDe(n).filter((w) => duenoDe.get(w)?.id === b.id) });
  }
  // Abreviaturas de Administración > Marcas ("MDN" = Mall del Norte), como palabra completa
  for (const b of brands) for (const a of String(b.alias || '').split(',')) {
    const n = norm(a);
    if (n.length >= 2) reglas.push({ brand_id: b.id, frase: n, tokens: [] });
  }
  // Nombres de proyecto ("Proyecta Connect" → Alba del Bosque), solo como frase completa
  for (const p of projects) {
    const n = norm(p.nombre);
    if (n.length >= 6 && !GENERICAS.has(n)) reglas.push({ brand_id: p.brand_id, frase: n, tokens: [] });
  }
  return reglas;
}
function marcaDeTitulo(titulo: string, reglas: Regla[]): string | null {
  const t = ` ${norm(titulo)} `;
  let mejor: { id: string; largo: number } | null = null;
  for (const r of reglas) {
    let largo = 0;
    if (t.includes(` ${r.frase} `)) largo = r.frase.length + 100; // la frase completa gana a una palabra suelta
    else for (const w of r.tokens) if (t.includes(` ${w} `)) largo = Math.max(largo, w.length);
    if (largo > 0 && (!mejor || largo > mejor.largo)) mejor = { id: r.brand_id, largo };
  }
  return mejor?.id ?? null;
}

tiempoMarcasRouter.get('/metrics/tiempo-por-marca', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await hasRole(req.userId!, ['admin', 'ejecutivo']))) return res.status(403).json({ error: 'Sin permisos' });
    const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || '')) ? String(req.query.mes) : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date()).slice(0, 7);
    const deskId = typeof req.query.desk_id === 'string' && req.query.desk_id ? req.query.desk_id : null;
    const userId = typeof req.query.user_id === 'string' && req.query.user_id ? req.query.user_id : null;
    const [y, m] = mes.split('-').map(Number);
    const desde = `${mes}-01 00:00:00`;
    const sigMes = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString().slice(0, 10);
    const hasta = sigMes + ' 00:00:00';
    const deskCond = deskId ? ' AND t.desk_id = ?' : '';
    const deskParam = deskId ? [deskId] : [];
    // Con persona: entregas donde es responsable o co-responsable, y solo sus horas
    const userEntregaCond = userId ? ' AND (t.responsable_user_id = ? OR t.id IN (SELECT task_id FROM task_responsables WHERE user_id = ?))' : '';
    const userEntregaParam = userId ? [userId, userId] : [];
    const userHorasCond = userId ? ' AND te.user_id = ?' : '';
    const userHorasParam = userId ? [userId] : [];

    // Personas cuyas reuniones se leen: la elegida, o todo el equipo activo
    const personasReu = userId
      ? [userId]
      : (await query<{ id: string }[]>(`SELECT id FROM profiles WHERE activo = 1 AND rol IN ('admin','ejecutivo','equipo')`)).map((r) => r.id);
    const [entregas, horas, reglas, deskBrands, deskMiembros, reu] = await Promise.all([
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
      // Horas de timer por marca y persona; los totales por marca salen de sumar esto
      query<any[]>(
        `SELECT t.brand_id, te.user_id, SUM(te.duration_seconds) / 3600 AS horas, COUNT(DISTINCT te.task_id) AS tareas
         FROM time_entries te JOIN tasks t ON t.id = te.task_id
         WHERE te.status = 'completed'
           AND CONVERT_TZ(te.start_time, '+00:00', '${TZ_OFF}') >= ? AND CONVERT_TZ(te.start_time, '+00:00', '${TZ_OFF}') < ?${deskCond}${userHorasCond}
         GROUP BY t.brand_id, te.user_id`,
        [desde, hasta, ...deskParam, ...userHorasParam],
      ),
      reglasDeMarcas(),
      deskId ? query<{ brand_id: string }[]>('SELECT brand_id FROM desk_brands WHERE desk_id = ?', [deskId]) : Promise.resolve([]),
      deskId ? query<{ user_id: string }[]>('SELECT user_id FROM desk_members WHERE desk_id = ?', [deskId]) : Promise.resolve([]),
      reunionesEntre(personasReu, new Date(`${mes}-01T00:00:00${TZ_OFF}`).getTime(), new Date(`${sigMes}T00:00:00${TZ_OFF}`).getTime()),
    ]);

    // Reuniones → marca (o sin marca). Con mesa elegida: solo marcas de esa mesa, y
    // las internas solo de sus integrantes.
    // Una mesa sin marcas asignadas (Desarrollo, Planning, Pycca - Loialty) trabaja con todas
    const marcasMesa = deskId && deskBrands.length ? new Set(deskBrands.map((d) => d.brand_id)) : null;
    const miembrosMesa = deskId ? new Set(deskMiembros.map((d) => d.user_id)) : null;
    const reuMarca = new Map<string, Map<string, number>>(); // brand → user → seg
    const reuInterna = new Map<string, number>();            // user → seg
    for (const [uid, lista] of reu.porPersona) {
      for (const r of lista) {
        const bid = marcaDeTitulo(r.summary, reglas);
        if (bid && (!marcasMesa || marcasMesa.has(bid))) {
          const mm = reuMarca.get(bid) ?? new Map<string, number>();
          mm.set(uid, (mm.get(uid) || 0) + r.seg);
          reuMarca.set(bid, mm);
        } else if (!bid && (!miembrosMesa || miembrosMesa.has(uid))) {
          reuInterna.set(uid, (reuInterna.get(uid) || 0) + r.seg);
        }
      }
    }

    const ids = Array.from(new Set([...entregas.map((r) => r.brand_id), ...horas.map((r) => r.brand_id), ...reuMarca.keys()].filter(Boolean)));
    const userIds = Array.from(new Set([
      ...horas.map((r) => r.user_id), ...Array.from(reuMarca.values()).flatMap((mm) => Array.from(mm.keys())), ...reuInterna.keys(),
      ...reu.sinAcceso.keys(), ...(userId ? [] : reu.sinConectar),
    ].filter(Boolean)));
    const [nombres, personasRows] = await Promise.all([
      ids.length ? query<{ id: string; nombre: string }[]>(`SELECT id, nombre FROM brands WHERE id IN (${ids.map(() => '?').join(',')})`, ids) : Promise.resolve([]),
      userIds.length ? query<{ id: string; nombre: string }[]>(`SELECT id, nombre FROM profiles WHERE id IN (${userIds.map(() => '?').join(',')})`, userIds) : Promise.resolve([]),
    ]);
    const nombrePor = new Map(nombres.map((b) => [b.id, b.nombre]));
    const personaPor = new Map(personasRows.map((p) => [p.id, String(p.nombre || '').trim() || 'Sin nombre']));
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const pctMes = (h: number) => Math.round((h / HORAS_MES) * 100);
    const pct = (x: number, t: number) => (t > 0 ? Math.round((x / t) * 100) : 0);

    const filas = ids.map((id) => {
      const e = entregas.find((x) => x.brand_id === id);
      const deLaMarca = horas.filter((x) => x.brand_id === id);
      const reuDeLaMarca = reuMarca.get(id) ?? new Map<string, number>();
      const tareasH = deLaMarca.reduce((a, x) => a + Number(x.horas || 0), 0);
      const reuH = Array.from(reuDeLaMarca.values()).reduce((a, s) => a + s, 0) / 3600;
      const totalH = tareasH + reuH;
      const ent = Number(e?.entregables || 0);
      const quienes = Array.from(new Set([...deLaMarca.map((x) => x.user_id as string), ...reuDeLaMarca.keys()]));
      const porPersona = quienes
        .map((uid) => {
          const x = deLaMarca.find((d) => d.user_id === uid);
          const ht = Number(x?.horas || 0), hr = (reuDeLaMarca.get(uid) || 0) / 3600, h = ht + hr;
          return {
            user_id: uid,
            nombre: personaPor.get(uid) || 'Sin nombre',
            horas: r1(h),
            horas_tareas: r1(ht),
            horas_reuniones: r1(hr),
            tareas: Number(x?.tareas || 0),
            pct_mes: pctMes(h),
            pct_marca: pct(h, totalH),
          };
        })
        .filter((p) => p.horas > 0)
        .sort((a, b) => b.horas - a.horas);
      return {
        brand_id: id,
        marca: nombrePor.get(id) || '(sin marca)',
        tareas_entregadas: Number(e?.tareas || 0),
        entregables: ent,
        horas_registradas: r1(tareasH),   // timer (se mantiene el nombre por compatibilidad)
        horas_tareas: r1(tareasH),
        horas_reuniones: r1(reuH),
        horas_total: r1(totalH),
        pct_reuniones: pct(reuH, totalH),
        horas_estimadas: r1(Number(e?.horas_estimadas || 0)),
        sin_estimar: Number(e?.sin_estimar || 0),
        personas: porPersona.length,
        // Horas de tarea por entregable (las reuniones no producen entregables)
        horas_por_entregable: ent > 0 ? r1(tareasH / ent) : null,
        // Total ÷ 160: 172 % = 1,7 personas a tiempo completo
        pct_mes_persona: pctMes(totalH),
        por_persona: porPersona,
      };
    }).filter((f) => f.horas_total > 0 || f.entregables > 0).sort((a, b) => b.horas_total - a.horas_total);

    // Reuniones internas / sin marca
    const internaPersonas = Array.from(reuInterna.entries())
      .map(([uid, s]) => ({ user_id: uid, nombre: personaPor.get(uid) || 'Sin nombre', horas: r1(s / 3600), pct_mes: pctMes(s / 3600) }))
      .filter((p) => p.horas > 0).sort((a, b) => b.horas - a.horas);
    const sinMarca = { horas: r1(Array.from(reuInterna.values()).reduce((a, s) => a + s, 0) / 3600), por_persona: internaPersonas };

    // Vista por persona: en qué marcas puso sus horas del mes (tareas + reuniones)
    const personasIds = Array.from(new Set([...horas.map((r) => r.user_id as string), ...Array.from(reuMarca.values()).flatMap((mm) => Array.from(mm.keys())), ...reuInterna.keys()]));
    const personas = personasIds.map((uid) => {
      const marcas = ids.map((bid) => {
        const x = horas.find((h) => h.brand_id === bid && h.user_id === uid);
        const ht = Number(x?.horas || 0), hr = (reuMarca.get(bid)?.get(uid) || 0) / 3600;
        return { brand_id: bid as string | null, marca: nombrePor.get(bid) || '(sin marca)', horas: r1(ht + hr), horas_tareas: r1(ht), horas_reuniones: r1(hr), tareas: Number(x?.tareas || 0), pct_mes: pctMes(ht + hr), pct_persona: 0 };
      }).filter((x) => x.horas > 0);
      const internas = (reuInterna.get(uid) || 0) / 3600;
      const tareasH = marcas.reduce((a, x) => a + x.horas_tareas, 0);
      const reuH = marcas.reduce((a, x) => a + x.horas_reuniones, 0) + internas;
      const total = tareasH + reuH;
      for (const mk of marcas) mk.pct_persona = pct(mk.horas, total);
      marcas.sort((a, b) => b.horas - a.horas);
      return {
        user_id: uid, nombre: personaPor.get(uid) || 'Sin nombre',
        horas: r1(total), horas_tareas: r1(tareasH), horas_reuniones: r1(reuH), horas_reuniones_internas: r1(internas),
        pct_reuniones: pct(reuH, total), pct_mes: pctMes(total), marcas,
      };
    }).filter((p) => p.horas > 0).sort((a, b) => b.horas - a.horas);

    // De quién se pudieron leer las reuniones (con mesa: solo sus integrantes)
    const relevante = (uid: string) => !miembrosMesa || miembrosMesa.has(uid);
    const calendario = {
      leidos: Array.from(reu.porPersona.keys()).filter(relevante).length,
      sin_acceso: Array.from(reu.sinAcceso.entries()).filter(([uid]) => relevante(uid))
        .map(([uid, motivo]) => ({ nombre: personaPor.get(uid) || 'Sin nombre', motivo })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
      sin_conectar: (userId ? [] : reu.sinConectar).filter(relevante).map((uid) => personaPor.get(uid) || 'Sin nombre').sort(),
    };

    res.json({ mes, desk_id: deskId, user_id: userId, horas_mes: HORAS_MES, filas, personas, sin_marca: sinMarca, calendario });
  } catch (e) {
    console.error('[TIEMPO-MARCAS]', e);
    res.status(500).json({ error: 'Error al calcular el tiempo por marca' });
  }
});
