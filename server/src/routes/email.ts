import express, { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne } from '../db/mysql.js';
import {
  sendEmail,
  taskAssignmentEmail,
  taskStatusChangeEmail,
  deliverableApprovedEmail,
  deadlineWarningEmail,
} from '../services/email.js';

export const emailRouter = Router();

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';

// Schema for task notification
const taskNotificationSchema = z.object({
  taskId: z.string().optional(),
  taskTitle: z.string(),
  brandName: z.string(),
  fechaEntrega: z.string(),
  prioridad: z.string(),
  recipientEmail: z.string().email(),
  recipientName: z.string(),
  detalle: z.string().optional(),
  fechaInicio: z.string().nullable().optional(),
  archivosAdjuntos: z.array(z.string()).optional(),
});

// Schema for status change notification
const statusChangeSchema = z.object({
  taskId: z.string().uuid(),
  taskTitle: z.string(),
  oldStatus: z.string(),
  newStatus: z.string(),
  recipientUserId: z.string().uuid(),
});

// Schema for deliverable approval notification
const deliverableApprovalSchema = z.object({
  taskId: z.string().uuid(),
  taskTitle: z.string(),
  deliverableVersion: z.string(),
  recipientUserId: z.string().uuid(),
});

/**
 * POST /api/email/task-notification
 * Send email when a task is assigned to someone
 */
emailRouter.post('/task-notification', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = taskNotificationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
      return;
    }

    const data = parsed.data;
    const emailData = await taskAssignmentEmail({
      recipientName: data.recipientName,
      taskTitle: data.taskTitle,
      brandName: data.brandName,
      fechaEntrega: data.fechaEntrega,
      prioridad: data.prioridad,
      detalle: data.detalle,
      fechaInicio: data.fechaInicio,
      archivosAdjuntos: data.archivosAdjuntos,
      frontendUrl,
      taskId: data.taskId,
    });
    emailData.to = data.recipientEmail;

    const sent = await sendEmail(emailData);

    if (sent) {
      res.json({ success: true, message: 'Notificación enviada' });
    } else {
      res.status(500).json({ error: 'Error al enviar el email' });
    }
  } catch (error) {
    console.error('[EMAIL] Error en task-notification:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /api/email/status-change
 * Send email when a task status changes
 */
emailRouter.post('/status-change', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = statusChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
      return;
    }

    const data = parsed.data;

    const profile = await queryOne<{ email: string; nombre: string }>(
      'SELECT email, nombre FROM profiles WHERE id = ?',
      [data.recipientUserId]
    );

    if (!profile?.email) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const emailData = await taskStatusChangeEmail({
      recipientName: profile.nombre,
      taskTitle: data.taskTitle,
      oldStatus: data.oldStatus,
      newStatus: data.newStatus,
      frontendUrl,
      taskId: data.taskId,
    });
    emailData.to = profile.email;

    const sent = await sendEmail(emailData);
    res.json({ success: sent, message: sent ? 'Email enviado' : 'Error al enviar' });
  } catch (error) {
    console.error('[EMAIL] Error en status-change:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /api/email/deliverable-approved
 * Send email when a deliverable is approved
 */
emailRouter.post('/deliverable-approved', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = deliverableApprovalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
      return;
    }

    const data = parsed.data;

    const profile = await queryOne<{ email: string; nombre: string }>(
      'SELECT email, nombre FROM profiles WHERE id = ?',
      [data.recipientUserId]
    );

    if (!profile?.email) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const emailData = await deliverableApprovedEmail({
      recipientName: profile.nombre,
      taskTitle: data.taskTitle,
      deliverableVersion: data.deliverableVersion,
      frontendUrl,
    });
    emailData.to = profile.email;

    const sent = await sendEmail(emailData);
    res.json({ success: sent, message: sent ? 'Email enviado' : 'Error al enviar' });
  } catch (error) {
    console.error('[EMAIL] Error en deliverable-approved:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

async function cronOrAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return next();
  return requireAuth(req as AuthRequest, res, next);
}

/**
 * POST /api/email/deadline-warning
 * Envía avisos a responsables de tareas que vencen en los próximos días.
 * Llamar con: Authorization: Bearer <CRON_SECRET> (cron) o sesión admin.
 */
emailRouter.post('/deadline-warning', cronOrAuth, async (req, res) => {
  try {

    const diasAntelacion = parseInt(String(req.body?.dias || req.query?.dias), 10) || 2;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hasta = new Date(hoy);
    hasta.setDate(hasta.getDate() + diasAntelacion);
    hasta.setHours(23, 59, 59, 999);
    const hoyStr = hoy.toISOString().slice(0, 10);
    const hastaStr = hasta.toISOString().slice(0, 10);

    const rows = await query<any[]>(
      `SELECT t.id, t.titulo_tarea, t.fecha_entrega, t.prioridad, t.responsable_user_id,
              b.nombre as brand_nombre, p.email as resp_email, p.nombre as resp_nombre
       FROM tasks t
       LEFT JOIN brands b ON b.id = t.brand_id
       LEFT JOIN profiles p ON p.id = t.responsable_user_id
       WHERE t.fecha_entrega BETWEEN ? AND ?
         AND t.responsable_user_id IS NOT NULL
         AND p.email IS NOT NULL AND p.email != ''
         AND t.estado NOT IN ('entregado', 'aprobado')`,
      [hoyStr, hastaStr]
    );

    let enviados = 0;
    for (const row of rows) {
      const diasRestantes = Math.ceil((new Date(row.fecha_entrega).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      const emailData = await deadlineWarningEmail({
        recipientName: row.resp_nombre || 'Responsable',
        taskTitle: row.titulo_tarea,
        brandName: row.brand_nombre || 'Sin marca',
        fechaEntrega: row.fecha_entrega,
        diasRestantes,
        prioridad: row.prioridad || 'media',
        frontendUrl,
      });
      emailData.to = row.resp_email;
      const ok = await sendEmail(emailData);
      if (ok) enviados++;
    }

    res.json({ success: true, enviados, total: rows.length });
  } catch (error) {
    console.error('[EMAIL] Error en deadline-warning:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});
