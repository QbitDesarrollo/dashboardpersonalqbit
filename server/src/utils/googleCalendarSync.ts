import { google } from 'googleapis';
import { query, queryOne } from '../db/mysql.js';

const GC_ID = process.env.GOOGLE_CLIENT_ID || '';
const GC_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GC_REDIR = process.env.GOOGLE_REDIRECT_URI || '';

interface GToken {
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expiry: Date | null;
}

function makeClient() {
  return new google.auth.OAuth2(GC_ID, GC_SECRET, GC_REDIR);
}

async function getAuthedClient(userId: string) {
  const t = await queryOne<GToken>('SELECT * FROM google_tokens WHERE user_id = ?', [userId]);
  if (!t) return null;

  const c = makeClient();
  c.setCredentials({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expiry_date: t.token_expiry ? new Date(t.token_expiry).getTime() : undefined,
  });

  c.on('tokens', async (tokens) => {
    try {
      const exp = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
      if (tokens.refresh_token) {
        await query('UPDATE google_tokens SET access_token=?, refresh_token=?, token_expiry=? WHERE user_id=?',
          [tokens.access_token, tokens.refresh_token, exp, userId]);
      } else {
        await query('UPDATE google_tokens SET access_token=?, token_expiry=? WHERE user_id=?',
          [tokens.access_token, exp, userId]);
      }
    } catch { /* silent */ }
  });

  return c;
}

/**
 * Auto-sync a task to a user's Google Calendar (fire-and-forget).
 * Only creates an event if the user has Google connected and the task doesn't already have one.
 */
export async function autoSyncTaskToCalendar(userId: string, taskId: string): Promise<void> {
  try {
    if (!GC_ID) return;

    const client = await getAuthedClient(userId);
    if (!client) return;

    const task = await queryOne<{
      id: string; titulo_tarea: string; detalle: string | null;
      fecha_entrega: Date | null; estado: string; google_event_id: string | null;
    }>('SELECT id, titulo_tarea, detalle, fecha_entrega, estado, google_event_id FROM tasks WHERE id=?', [taskId]);

    if (!task) return;
    if (task.google_event_id) return;

    const cal = google.calendar({ version: 'v3', auth: client });
    const due = task.fecha_entrega ? new Date(task.fecha_entrega) : new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const s = new Date(due); s.setHours(9, 0, 0, 0);
    const en = new Date(due); en.setHours(10, 0, 0, 0);

    const body = {
      summary: '[Tiusdei] ' + task.titulo_tarea,
      description: task.detalle || 'Tarea de Tiusdei - Estado: ' + task.estado,
      start: { dateTime: s.toISOString(), timeZone: 'America/Guayaquil' },
      end: { dateTime: en.toISOString(), timeZone: 'America/Guayaquil' },
      reminders: { useDefault: false, overrides: [{ method: 'popup' as const, minutes: 60 }] },
    };

    const cr = await cal.events.insert({ calendarId: 'primary', requestBody: body });
    const evId = cr.data.id || null;
    if (evId) {
      await query('UPDATE tasks SET google_event_id=? WHERE id=?', [evId, taskId]);
    }
    console.log(`[GCAL] Auto-synced task ${taskId} to calendar of user ${userId}, event=${evId}`);
  } catch (e) {
    console.error('[GCAL] Auto-sync error (silent):', (e as Error).message);
  }
}
