#!/usr/bin/env npx tsx
/**
 * Crea la base de datos tiusdei y ejecuta el schema.
 * Uso: DATABASE_URL=mysql://root:pass@localhost:3306 npx tsx scripts/setup-db.ts
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function setup() {
  let url = process.env.DATABASE_URL;
  if (!url || url.includes('password') || url.includes('TU_PASSWORD')) {
    console.error('❌ Configura DATABASE_URL en server/.env');
    console.error('   Ejemplo: mysql://root:tu_password@localhost:3306/tiusdei');
    process.exit(1);
  }

  const baseUrl = url.replace(/\/tiusdei.*$/, '') || url.replace(/\/[^/]*$/, '');
  const conn = await mysql.createConnection({ uri: baseUrl, multipleStatements: true });

  try {
    await conn.query('CREATE DATABASE IF NOT EXISTS tiusdei CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await conn.query('USE tiusdei');
    console.log('✅ Base de datos tiusdei creada');

    const schemaPath = path.join(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    await conn.query(schema);
    console.log('✅ Schema ejecutado correctamente');
  } catch (e: any) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

setup();
