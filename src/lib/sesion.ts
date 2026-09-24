/** Session tokens last 7 days; the app asks for a fresh one once they are older than this. */
const HORAS_PARA_RENOVAR = 12;

/** Whether the token was issued long enough ago to renew it. Only reads its payload; the server verifies. */
export function debeRenovar(token: string | null, ahoraMs = Date.now()): boolean {
  if (!token) return false;
  try {
    const cuerpo = token.split('.')[1];
    const { iat } = JSON.parse(atob(cuerpo.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof iat === 'number' && ahoraMs - iat * 1000 > HORAS_PARA_RENOVAR * 3600_000;
  } catch {
    return false;
  }
}
