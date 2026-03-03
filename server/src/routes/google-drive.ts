import { Router } from 'express';
import { google } from 'googleapis';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { getAuthedClient, handleExpiredToken, hasDriveScope, getUserTokenScopes } from '../utils/googleAuth.js';

export const googleDriveRouter = Router();

// ========== Drive Status ==========
googleDriveRouter.get('/google-drive/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const scopes = await getUserTokenScopes(req.userId!);
    res.json({
      connected: !!scopes,
      hasDriveScope: hasDriveScope(scopes),
    });
  } catch (e) {
    console.error('[GDRIVE] status error:', e);
    res.status(500).json({ error: 'Error' });
  }
});

// ========== List Files ==========
googleDriveRouter.get('/google-drive/files', requireAuth, async (req: AuthRequest, res) => {
  try {
    const client = await getAuthedClient(req.userId!);
    if (!client) { res.status(401).json({ error: 'Google no conectado' }); return; }

    const folderId = (req.query.folderId as string) || 'root';
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 30, 100);
    const pageToken = req.query.pageToken as string | undefined;

    const drive = google.drive({ version: 'v3', auth: client });

    // Special folder IDs
    const isShared = folderId === 'shared';
    const isRecent = folderId === 'recent';

    let listQuery = `'${folderId}' in parents and trashed = false`;
    let listOrderBy = 'folder,name';
    if (isShared) {
      listQuery = 'sharedWithMe = true and trashed = false';
      listOrderBy = 'modifiedTime desc';
    } else if (isRecent) {
      listQuery = 'trashed = false and modifiedTime > \'' + new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() + '\'';
      listOrderBy = 'modifiedTime desc';
    }

    const resp = await drive.files.list({
      q: listQuery,
      fields: 'nextPageToken, files(id, name, mimeType, iconLink, webViewLink, webContentLink, thumbnailLink, size, modifiedTime, parents)',
      pageSize,
      pageToken: pageToken || undefined,
      orderBy: listOrderBy,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    // Get folder path for breadcrumb
    let folderName = 'Mi Drive';
    if (isShared) {
      folderName = 'Compartidos conmigo';
    } else if (isRecent) {
      folderName = 'Recientes';
    } else if (folderId !== 'root') {
      try {
        const folderMeta = await drive.files.get({ fileId: folderId, fields: 'name', supportsAllDrives: true });
        folderName = folderMeta.data.name || folderId;
      } catch { /* keep default */ }
    }

    const files = (resp.data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      iconLink: f.iconLink,
      webViewLink: f.webViewLink,
      webContentLink: f.webContentLink,
      thumbnailLink: f.thumbnailLink,
      size: f.size ? parseInt(f.size) : null,
      modifiedTime: f.modifiedTime,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
    }));

    res.json({ files, nextPageToken: resp.data.nextPageToken || null, folderName });
  } catch (e) {
    console.error('[GDRIVE] list error:', (e as Error).message);
    if (await handleExpiredToken(e, req.userId!, res)) return;
    res.status(500).json({ error: 'Error al listar archivos' });
  }
});

// ========== Search Files ==========
googleDriveRouter.get('/google-drive/files/search', requireAuth, async (req: AuthRequest, res) => {
  try {
    const client = await getAuthedClient(req.userId!);
    if (!client) { res.status(401).json({ error: 'Google no conectado' }); return; }

    const q = (req.query.q as string || '').trim();
    if (!q) { res.json({ files: [] }); return; }

    const escaped = q.replace(/'/g, "\\'");
    const drive = google.drive({ version: 'v3', auth: client });
    const resp = await drive.files.list({
      q: `name contains '${escaped}' and trashed = false`,
      fields: 'files(id, name, mimeType, iconLink, webViewLink, webContentLink, thumbnailLink, size, modifiedTime)',
      pageSize: 30,
      orderBy: 'modifiedTime desc',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    const files = (resp.data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      iconLink: f.iconLink,
      webViewLink: f.webViewLink,
      webContentLink: f.webContentLink,
      thumbnailLink: f.thumbnailLink,
      size: f.size ? parseInt(f.size) : null,
      modifiedTime: f.modifiedTime,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
    }));

    res.json({ files });
  } catch (e) {
    console.error('[GDRIVE] search error:', (e as Error).message);
    if (await handleExpiredToken(e, req.userId!, res)) return;
    res.status(500).json({ error: 'Error al buscar archivos' });
  }
});

// ========== Attach Drive file to task ==========
const attachSchema = z.object({
  task_id: z.string().min(1),
  drive_file_id: z.string().min(1),
  name: z.string().min(1),
  mime_type: z.string().optional(),
  icon_url: z.string().optional(),
  web_view_link: z.string().optional(),
  thumbnail_url: z.string().optional(),
  size_bytes: z.number().optional(),
});

googleDriveRouter.post('/google-drive/task-files', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = attachSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
      return;
    }
    const d = parsed.data;
    const id = uuid();
    await query(
      `INSERT INTO task_drive_files (id, task_id, drive_file_id, name, mime_type, icon_url, web_view_link, thumbnail_url, size_bytes, attached_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), mime_type=VALUES(mime_type), icon_url=VALUES(icon_url),
         web_view_link=VALUES(web_view_link), thumbnail_url=VALUES(thumbnail_url), size_bytes=VALUES(size_bytes)`,
      [id, d.task_id, d.drive_file_id, d.name, d.mime_type || null, d.icon_url || null, d.web_view_link || null, d.thumbnail_url || null, d.size_bytes || null, req.userId!]
    );
    res.json({ id, ...d, attached_by: req.userId });
  } catch (e) {
    console.error('[GDRIVE] attach error:', e);
    res.status(500).json({ error: 'Error al adjuntar archivo' });
  }
});

// ========== Get Drive files for task ==========
googleDriveRouter.get('/google-drive/task-files/:taskId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await query<any[]>(
      `SELECT tdf.*, p.nombre as attached_by_name
       FROM task_drive_files tdf
       LEFT JOIN profiles p ON p.id = tdf.attached_by
       WHERE tdf.task_id = ?
       ORDER BY tdf.created_at DESC`,
      [req.params.taskId]
    );
    res.json(rows);
  } catch (e) {
    console.error('[GDRIVE] task-files error:', e);
    res.status(500).json({ error: 'Error al obtener archivos' });
  }
});

// ========== Detach Drive file from task ==========
googleDriveRouter.delete('/google-drive/task-files/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    await query('DELETE FROM task_drive_files WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('[GDRIVE] detach error:', e);
    res.status(500).json({ error: 'Error al desadjuntar archivo' });
  }
});
