import { Router } from 'express';
import { google } from 'googleapis';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireAdminOrEjecutivo } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { getAuthedClient, handleExpiredToken } from '../utils/googleAuth.js';

export const googleChatRouter = Router();

// GET /google-chat/spaces — list Google Chat Spaces the user has access to
googleChatRouter.get('/google-chat/spaces', requireAuth, requireAdminOrEjecutivo, async (req: AuthRequest, res) => {
  try {
    const client = await getAuthedClient(req.userId!);
    if (!client) { res.status(401).json({ error: 'Google no conectado' }); return; }

    const chat = google.chat({ version: 'v1', auth: client });
    const spaces: any[] = [];
    let pageToken: string | undefined;

    do {
      const resp = await chat.spaces.list({
        pageSize: 100,
        pageToken,
        filter: 'spaceType = "SPACE"',
      });
      if (resp.data.spaces) {
        spaces.push(...resp.data.spaces);
      }
      pageToken = resp.data.nextPageToken || undefined;
    } while (pageToken);

    const result = spaces.map(s => ({
      id: s.name, // e.g. "spaces/AAAA..."
      displayName: s.displayName || s.name,
      type: s.spaceType,
    }));

    res.json({ spaces: result });
  } catch (e: any) {
    if (await handleExpiredToken(e, req.userId!, res)) return;
    console.error('[GCHAT] spaces error:', e?.message || e);
    res.status(500).json({ error: 'Error al obtener espacios' });
  }
});

// GET /google-chat/spaces/:spaceId/messages — preview messages from a Space
googleChatRouter.get('/google-chat/spaces/:spaceId/messages', requireAuth, requireAdminOrEjecutivo, async (req: AuthRequest, res) => {
  try {
    const client = await getAuthedClient(req.userId!);
    if (!client) { res.status(401).json({ error: 'Google no conectado' }); return; }

    const chat = google.chat({ version: 'v1', auth: client });
    const spaceName = `spaces/${req.params.spaceId}`;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);

    const resp = await chat.spaces.messages.list({
      parent: spaceName,
      pageSize: limit,
      orderBy: 'createTime desc',
    });

    const messages = (resp.data.messages || []).map(m => ({
      id: m.name,
      text: m.text || '',
      sender: m.sender?.displayName || m.sender?.name || 'Desconocido',
      senderEmail: m.sender?.type === 'HUMAN' ? m.sender?.name : null,
      createTime: m.createTime,
      hasAttachment: !!(m.attachment && m.attachment.length > 0),
    }));

    res.json({ messages, count: messages.length });
  } catch (e: any) {
    if (await handleExpiredToken(e, req.userId!, res)) return;
    console.error('[GCHAT] messages error:', e?.message || e);
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});

// Track import progress in memory
const importProgress = new Map<string, { status: 'fetching' | 'importing' | 'done' | 'error'; imported: number; skipped: number; total: number; error?: string }>();

