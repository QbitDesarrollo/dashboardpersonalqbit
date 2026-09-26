/**
 * Dates as the agency lives them. The server and MySQL run in UTC, and Ecuador is UTC-5 (no daylight saving):
 * after 19:00 there, UTC is already tomorrow, so "today" must never come from CURDATE() or a bare Date.
 */

const ZONA = 'America/Guayaquil';

/** Today's date (YYYY-MM-DD) in Guayaquil. */
export const hoyEcuador = (ahora = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(ahora);

/** A YYYY-MM-DD date as a quoted SQL literal; anything else is rejected, so it is safe to interpolate. */
export function fechaSql(fecha: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error(`Fecha inválida: ${fecha}`);
  return `'${fecha}'`;
}

/** A DATE column value from mysql2 (a Date at UTC midnight) or a string, as YYYY-MM-DD. */
export function fechaDeColumna(valor: Date | string | null | undefined): string | null {
  if (!valor) return null;
  return valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor).slice(0, 10);
}
