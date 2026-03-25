import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireAdminOrEjecutivo } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';

export const configRouter = Router();

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const FAVICON_FILE = 'tiusdei-icon.ico';

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, _file, cb) => {
    cb(null, FAVICON_FILE);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(ico|png|svg|gif|webp)$/i.test(file.originalname);
    cb(null, allowed);
  },
});

// GET /api/config/site-settings — público (para logo y site_name en login/layout)
configRouter.get('/site-settings', async (_req, res) => {
  try {
    const rows = await query<{ key: string; value: string | null }[]>(
      'SELECT `key`, value FROM site_settings'
    );
    const map: Record<string, string | null> = {};
    for (const r of rows) map[r.key] = r.value;
    res.json(map);
  } catch (e) {
    console.error('[CONFIG] Error site-settings:', e);
    res.status(500).json({ error: 'Error al cargar configuración' });
  }
});

const siteSettingsPatchSchema = z.object({
  logo_url: z.string().url().nullable().optional(),
  logo_email_url: z.string().url().nullable().optional(),
  favicon_url: z.string().url().nullable().optional(),
  site_name: z.string().min(1).max(100).optional(),
  email_from_name: z.string().min(1).max(100).optional(),
  email_footer_text: z.string().max(500).optional(),
  // Registro de usuarios
  registration_enabled: z.preprocess(
    (v) => (v === undefined ? undefined : v === true || v === 'true' || v === 1 || v === '1'),
    z.boolean().optional()
  ),
  registration_allowed_domains: z.string().max(500).optional().nullable(),
  registration_max_users: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Math.max(0, Number(v))),
    z.number().int().min(0).optional()
  ),
  can_delete_tasks_roles: z.string().max(100).optional(),
  scrum_desk_id: z.string().max(36).nullable().optional(),
  daily_meetings_desk_ids: z.string().max(1000).optional(),
  daily_meetings_roles: z.string().max(200).optional(),
  notification_sound_enabled: z.string().max(10).optional(),
  notification_sound_type: z.string().max(50).optional(),
  chat_enabled: z.string().max(10).optional(),
  drive_enabled: z.string().max(10).optional(),
  gemini_enabled: z.string().max(10).optional(),
}).strict();

