import { SchemaType, type FunctionDeclaration } from '@google/generative-ai';
import { query, queryOne } from '../db/mysql.js';
import { getUserRole } from '../utils/roles.js';
import { canAccessTask } from '../utils/taskAccess.js';

// Herramientas de consulta para Nerudia (sugerencia de Even, 31-jul: que el chatbot
// pueda usar lo mismo que el MCP y responder con datos en vivo, no solo con la lista
// fija de tareas que se le pasa en el contexto). Todas son de SOLO LECTURA y ven lo
// mismo que la persona ve en Tareas: admin todo; equipo y ejecutivo sus mesas, las
// tareas de su departamento-mesa y las que tiene asignadas o sigue.

const TZ = 'America/Guayaquil';
const hoyEcuador = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const texto = (html: unknown, max = 600) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const limitar = (n: unknown, def: number, max: number) => Math.min(max, Math.max(1, Number(n) || def));

/** Condición SQL de tareas visibles para la persona (alias `t`). */
async function visibles(userId: string): Promise<{ sql: string; params: unknown[] } | null> {
  const rol = await getUserRole(userId);
  if (rol === 'admin') return { sql: '1=1', params: [] };
  if (rol === 'cliente') return null;
  const mesas = (await query<{ desk_id: string }[]>('SELECT desk_id FROM desk_members WHERE user_id = ?', [userId])).map((r) => r.desk_id);
  const ph = mesas.map(() => '?').join(',');
  const porMesa = mesas.length
    ? `t.desk_id IN (${ph}) OR t.department_id IN (SELECT dk.department_id FROM desks dk WHERE dk.id IN (${ph}) AND dk.department_id IS NOT NULL) OR `
    : '';
  return {
    sql: `(${porMesa}t.responsable_user_id = ? OR t.id IN (SELECT task_id FROM task_responsables WHERE user_id = ?) OR t.id IN (SELECT task_id FROM task_seguidores WHERE user_id = ?))`,
    params: [...mesas, ...mesas, userId, userId, userId],
  };
}

async function personaPorNombre(nombre: string, userId: string): Promise<{ id: string; nombre: string } | null> {
  if (!nombre || /^(yo|m[ií]|mis?)$/i.test(nombre.trim())) {
    const p = await queryOne<{ id: string; nombre: string }>('SELECT id, nombre FROM profiles WHERE id = ?', [userId]);
    return p ? { id: p.id, nombre: String(p.nombre).trim() } : null;
  }
  const p = await queryOne<{ id: string; nombre: string }>(
    `SELECT id, nombre FROM profiles WHERE activo = 1 AND nombre LIKE ? ORDER BY CHAR_LENGTH(nombre) LIMIT 1`, [`%${nombre.trim()}%`],
  );
  return p ? { id: p.id, nombre: String(p.nombre).trim() } : null;
}

export const declaracionesNerudia: FunctionDeclaration[] = [
  {
    name: 'buscar_tareas',
    description: 'Busca tareas de Tiusdei que la persona puede ver. Úsala para preguntas como "qué tengo pendiente", "tareas vencidas de Skretting", "en qué está Jonathan".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        texto: { type: SchemaType.STRING, description: 'Palabras del título de la tarea' },
        marca: { type: SchemaType.STRING, description: 'Nombre (o parte) de la marca' },
        responsable: { type: SchemaType.STRING, description: 'Nombre de la persona responsable, o "yo"' },
        estado: { type: SchemaType.STRING, description: 'backlog, en_proceso, revision_interna, revision_cliente, ajustes, bloqueado, entregado o aprobado' },
        solo_vencidas: { type: SchemaType.BOOLEAN, description: 'Solo tareas abiertas con fecha de entrega pasada' },
        incluir_cerradas: { type: SchemaType.BOOLEAN, description: 'Incluir entregadas y aprobadas (por defecto no)' },
        limite: { type: SchemaType.NUMBER, description: 'Máximo de tareas (1-30, por defecto 15)' },
      },
    },
  },
  {
    name: 'ver_tarea',
    description: 'Detalle de una tarea: descripción, responsables, fechas, horas estimadas y trabajadas y últimos comentarios.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        id: { type: SchemaType.STRING, description: 'Id de la tarea (si se conoce)' },
        titulo: { type: SchemaType.STRING, description: 'Título o parte del título, si no hay id' },
      },
    },
  },
  {
    name: 'carga_de_persona',
    description: 'Carga de trabajo de una persona: tareas abiertas, vencidas, por vencer en 7 días, bloqueadas, horas de timer de la semana y entregas de los últimos 30 días.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { nombre: { type: SchemaType.STRING, description: 'Nombre de la persona, o "yo"' } },
      required: ['nombre'],
    },
  },
  {
    name: 'resumen_marca',
    description: 'Resumen de una marca: tareas abiertas por estado, vencidas, entregadas en 30 días, horas de timer del mes y proyectos activos.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { marca: { type: SchemaType.STRING, description: 'Nombre (o parte) de la marca' } },
      required: ['marca'],
    },
  },
];

