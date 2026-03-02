import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';

export const filesRouter = Router();

// --- File upload setup ---
const TASK_UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'tasks');
if (!fs.existsSync(TASK_UPLOADS_DIR)) fs.mkdirSync(TASK_UPLOADS_DIR, { recursive: true });

const taskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TASK_UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuid()}${ext}`);
  },
});

const taskUpload = multer({
  storage: taskStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|svg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|rar|7z|mp4|mp3|ai|psd|fig|sketch)$/i;
    cb(null, allowed.test(path.extname(file.originalname)));
  },
});

filesRouter.get('/files', requireAuth, async (req: AuthRequest, res) => {
  try {
    const taskId = req.query.task_id as string | undefined;
    let rows: any[];
    if (taskId) {
      rows = await query<any[]>(`SELECT f.*, t.titulo_tarea FROM files f LEFT JOIN tasks t ON t.id = f.task_id WHERE f.task_id = ? ORDER BY f.created_at DESC`, [taskId]);
    } else {
      rows = await query<any[]>(`SELECT f.*, t.titulo_tarea FROM files f LEFT JOIN tasks t ON t.id = f.task_id ORDER BY f.created_at DESC`);
    }
    res.json(rows.map((r) => ({ ...r, tasks: { titulo_tarea: r.titulo_tarea } })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar archivos' });
  }
});

filesRouter.post('/files', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { task_id, deliverable_id, nombre_archivo, url_storage } = req.body;
    const id = uuid();
    await query('INSERT INTO files (id, task_id, deliverable_id, nombre_archivo, url_storage, subido_por) VALUES (?, ?, ?, ?, ?, ?)', [id, task_id || null, deliverable_id || null, nombre_archivo, url_storage || '', req.userId]);
    const row = await queryOne<any>('SELECT * FROM files WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear archivo' });
  }
});

// POST /files/upload — subir archivo real al servidor
filesRouter.post('/files/upload', requireAuth, taskUpload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se envió archivo' });
    }
    const { task_id, deliverable_id } = req.body;
    const base = req.protocol + '://' + (req.get('host') || `localhost:${process.env.PORT || 3003}`);
    const fileUrl = `${base.replace(/\/$/, '')}/uploads/tasks/${req.file.filename}`;
    const nombre = req.body.nombre_archivo || req.file.originalname;
    const id = uuid();
    await query(
      'INSERT INTO files (id, task_id, deliverable_id, nombre_archivo, url_storage, subido_por) VALUES (?, ?, ?, ?, ?, ?)',
      [id, task_id || null, deliverable_id || null, nombre, fileUrl, req.userId]
    );
    const row = await queryOne<any>('SELECT * FROM files WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (e) {
    console.error('[FILES] Error upload:', e);
    res.status(500).json({ error: 'Error al subir archivo' });
  }
});

// PATCH /files/assign — asociar archivos huérfanos a una tarea recién creada
filesRouter.patch('/files/assign', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { file_ids, task_id } = req.body;
    if (!Array.isArray(file_ids) || !task_id) {
      return res.status(400).json({ error: 'file_ids y task_id son requeridos' });
    }
    for (const fid of file_ids) {
      await query('UPDATE files SET task_id = ? WHERE id = ? AND subido_por = ?', [task_id, fid, req.userId]);
    }
    res.json({ success: true, assigned: file_ids.length });
  } catch (e) {
    console.error('[FILES] Error assign:', e);
    res.status(500).json({ error: 'Error al asociar archivos' });
  }
});

filesRouter.delete('/files/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    await query('DELETE FROM files WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});