// PATCH /api/config/site-settings — admin/ejecutivo
configRouter.patch('/site-settings', requireAuth, requireAdminOrEjecutivo, async (req: AuthRequest, res) => {
  try {
    const parsed = siteSettingsPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    }

    const keys: (keyof z.infer<typeof siteSettingsPatchSchema>)[] = [
      'logo_url', 'logo_email_url', 'favicon_url', 'site_name', 'email_from_name', 'email_footer_text',
      'registration_enabled', 'registration_allowed_domains', 'registration_max_users',
      'can_delete_tasks_roles', 'scrum_desk_id',
      'daily_meetings_desk_ids', 'daily_meetings_roles',
      'notification_sound_enabled', 'notification_sound_type',
      'chat_enabled',
      'drive_enabled',
      'gemini_enabled',
    ];
    for (const k of keys) {
      const v = parsed.data[k];
      if (v === undefined) continue;
      await query(
        `INSERT INTO site_settings (\`key\`, value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [k, v === null ? null : String(v)]
      );
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[CONFIG] Error patch site-settings:', e);
    res.status(500).json({ error: 'Error al guardar configuración' });
  }
});

// PATCH /api/config/registration-settings — solo registro de usuarios (evita conflictos con site-settings)
const registrationSettingsSchema = z.object({
  registration_enabled: z.boolean(),
  registration_allowed_domains: z.string().max(500),
  registration_max_users: z.number().int().min(0),
});
configRouter.patch('/registration-settings', requireAuth, requireAdminOrEjecutivo, async (req: AuthRequest, res) => {
  try {
    const parsed = registrationSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    }
    const { registration_enabled, registration_allowed_domains, registration_max_users } = parsed.data;
    const updates: [string, string][] = [
      ['registration_enabled', String(registration_enabled)],
      ['registration_allowed_domains', registration_allowed_domains],
      ['registration_max_users', String(registration_max_users)],
    ];
    for (const [k, v] of updates) {
      await query(
        `INSERT INTO site_settings (\`key\`, value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [k, v]
      );
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[CONFIG] Error patch registration-settings:', e);
    res.status(500).json({ error: 'Error al guardar configuración de registro' });
  }
});

// POST /api/config/upload-favicon — admin/ejecutivo
configRouter.post('/upload-favicon', requireAuth, requireAdminOrEjecutivo, upload.single('favicon'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      console.warn('[CONFIG] upload-favicon: no file received');
      return res.status(400).json({ error: 'No se envió archivo' });
    }

    console.log(`[CONFIG] upload-favicon: received ${req.file.originalname} (${req.file.size} bytes, ${req.file.mimetype})`);

    const base = (process.env.FRONTEND_URL || req.protocol + '://' + (req.get('host') || `localhost:${process.env.PORT || 3003}`)).replace(/\/$/, '');
    // Cache-busting: add timestamp so browsers fetch the new version
    const cacheBuster = Date.now();
    const faviconUrl = `${base}/uploads/${FAVICON_FILE}?v=${cacheBuster}`;

    await query(
      `INSERT INTO site_settings (\`key\`, value) VALUES ('favicon_url', ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [faviconUrl]
    );

    console.log(`[CONFIG] upload-favicon: saved as ${FAVICON_FILE}, url=${faviconUrl}`);
    res.json({ success: true, favicon_url: faviconUrl });
  } catch (e) {
    console.error('[CONFIG] Error upload-favicon:', e);
    res.status(500).json({ error: 'Error al subir favicon' });
  }
});

// POST /api/config/email-templates/preview — devuelve HTML renderizado con datos de ejemplo
configRouter.post('/email-templates/preview', requireAuth, requireAdminOrEjecutivo, async (req: AuthRequest, res) => {
  try {
    const { type, html } = req.body || {};
    const frontendUrl = process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec';

    const sampleData: Record<string, string> = {
      taskTitle: 'Revisar diseño del banner',
      recipientName: 'Juan Pérez',
      brandName: 'Marca Ejemplo',
      fechaEntrega: '2025-02-25',
      prioridad: 'media',
      detalle: 'Descripción de la tarea con detalles importantes.',
      fechaInicio: '2025-02-15',
      diasRestantes: '2',
      oldStatus: 'En Proceso',
      newStatus: 'En Revisión',
      deliverableVersion: 'v1.2',
      siteName: 'TIUSDEI',
      footerText: 'TIUSDEI Portal · Notificación automática',
      frontendUrl,
    };

    let previewHtml: string;
    if (html && typeof html === 'string' && html.trim()) {
      previewHtml = html.replace(/\{\{(\w+)\}\}/g, (_, key) => sampleData[key] ?? `{{${key}}}`);
    } else {
      const { taskAssignmentEmail, deadlineWarningEmail, taskStatusChangeEmail, deliverableApprovedEmail } = await import('../services/email.js');
      const sample = {
        recipientName: sampleData.recipientName,
        taskTitle: sampleData.taskTitle,
        brandName: sampleData.brandName,
        fechaEntrega: sampleData.fechaEntrega,
        prioridad: sampleData.prioridad,
        detalle: sampleData.detalle,
        fechaInicio: sampleData.fechaInicio,
        diasRestantes: parseInt(sampleData.diasRestantes, 10),
        oldStatus: sampleData.oldStatus,
        newStatus: sampleData.newStatus,
        deliverableVersion: sampleData.deliverableVersion,
        frontendUrl,
      };
      const builders: Record<string, () => Promise<{ html: string }>> = {
        task_assignment: () => taskAssignmentEmail(sample),
        deadline_warning: () => deadlineWarningEmail(sample),
        status_change: () => taskStatusChangeEmail(sample),
        deliverable_approved: () => deliverableApprovedEmail(sample),
      };
      const fn = builders[type];
      if (!fn) return res.status(400).json({ error: 'Tipo de plantilla no soportado' });
      const emailData = await fn();
      previewHtml = emailData.html;
    }

    res.json({ html: previewHtml });
  } catch (e) {
    console.error('[CONFIG] Error preview:', e);
    res.status(500).json({ error: 'Error al generar vista previa' });
  }
});

// GET /api/config/email-templates — admin/ejecutivo
configRouter.get('/email-templates', requireAuth, requireAdminOrEjecutivo, async (_req, res) => {
  try {
    const rows = await query<any[]>(
      'SELECT id, type, subject_template, html_template, updated_at FROM email_templates ORDER BY type'
    );
    res.json(rows);
  } catch (e) {
    console.error('[CONFIG] Error email-templates:', e);
    res.status(500).json({ error: 'Error al cargar plantillas' });
  }
});

const emailTemplatePatchSchema = z.object({
  subject_template: z.string().min(1).max(500).optional(),
  html_template: z.string().nullable().optional(),
}).strict();

// PATCH /api/config/email-templates/:type — admin/ejecutivo
configRouter.patch('/email-templates/:type', requireAuth, requireAdminOrEjecutivo, async (req: AuthRequest, res) => {
  try {
    const parsed = emailTemplatePatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    }

    const type = String(req.params.type);
    const existing = await queryOne<{ id: string }>('SELECT id FROM email_templates WHERE type = ?', [type]);

    if (!existing) {
      const id = uuid();
      await query(
        'INSERT INTO email_templates (id, type, subject_template, html_template) VALUES (?, ?, ?, ?)',
        [
          id,
          type,
          parsed.data.subject_template ?? 'Sin asunto',
          parsed.data.html_template ?? null,
        ]
      );
    } else {
      const updates: string[] = [];
      const values: unknown[] = [];
      if (parsed.data.subject_template !== undefined) {
        updates.push('subject_template = ?');
        values.push(parsed.data.subject_template);
      }
      if (parsed.data.html_template !== undefined) {
        updates.push('html_template = ?');
        values.push(parsed.data.html_template);
      }
      if (updates.length > 0) {
        values.push(type);
        await query(`UPDATE email_templates SET ${updates.join(', ')} WHERE type = ?`, values);
      }
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[CONFIG] Error patch email-template:', e);
    res.status(500).json({ error: 'Error al guardar plantilla' });
  }
});
