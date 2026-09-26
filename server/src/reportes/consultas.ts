import { query, queryOne } from '../db/mysql.js';
import { autoSalud, STATS_SQL } from '../routes/projects.js';
import { ETIQUETA_ESTADO, textoPlano, type TareaDelPeriodo } from './dominio.js';
import type { Avance, CambioEstado, Comentario, DatosReporte, DepsGenerador } from './generador.js';

/** Reads what a report needs. MySQL stores UTC; Ecuador dates are UTC-5 (no daylight saving). */

const LOCAL = (col: string) => `DATE_FORMAT(${col} - INTERVAL 5 HOUR, '%Y-%m-%d')`;
/** A period of Ecuador dates as a [start, end) range of UTC instants. */
const rangoUtc = (p: { desde: string; hasta: string }) => {
  const fin = new Date(Date.parse(`${p.hasta}T05:00:00Z`) + 86_400_000);
  return [`${p.desde} 05:00:00`, fin.toISOString().slice(0, 19).replace('T', ' ')];
};
const lista = (ids: string[]) => ids.map(() => '?').join(',');
const etiqueta = (e: string | null) => (e ? ETIQUETA_ESTADO[e] ?? e : null);

export async function datosDelReporte(projectId: string, periodo: { desde: string; hasta: string }): Promise<DatosReporte> {
  const p = await queryOne<any>(
    `SELECT p.id, p.nombre, p.salud, p.estado, p.fecha_fin, b.nombre AS marca, pr.nombre AS lider, ${STATS_SQL}
       FROM projects p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN profiles pr ON pr.id = p.lider_user_id
      WHERE p.id = ?`,
    [projectId],
  );
  if (!p) throw new Error(`Proyecto ${projectId} no encontrado`);

  const filas = await query<any[]>(
    `SELECT t.id, t.titulo_tarea, t.estado, DATE_FORMAT(t.fecha_entrega, '%Y-%m-%d') AS fecha_entrega, r.nombre AS responsable,
            ${LOCAL('t.created_at')} AS creada, ${LOCAL('t.updated_at')} AS actualizada, t.detalle,
            (SELECT ${LOCAL('MAX(a.created_at)')} FROM activity_log a
              WHERE a.entity_type = 'task' AND a.entity_id = t.id AND a.field_name = 'estado' AND a.new_value IN ('entregado','aprobado')) AS cerrada_log,
            (SELECT COUNT(*) FROM tasks s WHERE s.parent_task_id = t.id) AS sub_total,
            (SELECT COUNT(*) FROM tasks s WHERE s.parent_task_id = t.id AND (s.check_done = 1 OR s.estado IN ('entregado','aprobado'))) AS sub_listas
       FROM tasks t LEFT JOIN profiles r ON r.id = t.responsable_user_id
      WHERE t.project_id = ? AND (t.parent_task_id IS NULL OR t.parent_task_id = '')`,
    [projectId],
  );
  const tareas: TareaDelPeriodo[] = filas.map((f) => ({
    id: f.id,
    titulo: f.titulo_tarea,
    estado: f.estado,
    fecha_entrega: f.fecha_entrega ?? null,
    responsable: f.responsable ?? null,
    creada: f.creada,
    // Older tasks have no status history: their last update is the best guess of when they closed.
    cerrada: f.estado === 'entregado' || f.estado === 'aprobado' ? (f.cerrada_log ?? f.actualizada) : null,
    detalle: textoPlano(f.detalle),
    subtareas: Number(f.sub_total) > 0 ? `${Number(f.sub_listas)}/${Number(f.sub_total)}` : null,
  }));

  const comentarios = new Map<string, Comentario[]>();
  const cambios = new Map<string, CambioEstado[]>();
  const ids = tareas.map((t) => t.id);
  if (ids.length) {
    const [desde, hasta] = rangoUtc(periodo);
    const cs = await query<any[]>(
      `SELECT c.task_id, ${LOCAL('c.created_at')} AS fecha, u.nombre AS autor, c.comentario, c.contenido_html
         FROM comments c LEFT JOIN profiles u ON u.id = c.user_id
        WHERE c.task_id IN (${lista(ids)}) AND c.created_at >= ? AND c.created_at < ?
        ORDER BY c.created_at`,
      [...ids, desde, hasta],
    );
    for (const c of cs) {
      const texto = textoPlano(c.contenido_html || c.comentario);
      if (!texto) continue;
      comentarios.set(c.task_id, [...(comentarios.get(c.task_id) ?? []), { fecha: c.fecha, autor: c.autor ?? 'Alguien del equipo', texto }]);
    }
    const as = await query<any[]>(
      `SELECT a.entity_id AS task_id, ${LOCAL('a.created_at')} AS fecha, a.old_value, a.new_value, u.nombre AS por
         FROM activity_log a LEFT JOIN profiles u ON u.id = a.user_id
        WHERE a.entity_type = 'task' AND a.field_name = 'estado' AND a.entity_id IN (${lista(ids)}) AND a.created_at >= ? AND a.created_at < ?
        ORDER BY a.created_at`,
      [...ids, desde, hasta],
    );
    for (const a of as) {
      cambios.set(a.task_id, [...(cambios.get(a.task_id) ?? []), { fecha: a.fecha, de: etiqueta(a.old_value), a: etiqueta(a.new_value), por: a.por ?? null }]);
    }
  }

  return {
    proyecto: { id: p.id, nombre: p.nombre, marca: p.marca ?? '', lider: p.lider ?? '', salud: p.salud || autoSalud(p) },
    periodo,
    avanceProyecto: { total: Number(p.total_tareas) || 0, listas: Number(p.tareas_listas) || 0 },
    tareas,
    comentarios,
    cambios,
  };
}

/** Codex answers kept between reports (see layers A and B in generador.ts). */
export const cacheIa: DepsGenerador['cache'] = {
  async resumenes(ids) {
    if (!ids.length) return new Map();
    const filas = await query<{ task_id: string; hash_detalle: string; resumen: string }[]>(
      `SELECT task_id, hash_detalle, resumen FROM tarea_resumenes_ia WHERE task_id IN (${lista(ids)})`, ids,
    );
    return new Map(filas.map((f) => [f.task_id, { hash: f.hash_detalle, resumen: f.resumen }]));
  },
  async guardarResumen(id, hash, resumen) {
    await query(
      'INSERT INTO tarea_resumenes_ia (task_id, hash_detalle, resumen) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE hash_detalle = VALUES(hash_detalle), resumen = VALUES(resumen)',
      [id, hash, resumen],
    );
  },
  async avance(hash) {
    const fila = await queryOne<{ salida: Avance | string }>('SELECT salida FROM reporte_avances_ia WHERE hash_entrada = ?', [hash]);
    if (!fila) return null;
    return typeof fila.salida === 'string' ? JSON.parse(fila.salida) : fila.salida;
  },
  async guardarAvance(hash, avance) {
    await query('INSERT IGNORE INTO reporte_avances_ia (hash_entrada, salida) VALUES (?, ?)', [hash, JSON.stringify(avance)]);
  },
};
