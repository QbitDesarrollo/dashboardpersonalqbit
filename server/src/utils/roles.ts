import { queryOne } from '../db/mysql.js';

export async function getUserRole(userId: string): Promise<string> {
  const row = await queryOne<{ role: string }>('SELECT role FROM user_roles WHERE user_id = ? LIMIT 1', [userId]);
  if (row?.role) return row.role;
  const profile = await queryOne<{ rol: string }>('SELECT rol FROM profiles WHERE id = ?', [userId]);
  return profile?.rol || 'equipo';
}

export async function hasRole(userId: string, roles: string[]): Promise<boolean> {
  const role = await getUserRole(userId);
  return roles.includes(role);
}
