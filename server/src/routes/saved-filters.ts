import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';

export const savedFiltersRouter = Router();

// GET /api/data/saved-filters — listar filtros guardados del usuario
savedFiltersRouter.get('/saved-filters', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await query<any[]>(
      'SELECT id, name, entity_type, filter_config, is_default, created_at FROM saved_filters WHERE user_id = ? ORDER BY is_default DESC, name',
      [req.userId]
    );
    res.json(rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar filtros' });
  }
});

// POST /api/data/saved-filters — crear filtro
savedFiltersRouter.post('/saved-filters', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, entity_type = 'tasks', filter_config, is_default = false } = req.body;
    if (!name || !filter_config || typeof filter_config !== 'object') {
      return res.status(400).json({ error: 'name y filter_config requeridos' });
    }
    const id = uuid();
    if (is_default) {
      await query(
        'UPDATE saved_filters SET is_default = 0 WHERE user_id = ? AND entity_type = ?',
        [req.userId, entity_type]
      );
    }
    await query(
      'INSERT INTO saved_filters (id, user_id, name, entity_type, filter_config, is_default) VALUES (?, ?, ?, ?, ?, ?)',
      [id, req.userId, name, entity_type || 'tasks', JSON.stringify(filter_config), is_default ? 1 : 0]
    );
    const row = await queryOne<any>('SELECT * FROM saved_filters WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al guardar filtro' });
  }
});

// PATCH /api/data/saved-filters/:id
savedFiltersRouter.patch('/saved-filters/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, filter_config, is_default } = req.body;
    const existing = await queryOne<any>('SELECT * FROM saved_filters WHERE id = ? AND user_id = ?', [id, req.userId]);
    if (!existing) return res.status(404).json({ error: 'Filtro no encontrado' });

    const updates: string[] = [];
    const values: unknown[] = [];
    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (filter_config !== undefined && typeof filter_config === 'object') {
      updates.push('filter_config = ?');
      values.push(JSON.stringify(filter_config));
    }
    if (is_default !== undefined) {
      if (is_default) {
        await query('UPDATE saved_filters SET is_default = 0 WHERE user_id = ? AND entity_type = ?', [req.userId, existing.entity_type]);
      }
      updates.push('is_default = ?');
      values.push(is_default ? 1 : 0);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });
    values.push(id);
    await query(`UPDATE saved_filters SET ${updates.join(', ')} WHERE id = ?`, values);
    const row = await queryOne<any>('SELECT * FROM saved_filters WHERE id = ?', [id]);
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar filtro' });
  }
});

// DELETE /api/data/saved-filters/:id
savedFiltersRouter.delete('/saved-filters/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const result = await query<any>('DELETE FROM saved_filters WHERE id = ? AND user_id = ?', [id, req.userId]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar filtro' });
  }
});
