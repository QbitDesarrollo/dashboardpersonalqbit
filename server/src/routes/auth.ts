import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { google } from 'googleapis';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';

export const authRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET!;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec';

// One-time auth codes for secure Google OAuth token exchange
const authCodeStore = new Map<string, { token: string; expires: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of authCodeStore.entries()) {
    if (val.expires < now) authCodeStore.delete(key);
  }
}, 5 * 60_000);

function getOAuth2Client() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Za-z]/, 'Al menos una letra')
    .regex(/[0-9]/, 'Al menos un número'),
  nombre: z.string().min(1),
  rol: z.enum(['admin', 'ops', 'equipo', 'cliente']).optional().default('equipo'),
});

function signToken(userId: string, rol: string): string {
  return jwt.sign(
    { sub: userId, role: rol },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * POST /api/auth/login
 */
authRouter.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Email y contraseña requeridos' });
      return;
    }
    const { email, password } = parsed.data;

    const user = await queryOne<{ id: string; email: string; password_hash: string; nombre: string; rol: string; activo: number }>(
      'SELECT id, email, password_hash, nombre, rol, activo FROM users WHERE email = ? AND activo = 1',
      [email.toLowerCase()]
    );

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    const token = signToken(user.id, user.rol);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
      },
    });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// Helper: get registration settings from site_settings
async function getRegistrationSettings(): Promise<{ enabled: boolean; allowedDomains: string[]; maxUsers: number }> {
  const rows = await query<{ key: string; value: string | null }[]>('SELECT `key`, value FROM site_settings WHERE `key` IN (?, ?, ?)', [
    'registration_enabled',
    'registration_allowed_domains',
    'registration_max_users',
  ]);
  const map: Record<string, string | null> = {};
  for (const r of rows) map[r.key] = r.value;

  const enabled = map.registration_enabled === 'true';
  const domainsStr = (map.registration_allowed_domains || '').trim();
  const allowedDomains = domainsStr ? domainsStr.split(/[,\s]+/).map((d) => d.toLowerCase().replace(/^@/, '')).filter(Boolean) : [];
  const maxUsers = parseInt(map.registration_max_users || '0', 10) || 0;

  return { enabled, allowedDomains, maxUsers };
}

// Helper: check if email domain is allowed
function isEmailDomainAllowed(email: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return allowedDomains.some((d) => domain === d || domain.endsWith('.' + d));
}

/**
 * POST /api/auth/register
 */
authRouter.post('/register', async (req, res) => {
  try {
    const regSettings = await getRegistrationSettings();

    if (!regSettings.enabled) {
      res.status(403).json({ error: 'El registro de nuevas cuentas está deshabilitado' });
      return;
    }

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos' });
      return;
    }
    const { email, password, nombre, rol } = parsed.data;
    const emailLower = email.toLowerCase();

    if (!isEmailDomainAllowed(emailLower, regSettings.allowedDomains)) {
      const hint = regSettings.allowedDomains.length > 0
        ? `Solo se permiten correos con dominios: ${regSettings.allowedDomains.map((d) => '@' + d).join(', ')}`
        : 'Dominio de email no permitido';
      res.status(400).json({ error: hint });
      return;
    }

    if (regSettings.maxUsers > 0) {
      const countRow = await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM users');
      const total = countRow?.total ?? 0;
      if (total >= regSettings.maxUsers) {
        res.status(403).json({ error: `Se ha alcanzado el límite máximo de usuarios (${regSettings.maxUsers})` });
        return;
      }
    }

    const id = uuid();
    const existing = await queryOne('SELECT id FROM users WHERE email = ?', [emailLower]);
    if (existing) {
      res.status(400).json({ error: 'El email ya está registrado' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await query(
      'INSERT INTO users (id, email, password_hash, nombre, rol) VALUES (?, ?, ?, ?, ?)',
      [id, emailLower, passwordHash, nombre, rol]
    );

    await query(
      'INSERT INTO profiles (id, email, nombre, rol) VALUES (?, ?, ?, ?)',
      [id, emailLower, nombre, rol]
    );

    await query(
      'INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)',
      [uuid(), id, rol]
    );

    const token = signToken(id, rol);
    res.status(201).json({
      token,
      user: { id, email: emailLower, nombre, rol },
    });
  } catch (error) {
    console.error('[AUTH] Register error:', error);
    res.status(500).json({ error: 'Error al registrarse' });
  }
});

/**
 * GET /api/auth/me - Current user profile
 */
authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const profile = await queryOne<{ id: string; nombre: string; email: string; rol: string; activo: number; avatar_url: string | null }>(
      'SELECT id, nombre, email, rol, activo, avatar_url FROM profiles WHERE id = ?',
      [userId]
    );

    if (!profile || !profile.activo) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const hasGoogle = await queryOne<{ user_id: string }>('SELECT user_id FROM google_tokens WHERE user_id = ?', [userId]);

    res.json({
      id: profile.id,
      nombre: profile.nombre,
      email: profile.email,
      rol: profile.rol,
      activo: !!profile.activo,
      avatar_url: profile.avatar_url || null,
      google_connected: !!hasGoogle,
    });
  } catch (error) {
    console.error('[AUTH] Me error:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

// ========== UPDATE MY PROFILE ==========
const profileUpdateSchema = z.object({
  nombre: z.string().min(1).max(255).optional(),
}).strict();

authRouter.patch('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });

    const { nombre } = parsed.data;
    if (!nombre) return res.status(400).json({ error: 'Nada que actualizar' });

    await query('UPDATE profiles SET nombre = ? WHERE id = ?', [nombre, userId]);
    await query('UPDATE users SET nombre = ? WHERE id = ?', [nombre, userId]);

    res.json({ success: true });
  } catch (error) {
    console.error('[AUTH] Update profile error:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

// ========== AVATAR UPLOAD ==========
const AVATARS_DIR = path.join(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATARS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuid()}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Solo imágenes JPG, PNG, WebP o GIF'));
  },
});

authRouter.post('/me/avatar', requireAuth, avatarUpload.single('avatar'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    if (!req.file) return res.status(400).json({ error: 'No se envió imagen' });

    const oldProfile = await queryOne<{ avatar_url: string | null }>('SELECT avatar_url FROM profiles WHERE id = ?', [userId]);
    if (oldProfile?.avatar_url) {
      const rawFile = oldProfile.avatar_url.split('/uploads/avatars/').pop()?.split('?')[0];
      if (rawFile) {
        const oldPath = path.join(AVATARS_DIR, rawFile);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }

    const base = req.protocol + '://' + (req.get('host') || `localhost:${process.env.PORT || 3003}`);
    const avatarUrl = `${base.replace(/\/$/, '')}/uploads/avatars/${req.file.filename}?t=${Date.now()}`;

    await query('UPDATE profiles SET avatar_url = ? WHERE id = ?', [avatarUrl, userId]);
    await query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, userId]);

    res.json({ avatar_url: avatarUrl });
  } catch (error) {
    console.error('[AUTH] Avatar upload error:', error);
    res.status(500).json({ error: 'Error al subir avatar' });
  }
});

