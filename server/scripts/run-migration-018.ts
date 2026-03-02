/**
 * Ejecuta la migración 018 (created_by en tasks).
 * Uso: cd server && npx tsx scripts/run-migration-018.ts
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Definir DATABASE_URL (ej: mysql://user:pass@host:3306/tiusdei)');
    process.exit(1);
  }
  const conn = await mysql.createConnection(url);
  const sqlPath = join(__dirname, '../db/migrations/018_tasks_created_by.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const st of statements) {
    try {
      await conn.query(st);
      console.log('OK:', st.slice(0, 70));
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('Columna created_by ya existe (ignorando).');
      } else if (e.code === 'ER_DUP_KEYNAME' || e.code === 'ER_FK_DUP_NAME') {
        console.log('Constraint fk_tasks_created_by ya existe (ignorando).');
      } else {
        throw e;
      }
    }
  }
  await conn.end();
  console.log('Migración 018 aplicada.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
