import 'dotenv/config';
import { verifySignedPath } from './utils/signedUrl.js';
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
import { departmentsRouter } from './routes/departments.js';
import { featuresRouter } from './routes/features-routes.js';
import { sprintsRouter } from './routes/sprints.js';
import { releasesRouter } from './routes/releases.js';
import { tasksRouter } from './routes/tasks.js';
import { dashboardDatosRouter } from './routes/dashboard-datos.js';
import { metricsRouter } from './routes/metrics.js';
import { incidenciasRouter } from './routes/incidencias.js';
import { novedadesRouter } from './routes/novedades.js';
import { deliverablesRouter } from './routes/deliverables.js';
import { filesRouter } from './routes/files-routes.js';
import { activityRouter } from './routes/activity.js';
import { templatesRouter } from './routes/templates.js';
import { taskFoldersRouter } from './routes/task-folders.js';
import { tiempoMarcasRouter } from './routes/tiempo-marcas.js';
import { devTeamRouter } from './routes/dev-team.js';
import { timeAnalyticsRouter } from './routes/time-analytics.js';
import { searchRouter } from './routes/search.js';
import { savedFiltersRouter } from './routes/saved-filters.js';
import { publicFormsPublicRouter, publicFormsAdminRouter } from './routes/public-forms.js';
import { automationsRouter } from './routes/automations.js';
import { integrationsRouter } from './routes/integrations.js';
import { googleCalendarRouter } from './routes/google-calendar.js';
import { googleDriveRouter } from './routes/google-drive.js';
import { googleChatRouter } from './routes/google-chat.js';
import { geminiRouter } from './routes/gemini.js';
import { customFieldsRouter } from './routes/custom-fields.js';
import { dashboardsRouter } from './routes/dashboards.js';
import { timeSessionsRouter } from './routes/time-sessions.js';
import { activityTrackingRouter } from './routes/activity-tracking.js';
import { attendanceRouter } from './routes/attendance.js';
import { teamMonitorRouter } from './routes/team-monitor.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { errorLogsRouter } from './routes/error-logs.js';
import { agentRouter } from './routes/agent.js';
import { clientBoardsRouter } from './routes/client-boards.js';
import { projectsRouter } from './routes/projects.js';
import { minutasRouter } from './routes/minutas.js';
import { crearRouterMinutasIa } from './routes/minutas-ia.js';
import { mcpMinutasRouter } from './routes/mcp-minutas.js';
import { crearRunnerHttp } from './minutas/ia/runner.js';
import { crearRouterReportes } from './routes/reportes.js';
import { iniciarProgramadorReportes } from './reportes/programador.js';
import { sendEmail } from './services/email.js';
import { publicClientRouter } from './routes/public-client.js';
import { crearRouterMinutaPublica } from './routes/public-minuta.js';
import { crearRouterMinutaEnlace } from './routes/minuta-enlace.js';
import { initErrorCapture, errorLogMiddleware } from './utils/errorLog.js';
import { setSocketIO } from './services/whatsapp.js';
import { avisoTimerMiddleware } from './utils/realtime.js';
import { ingresoAutomaticoMiddleware } from './services/ingresoAutomatico.js';
import { apiTokensRouter } from './routes/api-tokens.js';
import { mcpRouter } from './routes/mcp.js';
import { mcpProyectosRouter } from './routes/mcp-proyectos.js';

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

// Captura centralizada de errores -> tabla error_logs (consola interna)
initErrorCapture();

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
  // The web app reads it to know a 401 means the session is invalid (see middleware/auth.ts).
  exposedHeaders: ['X-Tiusdei-Sesion'],
  maxAge: 86400,
}));

// Body parser with size limits
app.use(express.json({ limit: '2mb' }));
// Avisa a los otros dispositivos del usuario cuando su timer cambia
app.use('/api/data', avisoTimerMiddleware);
// La primera acción de trabajo del día marca el ingreso si la persona no lo hizo
app.use('/api/data', ingresoAutomaticoMiddleware);
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Static uploads
const uploadsDir = path.join(process.cwd(), 'uploads');
// Screenshots del Team Monitor: datos sensibles de empleados — solo con URL firmada
// (las firma team-monitor.ts para admins/ejecutivos, TTL 6h)
app.use('/uploads/screenshots', (req, res, next) => {
  const fullPath = `/uploads/screenshots${req.path}`;
  const { exp, sig } = req.query as Record<string, string>;
  if (!verifySignedPath(fullPath, exp, sig)) {
    return res.status(403).json({ error: 'URL no válida o expirada' });
  }
  next();
});
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // Nada servido desde /uploads debe poder ejecutar scripts en el origen de la app.
    // (sandbox no afecta a <img>; se exceptúa .pdf para no romper el visor del navegador)
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!/\.pdf$/i.test(filePath)) {
      res.setHeader('Content-Security-Policy', 'sandbox');
    }
    if (/\.(svg|html?|xml|xhtml|js)$/i.test(filePath)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
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

// General API: ~20 users per IP (office/shared network)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: { error: 'Demasiadas peticiones, intenta más tarde' },
  standardHeaders: true,
  legacyHeaders: false,
  // Log every cut so a shared office IP hitting the limit is visible in the logs.
  handler: (req, res, _next, options) => {
    console.warn(`[RATE-LIMIT] 429 ip=${req.ip} ${req.method} ${req.originalUrl.split('?')[0]}`);
    res.status(options.statusCode).json(options.message);
  },
});
app.use('/api/', apiLimiter);