type Args = Record<string, unknown>;

async function buscarTareas(userId: string, a: Args) {
  const vis = await visibles(userId);
  if (!vis) return { error: 'Sin acceso a tareas' };
  const conds = [vis.sql, "(t.parent_task_id IS NULL OR t.parent_task_id = '')"];
  const params: unknown[] = [...vis.params];
  if (a.texto) { conds.push('t.titulo_tarea LIKE ?'); params.push(`%${String(a.texto)}%`); }
  if (a.marca) { conds.push('b.nombre LIKE ?'); params.push(`%${String(a.marca)}%`); }
  if (a.responsable) {
    const p = await personaPorNombre(String(a.responsable), userId);
    if (!p) return { tareas: [], nota: `No encontré a "${a.responsable}"` };
    conds.push('(t.responsable_user_id = ? OR t.id IN (SELECT task_id FROM task_responsables WHERE user_id = ?))'); params.push(p.id, p.id);
  }
  if (a.estado) { conds.push('t.estado = ?'); params.push(String(a.estado)); }
  else if (!a.incluir_cerradas) conds.push("t.estado NOT IN ('entregado','aprobado')");
  if (a.solo_vencidas) { conds.push("t.estado NOT IN ('entregado','aprobado','bloqueado') AND t.fecha_entrega < ?"); params.push(hoyEcuador()); }
  const filas = await query<any[]>(
    `SELECT t.id, t.titulo_tarea, t.estado, t.prioridad, DATE_FORMAT(t.fecha_entrega, '%Y-%m-%d') AS entrega,
            TRIM(p.nombre) AS responsable, b.nombre AS marca, d.nombre AS mesa
     FROM tasks t LEFT JOIN profiles p ON p.id = t.responsable_user_id LEFT JOIN brands b ON b.id = t.brand_id LEFT JOIN desks d ON d.id = t.desk_id
     WHERE ${conds.join(' AND ')}
     ORDER BY t.fecha_entrega IS NULL, t.fecha_entrega ASC LIMIT ${limitar(a.limite, 15, 30)}`,
    params,
  );
  return { hoy: hoyEcuador(), total: filas.length, tareas: filas };
}

