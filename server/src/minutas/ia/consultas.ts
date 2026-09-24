import { query, queryOne, uuid } from '../../db/mysql.js';
import { inicioDelDiaEcuador, limiteDiario, listaDeMesas, type BorradorIa } from './dominio.js';

// MySQL runs in UTC; DATETIME literals are written in UTC as well.
const aMysql = (d: Date) => d.toISOString().slice(0, 23).replace('T', ' ');

export async function configuracionIa(): Promise<{ mesas: string[]; limite: number }> {
  const filas = await query<{ key: string; value: string | null }[]>(
    "SELECT `key`, value FROM site_settings WHERE `key` IN ('ia_minutas_desk_ids', 'ia_minutas_limite_diario')",
  );
  const valor = (k: string) => filas.find((f) => f.key === k)?.value ?? null;
  return { mesas: listaDeMesas(valor('ia_minutas_desk_ids')), limite: limiteDiario(valor('ia_minutas_limite_diario')) };
}

export async function mesasDe(userId: string): Promise<string[]> {
  const filas = await query<{ desk_id: string }[]>('SELECT desk_id FROM desk_members WHERE user_id = ?', [userId]);
  return filas.map((f) => f.desk_id);
}

/** Drafts started today (Ecuador time) that did not fail. */
export async function usadosHoy(userId: string, ahora = new Date()): Promise<number> {
  const fila = await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM minuta_ia_trabajos WHERE user_id = ? AND estado <> 'error' AND created_at >= ?",
    [userId, aMysql(inicioDelDiaEcuador(ahora))],
  );
  return Number(fila?.n ?? 0);
}

export async function crearTrabajo(userId: string, caracteres: number): Promise<string> {
  const id = uuid();
  await query('INSERT INTO minuta_ia_trabajos (id, user_id, caracteres) VALUES (?, ?, ?)', [id, userId, caracteres]);
  return id;
}

export async function terminarTrabajo(id: string, borrador: BorradorIa): Promise<void> {
  await query("UPDATE minuta_ia_trabajos SET estado = 'listo', borrador = ?, terminado_at = NOW(3) WHERE id = ?", [JSON.stringify(borrador), id]);
}

export async function fallarTrabajo(id: string, error: string): Promise<void> {
  await query("UPDATE minuta_ia_trabajos SET estado = 'error', error = ?, terminado_at = NOW(3) WHERE id = ?", [error.slice(0, 300), id]);
}

export interface Trabajo { id: string; estado: 'procesando' | 'listo' | 'error'; borrador: BorradorIa | null; error: string | null; colgado: number }

export async function leerTrabajo(id: string, userId: string): Promise<Trabajo | null> {
  return queryOne<Trabajo>(
    `SELECT id, estado, borrador, error, (estado = 'procesando' AND created_at < NOW(3) - INTERVAL 10 MINUTE) AS colgado
       FROM minuta_ia_trabajos WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
}
