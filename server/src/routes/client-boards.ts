import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';
import crypto from 'crypto';
import { fechaSql, hoyEcuador } from '../utils/fechas.js';

/**
 * Módulo de clientes — lado INTERNO (ejecutivos logueados).
 * Gestiona los tableros de cliente: crear, listar, generar link público,
 * crear tareas cara-al-cliente (que viven en la misma tabla `tasks` con
 * `cliente_visible=1` y `fecha_cliente` congelada), y resolver requerimientos.
 *
 * El lado PÚBLICO (cliente sin login, por token) está en public-client.ts.
 */
export const clientBoardsRouter = Router();

async function ensureExec(req: AuthRequest, res: any): Promise<boolean> {
  const ok = await hasRole(req.userId!, ['admin', 'ejecutivo']);
  if (!ok) { res.status(403).json({ error: 'Solo admin/ejecutivo' }); return false; }
  return true;
}

function genToken(): string {
  return 'cb_' + crypto.randomBytes(20).toString('hex'); // 43 chars
}

// ── Listar tableros ──
clientBoardsRouter.get('/client-boards', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureExec(req, res))) return;
    const rows = await query<any[]>(
      `SELECT cb.id, cb.brand_id, cb.token, cb.cliente_nombre, cb.titulo, cb.activo, cb.created_at,
              b.nombre AS brand_nombre,
              (SELECT COUNT(*) FROM tasks t WHERE t.client_board_id = cb.id AND t.cliente_visible = 1) AS tareas,
              (SELECT COUNT(*) FROM tasks t WHERE t.client_board_id = cb.id AND t.cliente_visible = 1 AND t.estado IN ('entregado','aprobado')) AS listas,
              (SELECT COUNT(*) FROM tasks t WHERE t.client_board_id = cb.id AND t.cliente_visible = 1 AND t.estado NOT IN ('entregado','aprobado','revision_cliente') AND t.fecha_cliente IS NOT NULL AND t.fecha_cliente < ${fechaSql(hoyEcuador())}) AS vencidas,
              (SELECT COUNT(DISTINCT t.project_id) FROM tasks t WHERE t.client_board_id = cb.id AND t.cliente_visible = 1 AND t.project_id IS NOT NULL) AS proyectos,
              (SELECT COUNT(*) FROM client_requests r WHERE r.board_id = cb.id AND r.estado = 'pendiente') AS requests_pendientes
       FROM client_boards cb
       LEFT JOIN brands b ON b.id = cb.brand_id
       ORDER BY cb.created_at DESC`
    );
    res.json(rows.map((r) => {
      const tareas = Number(r.tareas) || 0; const listas = Number(r.listas) || 0; const vencidas = Number(r.vencidas) || 0;
      const avance = tareas > 0 ? Math.round((listas / tareas) * 100) : 0;
      const salud = vencidas > 0 ? 'rojo' : (tareas > 0 && listas === tareas ? 'verde' : 'verde');
      return { ...r, activo: !!r.activo, tareas, listas, vencidas, proyectos: Number(r.proyectos) || 0, requests_pendientes: Number(r.requests_pendientes), avance, salud };
    }));
  } catch (e) { console.error('[CLIENT-BOARDS] list:', e); res.status(500).json({ error: 'Error' }); }
});

// ── Crear tablero (genera token) ──
clientBoardsRouter.post('/client-boards', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureExec(req, res))) return;
    const brandId = typeof req.body?.brand_id === 'string' ? req.body.brand_id : '';
    if (!brandId) return res.status(400).json({ error: 'brand_id requerido' });
    const brand = await queryOne<any>('SELECT id, nombre FROM brands WHERE id = ?', [brandId]);
    if (!brand) return res.status(400).json({ error: 'Marca no encontrada' });

    // Un tablero por marca (idempotente)
    const existing = await queryOne<any>('SELECT id FROM client_boards WHERE brand_id = ?', [brandId]);
    if (existing) return res.status(409).json({ error: 'Ya existe un tablero para esta marca', id: existing.id });

    const id = uuid();
    const token = genToken();
    const clienteNombre = typeof req.body?.cliente_nombre === 'string' ? req.body.cliente_nombre.trim().slice(0, 120) : null;
    const titulo = typeof req.body?.titulo === 'string' ? req.body.titulo.trim().slice(0, 160) : `Proyectos — ${brand.nombre}`;
    await query(
      'INSERT INTO client_boards (id, brand_id, token, cliente_nombre, titulo, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [id, brandId, token, clienteNombre, titulo, req.userId]
    );
    const row = await queryOne<any>('SELECT * FROM client_boards WHERE id = ?', [id]);
    res.status(201).json({ ...row, activo: !!row.activo, brand_nombre: brand.nombre });
  } catch (e) { console.error('[CLIENT-BOARDS] create:', e); res.status(500).json({ error: 'Error al crear tablero' }); }
});

