import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { chatWithGemini, summarizeContent, buildTaskContext, checkRateLimit, type GeminiMessage } from '../services/gemini.js';

export const geminiRouter = Router();

// ========== Chat ==========
const chatSchema = z.object({
  message: z.string().min(1).max(10000),
  conversation_id: z.string().optional(),
  context: z.object({
    type: z.enum(['tasks', 'project', 'general']).optional(),
    entity_ids: z.array(z.string()).optional(),
  }).optional(),
});

geminiRouter.post('/gemini/chat', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
      return;
    }

    const { message, conversation_id, context } = parsed.data;
    const userId = req.userId!;

    // Rate limit per user
    const rl = checkRateLimit(userId);
    if (!rl.allowed) {
      res.status(429).json({
        error: `Espera ${Math.ceil(rl.retryAfterMs / 1000)} segundos antes de enviar otro mensaje.`,
      });
      return;
    }

    // Get or create conversation
    let convId = conversation_id;
    if (!convId) {
      convId = uuid();
      const title = message.length > 80 ? message.substring(0, 80) + '...' : message;
      await query(
        'INSERT INTO gemini_conversations (id, user_id, title) VALUES (?, ?, ?)',
        [convId, userId, title]
      );
    } else {
      // Verify ownership
      const conv = await queryOne<{ id: string }>('SELECT id FROM gemini_conversations WHERE id = ? AND user_id = ?', [convId, userId]);
      if (!conv) { res.status(404).json({ error: 'Conversación no encontrada' }); return; }
      await query('UPDATE gemini_conversations SET updated_at = NOW() WHERE id = ?', [convId]);
    }

    // Build context - get user info and role
    let additionalContext = '';
    const userProfile = await queryOne<{ nombre: string; rol: string }>(
      'SELECT nombre, rol FROM profiles WHERE id = ?', [userId]
    );
    const userRole = req.userRole || userProfile?.rol || 'equipo';
    const userName = userProfile?.nombre || 'Usuario';

    // Get user's desk memberships
    const userDesks = await query<{ desk_id: string; nombre: string }[]>(
      `SELECT dm.desk_id, d.nombre FROM desk_members dm
       JOIN desks d ON d.id = dm.desk_id AND d.activo = 1
       WHERE dm.user_id = ?`, [userId]
    );
    const deskIds = userDesks.map(d => d.desk_id);
    const deskNames = userDesks.map(d => d.nombre);

    if (context?.type === 'tasks') {
      const taskIds = context.entity_ids;
      let tasks: any[];
      if (taskIds && taskIds.length > 0) {
        const ph = taskIds.map(() => '?').join(',');
        tasks = await query<any[]>(
          `SELECT t.titulo_tarea, t.estado, t.prioridad, t.fecha_entrega, p.nombre as responsable
           FROM tasks t LEFT JOIN profiles p ON p.id = t.responsable_user_id
           WHERE t.id IN (${ph})`, taskIds
        );
      } else if (deskIds.length > 0) {
        // Get tasks from user's desks (team view) + tasks assigned directly
        const ph = deskIds.map(() => '?').join(',');
        tasks = await query<any[]>(
          `SELECT t.titulo_tarea, t.estado, t.prioridad, t.fecha_entrega,
                  p.nombre as responsable, d.nombre as mesa
           FROM tasks t
           LEFT JOIN profiles p ON p.id = t.responsable_user_id
           LEFT JOIN desks d ON d.id = t.desk_id
           WHERE (t.desk_id IN (${ph}) OR t.responsable_user_id = ?)
             AND t.estado NOT IN ('entregado', 'cancelado')
           ORDER BY t.prioridad DESC, t.fecha_entrega ASC
           LIMIT 50`, [...deskIds, userId]
        );
      } else {
        // Fallback: only user's own tasks
        tasks = await query<any[]>(
          `SELECT t.titulo_tarea, t.estado, t.prioridad, t.fecha_entrega, p.nombre as responsable
           FROM tasks t LEFT JOIN profiles p ON p.id = t.responsable_user_id
           WHERE t.responsable_user_id = ? AND t.estado NOT IN ('entregado', 'cancelado')
           ORDER BY t.created_at DESC LIMIT 20`, [userId]
        );
      }
      additionalContext = buildTaskContext(tasks);
    } else if (context?.type === 'project') {
      // Get overview of all active tasks (admin/ops see all)
      const isAdmin = userRole === 'admin' || userRole === 'ops';
      let tasks: any[];
      if (isAdmin) {
        tasks = await query<any[]>(
          `SELECT t.titulo_tarea, t.estado, t.prioridad, t.fecha_entrega,
                  p.nombre as responsable, d.nombre as mesa
           FROM tasks t
           LEFT JOIN profiles p ON p.id = t.responsable_user_id
           LEFT JOIN desks d ON d.id = t.desk_id
           WHERE t.estado NOT IN ('entregado', 'cancelado')
           ORDER BY t.prioridad DESC, t.fecha_entrega ASC LIMIT 80`
        );
      } else if (deskIds.length > 0) {
        const ph = deskIds.map(() => '?').join(',');
        tasks = await query<any[]>(
          `SELECT t.titulo_tarea, t.estado, t.prioridad, t.fecha_entrega,
                  p.nombre as responsable, d.nombre as mesa
           FROM tasks t
           LEFT JOIN profiles p ON p.id = t.responsable_user_id
           LEFT JOIN desks d ON d.id = t.desk_id
           WHERE (t.desk_id IN (${ph}) OR t.responsable_user_id = ?)
             AND t.estado NOT IN ('entregado', 'cancelado')
           ORDER BY t.prioridad DESC, t.fecha_entrega ASC LIMIT 50`, [...deskIds, userId]
        );
      } else {
        tasks = await query<any[]>(
          `SELECT t.titulo_tarea, t.estado, t.prioridad, t.fecha_entrega, p.nombre as responsable
           FROM tasks t LEFT JOIN profiles p ON p.id = t.responsable_user_id
           WHERE t.responsable_user_id = ? AND t.estado NOT IN ('entregado', 'cancelado')
           ORDER BY t.prioridad DESC, t.fecha_entrega ASC LIMIT 20`, [userId]
        );
      }
      additionalContext = buildTaskContext(tasks);
    }

    // Add user identity context
    const identityCtx = `Usuario actual: ${userName} (rol: ${userRole})${deskNames.length > 0 ? `, miembro de: ${deskNames.join(', ')}` : ''}`;
    additionalContext = additionalContext
      ? `${identityCtx}\n\n${additionalContext}`
      : identityCtx;

    // Load previous messages for this conversation
    const prevMessages = await query<{ role: 'user' | 'model'; content: string }[]>(
      'SELECT role, content FROM gemini_messages WHERE conversation_id = ? ORDER BY created_at ASC, FIELD(role, \'user\', \'model\') ASC LIMIT 50',
      [convId]
    );

    const allMessages: GeminiMessage[] = [
      ...prevMessages,
      { role: 'user', content: message },
    ];

    // Call Gemini
    const response = await chatWithGemini(allMessages, additionalContext);

    // Save both messages
    const userMsgId = uuid();
    const modelMsgId = uuid();
    await query(
      'INSERT INTO gemini_messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)',
      [userMsgId, convId, 'user', message]
    );
    await query(
      'INSERT INTO gemini_messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)',
      [modelMsgId, convId, 'model', response]
    );

    res.json({ response, conversation_id: convId });
  } catch (e) {
    console.error('[GEMINI] chat error:', e);
    const msg = (e as Error).message || '';
    if (msg.includes('API_KEY')) {
      res.status(500).json({ error: 'API key de Gemini no configurada. Contacta al administrador.' });
    } else if (msg.includes('429') || msg.includes('quota')) {
      res.status(429).json({ error: 'Límite de uso alcanzado. Intenta en unos minutos.' });
    } else {
      res.status(500).json({ error: 'Error al procesar tu mensaje' });
    }
  }
});

