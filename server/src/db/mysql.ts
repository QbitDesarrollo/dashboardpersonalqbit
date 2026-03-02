import mysql from 'mysql2/promise';
import crypto from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.warn('[DB] DATABASE_URL no configurado');
}

function getPool() {
  if (!DATABASE_URL) return null;
  return mysql.createPool({
    uri: DATABASE_URL,
    // Connection pool tuned for 100 concurrent users
    connectionLimit: 20,
    maxIdle: 10,
    idleTimeout: 60000,
    waitForConnections: true,
    queueLimit: 50,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
    // Timezone & charset
    timezone: '+00:00',
    charset: 'utf8mb4',
  });
}

export const pool = getPool();

export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T> {
  if (!pool) throw new Error('Base de datos no configurada');
  const [rows] = await pool.execute(sql, params);
  return rows as T;
}

export async function queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T[]>(sql, params);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

// Cryptographically secure UUID
export function uuid(): string {
  return crypto.randomUUID();
}
