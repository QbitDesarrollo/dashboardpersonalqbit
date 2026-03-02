import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

function sanitizeSlug(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'form';
}

// Router público (montar en /api) — sin auth
export const publicFormsPublicRouter = Router();
publicFormsPublicRouter.get('/public/forms/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const row = await queryOne<any>(
      'SELECT id, name, description, slug, fields_config, default_prioridad FROM public_forms WHERE slug = ? AND is_active = 1',
      [slug]
    );
    if (!row) return res.status(404).json({ error: 'Formulario no encontrado' });
    row.fields_config = typeof row.fields_config === 'string' ? JSON.parse(row.fields_config) : row.fields_config;
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar formulario' });
  }
});
publicFormsPublicRouter.post('/public/forms/:slug/submit', async (req, res) => {
  try {
    const { slug } = req.params;
    const data = req.body;
    const ip = req.ip || req.socket?.remoteAddress || null;

    const form = await queryOne<any>(
      'SELECT * FROM public_forms WHERE slug = ? AND is_active = 1',
      [slug]
    );
    if (!form) return res.status(404).json({ error: 'Formulario no encontrado' });

    const fieldsConfig = typeof form.fields_config === 'string' ? JSON.parse(form.fields_config) : form.fields_config;
    const payload: Record<string, unknown> = {};
    if (data && typeof data === 'object') {
      for (const key of Object.keys(data)) {
        if (fieldsConfig?.some((f: { key: string }) => f.key === key) || ['nombre', 'email', 'mensaje'].includes(key)) {
          payload[key] = data[key];
        }
      }
    }

    const subId = uuid();
    await query(
      'INSERT INTO form_submissions (id, form_id, data, ip_address) VALUES (?, ?, ?, ?)',
      [subId, form.id, JSON.stringify(payload), ip]
    );

    // Crear tarea si hay campos mínimos
    const titulo = (payload.nombre || payload.email || 'Nueva solicitud') as string;
    const detalle = typeof payload.mensaje === 'string' ? payload.mensaje : JSON.stringify(payload, null, 2);
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    const taskId = uuid();
    await query(
      `INSERT INTO tasks (id, brand_id, desk_id, titulo_tarea, detalle, prioridad, estado, fecha_entrega) VALUES (?, ?, ?, ?, ?, ?, 'backlog', ?)`,
      [taskId, form.brand_id, form.default_desk_id || null, String(titulo).slice(0, 500), detalle, form.default_prioridad || 'media', dueDate.toISOString().slice(0, 10)]
    );
    await query('UPDATE form_submissions SET task_id = ? WHERE id = ?', [taskId, subId]);

    res.status(201).json({ success: true, id: subId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al enviar' });
  }
});

// Router admin (montar en /api/data)
export const publicFormsAdminRouter = Router();
publicFormsAdminRouter.get('/public-forms', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const rows = await query<any[]>(
      `SELECT pf.*, b.nombre as brand_nombre,
        (SELECT COUNT(*) FROM form_submissions fs WHERE fs.form_id = pf.id) as submissions_count
       FROM public_forms pf
       LEFT JOIN brands b ON b.id = pf.brand_id
       ORDER BY pf.created_at DESC`
    );
    res.json((rows || []).map((r) => ({ ...r, submissions_count: Number(r.submissions_count ?? 0) })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar formularios' });
  }
});

publicFormsAdminRouter.get('/public-forms/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const row = await queryOne<any>(
      'SELECT pf.*, b.nombre as brand_nombre FROM public_forms pf LEFT JOIN brands b ON b.id = pf.brand_id WHERE pf.id = ?',
      [id]
    );
    if (!row) return res.status(404).json({ error: 'Formulario no encontrado' });
    row.fields_config = typeof row.fields_config === 'string' ? JSON.parse(row.fields_config) : row.fields_config;
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar formulario' });
  }
});

publicFormsAdminRouter.post('/public-forms', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { brand_id, name, description, slug, fields_config, default_desk_id, default_prioridad } = req.body;
    if (!brand_id || !name) return res.status(400).json({ error: 'brand_id y name requeridos' });
    const id = uuid();
    const s = sanitizeSlug(slug || name);
    await query(
      `INSERT INTO public_forms (id, brand_id, name, description, slug, fields_config, default_desk_id, default_prioridad, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, brand_id, name, description || null, s, JSON.stringify(fields_config || []), default_desk_id || null, default_prioridad || 'media', req.userId]
    );
    const row = await queryOne<any>('SELECT * FROM public_forms WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear formulario' });
  }
});

publicFormsAdminRouter.patch('/public-forms/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const { name, description, slug, fields_config, default_desk_id, default_prioridad, is_active } = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (slug !== undefined) { updates.push('slug = ?'); values.push(sanitizeSlug(slug)); }
    if (fields_config !== undefined) { updates.push('fields_config = ?'); values.push(JSON.stringify(fields_config)); }
    if (default_desk_id !== undefined) { updates.push('default_desk_id = ?'); values.push(default_desk_id); }
    if (default_prioridad !== undefined) { updates.push('default_prioridad = ?'); values.push(default_prioridad); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (updates.length === 0) return res.status(400).json({ error: 'Sin campos' });
    values.push(id);
    await query(`UPDATE public_forms SET ${updates.join(', ')} WHERE id = ?`, values);
    const row = await queryOne<any>('SELECT * FROM public_forms WHERE id = ?', [id]);
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

publicFormsAdminRouter.delete('/public-forms/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    await query('DELETE FROM public_forms WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

// GET /api/data/public-forms/:id/submissions
publicFormsAdminRouter.get('/public-forms/:id/submissions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const rows = await query<any[]>(
      'SELECT id, form_id, data, task_id, ip_address, created_at FROM form_submissions WHERE form_id = ? ORDER BY created_at DESC LIMIT 200',
      [id]
    );
    res.json((rows || []).map((r) => ({ ...r, data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar envíos' });
  }
});
