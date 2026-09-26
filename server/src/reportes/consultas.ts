import { query, queryOne } from '../db/mysql.js';
import { autoSalud, statsSql } from '../routes/projects.js';
import { textoPlano, type CambioEstado, type Reprogramacion, type TareaDelPeriodo } from './dominio.js';
import type { Avance, Comentario, DatosReporte, DepsGenerador } from './generador.js';

/** Reads what a report needs. MySQL stores UTC; Ecuador dates are UTC-5 (no daylight saving). */

const LOCAL = (col: string) => `DATE_FORMAT(${col} - INTERVAL 5 HOUR, '%Y-%m-%d')`;
/** A period of Ecuador dates as a [start, end) range of UTC instants. */
const rangoUtc = (p: { desde: string; hasta: string }) => {
  const fin = new Date(Date.parse(`${p.hasta}T05:00:00Z`) + 86_400_000);
  return [`${p.desde} 05:00:00`, fin.toISOString().slice(0, 19).replace('T', ' ')];
};
const lista = (ids: string[]) => ids.map(() => '?').join(',');
const agrupar = <T>(filas: (T & { task_id: string })[]) => {
  const m = new Map<string, T[]>();
  for (const { task_id, ...resto } of filas) m.set(task_id, [...(m.get(task_id) ?? []), resto as unknown as T]);
  return m;
};

export async function datosDelReporte(projectId: string, periodo: { desde: string; hasta: string; parcial?: boolean }): Promise<DatosReporte> {
  const p = await queryOne<any>(
    `SELECT p.id, p.nombre, p.salud, p.estado, p.fecha_fin, DATE_FORMAT(p.fecha_fin, '%Y-%m-%d') AS fin, b.nombre AS marca, pr.nombre AS lider, ${statsSql()}
       FROM projects p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN profiles pr ON pr.id = p.lider_user_id
      WHERE p.id = ?`,
    [projectId],
  );
  if (!p) throw new Error(`Proyecto ${projectId} no encontrado`);

  // Subtasks count for progress, like the Projects screen; the report lists main tasks only.
  const filas = await query<any[]>(
    `SELECT t.id, t.titulo_tarea, t.estado, DATE_FORMAT(t.fecha_entrega, '%Y-%m-%d') AS fecha_entrega, ${LOCAL('t.created_at')} AS creada,
            COALESCE(r.nombre, (SELECT u.nombre FROM task_responsables x JOIN profiles u ON u.id = x.user_id WHERE x.task_id = t.id LIMIT 1)) AS responsable,
            (t.parent_task_id IS NULL OR t.parent_task_id = '') AS principal
       FROM tasks t LEFT JOIN profiles r ON r.id = t.responsable_user_id
      WHERE t.project_id = ?`,
    [projectId],
  );
  const ids = filas.map((f) => f.id);
  const cambios = new Map<string, CambioEstado[]>();
  const reprogramaciones = new Map<string, Reprogramacion[]>();
  const comentarios = new Map<string, Comentario[]>();
  if (ids.length) {
    const cs = await query<any[]>(
      `SELECT a.entity_id AS task_id, ${LOCAL('a.created_at')} AS fecha, a.old_value AS de, a.new_value AS a, u.nombre AS por
         FROM activity_log a LEFT JOIN profiles u ON u.id = a.user_id
        WHERE a.entity_type = 'task' AND a.field_name = 'estado' AND a.entity_id IN (${lista(ids)})
        ORDER BY a.created_at`,
      ids,
    );
    for (const [id, v] of agrupar<CambioEstado>(cs.map((c) => ({ ...c, por: c.por ?? null })))) cambios.set(id, v);
    const rs = await query<any[]>(
      `SELECT r.task_id, ${LOCAL('r.changed_at')} AS fecha, DATE_FORMAT(r.fecha_anterior, '%Y-%m-%d') AS anterior,
              DATE_FORMAT(r.fecha_nueva, '%Y-%m-%d') AS nueva, r.motivo, r.comentario, u.nombre AS por
         FROM task_reschedules r LEFT JOIN profiles u ON u.id = r.changed_by
        WHERE r.task_id IN (${lista(ids)}) ORDER BY r.changed_at`,
      ids,
    );
    for (const [id, v] of agrupar<Reprogramacion>(rs.map((r) => ({ ...r, comentario: r.comentario ?? null, por: r.por ?? null })))) reprogramaciones.set(id, v);
    const [desde, hasta] = rangoUtc(periodo);
    const ms = await query<any[]>(
      `SELECT c.task_id, ${LOCAL('c.created_at')} AS fecha, u.nombre AS autor, c.comentario, c.contenido_html
         FROM comments c LEFT JOIN profiles u ON u.id = c.user_id
        WHERE c.task_id IN (${lista(ids)}) AND c.created_at >= ? AND c.created_at < ?
        ORDER BY c.created_at`,
      [...ids, desde, hasta],
    );
    for (const c of ms) {
      const texto = textoPlano(c.contenido_html || c.comentario);
      if (texto) comentarios.set(c.task_id, [...(comentarios.get(c.task_id) ?? []), { fecha: c.fecha, autor: c.autor ?? 'Alguien del equipo', texto }]);
    }
  }

  const todas: (TareaDelPeriodo & { principal: boolean })[] = filas.map((f) => ({
    id: f.id,
    titulo: f.titulo_tarea,
    estado: f.estado,
    fecha_entrega: f.fecha_entrega ?? null,
    responsable: f.responsable ?? null,
    creada: f.creada,
    cambios: cambios.get(f.id) ?? [],
    reprogramaciones: reprogramaciones.get(f.id) ?? [],
    comentarios: comentarios.get(f.id)?.length ?? 0,
    principal: !!Number(f.principal),
  }));

  return {
    proyecto: {
      id: p.id, nombre: p.nombre, marca: p.marca ?? '', lider: p.lider ?? '', salud: p.salud || autoSalud(p),
      salud_manual: p.salud || null, estado: p.estado ?? null, fecha_fin: p.fin ?? null,
    },
    periodo,
    tareas: todas.filter((t) => t.principal).map(({ principal: _p, ...t }) => t),
    todas: todas.map(({ principal: _p, ...t }) => t),
    comentarios,
  };
}

/** Progress lines already written by Codex for an exact input (layer B in generador.ts). */
export const cacheIa: DepsGenerador['cache'] = {
  async avance(hash) {
    const fila = await queryOne<{ salida: Avance | string }>('SELECT salida FROM reporte_avances_ia WHERE hash_entrada = ?', [hash]);
    if (!fila) return null;
    return typeof fila.salida === 'string' ? JSON.parse(fila.salida) : fila.salida;
  },
  async guardarAvance(hash, avance) {
    await query('INSERT IGNORE INTO reporte_avances_ia (hash_entrada, salida) VALUES (?, ?)', [hash, JSON.stringify(avance)]);
  },
};
