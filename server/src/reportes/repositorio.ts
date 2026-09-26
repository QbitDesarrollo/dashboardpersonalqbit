import { query, queryOne, uuid } from '../db/mysql.js';
import type { ConfigReporte, Entrega, EstadoReporte } from './dominio.js';
import type { ContenidoReporte } from './generador.js';

/** Report rows, their configuration and their sends. MySQL runs in UTC; instants are written in UTC. */

const aMysql = (d: Date) => d.toISOString().slice(0, 23).replace('T', ' ');
const CONFIG_POR_DEFECTO: ConfigReporte = { activo: false, dia_entrega: 1, hora_entrega: '08:00', anticipacion_horas: 3 };

export interface FilaReporte {
  id: string;
  project_id: string;
  periodo_desde: string;
  periodo_hasta: string;
  entregar_en: Date;
  estado: EstadoReporte;
  intentos: number;
  error: string | null;
  contenido: ContenidoReporte | null;
  indicaciones: string | null;
  generado_en: Date | null;
  notificado_en: Date | null;
  aprobado_por: string | null;
  aprobado_por_nombre: string | null;
  aprobado_en: Date | null;
  pdf_path: string | null;
  proyecto_nombre: string;
  lider_user_id: string | null;
}

const SELECT = `SELECT r.id, r.project_id, DATE_FORMAT(r.periodo_desde, '%Y-%m-%d') AS periodo_desde, DATE_FORMAT(r.periodo_hasta, '%Y-%m-%d') AS periodo_hasta,
  r.entregar_en, r.estado, r.intentos, r.error, r.contenido, r.indicaciones, r.generado_en, r.notificado_en,
  r.aprobado_por, a.nombre AS aprobado_por_nombre, r.aprobado_en, r.pdf_path, p.nombre AS proyecto_nombre, p.lider_user_id
  FROM proyecto_reportes r JOIN projects p ON p.id = r.project_id LEFT JOIN profiles a ON a.id = r.aprobado_por`;

const normalizar = (f: any): FilaReporte => ({
  ...f,
  intentos: Number(f.intentos),
  contenido: typeof f.contenido === 'string' ? JSON.parse(f.contenido) : f.contenido ?? null,
});

export async function leerConfig(projectId: string): Promise<ConfigReporte> {
  const f = await queryOne<any>('SELECT activo, dia_entrega, hora_entrega, anticipacion_horas FROM proyecto_reportes_config WHERE project_id = ?', [projectId]);
  return f ? { activo: !!f.activo, dia_entrega: Number(f.dia_entrega), hora_entrega: f.hora_entrega, anticipacion_horas: Number(f.anticipacion_horas) } : { ...CONFIG_POR_DEFECTO };
}

export async function guardarConfig(projectId: string, c: Pick<ConfigReporte, 'activo' | 'dia_entrega' | 'hora_entrega'>, userId: string): Promise<void> {
  await query(
    `INSERT INTO proyecto_reportes_config (project_id, activo, dia_entrega, hora_entrega, updated_by) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE activo = VALUES(activo), dia_entrega = VALUES(dia_entrega), hora_entrega = VALUES(hora_entrega), updated_by = VALUES(updated_by)`,
    [projectId, c.activo ? 1 : 0, c.dia_entrega, c.hora_entrega, userId],
  );
}

/** Active configurations of active projects that have a leader. */
export async function configsActivas(): Promise<(ConfigReporte & { project_id: string })[]> {
  const filas = await query<any[]>(
    `SELECT c.project_id, c.activo, c.dia_entrega, c.hora_entrega, c.anticipacion_horas
       FROM proyecto_reportes_config c JOIN projects p ON p.id = c.project_id JOIN profiles l ON l.id = p.lider_user_id
      WHERE c.activo = 1 AND p.activo = 1 AND l.activo = 1`,
  );
  return filas.map((f) => ({ project_id: f.project_id, activo: true, dia_entrega: Number(f.dia_entrega), hora_entrega: f.hora_entrega, anticipacion_horas: Number(f.anticipacion_horas) }));
}

