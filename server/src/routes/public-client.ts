import { Router } from 'express';
import { query, queryOne, uuid } from '../db/mysql.js';
import rateLimit from 'express-rate-limit';
import multerPC from 'multer';
import pathPC from 'path';
import fsPC from 'fs';

/**
 * Módulo de clientes — lado PÚBLICO (cliente sin login).
 * Acceso por token de enlace persistente. Devuelve SOLO datos pensados para el
 * cliente: NUNCA fecha_entrega interna, responsables, ni datos operativos.
 *
 * Montado en /api (sin requireAuth). Rutas: /public/client/:token...
 */
export const publicClientRouter = Router();

// Rate limit defensivo para los endpoints públicos
const publicLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

async function boardByToken(token: string) {
  if (!token || token.length > 80) return null;
  return queryOne<any>(
    `SELECT cb.id, cb.brand_id, cb.cliente_nombre, cb.titulo, cb.activo, b.nombre AS brand_nombre
     FROM client_boards cb LEFT JOIN brands b ON b.id = cb.brand_id
     WHERE cb.token = ? LIMIT 1`, [token]
  );
}

// Etiquetas de estado pensadas para el cliente (oculta jerga interna)
const ESTADO_CLIENTE: Record<string, string> = {
  backlog: 'Pendiente',
  en_proceso: 'En proceso',
  en_revision: 'En revisión',
  revision_interna: 'En revisión',
  revision_cliente: 'Para tu revisión',
  aprobado: 'Aprobado',
  entregado: 'Entregado',
  bloqueado: 'En pausa',
};

// ── Ver el tablero (tareas visibles, campos mínimos) ──
publicClientRouter.get('/public/client/:token', publicLimiter, async (req, res) => {
  try {
    const board = await boardByToken(String(req.params.token));
    if (!board || !board.activo) return res.status(404).json({ error: 'Tablero no disponible' });

    const tasks = await query<any[]>(
      `SELECT id, titulo_tarea, estado, fecha_cliente, created_at, enlaces, project_id
       FROM tasks
       WHERE client_board_id = ? AND cliente_visible = 1
       ORDER BY (fecha_cliente IS NULL), fecha_cliente ASC, created_at DESC`,
      [board.id]
    );

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const out = tasks.map((t) => {
      let links: string[] = [];
      if (Array.isArray(t.enlaces)) links = t.enlaces;
      else if (typeof t.enlaces === 'string' && t.enlaces) { try { links = JSON.parse(t.enlaces); } catch { links = []; } }
      let diasAtraso = 0;
      if (t.fecha_cliente && !['entregado', 'aprobado'].includes(t.estado)) {
        const fc = new Date(t.fecha_cliente + 'T00:00:00');
        const diff = Math.floor((hoy.getTime() - fc.getTime()) / 86400000);
        if (diff > 0) diasAtraso = diff;
      }
      return {
        id: t.id,
        titulo: t.titulo_tarea,
        estado: ESTADO_CLIENTE[t.estado] || t.estado,
        estado_raw: t.estado,
        fecha_cliente: t.fecha_cliente,
        creada: t.created_at,
        dias_atraso: diasAtraso,
        links,
        project_id: t.project_id || null,
      };
    });

    // Proyectos del cliente (solo los que tienen tareas visibles en este tablero)
    const projRows = await query<any[]>(
      `SELECT pr.id, pr.nombre, pr.estado, pr.salud, pr.fecha_fin, pr.color,
              COUNT(t.id) AS total,
              SUM(t.estado IN ('entregado','aprobado')) AS listas,
              SUM(t.estado NOT IN ('entregado','aprobado') AND t.fecha_cliente IS NOT NULL AND t.fecha_cliente < CURDATE()) AS vencidas
       FROM projects pr
       INNER JOIN tasks t ON t.project_id = pr.id AND t.client_board_id = ? AND t.cliente_visible = 1
       WHERE pr.brand_id = ? AND pr.activo = 1
       GROUP BY pr.id, pr.nombre, pr.estado, pr.salud, pr.fecha_fin, pr.color
       ORDER BY FIELD(pr.estado,'en_curso','pausado','terminado','cancelado'), pr.fecha_fin`,
      [board.id, board.brand_id]
    );
    const hoy2 = new Date(); hoy2.setHours(0, 0, 0, 0);
    const projects = projRows.map((r) => {
      const total = Number(r.total) || 0;
      const listas = Number(r.listas) || 0;
      const avance = total > 0 ? Math.round((listas / total) * 100) : 0;
      let salud = r.salud as string | null;
      if (!salud) {
        if (Number(r.vencidas) > 0) salud = 'rojo';
        else if (r.fecha_fin && new Date(String(r.fecha_fin).slice(0, 10) + 'T00:00:00') < hoy2 && r.estado === 'en_curso') salud = 'rojo';
        else salud = 'verde';
      }
      return { id: r.id, nombre: r.nombre, estado: r.estado, salud, avance, fecha_fin: r.fecha_fin, total_tareas: total, tareas_listas: listas, color: r.color };
    });

    res.json({
      titulo: board.titulo,
      marca: board.brand_nombre,
      cliente_nombre: board.cliente_nombre,
      projects,
      tasks: out,
    });
  } catch (e) { console.error('[PUBLIC-CLIENT] board:', e); res.status(500).json({ error: 'Error' }); }
});

