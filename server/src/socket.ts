import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { query, queryOne, uuid } from './db/mysql.js';
import { canAccessTask } from './utils/taskAccess.js';
import { sendEmail, chatMentionEmail } from './services/email.js';
import { processCommentMentions } from './utils/mentions.js';
import { setSocketIO } from './services/whatsapp.js';

const JWT_SECRET = process.env.JWT_SECRET!;

// Track online users per desk: deskId -> Set<userId>
const deskOnlineUsers = new Map<string, Set<string>>();

function addOnlineUser(deskId: string, userId: string) {
  if (!deskOnlineUsers.has(deskId)) deskOnlineUsers.set(deskId, new Set());
  deskOnlineUsers.get(deskId)!.add(userId);
}

function removeOnlineUser(deskId: string, userId: string) {
  const s = deskOnlineUsers.get(deskId);
  if (s) { s.delete(userId); if (s.size === 0) deskOnlineUsers.delete(deskId); }
}

function getOnlineUsers(deskId: string): string[] {
  return Array.from(deskOnlineUsers.get(deskId) || []);
}

// Track which desks each socket joined
const socketDesks = new Map<string, Set<string>>();

// Global presence: userId -> { sockets, lastActivity }
const AWAY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

interface UserPresence {
  sockets: Set<string>;
  lastActivity: number; // timestamp ms
}

const globalPresence = new Map<string, UserPresence>();

function addGlobalUser(userId: string, socketId: string) {
  if (!globalPresence.has(userId)) {
    globalPresence.set(userId, { sockets: new Set(), lastActivity: Date.now() });
  }
  const p = globalPresence.get(userId)!;
  p.sockets.add(socketId);
  p.lastActivity = Date.now();
}

function removeGlobalUser(userId: string, socketId: string) {
  const p = globalPresence.get(userId);
  if (p) {
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) globalPresence.delete(userId);
  }
}

function touchActivity(userId: string) {
  const p = globalPresence.get(userId);
  if (p) p.lastActivity = Date.now();
}

type PresenceStatus = 'online' | 'away' | 'offline';

function getUserStatus(userId: string): PresenceStatus {
  const p = globalPresence.get(userId);
  if (!p || p.sockets.size === 0) return 'offline';
  return (Date.now() - p.lastActivity > AWAY_THRESHOLD_MS) ? 'away' : 'online';
}

function getAllOnlineUserIds(): string[] {
  return Array.from(globalPresence.keys());
}

export interface UserPresenceInfo {
  userId: string;
  status: PresenceStatus;
}

export function getGlobalPresence(): UserPresenceInfo[] {
  const result: UserPresenceInfo[] = [];
  for (const [userId] of globalPresence) {
    result.push({ userId, status: getUserStatus(userId) });
  }
  return result;
}

export function getGlobalOnlineUserIds(): string[] {
  return getAllOnlineUserIds();
}

async function broadcastPresence(io: Server, userId: string) {
  try {
    const userDesks = await query<{ desk_id: string }[]>(
      'SELECT desk_id FROM desk_members WHERE user_id = ?', [userId]
    );
    const presenceMap = getGlobalPresence();
    for (const { desk_id } of userDesks) {
      const deskMembers = await query<{ user_id: string }[]>(
        'SELECT user_id FROM desk_members WHERE desk_id = ?', [desk_id]
      );
      const memberIds = deskMembers.map(m => m.user_id);
      const presenceList = presenceMap
        .filter(p => memberIds.includes(p.userId))
        .map(p => ({ userId: p.userId, status: p.status }));
      const onlineIds = presenceList.filter(p => p.status !== 'offline').map(p => p.userId);
      io.to(`desk:${desk_id}`).emit('desk:online', { deskId: desk_id, users: onlineIds });
      io.to(`desk:${desk_id}`).emit('desk:presence', { deskId: desk_id, presence: presenceList });
    }
  } catch { /* silent */ }
}

