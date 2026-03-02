import 'dotenv/config';
import path from 'path';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import hpp from 'hpp';
import { setupSocket } from './socket.js';
import rateLimit from 'express-rate-limit';
import { emailRouter } from './routes/email.js';
import { configRouter } from './routes/config.js';
import { notificationsRouter } from './routes/notifications.js';
import { webhooksRouter } from './routes/webhooks.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { profilesRouter } from './routes/profiles.js';
import { clientsRouter } from './routes/clients.js';
import { brandsRouter } from './routes/brands.js';
import { desksRouter } from './routes/desks.js';
import { taskTypesRouter } from './routes/task-types.js';
import { featuresRouter } from './routes/features-routes.js';
import { sprintsRouter } from './routes/sprints.js';
import { releasesRouter } from './routes/releases.js';
import { tasksRouter } from './routes/tasks.js';
import { deliverablesRouter } from './routes/deliverables.js';
import { filesRouter } from './routes/files-routes.js';
import { activityRouter } from './routes/activity.js';
import { templatesRouter } from './routes/templates.js';
import { timeAnalyticsRouter } from './routes/time-analytics.js';
import { searchRouter } from './routes/search.js';
import { savedFiltersRouter } from './routes/saved-filters.js';
import { publicFormsPublicRouter, publicFormsAdminRouter } from './routes/public-forms.js';
import { automationsRouter } from './routes/automations.js';
import { integrationsRouter } from './routes/integrations.js';
import { googleCalendarRouter } from './routes/google-calendar.js';

// --- Validate required env vars at startup ---
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'tiusdei-secret-change-me') {
  console.error('[FATAL] JWT_SECRET no está configurado o usa el valor por defecto. Configura un secreto seguro.');
  if (process.env.NODE_ENV === 'production') process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('[FATAL] DATABASE_URL no configurado');
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env.PORT || '3003', 10);

// Trust proxy (behind nginx)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // handled by nginx
  crossOriginEmbedderPolicy: false,
}));

// Gzip compression
app.use(compression());

// Prevent HTTP parameter pollution
app.use(hpp());

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec',
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// Body parser with size limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Static uploads
const uploadsDir = path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // Favicon: short cache so admin changes take effect quickly
    if (filePath.includes('favicon')) {
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
  },
}));

// --- Rate Limiting ---

// Auth: 5 attempts per 15 min (brute force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados intentos de login' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// General API: scale for 100 concurrent users
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Demasiadas peticiones, intenta más tarde' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// --- Routes ---
app.use('/api', publicFormsPublicRouter);
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/data', profilesRouter);
app.use('/api/data', clientsRouter);
app.use('/api/data', brandsRouter);
app.use('/api/data', desksRouter);
app.use('/api/data', taskTypesRouter);
app.use('/api/data', featuresRouter);
app.use('/api/data', sprintsRouter);
app.use('/api/data', releasesRouter);
app.use('/api/data', tasksRouter);
app.use('/api/data', deliverablesRouter);
app.use('/api/data', filesRouter);
app.use('/api/data', activityRouter);
app.use('/api/data', templatesRouter);
app.use('/api/data', timeAnalyticsRouter);
app.use('/api/data', searchRouter);
app.use('/api/data', savedFiltersRouter);
app.use('/api/data', publicFormsAdminRouter);
app.use('/api/data', automationsRouter);
app.use('/api/data', integrationsRouter);
app.use('/api/data', googleCalendarRouter);
app.use('/api/config', configRouter);
app.use('/api/email', emailRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/webhooks', webhooksRouter);

// Global error handler - don't leak internal details
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }
  res.status(500).json({ error: 'Error interno del servidor' });
});

import { runDeadlineWarning } from './jobs/deadlineWarning.js';

const httpServer = http.createServer(app);
setupSocket(httpServer);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[TIUSDEI API] Servidor corriendo en puerto ${PORT}`);
  console.log(`[TIUSDEI API] Entorno: ${process.env.NODE_ENV || 'development'}`);

  // Job diario: avisos de deadline (tareas que vencen en 2 días)
  const INTERVAL_MS = 24 * 60 * 60 * 1000;
  setTimeout(() => runDeadlineWarning(), 60 * 1000);
  setInterval(runDeadlineWarning, INTERVAL_MS);
  console.log('[TIUSDEI API] WebSocket (comentarios en tiempo real) activo');
});
