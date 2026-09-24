/** Client of the local Codex runner (codex-runner/, 127.0.0.1 only, bearer token). */

export interface SaludIa { listo: boolean; detalle: string }
export interface RunnerIa {
  salud(): Promise<SaludIa>;
  generar(datos: { transcripcion: string; fecha: string }): Promise<unknown>;
}

/** Errors whose message can be shown to the user as-is. */
export class ErrorRunner extends Error {}

const SIN_CONFIGURAR = 'La IA no está configurada en el servidor.';
const NO_RESPONDE = 'El servicio de IA no responde.';
const TOKEN_RECHAZADO = 'El servicio de IA rechazó la conexión. Revisa la configuración del servidor.';

export function crearRunnerHttp({ url, token, limiteMs = 200_000 }: { url: string; token: string; limiteMs?: number }): RunnerIa {
  const configurado = !!url && !!token;

  const pedir = async (ruta: string, init: RequestInit, ms: number) => {
    try {
      return await fetch(`${url}${ruta}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(ms),
      });
    } catch {
      throw new ErrorRunner(NO_RESPONDE);
    }
  };

  return {
    async salud() {
      if (!configurado) return { listo: false, detalle: SIN_CONFIGURAR };
      try {
        const res = await pedir('/salud', { method: 'GET' }, 20_000);
        if (res.status === 401) return { listo: false, detalle: TOKEN_RECHAZADO };
        return (await res.json()) as SaludIa;
      } catch (e) {
        return { listo: false, detalle: e instanceof ErrorRunner ? e.message : NO_RESPONDE };
      }
    },

    async generar(datos) {
      if (!configurado) throw new ErrorRunner(SIN_CONFIGURAR);
      const res = await pedir('/minuta', { method: 'POST', body: JSON.stringify(datos) }, limiteMs);
      if (res.status === 401) throw new ErrorRunner(TOKEN_RECHAZADO);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new ErrorRunner(typeof body?.error === 'string' ? body.error : NO_RESPONDE);
      return body;
    },
  };
}