authRouter.delete('/me/avatar', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const profile = await queryOne<{ avatar_url: string | null }>('SELECT avatar_url FROM profiles WHERE id = ?', [userId]);
    if (profile?.avatar_url) {
      const rawFile = profile.avatar_url.split('/uploads/avatars/').pop()?.split('?')[0];
      if (rawFile) {
        const oldPath = path.join(AVATARS_DIR, rawFile);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }
    await query('UPDATE profiles SET avatar_url = NULL WHERE id = ?', [userId]);
    await query('UPDATE users SET avatar_url = NULL WHERE id = ?', [userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('[AUTH] Delete avatar error:', error);
    res.status(500).json({ error: 'Error al eliminar avatar' });
  }
});

// ========== CHANGE PASSWORD ==========
authRouter.post('/me/change-password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { current_password, new_password } = req.body;
    if (!new_password) return res.status(400).json({ error: 'Nueva contraseña requerida' });
    if (new_password.length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });

    const user = await queryOne<{ password_hash: string; google_id: string | null }>('SELECT password_hash, google_id FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const isGoogleUser = !!user.google_id;
    const hasGoogleToken = await queryOne<{ user_id: string }>('SELECT user_id FROM google_tokens WHERE user_id = ?', [userId]);

    if (!isGoogleUser && !hasGoogleToken) {
      if (!current_password) return res.status(400).json({ error: 'Contraseña actual requerida' });
      const valid = await bcrypt.compare(current_password, user.password_hash);
      if (!valid) return res.status(400).json({ error: 'Contraseña actual incorrecta' });
    } else if (current_password) {
      const valid = await bcrypt.compare(current_password, user.password_hash);
      if (!valid) return res.status(400).json({ error: 'Contraseña actual incorrecta' });
    }

    const hash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('[AUTH] Change password error:', error);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

// ========== GOOGLE OAUTH 2.0 ==========

// Login con Google: register pide todos los permisos, login solo selecciona cuenta
authRouter.get('/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(500).json({ error: 'Google OAuth no configurado' });
    return;
  }
  const mode = req.query.mode as string;
  const oauth2Client = getOAuth2Client();
  // 'register' o 'link' fuerzan consent para obtener refresh_token
  const needConsent = mode === 'register' || mode === 'link';
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: needConsent ? 'consent' : 'select_account',
    scope: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
    state: mode || 'login',
  });
  res.redirect(url);
});

