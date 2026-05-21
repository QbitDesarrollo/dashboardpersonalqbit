import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { generateApiToken } from '../middleware/apiToken.js';
import { query, queryOne, uuid } from '../db/mysql.js';

/**
 * Gestión de tokens de API (para el MCP de Tiusdei).
 * Estos endpoints los usa la UI de Tiusdei — auth con JWT de sesión normal.
 * Cada usuario gestiona SOLO sus propios tokens.
 */
export const apiTokensRouter = Router();

const MAX_TOKENS_POR_USUARIO = 10;

// GET /api/data/api-tokens — lista los tokens del usuario (sin el token plano)
apiTokensRouter.get('/api-tokens', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await query<any[]>(
      `SELECT id, token_prefix, label, last_used_at, created_at, revoked_at
       FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (e) {
    console.error('[API-TOKENS] list:', e);
    res.status(500).json({ error: 'Error al cargar tokens' });
  }
});

// POST /api/data/api-tokens — genera un token nuevo. Devuelve el token plano UNA sola vez.
apiTokensRouter.post('/api-tokens', requireAuth, async (req: AuthRequest, res) => {
  try {
    const label = typeof req.body?.label === 'string' && req.body.label.trim()
      ? req.body.label.trim().slice(0, 100)
      : 'Integración MCP';

    // Límite por usuario (solo cuenta los activos)
    const activeCount = await queryOne<{ n: number }>(
      'SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL',
      [req.userId]
    );
    if ((activeCount?.n ?? 0) >= MAX_TOKENS_POR_USUARIO) {
      return res.status(400).json({ error: `Máximo ${MAX_TOKENS_POR_USUARIO} tokens activos. Revoca alguno antes de crear otro.` });
    }

    const { plain, hash, prefix } = generateApiToken();
    const id = uuid();
    await query(
      'INSERT INTO api_tokens (id, user_id, token_hash, token_prefix, label) VALUES (?, ?, ?, ?, ?)',
      [id, req.userId, hash, prefix, label]
    );

    // El token plano se devuelve SOLO en esta respuesta — no se guarda ni se vuelve a mostrar
    res.status(201).json({
      id,
      token: plain,
      token_prefix: prefix,
      label,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[API-TOKENS] create:', e);
    res.status(500).json({ error: 'Error al generar token' });
  }
});

// DELETE /api/data/api-tokens/:id — revoca un token del usuario
apiTokensRouter.delete('/api-tokens/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const row = await queryOne<{ user_id: string }>('SELECT user_id FROM api_tokens WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Token no encontrado' });
    if (row.user_id !== req.userId) return res.status(403).json({ error: 'No puedes revocar este token' });
    await query('UPDATE api_tokens SET revoked_at = NOW(3) WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[API-TOKENS] revoke:', e);
    res.status(500).json({ error: 'Error al revocar token' });
  }
});
