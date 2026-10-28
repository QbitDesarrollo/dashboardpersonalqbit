// Qué servicios de Google puede usar Tiusdei con el token guardado de una persona.
// El login normal solo pide identidad; Calendar, Drive y Chat se conceden con
// "Conectar" (auth/google?mode=connect). Tener token no implica tener Calendar.

export interface PermisosGoogle {
  conectado: boolean;
  calendar: boolean;
  drive: boolean;
  chat: boolean;
}

export function permisosGoogle(tieneToken: boolean, scope: string | null | undefined): PermisosGoogle {
  if (!tieneToken) return { conectado: false, calendar: false, drive: false, chat: false };
  const s = scope || '';
  return {
    conectado: true,
    calendar: s.includes('https://www.googleapis.com/auth/calendar'),
    drive: s.includes('https://www.googleapis.com/auth/drive'),
    chat: s.includes('https://www.googleapis.com/auth/chat'),
  };
}

/** Google rechazó la llamada porque el token no incluye el permiso del servicio. */
export function esFaltaDePermiso(e: unknown): boolean {
  const err = (e ?? {}) as { code?: number; message?: string; errors?: { reason?: string }[] };
  if (err.code !== 403) return false;
  if ((err.errors || []).some((x) => x.reason === 'insufficientPermissions')) return true;
  return /insufficient authentication scopes/i.test(err.message || '');
}
