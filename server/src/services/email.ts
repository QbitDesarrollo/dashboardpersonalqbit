import nodemailer from 'nodemailer';

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    console.log(`[EMAIL] Enviado a ${options.to}: ${options.subject}`);
    return true;
  } catch (error) {
    console.error('[EMAIL] Error enviando:', error);
    return false;
  }
}

// Email templates
export function taskAssignmentEmail(data: {
  recipientName: string;
  taskTitle: string;
  brandName: string;
  fechaEntrega: string;
  prioridad: string;
  frontendUrl: string;
}): EmailOptions {
  const priorityColors: Record<string, string> = {
    alta: '#ef4444',
    media: '#f59e0b',
    baja: '#22c55e',
  };
  const priorityColor = priorityColors[data.prioridad] || '#6b7280';

  return {
    to: '', // Set by caller
    subject: `Nueva tarea asignada: ${data.taskTitle}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f1419; color: #f7f8fc; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #42a968, #2d8a4e); padding: 24px 32px;">
          <h1 style="margin: 0; font-size: 20px; color: white;">TIUSDEI Portal</h1>
        </div>
        <div style="padding: 32px;">
          <p style="margin: 0 0 16px; color: #a0a8b4;">Hola <strong style="color: #f7f8fc;">${data.recipientName}</strong>,</p>
          <p style="margin: 0 0 24px; color: #a0a8b4;">Se te ha asignado una nueva tarea:</p>

          <div style="background: #1a2029; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 12px; font-size: 18px; color: #f7f8fc;">${data.taskTitle}</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Marca</td>
                <td style="padding: 6px 0; color: #f7f8fc; font-size: 14px; text-align: right;">${data.brandName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Fecha de entrega</td>
                <td style="padding: 6px 0; color: #f7f8fc; font-size: 14px; text-align: right;">${new Date(data.fechaEntrega).toLocaleDateString('es-ES')}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Prioridad</td>
                <td style="padding: 6px 0; font-size: 14px; text-align: right;">
                  <span style="background: ${priorityColor}; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">${data.prioridad.toUpperCase()}</span>
                </td>
              </tr>
            </table>
          </div>

          <a href="${data.frontendUrl}/tareas" style="display: inline-block; background: #42a968; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Ver Tarea
          </a>
        </div>
        <div style="padding: 16px 32px; background: #1a2029; text-align: center;">
          <p style="margin: 0; color: #6b7280; font-size: 12px;">Este es un mensaje automático de TIUSDEI Portal</p>
        </div>
      </div>
    `,
    text: `Hola ${data.recipientName}, se te ha asignado la tarea "${data.taskTitle}" para la marca ${data.brandName}. Fecha de entrega: ${data.fechaEntrega}. Prioridad: ${data.prioridad}.`,
  };
}

export function taskStatusChangeEmail(data: {
  recipientName: string;
  taskTitle: string;
  oldStatus: string;
  newStatus: string;
  frontendUrl: string;
}): EmailOptions {
  const statusLabels: Record<string, string> = {
    backlog: 'Backlog',
    en_proceso: 'En Proceso',
    en_revision: 'En Revisión',
    aprobado: 'Aprobado',
    entregado: 'Entregado',
    bloqueado: 'Bloqueado',
  };

  return {
    to: '',
    subject: `Tarea actualizada: ${data.taskTitle}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f1419; color: #f7f8fc; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #42a968, #2d8a4e); padding: 24px 32px;">
          <h1 style="margin: 0; font-size: 20px; color: white;">TIUSDEI Portal</h1>
        </div>
        <div style="padding: 32px;">
          <p style="margin: 0 0 16px; color: #a0a8b4;">Hola <strong style="color: #f7f8fc;">${data.recipientName}</strong>,</p>
          <p style="margin: 0 0 24px; color: #a0a8b4;">La tarea <strong>"${data.taskTitle}"</strong> cambió de estado:</p>

          <div style="text-align: center; padding: 20px;">
            <span style="background: #374151; color: #f7f8fc; padding: 6px 16px; border-radius: 20px; font-size: 14px;">${statusLabels[data.oldStatus] || data.oldStatus}</span>
            <span style="color: #42a968; margin: 0 12px; font-size: 20px;">→</span>
            <span style="background: #42a968; color: white; padding: 6px 16px; border-radius: 20px; font-size: 14px;">${statusLabels[data.newStatus] || data.newStatus}</span>
          </div>

          <div style="text-align: center; margin-top: 24px;">
            <a href="${data.frontendUrl}/tareas" style="display: inline-block; background: #42a968; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Ver Tarea
            </a>
          </div>
        </div>
        <div style="padding: 16px 32px; background: #1a2029; text-align: center;">
          <p style="margin: 0; color: #6b7280; font-size: 12px;">Este es un mensaje automático de TIUSDEI Portal</p>
        </div>
      </div>
    `,
    text: `Hola ${data.recipientName}, la tarea "${data.taskTitle}" cambió de estado: ${statusLabels[data.oldStatus] || data.oldStatus} → ${statusLabels[data.newStatus] || data.newStatus}.`,
  };
}

export function deliverableApprovedEmail(data: {
  recipientName: string;
  taskTitle: string;
  deliverableVersion: string;
  frontendUrl: string;
}): EmailOptions {
  return {
    to: '',
    subject: `Entregable aprobado: ${data.taskTitle}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f1419; color: #f7f8fc; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #42a968, #2d8a4e); padding: 24px 32px;">
          <h1 style="margin: 0; font-size: 20px; color: white;">TIUSDEI Portal</h1>
        </div>
        <div style="padding: 32px;">
          <p style="margin: 0 0 16px; color: #a0a8b4;">Hola <strong style="color: #f7f8fc;">${data.recipientName}</strong>,</p>
          <p style="margin: 0 0 24px; color: #a0a8b4;">El entregable versión <strong>${data.deliverableVersion}</strong> de la tarea <strong>"${data.taskTitle}"</strong> ha sido aprobado.</p>

          <div style="text-align: center; margin: 24px 0;">
            <div style="display: inline-block; background: #22c55e20; border: 2px solid #22c55e; border-radius: 50%; padding: 20px;">
              <span style="font-size: 40px;">✓</span>
            </div>
          </div>

          <div style="text-align: center;">
            <a href="${data.frontendUrl}/entregables" style="display: inline-block; background: #42a968; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Ver Entregable
            </a>
          </div>
        </div>
        <div style="padding: 16px 32px; background: #1a2029; text-align: center;">
          <p style="margin: 0; color: #6b7280; font-size: 12px;">Este es un mensaje automático de TIUSDEI Portal</p>
        </div>
      </div>
    `,
    text: `Hola ${data.recipientName}, el entregable v${data.deliverableVersion} de "${data.taskTitle}" fue aprobado.`,
  };
}
