/** Preferencia local del navegador para el aviso no invasivo de la tarjeta Reuniones. */
export const AVISO_CALENDAR_KEY = 'tiusdei:calendar:aviso-oculto-hasta';
const SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;

type Lectura = Pick<Storage, 'getItem'>;
type Escritura = Pick<Storage, 'setItem'>;

export function avisoCalendarOculto(now: number, storage: Lectura): boolean {
  try {
    const hasta = Number(storage.getItem(AVISO_CALENDAR_KEY));
    return Number.isFinite(hasta) && hasta > now;
  } catch {
    return false;
  }
}

export function ocultarAvisoCalendar(now: number, storage: Escritura): void {
  try {
    storage.setItem(AVISO_CALENDAR_KEY, String(now + SIETE_DIAS));
  } catch {
    // El bloqueo de almacenamiento no debe interrumpir el dashboard.
  }
}