// POST /google-chat/import — start importing messages (responds immediately, works in background)
googleChatRouter.post('/google-chat/import', requireAuth, requireAdminOrEjecutivo, async (req: AuthRequest, res) => {
  try {
    const client = await getAuthedClient(req.userId!);
    if (!client) { res.status(401).json({ error: 'Google no conectado' }); return; }

    const { spaceId, deskId } = req.body;
    if (!spaceId || !deskId) {
      res.status(400).json({ error: 'spaceId y deskId requeridos' });
      return;
    }

    const desk = await queryOne<{ id: string }>('SELECT id FROM desks WHERE id = ?', [deskId]);
    if (!desk) { res.status(404).json({ error: 'Mesa no encontrada' }); return; }

    const spaceName = spaceId.startsWith('spaces/') ? spaceId : `spaces/${spaceId}`;
    const progressKey = `${spaceId}:${deskId}`;

    // Check if already importing
    const existing = importProgress.get(progressKey);
    if (existing && (existing.status === 'fetching' || existing.status === 'importing')) {
      res.json({ success: true, status: existing.status, imported: existing.imported, skipped: existing.skipped, total: existing.total });
      return;
    }

    // Respond immediately
    importProgress.set(progressKey, { status: 'fetching', imported: 0, skipped: 0, total: 0 });
    res.json({ success: true, status: 'started', imported: 0, skipped: 0, total: 0 });

    // Run import in background
    const userId = req.userId!;
    (async () => {
      try {
        const chat = google.chat({ version: 'v1', auth: client });

        const localUsers = await query<{ id: string; nombre: string; email: string; google_id: string | null }[]>(
          'SELECT id, nombre, email, google_id FROM users WHERE activo = 1'
        );

        // Build map from google_id to local user (sender.name = "users/{google_id}")
        const googleIdToLocal = new Map<string, string>();
        for (const lu of localUsers) {
          if (lu.google_id) {
            googleIdToLocal.set(lu.google_id, lu.id);
          }
        }

        // Fetch all messages (paginated)
        let allMessages: any[] = [];
        let pageToken: string | undefined;
        let pages = 0;
        const maxPages = 100;

        do {
          const resp = await chat.spaces.messages.list({
            parent: spaceName, pageSize: 100, pageToken, orderBy: 'createTime asc',
          });
          if (resp.data.messages) allMessages.push(...resp.data.messages);
          pageToken = resp.data.nextPageToken || undefined;
          pages++;
          importProgress.set(progressKey, { status: 'fetching', imported: 0, skipped: 0, total: allMessages.length });
        } while (pageToken && pages < maxPages);

        console.log(`[GCHAT] Fetched ${allMessages.length} messages from ${spaceName} (${pages} pages)`);

        // Get existing messages for dedup
        const existingMsgs = await query<{ mensaje: string; created_at: string }[]>(
          'SELECT mensaje, created_at FROM desk_messages WHERE desk_id = ? ORDER BY created_at', [deskId]
        );
        const existingSet = new Set(existingMsgs.map(m => `${m.created_at}|${m.mensaje?.slice(0, 100)}`));

        importProgress.set(progressKey, { status: 'importing', imported: 0, skipped: 0, total: allMessages.length });

        let imported = 0;
        let skipped = 0;
        const fallbackUserId = userId;

        // Batch insert for performance
        const BATCH_SIZE = 50;
        let batch: any[][] = [];

        for (const msg of allMessages) {
          if (!msg.text?.trim()) { skipped++; continue; }

          const senderName = msg.sender?.displayName || '';
          const senderGoogleName = msg.sender?.name || ''; // "users/12345678"
          const senderGoogleId = senderGoogleName.replace('users/', '');
          const createdAt = msg.createTime ? new Date(msg.createTime) : new Date();

          // Match by google_id directly
          let localUserId = senderGoogleId ? googleIdToLocal.get(senderGoogleId) : undefined;

          // Fallback: match by display name vs user nombre
          if (!localUserId && senderName) {
            const byName = localUsers.find(u => {
              const normalized = senderName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              const localNombre = u.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              return normalized === localNombre || normalized.includes(localNombre) || localNombre.includes(normalized);
            });
            if (byName) {
              localUserId = byName.id;
              googleIdToLocal.set(senderGoogleId, byName.id);
            }
          }

          const msgUserId = localUserId || fallbackUserId;
          const text = msg.text.trim();
          const key = `${createdAt.toISOString().replace('T', ' ').replace('Z', '')}|${text.slice(0, 100)}`;
          if (existingSet.has(key)) { skipped++; continue; }

          // Show sender name for bots or unmapped users
          const isBotOrUnmapped = !localUserId || msg.sender?.type === 'BOT';
          const displayName = senderName || 'Bot';
          const messageText = isBotOrUnmapped && senderName ? `[${displayName}] ${text}` : text;
          batch.push([uuid(), deskId, msgUserId, messageText, createdAt]);

          if (batch.length >= BATCH_SIZE) {
            const placeholders = batch.map(() => '(?, ?, ?, ?, ?)').join(', ');
            await query(`INSERT INTO desk_messages (id, desk_id, user_id, mensaje, created_at) VALUES ${placeholders}`, batch.flat());
            imported += batch.length;
            batch = [];
            importProgress.set(progressKey, { status: 'importing', imported, skipped, total: allMessages.length });
          }
        }

        // Insert remaining batch
        if (batch.length > 0) {
          const placeholders = batch.map(() => '(?, ?, ?, ?, ?)').join(', ');
          await query(`INSERT INTO desk_messages (id, desk_id, user_id, mensaje, created_at) VALUES ${placeholders}`, batch.flat());
          imported += batch.length;
        }

        importProgress.set(progressKey, { status: 'done', imported, skipped, total: allMessages.length });
        console.log(`[GCHAT] Imported ${imported} messages from ${spaceName} to desk ${deskId} (${skipped} skipped)`);

        // Clean up progress after 10 minutes
        setTimeout(() => importProgress.delete(progressKey), 10 * 60 * 1000);
      } catch (e: any) {
        console.error('[GCHAT] import error:', e?.message || e);
        importProgress.set(progressKey, { status: 'error', imported: 0, skipped: 0, total: 0, error: e?.message || 'Error al importar' });
        setTimeout(() => importProgress.delete(progressKey), 5 * 60 * 1000);
      }
    })();
  } catch (e: any) {
    if (await handleExpiredToken(e, req.userId!, res)) return;
    console.error('[GCHAT] import error:', e?.message || e);
    res.status(500).json({ error: 'Error al importar mensajes' });
  }
});

// GET /google-chat/import/status — check import progress
googleChatRouter.get('/google-chat/import/status', requireAuth, requireAdminOrEjecutivo, async (req: AuthRequest, res) => {
  const { spaceId, deskId } = req.query;
  if (!spaceId || !deskId) { res.json({ status: 'unknown' }); return; }
  const key = `${spaceId}:${deskId}`;
  const progress = importProgress.get(key);
  if (!progress) { res.json({ status: 'unknown' }); return; }
  res.json(progress);
});

// GET /google-chat/desks — list available desks for mapping
googleChatRouter.get('/google-chat/desks', requireAuth, requireAdminOrEjecutivo, async (req: AuthRequest, res) => {
  try {
    const desks = await query<{ id: string; nombre: string }[]>(
      'SELECT id, nombre FROM desks ORDER BY nombre'
    );
    res.json({ desks });
  } catch (e) {
    console.error('[GCHAT] desks error:', e);
    res.status(500).json({ error: 'Error' });
  }
});
