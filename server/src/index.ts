import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { emailRouter } from './routes/email.js';
import { notificationsRouter } from './routes/notifications.js';
import { webhooksRouter } from './routes/webhooks.js';
import { healthRouter } from './routes/health.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// CORS - allow frontend origin
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  credentials: true,
}));

// Parse JSON bodies (limit to 5MB for file metadata)
app.use(express.json({ limit: '5mb' }));

// Routes
app.use('/api/health', healthRouter);
app.use('/api/email', emailRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/webhooks', webhooksRouter);

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[TIUSDEI API] Servidor corriendo en puerto ${PORT}`);
  console.log(`[TIUSDEI API] Entorno: ${process.env.NODE_ENV || 'development'}`);
});
