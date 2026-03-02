import nodemailer from 'nodemailer';
import { query } from '../db/mysql.js';

const DEFAULT_FROM = process.env.SMTP_FROM || '"TIUSDEI" <qbitdashboard@gmail.com>';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'qbitdashboard@gmail.com',
    pass: process.env.SMTP_PASS,
  },
});

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: options.from || DEFAULT_FROM,
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

function formatDateLong(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function linkify(text: string): string {
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  return text.replace(urlRegex, (url) => `<a href="${url}" style="color: #2563eb; text-decoration: underline;">${url}</a>`);
}

const DEFAULT_LOGO_HTML = `
  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
    <div style="display: flex; gap: 2px;">
      <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #22c55e;"></span>
      <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #eab308;"></span>
      <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #f97316;"></span>
    </div>
    <span style="font-weight: 700; font-size: 18px; color: #000;">Tiusdei</span>
  </div>
`;

const DEFAULT_FOOTER = 'TIUSDEI Portal · Notificación automática';

async function getEmailBranding(): Promise<{ logoHtml: string; footerText: string; siteName: string }> {
  try {
    const rows = await query<{ key: string; value: string | null }[]>('SELECT `key`, value FROM site_settings');
    const map: Record<string, string | null> = {};
    for (const r of rows) map[r.key] = r.value;

    const logoEmailUrl = map.logo_email_url;
    const siteName = map.site_name || 'TIUSDEI';
    const footerText = map.email_footer_text || DEFAULT_FOOTER;

    let logoHtml = DEFAULT_LOGO_HTML;
    if (logoEmailUrl) {
      logoHtml = `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;"><img src="${logoEmailUrl}" alt="${siteName}" style="max-height: 40px; max-width: 160px;" /><span style="font-weight: 700; font-size: 18px; color: #000;">${siteName}</span></div>`;
    } else {
      logoHtml = DEFAULT_LOGO_HTML.replace('Tiusdei', siteName);
    }

    return { logoHtml, footerText, siteName };
  } catch {
    return {
      logoHtml: DEFAULT_LOGO_HTML,
      footerText: DEFAULT_FOOTER,
      siteName: 'TIUSDEI',
    };
  }
}

export async function taskAssignmentEmail(data: {
  recipientName: string;
  taskTitle: string;
  brandName: string;
  detalle?: string;
  fechaInicio?: string | null;
  fechaEntrega: string;
  prioridad: string;
  archivosAdjuntos?: string[];
  frontendUrl: string;
  taskId?: string;
}): Promise<EmailOptions> {
  const priorityLabels: Record<string, string> = {
    alta: 'Urgente',
    media: 'Media',
    baja: 'Baja',
  };
  const priorityColors: Record<string, string> = {
    alta: '#dc2626',
    media: '#d97706',
    baja: '#16a34a',
  };
  const prioridadLabel = priorityLabels[data.prioridad?.toLowerCase()] || data.prioridad || 'Media';
  const prioridadColor = priorityColors[data.prioridad?.toLowerCase()] || '#6b7280';

  const detalleHtml = data.detalle ? linkify(data.detalle.replace(/\n/g, '<br>')) : '-';
  const archivosHtml = (data.archivosAdjuntos && data.archivosAdjuntos.length > 0)
    ? data.archivosAdjuntos.map((u) => `<a href="${u}" style="color: #2563eb;">${u}</a>`).join('<br>')
    : '-';
  const fechaInicioStr = data.fechaInicio ? formatDateLong(data.fechaInicio) : '-';
  const { logoHtml, footerText, siteName } = await getEmailBranding();

  return {
    to: '',
    subject: `Nueva Tarea Asignada: ${data.taskTitle}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; color: #111;">
        <div style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
          ${logoHtml}
          <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #2563eb;">Nueva Tarea Asignada</h1>
        </div>
        <div style="padding: 24px 32px;">
          <p style="margin: 0 0 8px; font-size: 15px; color: #111;">Hola <strong>${data.recipientName}</strong>,</p>
          <p style="margin: 0 0 20px; font-size: 14px; color: #374151;">Se te ha asignado una nueva tarea. Aquí están los detalles:</p>

          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 10px 0; vertical-align: top; font-weight: 700; color: #111; width: 140px;">Marca</td>
              <td style="padding: 10px 0; color: #374151;">${data.brandName}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; vertical-align: top; font-weight: 700; color: #111;">Tarea</td>
              <td style="padding: 10px 0; color: #374151;">${data.taskTitle}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; vertical-align: top; font-weight: 700; color: #111;">Detalle de Tarea</td>
              <td style="padding: 10px 0; color: #374151; line-height: 1.5;">${detalleHtml}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; vertical-align: top; font-weight: 700; color: #111;">Archivos Adjuntos</td>
              <td style="padding: 10px 0; color: #374151;">${archivosHtml}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; vertical-align: top; font-weight: 700; color: #111;">Prioridad</td>
              <td style="padding: 10px 0;">
                <span style="display: inline-block; background: ${prioridadColor}; color: white; padding: 4px 12px; border-radius: 16px; font-size: 12px; font-weight: 600;">${prioridadLabel}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0; vertical-align: top; font-weight: 700; color: #111;">Fecha de Ingreso</td>
              <td style="padding: 10px 0; color: #374151;">${fechaInicioStr}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; vertical-align: top; font-weight: 700; color: #111;">Deadline</td>
              <td style="padding: 10px 0; color: #374151; font-weight: 600;">${formatDateLong(data.fechaEntrega)}</td>
            </tr>
          </table>

          <p style="margin: 24px 0 0; font-size: 14px; color: #374151;">Por favor, revisa los detalles y actualiza el estado en la plataforma.</p>
          <a href="${data.frontendUrl}/tareas${data.taskId ? `?task=${data.taskId}` : ''}" style="display: inline-block; margin-top: 16px; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Ver tarea en ${siteName}</a>
        </div>
        <div style="padding: 16px 32px; background: #f9fafb; text-align: center; font-size: 12px; color: #6b7280;">
          ${footerText}
        </div>
      </div>
    `,
    text: `Hola ${data.recipientName}, se te ha asignado la tarea "${data.taskTitle}" (${data.brandName}). Fecha de entrega: ${data.fechaEntrega}. Prioridad: ${prioridadLabel}.`,
  };
}

export async function deadlineWarningEmail(data: {
  recipientName: string;
  taskTitle: string;
  brandName: string;
  fechaEntrega: string;
  diasRestantes: number;
  prioridad: string;
  frontendUrl: string;
  taskId?: string;
}): Promise<EmailOptions> {
  const priorityLabels: Record<string, string> = { alta: 'Urgente', media: 'Media', baja: 'Baja' };
  const priorityColors: Record<string, string> = { alta: '#dc2626', media: '#d97706', baja: '#16a34a' };
  const prioridadLabel = priorityLabels[data.prioridad?.toLowerCase()] || data.prioridad || 'Media';
  const prioridadColor = priorityColors[data.prioridad?.toLowerCase()] || '#6b7280';
  const { logoHtml, footerText, siteName } = await getEmailBranding();

  return {
    to: '',
    subject: `⏰ Aviso: Deadline próximo - ${data.taskTitle}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; color: #111;">
        <div style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
          ${logoHtml}
          <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #d97706;">Aviso de fecha de entrega</h1>
        </div>
        <div style="padding: 24px 32px;">
          <p style="margin: 0 0 8px; font-size: 15px; color: #111;">Hola <strong>${data.recipientName}</strong>,</p>
          <p style="margin: 0 0 20px; font-size: 14px; color: #374151;">La tarea <strong>"${data.taskTitle}"</strong> vence en <strong>${data.diasRestantes} día${data.diasRestantes === 1 ? '' : 's'}</strong>.</p>

          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 10px 0; font-weight: 700; color: #111; width: 140px;">Tarea</td>
              <td style="padding: 10px 0; color: #374151;">${data.taskTitle}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; font-weight: 700; color: #111;">Marca</td>
              <td style="padding: 10px 0; color: #374151;">${data.brandName}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; font-weight: 700; color: #111;">Deadline</td>
              <td style="padding: 10px 0; color: #374151; font-weight: 600;">${formatDateLong(data.fechaEntrega)}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; font-weight: 700; color: #111;">Prioridad</td>
              <td style="padding: 10px 0;">
                <span style="display: inline-block; background: ${prioridadColor}; color: white; padding: 4px 12px; border-radius: 16px; font-size: 12px; font-weight: 600;">${prioridadLabel}</span>
              </td>
            </tr>
          </table>

          <p style="margin: 24px 0 0; font-size: 14px; color: #374151;">Por favor, revisa el progreso y actualiza el estado antes del vencimiento.</p>
          <a href="${data.frontendUrl}/tareas${data.taskId ? `?task=${data.taskId}` : ''}" style="display: inline-block; margin-top: 16px; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Ver tarea en ${siteName}</a>
        </div>
        <div style="padding: 16px 32px; background: #f9fafb; text-align: center; font-size: 12px; color: #6b7280;">
          ${footerText}
        </div>
      </div>
    `,
    text: `Hola ${data.recipientName}, la tarea "${data.taskTitle}" vence en ${data.diasRestantes} día(s). Deadline: ${data.fechaEntrega}.`,
  };
}

export async function taskStatusChangeEmail(data: {
  recipientName: string;
  taskTitle: string;
  oldStatus: string;
  newStatus: string;
  frontendUrl: string;
  taskId?: string;
}): Promise<EmailOptions> {
  const statusLabels: Record<string, string> = {
    backlog: 'Backlog',
    en_proceso: 'En Proceso',
    en_revision: 'En Revisión',
    aprobado: 'Aprobado',
    entregado: 'Entregado',
    bloqueado: 'Bloqueado',
  };

  const { logoHtml, footerText, siteName } = await getEmailBranding();

  return {
    to: '',
    subject: `Cambio de estado: ${data.taskTitle}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; color: #111;">
        <div style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
          ${logoHtml}
          <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #2563eb;">Cambio de estado de tarea</h1>
        </div>
        <div style="padding: 24px 32px;">
          <p style="margin: 0 0 8px; font-size: 15px; color: #111;">Hola <strong>${data.recipientName}</strong>,</p>
          <p style="margin: 0 0 20px; font-size: 14px; color: #374151;">La tarea <strong>"${data.taskTitle}"</strong> cambió de estado:</p>

          <div style="display: flex; align-items: center; gap: 12px; margin: 20px 0;">
            <span style="background: #e5e7eb; color: #374151; padding: 6px 14px; border-radius: 20px; font-size: 14px;">${statusLabels[data.oldStatus] || data.oldStatus}</span>
            <span style="color: #6b7280;">→</span>
            <span style="background: #2563eb; color: white; padding: 6px 14px; border-radius: 20px; font-size: 14px; font-weight: 600;">${statusLabels[data.newStatus] || data.newStatus}</span>
          </div>

          <a href="${data.frontendUrl}/tareas${data.taskId ? `?task=${data.taskId}` : ''}" style="display: inline-block; margin-top: 8px; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Ver tarea en ${siteName}</a>
        </div>
        <div style="padding: 16px 32px; background: #f9fafb; text-align: center; font-size: 12px; color: #6b7280;">
          ${footerText}
        </div>
      </div>
    `,
    text: `Hola ${data.recipientName}, la tarea "${data.taskTitle}" cambió: ${statusLabels[data.oldStatus] || data.oldStatus} → ${statusLabels[data.newStatus] || data.newStatus}.`,
  };
}

export async function deliverableApprovedEmail(data: {
  recipientName: string;
  taskTitle: string;
  deliverableVersion: string;
  frontendUrl: string;
}): Promise<EmailOptions> {
  const { logoHtml, footerText, siteName } = await getEmailBranding();

  return {
    to: '',
    subject: `Entregable aprobado: ${data.taskTitle}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; color: #111;">
        <div style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
          ${logoHtml}
          <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #16a34a;">Entregable aprobado</h1>
        </div>
        <div style="padding: 24px 32px;">
          <p style="margin: 0 0 8px; font-size: 15px; color: #111;">Hola <strong>${data.recipientName}</strong>,</p>
          <p style="margin: 0 0 20px; font-size: 14px; color: #374151;">El entregable versión <strong>${data.deliverableVersion}</strong> de la tarea <strong>"${data.taskTitle}"</strong> ha sido aprobado.</p>
          <div style="display: inline-block; background: #dcfce7; border: 2px solid #16a34a; border-radius: 50%; padding: 16px; margin: 8px 0;">
            <span style="font-size: 28px; color: #16a34a;">✓</span>
          </div>
          <a href="${data.frontendUrl}/entregables" style="display: inline-block; margin-top: 16px; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Ver entregables</a>
        </div>
        <div style="padding: 16px 32px; background: #f9fafb; text-align: center; font-size: 12px; color: #6b7280;">
          ${footerText}
        </div>
      </div>
    `,
    text: `Hola ${data.recipientName}, el entregable v${data.deliverableVersion} de "${data.taskTitle}" fue aprobado.`,
  };
}
