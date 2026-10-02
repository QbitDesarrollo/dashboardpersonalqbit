import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { consultarTareasDashboard } from '../dashboard/consultas.js';
import { getUserRole } from '../utils/roles.js';
export const dashboardDatosRouter = Router();

// A single lightweight task query: no file/read/deliverable enrichment or pagination.
// Visibility matches GET /tasks, including desk members, co-responsables and followers.
dashboardDatosRouter.get('/dashboard/tasks', requireAuth, async (req: AuthRequest, res) => {
  try {
    const role = await getUserRole(req.userId!);
    if (!['admin', 'cliente', 'equipo', 'ejecutivo'].includes(role)) return res.status(403).json({ error: 'Sin acceso al dashboard' });
    const filas = await consultarTareasDashboard(req.userId!, role);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ tasks: filas.map(({ brand_nombre, ...t }) => ({
      ...t, cantidad_entregables: Number(t.cantidad_entregables) || 0,
      tiempo_trabajado: Number(t.tiempo_trabajado) || 0,
      brands: brand_nombre ? { nombre: brand_nombre } : null,
    })) });
  } catch (e) {
    console.error('[DASHBOARD DATOS]', e);
    return res.status(500).json({ error: 'No se pudieron cargar los datos del dashboard' });
  }
});
