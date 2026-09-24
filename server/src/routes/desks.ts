import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole, getUserRole } from '../utils/roles.js';
import { getGlobalOnlineUserIds, getGlobalPresence, type UserPresenceInfo } from '../socket.js';

export const desksRouter = Router();

desksRouter.get('/desks', requireAuth, async (req: AuthRequest, res) => {
  try {
    const role = await getUserRole(req.userId!);
    let rows: any[];
    if (role === 'equipo') {
      // Equipo solo ve las mesas donde es miembro
      rows = await query<any[]>(
        `SELECT d.* FROM desks d
         INNER JOIN desk_members dm ON dm.desk_id = d.id
         WHERE dm.user_id = ?
         ORDER BY d.nombre`,
        [req.userId]
      );
    } else {
      rows = await query<any[]>('SELECT * FROM desks ORDER BY nombre');
    }
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar mesas' });
  }
});

desksRouter.post('/desks', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { nombre, activo } = req.body;
    const id = uuid();
    await query('INSERT INTO desks (id, nombre, activo) VALUES (?, ?, ?)', [id, nombre, activo !== false ? 1 : 0]);
    const row = await queryOne<any>('SELECT * FROM desks WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear mesa' });
  }
});

desksRouter.get('/desks/online-users', requireAuth, async (_req: AuthRequest, res) => {
  try {
    res.json({ online: getGlobalOnlineUserIds(), presence: getGlobalPresence() });
  } catch {
    res.json({ online: [], presence: [] });
  }
});

desksRouter.get('/desks/unread-counts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const isAdminOps = await hasRole(userId, ['admin', 'ejecutivo']);

    let deskIds: string[];
    if (isAdminOps) {
      const allDesks = await query<{ id: string }[]>('SELECT id FROM desks WHERE activo = 1');
      deskIds = allDesks.map((d: any) => d.id);
    } else {
      const myDesks = await query<{ desk_id: string }[]>(
        'SELECT desk_id FROM desk_members WHERE user_id = ?', [userId]
      );
      deskIds = myDesks.map((d: any) => d.desk_id);
    }

    if (deskIds.length === 0) {
      res.json({ counts: {} });
      return;
    }

    const placeholders = deskIds.map(() => '?').join(',');
    const rows = await query<any[]>(
      `SELECT m.desk_id, COUNT(*) as unread
       FROM desk_messages m
       WHERE m.desk_id IN (${placeholders})
         AND m.user_id != ?
         AND m.id NOT IN (
           SELECT r.message_id FROM desk_message_reads r WHERE r.user_id = ?
         )
       GROUP BY m.desk_id`,
      [...deskIds, userId, userId]
    );

    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.desk_id] = Number(r.unread);
    }

    // Última actividad por mesa: el panel ordena como WhatsApp (reciente arriba)
    const lastRows = await query<any[]>(
      `SELECT desk_id, MAX(created_at) AS last_at FROM desk_messages
       WHERE desk_id IN (${placeholders}) GROUP BY desk_id`,
      deskIds
    );
    const last_activity: Record<string, string> = {};
    for (const r of lastRows) {
      if (r.last_at) last_activity[r.desk_id] = new Date(r.last_at).toISOString();
    }
    res.json({ counts, last_activity });
  } catch (e) {
    console.error('[DESKS] Error unread counts:', e);
    res.status(500).json({ error: 'Error al cargar no leídos' });
  }
});

desksRouter.patch('/desks/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const { nombre, activo } = req.body;
    await query('UPDATE desks SET nombre = ?, activo = ? WHERE id = ?', [nombre, activo !== false ? 1 : 0, id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

desksRouter.get('/desks/:id/members', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const rows = await query<any[]>(
      `SELECT p.*, dm.es_soporte FROM profiles p
       INNER JOIN desk_members dm ON dm.user_id = p.id
       WHERE dm.desk_id = ? AND p.activo = 1 ORDER BY p.nombre`,
      [id]
    );
    res.json(rows.map((r) => ({ ...r, activo: !!r.activo, es_soporte: !!r.es_soporte })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar equipo' });
  }
});

desksRouter.post('/desks/:id/members', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    // Acepta { user_id } (legacy, una persona) o { user_ids: [] } (bulk).
    const ids: string[] = Array.isArray(req.body?.user_ids)
      ? req.body.user_ids.filter((x: unknown) => typeof x === 'string' && x.length > 0)
      : (req.body?.user_id ? [String(req.body.user_id)] : []);
    if (ids.length === 0) return res.status(400).json({ error: 'user_id o user_ids requerido' });
    for (const uid of ids) {
      await query(
        'INSERT IGNORE INTO desk_members (id, desk_id, user_id) VALUES (?, ?, ?)',
        [uuid(), id, uid]
      );
    }
    res.json({ success: true, count: ids.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al asignar' });
  }
});

// Marcar/desmarcar a un miembro como SOPORTE (no cuenta para el % de la mesa)
desksRouter.patch('/desks/:id/members/:userId/soporte', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id, userId } = req.params;
    const esSoporte = req.body?.es_soporte ? 1 : 0;
    await query('UPDATE desk_members SET es_soporte = ? WHERE desk_id = ? AND user_id = ?', [esSoporte, id, userId]);
    res.json({ success: true, es_soporte: !!esSoporte });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

desksRouter.delete('/desks/:id/members/:userId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id, userId } = req.params;
    await query('DELETE FROM desk_members WHERE desk_id = ? AND user_id = ?', [id, userId]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al quitar' });
  }
});

// ========== Desk Brands (many-to-many) ==========
desksRouter.get('/desks/:id/brands', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const rows = await query<any[]>(
      `SELECT b.*, c.nombre as cliente_nombre FROM brands b
       INNER JOIN desk_brands db ON db.brand_id = b.id
       LEFT JOIN clients c ON c.id = b.cliente_id
       WHERE db.desk_id = ? ORDER BY b.nombre`,
      [id]
    );
    res.json(rows.map((r) => ({ ...r, activo: !!r.activo, clients: r.cliente_nombre ? { nombre: r.cliente_nombre } : null })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar marcas de la mesa' });
  }
});

desksRouter.post('/desks/:id/brands', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const { brand_ids } = req.body;
    if (!Array.isArray(brand_ids) || brand_ids.length === 0) return res.status(400).json({ error: 'brand_ids requerido' });
    for (const brandId of brand_ids) {
      await query(
        'INSERT IGNORE INTO desk_brands (id, desk_id, brand_id) VALUES (?, ?, ?)',
        [uuid(), id, brandId]
      );
    }
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al asignar marcas' });
  }
});