// ── Detalle del tablero + sus tareas (vista interna, con ambas fechas) ──
clientBoardsRouter.get('/client-boards/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureExec(req, res))) return;
    const id = String(req.params.id);
    const board = await queryOne<any>(
      `SELECT cb.*, b.nombre AS brand_nombre FROM client_boards cb LEFT JOIN brands b ON b.id = cb.brand_id WHERE cb.id = ?`, [id]
    );
    if (!board) return res.status(404).json({ error: 'Tablero no encontrado' });
    const tasks = await query<any[]>(
      `SELECT t.id, t.titulo_tarea, t.detalle, t.responsable_user_id, t.sort_order, t.estado, t.fecha_cliente, t.fecha_entrega, t.created_at, t.enlaces,
              t.project_id, pr.nombre AS project_nombre,
              p.nombre AS responsable_nombre, p.avatar_url AS responsable_avatar
       FROM tasks t
       LEFT JOIN profiles p ON p.id = t.responsable_user_id
       LEFT JOIN projects pr ON pr.id = t.project_id
       WHERE t.client_board_id = ? AND t.cliente_visible = 1
       ORDER BY pr.nombre, t.sort_order ASC, t.created_at DESC`, [id]
    );
    res.json({ board: { ...board, activo: !!board.activo }, tasks });
  } catch (e) { console.error('[CLIENT-BOARDS] detail:', e); res.status(500).json({ error: 'Error' }); }
});

// ── Crear tarea cara-al-cliente (clona en paralelo = misma fila, dos fechas) ──
clientBoardsRouter.post('/client-boards/:id/tasks', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureExec(req, res))) return;
    const id = String(req.params.id);
    const board = await queryOne<any>('SELECT id, brand_id FROM client_boards WHERE id = ?', [id]);
    if (!board) return res.status(404).json({ error: 'Tablero no encontrado' });

    const titulo = typeof req.body?.titulo_tarea === 'string' ? req.body.titulo_tarea.trim() : '';
    if (!titulo) return res.status(400).json({ error: 'Título requerido' });
    const fecha = typeof req.body?.fecha_cliente === 'string' && req.body.fecha_cliente ? req.body.fecha_cliente : null;
    const detalle = typeof req.body?.detalle === 'string' ? req.body.detalle : null;
    const ESTADOS_OK = ['backlog', 'en_proceso', 'en_revision', 'revision_interna', 'revision_cliente', 'aprobado', 'entregado', 'bloqueado'];
    const estado = ESTADOS_OK.includes(String(req.body?.estado)) ? String(req.body.estado) : 'backlog';

    const taskId = uuid();
    // Al crear: fecha_cliente = fecha_entrega (luego el ejecutivo cambia la interna sin tocar la del cliente)
    await query(
      `INSERT INTO tasks (id, check_done, brand_id, titulo_tarea, detalle, cantidad_entregables,
        prioridad, estado, fecha_entrega, fecha_cliente, cliente_visible, client_board_id, created_by, recurrence_type)
       VALUES (?, 0, ?, ?, ?, 1, 'media', ?, ?, ?, 1, ?, ?, 'none')`,
      [taskId, board.brand_id, titulo, detalle, estado, fecha, fecha, id, req.userId ?? null]
    );
    const row = await queryOne<any>('SELECT id, titulo_tarea, estado, fecha_cliente, fecha_entrega, created_at FROM tasks WHERE id = ?', [taskId]);
    res.status(201).json(row);
  } catch (e) { console.error('[CLIENT-BOARDS] create task:', e); res.status(500).json({ error: 'Error al crear tarea' }); }
});

// ── Requerimientos del cliente (bandeja) ──
clientBoardsRouter.get('/client-boards/:id/requests', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureExec(req, res))) return;
    const id = String(req.params.id);
    const rows = await query<any[]>(
      'SELECT id, titulo, detalle, autor_nombre, estado, task_id, created_at, resolved_at FROM client_requests WHERE board_id = ? ORDER BY created_at DESC',
      [id]
    );
    res.json(rows);
  } catch (e) { console.error('[CLIENT-BOARDS] requests:', e); res.status(500).json({ error: 'Error' }); }
});

