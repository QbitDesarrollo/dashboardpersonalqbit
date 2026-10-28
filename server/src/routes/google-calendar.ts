import { Router } from 'express';
import { google } from 'googleapis';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireAdminOrEjecutivo } from '../middleware/auth.js';
import { query, queryOne } from '../db/mysql.js';
import { getAuthedClient, getUserTokenScopes, handleExpiredToken } from '../utils/googleAuth.js';
import { esFaltaDePermiso, permisosGoogle } from '../utils/googlePermisos.js';
import { aEventoCalendario } from '../calendario/eventos.js';

export const googleCalendarRouter = Router();

// Alias for backward compatibility within this file
const handleExpired = handleExpiredToken;

const FALTA_PERMISO_CALENDAR = {
  error: 'Tu cuenta de Google está conectada, pero falta el permiso de Google Calendar. Vuelve a dar permiso.',
  code: 'falta_permiso_calendar',
};

googleCalendarRouter.get('/google-calendar/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const row = await queryOne<{ scope: string | null }>('SELECT scope FROM google_tokens WHERE user_id=?', [req.userId!]);
    const permisos = permisosGoogle(!!row, row?.scope);
    // connected se mantiene por compatibilidad: hay token. calendar dice si se puede leer el calendario.
    res.json({ connected: permisos.conectado, calendar: permisos.calendar, permisos });
  } catch (e) {
    console.error('[GCAL] status error:', e);
    res.status(500).json({ error: 'Error' });
  }
});

googleCalendarRouter.get('/google-calendar/events', requireAuth, async (req: AuthRequest, res) => {
  try {
    const client = await getAuthedClient(req.userId!);
    if (!client) { res.status(401).json({ error: 'Google no conectado' }); return; }
    if (!permisosGoogle(true, await getUserTokenScopes(req.userId!)).calendar) {
      res.status(403).json(FALTA_PERMISO_CALENDAR);
      return;
    }

    const cal = google.calendar({ version: 'v3', auth: client });
    const timeMin = (req.query.start as string) || new Date().toISOString();
    const timeMax = (req.query.end as string) || new Date(Date.now() + 30*24*3600*1000).toISOString();

    const resp = await cal.events.list({
      calendarId: 'primary', timeMin, timeMax,
      maxResults: 250, singleEvents: true, orderBy: 'startTime',
    });

    const events = (resp.data.items || []).map(aEventoCalendario);

    res.json({ events });
  } catch (e) {
    console.error('[GCAL] events error:', (e as Error).message);
    if (esFaltaDePermiso(e)) { res.status(403).json(FALTA_PERMISO_CALENDAR); return; }
    if (await handleExpired(e, req.userId!, res)) return;
    res.status(500).json({ error: 'Error al obtener eventos' });
  }
});

googleCalendarRouter.post('/google-calendar/sync-task/:taskId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const client = await getAuthedClient(req.userId!);
    if (!client) { res.status(401).json({ error: 'Google no conectado' }); return; }

    const taskId = String(req.params.taskId);
    const task = await queryOne<{
      id: string; titulo_tarea: string; detalle: string | null;
      fecha_entrega: Date | null; estado: string; google_event_id: string | null;
    }>('SELECT id, titulo_tarea, detalle, fecha_entrega, estado, google_event_id FROM tasks WHERE id=?', [taskId]);

    if (!task) { res.status(404).json({ error: 'Tarea no encontrada' }); return; }

    const cal = google.calendar({ version: 'v3', auth: client });
    const due = task.fecha_entrega ? new Date(task.fecha_entrega) : new Date(Date.now() + 7*24*3600*1000);
    const s = new Date(due); s.setHours(9, 0, 0, 0);
    const en = new Date(due); en.setHours(10, 0, 0, 0);

    const body = {
      summary: '[Tiusdei] ' + task.titulo_tarea,
      description: task.detalle || 'Tarea de Tiusdei - Estado: ' + task.estado,
      start: { dateTime: s.toISOString(), timeZone: 'America/Guayaquil' },
      end: { dateTime: en.toISOString(), timeZone: 'America/Guayaquil' },
      reminders: { useDefault: false, overrides: [{ method: 'popup' as const, minutes: 60 }] },
    };

    let evId = task.google_event_id;
    if (evId) {
      try {
        await cal.events.update({ calendarId: 'primary', eventId: evId, requestBody: body });
      } catch {
        const cr = await cal.events.insert({ calendarId: 'primary', requestBody: body });
        evId = cr.data.id || null;
      }
    } else {
      const cr = await cal.events.insert({ calendarId: 'primary', requestBody: body });
      evId = cr.data.id || null;
    }

    if (evId) await query('UPDATE tasks SET google_event_id=? WHERE id=?', [evId, taskId]);
    res.json({ success: true, google_event_id: evId });
  } catch (e) {
    console.error('[GCAL] sync error:', (e as Error).message);
    if (await handleExpired(e, req.userId!, res)) return;
    res.status(500).json({ error: 'Error al sincronizar' });
  }
});

googleCalendarRouter.delete('/google-calendar/sync-task/:taskId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const client = await getAuthedClient(req.userId!);
    if (!client) { res.status(401).json({ error: 'Google no conectado' }); return; }

    const taskId = String(req.params.taskId);
    const task = await queryOne<{ id: string; google_event_id: string | null }>(
      'SELECT id, google_event_id FROM tasks WHERE id=?', [taskId]);
    if (!task) { res.status(404).json({ error: 'Tarea no encontrada' }); return; }

    if (task.google_event_id) {
      const cal = google.calendar({ version: 'v3', auth: client });
      try { await cal.events.delete({ calendarId: 'primary', eventId: task.google_event_id }); } catch { /* deleted manually */ }
      await query('UPDATE tasks SET google_event_id=NULL WHERE id=?', [taskId]);
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[GCAL] unsync error:', (e as Error).message);
    if (await handleExpired(e, req.userId!, res)) return;
    res.status(500).json({ error: 'Error al eliminar evento' });
  }
});

