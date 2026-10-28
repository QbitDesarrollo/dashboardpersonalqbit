import { hasRole } from '../utils/roles.js';

export const puedeAdministrarDepartamentos = (userId: string) => hasRole(userId, ['admin']);