// ── Resolver requerimiento: aprobar (crea tarea cara-cliente) o rechazar ──
clientBoardsRouter.patch('/client-boards/:id/requests/:rid', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureExec(req, res))) return;
    const id = String(req.params.id);
    const rid = String(req.params.rid);
    const accion = req.body?.accion; // 'aprobar' | 'rechazar'
    const board = await queryOne<any>('SELECT id, brand_id FROM client_boards WHERE id = ?', [id]);
    if (!board) return res.status(404).json({ error: 'Tablero no encontrado' });
    const reqRow = await queryOne<any>('SELECT * FROM client_requests WHERE id = ? AND board_id = ?', [rid, id]);
    if (!reqRow) return res.status(404).json({ error: 'Requerimiento no encontrado' });
    if (reqRow.estado !== 'pendiente') return res.status(409).json({ error: 'El requerimiento ya fue resuelto' });

    if (accion === 'aprobar') {
      const fecha = typeof req.body?.fecha_cliente === 'string' && req.body.fecha_cliente ? req.body.fecha_cliente : null;
      const taskId = uuid();
      await query(
        `INSERT INTO tasks (id, check_done, brand_id, titulo_tarea, detalle, cantidad_entregables,
          prioridad, estado, fecha_entrega, fecha_cliente, cliente_visible, client_board_id, created_by, recurrence_type)
         VALUES (?, 0, ?, ?, ?, 1, 'media', 'backlog', ?, ?, 1, ?, ?, 'none')`,
        [taskId, board.brand_id, reqRow.titulo, reqRow.detalle, fecha, fecha, id, req.userId ?? null]
      );
      await query('UPDATE client_requests SET estado = "aprobado", task_id = ?, resuelto_por = ?, resolved_at = NOW(3) WHERE id = ?', [taskId, req.userId, rid]);
      res.json({ ok: true, task_id: taskId });
    } else if (accion === 'rechazar') {
      await query('UPDATE client_requests SET estado = "rechazado", resuelto_por = ?, resolved_at = NOW(3) WHERE id = ?', [req.userId, rid]);
      res.json({ ok: true });
    } else {
      res.status(400).json({ error: 'accion debe ser aprobar o rechazar' });
    }
  } catch (e) { console.error('[CLIENT-BOARDS] resolve request:', e); res.status(500).json({ error: 'Error' }); }
});

// ── Comentarios de una tarea del tablero (lado INTERNO: atribuye al usuario logueado) ──
// Es el MISMO hilo que ve el cliente (client_board_comments). Nicole comenta como ella misma.
clientBoardsRouter.get('/client-boards/:id/tasks/:taskId/comments', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureExec(req, res))) return;
    const id = String(req.params.id);
    const taskId = String(req.params.taskId);
    const t = await queryOne<any>('SELECT id FROM tasks WHERE id = ? AND client_board_id = ?', [taskId, id]);
    if (!t) return res.status(404).json({ error: 'Tarea no encontrada' });
    const rows = await query<any[]>(
      'SELECT id, autor_nombre, es_interno, solo_interno, comentario, created_at FROM client_board_comments WHERE board_id = ? AND task_id = ? ORDER BY created_at',
      [id, taskId]
    );
    res.json(rows.map((r) => ({ ...r, es_interno: !!r.es_interno, solo_interno: !!r.solo_interno })));
  } catch (e) { console.error('[CLIENT-BOARDS] get comments:', e); res.status(500).json({ error: 'Error' }); }
});

clientBoardsRouter.post('/client-boards/:id/tasks/:taskId/comments', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureExec(req, res))) return;
    const id = String(req.params.id);
    const taskId = String(req.params.taskId);
    const t = await queryOne<any>('SELECT id FROM tasks WHERE id = ? AND client_board_id = ?', [taskId, id]);
    if (!t) return res.status(404).json({ error: 'Tarea no encontrada' });
    const comentario = typeof req.body?.comentario === 'string' ? req.body.comentario.trim().slice(0, 2000) : '';
    if (!comentario) return res.status(400).json({ error: 'Comentario vacío' });
    // Nombre automático del usuario logueado (no se lo pide)
    const me = await queryOne<{ nombre: string }>('SELECT nombre FROM profiles WHERE id = ?', [req.userId]);
    const autor = me?.nombre || 'Agencia';
    const cid = uuid();
    const soloInterno = req.body?.solo_interno ? 1 : 0;
    await query('INSERT INTO client_board_comments (id, board_id, task_id, autor_nombre, es_interno, solo_interno, comentario) VALUES (?, ?, ?, ?, 1, ?, ?)',
      [cid, id, taskId, autor, soloInterno, comentario]);
    res.status(201).json({ id: cid, autor_nombre: autor, es_interno: true, solo_interno: !!soloInterno, comentario, created_at: new Date().toISOString() });
  } catch (e) { console.error('[CLIENT-BOARDS] post comment:', e); res.status(500).json({ error: 'Error' }); }
});

// ── Marcar un comentario como interno (solo equipo) o visible al cliente ──
clientBoardsRouter.patch('/client-boards/:id/comments/:commentId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureExec(req, res))) return;
    const soloInterno = req.body?.solo_interno ? 1 : 0;
    await query('UPDATE client_board_comments SET solo_interno = ? WHERE id = ? AND board_id = ?',
      [soloInterno, String(req.params.commentId), String(req.params.id)]);
    res.json({ ok: true, solo_interno: !!soloInterno });
  } catch (e) { console.error('[CLIENT-BOARDS] toggle comment:', e); res.status(500).json({ error: 'Error' }); }
});