// ========== List Conversations ==========
geminiRouter.get('/gemini/conversations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await query<any[]>(
      `SELECT gc.id, gc.title, gc.created_at, gc.updated_at,
              (SELECT COUNT(*) FROM gemini_messages gm WHERE gm.conversation_id = gc.id) as message_count
       FROM gemini_conversations gc
       WHERE gc.user_id = ?
       ORDER BY gc.updated_at DESC
       LIMIT 50`,
      [req.userId!]
    );
    res.json(rows);
  } catch (e) {
    console.error('[GEMINI] conversations list error:', e);
    res.status(500).json({ error: 'Error al obtener conversaciones' });
  }
});

// ========== Get Conversation Messages ==========
geminiRouter.get('/gemini/conversations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const conv = await queryOne<{ id: string; title: string }>(
      'SELECT id, title FROM gemini_conversations WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId!]
    );
    if (!conv) { res.status(404).json({ error: 'Conversación no encontrada' }); return; }

    const messages = await query<any[]>(
      'SELECT id, role, content, created_at FROM gemini_messages WHERE conversation_id = ? ORDER BY created_at ASC, FIELD(role, \'user\', \'model\') ASC',
      [req.params.id]
    );

    res.json({ ...conv, messages });
  } catch (e) {
    console.error('[GEMINI] conversation get error:', e);
    res.status(500).json({ error: 'Error al obtener conversación' });
  }
});

