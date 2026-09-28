import { query, queryOne, uuid } from '../../db/mysql.js';

/** Database access for the client link of a minuta. */

export interface EnlaceMinuta {
  id: string;
  numero: number;
  titulo: string;
  brand_id: string;
  brand_nombre: string;
  owner_user_id: string;
  owner_email: string | null;
  share_token: string | null;
  share_activo: boolean;
  share_codigo: string | null;
  share_version: number;
  share_intentos: number;
  share_bloqueado_hasta: Date | null;
}

const SELECT = `
  SELECT m.id, m.numero, m.titulo, m.brand_id, b.nombre AS brand_nombre, m.owner_user_id, o.email AS owner_email,
         m.share_token, m.share_activo, m.share_codigo, m.share_version, m.share_intentos, m.share_bloqueado_hasta
    FROM minutas m JOIN brands b ON b.id = m.brand_id LEFT JOIN profiles o ON o.id = m.owner_user_id`;

const normalizar = (f: any): EnlaceMinuta => ({
  ...f, share_activo: !!Number(f.share_activo), share_version: Number(f.share_version), share_intentos: Number(f.share_intentos),
});

export async function porToken(token: string): Promise<EnlaceMinuta | null> {
  if (!token || token.length > 80) return null;
  const f = await queryOne<any>(`${SELECT} WHERE m.share_token = ?`, [token]);
  return f ? normalizar(f) : null;
}

export async function porId(id: string): Promise<EnlaceMinuta | null> {
  const f = await queryOne<any>(`${SELECT} WHERE m.id = ?`, [id]);
  return f ? normalizar(f) : null;
}

export async function guardarIntento(id: string, intentos: number, bloqueadoHasta: Date | null): Promise<void> {
  await query('UPDATE minutas SET share_intentos = ?, share_bloqueado_hasta = ? WHERE id = ?', [intentos, bloqueadoHasta, id]);
}

export async function registrarAcceso(id: string, nombre: string): Promise<void> {
  await query('INSERT INTO minuta_accesos (id, minuta_id, nombre) VALUES (?, ?, ?)', [uuid(), id, nombre]);
}

export interface Envio { id: string; medio: 'correo' | 'copiado'; para: { nombre: string; email: string }[]; enviado_por: string | null; enviado_en: Date }

export async function envios(id: string): Promise<Envio[]> {
  const filas = await query<any[]>(
    `SELECT e.id, e.medio, e.para, p.nombre AS enviado_por, e.enviado_en
       FROM minuta_envios e LEFT JOIN profiles p ON p.id = e.enviado_por
      WHERE e.minuta_id = ? ORDER BY e.enviado_en`,
    [id],
  );
  return filas.map((f) => ({ ...f, para: typeof f.para === 'string' ? JSON.parse(f.para) : f.para ?? [] }));
}

/** A point of this minuta the client may act on: visible and not discarded. */
export async function puntoVisible(minutaId: string, itemId: string) {
  return queryOne<{ id: string; numero: number; titulo: string; estado: string; responsable_cliente: number }>(
    `SELECT id, numero, titulo, estado, responsable_cliente FROM minuta_items
      WHERE id = ? AND minuta_id = ? AND visible_cliente = 1 AND estado <> 'descartado'`,
    [itemId, minutaId],
  );
}

/** An uploaded image of a visible point of this minuta. */
export async function imagenVisible(minutaId: string, evidenciaId: string) {
  return queryOne<{ url: string }>(
    `SELECT e.url FROM minuta_item_evidencias e JOIN minuta_items i ON i.id = e.item_id
      WHERE e.id = ? AND e.tipo = 'imagen' AND i.minuta_id = ? AND i.visible_cliente = 1 AND i.estado <> 'descartado'`,
    [evidenciaId, minutaId],
  );
}

/** Turns the link on, creating its token and code the first time. */
export async function activar(id: string, nuevoToken: string, nuevoCodigo: string): Promise<void> {
  await query(
    `UPDATE minutas SET share_activo = 1,
            share_token = COALESCE(share_token, ?), share_codigo = COALESCE(share_codigo, ?)
      WHERE id = ?`,
    [nuevoToken, nuevoCodigo, id],
  );
}

/** Off: sessions and signed images of the current version stop working. */
export async function apagar(id: string): Promise<void> {
  await query('UPDATE minutas SET share_activo = 0, share_version = share_version + 1 WHERE id = ?', [id]);
}

export async function cambiarCodigo(id: string, nuevoCodigo: string): Promise<void> {
  await query(
    'UPDATE minutas SET share_codigo = ?, share_version = share_version + 1, share_intentos = 0, share_bloqueado_hasta = NULL WHERE id = ?',
    [nuevoCodigo, id],
  );
}

export async function accesos(id: string, limite = 20): Promise<{ nombre: string; entro_en: Date }[]> {
  return query<any[]>(`SELECT nombre, entro_en FROM minuta_accesos WHERE minuta_id = ? ORDER BY entro_en DESC LIMIT ${Number(limite)}`, [id]);
}

export async function contactos(brandId: string): Promise<{ id: string; nombre: string; email: string }[]> {
  return query<any[]>('SELECT id, nombre, email FROM marca_contactos WHERE brand_id = ? ORDER BY nombre', [brandId]);
}

/** Keeps who a minuta was sent to as contacts of its brand; the same email updates the name. */
export async function guardarContactos(brandId: string, personas: { nombre: string; email: string }[], userId: string): Promise<void> {
  for (const p of personas) {
    await query(
      `INSERT INTO marca_contactos (id, brand_id, nombre, email, created_by) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)`,
      [uuid(), brandId, p.nombre, p.email.toLowerCase(), userId],
    );
  }
}

export async function registrarEnvio(id: string, medio: 'correo' | 'copiado', para: { nombre: string; email: string }[], mensaje: string, userId: string): Promise<void> {
  await query('INSERT INTO minuta_envios (id, minuta_id, medio, para, mensaje, enviado_por) VALUES (?, ?, ?, ?, ?, ?)', [uuid(), id, medio, JSON.stringify(para), mensaje, userId]);
}
