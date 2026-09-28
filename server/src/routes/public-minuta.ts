import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { z } from 'zod';
import { query } from '../db/mysql.js';
import { createNotification } from '../utils/notifications.js';
import { minutaActividadClienteEmail, type EmailOptions } from '../services/email.js';
import { aplicarAccion } from '../minutas/domain.js';
import { esImagenPropia } from '../minutas/esquemas.js';
import { cargarDetalle, codigo, insertarNota } from '../minutas/consultas.js';
import { evaluarIntento, minutaParaCliente, nombresDeEnvios } from '../minutas/enlace/dominio.js';
import * as repo from '../minutas/enlace/repositorio.js';
import { firmarSesion, imagenFirmadaValida, leerSesion, rutaImagenFirmada, type SesionCliente } from '../minutas/enlace/sesion.js';

/**
 * Public page of a minuta for the client (MINUTAS-ENLACE-PLAN.md). The link token finds the minuta; the access code
 * opens a signed session that carries the name the person entered. Everything checks the link is on and that the
 * session belongs to its current version.
 */

export interface DepsMinutaPublica {
  /** Requests per minute and IP (tests raise it). */
  limitePorMinuto?: number;
  ahora?: () => Date;
  /** Email to the owner of the minuta when the client acts; without it only the in-app notification goes. */
  correo?: { enviar(opciones: EmailOptions): Promise<boolean> };
  frontendUrl?: string;
}

const NO_DISPONIBLE = 'Este enlace ya no está disponible.';
const TIPO_IMAGEN: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const DIR_IMAGENES = () => path.join(process.cwd(), 'uploads', 'editor');

const entrarSchema = z.object({
  codigo: z.string().max(20),
  nombre: z.string().trim().min(1).max(120).optional(),
});
const motivoSchema = z.object({ motivo: z.string().trim().min(1).max(2000) });
const notaSchema = z.object({ texto: z.string().trim().min(1).max(5000) });

