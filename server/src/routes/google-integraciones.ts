import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne } from '../db/mysql.js';
import { GToken, makeOAuth2Client } from '../utils/googleAuth.js';
import { revocarGoogle } from '../utils/googlePermisos.js';

export const googleIntegracionesRouter = Router();

// POST /api/data/google/revocar: desconecta todos los servicios de la cuenta actual.
googleIntegracionesRouter.post('/google/revocar', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const token = await queryOne<GToken>('SELECT * FROM google_tokens WHERE user_id = ?', [userId]);
    const resultado = await revocarGoogle(
      token,
      (valor) => makeOAuth2Client().revokeToken(valor),
      () => query('DELETE FROM google_tokens WHERE user_id = ?', [userId]),
      // No registrar la respuesta de Google: puede contener el token en la URL.
      () => console.warn('[GOOGLE] No se pudo revocar en Google; se desconectará localmente.'),
    );
    res.json(resultado);
  } catch {
    console.error('[GOOGLE] No se pudo eliminar la conexión local.');
    res.status(500).json({ error: 'No se pudo revocar la conexión de Google. Inténtalo de nuevo.' });
  }
});