/**
 * Creates the report of a period if it does not exist yet. Returns its id either way.
 * A partial week generated mid-week (shorter period, not approved) grows into the full week and is queued again.
 */
export async function asegurarReporte(projectId: string, e: Entrega, estado: EstadoReporte = 'programado'): Promise<string> {
  await query(
    'INSERT IGNORE INTO proyecto_reportes (id, project_id, periodo_desde, periodo_hasta, entregar_en, estado) VALUES (?, ?, ?, ?, ?, ?)',
    [uuid(), projectId, e.desde, e.hasta, aMysql(e.entregarEn), estado],
  );
  await query(
    `UPDATE proyecto_reportes SET periodo_hasta = ?, entregar_en = ?, estado = ?, intentos = 0, proximo_intento_en = NULL, error = NULL, notificado_en = NULL
      WHERE project_id = ? AND periodo_desde = ? AND periodo_hasta < ? AND estado IN ('programado', 'borrador', 'fallido')`,
    [e.hasta, aMysql(e.entregarEn), estado, projectId, e.desde, e.hasta],
  );
  const f = await queryOne<{ id: string }>('SELECT id FROM proyecto_reportes WHERE project_id = ? AND periodo_desde = ?', [projectId, e.desde]);
  return f!.id;
}

export async function leerReporte(id: string): Promise<FilaReporte | null> {
  const f = await queryOne<any>(`${SELECT} WHERE r.id = ?`, [id]);
  return f ? normalizar(f) : null;
}

export async function listarReportes(projectId: string): Promise<FilaReporte[]> {
  const filas = await query<any[]>(`${SELECT} WHERE r.project_id = ? ORDER BY r.periodo_desde DESC LIMIT 60`, [projectId]);
  return filas.map(normalizar);
}

/** Moves a report to "generating" only from the given states; false if someone else took it. */
export async function marcarGenerando(id: string, desde: EstadoReporte[]): Promise<boolean> {
  const r: any = await query(
    `UPDATE proyecto_reportes SET estado = 'generando', generando_desde = NOW(3), error = NULL WHERE id = ? AND estado IN (${desde.map(() => '?').join(',')})`,
    [id, ...desde],
  );
  return Number(r.affectedRows) === 1;
}

/** The next scheduled report whose turn arrived, taken atomically (safe with more than one API process). */
export async function tomarSiguiente(ahora: Date): Promise<FilaReporte | null> {
  const candidato = await queryOne<{ id: string }>(
    `SELECT id FROM proyecto_reportes WHERE estado = 'programado' AND (proximo_intento_en IS NULL OR proximo_intento_en <= ?) ORDER BY entregar_en LIMIT 1`,
    [aMysql(ahora)],
  );
  if (!candidato || !(await marcarGenerando(candidato.id, ['programado']))) return null;
  return leerReporte(candidato.id);
}

/** Queued reports of projects deleted or left without an active leader: nobody would receive them. */
export async function descartarSinLider(): Promise<void> {
  await query(
    `UPDATE proyecto_reportes r JOIN projects p ON p.id = r.project_id LEFT JOIN profiles l ON l.id = p.lider_user_id
        SET r.estado = 'fallido', r.error = 'El proyecto se eliminó o no tiene un líder activo.', r.generando_desde = NULL
      WHERE r.estado = 'programado' AND (p.activo = 0 OR l.id IS NULL OR l.activo = 0)`,
  );
}

export async function guardarBorrador(id: string, contenido: ContenidoReporte, indicaciones: string | null): Promise<void> {
  await query(
    "UPDATE proyecto_reportes SET estado = 'borrador', contenido = ?, indicaciones = ?, generado_en = NOW(3), error = NULL, generando_desde = NULL WHERE id = ?",
    [JSON.stringify(contenido), indicaciones, id],
  );
}

