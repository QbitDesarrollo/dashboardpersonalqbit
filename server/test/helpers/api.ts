import crypto from 'crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { pool, query, uuid } from '../../src/db/mysql.js';

type Rol = 'admin' | 'ejecutivo' | 'equipo' | 'cliente';

export interface Usuario { id: string; nombre: string; token: string }

/** Levanta una app mínima con los routers indicados, montados en /api/data. */
export function levantarApp(...routers: express.Router[]): Promise<{ url: string; cerrar: () => Promise<void> }> {
  return levantarAppEn('/api/data', ...routers);
}

/** Igual que levantarApp, pero montando los routers en otra base (ej. /api para rutas públicas). */
export async function levantarAppEn(base: string, ...routers: express.Router[]): Promise<{ url: string; cerrar: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  for (const r of routers) app.use(base, r);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}${base}`,
    cerrar: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

const TABLAS_DE_PRUEBA = [
  'proyecto_reporte_envios', 'proyecto_reportes', 'proyecto_reportes_config', 'tarea_resumenes_ia', 'reporte_avances_ia',
  'comments', 'activity_log', 'notifications',
  'files', 'api_tokens', 'minuta_ia_trabajos', 'desk_members', 'desks', 'site_settings',
  'minuta_item_notas', 'minuta_item_evidencias', 'minuta_items', 'minuta_miembros', 'minutas',
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

/** Personal API token (the one the MCP sends), returned as a Usuario so `llamar` can use it. */
export async function crearTokenApi(usuario: Usuario): Promise<Usuario> {
  const plano = `tiusdei_${crypto.randomBytes(24).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(plano).digest('hex');
  await query('INSERT INTO api_tokens (id, user_id, token_hash, token_prefix, created_at) VALUES (?, ?, ?, ?, NOW(3))', [uuid(), usuario.id, hash, plano.slice(0, 16)]);
  return { ...usuario, token: plano };
}

export async function crearMesa(nombre: string, miembros: string[] = []): Promise<string> {
  const id = uuid();
  await query('INSERT INTO desks (id, nombre) VALUES (?, ?)', [id, nombre]);
  for (const userId of miembros) await query('INSERT INTO desk_members (id, desk_id, user_id) VALUES (?, ?, ?)', [uuid(), id, userId]);
  return id;
}

export async function fijarAjuste(key: string, value: string): Promise<void> {
  await query('INSERT INTO site_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [key, value]);
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
