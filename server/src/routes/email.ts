import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';
import {
  sendEmail,
  taskAssignmentEmail,
  taskStatusChangeEmail,
  deliverableApprovedEmail,
} from '../services/email.js';

export const emailRouter = Router();

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';

// Schema for task notification
const taskNotificationSchema = z.object({
  taskTitle: z.string(),
  brandName: z.string(),
  fechaEntrega: z.string(),
  prioridad: z.string(),
  recipientEmail: z.string().email(),
  recipientName: z.string(),
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
    const emailData = taskAssignmentEmail({
      recipientName: data.recipientName,
      taskTitle: data.taskTitle,
      brandName: data.brandName,
      fechaEntrega: data.fechaEntrega,
      prioridad: data.prioridad,
      frontendUrl,
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

    // Get recipient email from profiles
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email, nombre')
      .eq('id', data.recipientUserId)
      .single();

    if (!profile?.email) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const emailData = taskStatusChangeEmail({
      recipientName: profile.nombre,
      taskTitle: data.taskTitle,
      oldStatus: data.oldStatus,
      newStatus: data.newStatus,
      frontendUrl,
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

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email, nombre')
      .eq('id', data.recipientUserId)
      .single();

    if (!profile?.email) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const emailData = deliverableApprovedEmail({
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