export function setupSocket(httpServer: HttpServer): void {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec',
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) {
      return next(new Error('Token requerido'));
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string; role: string };
      (socket as Socket & { userId?: string }).userId = payload.sub;
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  // Pass Socket.io instance to WhatsApp service for real-time events
  setSocketIO(io);

  io.on('connection', (socket: Socket & { userId?: string }) => {
    const userId = socket.userId;
    if (!userId) return;

    socketDesks.set(socket.id, new Set());
    addGlobalUser(userId, socket.id);

    // Cada usuario se une a su sala personal para recibir notificaciones
    socket.join(`user:${userId}`);

    // Broadcast presence to all desks this user belongs to
    broadcastPresence(io, userId);

    // Activity heartbeat from frontend
    socket.on('user:activity', () => {
      const prev = getUserStatus(userId);
      touchActivity(userId);
      const curr = getUserStatus(userId);
      if (prev !== curr) {
        broadcastPresence(io, userId);
      }
    });

    socket.on('comment:join', (taskId: string) => {
      if (!taskId || typeof taskId !== 'string') return;
      const room = `task:${taskId}`;
      socket.join(room);
    });

    socket.on('comment:leave', (taskId: string) => {
      if (!taskId || typeof taskId !== 'string') return;
      socket.leave(`task:${taskId}`);
    });

    socket.on('comment:new', async (data: { taskId: string; comentario: string; contenido_html?: string; image_url?: string }, cb?: (err?: { message: string }) => void) => {
      try {
        const { taskId, comentario, contenido_html, image_url } = data || {};
        if (!taskId || typeof comentario !== 'string') {
          cb?.({ message: 'taskId y comentario requeridos' });
          return;
        }
        const text = comentario.trim();
        const html = typeof contenido_html === 'string' ? contenido_html.trim() : null;
        const imgUrl = typeof image_url === 'string' && image_url.startsWith('http') ? image_url : null;
        if (!text && !html && !imgUrl) {
          cb?.({ message: 'El comentario no puede estar vacío' });
          return;
        }

        const allowed = await canAccessTask(userId, taskId);
        if (!allowed) {
          cb?.({ message: 'Sin acceso a esta tarea' });
          return;
        }

        const id = uuid();
        await query(
          'INSERT INTO comments (id, task_id, user_id, comentario, contenido_html, image_url) VALUES (?, ?, ?, ?, ?, ?)',
          [id, taskId, userId, text || '', html, imgUrl]
        );

        const row = await queryOne<any>(
          `SELECT c.id, c.task_id, c.user_id, c.comentario, c.contenido_html, c.image_url, c.created_at, p.nombre as user_nombre
           FROM comments c LEFT JOIN profiles p ON p.id = c.user_id WHERE c.id = ?`,
          [id]
        );
        const comment = row ? { ...row, user: row.user_nombre ? { nombre: row.user_nombre } : null, likes_count: 0, liked_by_me: false } : null;

        io.to(`task:${taskId}`).emit('comment:new', comment);

        // Detectar @menciones (notif in-app + email centralizado).
        // Ver: server/src/utils/mentions.ts
        await processCommentMentions({
          taskId,
          authorUserId: userId,
          text,
          emit: (uid, payload) => {
            io.to(`user:${uid}`).emit('notification:new', payload);
          },
        }).catch((e) => console.error('[SOCKET] processCommentMentions error:', e));

        cb?.();
      } catch (e) {
        console.error('[SOCKET] comment:new error:', e);
        cb?.({ message: 'Error al guardar comentario' });
      }
    });

    // ========== Desk Chat ==========
    socket.on('desk:join', async (deskId: string) => {
      if (!deskId || typeof deskId !== 'string') return;
      const member = await queryOne<{ id: string }>(
        'SELECT dm.id FROM desk_members dm WHERE dm.desk_id = ? AND dm.user_id = ?',
        [deskId, userId]
      );
      if (!member) {
        const userRow = await queryOne<{ rol: string }>('SELECT rol FROM profiles WHERE id = ?', [userId]);
        if (!userRow || !['admin', 'ejecutivo'].includes(userRow.rol)) return;
      }
      socket.join(`desk:${deskId}`);
      socketDesks.get(socket.id)?.add(deskId);
      addOnlineUser(deskId, userId);

      // Send detailed presence to the joining client and the room
      const presenceMap = getGlobalPresence();
      const deskMembers = await query<{ user_id: string }[]>(
        'SELECT user_id FROM desk_members WHERE desk_id = ?', [deskId]
      );
      const memberIds = deskMembers.map(m => m.user_id);
      const presenceList = presenceMap
        .filter(p => memberIds.includes(p.userId))
        .map(p => ({ userId: p.userId, status: p.status }));
      const onlineIds = presenceList.filter(p => p.status !== 'offline').map(p => p.userId);
      io.to(`desk:${deskId}`).emit('desk:online', { deskId, users: onlineIds });
      io.to(`desk:${deskId}`).emit('desk:presence', { deskId, presence: presenceList });
    });

    socket.on('desk:leave', (deskId: string) => {
      if (!deskId || typeof deskId !== 'string') return;
      socket.leave(`desk:${deskId}`);
      socketDesks.get(socket.id)?.delete(deskId);
      removeOnlineUser(deskId, userId);
    });

    // Mark messages as read
    socket.on('desk:read', async (data: { deskId: string; messageIds: string[] }) => {
      try {
        const { deskId, messageIds } = data || {};
        if (!deskId || !Array.isArray(messageIds) || messageIds.length === 0) return;
        // Insert read receipts (ignore duplicates)
        for (const msgId of messageIds.slice(0, 100)) {
          await query(
            'INSERT IGNORE INTO desk_message_reads (id, message_id, user_id) VALUES (?, ?, ?)',
            [uuid(), msgId, userId]
          ).catch(() => {});
        }
        // Broadcast read event to the desk room
        io.to(`desk:${deskId}`).emit('desk:read:update', { deskId, userId, messageIds });
      } catch (e) {
        console.error('[SOCKET] desk:read error:', e);
      }
    });

    socket.on('desk:message', async (data: { deskId: string; mensaje: string; image_url?: string }, cb?: (err?: { message: string }) => void) => {
      try {
        const { deskId, mensaje, image_url } = data || {};
        if (!deskId || (typeof mensaje !== 'string' || !mensaje.trim()) && !image_url) {
          cb?.({ message: 'deskId y mensaje o imagen requeridos' });
          return;
        }

        // Verify membership or admin/ejecutivo role
        const member = await queryOne<{ id: string }>(
          'SELECT dm.id FROM desk_members dm WHERE dm.desk_id = ? AND dm.user_id = ?',
          [deskId, userId]
        );
        if (!member) {
          const userRow = await queryOne<{ rol: string }>('SELECT rol FROM profiles WHERE id = ?', [userId]);
          if (!userRow || !['admin', 'ejecutivo'].includes(userRow.rol)) {
            cb?.({ message: 'Sin acceso a esta mesa' });
            return;
          }
        }

        const id = uuid();
        const text = (mensaje || '').trim();
        await query(
          'INSERT INTO desk_messages (id, desk_id, user_id, mensaje, image_url) VALUES (?, ?, ?, ?, ?)',
          [id, deskId, userId, text, image_url || null]
        );

        const row = await queryOne<any>(
          `SELECT dm.id, dm.desk_id, dm.user_id, dm.mensaje, dm.image_url, dm.created_at,
                  p.nombre AS user_nombre, p.avatar_url
           FROM desk_messages dm
           LEFT JOIN profiles p ON p.id = dm.user_id
           WHERE dm.id = ?`,
          [id]
        );

        const msg = row ? {
          id: row.id,
          desk_id: row.desk_id,
          user_id: row.user_id,
          mensaje: row.mensaje,
          image_url: row.image_url || null,
          created_at: row.created_at,
          user: { nombre: row.user_nombre, avatar_url: row.avatar_url },
        } : null;

        if (msg) {
          io.to(`desk:${deskId}`).emit('desk:message:new', msg);
        }

        // Send preview to all desk members not currently in the desk room
        const deskRow = await queryOne<{ nombre: string }>('SELECT nombre FROM desks WHERE id = ?', [deskId]);
        const deskNameStr = deskRow?.nombre || 'Mesa';
        const authorName = row?.user_nombre || 'Alguien';
        const onlineInDesk = getOnlineUsers(deskId);

        const allMembers = await query<{ user_id: string }[]>(
          'SELECT user_id FROM desk_members WHERE desk_id = ?', [deskId]
        );
        const adminOps = await query<{ id: string }[]>(
          "SELECT id FROM profiles WHERE rol IN ('admin','ejecutivo') AND activo = 1 AND id != ?",
          [userId]
        );
        const recipientIds = new Set(allMembers.map(m => m.user_id));
        for (const a of adminOps) recipientIds.add(a.id);
        recipientIds.delete(userId);

        const previewPayload = {
          deskId,
          deskName: deskNameStr,
          messageId: id,
          sender: authorName,
          senderAvatar: row?.avatar_url || null,
          text: text.length > 120 ? text.slice(0, 120) + '...' : text,
          created_at: row?.created_at || new Date().toISOString(),
        };

        for (const recipientId of recipientIds) {
          if (onlineInDesk.includes(recipientId)) continue;
          io.to(`user:${recipientId}`).emit('desk:chat:preview', previewPayload);
        }

        // Detect @mentions and notify
        const mentionRegex = /@([A-Za-zÀ-ÿ0-9 ._-]+)/g;
        let mentionMatch;
        const notifiedIds = new Set<string>();
        while ((mentionMatch = mentionRegex.exec(text)) !== null) {
          const mentionedName = mentionMatch[1].trim();
          if (!mentionedName) continue;
          const mentioned = await queryOne<{ id: string; nombre: string }>(
            `SELECT p.id, p.nombre FROM profiles p
             INNER JOIN desk_members dm ON dm.user_id = p.id AND dm.desk_id = ?
             WHERE LOWER(p.nombre) LIKE LOWER(?) AND p.activo = 1 LIMIT 1`,
            [deskId, `%${mentionedName}%`]
          );
          if (mentioned && mentioned.id !== userId && !notifiedIds.has(mentioned.id)) {
            notifiedIds.add(mentioned.id);
            const nId = uuid();
            await query(
              'INSERT INTO notifications (id, user_id, mensaje) VALUES (?, ?, ?)',
              [nId, mentioned.id, `${authorName} te mencionó en el chat de ${deskNameStr}`]
            );
            io.to(`user:${mentioned.id}`).emit('notification:new', {
              id: nId,
              mensaje: `${authorName} te mencionó en el chat de ${deskNameStr}`,
              leida: 0,
              created_at: new Date().toISOString(),
            });

            // Email de mención en chat (fire-and-forget)
            const mentionedProfile = await queryOne<{ email: string; nombre: string }>(
              'SELECT email, nombre FROM profiles WHERE id = ?', [mentioned.id]
            );
            if (mentionedProfile?.email && (process.env.MAILGUN_API_KEY || process.env.SMTP_PASS)) {
              const frontendUrl = process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec';
              try {
                const emailData = await chatMentionEmail({
                  recipientName: mentionedProfile.nombre,
                  authorName,
                  deskName: deskNameStr,
                  messageText: text,
                  frontendUrl,
                  deskId: deskId,
                });
                emailData.to = mentionedProfile.email;
                sendEmail(emailData).catch((e) => console.error('[SOCKET][chat-mention] email failed:', e));
              } catch (e) {
                console.error('[SOCKET][chat-mention] render failed:', e);
              }
            }
          }
        }

        cb?.();
      } catch (e) {
        console.error('[SOCKET] desk:message error:', e);
        cb?.({ message: 'Error al enviar mensaje' });
      }
    });

    // ========== Desk Message Reactions ==========
    socket.on('desk:reaction:toggle', async (data: { deskId: string; messageId: string; emoji: string }, cb?: (err?: { message: string }) => void) => {
      try {
        const { deskId, messageId, emoji } = data || {};
        if (!deskId || !messageId || !emoji) {
          cb?.({ message: 'deskId, messageId y emoji requeridos' });
          return;
        }

        const member = await queryOne<{ id: string }>(
          'SELECT dm.id FROM desk_members dm WHERE dm.desk_id = ? AND dm.user_id = ?',
          [deskId, userId]
        );
        if (!member) {
          const userRow = await queryOne<{ rol: string }>('SELECT rol FROM profiles WHERE id = ?', [userId]);
          if (!userRow || !['admin', 'ejecutivo'].includes(userRow.rol)) {
            cb?.({ message: 'Sin acceso a esta mesa' });
            return;
          }
        }

        const existing = await queryOne<{ id: string }>(
          'SELECT id FROM desk_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
          [messageId, userId, emoji]
        );

        if (existing) {
          await query('DELETE FROM desk_message_reactions WHERE id = ?', [existing.id]);
        } else {
          await query(
            'INSERT INTO desk_message_reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)',
            [uuid(), messageId, userId, emoji]
          );
        }

        const allReactions = await query<any[]>(
          `SELECT r.emoji, r.user_id, p.nombre
           FROM desk_message_reactions r
           LEFT JOIN profiles p ON p.id = r.user_id
           WHERE r.message_id = ? ORDER BY r.created_at`,
          [messageId]
        );

        const reactions = allReactions.map((r: any) => ({ emoji: r.emoji, user_id: r.user_id, nombre: r.nombre }));
        io.to(`desk:${deskId}`).emit('desk:reaction:update', { deskId, messageId, reactions });
        cb?.();
      } catch (e) {
        console.error('[SOCKET] desk:reaction:toggle error:', e);
        cb?.({ message: 'Error al reaccionar' });
      }
    });

    socket.on('disconnect', () => {
      const desks = socketDesks.get(socket.id);
      if (desks) {
        for (const deskId of desks) {
          removeOnlineUser(deskId, userId);
        }
        socketDesks.delete(socket.id);
      }
      removeGlobalUser(userId, socket.id);
      broadcastPresence(io, userId);
    });
  });
}