async function verTarea(userId: string, a: Args) {
  let id = typeof a.id === 'string' ? a.id : '';
  if (!id && a.titulo) {
    const r = await buscarTareas(userId, { texto: a.titulo, incluir_cerradas: true, limite: 1 });
    id = (r as { tareas?: { id: string }[] }).tareas?.[0]?.id || '';
  }
  if (!id || !(await canAccessTask(userId, id))) return { error: 'No encontré esa tarea o no tienes acceso' };
  const t = await queryOne<any>(
    `SELECT t.id, t.titulo_tarea, t.estado, t.prioridad, t.detalle, DATE_FORMAT(t.fecha_inicio, '%Y-%m-%d') AS inicio,
            DATE_FORMAT(t.fecha_entrega, '%Y-%m-%d') AS entrega, t.estimated_hours, t.tiempo_trabajado,
            TRIM(p.nombre) AS responsable, b.nombre AS marca, d.nombre AS mesa, pr.nombre AS proyecto, dep.nombre AS departamento,
            (SELECT GROUP_CONCAT(TRIM(px.nombre) SEPARATOR ', ') FROM task_responsables tr JOIN profiles px ON px.id = tr.user_id WHERE tr.task_id = t.id) AS co_responsables
     FROM tasks t LEFT JOIN profiles p ON p.id = t.responsable_user_id LEFT JOIN brands b ON b.id = t.brand_id
     LEFT JOIN desks d ON d.id = t.desk_id LEFT JOIN projects pr ON pr.id = t.project_id LEFT JOIN departments dep ON dep.id = t.department_id
     WHERE t.id = ?`, [id],
  );
  const comentarios = await query<any[]>(
    `SELECT TRIM(p.nombre) AS autor, DATE_FORMAT(CONVERT_TZ(c.created_at, '+00:00', '-05:00'), '%Y-%m-%d %H:%i') AS fecha, c.comentario, c.contenido_html
     FROM comments c LEFT JOIN profiles p ON p.id = c.user_id WHERE c.task_id = ? ORDER BY c.created_at DESC LIMIT 5`, [id],
  );
  return {
    ...t,
    detalle: texto(t?.detalle, 1200),
    horas_estimadas: t?.estimated_hours ? Number(t.estimated_hours) : null,
    horas_trabajadas: Math.round((Number(t?.tiempo_trabajado || 0) / 3600) * 10) / 10,
    tiempo_trabajado: undefined, estimated_hours: undefined,
    ultimos_comentarios: comentarios.map((c) => ({ autor: c.autor, fecha: c.fecha, texto: texto(c.contenido_html || c.comentario, 300) })),
  };
}

async function cargaDePersona(userId: string, a: Args) {
  const p = await personaPorNombre(String(a.nombre || 'yo'), userId);
  if (!p) return { error: `No encontré a "${a.nombre}"` };
  const rol = await getUserRole(userId);
  if (p.id !== userId && rol !== 'admin' && rol !== 'ejecutivo') return { error: 'Solo puedes consultar tu propia carga' };
  const hoy = hoyEcuador();
  const en7 = new Date(`${hoy}T12:00:00Z`); en7.setUTCDate(en7.getUTCDate() + 7);
  const mias = `(t.responsable_user_id = ? OR t.id IN (SELECT task_id FROM task_responsables WHERE user_id = ?))`;
  const [c, h, e] = await Promise.all([
    queryOne<any>(
      `SELECT SUM(t.estado NOT IN ('entregado','aprobado')) AS abiertas,
              SUM(t.estado NOT IN ('entregado','aprobado','bloqueado') AND t.fecha_entrega < ?) AS vencidas,
              SUM(t.estado NOT IN ('entregado','aprobado','bloqueado') AND t.fecha_entrega >= ? AND t.fecha_entrega <= ?) AS vencen_7_dias,
              SUM(t.estado = 'bloqueado') AS bloqueadas, SUM(t.estado = 'en_proceso') AS en_proceso
       FROM tasks t WHERE ${mias}`, [hoy, hoy, en7.toISOString().slice(0, 10), p.id, p.id],
    ),
    queryOne<any>(
      `SELECT ROUND(SUM(CASE WHEN start_time >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN duration_seconds ELSE 0 END) / 3600, 1) AS horas_timer_7_dias
       FROM time_entries WHERE user_id = ? AND status = 'completed' AND start_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)`, [p.id],
    ),
    queryOne<any>(
      `SELECT COUNT(DISTINCT al.entity_id) AS entregadas_30_dias FROM activity_log al JOIN tasks t ON t.id = al.entity_id
       WHERE al.entity_type = 'task' AND al.field_name = 'estado' AND al.new_value IN ('entregado','aprobado')
         AND al.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND ${mias}`, [p.id, p.id],
    ),
  ]);
  const num = (x: unknown) => Number(x || 0);
  return {
    persona: p.nombre, hoy,
    abiertas: num(c?.abiertas), vencidas: num(c?.vencidas), vencen_proximos_7_dias: num(c?.vencen_7_dias),
    bloqueadas: num(c?.bloqueadas), en_proceso: num(c?.en_proceso),
    horas_timer_ultimos_7_dias: num(h?.horas_timer_7_dias), entregadas_ultimos_30_dias: num(e?.entregadas_30_dias),
  };
}