// ── Comentarios de una tarea (ver) ──
publicClientRouter.get('/public/client/:token/tasks/:taskId/comments', publicLimiter, async (req, res) => {
  try {
    const board = await boardByToken(String(req.params.token));
    if (!board || !board.activo) return res.status(404).json({ error: 'No disponible' });
    const taskId = String(req.params.taskId);
    // Verificar que la tarea pertenece a este board y es visible
    const t = await queryOne<any>('SELECT id FROM tasks WHERE id = ? AND client_board_id = ? AND cliente_visible = 1', [taskId, board.id]);
    if (!t) return res.status(404).json({ error: 'Tarea no encontrada' });
    const rows = await query<any[]>(
      'SELECT id, autor_nombre, es_interno, comentario, created_at FROM client_board_comments WHERE board_id = ? AND task_id = ? ORDER BY created_at',
      [board.id, taskId]
    );
    res.json(rows.map((r) => ({ ...r, es_interno: !!r.es_interno })));
  } catch (e) { console.error('[PUBLIC-CLIENT] comments:', e); res.status(500).json({ error: 'Error' }); }
});

// ── Comentar en una tarea (cliente, firma con su nombre) ──
publicClientRouter.post('/public/client/:token/tasks/:taskId/comments', publicLimiter, async (req, res) => {
  try {
    const board = await boardByToken(String(req.params.token));
    if (!board || !board.activo) return res.status(404).json({ error: 'No disponible' });
    const taskId = String(req.params.taskId);
    const t = await queryOne<any>('SELECT id FROM tasks WHERE id = ? AND client_board_id = ? AND cliente_visible = 1', [taskId, board.id]);
    if (!t) return res.status(404).json({ error: 'Tarea no encontrada' });
    const nombre = typeof req.body?.autor_nombre === 'string' ? req.body.autor_nombre.trim().slice(0, 120) : 'Cliente';
    const comentario = typeof req.body?.comentario === 'string' ? req.body.comentario.trim().slice(0, 2000) : '';
    if (!comentario) return res.status(400).json({ error: 'Comentario vacío' });
    const id = uuid();
    await query('INSERT INTO client_board_comments (id, board_id, task_id, autor_nombre, es_interno, comentario) VALUES (?, ?, ?, ?, 0, ?)',
      [id, board.id, taskId, nombre || 'Cliente', comentario]);
    res.status(201).json({ id, autor_nombre: nombre || 'Cliente', comentario, es_interno: false, created_at: new Date().toISOString() });
  } catch (e) { console.error('[PUBLIC-CLIENT] add comment:', e); res.status(500).json({ error: 'Error' }); }
});