googleCalendarRouter.delete('/google-calendar/disconnect', requireAuth, async (req: AuthRequest, res) => {
  try {
    await query('DELETE FROM google_tokens WHERE user_id=?', [req.userId!]);
    res.json({ success: true });
  } catch (e) {
    console.error('[GCAL] disconnect error:', e);
    res.status(500).json({ error: 'Error al desconectar' });
  }
});

// GET /api/data/google-calendar/desk-meetings — reuniones por mesa para la daily
googleCalendarRouter.get('/google-calendar/desk-meetings', requireAuth, async (req: AuthRequest, res) => {
  try {
    // Dynamic role check based on daily_meetings_roles setting
    const currentRole = req.userRole || '';
    const rolesRow = await queryOne<{ value: string | null }>(
      "SELECT value FROM site_settings WHERE `key` = 'daily_meetings_roles'"
    );
    const allowedRoles = (rolesRow?.value || 'admin,ejecutivo').split(',').map(r => r.trim()).filter(Boolean);
    if (!allowedRoles.includes(currentRole)) {
      return res.status(403).json({ error: 'Sin permisos para ver reuniones' });
    }

    const deskId = req.query.desk_id as string | undefined;
    const startDate = req.query.start as string;
    const endDate = req.query.end as string;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Parámetros start y end requeridos' });
    }

    // Obtener miembros de la mesa (o todos si no hay mesa)
    let members: { user_id: string; nombre: string }[];
    if (deskId && deskId !== 'all') {
      members = await query<{ user_id: string; nombre: string }[]>(
        `SELECT dm.user_id, p.nombre FROM desk_members dm
         INNER JOIN profiles p ON p.id = dm.user_id
         WHERE dm.desk_id = ? AND p.activo = 1`,
        [deskId]
      );
    } else {
      members = await query<{ user_id: string; nombre: string }[]>(
        'SELECT id as user_id, nombre FROM profiles WHERE activo = 1'
      );
    }

    // Obtener miembros que tienen Google conectado
    const memberIds = members.map((m) => m.user_id);
    if (memberIds.length === 0) {
      return res.json({ meetings: [] });
    }

    const ph = memberIds.map(() => '?').join(',');
    const connectedTokens = await query<{ user_id: string }[]>(
      `SELECT user_id FROM google_tokens WHERE user_id IN (${ph})`,
      memberIds
    );
    const connectedSet = new Set(connectedTokens.map((t) => t.user_id));

    const timeMin = new Date(startDate + 'T00:00:00').toISOString();
    const timeMax = new Date(endDate + 'T23:59:59').toISOString();

    // Consultar calendario de cada miembro conectado en paralelo
    const results: {
      user_id: string;
      nombre: string;
      connected: boolean;
      total_hours: number;
      events: { summary: string; start: string; end: string; duration_min: number }[];
    }[] = [];

    const promises = members.map(async (member) => {
      if (!connectedSet.has(member.user_id)) {
        results.push({
          user_id: member.user_id,
          nombre: member.nombre,
          connected: false,
          total_hours: 0,
          events: [],
        });
        return;
      }

      try {
        const client = await getAuthedClient(member.user_id);
        if (!client) {
          results.push({ user_id: member.user_id, nombre: member.nombre, connected: false, total_hours: 0, events: [] });
          return;
        }

        const cal = google.calendar({ version: 'v3', auth: client });
        const resp = await cal.events.list({
          calendarId: 'primary',
          timeMin,
          timeMax,
          maxResults: 500,
          singleEvents: true,
          orderBy: 'startTime',
        });

        let totalMinutes = 0;
        const events: { summary: string; start: string; end: string; duration_min: number }[] = [];

        for (const ev of resp.data.items || []) {
          if (ev.status === 'cancelled') continue;
          const evStart = ev.start?.dateTime;
          const evEnd = ev.end?.dateTime;
          if (!evStart || !evEnd) continue; // Ignorar eventos de día completo

          const durationMin = Math.round((new Date(evEnd).getTime() - new Date(evStart).getTime()) / 60000);
          if (durationMin <= 0) continue;

          totalMinutes += durationMin;
          events.push({
            summary: ev.summary || '(Sin título)',
            start: evStart,
            end: evEnd,
            duration_min: durationMin,
          });
        }

        results.push({
          user_id: member.user_id,
          nombre: member.nombre,
          connected: true,
          total_hours: Math.round((totalMinutes / 60) * 100) / 100,
          events,
        });
      } catch (e) {
        console.error(`[GCAL] desk-meetings error for user ${member.user_id}:`, (e as Error).message);
        results.push({ user_id: member.user_id, nombre: member.nombre, connected: true, total_hours: 0, events: [] });
      }
    });

    await Promise.all(promises);

    // Ordenar por horas de reunión (mayor primero)
    results.sort((a, b) => b.total_hours - a.total_hours);

    res.json({ meetings: results });
  } catch (e) {
    console.error('[GCAL] desk-meetings error:', e);
    res.status(500).json({ error: 'Error al obtener reuniones' });
  }
});
