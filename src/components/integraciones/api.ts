import { apiRequest } from '@/lib/apiClient';

export interface PermisosGoogle {
  conectado: boolean;
  calendar: boolean;
  drive: boolean;
  chat: boolean;
}

export async function obtenerPermisosGoogle(): Promise<PermisosGoogle> {
  const res = await apiRequest('/api/data/google-calendar/status');
  if (!res.ok) throw new Error('No se pudieron cargar tus integraciones.');
  const data: { permisos: PermisosGoogle } = await res.json();
  return data.permisos;
}

export async function revocarConexionGoogle(): Promise<PermisosGoogle> {
  const res = await apiRequest('/api/data/google/revocar', { method: 'POST' });
  if (!res.ok) throw new Error('No se pudo revocar la conexión de Google. Inténtalo de nuevo.');
  const data: { permisos: PermisosGoogle } = await res.json();
  return data.permisos;
}

export function conectarGoogle(): void {
  const base = import.meta.env.VITE_API_URL || window.location.origin;
  window.location.href = `${base}/api/auth/google?mode=connect`;
}