authRouter.get('/google/callback', async (req, res) => {
  try {
    const code = req.query.code as string;
    if (!code) { res.redirect(FRONTEND_URL + '/login?error=no_code'); return; }

    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: gUser } = await oauth2.userinfo.get();

    if (!gUser.email || !gUser.id) { res.redirect(FRONTEND_URL + '/login?error=no_email'); return; }

    const gEmail = gUser.email.toLowerCase();
    const gId = gUser.id;
    const gName = gUser.name || gEmail.split('@')[0];
    const gPicture = gUser.picture || null;

    // Try find user by google_id
    let user = await queryOne<{ id: string; email: string; nombre: string; rol: string; activo: number; avatar_url: string | null }>(
      'SELECT id, email, nombre, rol, activo, avatar_url FROM users WHERE google_id = ? AND activo = 1', [gId]
    );

    // Actualizar avatar con foto de Google si el usuario no tiene avatar propio
    if (user && gPicture && !user.avatar_url) {
      await query('UPDATE profiles SET avatar_url = ? WHERE id = ?', [gPicture, user.id]);
      await query('UPDATE users SET avatar_url = ? WHERE id = ?', [gPicture, user.id]);
    }

    // Try find by email and link Google account
    let justLinked = false;
    if (!user) {
      user = await queryOne<{ id: string; email: string; nombre: string; rol: string; activo: number; avatar_url: string | null }>(
        'SELECT id, email, nombre, rol, activo, avatar_url FROM users WHERE email = ? AND activo = 1', [gEmail]
      );
      if (user) {
        await query('UPDATE users SET google_id = ? WHERE id = ?', [gId, user.id]);
        // Poner foto de Google como avatar si no tiene uno
        if (gPicture && !user.avatar_url) {
          await query('UPDATE profiles SET avatar_url = ? WHERE id = ?', [gPicture, user.id]);
          await query('UPDATE users SET avatar_url = ? WHERE id = ?', [gPicture, user.id]);
        }
        justLinked = true;
        // If we just linked and there's no refresh_token, redirect to consent flow
        if (!tokens.refresh_token) {
          const oauth2Retry = getOAuth2Client();
          const retryUrl = oauth2Retry.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: ['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/drive.readonly'],
            state: 'link',
          });
          res.redirect(retryUrl);
          return;
        }
      }
    }

    // Auto-register if allowed
    if (!user) {
      const regSettings = await getRegistrationSettings();
      if (!regSettings.enabled) { res.redirect(FRONTEND_URL + '/login?error=registration_disabled'); return; }
      if (!isEmailDomainAllowed(gEmail, regSettings.allowedDomains)) { res.redirect(FRONTEND_URL + '/login?error=domain_not_allowed'); return; }
      if (regSettings.maxUsers > 0) {
        const c = await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM users');
        if ((c?.total ?? 0) >= regSettings.maxUsers) { res.redirect(FRONTEND_URL + '/login?error=max_users'); return; }
      }

      const id = uuid();
      const rol = 'equipo';
      const randomPass = await bcrypt.hash(uuid(), 10);
      await query('INSERT INTO users (id, email, password_hash, nombre, rol, google_id, avatar_url) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, gEmail, randomPass, gName, rol, gId, gPicture]);
      await query('INSERT INTO profiles (id, email, nombre, rol, avatar_url) VALUES (?, ?, ?, ?, ?)', [id, gEmail, gName, rol, gPicture]);
      await query('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)', [uuid(), id, rol]);
      user = { id, email: gEmail, nombre: gName, rol, activo: 1, avatar_url: gPicture };
      console.log('[AUTH] New Google user created:', gEmail);
    }

    // Save Google tokens
    if (tokens.access_token) {
      const expiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
      await query(
        `INSERT INTO google_tokens (user_id, access_token, refresh_token, token_expiry, scope) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE access_token = VALUES(access_token), refresh_token = COALESCE(VALUES(refresh_token), refresh_token), token_expiry = VALUES(token_expiry), scope = VALUES(scope)`,
        [user.id, tokens.access_token, tokens.refresh_token || null, expiry, tokens.scope || null]
      );
    }

    const token = signToken(user.id, user.rol);
    const authExchangeCode = uuid();
    authCodeStore.set(authExchangeCode, { token, expires: Date.now() + 60_000 });
    res.redirect(FRONTEND_URL + '/auth/google/success?code=' + encodeURIComponent(authExchangeCode));
  } catch (error) {
    console.error('[AUTH] Google callback error:', error);
    res.redirect(FRONTEND_URL + '/login?error=google_auth_failed');
  }
});

// Exchange one-time code for JWT token (secure Google OAuth flow)
authRouter.post('/google/exchange', async (req, res) => {
  try {
    const authCode = req.body.code as string | undefined;
    if (!authCode || typeof authCode !== 'string') {
      res.status(400).json({ error: 'Código requerido' });
      return;
    }
    const entry = authCodeStore.get(authCode);
    if (!entry || entry.expires < Date.now()) {
      authCodeStore.delete(authCode);
      res.status(401).json({ error: 'Código inválido o expirado' });
      return;
    }
    authCodeStore.delete(authCode);
    res.json({ token: entry.token });
  } catch (error) {
    console.error('[AUTH] Google exchange error:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});
