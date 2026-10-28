import type { PoolConnection } from 'mysql2/promise';
import { pool } from '../db/mysql.js';
import { ErrorMinuta } from './servicio.js';

/** Una escritura completa se confirma o se revierte, también cuando la llama el MCP. */
export async function enTransaccion<T>(operacion: (conn: PoolConnection) => Promise<T>): Promise<T> {
  if (!pool) throw new ErrorMinuta(500, 'Base de datos no configurada');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await operacion(conn);
    await conn.commit();
    return resultado;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally { conn.release(); }
}
