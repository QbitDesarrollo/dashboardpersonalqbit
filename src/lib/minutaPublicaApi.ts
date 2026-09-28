import type { MinutaVista } from './minutasApi';

/**
 * The client link of a minuta (MINUTAS-ENLACE-PLAN.md). No Tiusdei token here: the client carries its own signed
 * session, kept in this browser for seven days (the server decides when it stops working).
 */

const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3003');

export class ErrorEnlace extends Error {
  constructor(readonly status: number, mensaje: string) { super(mensaje); }
}

export interface MinutaCliente extends MinutaVista { visitante: string }

async function pedir<T>(token: string, ruta: string, opciones: { metodo?: string; sesion?: string; cuerpo?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/api/public/minuta/${encodeURIComponent(token)}${ruta}`, {
    method: opciones.metodo ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(opciones.sesion ? { Authorization: `Bearer ${opciones.sesion}` } : {}) },
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
  });
  const datos = await res.json().catch(() => null);
  if (!res.ok) throw new ErrorEnlace(res.status, (datos as { error?: string } | null)?.error ?? 'Algo falló. Intenta de nuevo en un momento.');
  return datos as T;
}

/** Image paths come relative to the API; the page may live on another origin in development. */
const conImagenes = (m: MinutaCliente): MinutaCliente => ({
  ...m,
  items: m.items.map((p) => ({ ...p, evidencias: p.evidencias.map((e) => (e.url.startsWith('/api/') ? { ...e, url: `${API_BASE}${e.url}` } : e)) })),
});

export const entrarCodigo = (token: string, codigo: string) =>
  pedir<{ titulo: string; marca: string; nombres: string[] }>(token, '/entrar', { metodo: 'POST', cuerpo: { codigo } });

export const entrarNombre = async (token: string, codigo: string, nombre: string) =>
  (await pedir<{ sesion: string }>(token, '/entrar', { metodo: 'POST', cuerpo: { codigo, nombre } })).sesion;

export const verMinuta = async (token: string, sesion: string) => conImagenes(await pedir<MinutaCliente>(token, '', { sesion }));

export const aprobarPunto = async (token: string, sesion: string, itemId: string) =>
  conImagenes(await pedir<MinutaCliente>(token, `/puntos/${itemId}/aprobar`, { metodo: 'POST', sesion, cuerpo: {} }));

export const pedirAjustePunto = async (token: string, sesion: string, itemId: string, motivo: string) =>
  conImagenes(await pedir<MinutaCliente>(token, `/puntos/${itemId}/ajuste`, { metodo: 'POST', sesion, cuerpo: { motivo } }));

export const comentarPunto = async (token: string, sesion: string, itemId: string, texto: string) =>
  conImagenes(await pedir<MinutaCliente>(token, `/puntos/${itemId}/notas`, { metodo: 'POST', sesion, cuerpo: { texto } }));

/** localStorage can be blocked (private mode): the page still works, it just asks again next time. */
const almacen = (prefijo: string) => ({
  leer(token: string): string | null {
    try { return localStorage.getItem(`${prefijo}:${token}`); } catch { return null; }
  },
  guardar(token: string, valor: string) {
    try { localStorage.setItem(`${prefijo}:${token}`, valor); } catch { /* not remembered */ }
  },
  borrar(token: string) {
    try { localStorage.removeItem(`${prefijo}:${token}`); } catch { /* nothing to clear */ }
  },
});

export const sesionGuardada = almacen('minuta_sesion');
/** Only to prefill the entry when the session expires; the name that counts is the one inside the session. */
export const nombreRecordado = almacen('minuta_nombre');
