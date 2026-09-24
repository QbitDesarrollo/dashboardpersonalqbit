import express from 'express';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { pool, query, uuid } from '../../src/db/mysql.js';

type Rol = 'admin' | 'ejecutivo' | 'equipo' | 'cliente';

export interface Usuario { id: string; nombre: string; token: string }

/** Levanta una app mínima con los routers indicados, montados en /api/data. */
export async function levantarApp(...routers: express.Router[]): Promise<{ url: string; cerrar: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  for (const r of routers) app.use('/api/data', r);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/api/data`,
    cerrar: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

const TABLAS_DE_PRUEBA = [
  'minuta_item_evidencias', 'minuta_items', 'minuta_miembros', 'minutas',
  'tasks', 'projects', 'brands', 'user_roles', 'profiles', 'users',
];
let conexionLimpieza: mysql.Connection | null = null;

/** Borra todo lo que crean los tests, en un solo viaje a la base. Solo corre contra *_test (ver test/setup.ts). */
export async function limpiarBase(): Promise<void> {
  if (!pool) throw new Error('Sin base de datos de pruebas');
  conexionLimpieza ??= await mysql.createConnection({ uri: process.env.DATABASE_URL!, multipleStatements: true });
  await conexionLimpieza.query(
    ['SET FOREIGN_KEY_CHECKS = 0', ...TABLAS_DE_PRUEBA.map((t) => `DELETE FROM ${t}`), 'SET FOREIGN_KEY_CHECKS = 1'].join(';'),
  );
}

export async function cerrarLimpieza(): Promise<void> {
  await conexionLimpieza?.end();
  conexionLimpieza = null;
}

export async function crearUsuario(nombre: string, rol: Rol = 'equipo'): Promise<Usuario> {
  const id = uuid();
  const email = `${id.slice(0, 8)}@test.local`;
  await query('INSERT INTO users (id, email, password_hash, nombre, rol) VALUES (?, ?, ?, ?, ?)', [id, email, 'x', nombre, rol]);
  await query('INSERT INTO profiles (id, nombre, email, rol) VALUES (?, ?, ?, ?)', [id, nombre, email, rol]);
  await query('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)', [uuid(), id, rol]);
  const token = jwt.sign({ sub: id, role: rol }, process.env.JWT_SECRET!, { algorithm: 'HS256' });
  return { id, nombre, token };
}

export async function crearMarca(nombre: string): Promise<string> {
  const id = uuid();
  await query('INSERT INTO brands (id, nombre) VALUES (?, ?)', [id, nombre]);
  return id;
}

export async function crearProyecto(brandId: string, nombre: string): Promise<string> {
  const id = uuid();
  await query('INSERT INTO projects (id, brand_id, nombre) VALUES (?, ?, ?)', [id, brandId, nombre]);
  return id;
}

export async function crearTarea(brandId: string, titulo: string, estado = 'backlog'): Promise<string> {
  const id = uuid();
  await query('INSERT INTO tasks (id, brand_id, titulo_tarea, estado) VALUES (?, ?, ?, ?)', [id, brandId, titulo, estado]);
  return id;
}

/** fetch con el token del usuario y JSON. Devuelve status y body ya parseado. */
export async function llamar(
  url: string,
  usuario: Usuario | null,
  metodo = 'GET',
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const res = await fetch(url, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(usuario ? { Authorization: `Bearer ${usuario.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed };
}
