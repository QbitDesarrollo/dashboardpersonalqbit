import { Router } from 'express';
import { supabaseAdmin } from '../services/supabase.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const checks: Record<string, string> = {
    server: 'ok',
    supabase: 'checking',
    smtp: process.env.SMTP_USER ? 'configured' : 'not_configured',
  };

  try {
    const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
    checks.supabase = error ? 'error' : 'ok';
  } catch {
    checks.supabase = 'unreachable';
  }

  const allOk = checks.supabase === 'ok';
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});
