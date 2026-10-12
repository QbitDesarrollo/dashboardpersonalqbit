import { queryOne } from '../db/mysql.js';
import { createNotification } from './notifications.js';

// Respuestas a comentarios de tareas (incidencia de Steven, 1-oct: no se podía
// contestar dentro del mismo comentario, había que escribir arriba). Hilos de un
// nivel: si se responde a una respuesta, queda colgada del comentario original.

/** Comentario raíz al que se cuelga la respuesta, o null si no es válido para esta tarea. */
export async function raizDeRespuesta(taskId: string, replyToId: unknown): Promise<string | null> {
  if (typeof replyToId !== 'string' || !replyToId) return null;
  const padre = await queryOne<{ id: string; reply_to_id: string | null }>(
    'SELECT id, reply_to_id FROM comments WHERE id = ? AND task_id = ?', [replyToId, taskId],
  );
  if (!padre) return null;
  return padre.reply_to_id || padre.id;
}

/** Aviso al autor del comentario original (si no es quien responde). */
export async function avisarRespuesta(taskId: string, raizId: string, autorId: string): Promise<void> {
  const raiz = await queryOne<{ user_id: string }>('SELECT user_id FROM comments WHERE id = ?', [raizId]);
  if (!raiz || raiz.user_id === autorId) return;
  const [autor, tarea] = await Promise.all([
    queryOne<{ nombre: string }>('SELECT nombre FROM profiles WHERE id = ?', [autorId]),
    queryOne<{ titulo_tarea: string }>('SELECT titulo_tarea FROM tasks WHERE id = ?', [taskId]),
  ]);
  await createNotification(
    raiz.user_id,
    `${String(autor?.nombre || 'Alguien').trim()} respondió tu comentario en «${tarea?.titulo_tarea || 'una tarea'}»`,
    taskId,
  );
}
