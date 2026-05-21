import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { getUserRole } from '../utils/roles.js';

export const novedadesRouter = Router();

const TIPOS_NOVEDAD = ['FEATURE', 'FIX', 'MEJORA', 'SEGURIDAD'];

async function requireAccess(req: AuthRequest): Promise<{ ok: boolean; role: string }> {
  const role = await getUserRole(req.userId!);
  return { ok: role === 'admin' || role === 'ejecutivo', role };
}

// GET /novedades — listado del changelog
novedadesRouter.get('/novedades', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { ok } = await requireAccess(req);
    if (!ok) return res.status(403).json({ error: 'Sin acceso' });

    const rows = await query<any[]>(
      `SELECT n.*, p.nombre AS creado_por_nombre, p.avatar_url AS creado_por_avatar,
              i.titulo AS incidencia_titulo
       FROM novedades n
       LEFT JOIN profiles p ON p.id = n.creado_por_id
       LEFT JOIN incidencias i ON i.id = n.incidencia_id
       ORDER BY n.fecha DESC LIMIT 100`
    );
    res.json({ novedades: rows });
  } catch (e) {
    console.error('[NOVEDADES] list:', e);
    res.status(500).json({ error: 'Error al cargar novedades' });
  }
});

// POST /novedades — publicar (solo ADMIN)
novedadesRouter.post('/novedades', requireAuth, async (req: AuthRequest, res) => {
  try {
    const role = await getUserRole(req.userId!);
    if (role !== 'admin') return res.status(403).json({ error: 'Solo admin puede publicar novedades' });

    const { titulo, descripcion, tipo, version, incidencia_id } = req.body || {};
    if (!titulo || typeof titulo !== 'string' || !titulo.trim()) {
      return res.status(400).json({ error: 'El título es obligatorio' });
    }
    const t = TIPOS_NOVEDAD.includes(tipo) ? tipo : 'FEATURE';
    const id = uuid();
    await query(
      `INSERT INTO novedades (id, titulo, descripcion, tipo, version, incidencia_id, creado_por_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        titulo.trim().slice(0, 200),
        typeof descripcion === 'string' ? descripcion : null,
        t,
        version ? String(version).slice(0, 20) : null,
        incidencia_id || null,
        req.userId,
      ]
    );
    const row = await queryOne<any>(
      `SELECT n.*, p.nombre AS creado_por_nombre, p.avatar_url AS creado_por_avatar
       FROM novedades n LEFT JOIN profiles p ON p.id = n.creado_por_id WHERE n.id = ?`,
      [id]
    );
    res.status(201).json(row);
  } catch (e) {
    console.error('[NOVEDADES] create:', e);
    res.status(500).json({ error: 'Error al publicar novedad' });
  }
});

// DELETE /novedades/:id — solo ADMIN
novedadesRouter.delete('/novedades/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const role = await getUserRole(req.userId!);
    if (role !== 'admin') return res.status(403).json({ error: 'Solo admin puede eliminar' });
    await query('DELETE FROM novedades WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[NOVEDADES] delete:', e);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});