/** A failed scheduled attempt: try again at `reintentarEn`, or give up (fallido) when it is null. */
export async function registrarFallo(id: string, error: string, reintentarEn: Date | null): Promise<void> {
  await query(
    `UPDATE proyecto_reportes SET estado = ?, intentos = intentos + 1, error = ?, proximo_intento_en = ?, generando_desde = NULL WHERE id = ?`,
    [reintentarEn ? 'programado' : 'fallido', error.slice(0, 300), reintentarEn ? aMysql(reintentarEn) : null, id],
  );
}

/** A manual regeneration failed: the report keeps its previous content, with the error to show. */
export async function volverABorrador(id: string, estadoAnterior: EstadoReporte, error: string): Promise<void> {
  await query('UPDATE proyecto_reportes SET estado = ?, error = ?, generando_desde = NULL WHERE id = ?', [estadoAnterior, error.slice(0, 300), id]);
}

/** Reports left "generating" by a restart: back to the queue as a failed attempt. */
export async function colgados(ahora: Date): Promise<FilaReporte[]> {
  const filas = await query<any[]>(`${SELECT} WHERE r.estado = 'generando' AND r.generando_desde < ?`, [aMysql(new Date(ahora.getTime() - 30 * 60_000))]);
  return filas.map(normalizar);
}

export async function porNotificar(ahora: Date): Promise<FilaReporte[]> {
  const filas = await query<any[]>(`${SELECT} WHERE r.estado = 'borrador' AND r.notificado_en IS NULL AND r.entregar_en <= ?`, [aMysql(ahora)]);
  return filas.map(normalizar);
}

export async function marcarNotificado(id: string): Promise<void> {
  await query('UPDATE proyecto_reportes SET notificado_en = NOW(3) WHERE id = ?', [id]);
}

export async function aprobar(id: string, userId: string, pdfPath: string): Promise<boolean> {
  const r: any = await query(
    "UPDATE proyecto_reportes SET estado = 'aprobado', aprobado_por = ?, aprobado_en = NOW(3), pdf_path = ? WHERE id = ? AND estado = 'borrador'",
    [userId, pdfPath, id],
  );
  return Number(r.affectedRows) === 1;
}

export async function registrarEnvio(reporteId: string, userId: string, para: string[], cc: string[]): Promise<void> {
  await query('INSERT INTO proyecto_reporte_envios (id, reporte_id, enviado_por, para, cc) VALUES (?, ?, ?, ?, ?)', [uuid(), reporteId, userId, JSON.stringify(para), JSON.stringify(cc)]);
}

export async function envios(reporteId: string) {
  const filas = await query<any[]>(
    `SELECT e.id, e.para, e.cc, e.enviado_en, u.nombre AS enviado_por FROM proyecto_reporte_envios e LEFT JOIN profiles u ON u.id = e.enviado_por
      WHERE e.reporte_id = ? ORDER BY e.enviado_en DESC`,
    [reporteId],
  );
  const json = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v) as string[];
  return filas.map((f) => ({ id: f.id, para: json(f.para), cc: json(f.cc), enviado_en: f.enviado_en, enviado_por: f.enviado_por }));
}

/** Drafts ready for review in projects this person leads (the badge next to "Proyectos"). */
export async function pendientesDe(userId: string): Promise<number> {
  const f = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM proyecto_reportes r JOIN projects p ON p.id = r.project_id
      WHERE p.lider_user_id = ? AND p.activo = 1 AND r.estado = 'borrador' AND r.notificado_en IS NOT NULL`,
    [userId],
  );
  return Number(f?.n ?? 0);
}

/** People who can receive a report: internal Tiusdei users with an email. */
export async function destinatarios(ids: string[]): Promise<{ id: string; nombre: string; email: string }[]> {
  if (!ids.length) return [];
  return query<any[]>(
    `SELECT p.id, p.nombre, p.email FROM profiles p WHERE p.id IN (${ids.map(() => '?').join(',')}) AND p.email IS NOT NULL AND p.rol <> 'cliente' AND p.activo = 1`,
    ids,
  );
}

