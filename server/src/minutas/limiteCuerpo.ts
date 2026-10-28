import type { NextFunction, Request, Response } from 'express';

/**
 * La subida de evidencia por MCP manda el archivo en base64 dentro del JSON. Si el cuerpo
 * supera el límite del parser, Express corta antes de la ruta: se responde con el mismo
 * código que el tope de 10 MB del archivo, para que el agente entienda el error.
 */
export function cuerpoDemasiadoGrande(err: Error & { type?: string }, _req: Request, res: Response, next: NextFunction) {
  if (err?.type !== 'entity.too.large') return next(err);
  res.status(413).json({ error: 'TIUSDEI_FILE_TOO_LARGE', message: 'El archivo pesa más de 10 MB.' });
}