desksRouter.delete('/desks/:id/brands/:brandId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id, brandId } = req.params;
    await query('DELETE FROM desk_brands WHERE desk_id = ? AND brand_id = ?', [id, brandId]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al quitar marca' });
  }
});

// ========== Desk Chat Messages ==========
desksRouter.get('/desks/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 50, 1), 200);
    const before = typeof req.query.before === 'string' ? req.query.before : null;

    // Verify membership or admin/ejecutivo role
    const member = await queryOne<{ id: string }>(
      'SELECT dm.id FROM desk_members dm WHERE dm.desk_id = ? AND dm.user_id = ?',
      [id, req.userId]
    );
    if (!member) {
      const isAdminOps = await hasRole(req.userId!, ['admin', 'ejecutivo']);
      if (!isAdminOps) return res.status(403).json({ error: 'Sin acceso a esta mesa' });
    }

    let sql = `
      SELECT m.id, m.desk_id, m.user_id, m.mensaje, m.image_url, m.created_at,
             p.nombre AS user_nombre, p.avatar_url
      FROM desk_messages m
      LEFT JOIN profiles p ON p.id = m.user_id
      WHERE m.desk_id = ?
    `;
    const params: unknown[] = [id];

    if (before) {
      sql += ' AND m.created_at < ?';
      params.push(before);
    }

    sql += ` ORDER BY m.created_at DESC LIMIT ${limit}`;

    const rows = await query<any[]>(sql, params);

    const messagesRaw = rows.map((r: any) => ({
      id: r.id,
      desk_id: r.desk_id,
      user_id: r.user_id,
      mensaje: r.mensaje,
      image_url: r.image_url || null,
      created_at: r.created_at,
      user: { nombre: r.user_nombre, avatar_url: r.avatar_url },
    })).reverse(); // Return in ASC order

    // Fetch read receipts for these messages
    const msgIds = messagesRaw.map((m: any) => m.id);
    let readMap: Record<string, { user_id: string; nombre: string; read_at: string }[]> = {};
    if (msgIds.length > 0) {
      const placeholders = msgIds.map(() => '?').join(',');
      const readRows = await query<any[]>(
        `SELECT r.message_id, r.user_id, r.read_at, p.nombre
         FROM desk_message_reads r
         LEFT JOIN profiles p ON p.id = r.user_id
         WHERE r.message_id IN (${placeholders})`,
        msgIds
      );
      for (const rr of readRows) {
        if (!readMap[rr.message_id]) readMap[rr.message_id] = [];
        readMap[rr.message_id].push({ user_id: rr.user_id, nombre: rr.nombre, read_at: rr.read_at });
      }
    }

    // Fetch reactions for these messages
    let reactionsMap: Record<string, { emoji: string; user_id: string; nombre: string }[]> = {};
    if (msgIds.length > 0) {
      const placeholders2 = msgIds.map(() => '?').join(',');
      const reactionRows = await query<any[]>(
        `SELECT r.message_id, r.emoji, r.user_id, p.nombre
         FROM desk_message_reactions r
         LEFT JOIN profiles p ON p.id = r.user_id
         WHERE r.message_id IN (${placeholders2})
         ORDER BY r.created_at`,
        msgIds
      );
      for (const rr of reactionRows) {
        if (!reactionsMap[rr.message_id]) reactionsMap[rr.message_id] = [];
        reactionsMap[rr.message_id].push({ emoji: rr.emoji, user_id: rr.user_id, nombre: rr.nombre });
      }
    }

    const messages = messagesRaw.map((m: any) => ({
      ...m,
      read_by: readMap[m.id] || [],
      reactions: reactionsMap[m.id] || [],
    }));

    // Auto-mark all fetched messages as read for the current user
    const userId = req.userId!;
    const unreadMsgIds = messagesRaw
      .filter((m: any) => m.user_id !== userId && !(readMap[m.id] || []).some((r: any) => r.user_id === userId))
      .map((m: any) => m.id);
    if (unreadMsgIds.length > 0) {
      for (const msgId of unreadMsgIds) {
        await query(
          'INSERT IGNORE INTO desk_message_reads (id, message_id, user_id) VALUES (?, ?, ?)',
          [uuid(), msgId, userId]
        ).catch(() => {});
      }
    }

    res.json({ messages, has_more: rows.length === limit });
  } catch (e) {
    console.error('[DESKS] Error get messages:', e);
    res.status(500).json({ error: 'Error al cargar mensajes' });
  }
});