async function resumenMarca(userId: string, a: Args) {
  const vis = await visibles(userId);
  if (!vis) return { error: 'Sin acceso' };
  const marca = await queryOne<{ id: string; nombre: string }>(
    'SELECT id, nombre FROM brands WHERE activo = 1 AND nombre LIKE ? ORDER BY CHAR_LENGTH(nombre) LIMIT 1', [`%${String(a.marca || '').trim()}%`],
  );
  if (!marca) return { error: `No encontré la marca "${a.marca}"` };
  const hoy = hoyEcuador();
  const base = `t.brand_id = ? AND ${vis.sql} AND (t.parent_task_id IS NULL OR t.parent_task_id = '')`;
  const [porEstado, vencidas, entregadas, horas, proyectos] = await Promise.all([
    query<any[]>(`SELECT t.estado, COUNT(*) AS n FROM tasks t WHERE ${base} AND t.estado NOT IN ('entregado','aprobado') GROUP BY t.estado`, [marca.id, ...vis.params]),
    query<any[]>(
      `SELECT t.titulo_tarea, DATE_FORMAT(t.fecha_entrega, '%Y-%m-%d') AS entrega, TRIM(p.nombre) AS responsable
       FROM tasks t LEFT JOIN profiles p ON p.id = t.responsable_user_id
       WHERE ${base} AND t.estado NOT IN ('entregado','aprobado','bloqueado') AND t.fecha_entrega < ? ORDER BY t.fecha_entrega LIMIT 5`,
      [marca.id, ...vis.params, hoy],
    ),
    queryOne<any>(
      `SELECT COUNT(DISTINCT al.entity_id) AS n FROM activity_log al JOIN tasks t ON t.id = al.entity_id
       WHERE al.entity_type = 'task' AND al.field_name = 'estado' AND al.new_value IN ('entregado','aprobado')
         AND al.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND ${base}`, [marca.id, ...vis.params],
    ),
    queryOne<any>(
      `SELECT ROUND(SUM(te.duration_seconds) / 3600, 1) AS h FROM time_entries te JOIN tasks t ON t.id = te.task_id
       WHERE te.status = 'completed' AND DATE_FORMAT(CONVERT_TZ(te.start_time, '+00:00', '-05:00'), '%Y-%m') = ? AND ${base}`,
      [hoy.slice(0, 7), marca.id, ...vis.params],
    ),
    query<any[]>(`SELECT nombre, estado FROM projects WHERE brand_id = ? AND estado NOT IN ('completado','cancelado') LIMIT 10`, [marca.id]).catch(() => []),
  ]);
  return {
    marca: marca.nombre, hoy,
    abiertas_por_estado: Object.fromEntries(porEstado.map((r) => [r.estado, Number(r.n)])),
    vencidas_mas_antiguas: vencidas,
    entregadas_ultimos_30_dias: Number(entregadas?.n || 0),
    horas_timer_mes_en_curso: Number(horas?.h || 0),
    proyectos_activos: proyectos,
  };
}

/** Ejecuta una herramienta pedida por el modelo, con los permisos de la persona. */
export async function ejecutarHerramientaNerudia(userId: string, nombre: string, args: Args): Promise<object> {
  try {
    switch (nombre) {
      case 'buscar_tareas': return await buscarTareas(userId, args || {});
      case 'ver_tarea': return await verTarea(userId, args || {});
      case 'carga_de_persona': return await cargaDePersona(userId, args || {});
      case 'resumen_marca': return await resumenMarca(userId, args || {});
      default: return { error: `Herramienta desconocida: ${nombre}` };
    }
  } catch (e) {
    console.error('[NERUDIA tool]', nombre, (e as Error).message);
    return { error: 'No se pudo consultar ese dato' };
  }
}
