import { Router } from 'express';
import { requireAuth, requireAdminOrEjecutivo, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import {
  startConnection,
  disconnect,
  getStatus,
  syncGroups,
} from '../services/whatsapp.js';

export const whatsappRouter = Router();

// ─── Connection ───────────────────────────────────────────────────────

// GET /whatsapp/status - Get current connection status + QR
whatsappRouter.get('/whatsapp/status', requireAuth, requireAdminOrEjecutivo, async (_req, res) => {
  try {
    const status = getStatus();
    res.json(status);
  } catch (e) {
    console.error('[WA Route]', e);
    res.status(500).json({ error: 'Error al obtener estado' });
  }
});

// POST /whatsapp/connect - Start WhatsApp connection (generates QR)
whatsappRouter.post('/whatsapp/connect', requireAuth, requireAdminOrEjecutivo, async (_req, res) => {
  try {
    const result = await startConnection();
    res.json(result);
  } catch (e) {
    console.error('[WA Route]', e);
    res.status(500).json({ error: 'Error al conectar WhatsApp' });
  }
});

// POST /whatsapp/disconnect - Disconnect and clear session
whatsappRouter.post('/whatsapp/disconnect', requireAuth, requireAdminOrEjecutivo, async (_req, res) => {
  try {
    await disconnect();
    res.json({ status: 'disconnected' });
  } catch (e) {
    console.error('[WA Route]', e);
    res.status(500).json({ error: 'Error al desconectar' });
  }
});

// POST /whatsapp/sync-groups - Force sync groups from WhatsApp
whatsappRouter.post('/whatsapp/sync-groups', requireAuth, requireAdminOrEjecutivo, async (_req, res) => {
  try {
    const groups = await syncGroups();
    res.json({ groups });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al sincronizar grupos';
    console.error('[WA Route]', e);
    res.status(500).json({ error: msg });
  }
});

// ─── Groups ───────────────────────────────────────────────────────────

// GET /whatsapp/groups - List all groups
whatsappRouter.get('/whatsapp/groups', requireAuth, requireAdminOrEjecutivo, async (_req, res) => {
  try {
    const groups = await query(
      `SELECT g.*, b.nombre AS brand_nombre,
        (SELECT COUNT(*) FROM wa_group_members WHERE wa_group_id = g.wa_group_id) AS member_count,
        (SELECT COUNT(*) FROM wa_messages WHERE wa_group_id = g.wa_group_id AND is_from_client = 1 AND sla_status IN ('warning','breached')) AS pending_count
       FROM wa_groups g
       LEFT JOIN brands b ON b.id = g.brand_id
       ORDER BY g.is_monitored DESC, g.name ASC`
    );
    res.json(groups);
  } catch (e) {
    console.error('[WA Route]', e);
    res.status(500).json({ error: 'Error al listar grupos' });
  }
});

// PATCH /whatsapp/groups/:id - Update group (assign brand, toggle monitoring, SLA)
whatsappRouter.patch('/whatsapp/groups/:id', requireAuth, requireAdminOrEjecutivo, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { brand_id, is_monitored, sla_minutes } = req.body;

    const sets: string[] = [];
    const params: unknown[] = [];

    if (brand_id !== undefined) { sets.push('brand_id = ?'); params.push(brand_id || null); }
    if (is_monitored !== undefined) { sets.push('is_monitored = ?'); params.push(is_monitored ? 1 : 0); }
    if (sla_minutes !== undefined) { sets.push('sla_minutes = ?'); params.push(sla_minutes); }

    if (sets.length === 0) { res.status(400).json({ error: 'Nada que actualizar' }); return; }

    params.push(id);
    await query(`UPDATE wa_groups SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    console.error('[WA Route]', e);
    res.status(500).json({ error: 'Error al actualizar grupo' });
  }
});

// ─── Members ──────────────────────────────────────────────────────────

// GET /whatsapp/groups/:groupId/members - Get members of a group
whatsappRouter.get('/whatsapp/groups/:groupId/members', requireAuth, requireAdminOrEjecutivo, async (req, res) => {
  try {
    const { groupId } = req.params;
    // groupId here is the wa_groups.id (UUID), not the wa_group_id (jid)
    const group = await queryOne<{ wa_group_id: string }>('SELECT wa_group_id FROM wa_groups WHERE id = ?', [groupId]);
    if (!group) { res.status(404).json({ error: 'Grupo no encontrado' }); return; }

    const members = await query(
      `SELECT m.*, p.nombre AS user_nombre, p.email AS user_email
       FROM wa_group_members m
       LEFT JOIN profiles p ON p.id = m.user_id
       WHERE m.wa_group_id = ?
       ORDER BY FIELD(m.role, 'lider', 'ejecutivo', 'cliente', 'monitor', 'ignorar'), m.phone_number`,
      [group.wa_group_id]
    );
    res.json(members);
  } catch (e) {
    console.error('[WA Route]', e);
    res.status(500).json({ error: 'Error al listar miembros' });
  }
});

// PATCH /whatsapp/members/:id - Update member role / link user
whatsappRouter.patch('/whatsapp/members/:id', requireAuth, requireAdminOrEjecutivo, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { role, user_id } = req.body;

    const sets: string[] = [];
    const params: unknown[] = [];

    if (role) { sets.push('role = ?'); params.push(role); }
    if (user_id !== undefined) { sets.push('user_id = ?'); params.push(user_id || null); }

    if (sets.length === 0) { res.status(400).json({ error: 'Nada que actualizar' }); return; }

    params.push(id);
    await query(`UPDATE wa_group_members SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    console.error('[WA Route]', e);
    res.status(500).json({ error: 'Error al actualizar miembro' });
  }
});

