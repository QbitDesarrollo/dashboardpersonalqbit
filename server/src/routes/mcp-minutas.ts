import { Router, type NextFunction, type Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { requireApiToken } from '../middleware/apiToken.js';
import { query } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';
import { cargarDetalle } from '../minutas/consultas.js';
import { esImagenPropia, fechaIso } from '../minutas/esquemas.js';
import { hoyEcuador, minutaParaAgente, resumenParaAgente } from '../minutas/formatoMcp.js';
import { crearMinuta, ErrorMinuta, listarMinutas, vincularTarea } from '../minutas/servicio.js';

/**
 * Minutas for the Tiusdei MCP (mcp-server/: list_minutas, get_minuta, create_minuta,
 * link_task_to_minuta_point). Same rules as the web app: internal team only, shared service logic.
 * Kept out of routes/mcp.ts on purpose: that file is already too large.
 */
export const mcpMinutasRouter = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec';
const EDITOR_DIR = path.join(process.cwd(), 'uploads', 'editor');
const MAX_IMAGENES = 6;
const MAX_BYTES_IMAGEN = 4 * 1024 * 1024;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

const fallo = (res: Response, status: number, error: string, message: string) => res.status(status).json({ error, message });

// Express 4 does not catch rejected async handlers; answer instead of hanging.
const seguro = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) => (req: AuthRequest, res: Response) => {
  fn(req, res).catch((e) => {
    if (e instanceof ErrorMinuta) return fallo(res, e.status, e.codigo, e.message);
    console.error('[MCP-MINUTAS]', e);
    if (!res.headersSent) fallo(res, 500, 'TIUSDEI_ERROR', 'Error interno');
  });
};

async function soloEquipo(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (await hasRole(req.userId!, ['admin', 'ejecutivo', 'equipo'])) return next();
    fallo(res, 403, 'TIUSDEI_FORBIDDEN', 'Las minutas son solo para el equipo interno.');
  } catch (e) {
    console.error('[MCP-MINUTAS] permisos:', e);
    fallo(res, 500, 'TIUSDEI_ERROR', 'Error interno');
  }
}

mcpMinutasRouter.use(['/minutas', '/minuta-points'], requireApiToken, soloEquipo);

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

mcpMinutasRouter.get('/minutas', seguro(async (req, res) => {
  const minutas = await listarMinutas({ brandId: texto(req.query.brandId), projectId: texto(req.query.projectId), q: texto(req.query.query) });
  res.json({ minutas: minutas.map((m) => resumenParaAgente(m, FRONTEND_URL)) });
}));

mcpMinutasRouter.get('/minutas/:id', seguro(async (req, res) => {
  const detalle = await cargarDetalle(String(req.params.id));
  if (!detalle) return fallo(res, 404, 'TIUSDEI_NOT_FOUND', 'No existe esa minuta.');
  res.json(minutaParaAgente(detalle, FRONTEND_URL));
}));

// Screenshots uploaded to Tiusdei, read from disk so the agent can see them. Drive files stay as links.
mcpMinutasRouter.get('/minutas/:id/images', seguro(async (req, res) => {
  const detalle = await cargarDetalle(String(req.params.id));
  if (!detalle) return fallo(res, 404, 'TIUSDEI_NOT_FOUND', 'No existe esa minuta.');
  const imagenes: { point: string; name: string; mimeType: string; data: string }[] = [];
  let omitidas = 0;
  for (const item of detalle.items) {
    for (const ev of item.evidencias) {
      if (ev.tipo !== 'imagen' || !esImagenPropia(ev.url)) continue;
      if (imagenes.length >= MAX_IMAGENES) { omitidas += 1; continue; }
      const archivo = path.basename(new URL(ev.url).pathname);
      const datos = await fs.readFile(path.join(EDITOR_DIR, archivo)).catch(() => null);
      if (!datos || datos.length > MAX_BYTES_IMAGEN) { omitidas += 1; continue; }
      const ext = archivo.split('.').pop()!.toLowerCase();
      imagenes.push({ point: `${detalle.numero}.${item.numero}`, name: ev.nombre, mimeType: MIME[ext], data: datos.toString('base64') });
    }
  }
  res.json({ images: imagenes, ...(omitidas ? { omitted: omitidas } : {}) });
}));

const puntoSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10000).optional(),
  assigneeId: z.string().uuid().optional(),
  client: z.boolean().optional(),
  dueDate: fechaIso.optional(),
});
const crearMcpSchema = z.object({
  brandId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  date: fechaIso.optional(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(20000).optional(),
  publish: z.boolean().optional(),
  points: z.array(puntoSchema).max(100).default([]),
});

mcpMinutasRouter.post('/minutas', seguro(async (req, res) => {
  const parsed = crearMcpSchema.safeParse(req.body);
  if (!parsed.success) return fallo(res, 400, 'TIUSDEI_VALIDATION', JSON.stringify(parsed.error.flatten().fieldErrors));
  const b = parsed.data;
  const responsables = [...new Set(b.points.map((p) => p.assigneeId).filter((id): id is string => !!id))];
  if (responsables.length) {
    const existentes = await query<{ id: string }[]>(`SELECT id FROM profiles WHERE id IN (${responsables.map(() => '?').join(',')})`, responsables);
    const faltan = responsables.filter((id) => !existentes.some((e) => e.id === id));
    if (faltan.length) return fallo(res, 400, 'TIUSDEI_INVALID_ASSIGNEE', `No existen estas personas: ${faltan.join(', ')}`);
  }
  const id = await crearMinuta({
    brand_id: b.brandId,
    project_id: b.projectId ?? null,
    fecha: b.date ?? hoyEcuador(),
    titulo: b.title,
    resumen: b.summary ?? null,
    estado: b.publish ? 'publicada' : 'borrador',
    items: b.points.map((p) => ({
      titulo: p.title,
      descripcion: p.description ?? null,
      responsable_user_id: p.client ? null : p.assigneeId ?? null,
      responsable_cliente: !!p.client,
      fecha_compromiso: p.dueDate ?? null,
    })),
  }, req.userId!);
  const detalle = await cargarDetalle(id);
  res.status(201).json({
    id,
    code: detalle!.codigo,
    url: `${FRONTEND_URL}/minutas/${id}`,
    points: detalle!.items.map((i) => ({ id: i.id, code: `${detalle!.numero}.${i.numero}`, title: i.titulo })),
  });
}));

mcpMinutasRouter.post('/minuta-points/:id/tasks', seguro(async (req, res) => {
  const parsed = z.object({ taskId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return fallo(res, 400, 'TIUSDEI_VALIDATION', 'taskId inválido');
  const puntoId = String(req.params.id);
  const minutaId = await vincularTarea(puntoId, parsed.data.taskId);
  const detalle = await cargarDetalle(minutaId);
  const punto = detalle!.items.find((i) => i.id === puntoId)!;
  res.json({ ok: true, minutaId, point: `${detalle!.numero}.${punto.numero}`, taskId: parsed.data.taskId });
}));
