// Reglas del aviso "¿Sigues trabajando?" después de la hora de cierre.

/** Tiempo desde que se inicia el timer en que no se pregunta: si le diste play, estás trabajando. */
export const GRACIA_MS = 3 * 60 * 60 * 1000;

const CLAVE = 'timer_cierre_confirmado:';

interface Almacen {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

export function debePreguntarCierre(datos: { eod: boolean; inicio: string | null; confirmadoHasta: number; ahora: number }): boolean {
  if (!datos.eod || datos.ahora < datos.confirmadoHasta) return false;
  const inicio = datos.inicio ? Date.parse(datos.inicio) : NaN;
  return Number.isNaN(inicio) || datos.ahora - inicio >= GRACIA_MS;
}

/** La confirmación vale para la sesión del timer y la comparten todas las pestañas. */
export function confirmadoHasta(almacen: Almacen, sesionId: string): number {
  try {
    return Number(almacen.getItem(CLAVE + sesionId)) || 0;
  } catch {
    return 0;
  }
}

export function guardarConfirmacion(almacen: Almacen, sesionId: string, hasta: number): void {
  try {
    almacen.setItem(CLAVE + sesionId, String(hasta));
  } catch {
    /* sin almacenamiento: vale solo para esta pestaña */
  }
}

export const esClaveDeConfirmacion = (clave: string | null) => !!clave && clave.startsWith(CLAVE);