// ========== Delete Conversation ==========
geminiRouter.delete('/gemini/conversations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const conv = await queryOne<{ id: string }>(
      'SELECT id FROM gemini_conversations WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId!]
    );
    if (!conv) { res.status(404).json({ error: 'Conversación no encontrada' }); return; }

    await query('DELETE FROM gemini_conversations WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('[GEMINI] conversation delete error:', e);
    res.status(500).json({ error: 'Error al eliminar conversación' });
  }
});

// ========== Summarize ==========
const summarizeSchema = z.object({
  type: z.enum(['tasks', 'comments', 'sprint', 'general']),
  entity_ids: z.array(z.string()).min(1).max(50),
});

geminiRouter.post('/gemini/summarize', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = summarizeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
      return;
    }

    const { type, entity_ids } = parsed.data;
    let content = '';

    if (type === 'tasks') {
      const ph = entity_ids.map(() => '?').join(',');
      const tasks = await query<any[]>(
        `SELECT t.titulo_tarea, t.detalle, t.estado, t.prioridad, t.fecha_entrega, p.nombre as responsable
         FROM tasks t LEFT JOIN profiles p ON p.id = t.responsable_user_id
         WHERE t.id IN (${ph})`, entity_ids
      );
      content = tasks.map(t =>
        `Tarea: ${t.titulo_tarea}\nEstado: ${t.estado}\nPrioridad: ${t.prioridad || 'N/A'}\nEntrega: ${t.fecha_entrega || 'Sin fecha'}\nResponsable: ${t.responsable || 'Sin asignar'}\nDetalle: ${t.detalle || 'Sin detalle'}`
      ).join('\n\n---\n\n');
    } else if (type === 'comments') {
      const ph = entity_ids.map(() => '?').join(',');
      const comments = await query<any[]>(
        `SELECT c.text, c.created_at, p.nombre as autor
         FROM comments c LEFT JOIN profiles p ON p.id = c.user_id
         WHERE c.task_id IN (${ph})
         ORDER BY c.created_at ASC`, entity_ids
      );
      content = comments.map(c =>
        `[${c.autor || 'Anónimo'} - ${new Date(c.created_at).toLocaleDateString('es-ES')}]: ${c.text}`
      ).join('\n');
    } else if (type === 'sprint') {
      const ph = entity_ids.map(() => '?').join(',');
      const tasks = await query<any[]>(
        `SELECT t.titulo_tarea, t.estado, t.prioridad, t.story_points, p.nombre as responsable
         FROM tasks t LEFT JOIN profiles p ON p.id = t.responsable_user_id
         WHERE t.sprint_id IN (${ph})`, entity_ids
      );
      content = buildTaskContext(tasks);
    }

    if (!content) {
      res.status(400).json({ error: 'No se encontró contenido para resumir' });
      return;
    }

    const summary = await summarizeContent(content, type);
    res.json({ summary });
  } catch (e) {
    console.error('[GEMINI] summarize error:', e);
    res.status(500).json({ error: 'Error al generar resumen' });
  }
});