export function crearRouterMinutaPublica(deps: DepsMinutaPublica = {}) {
  const router = Router();
  const ahora = deps.ahora ?? (() => new Date());
  const limite = rateLimit({ windowMs: 60_000, max: deps.limitePorMinuto ?? 60, standardHeaders: true, legacyHeaders: false });

  const enlaceActivo = async (req: Request, res: Response) => {
    const m = await repo.porToken(String(req.params.token));
    if (!m || !m.share_activo || !m.share_codigo) { res.status(404).json({ error: NO_DISPONIBLE }); return null; }
    return m;
  };
  /** The link plus a session of its current version, or a 401 the page answers by asking for the code again. */
  const conSesion = async (req: Request, res: Response): Promise<{ m: repo.EnlaceMinuta; s: SesionCliente } | null> => {
    const m = await enlaceActivo(req, res);
    if (!m) return null;
    const auth = req.headers.authorization;
    const s = leerSesion(auth?.startsWith('Bearer ') ? auth.slice(7) : undefined);
    if (!s || s.minutaId !== m.id || s.version !== m.share_version) { res.status(401).json({ error: 'Vuelve a ingresar el código.' }); return null; }
    return { m, s };
  };
  const vista = async (m: repo.EnlaceMinuta, s: SesionCliente) => {
    const detalle = await cargarDetalle(m.id);
    return { ...minutaParaCliente(detalle!, (e) => rutaImagenFirmada(m.share_token!, e.id, m.share_version)), visitante: s.nombre };
  };
  const avisar = async (m: repo.EnlaceMinuta, quien: string, que: string, punto: { numero: number; titulo: string }, texto?: string) => {
    const codigoPunto = `${m.numero}.${punto.numero}`;
    await createNotification(m.owner_user_id, `${quien} ${que} el punto ${codigoPunto} de la minuta ${codigo(m.numero)} · ${m.titulo} (${m.brand_nombre}).`);
    if (!deps.correo || !m.owner_email) return;
    // The email must never hold up or break the client's action.
    void minutaActividadClienteEmail({
      quien, accion: que, codigoPunto, punto: punto.titulo, codigoMinuta: codigo(m.numero), titulo: m.titulo, marca: m.brand_nombre, texto,
      url: `${deps.frontendUrl ?? ''}/minutas/${m.id}`,
    }).then((plantilla) => deps.correo!.enviar({ ...plantilla, to: m.owner_email! })).catch((e) => console.error('[MINUTA PUBLICA] correo:', e));
  };
  const seguro = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    try { await fn(req, res); } catch (e) {
      console.error('[MINUTA PUBLICA]', e);
      if (!res.headersSent) res.status(500).json({ error: 'Algo falló. Intenta de nuevo en un momento.' });
    }
  };

  router.post('/public/minuta/:token/entrar', limite, seguro(async (req, res) => {
    const m = await enlaceActivo(req, res);
    if (!m) return;
    const b = entrarSchema.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Escribe tu nombre (hasta 120 caracteres) y el código.' });
    const intento = evaluarIntento({ codigo: m.share_codigo, intentos: m.share_intentos, bloqueadoHasta: m.share_bloqueado_hasta }, b.data.codigo, ahora());
    if (!intento.ok) {
      await repo.guardarIntento(m.id, intento.intentos, intento.bloqueadoHasta);
      if (intento.motivo === 'bloqueado') return res.status(429).json({ error: 'Demasiados intentos. Prueba de nuevo en 15 minutos.' });
      return res.status(401).json({ error: 'El código no es correcto.' });
    }
    if (m.share_intentos) await repo.guardarIntento(m.id, 0, null);
    if (!b.data.nombre) {
      return res.json({ titulo: m.titulo, marca: m.brand_nombre, nombres: nombresDeEnvios(await repo.envios(m.id)) });
    }
    await repo.registrarAcceso(m.id, b.data.nombre);
    res.json({ sesion: firmarSesion({ minutaId: m.id, nombre: b.data.nombre, version: m.share_version }) });
  }));

  router.get('/public/minuta/:token', limite, seguro(async (req, res) => {
    const c = await conSesion(req, res);
    if (c) res.json(await vista(c.m, c.s));
  }));

  router.get('/public/minuta/:token/evidencias/:id', limite, seguro(async (req, res) => {
    const m = await repo.porToken(String(req.params.token));
    const evidenciaId = String(req.params.id);
    if (!m || !m.share_activo || !imagenFirmadaValida(m.share_token!, evidenciaId, m.share_version, req.query.exp, req.query.sig)) {
      return res.status(404).json({ error: NO_DISPONIBLE });
    }
    const ev = await repo.imagenVisible(m.id, evidenciaId);
    const archivo = ev && esImagenPropia(ev.url) ? new URL(ev.url).pathname.split('/').pop()! : null;
    if (!archivo) return res.status(404).json({ error: NO_DISPONIBLE });
    res.setHeader('Content-Type', TIPO_IMAGEN[archivo.split('.').pop()!]);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(archivo, { root: DIR_IMAGENES() }, (e) => { if (e && !res.headersSent) res.status(404).json({ error: NO_DISPONIBLE }); });
  }));

  /** Loads the visible point the client acts on. */
  const punto = async (req: Request, res: Response) => {
    const c = await conSesion(req, res);
    if (!c) return null;
    const p = await repo.puntoVisible(c.m.id, String(req.params.itemId));
    if (!p) { res.status(404).json({ error: 'Ese punto no está en esta minuta.' }); return null; }
    return { ...c, p };
  };

  router.post('/public/minuta/:token/puntos/:itemId/aprobar', limite, seguro(async (req, res) => {
    const c = await punto(req, res);
    if (!c) return;
    const r = aplicarAccion({ estado: c.p.estado as never, responsableCliente: !!c.p.responsable_cliente, evidencias: 0 }, 'aprobar');
    if (!r.ok) return res.status(422).json({ error: r.error });
    await query("UPDATE minuta_items SET estado = ?, aprobado_via = 'enlace', aprobado_por_nombre = ?, aprobado_en = NOW(3) WHERE id = ?", [r.estado, c.s.nombre, c.p.id]);
    await avisar(c.m, c.s.nombre, 'aprobó', c.p);
    res.json(await vista(c.m, c.s));
  }));

  router.post('/public/minuta/:token/puntos/:itemId/ajuste', limite, seguro(async (req, res) => {
    const c = await punto(req, res);
    if (!c) return;
    const b = motivoSchema.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Cuéntanos qué ajuste necesitas.' });
    const r = aplicarAccion({ estado: c.p.estado as never, responsableCliente: !!c.p.responsable_cliente, evidencias: 0 }, 'pedir_ajuste', { motivo: b.data.motivo });
    if (!r.ok) return res.status(422).json({ error: r.error });
    await query('UPDATE minuta_items SET estado = ?, completado_por = NULL, completado_en = NULL WHERE id = ?', [r.estado, c.p.id]);
    await insertarNota(c.p.id, 'ajuste', b.data.motivo, { nombre: c.s.nombre });
    await avisar(c.m, c.s.nombre, 'pidió un ajuste en', c.p, b.data.motivo);
    res.json(await vista(c.m, c.s));
  }));

  router.post('/public/minuta/:token/puntos/:itemId/notas', limite, seguro(async (req, res) => {
    const c = await punto(req, res);
    if (!c) return;
    const b = notaSchema.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Escribe tu comentario.' });
    await insertarNota(c.p.id, 'nota', b.data.texto, { nombre: c.s.nombre });
    await avisar(c.m, c.s.nombre, 'comentó', c.p, b.data.texto);
    res.status(201).json(await vista(c.m, c.s));
  }));

  return router;
}
