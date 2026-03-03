import { google } from 'googleapis';
import { query, queryOne } from '../db/mysql.js';

const GC_ID = process.env.GOOGLE_CLIENT_ID || '';
const GC_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GC_REDIR = process.env.GOOGLE_REDIRECT_URI || '';

export interface GToken {
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expiry: Date | null;
  scope: string | null;
}

export function makeOAuth2Client() {
  return new google.auth.OAuth2(GC_ID, GC_SECRET, GC_REDIR);
}

export async function getAuthedClient(userId: string) {
  const t = await queryOne<GToken>('SELECT * FROM google_tokens WHERE user_id = ?', [userId]);
  if (!t) return null;

  const c = makeOAuth2Client();
  c.setCredentials({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expiry_date: t.token_expiry ? new Date(t.token_expiry).getTime() : undefined,
  });

  c.on('tokens', async (tokens) => {
    try {
      const exp = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
      if (tokens.refresh_token) {
        await query('UPDATE google_tokens SET access_token=?, refresh_token=?, token_expiry=? WHERE user_id=?',
          [tokens.access_token, tokens.refresh_token, exp, userId]);
      } else {
        await query('UPDATE google_tokens SET access_token=?, token_expiry=? WHERE user_id=?',
          [tokens.access_token, exp, userId]);
      }
    } catch (e) {
      console.error('[GOOGLE] token refresh save error:', e);
    }
  });

  return c;
}

export async function handleExpiredToken(e: unknown, userId: string, res: any): Promise<boolean> {
  const err = e as { code?: number; message?: string };
  if (err.code === 401 || err.message?.includes('invalid_grant')) {
    await query('DELETE FROM google_tokens WHERE user_id = ?', [userId]);
    res.status(401).json({ error: 'Token expirado. Reconecta tu cuenta de Google.' });
    return true;
  }
  return false;
}

export function hasDriveScope(scopeStr: string | null): boolean {
  if (!scopeStr) return false;
  return scopeStr.includes('drive');
}

export async function getUserTokenScopes(userId: string): Promise<string | null> {
  const t = await queryOne<{ scope: string | null }>('SELECT scope FROM google_tokens WHERE user_id = ?', [userId]);
  return t?.scope || null;
}
