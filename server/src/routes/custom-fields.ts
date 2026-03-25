import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest, requireAdminOrEjecutivo } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';

export const customFieldsRouter = Router();

const fieldDefSchema = z.object({
  name: z.string().min(1).max(255),
  field_type: z.enum(['text', 'number', 'date', 'select', 'checkbox', 'url']),
  options: z.array(z.string()).nullable().optional(),
  brand_id: z.string().nullable().optional(),
  is_required: z.boolean().optional().default(false),
  sort_order: z.number().int().optional().default(0),
});

// GET definitions (optionally filtered by brand)
customFieldsRouter.get('/custom-fields/definitions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const brandId = req.query.brand_id as string | undefined;
    let sql = 'SELECT * FROM custom_field_definitions WHERE is_active = 1';
    const params: string[] = [];
    if (brandId) {
      sql += ' AND (brand_id IS NULL OR brand_id = ?)';
      params.push(brandId);
    }
    sql += ' ORDER BY sort_order, name';
    const rows = await query<any[]>(sql, params);
    res.json(rows.map((r: any) => ({
      ...r,
      options: typeof r.options === 'string' ? JSON.parse(r.options) : r.options,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar campos' });
  }
});

// POST definition (admin/ejecutivo)
customFieldsRouter.post('/custom-fields/definitions', requireAuth, requireAdminOrEjecutivo, async (req: AuthRequest, res) => {
  try {
    const parsed = fieldDefSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    const { name, field_type, options, brand_id, is_required, sort_order } = parsed.data;
    const id = uuid();
    await query(
      `INSERT INTO custom_field_definitions (id, name, field_type, options, brand_id, is_required, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, field_type, options ? JSON.stringify(options) : null, brand_id || null, is_required ? 1 : 0, sort_order]
    );
    const row = await queryOne<any>('SELECT * FROM custom_field_definitions WHERE id = ?', [id]);
    if (row) row.options = typeof row.options === 'string' ? JSON.parse(row.options) : row.options;
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear campo' });
  }
});

// PATCH definition (admin/ejecutivo)
customFieldsRouter.patch('/custom-fields/definitions/:id', requireAuth, requireAdminOrEjecutivo, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const updates: string[] = [];
    const values: unknown[] = [];
    const body = req.body;
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
    if (body.field_type !== undefined) { updates.push('field_type = ?'); values.push(body.field_type); }
    if (body.options !== undefined) { updates.push('options = ?'); values.push(body.options ? JSON.stringify(body.options) : null); }
    if (body.brand_id !== undefined) { updates.push('brand_id = ?'); values.push(body.brand_id || null); }
    if (body.is_required !== undefined) { updates.push('is_required = ?'); values.push(body.is_required ? 1 : 0); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (body.is_active !== undefined) { updates.push('is_active = ?'); values.push(body.is_active ? 1 : 0); }
    if (updates.length === 0) return res.status(400).json({ error: 'Sin campos' });
    values.push(id);
    await query(`UPDATE custom_field_definitions SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar campo' });
  }
});

// DELETE definition (soft delete)
customFieldsRouter.delete('/custom-fields/definitions/:id', requireAuth, requireAdminOrEjecutivo, async (req: AuthRequest, res) => {
  try {
    await query('UPDATE custom_field_definitions SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar campo' });
  }
});

// GET task custom field values
customFieldsRouter.get('/tasks/:taskId/custom-fields', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await query<any[]>(
      `SELECT cfv.*, cfd.name, cfd.field_type, cfd.options
       FROM custom_field_values cfv
       JOIN custom_field_definitions cfd ON cfd.id = cfv.field_id
       WHERE cfv.task_id = ?
       ORDER BY cfd.sort_order`,
      [req.params.taskId]
    );
    res.json(rows.map((r: any) => ({
      ...r,
      options: typeof r.options === 'string' ? JSON.parse(r.options) : r.options,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar campos de tarea' });
  }
});

// PUT task custom field values (upsert)
customFieldsRouter.put('/tasks/:taskId/custom-fields', requireAuth, async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.taskId;
    const fields: { field_id: string; value: any }[] = req.body.fields || [];

    for (const f of fields) {
      const def = await queryOne<any>('SELECT field_type FROM custom_field_definitions WHERE id = ?', [f.field_id]);
      if (!def) continue;

      const vals = { value_text: null as string | null, value_number: null as number | null, value_date: null as string | null, value_boolean: null as number | null };
      switch (def.field_type) {
        case 'text': case 'url': case 'select': vals.value_text = f.value != null ? String(f.value) : null; break;
        case 'number': vals.value_number = f.value != null ? Number(f.value) : null; break;
        case 'date': vals.value_date = f.value || null; break;
        case 'checkbox': vals.value_boolean = f.value ? 1 : 0; break;
      }

      await query(
        `INSERT INTO custom_field_values (id, task_id, field_id, value_text, value_number, value_date, value_boolean)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE value_text = VALUES(value_text), value_number = VALUES(value_number),
           value_date = VALUES(value_date), value_boolean = VALUES(value_boolean)`,
        [uuid(), taskId, f.field_id, vals.value_text, vals.value_number, vals.value_date, vals.value_boolean]
      );
    }
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al guardar campos' });
  }
});
