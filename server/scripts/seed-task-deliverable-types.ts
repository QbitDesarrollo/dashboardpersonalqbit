/**
 * Seed de tipos de tarea y tipos de entregable.
 * No duplica si ya existen por nombre.
 * Ejecutar: cd server && npx tsx scripts/seed-task-deliverable-types.ts
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';

const TASK_TYPES = [
  'Diseño',
  'Desarrollo',
  'Creatividad',
  'Marketing',
  'Audiovisual',
  'Comercial',
  'Cuentas',
  'Administración',
  'QA / Testing',
  'DevOps',
];

const DELIVERABLE_TYPES = [
  'Logo',
  'Identidad visual',
  'Pieza gráfica',
  'Video',
  'Landing page',
  'Reporte',
  'Documento',
  'Propuesta',
  'Contrato',
  'Asset digital',
];

async function main() {
  const url = process.env.DATABASE_URL || 'mysql://root@localhost:3306/tiusdei';
  const conn = await mysql.createConnection(url);

  let taskCreated = 0;
  let taskSkipped = 0;
  for (const nombre of TASK_TYPES) {
    const [rows] = await conn.query<any[]>('SELECT id FROM task_types WHERE nombre = ?', [nombre]);
    if (rows.length > 0) {
      taskSkipped++;
      continue;
    }
    await conn.query('INSERT INTO task_types (id, nombre, activo) VALUES (?, ?, 1)', [randomUUID(), nombre]);
    taskCreated++;
  }

  let delivCreated = 0;
  let delivSkipped = 0;
  for (const nombre of DELIVERABLE_TYPES) {
    const [rows] = await conn.query<any[]>('SELECT id FROM deliverable_types WHERE nombre = ?', [nombre]);
    if (rows.length > 0) {
      delivSkipped++;
      continue;
    }
    await conn.query('INSERT INTO deliverable_types (id, nombre, activo) VALUES (?, ?, 1)', [randomUUID(), nombre]);
    delivCreated++;
  }

  console.log(`Tipos de tarea: creados ${taskCreated}, omitidos ${taskSkipped}`);
  console.log(`Tipos de entregable: creados ${delivCreated}, omitidos ${delivSkipped}`);
  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
