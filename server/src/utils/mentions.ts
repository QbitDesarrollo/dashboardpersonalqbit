import { query, queryOne, uuid } from '../db/mysql.js';
import { sendEmail, commentMentionEmail } from '../services/email.js';

const MENTION_REGEX = /@([A-Za-zÀ-ÿ0-9 ._-]+)/g;

/**
 * Detecta @menciones en un texto, crea notificación in-app y manda email
 * a cada usuario mencionado con link directo a la tarea.
 *
 * - Idempotente por usuario.
 * - No notifica al autor.
 * - Email opcional (solo si hay credenciales de Mailgun o SMTP).
 *
 * @returns Lista de userIds notificados.
 */
export async function processCommentMentions(opts: {
  taskId: string;
  authorUserId: string;
  text: string;
  emit?: (userId: string, payload: { id: string; mensaje: string; task_id: string; leida: 0; created_at: string }) => void;
}): Promise<string[]> {
  const { taskId, authorUserId, text, emit } = opts;
  const notifiedUserIds = new Set<string>();
  const results: string[] = [];

  const authorRow = await queryOne<{ nombre: string }>(
    'SELECT nombre FROM profiles WHERE id = ?', [authorUserId]
  );
  const authorName = authorRow?.nombre || 'Alguien';

  const taskRow = await queryOne<{ titulo_tarea: string }>(
    'SELECT titulo_tarea FROM tasks WHERE id = ?', [taskId]
  );
  const taskTitle = taskRow?.titulo_tarea || 'una tarea';

  const frontendUrl = process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec';
  const emailEnabled = !!(process.env.MAILGUN_API_KEY || process.env.SMTP_PASS);

  let match;
  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    const mentionedName = match[1].trim();
    if (!mentionedName) continue;

    const user = await queryOne<{ id: string; nombre: string; email: string }>(
      `SELECT id, nombre, email FROM profiles WHERE LOWER(nombre) LIKE LOWER(?) AND activo = 1 LIMIT 1`,
      [`%${mentionedName}%`]
    );
    if (!user || user.id === authorUserId || notifiedUserIds.has(user.id)) continue;
    notifiedUserIds.add(user.id);
    results.push(user.id);

    const mensaje = `${authorName} te mencionó en un comentario`;
    const nId = uuid();

    // 1. In-app notification
    try {
      await query(
        'INSERT INTO notifications (id, user_id, mensaje, task_id) VALUES (?, ?, ?, ?)',
        [nId, user.id, mensaje, taskId]
      );
    } catch (e) {
      console.error('[MENTIONS] insert notification failed:', e);
      continue;
    }

    // 2. Real-time socket emit
    if (emit) {
      try {
        emit(user.id, {
          id: nId,
          mensaje,
          task_id: taskId,
          leida: 0,
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error('[MENTIONS] socket emit failed:', e);
      }
    }

    // 3. Email con template centralizado
    if (emailEnabled && user.email) {
      try {
        const emailData = await commentMentionEmail({
          recipientName: user.nombre,
          authorName,
          taskTitle,
          commentText: text,
          frontendUrl,
          taskId,
        });
        emailData.to = user.email;
        sendEmail(emailData).catch((e) => {
          console.error('[MENTIONS] email send failed:', e);
        });
      } catch (e) {
        console.error('[MENTIONS] email render failed:', e);
      }
    }
  }

  return results;
}
