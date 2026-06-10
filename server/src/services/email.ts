/**
 * Servicio de email para Tiusdei.
 *
 * Todos los emails pasan por `sendEmail()` que primero intenta Mailgun y
 * después cae a SMTP (Gmail u otro). Cada template usa el layout unificado
 * de `emailLayout.ts` para garantizar look & feel consistentes.
 */

import nodemailer from 'nodemailer';
import { renderEmail, AccentColor } from './emailLayout.js';

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

// --- Mailgun HTTP API (sin dependencia npm) ---
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const MAILGUN_FROM = process.env.MAILGUN_FROM || DEFAULT_FROM;
const MAILGUN_BASE = process.env.MAILGUN_REGION === 'eu'
  ? 'https://api.eu.mailgun.net/v3'
  : 'https://api.mailgun.net/v3';

async function sendViaMailgun(options: EmailOptions): Promise<boolean> {
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) return false;
  try {
    const form = new URLSearchParams();
    form.append('from', options.from || MAILGUN_FROM);
    form.append('to', options.to);
    form.append('subject', options.subject);
    form.append('html', options.html);
    if (options.text) form.append('text', options.text);
    // Tracking: useful in production, no harm in disabling later
    form.append('o:tracking-clicks', 'htmlonly');
    form.append('o:tracking-opens', 'yes');

    const auth = Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64');
    const resp = await fetch(`${MAILGUN_BASE}/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => '');
      console.error(`[EMAIL][mailgun] fallo ${resp.status}: ${bodyText.slice(0, 300)}`);
      return false;
    }
    console.log(`[EMAIL][mailgun] Enviado a ${options.to}: ${options.subject}`);
    return true;
  } catch (error) {
    console.error('[EMAIL][mailgun] Error enviando:', error);
    return false;
  }
}

async function sendViaSmtp(options: EmailOptions): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: options.from || DEFAULT_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    console.log(`[EMAIL][smtp] Enviado a ${options.to}: ${options.subject}`);
    return true;
  } catch (error) {
    console.error('[EMAIL][smtp] Error enviando:', error);
    return false;
  }
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (MAILGUN_API_KEY && MAILGUN_DOMAIN) {
    const ok = await sendViaMailgun(options);
    if (ok) return true;
    console.warn('[EMAIL] Mailgun falló — intentando fallback SMTP');
  }
  return sendViaSmtp(options);
}

// ========== Helpers ==========

function formatDateLong(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function priorityBadge(prioridad: string): string {
  const labels: Record<string, string> = { alta: 'Urgente', media: 'Media', baja: 'Baja' };
  const colors: Record<string, string> = { alta: '#dc2626', media: '#d97706', baja: '#16a34a' };
  const label = labels[prioridad?.toLowerCase()] || prioridad || 'Media';
  const color = colors[prioridad?.toLowerCase()] || '#6b7280';
  return `<span style="display:inline-block;background:${color};color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;">${label}</span>`;
}

function statusBadge(estado: string): string {
  const labels: Record<string, string> = {
    backlog: 'Pendiente', en_proceso: 'En proceso', en_revision: 'En revisión', revision_interna: 'Revisión interna', revision_cliente: 'Revisión cliente',
    aprobado: 'Aprobado', entregado: 'Entregado', bloqueado: 'Bloqueado',
  };
  const colors: Record<string, string> = {
    backlog: '#6b7280', en_proceso: '#2563eb', en_revision: '#d97706', revision_interna: '#d97706', revision_cliente: '#7c3aed',
    aprobado: '#16a34a', entregado: '#059669', bloqueado: '#dc2626',
  };
  const label = labels[estado] || estado;
  const color = colors[estado] || '#6b7280';
  return `<span style="display:inline-block;background:${color};color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;">${label}</span>`;
}

function taskUrl(frontendUrl: string, taskId?: string): string {
  return taskId ? `${frontendUrl}/tareas?task=${taskId}` : `${frontendUrl}/tareas`;
}

// ========== Templates ==========

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
  const archivosHtml = (data.archivosAdjuntos && data.archivosAdjuntos.length > 0)
    ? data.archivosAdjuntos.map((u) => `<a href="${u}" style="color:#2563eb;text-decoration:underline;word-break:break-all;">${u}</a>`).join('<br>')
    : '<span style="color:#9ca3af;">Sin archivos</span>';

  const detalleHtml = data.detalle
    ? data.detalle.replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#2563eb;">$1</a>')
    : '<span style="color:#9ca3af;">Sin detalle</span>';

  const { html, text } = await renderEmail({
    accent: 'blue',
    preheader: 'Nueva tarea asignada',
    headline: data.taskTitle,
    greeting: `Hola ${data.recipientName},`,
    intro: `Te asignaron una nueva tarea de la marca <strong>${escapeHtml(data.brandName)}</strong>. Revisa los detalles a continuación.`,
    details: [
      { label: 'Marca', value: escapeHtml(data.brandName) },
      { label: 'Detalle', value: detalleHtml },
      { label: 'Archivos', value: archivosHtml },
      { label: 'Prioridad', value: priorityBadge(data.prioridad) },
      { label: 'Inicio', value: data.fechaInicio ? formatDateLong(data.fechaInicio) : '<span style="color:#9ca3af;">No definido</span>' },
      { label: 'Deadline', value: formatDateLong(data.fechaEntrega), highlight: true },
    ],
    cta: { text: 'Ver tarea en Tiusdei', url: taskUrl(data.frontendUrl, data.taskId) },
    footer: 'Por favor, revisa los detalles y actualiza el estado en la plataforma.',
  });

  return {
    to: '',
    subject: `📋 Nueva tarea: ${data.taskTitle}`,
    html,
    text,
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
  const dayLabel = data.diasRestantes === 0 ? 'hoy' : data.diasRestantes === 1 ? 'mañana' : `en ${data.diasRestantes} días`;
  const accent: AccentColor = data.diasRestantes <= 1 ? 'red' : 'amber';

  const { html, text } = await renderEmail({
    accent,
    preheader: 'Deadline próximo',
    headline: `Vence ${dayLabel}`,
    greeting: `Hola ${data.recipientName},`,
    intro: `La tarea <strong>"${escapeHtml(data.taskTitle)}"</strong> vence <strong>${dayLabel}</strong>. Te recomendamos revisar el progreso y actualizar el estado lo antes posible.`,
    details: [
      { label: 'Tarea', value: escapeHtml(data.taskTitle) },
      { label: 'Marca', value: escapeHtml(data.brandName) },
      { label: 'Deadline', value: formatDateLong(data.fechaEntrega), highlight: true },
      { label: 'Días restantes', value: String(data.diasRestantes) },
      { label: 'Prioridad', value: priorityBadge(data.prioridad) },
    ],
    cta: { text: 'Revisar tarea ahora', url: taskUrl(data.frontendUrl, data.taskId) },
  });

  return {
    to: '',
    subject: `⏰ Deadline ${dayLabel}: ${data.taskTitle}`,
    html,
    text,
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
    backlog: 'Pendiente', en_proceso: 'En Proceso', en_revision: 'En Revisión', revision_interna: 'Revisión interna', revision_cliente: 'Revisión cliente',
    aprobado: 'Aprobado', entregado: 'Entregado', bloqueado: 'Bloqueado',
  };
  const accent: AccentColor =
    data.newStatus === 'aprobado' || data.newStatus === 'entregado' ? 'green' :
    data.newStatus === 'bloqueado' ? 'red' :
    data.newStatus === 'en_revision' || data.newStatus === 'revision_interna' ? 'amber' :
    data.newStatus === 'revision_cliente' ? 'purple' : 'blue';

  const transition = `${statusBadge(data.oldStatus)} <span style="color:#9ca3af;margin:0 6px;">→</span> ${statusBadge(data.newStatus)}`;

  const { html, text } = await renderEmail({
    accent,
    preheader: 'Cambio de estado',
    headline: data.taskTitle,
    greeting: `Hola ${data.recipientName},`,
    intro: `La tarea cambió de estado: ${transition}`,
    details: [
      { label: 'Tarea', value: escapeHtml(data.taskTitle) },
      { label: 'Estado anterior', value: statusLabels[data.oldStatus] || data.oldStatus },
      { label: 'Estado actual', value: statusLabels[data.newStatus] || data.newStatus, highlight: true },
    ],
    cta: { text: 'Ver tarea', url: taskUrl(data.frontendUrl, data.taskId) },
  });

  return {
    to: '',
    subject: `🔄 ${statusLabels[data.newStatus] || data.newStatus}: ${data.taskTitle}`,
    html,
    text,
  };
}

export async function deliverableApprovedEmail(data: {
  recipientName: string;
  taskTitle: string;
  deliverableVersion: string;
  frontendUrl: string;
  taskId?: string;
}): Promise<EmailOptions> {
  const { html, text } = await renderEmail({
    accent: 'green',
    preheader: 'Entregable aprobado',
    headline: `✓ Versión ${data.deliverableVersion} aprobada`,
    greeting: `Hola ${data.recipientName},`,
    intro: `El entregable versión <strong>${escapeHtml(data.deliverableVersion)}</strong> de la tarea <strong>"${escapeHtml(data.taskTitle)}"</strong> fue aprobado. ¡Buen trabajo!`,
    details: [
      { label: 'Tarea', value: escapeHtml(data.taskTitle) },
      { label: 'Versión', value: escapeHtml(data.deliverableVersion), highlight: true },
      { label: 'Estado', value: statusBadge('aprobado') },
    ],
    cta: { text: 'Ver tarea', url: taskUrl(data.frontendUrl, data.taskId) },
    secondaryCta: { text: 'Ver todos los entregables', url: `${data.frontendUrl}/entregables` },
  });

  return {
    to: '',
    subject: `✅ Aprobado: ${data.taskTitle} (v${data.deliverableVersion})`,
    html,
    text,
  };
}

export async function commentMentionEmail(data: {
  recipientName: string;
  authorName: string;
  taskTitle: string;
  commentText: string;
  frontendUrl: string;
  taskId: string;
}): Promise<EmailOptions> {
  const safeText = data.commentText.length > 500
    ? data.commentText.slice(0, 500) + '…'
    : data.commentText;

  const { html, text } = await renderEmail({
    accent: 'blue',
    preheader: 'Te mencionaron en un comentario',
    headline: `${data.authorName} te mencionó`,
    greeting: `Hola ${data.recipientName},`,
    intro: `<strong>${escapeHtml(data.authorName)}</strong> te mencionó en un comentario de la tarea <strong>"${escapeHtml(data.taskTitle)}"</strong>.`,
    quote: safeText,
    cta: { text: 'Ver comentario', url: taskUrl(data.frontendUrl, data.taskId) },
  });

  return {
    to: '',
    subject: `💬 ${data.authorName} te mencionó: ${data.taskTitle}`,
    html,
    text,
  };
}

export async function chatMentionEmail(data: {
  recipientName: string;
  authorName: string;
  deskName: string;
  messageText: string;
  frontendUrl: string;
  deskId?: string;
}): Promise<EmailOptions> {
  const safeText = data.messageText.length > 500
    ? data.messageText.slice(0, 500) + '…'
    : data.messageText;

  const { html, text } = await renderEmail({
    accent: 'purple',
    preheader: `Mención en chat · ${data.deskName}`,
    headline: `${data.authorName} te mencionó en el chat`,
    greeting: `Hola ${data.recipientName},`,
    intro: `<strong>${escapeHtml(data.authorName)}</strong> te mencionó en el chat de la mesa <strong>"${escapeHtml(data.deskName)}"</strong>.`,
    quote: safeText,
    cta: { text: 'Abrir chat', url: data.frontendUrl },
  });

  return {
    to: '',
    subject: `💬 ${data.authorName} te mencionó en ${data.deskName}`,
    html,
    text,
  };
}

// ========== Util local ==========

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ========== Incidencias / Changelog ==========

export async function incidenciaNuevaEmail(data: {
  recipientName: string;
  autorNombre: string;
  titulo: string;
  tipo: string;
  prioridad: string;
  modulo: string;
  incidenciaUrl: string;
}): Promise<EmailOptions> {
  const accent: AccentColor = data.prioridad === 'CRITICA' ? 'red' : data.prioridad === 'ALTA' ? 'amber' : 'blue';
  const { html, text } = await renderEmail({
    accent,
    preheader: 'Nueva incidencia reportada',
    headline: data.titulo,
    greeting: `Hola ${data.recipientName},`,
    intro: `<strong>${escapeHtml(data.autorNombre)}</strong> reportó una nueva incidencia en Tiusdei.`,
    details: [
      { label: 'Tipo', value: escapeHtml(data.tipo) },
      { label: 'Prioridad', value: escapeHtml(data.prioridad), highlight: data.prioridad === 'CRITICA' || data.prioridad === 'ALTA' },
      { label: 'Módulo', value: escapeHtml(data.modulo) },
    ],
    cta: { text: 'Ver incidencia', url: data.incidenciaUrl },
  });
  return { to: '', subject: `[Incidencia] ${data.titulo}`, html, text };
}

export async function incidenciaComentarioEmail(data: {
  recipientName: string;
  autorNombre: string;
  titulo: string;
  comentarioTexto: string;
  incidenciaUrl: string;
}): Promise<EmailOptions> {
  const { html, text } = await renderEmail({
    accent: 'blue',
    preheader: 'Nuevo comentario en incidencia',
    headline: data.titulo,
    greeting: `Hola ${data.recipientName},`,
    intro: `<strong>${escapeHtml(data.autorNombre)}</strong> comentó en la incidencia <strong>${escapeHtml(data.titulo)}</strong>.`,
    quote: data.comentarioTexto,
    cta: { text: 'Ver comentario', url: data.incidenciaUrl },
  });
  return { to: '', subject: `[Comentario] ${data.titulo}`, html, text };
}

export async function incidenciaEstadoEmail(data: {
  recipientName: string;
  autorNombre: string;
  titulo: string;
  estadoAnterior: string;
  estadoNuevo: string;
  incidenciaUrl: string;
}): Promise<EmailOptions> {
  const accent: AccentColor =
    data.estadoNuevo === 'RESUELTO' || data.estadoNuevo === 'CERRADO' ? 'green' :
    data.estadoNuevo === 'EN_PROGRESO' ? 'amber' : 'blue';
  const { html, text } = await renderEmail({
    accent,
    preheader: 'Cambio de estado de incidencia',
    headline: data.titulo,
    greeting: `Hola ${data.recipientName},`,
    intro: `<strong>${escapeHtml(data.autorNombre)}</strong> cambió el estado de la incidencia.`,
    details: [
      { label: 'Estado anterior', value: escapeHtml(data.estadoAnterior) },
      { label: 'Estado nuevo', value: escapeHtml(data.estadoNuevo), highlight: true },
    ],
    cta: { text: 'Ver incidencia', url: data.incidenciaUrl },
  });
  return { to: '', subject: `[${data.estadoNuevo}] ${data.titulo}`, html, text };
}

export async function bienvenidaEmail(data: {
  recipientName: string;
  email: string;
  frontendUrl: string;
}): Promise<EmailOptions> {
  const { html, text } = await renderEmail({
    accent: 'blue',
    preheader: 'Te damos la bienvenida',
    headline: `¡Bienvenido a Tiusdei, ${data.recipientName}!`,
    greeting: `Hola ${data.recipientName},`,
    intro: 'Tu cuenta en <strong>Tiusdei</strong> ya está activa. Desde aquí vas a gestionar tus tareas, entregables, tiempos y todo el trabajo de tu equipo en un solo lugar.',
    details: [
      { label: 'Tu acceso', value: escapeHtml(data.email) },
      { label: 'Plataforma', value: 'Gestión de proyectos y entregas' },
    ],
    cta: { text: 'Ingresar a Tiusdei', url: data.frontendUrl },
    footer: 'Si tienes dudas para empezar, escríbele a tu líder de mesa o al equipo de Qbit. ¡A trabajar!',
  });
  return { to: '', subject: '👋 Bienvenido a Tiusdei', html, text };
}

// ── Handoff entre departamentos (pase de etapa) ──
export async function taskHandoffEmail(data: {
  recipientName: string;
  taskTitle: string;
  brandName: string;
  fromDepartment?: string | null;
  toDepartment: string;
  fromResponsable?: string | null;
  motivo?: string | null;
  fechaEntrega?: string | null;
  frontendUrl: string;
  taskId?: string;
}): Promise<EmailOptions> {
  const flujo = `${escapeHtml(data.fromDepartment || '—')} <strong style="color:#16a34a;">&rarr; ${escapeHtml(data.toDepartment)}</strong>`;
  const { html, text } = await renderEmail({
    accent: 'green',
    preheader: `Tarea pasada a ${data.toDepartment}`,
    headline: data.taskTitle,
    greeting: `Hola ${data.recipientName},`,
    intro: `Te pasaron una tarea de la marca <strong>${escapeHtml(data.brandName)}</strong> para que la trabajes en <strong>${escapeHtml(data.toDepartment)}</strong>.`,
    details: [
      { label: 'Marca', value: escapeHtml(data.brandName) },
      { label: 'Flujo', value: flujo },
      { label: 'Viene de', value: data.fromResponsable ? escapeHtml(data.fromResponsable) : '<span style="color:#9ca3af;">No definido</span>' },
      { label: 'Motivo', value: data.motivo ? escapeHtml(data.motivo) : '<span style="color:#9ca3af;">Sin motivo</span>' },
      { label: 'Deadline', value: data.fechaEntrega ? formatDateLong(data.fechaEntrega) : '<span style="color:#9ca3af;">Sin fecha</span>', highlight: true },
    ],
    cta: { text: 'Ver tarea en Tiusdei', url: taskUrl(data.frontendUrl, data.taskId) },
    footer: 'La tarea ahora está en tu cancha. Actualiza el estado a medida que avances.',
  });
  return {
    to: '',
    subject: `🔀 Tarea para ${data.toDepartment}: ${data.taskTitle}`,
    html,
    text,
  };
}

export async function clientActivityEmail(data: {
  recipientName: string;
  clienteNombre: string;
  accion: string;          // "comentó", "pidió un requerimiento", "aprobó", "pidió cambios"
  tablero: string;
  tareaTitulo?: string;
  detalle?: string;        // texto del comentario / requerimiento
  url: string;
}): Promise<EmailOptions> {
  const accent: AccentColor =
    data.accion === 'pidió cambios' ? 'amber' :
    data.accion === 'aprobó' ? 'blue' : 'blue';
  const intro = data.tareaTitulo
    ? `<strong>${escapeHtml(data.clienteNombre)}</strong> ${escapeHtml(data.accion)} en la tarea <strong>${escapeHtml(data.tareaTitulo)}</strong>.`
    : `<strong>${escapeHtml(data.clienteNombre)}</strong> ${escapeHtml(data.accion)} desde su tablero.`;
  const details = [
    { label: 'Cliente', value: escapeHtml(data.clienteNombre) },
    { label: 'Tablero', value: escapeHtml(data.tablero) },
  ];
  if (data.tareaTitulo) details.push({ label: 'Tarea', value: escapeHtml(data.tareaTitulo) });
  const { html, text } = await renderEmail({
    accent,
    preheader: `Actividad del cliente: ${data.accion}`,
    headline: data.tareaTitulo || data.tablero,
    greeting: `Hola ${data.recipientName},`,
    intro,
    details,
    quote: data.detalle || undefined,
    cta: { text: 'Ver en Tiusdei', url: data.url },
  });
  return { to: '', subject: `[Cliente] ${data.clienteNombre} ${data.accion}`, html, text };
}
