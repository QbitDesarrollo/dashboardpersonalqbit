import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'socket.io';

// Avisos en tiempo real al propio usuario en todos sus dispositivos (incidencia de
// Steven, 28-ago: si se daba play en el celular, la PC no se enteraba sin recargar).
// Cada pestaña abierta está en la sala `user:<id>` y, al recibir el aviso, vuelve a
// pedir su timer y su lista de tareas.
let io: Server | null = null;
export function setRealtimeServer(server: Server): void { io = server; }

export function avisarCambioTimer(userId?: string | null): void {
  if (io && userId) io.to(`user:${userId}`).emit('timer:changed', { at: Date.now() });
}

// Peticiones que cambian el timer de quien las hace. Se avisa cuando la respuesta
// terminó bien, sin tocar cada ruta.
const CAMBIA_TIMER = [
  /^\/time-sessions\/(start|pause-mine|resume-auto)$/,
  /^\/time-sessions\/[^/]+\/(stop|pause|resume)$/,
  /^\/attendance\/(check-in|check-out|lunch-start|lunch-end)$/,
  /^\/tasks\/[^/]+\/handoff$/,
];
export function avisoTimerMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'POST' || req.method === 'PATCH') {
    const patchConTimer = req.method === 'PATCH' && /^\/tasks\/[^/]+$/.test(req.path)
      && !!req.body && typeof req.body === 'object' && ('timer_activo' in req.body || 'tiempo_trabajado' in req.body);
    if (patchConTimer || (req.method === 'POST' && CAMBIA_TIMER.some((r) => r.test(req.path)))) {
      res.on('finish', () => {
        if (res.statusCode < 400) avisarCambioTimer((req as Request & { userId?: string }).userId);
      });
    }
  }
  next();
}

/** Comentario nuevo a quienes tienen la tarea abierta (sala `task:<id>`). */
export function emitirComentario(taskId: string, comment: unknown): void {
  if (io && comment) io.to(`task:${taskId}`).emit('comment:new', comment);
}
