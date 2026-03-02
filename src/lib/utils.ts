import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Devuelve las iniciales de un nombre (hasta 2 letras: primera del nombre + primera del apellido) */
export function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

/** Formatea una fecha YYYY-MM-DD sin conversión de zona horaria */
export function formatDateSafe(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
