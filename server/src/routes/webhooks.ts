import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';
import { sendEmail } from '../services/email.js';

export const webhooksRouter = Router();

/**
 * Verify webhook signature (HMAC-SHA256)
 */
function verifyWebhookSignature(payload: string, signature: string): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return false;

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSig)
  );
}

/**
 * POST /api/webhooks/supabase
 * Receive database change webhooks from Supabase (Database Webhooks)
 * Used to trigger email notifications on task/deliverable changes
 */
webhooksRouter.post('/supabase', async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'] as string;

    // If webhook secret is configured, verify signature
    if (process.env.WEBHOOK_SECRET && signature) {
      const isValid = verifyWebhookSignature(JSON.stringify(req.body), signature);
      if (!isValid) {
        res.status(401).json({ error: 'Firma inválida' });
        return;
      }
    }

    const { type, table, record, old_record } = req.body;

    switch (table) {
      case 'tasks':
        await handleTaskWebhook(type, record, old_record);
        break;
      case 'deliverables':
        await handleDeliverableWebhook(type, record, old_record);
        break;
      case 'comments':
        await handleCommentWebhook(type, record);
        break;
      default:
        console.log(`[WEBHOOK] Tabla no manejada: ${table}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[WEBHOOK] Error procesando:', error);
    res.status(500).json({ error: 'Error procesando webhook' });
  }
});

async function handleTaskWebhook(type: string, record: any, oldRecord: any) {
  if (type === 'INSERT' && record.responsable_user_id) {
    // New task assigned - create notification
    await createNotification(
      record.responsable_user_id,
      `Se te asignó la tarea: ${record.titulo_tarea}`,
      record.id
    );
  }

  if (type === 'UPDATE' && oldRecord) {
    // Status changed
    if (oldRecord.estado !== record.estado && record.responsable_user_id) {
      await createNotification(
        record.responsable_user_id,
        `La tarea "${record.titulo_tarea}" cambió a ${record.estado}`,
        record.id
      );
    }

    // Reassigned
    if (oldRecord.responsable_user_id !== record.responsable_user_id && record.responsable_user_id) {
      await createNotification(
        record.responsable_user_id,
        `Se te asignó la tarea: ${record.titulo_tarea}`,
        record.id
      );
    }
  }
}

async function handleDeliverableWebhook(type: string, record: any, oldRecord: any) {
  if (type === 'UPDATE' && oldRecord) {
    // Deliverable approved
    if (oldRecord.estado !== 'aprobado' && record.estado === 'aprobado') {
      // Get task to find responsible user
      const { data: task } = await supabaseAdmin
        .from('tasks')
        .select('titulo_tarea, responsable_user_id')
        .eq('id', record.task_id)
        .single();

      if (task?.responsable_user_id) {
        await createNotification(
          task.responsable_user_id,
          `Entregable aprobado para: ${task.titulo_tarea}`,
          record.task_id
        );
      }
    }
  }
}

async function handleCommentWebhook(type: string, record: any) {
  if (type === 'INSERT') {
    // New comment - notify task responsible
    const { data: task } = await supabaseAdmin
      .from('tasks')
      .select('titulo_tarea, responsable_user_id')
      .eq('id', record.task_id)
      .single();

    if (task?.responsable_user_id && task.responsable_user_id !== record.user_id) {
      await createNotification(
        task.responsable_user_id,
        `Nuevo comentario en: ${task.titulo_tarea}`,
        record.task_id
      );
    }
  }
}

async function createNotification(userId: string, mensaje: string, taskId?: string) {
  try {
    await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: userId,
        mensaje,
        task_id: taskId || null,
      });
    console.log(`[NOTIFICATION] Creada para usuario ${userId}: ${mensaje}`);
  } catch (error) {
    console.error('[NOTIFICATION] Error creando:', error);
  }
}

/**
 * POST /api/webhooks/external
 * Generic endpoint for external services to trigger actions.
 * Requires API auth. Can be used for Zapier, Make, n8n, etc.
 */
const externalWebhookSchema = z.object({
  action: z.enum(['notify_user', 'send_email', 'update_task_status']),
  payload: z.record(z.unknown()),
});

webhooksRouter.post('/external', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = externalWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
      return;
    }

    const { action, payload } = parsed.data;

    switch (action) {
      case 'notify_user': {
        const { userId, message, taskId } = payload as any;
        if (!userId || !message) {
          res.status(400).json({ error: 'userId y message son requeridos' });
          return;
        }
        await createNotification(userId, message, taskId);
        res.json({ success: true });
        break;
      }

      case 'send_email': {
        const { to, subject, html, text } = payload as any;
        if (!to || !subject || !html) {
          res.status(400).json({ error: 'to, subject, y html son requeridos' });
          return;
        }
        const sent = await sendEmail({ to, subject, html, text });
        res.json({ success: sent });
        break;
      }

      case 'update_task_status': {
        const { taskId, status } = payload as any;
        const validStatuses = ['backlog', 'en_proceso', 'en_revision', 'aprobado', 'entregado', 'bloqueado'];
        if (!taskId || !validStatuses.includes(status)) {
          res.status(400).json({ error: 'taskId y status válido son requeridos' });
          return;
        }

        const { error } = await supabaseAdmin
          .from('tasks')
          .update({ estado: status })
          .eq('id', taskId);

        if (error) throw error;
        res.json({ success: true });
        break;
      }

      default:
        res.status(400).json({ error: `Acción no soportada: ${action}` });
    }
  } catch (error) {
    console.error('[WEBHOOK] Error en external:', error);
    res.status(500).json({ error: 'Error procesando webhook' });
  }
});
