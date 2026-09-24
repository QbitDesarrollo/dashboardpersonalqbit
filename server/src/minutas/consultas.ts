import type { PoolConnection } from 'mysql2/promise';
import type { z } from 'zod';
import { query, queryOne, uuid } from '../db/mysql.js';
import { progreso, type EstadoPunto } from './domain.js';
import type { itemSchema } from './esquemas.js';

/** Acceso a la base para minutas: armar el detalle y las escrituras que se reusan. */
/** Un punto nuevo. Si lo debe hacer el cliente, no lleva responsable del equipo. */
export async function insertarPunto(conn: PoolConnection, minutaId: string, numero: number, it: z.infer<typeof itemSchema>) {
  await conn.execute(
    `INSERT INTO minuta_items (id, minuta_id, numero, titulo, descripcion, responsable_user_id, responsable_cliente, fecha_compromiso, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), minutaId, numero, it.titulo, it.descripcion ?? null,
     it.responsable_cliente ? null : (it.responsable_user_id ?? null),
     it.responsable_cliente ? 1 : 0, it.fecha_compromiso ?? null, numero],
  );
}

/**
 * Un punto pendiente pasa a en curso cuando arranca alguna de sus tareas.
 * Las tareas cambian de estado en muchas pantallas (timer, Kanban, handoff...),
 * así que en vez de engancharse a cada una se sincroniza al leer minutas.
 * Es la acción `iniciar` del dominio: solo mueve puntos pendientes.
 */
export async function sincronizarArranques(minutaId?: string): Promise<void> {
  await query(
    `UPDATE minuta_items i SET i.estado = 'en_curso'
      WHERE i.estado = 'pendiente'
        ${minutaId ? 'AND i.minuta_id = ?' : ''}
        AND EXISTS (SELECT 1 FROM tasks t WHERE t.minuta_item_id = i.id AND t.estado <> 'backlog')`,
    minutaId ? [minutaId] : [],
  );
}

export async function insertarNota(itemId: string, tipo: 'nota' | 'ajuste', texto: string, autorId: string) {
  await query('INSERT INTO minuta_item_notas (id, item_id, tipo, texto, autor_user_id) VALUES (?, ?, ?, ?, ?)', [uuid(), itemId, tipo, texto, autorId]);
}

export function codigo(numero: number): string {
  return `M-${String(numero).padStart(2, '0')}`;
}

export async function cargarDetalle(id: string) {
  await sincronizarArranques(id);
  const m = await queryOne<any>(
    `SELECT m.id, m.brand_id, b.nombre AS brand_nombre, m.project_id, p.nombre AS project_nombre,
            m.numero, m.titulo, DATE_FORMAT(m.fecha, '%Y-%m-%d') AS fecha, m.resumen, m.enlaces, m.estado,
            m.owner_user_id, o.nombre AS owner_nombre, o.avatar_url AS owner_avatar, m.created_at
       FROM minutas m
       JOIN brands b ON b.id = m.brand_id
       LEFT JOIN projects p ON p.id = m.project_id
       LEFT JOIN profiles o ON o.id = m.owner_user_id
      WHERE m.id = ?`,
    [id],
  );
  if (!m) return null;
  const miembros = await query<any[]>(
    `SELECT p.id, p.nombre, p.avatar_url
       FROM minuta_miembros mm JOIN profiles p ON p.id = mm.user_id
      WHERE mm.minuta_id = ?
      ORDER BY p.nombre`,
    [id],
  );
  const items = await query<any[]>(
    `SELECT i.*, DATE_FORMAT(i.fecha_compromiso, '%Y-%m-%d') AS fecha_compromiso,
            r.nombre AS responsable_nombre, r.avatar_url AS responsable_avatar,
            c.nombre AS completado_por_nombre
       FROM minuta_items i
       LEFT JOIN profiles r ON r.id = i.responsable_user_id
       LEFT JOIN profiles c ON c.id = i.completado_por
      WHERE i.minuta_id = ?
      ORDER BY i.sort_order, i.numero`,
    [id],
  );
  const evidenciasPorItem = new Map<string, any[]>();
  const tareasPorItem = new Map<string, any[]>();
  const notasPorItem = new Map<string, any[]>();
  if (items.length) {
    const ids = items.map((i) => i.id);
    const notas = await query<any[]>(
      `SELECT n.id, n.item_id, n.tipo, n.texto, n.created_at, n.autor_user_id, p.nombre AS autor_nombre
         FROM minuta_item_notas n
         LEFT JOIN profiles p ON p.id = n.autor_user_id
        WHERE n.item_id IN (${ids.map(() => '?').join(',')})
        ORDER BY n.created_at`,
      ids,
    );
    for (const n of notas) {
      const lista = notasPorItem.get(n.item_id) ?? [];
      lista.push({
        id: n.id, tipo: n.tipo, texto: n.texto, created_at: n.created_at,
        autor: n.autor_user_id ? { id: n.autor_user_id, nombre: n.autor_nombre } : null,
      });
      notasPorItem.set(n.item_id, lista);
    }
    const tareas = await query<any[]>(
      `SELECT t.id, t.minuta_item_id, t.titulo_tarea, t.estado, DATE_FORMAT(t.fecha_entrega, '%Y-%m-%d') AS fecha_entrega,
              t.responsable_user_id, p.nombre AS responsable_nombre, p.avatar_url AS responsable_avatar
         FROM tasks t
         LEFT JOIN profiles p ON p.id = t.responsable_user_id
        WHERE t.minuta_item_id IN (${ids.map(() => '?').join(',')})
        ORDER BY t.created_at`,
      ids,
    );
    for (const t of tareas) {
      const lista = tareasPorItem.get(t.minuta_item_id) ?? [];
      lista.push({
        id: t.id, titulo_tarea: t.titulo_tarea, estado: t.estado, fecha_entrega: t.fecha_entrega,
        responsable: t.responsable_user_id ? { id: t.responsable_user_id, nombre: t.responsable_nombre, avatar_url: t.responsable_avatar } : null,
      });
      tareasPorItem.set(t.minuta_item_id, lista);
    }
    const evidencias = await query<any[]>(
      `SELECT id, item_id, tipo, nombre, url, drive_file_id, origen_task_id, created_at
         FROM minuta_item_evidencias
        WHERE item_id IN (${ids.map(() => '?').join(',')})
        ORDER BY created_at`,
      ids,
    );
    for (const e of evidencias) {
      const lista = evidenciasPorItem.get(e.item_id) ?? [];
      lista.push({ id: e.id, tipo: e.tipo, nombre: e.nombre, url: e.url, drive_file_id: e.drive_file_id, origen_task_id: e.origen_task_id });
      evidenciasPorItem.set(e.item_id, lista);
    }
  }
  return {
    id: m.id,
    brand_id: m.brand_id,
    brand_nombre: m.brand_nombre,
    project_id: m.project_id,
    project_nombre: m.project_nombre,
    numero: m.numero,
    codigo: codigo(m.numero),
    titulo: m.titulo,
    fecha: m.fecha,
    resumen: m.resumen,
    enlaces: m.enlaces ?? [],
    estado: m.estado,
    owner: { id: m.owner_user_id, nombre: m.owner_nombre, avatar_url: m.owner_avatar },
    miembros,
    progreso: progreso(items.map((i) => i.estado as EstadoPunto)),
    items: items.map((i) => ({
      id: i.id,
      numero: i.numero,
      titulo: i.titulo,
      descripcion: i.descripcion,
      responsable: i.responsable_user_id
        ? { id: i.responsable_user_id, nombre: i.responsable_nombre, avatar_url: i.responsable_avatar }
        : null,
      responsable_cliente: !!i.responsable_cliente,
      fecha_compromiso: i.fecha_compromiso,
      estado: i.estado,
      visible_cliente: !!i.visible_cliente,
      resolucion: i.resolucion,
      completado_por: i.completado_por ? { id: i.completado_por, nombre: i.completado_por_nombre } : null,
      completado_en: i.completado_en,
      aprobado_via: i.aprobado_via,
      aprobado_por_nombre: i.aprobado_por_nombre,
      aprobado_en: i.aprobado_en,
      motivo_descarte: i.motivo_descarte,
      evidencias: evidenciasPorItem.get(i.id) ?? [],
      tareas: tareasPorItem.get(i.id) ?? [],
      notas: notasPorItem.get(i.id) ?? [],
    })),
    created_at: m.created_at,
  };
}
