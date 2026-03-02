import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

export const clientsRouter = Router();

const clientPatchSchema = z.object({
  nombre: z.string().min(1).optional(),
  email_contacto: z.string().email().optional().nullable(),
  activo: z.boolean().optional(),
}).strict();

clientsRouter.get('/clients', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await query<any[]>('SELECT * FROM clients ORDER BY nombre');
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar clientes' });
  }
});

clientsRouter.post('/clients', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { nombre, email_contacto, activo } = req.body;
    const id = uuid();
    await query('INSERT INTO clients (id, nombre, email_contacto, activo) VALUES (?, ?, ?, ?)', [id, nombre, email_contacto || null, activo !== false ? 1 : 0]);
    const row = await queryOne<any>('SELECT * FROM clients WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear cliente' });
  }
});

clientsRouter.patch('/clients/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ops']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const parsed = clientPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    const { id } = req.params;
    const { nombre, email_contacto, activo } = parsed.data;
    const updates: string[] = [];
    const values: unknown[] = [];
    if (nombre !== undefined) { updates.push('nombre = ?'); values.push(nombre); }
    if (email_contacto !== undefined) { updates.push('email_contacto = ?'); values.push(email_contacto); }
    if (activo !== undefined) { updates.push('activo = ?'); values.push(activo ? 1 : 0); }
    if (updates.length === 0) return res.status(400).json({ error: 'Ningún campo válido para actualizar' });
    values.push(id);
    await query(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar cliente' });
  }
});
