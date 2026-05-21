/**
 * WhatsApp Service – Baileys connection manager
 * Manages a single WhatsApp Web session via @whiskeysockets/baileys.
 * Emits QR codes via Socket.io for scanning, stores messages in MySQL,
 * and monitors SLA compliance for client messages.
 */

import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  getContentType,
  WAProto,
  Browsers,
} from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';
import { query, queryOne, uuid } from '../db/mysql.js';
import { Server as SocketIOServer } from 'socket.io';
import * as QRCode from 'qrcode';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

// ─── State ────────────────────────────────────────────────────────────
let sock: WASocket | null = null;
let io: SocketIOServer | null = null;
let currentQR: string | null = null;
let connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'qr_pending' = 'disconnected';
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

const AUTH_DIR = path.join(process.cwd(), 'wa-auth');

// ─── Public API ───────────────────────────────────────────────────────

export function setSocketIO(socketIO: SocketIOServer) {
  io = socketIO;
}

export function getStatus() {
  return { status: connectionStatus, qr: currentQR };
}

export async function startConnection(isReconnect = false): Promise<{ status: string; qr?: string }> {
  if (sock && connectionStatus === 'connected') {
    return { status: 'already_connected' };
  }

  // Only reset counter on manual connect, not auto-reconnect
  if (!isReconnect) {
    reconnectAttempts = 0;
  }
  connectionStatus = 'connecting';
  await updateDBStatus('connecting');
  emitStatus();

  try {
    // Ensure auth directory exists
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    // Build proxy agent if configured
    const proxyUrl = process.env.WA_PROXY_URL; // e.g. socks5://user:pass@host:port or http://user:pass@host:port
    let agent: unknown = undefined;
    if (proxyUrl) {
      if (proxyUrl.startsWith('socks')) {
        agent = new SocksProxyAgent(proxyUrl);
      } else {
        agent = new HttpsProxyAgent(proxyUrl);
      }
      console.log('[WA] Using proxy:', proxyUrl.replace(/:[^:@]+@/, ':***@'));
    }

    const socketOptions: Record<string, unknown> = {
      auth: state,
      printQRInTerminal: true, // Also print in terminal for debugging
      browser: Browsers.ubuntu('Chrome'),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: undefined,
      keepAliveIntervalMs: 30000,
      markOnlineOnConnect: false,
    };

    // Add proxy agent if available
    if (agent) {
      socketOptions.agent = agent;
      socketOptions.fetchAgent = agent;
    }

    sock = makeWASocket(socketOptions as Parameters<typeof makeWASocket>[0]);

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    // Connection updates (QR, open, close)
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Generate QR as data URL for the frontend
        currentQR = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
        connectionStatus = 'qr_pending';
        await updateDBStatus('qr_pending');
        emitStatus();
        console.log('[WA] QR code generated, waiting for scan…');
      }

      if (connection === 'open') {
        currentQR = null;
        connectionStatus = 'connected';
        reconnectAttempts = 0; // Reset on successful connection
        await updateDBStatus('connected');
        emitStatus();
        console.log('[WA] Connected successfully!');

        // Sync groups after connection
        setTimeout(() => syncGroups().catch(console.error), 3000);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        console.log(`[WA] Connection closed. Code: ${statusCode}. Attempt: ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

        sock = null;

        // Don't reconnect if: logged out, too many attempts, or certain error codes
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut
          && statusCode !== 403
          && reconnectAttempts < MAX_RECONNECT_ATTEMPTS;

        if (shouldReconnect && connectionStatus === 'qr_pending') {
          // If we were waiting for QR scan and connection dropped, just wait — don't clear QR
          // This is normal: Baileys reconnects while waiting for scan
          reconnectAttempts++;
          connectionStatus = 'qr_pending';
          await updateDBStatus('qr_pending');
          emitStatus();
          if (reconnectTimer) clearTimeout(reconnectTimer);
          const delay = Math.min(3000 * reconnectAttempts, 15000);
          reconnectTimer = setTimeout(() => startConnection(true), delay);
        } else if (shouldReconnect && connectionStatus !== 'qr_pending') {
          reconnectAttempts++;
          connectionStatus = 'connecting';
          await updateDBStatus('connecting');
          emitStatus();
          if (reconnectTimer) clearTimeout(reconnectTimer);
          const delay = Math.min(3000 * reconnectAttempts, 15000);
          reconnectTimer = setTimeout(() => startConnection(true), delay);
        } else {
          connectionStatus = 'disconnected';
          currentQR = null;
          reconnectAttempts = 0;
          await updateDBStatus('disconnected');
          emitStatus();
          // Clear auth to require new QR scan
          if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          }
          if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.log('[WA] Max reconnect attempts reached. Stopped. Press connect again.');
          }
        }
      }
    });

    // Listen for incoming messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        await handleIncomingMessage(msg);
      }
    });

    return { status: 'connecting' };
  } catch (err) {
    console.error('[WA] Error starting connection:', err);
    connectionStatus = 'disconnected';
    await updateDBStatus('disconnected');
    emitStatus();
    throw err;
  }
}

export async function disconnect(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sock) {
    await sock.logout().catch(() => {});
    sock = null;
  }
  currentQR = null;
  connectionStatus = 'disconnected';
  await updateDBStatus('disconnected');
  emitStatus();

  // Clear auth so next connect shows QR
  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  }
}

export async function syncGroups(): Promise<unknown[]> {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp no está conectado');
  }

  const groups = await sock.groupFetchAllParticipating();
  const result: unknown[] = [];

  for (const [jid, meta] of Object.entries(groups)) {
    const groupId = jid;
    const groupName = meta.subject || 'Sin nombre';

    // Upsert group
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM wa_groups WHERE wa_group_id = ?',
      [groupId]
    );

    if (!existing) {
      await query(
        'INSERT INTO wa_groups (id, wa_group_id, name) VALUES (?, ?, ?)',
        [uuid(), groupId, groupName]
      );
    } else {
      await query('UPDATE wa_groups SET name = ? WHERE wa_group_id = ?', [groupName, groupId]);
    }

    // Sync participants
    for (const p of meta.participants) {
      const phone = p.id.replace('@s.whatsapp.net', '').replace('@lid', '');
      const existingMember = await queryOne(
        'SELECT id FROM wa_group_members WHERE wa_group_id = ? AND phone_number = ?',
        [groupId, phone]
      );

      if (!existingMember) {
        // Try to match with existing TIUSDEI user by phone
        const matchedUser = await queryOne<{ id: string }>(
          "SELECT id FROM profiles WHERE REPLACE(REPLACE(telefono, '+', ''), ' ', '') LIKE CONCAT('%', ?) OR telefono LIKE CONCAT('%', ?)",
          [phone.slice(-10), phone.slice(-10)]
        );

        const role = matchedUser ? 'ejecutivo' : 'cliente';

        await query(
          'INSERT INTO wa_group_members (id, wa_group_id, phone_number, role, user_id) VALUES (?, ?, ?, ?, ?)',
          [uuid(), groupId, phone, role, matchedUser?.id || null]
        );
      }
    }

    result.push({ groupId, name: groupName, participants: meta.participants.length });
  }

  return result;
}

// ─── Internal helpers ─────────────────────────────────────────────────

function emitStatus() {
  if (io) {
    io.emit('wa:status', { status: connectionStatus, qr: currentQR });
  }
}

async function updateDBStatus(status: string) {
  try {
    const existing = await queryOne<{ id: string }>('SELECT id FROM wa_config LIMIT 1');
    if (existing) {
      await query('UPDATE wa_config SET status = ?, is_connected = ? WHERE id = ?', [
        status,
        status === 'connected' ? 1 : 0,
        existing.id,
      ]);
    } else {
      await query('INSERT INTO wa_config (id, status, is_connected) VALUES (?, ?, ?)', [
        uuid(),
        status,
        status === 'connected' ? 1 : 0,
      ]);
    }
  } catch (e) {
    console.error('[WA] Error updating DB status:', e);
  }
}

async function handleIncomingMessage(msg: WAProto.IWebMessageInfo) {
  try {
    if (!msg.key) return;
    const jid = msg.key.remoteJid;
    if (!jid || !jid.endsWith('@g.us')) return; // Only process group messages

    const senderJid = msg.key.participant || msg.key.remoteJid || '';
    const senderPhone = senderJid.replace('@s.whatsapp.net', '').replace('@lid', '');

    // Get message text
    const contentType = getContentType(msg.message!);
    let messageText = '';
    let messageType: string = 'text';

    if (contentType === 'conversation') {
      messageText = msg.message?.conversation || '';
    } else if (contentType === 'extendedTextMessage') {
      messageText = msg.message?.extendedTextMessage?.text || '';
    } else if (contentType === 'imageMessage') {
      messageText = msg.message?.imageMessage?.caption || '[Imagen]';
      messageType = 'image';
    } else if (contentType === 'videoMessage') {
      messageText = msg.message?.videoMessage?.caption || '[Video]';
      messageType = 'video';
    } else if (contentType === 'audioMessage') {
      messageText = '[Audio]';
      messageType = 'audio';
    } else if (contentType === 'documentMessage') {
      messageText = msg.message?.documentMessage?.fileName || '[Documento]';
      messageType = 'document';
    } else if (contentType === 'stickerMessage') {
      messageText = '[Sticker]';
      messageType = 'sticker';
    } else {
      messageText = `[${contentType || 'Desconocido'}]`;
      messageType = 'other';
    }

    // Check if sender is client or team member
    const member = await queryOne<{ role: string }>(
      'SELECT role FROM wa_group_members WHERE wa_group_id = ? AND phone_number = ?',
      [jid, senderPhone]
    );

    const isFromClient = !member || member.role === 'cliente';

    // Check if group is monitored
    const group = await queryOne<{ is_monitored: number }>(
      'SELECT is_monitored FROM wa_groups WHERE wa_group_id = ?',
      [jid]
    );

    // Save message
    const msgId = uuid();
    await query(
      `INSERT INTO wa_messages (id, wa_group_id, wa_message_id, sender_phone, sender_name, message_text, message_type, is_from_client, sla_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        msgId,
        jid,
        msg.key?.id || null,
        senderPhone,
        msg.pushName || null,
        messageText,
        messageType,
        isFromClient ? 1 : 0,
        isFromClient && group?.is_monitored ? 'warning' : 'na',
      ]
    );

    // If team member responds, check for pending client messages and mark them
    if (!isFromClient && group?.is_monitored) {
      await markClientMessagesResponded(jid, senderPhone);
    }

    // Emit to frontend in real-time
    if (io) {
      io.emit('wa:message', {
        id: msgId,
        wa_group_id: jid,
        sender_phone: senderPhone,
        sender_name: msg.pushName || senderPhone,
        message_text: messageText,
        message_type: messageType,
        is_from_client: isFromClient,
        sla_status: isFromClient && group?.is_monitored ? 'warning' : 'na',
        created_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error('[WA] Error handling message:', e);
  }
}

async function markClientMessagesResponded(groupJid: string, responderPhone: string) {
  try {
    // Find unresponded client messages in this group
    const pending = await query<Array<{ id: string; created_at: string }>>(
      "SELECT id, created_at FROM wa_messages WHERE wa_group_id = ? AND is_from_client = 1 AND sla_status IN ('warning', 'breached') ORDER BY created_at DESC",
      [groupJid]
    );

    if (!Array.isArray(pending) || pending.length === 0) return;

    const now = new Date();
    for (const msg of pending) {
      const created = new Date(msg.created_at);
      const diffSeconds = Math.floor((now.getTime() - created.getTime()) / 1000);

      await query(
        "UPDATE wa_messages SET sla_status = 'responded', sla_responded_at = NOW(), sla_response_seconds = ? WHERE id = ?",
        [diffSeconds, msg.id]
      );
    }
  } catch (e) {
    console.error('[WA] Error marking messages responded:', e);
  }
}