// ─── Messages / Inbox ─────────────────────────────────────────────────

// GET /whatsapp/messages?group_id=&limit=&offset=
whatsappRouter.get('/whatsapp/messages', requireAuth, requireAdminOrEjecutivo, async (req, res) => {
  try {
    const groupWaId = req.query.group_id as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const slaFilter = req.query.sla as string;

    let where = 'WHERE 1=1';
    const params: unknown[] = [];

    if (groupWaId) {
      where += ' AND m.wa_group_id = ?';
      params.push(groupWaId);
    }
    if (slaFilter && slaFilter !== 'all') {
      where += ' AND m.sla_status = ?';
      params.push(slaFilter);
    }

    const messages = await query(
      `SELECT m.*, g.name AS group_name,
        gm.role AS sender_role, gm.wa_name AS sender_wa_name
       FROM wa_messages m
       LEFT JOIN wa_groups g ON g.wa_group_id = m.wa_group_id
       LEFT JOIN wa_group_members gm ON gm.wa_group_id = m.wa_group_id AND gm.phone_number = m.sender_phone
       ${where}
       ORDER BY m.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const countResult = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM wa_messages m ${where}`,
      params
    );

    res.json({ messages, total: countResult?.total || 0 });
  } catch (e) {
    console.error('[WA Route]', e);
    res.status(500).json({ error: 'Error al listar mensajes' });
  }
});

// ─── SLA Rules ────────────────────────────────────────────────────────

// GET /whatsapp/sla-rules
whatsappRouter.get('/whatsapp/sla-rules', requireAuth, requireAdminOrEjecutivo, async (_req, res) => {
  try {
    const rules = await query(
      `SELECT r.*, b.nombre AS brand_nombre, g.name AS group_name
       FROM wa_sla_rules r
       LEFT JOIN brands b ON b.id = r.brand_id
       LEFT JOIN wa_groups g ON g.wa_group_id = r.wa_group_id
       ORDER BY r.brand_id IS NULL DESC, b.nombre ASC`
    );
    res.json(rules);
  } catch (e) {
    console.error('[WA Route]', e);
    res.status(500).json({ error: 'Error al listar reglas SLA' });
  }
});

// POST /whatsapp/sla-rules
whatsappRouter.post('/whatsapp/sla-rules', requireAuth, requireAdminOrEjecutivo, async (req: AuthRequest, res) => {
  try {
    const { brand_id, wa_group_id, sla_minutes, warning_percent, work_start, work_end, work_days, auto_create_task, auto_notify_leader } = req.body;

    const id = uuid();
    await query(
      `INSERT INTO wa_sla_rules (id, brand_id, wa_group_id, sla_minutes, warning_percent, work_start, work_end, work_days, auto_create_task, auto_notify_leader)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, brand_id || null, wa_group_id || null, sla_minutes || 30, warning_percent || 75, work_start || '08:00:00', work_end || '18:00:00', work_days || '1,2,3,4,5', auto_create_task ? 1 : 0, auto_notify_leader ? 1 : 0]
    );

    res.json({ id });
  } catch (e) {
    console.error('[WA Route]', e);
    res.status(500).json({ error: 'Error al crear regla SLA' });
  }
});

// PATCH /whatsapp/sla-rules/:id
whatsappRouter.patch('/whatsapp/sla-rules/:id', requireAuth, requireAdminOrEjecutivo, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const fields = ['sla_minutes', 'warning_percent', 'work_start', 'work_end', 'work_days', 'auto_create_task', 'auto_notify_leader'];
    const sets: string[] = [];
    const params: unknown[] = [];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = ?`);
        params.push(req.body[f]);
      }
    }

    if (sets.length === 0) { res.status(400).json({ error: 'Nada que actualizar' }); return; }

    params.push(id);
    await query(`UPDATE wa_sla_rules SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    console.error('[WA Route]', e);
    res.status(500).json({ error: 'Error al actualizar regla SLA' });
  }
});

// DELETE /whatsapp/sla-rules/:id
whatsappRouter.delete('/whatsapp/sla-rules/:id', requireAuth, requireAdminOrEjecutivo, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === 'default') { res.status(400).json({ error: 'No se puede eliminar la regla global' }); return; }
    await query('DELETE FROM wa_sla_rules WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[WA Route]', e);
    res.status(500).json({ error: 'Error al eliminar regla SLA' });
  }
});

// ─── Dashboard / Stats ────────────────────────────────────────────────

// GET /whatsapp/stats
whatsappRouter.get('/whatsapp/stats', requireAuth, requireAdminOrEjecutivo, async (_req, res) => {
  try {
    const totalGroups = await queryOne<{ c: number }>('SELECT COUNT(*) as c FROM wa_groups WHERE is_monitored = 1');
    const totalMessages = await queryOne<{ c: number }>("SELECT COUNT(*) as c FROM wa_messages WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)");
    const pendingMessages = await queryOne<{ c: number }>("SELECT COUNT(*) as c FROM wa_messages WHERE is_from_client = 1 AND sla_status IN ('warning', 'breached')");
    const avgResponseTime = await queryOne<{ avg_seconds: number }>("SELECT AVG(sla_response_seconds) as avg_seconds FROM wa_messages WHERE sla_status = 'responded' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");

    res.json({
      monitored_groups: totalGroups?.c || 0,
      messages_24h: totalMessages?.c || 0,
      pending_responses: pendingMessages?.c || 0,
      avg_response_seconds: Math.round(avgResponseTime?.avg_seconds || 0),
    });
  } catch (e) {
    console.error('[WA Route]', e);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});
