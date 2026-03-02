import { Router } from 'express';
import { query } from '../db/mysql.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const checks: Record<string, string> = {
    server: 'ok',
    database: 'checking',
    smtp: process.env.SMTP_USER ? 'configured' : 'not_configured',
  };

  try {
    await query('SELECT 1');
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  const allOk = checks.database === 'ok';
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});
