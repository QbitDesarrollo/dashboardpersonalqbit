import { Router } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { requireApiToken } from '../middleware/apiToken.js';
import { query, queryOne } from '../db/mysql.js';
import { getUserRole } from '../utils/roles.js';

/**
 * Projects for the MCP agent. A task's project is always optional; when given, it must be an active project of the
 * task's own brand, so a task of one client never lands in another client's project.
 */
export const mcpProyectosRouter = Router();

const ESTADO_PROYECTO: Record<string, string> = { en_curso: 'En curso', pausado: 'Pausado', terminado: 'Terminado', cancelado: 'Cancelado' };
const ESTADO_DESDE_ETIQUETA = Object.fromEntries(Object.entries(ESTADO_PROYECTO).map(([k, v]) => [v.toLowerCase(), k]));

export const ERROR_PROYECTO = 'TIUSDEI_INVALID_PROJECT';

/** True when projectId is an active project of brandId. */
export async function proyectoDeMarca(projectId: string, brandId: string): Promise<boolean> {
  return !!(await queryOne('SELECT id FROM projects WHERE id = ? AND brand_id = ? AND activo = 1', [projectId, brandId]));
}

export const mensajeProyecto = (projectId: string) =>
  `Proyecto no válido para la marca de la tarea: ${projectId}. Usa list_projects con el brandId de la tarea.`;

// ── GET /api/projects — list_projects ──
mcpProyectosRouter.get('/projects', requireApiToken, async (req: AuthRequest, res) => {
  try {
    const brandId = typeof req.query.brandId === 'string' && req.query.brandId ? req.query.brandId : null;
    const etiqueta = typeof req.query.status === 'string' && req.query.status ? req.query.status : null;
    const estado = etiqueta ? ESTADO_DESDE_ETIQUETA[etiqueta.toLowerCase()] : null;
    if (etiqueta && !estado) {
      res.status(400).json({ error: 'TIUSDEI_INVALID_STATUS', message: `Estado de proyecto no reconocido: ${etiqueta}. Usa: ${Object.values(ESTADO_PROYECTO).join(', ')}.` });
      return;
    }
    const conds = ['p.activo = 1'];
    const params: string[] = [];
    // A client user only sees projects of their own brands.
    if ((await getUserRole(req.userId!)) === 'cliente') {
      conds.push('p.brand_id IN (SELECT brand_id FROM client_brands WHERE user_id = ?)');
      params.push(req.userId!);
    }
    if (brandId) { conds.push('p.brand_id = ?'); params.push(brandId); }
    if (estado) { conds.push('p.estado = ?'); params.push(estado); }
    const filas = await query<any[]>(
      `SELECT p.id, p.nombre, p.estado, p.brand_id, b.nombre AS marca, l.nombre AS lider,
              DATE_FORMAT(p.fecha_fin, '%Y-%m-%d') AS fin,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS tareas,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.estado IN ('entregado','aprobado')) AS listas
         FROM projects p
         LEFT JOIN brands b ON b.id = p.brand_id
         LEFT JOIN profiles l ON l.id = p.lider_user_id
        WHERE ${conds.join(' AND ')}
        ORDER BY b.nombre, p.nombre`,
      params,
    );
    res.json(filas.map((f) => ({
      id: f.id,
      name: f.nombre,
      brand: { id: f.brand_id, name: f.marca ?? null },
      status: ESTADO_PROYECTO[f.estado] ?? f.estado,
      leader: f.lider ?? null,
      endDate: f.fin ?? null,
      tasks: Number(f.tareas),
      done: Number(f.listas),
    })));
  } catch (e) {
    console.error('[MCP] list projects:', e);
    res.status(500).json({ error: 'TIUSDEI_INTERNAL', message: 'Error al listar proyectos' });
  }
});
