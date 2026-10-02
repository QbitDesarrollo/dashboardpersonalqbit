/** Same row visibility as GET /tasks; values are always SQL parameters. */
export function alcanceDashboard(userId: string, role: string) {
  let acceso: string; let parametros: string[];
  if (role === 'admin') { acceso = '1 = 1'; parametros = []; }
  else if (role === 'cliente') {
    acceso = 't.brand_id IN (SELECT brand_id FROM client_brands WHERE user_id = ?)';
    parametros = [userId];
  } else if (role === 'equipo' || role === 'ejecutivo') {
    acceso = `(t.desk_id IN (SELECT desk_id FROM desk_members WHERE user_id = ?)
      OR t.responsable_user_id = ?
      OR t.id IN (SELECT task_id FROM task_responsables WHERE user_id = ?)
      OR t.id IN (SELECT task_id FROM task_seguidores WHERE user_id = ?))`;
    parametros = [userId, userId, userId, userId];
  } else { throw new Error('Rol sin acceso al dashboard'); }
  return { acceso, parametros };
}
