import { query, queryOne, uuid } from '../db/mysql.js';

/**
 * Captura centralizada de errores de la plataforma → tabla error_logs.
 *
 * Se usa de dos formas:
 *  1. Patch de console.error: como todo el código hace `console.error('[TAG]', e)`
 *     en los catch, interceptamos eso y lo persistimos (sin perder el log de PM2).
 *  2. Middleware de Express (errorLogMiddleware): captura errores no atrapados con
 *     contexto de request (ruta, método, usuario, status).
 *
 * Dedup: si ya hay un error sin resolver con la misma firma (tag+message) en los
 * últimos 10 min, incrementa `count` y actualiza `last_seen_at` en vez de insertar.
 */

let capturing = false; // evita reentrada (si el insert falla y llama console.error)

interface LogErrorInput {
  level?: string;
  message: string;
  stack?: string | null;
  tag?: string | null;
  route?: string | null;
  method?: string | null;
  statusCode?: number | null;
  userId?: string | null;
}

const DEDUP_WINDOW_MIN = 10;

export async function logError(input: LogErrorInput): Promise<void> {
  if (capturing) return;
  capturing = true;
  try {
    const message = (input.message || '').slice(0, 8000);
    if (!message) return;
    const tag = input.tag ? input.tag.slice(0, 80) : null;
    const sig = (tag || '') + '|' + message.slice(0, 200);

    // Dedup: buscar uno reciente sin resolver con misma firma
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM error_logs
       WHERE resolved = 0
         AND COALESCE(tag,'') = COALESCE(?, '')
         AND LEFT(message, 200) = LEFT(?, 200)
         AND last_seen_at > (NOW(3) - INTERVAL ? MINUTE)
       ORDER BY last_seen_at DESC LIMIT 1`,
      [tag, message, DEDUP_WINDOW_MIN]
    );
    if (existing) {
      await query('UPDATE error_logs SET count = count + 1, last_seen_at = NOW(3) WHERE id = ?', [existing.id]);
      return;
    }

    await query(
      `INSERT INTO error_logs (id, level, tag, message, stack, route, method, status_code, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        input.level || 'error',
        tag,
        message,
        input.stack ? input.stack.slice(0, 16000) : null,
        input.route ? input.route.slice(0, 255) : null,
        input.method || null,
        input.statusCode ?? null,
        input.userId || null,
      ]
    );
  } catch {
    // Nunca propagar errores del propio logger
  } finally {
    capturing = false;
  }
}

/** Extrae el [TAG] del primer argumento si tiene el patrón. */
function extractTag(parts: unknown[]): string | null {
  const first = typeof parts[0] === 'string' ? parts[0] : '';
  const m = first.match(/^\[([A-Z0-9_\- ]{2,40})\]/i);
  return m ? m[1] : null;
}

function stringifyArgs(parts: unknown[]): { message: string; stack: string | null } {
  let stack: string | null = null;
  const pieces = parts.map((p) => {
    if (p instanceof Error) {
      if (!stack && p.stack) stack = p.stack;
      return p.message;
    }
    if (typeof p === 'string') return p;
    try { return JSON.stringify(p); } catch { return String(p); }
  });
  return { message: pieces.join(' '), stack };
}

/** Parchea console.error para persistir en DB además de loguear normal. */
export function initErrorCapture(): void {
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args); // mantener el log de PM2
    try {
      const tag = extractTag(args);
      const { message, stack } = stringifyArgs(args);
      void logError({ level: 'error', tag, message, stack });
    } catch {
      /* noop */
    }
  };

  process.on('unhandledRejection', (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    original('[UNHANDLED-REJECTION]', err);
    void logError({ level: 'fatal', tag: 'UNHANDLED-REJECTION', message: err.message, stack: err.stack || null });
  });

  process.on('uncaughtException', (err: Error) => {
    original('[UNCAUGHT-EXCEPTION]', err);
    void logError({ level: 'fatal', tag: 'UNCAUGHT-EXCEPTION', message: err.message, stack: err.stack || null });
  });
}

/** Middleware de Express para capturar errores con contexto de request. */
export function errorLogMiddleware(err: any, req: any, _res: any, next: any): void {
  try {
    void logError({
      level: 'error',
      tag: 'EXPRESS',
      message: err?.message || String(err),
      stack: err?.stack || null,
      route: req?.originalUrl || req?.url || null,
      method: req?.method || null,
      statusCode: err?.status || err?.statusCode || 500,
      userId: req?.userId || null,
    });
  } catch {
    /* noop */
  }
  next(err);
}