// --- Routes ---
app.use('/api', publicFormsPublicRouter);
app.use('/api', publicClientRouter);
app.use('/api', crearRouterMinutaPublica({ correo: { enviar: sendEmail }, frontendUrl: process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec' }));
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/data', profilesRouter);
app.use('/api/data', clientsRouter);
app.use('/api/data', brandsRouter);
app.use('/api/data', desksRouter);
app.use('/api/data', taskTypesRouter);
app.use('/api/data', departmentsRouter);
app.use('/api/data', featuresRouter);
app.use('/api/data', sprintsRouter);
app.use('/api/data', releasesRouter);
app.use('/api/data', tasksRouter);
app.use('/api/data', dashboardDatosRouter);
app.use('/api/data', deliverablesRouter);
app.use('/api/data', filesRouter);
app.use('/api/data', activityRouter);
app.use('/api/data', templatesRouter);
app.use('/api/data', taskFoldersRouter);
app.use('/api/data', tiempoMarcasRouter);
app.use('/api/data', devTeamRouter);
app.use('/api/data', timeAnalyticsRouter);
app.use('/api/data', metricsRouter);
app.use('/api/data', incidenciasRouter);
app.use('/api/data', novedadesRouter);
app.use('/api/data', searchRouter);
app.use('/api/data', savedFiltersRouter);
app.use('/api/data', publicFormsAdminRouter);
app.use('/api/data', automationsRouter);
app.use('/api/data', integrationsRouter);
app.use('/api/data', googleCalendarRouter);
app.use('/api/data', googleDriveRouter);
app.use('/api/data', googleChatRouter);
app.use('/api/data', geminiRouter);
app.use('/api/data', customFieldsRouter);
app.use('/api/data', dashboardsRouter);
app.use('/api/data', timeSessionsRouter);
app.use('/api/data', activityTrackingRouter);
app.use('/api/data', attendanceRouter);
app.use('/api/data', teamMonitorRouter);
app.use('/api/data', whatsappRouter);
app.use('/api/data', errorLogsRouter);
app.use('/api/data', agentRouter);
app.use('/api/data', clientBoardsRouter);
app.use('/api/data', projectsRouter);
// One Codex runner for minutas and weekly project reports (it runs one job at a time).
const runnerIa = crearRunnerHttp({
  url: process.env.CODEX_RUNNER_URL ?? '',
  token: process.env.CODEX_RUNNER_TOKEN ?? '',
});
const depsReportes = {
  runner: runnerIa,
  correo: { enviar: sendEmail },
  dirPdf: path.join(process.cwd(), 'uploads', 'reportes'),
  frontendUrl: process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec',
};
app.use('/api/data', crearRouterMinutasIa(runnerIa));
app.use('/api/data', crearRouterReportes(depsReportes));
app.use('/api/data', crearRouterMinutaEnlace({ runner: runnerIa, correo: { enviar: sendEmail }, frontendUrl: depsReportes.frontendUrl }));
app.use('/api/data', minutasRouter);
app.use('/api/data', apiTokensRouter);
app.use('/api', mcpMinutasRouter);
app.use('/api', mcpProyectosRouter);
app.use('/api', mcpRouter);
app.use('/api/config', configRouter);
app.use('/api/email', emailRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/webhooks', webhooksRouter);

// Global error handler - don't leak internal details
app.use((err: any, req: express.Request, _res: express.Response, next: express.NextFunction) => {
  errorLogMiddleware(err, req, _res, () => {});
  next(err);
});
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }
  res.status(500).json({ error: 'Error interno del servidor' });
});

import { runDeadlineWarning } from './jobs/deadlineWarning.js';
import { runInactivityMonitor } from './jobs/inactivityMonitor.js';
import { runTimeEntryAutoClose } from './jobs/timeEntryAutoClose.js';
import { runEodTimerAlert } from './jobs/eodTimerAlert.js';
import { runEodTimerClose } from './jobs/eodTimerClose.js';
import { runHeartbeatAutoPause } from './jobs/heartbeatAutoPause.js';
import { runRecordatorios } from './jobs/recordatorios.js';

const httpServer = http.createServer(app);
setupSocket(httpServer);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[TIUSDEI API] Servidor corriendo en puerto ${PORT}`);
  console.log(`[TIUSDEI API] Entorno: ${process.env.NODE_ENV || 'development'}`);

  // Job diario: avisos de deadline (tareas que vencen en 2 días)
  const INTERVAL_MS = 24 * 60 * 60 * 1000;
  setTimeout(() => runDeadlineWarning(), 60 * 1000);
  setInterval(runDeadlineWarning, INTERVAL_MS);

  // Job: monitor de inactividad (cada 60 segundos)
  setInterval(runInactivityMonitor, 60 * 1000);
  setInterval(runTimeEntryAutoClose, 30 * 60 * 1000); // cada 30 min
  setInterval(runEodTimerAlert, 30 * 60 * 1000); // Pieza 3 Timer: alerta cierre fin del día
  setInterval(runEodTimerClose, 30 * 60 * 1000); // Cierre DURO de timers 2h después del aviso (incidencia ca963e24)
  setInterval(runHeartbeatAutoPause, 2 * 60 * 1000); // Auto-pausa si Tiusdei se cerró (latido >5 min sin llegar)
  setInterval(runRecordatorios, 10 * 60 * 1000); // Recordatorios sutiles: sin check-in / conectado sin tarea activa
  setTimeout(() => runRecordatorios(), 2 * 60 * 1000);
  runEodTimerAlert();
  runTimeEntryAutoClose().catch(() => {}); // run once on boot
  iniciarProgramadorReportes(depsReportes); // Reportes semanales de proyecto (REPORTES-PLAN.md)
  console.log('[TIUSDEI API] WebSocket (comentarios en tiempo real) activo');
});
