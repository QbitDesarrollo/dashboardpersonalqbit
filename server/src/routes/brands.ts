import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { getUserRole, hasRole } from '../utils/roles.js';

export const brandsRouter = Router();

// Abreviaturas de la marca para reconocer reuniones ("MDN" = Mall del Norte):
// lista separada por comas, sin repetidas, máximo 255 caracteres.
function limpiarAlias(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const lista = Array.from(new Set(v.split(',').map((s) => s.trim()).filter(Boolean)));
  return lista.length ? lista.join(', ').slice(0, 255) : null;
}

brandsRouter.get('/brands', requireAuth, async (req: AuthRequest, res) => {
  try {
    const role = await getUserRole(req.userId!);
    const deskId = req.query.desk_id as string | undefined;
    let rows: any[];

    if (deskId) {
      // Filter brands by desk: only brands assigned to this desk via desk_brands
      // If the desk has NO brands assigned, return ALL brands (backwards compatible)
      const deskBrandCount = await queryOne<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM desk_brands WHERE desk_id = ?', [deskId]
      );
      if (Number(deskBrandCount?.cnt) > 0) {
        rows = await query<any[]>(
          `SELECT b.*, c.nombre as cliente_nombre FROM brands b
           INNER JOIN desk_brands db ON db.brand_id = b.id
           LEFT JOIN clients c ON c.id = b.cliente_id
           WHERE db.desk_id = ? ORDER BY b.nombre`,
          [deskId]
        );
      } else {
        rows = await query<any[]>(
          `SELECT b.*, c.nombre as cliente_nombre FROM brands b LEFT JOIN clients c ON c.id = b.cliente_id ORDER BY b.nombre`
        );
      }
    } else if (role === 'cliente') {
      const brandIds = await query<{ brand_id: string }[]>('SELECT brand_id FROM client_brands WHERE user_id = ?', [req.userId]);
      const ids = brandIds.map((r) => r.brand_id);
      if (ids.length === 0) { res.json([]); return; }
      const placeholders = ids.map(() => '?').join(',');
      rows = await query<any[]>(`SELECT b.*, c.nombre as cliente_nombre FROM brands b LEFT JOIN clients c ON c.id = b.cliente_id WHERE b.id IN (${placeholders}) ORDER BY b.nombre`, ids);
    } else if (role === 'equipo') {
      // Equipo: marcas asignadas a sus mesas via desk_brands, o si no hay desk_brands, todas las de sus tareas
      const deskRows = await query<{ desk_id: string }[]>('SELECT desk_id FROM desk_members WHERE user_id = ?', [req.userId]);
      const deskIds = deskRows.map((r) => r.desk_id);
      if (deskIds.length > 0) {
        const ph = deskIds.map(() => '?').join(',');
        const hasDeskBrands = await queryOne<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM desk_brands WHERE desk_id IN (${ph})`, deskIds
        );
        if (Number(hasDeskBrands?.cnt) > 0) {
          rows = await query<any[]>(
            `SELECT DISTINCT b.*, c.nombre as cliente_nombre FROM brands b
             INNER JOIN desk_brands db ON db.brand_id = b.id
             LEFT JOIN clients c ON c.id = b.cliente_id
             WHERE db.desk_id IN (${ph}) ORDER BY b.nombre`,
            deskIds
          );
        } else {
          // No desk_brands configured: fallback to brands from tasks
          rows = await query<any[]>(
            `SELECT DISTINCT b.*, c.nombre as cliente_nombre
             FROM brands b
             LEFT JOIN clients c ON c.id = b.cliente_id
             INNER JOIN tasks t ON t.brand_id = b.id
             LEFT JOIN desk_members dm ON dm.desk_id = t.desk_id AND dm.user_id = ?
             WHERE dm.user_id IS NOT NULL OR t.responsable_user_id = ?
             ORDER BY b.nombre`,
            [req.userId, req.userId]
          );
        }
      } else {
        rows = [];
      }
    } else {
      rows = await query<any[]>(`SELECT b.*, c.nombre as cliente_nombre FROM brands b LEFT JOIN clients c ON c.id = b.cliente_id ORDER BY b.nombre`);
    }
    const mapped = rows.map((r) => ({ ...r, clients: r.cliente_nombre ? { nombre: r.cliente_nombre } : null }));
    res.json(mapped);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar marcas' });
  }
});

brandsRouter.post('/brands', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { nombre, cliente_id, activo } = req.body;
    const id = uuid();
    await query('INSERT INTO brands (id, nombre, cliente_id, activo, alias) VALUES (?, ?, ?, ?, ?)', [id, nombre, cliente_id || null, activo !== false ? 1 : 0, limpiarAlias(req.body.alias)]);
    const row = await queryOne<any>('SELECT * FROM brands WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear marca' });
  }
});

brandsRouter.delete('/brands/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    // Desvincular tareas (conservar el registro)
    await query('UPDATE tasks SET brand_id = NULL WHERE brand_id = ?', [id]);
    // Eliminar relaciones
    await query('DELETE FROM desk_brands WHERE brand_id = ?', [id]);
    await query('DELETE FROM client_brands WHERE brand_id = ?', [id]);
    // Eliminar marca
    await query('DELETE FROM brands WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar marca' });
  }
});

brandsRouter.patch('/brands/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const allowed = await hasRole(req.userId!, ['admin', 'ejecutivo']);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos' });
    const { id } = req.params;
    const { nombre, cliente_id, activo } = req.body;
    await query('UPDATE brands SET nombre = ?, cliente_id = ?, activo = ? WHERE id = ?', [nombre, cliente_id || null, activo !== false ? 1 : 0, id]);
    // Las abreviaturas solo se tocan si vienen (otras pantallas editan la marca sin ellas)
    if (req.body.alias !== undefined) await query('UPDATE brands SET alias = ? WHERE id = ?', [limpiarAlias(req.body.alias), id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});