// ── Pedir un requerimiento (entra a la bandeja del ejecutivo) ──
publicClientRouter.post('/public/client/:token/requests', publicLimiter, async (req, res) => {
  try {
    const board = await boardByToken(String(req.params.token));
    if (!board || !board.activo) return res.status(404).json({ error: 'No disponible' });
    const titulo = typeof req.body?.titulo === 'string' ? req.body.titulo.trim().slice(0, 200) : '';
    if (!titulo) return res.status(400).json({ error: 'Título requerido' });
    const detalle = typeof req.body?.detalle === 'string' ? req.body.detalle.trim().slice(0, 2000) : null;
    const nombre = typeof req.body?.autor_nombre === 'string' ? req.body.autor_nombre.trim().slice(0, 120) : 'Cliente';
    const id = uuid();
    await query('INSERT INTO client_requests (id, board_id, titulo, detalle, autor_nombre) VALUES (?, ?, ?, ?, ?)',
      [id, board.id, titulo, detalle, nombre || 'Cliente']);
    res.status(201).json({ id, ok: true });
  } catch (e) { console.error('[PUBLIC-CLIENT] request:', e); res.status(500).json({ error: 'Error' }); }
});

// ── Cambiar status (cliente aprueba o pide cambios) ──
// SOLO permitido: revision_cliente -> aprobado  |  revision_cliente -> en_proceso
publicClientRouter.patch('/public/client/:token/tasks/:taskId/status', publicLimiter, async (req, res) => {
  try {
    const board = await boardByToken(String(req.params.token));
    if (!board || !board.activo) return res.status(404).json({ error: 'No disponible' });
    const taskId = String(req.params.taskId);
    const t = await queryOne<any>('SELECT id, estado, titulo_tarea FROM tasks WHERE id = ? AND client_board_id = ? AND cliente_visible = 1', [taskId, board.id]);
    if (!t) return res.status(404).json({ error: 'Tarea no encontrada' });

    const nuevo = String(req.body?.estado || '');
    const nombre = typeof req.body?.autor_nombre === 'string' ? req.body.autor_nombre.trim().slice(0, 120) : 'Cliente';
    // El cliente solo puede actuar sobre tareas que están EN SU REVISIÓN
    if (t.estado !== 'revision_cliente') {
      return res.status(409).json({ error: 'Esta tarea no está esperando tu revisión' });
    }
    if (nuevo !== 'aprobado' && nuevo !== 'en_proceso') {
      return res.status(400).json({ error: 'Solo podés Aprobar o Pedir cambios' });
    }
    await query('UPDATE tasks SET estado = ? WHERE id = ?', [nuevo, taskId]);
    // Deja constancia en el hilo como comentario del cliente
    const accionTxt = nuevo === 'aprobado' ? '✅ Aprobó la tarea.' : '🔄 Pidió cambios (volvió a En proceso).';
    await query('INSERT INTO client_board_comments (id, board_id, task_id, autor_nombre, es_interno, comentario) VALUES (?, ?, ?, ?, 0, ?)',
      [uuid(), board.id, taskId, nombre || 'Cliente', accionTxt]);
    res.json({ ok: true, estado: nuevo });
  } catch (e) { console.error('[PUBLIC-CLIENT] status:', e); res.status(500).json({ error: 'Error' }); }
});

// ── Subida de imagen para comentarios del cliente (sin login, token-gated) ──
const CLIENT_UPLOAD_DIR = pathPC.join(process.cwd(), 'uploads', 'client');
if (!fsPC.existsSync(CLIENT_UPLOAD_DIR)) fsPC.mkdirSync(CLIENT_UPLOAD_DIR, { recursive: true });
const clientImgUpload = multerPC({
  storage: multerPC.diskStorage({
    destination: (_r: any, _f: any, cb: any) => cb(null, CLIENT_UPLOAD_DIR),
    filename: (_r: any, file: any, cb: any) => cb(null, `${uuid()}${pathPC.extname(file.originalname || '') || '.png'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_r: any, file: any, cb: any) => cb(null, !!file.mimetype && file.mimetype.startsWith('image/')),
});
publicClientRouter.post('/public/client/:token/upload-image', publicLimiter, clientImgUpload.single('image'), async (req: any, res) => {
  try {
    const board = await boardByToken(String(req.params.token));
    if (!board || !board.activo) return res.status(404).json({ error: 'No disponible' });
    if (!req.file) return res.status(400).json({ error: 'No se envió imagen' });
    const base = (process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec').replace(/\/$/, '');
    res.status(201).json({ url: `${base}/uploads/client/${req.file.filename}` });
  } catch (e) { console.error('[PUBLIC-CLIENT] upload:', e); res.status(500).json({ error: 'Error' }); }
});
