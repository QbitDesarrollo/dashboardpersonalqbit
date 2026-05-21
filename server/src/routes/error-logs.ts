import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';

/**
 * Consola interna de errores. Solo admin.
 * GET    /error-logs            — lista paginada con filtros (level, resolved, q)
 * GET    /error-logs/stats      — conteos rápidos para el header
 * PATCH  /error-logs/:id/resolve — marca resuelto / no resuelto
 * POST   /error-logs/resolve-all — marca todos como resueltos
 * DELETE /error-logs            — borra los resueltos (o todos con ?all=1)
 */
export const errorLogsRouter = Router();

async function ensureAdmin(req: AuthRequest, res: any): Promise<boolean> {
  const ok = await hasRole(req.userId!, ['admin']);
  if (!ok) { res.status(403).json({ error: 'Solo admin' }); return false; }
  return true;
}

errorLogsRouter.get('/error-logs', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureAdmin(req, res))) return;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 100, 1), 500);
    const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);
    const conds: string[] = [];
    const params: unknown[] = [];
    if (req.query.resolved === '0' || req.query.resolved === '1') {
      conds.push('resolved = ?'); params.push(Number(req.query.resolved));
    }
    if (typeof req.query.level === 'string' && req.query.level) {
      conds.push('level = ?'); params.push(req.query.level);
    }
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      conds.push('(message LIKE ? OR tag LIKE ? OR route LIKE ?)');
      const like = `%${req.query.q.trim()}%`;
      params.push(like, like, like);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await query<any[]>(
      `SELECT e.*, p.nombre AS user_nombre
       FROM error_logs e LEFT JOIN profiles p ON p.id = e.user_id
       ${where} ORDER BY e.last_seen_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const total = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM error_logs e ${where}`, params);
    res.json({ logs: rows.map((r) => ({ ...r, resolved: !!r.resolved })), total: total?.n ?? 0, limit, offset });
  } catch (e) {
    console.error('[ERROR-LOGS] list:', e);
    res.status(500).json({ error: 'Error al cargar el log' });
  }
});

errorLogsRouter.get('/error-logs/stats', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureAdmin(req, res))) return;
    const stats = await queryOne<any>(
      `SELECT
         SUM(resolved = 0) AS abiertos,
         SUM(resolved = 1) AS resueltos,
         SUM(resolved = 0 AND last_seen_at > (NOW(3) - INTERVAL 1 HOUR)) AS ultima_hora,
         SUM(resolved = 0 AND level = 'fatal') AS fatales
       FROM error_logs`
    );
    res.json({
      abiertos: Number(stats?.abiertos || 0),
      resueltos: Number(stats?.resueltos || 0),
      ultima_hora: Number(stats?.ultima_hora || 0),
      fatales: Number(stats?.fatales || 0),
    });
  } catch (e) {
    console.error('[ERROR-LOGS] stats:', e);
    res.status(500).json({ error: 'Error al calcular stats' });
  }
});

errorLogsRouter.patch('/error-logs/:id/resolve', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureAdmin(req, res))) return;
    const resolved = req.body?.resolved === false ? 0 : 1;
    await query('UPDATE error_logs SET resolved = ? WHERE id = ?', [resolved, String(req.params.id)]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[ERROR-LOGS] resolve:', e);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

errorLogsRouter.post('/error-logs/resolve-all', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureAdmin(req, res))) return;
    await query('UPDATE error_logs SET resolved = 1 WHERE resolved = 0');
    res.json({ ok: true });
  } catch (e) {
    console.error('[ERROR-LOGS] resolve-all:', e);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

errorLogsRouter.delete('/error-logs', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureAdmin(req, res))) return;
    if (req.query.all === '1') {
      await query('DELETE FROM error_logs', []);
    } else {
      await query('DELETE FROM error_logs WHERE resolved = 1', []);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[ERROR-LOGS] delete:', e);
    res.status(500).json({ error: 'Error al limpiar' });
  }
});
