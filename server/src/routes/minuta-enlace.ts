import { Router, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { soloEquipoInterno } from '../minutas/permisos.js';
import { cargarDetalle } from '../minutas/consultas.js';
import { ErrorRunnerOcupado, type RunnerIa } from '../minutas/ia/runner.js';
import { generarCodigo, mensajeCliente, minutaParaCliente, resumenValido } from '../minutas/enlace/dominio.js';
import * as repo from '../minutas/enlace/repositorio.js';
import { minutaClienteEmail, type EmailOptions } from '../services/email.js';

/**
 * What the team does with the client link of a minuta (MINUTAS-ENLACE-PLAN.md): turn it on or off, change the code,
 * see who came in, prepare the summary with Codex and send it by email or copy the message to paste it elsewhere.
 */

export interface DepsMinutaEnlace {
  runner: Pick<RunnerIa, 'trabajo'>;
  correo: { enviar(opciones: EmailOptions): Promise<boolean> };
  frontendUrl: string;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (fecha: string) => { const [, m, d] = fecha.split('-').map(Number); return `${d} ${MESES[m - 1]}`; };

const personaSchema = z.object({ nombre: z.string().trim().min(1).max(120), email: z.string().trim().email().max(255) });
const envioSchema = z.object({
  medio: z.enum(['correo', 'copiado', 'vista_previa']),
  para: z.array(personaSchema).max(20),
  resumen: z.string().max(3000),
});
const accionSchema = z.object({ accion: z.enum(['activar', 'apagar', 'cambiar_codigo']) });

export function crearRouterMinutaEnlace(deps: DepsMinutaEnlace) {
  const router = Router();
  const url = (token: string | null) => (token ? `${deps.frontendUrl}/m/${token}` : null);

  const minuta = async (req: AuthRequest, res: Response) => {
    const m = await repo.porId(String(req.params.id));
    if (!m) res.status(404).json({ error: 'Minuta no encontrada' });
    return m;
  };
  const estadoEnlace = async (id: string) => {
    const m = (await repo.porId(id))!;
    return {
      activo: m.share_activo,
      url: url(m.share_token),
      codigo: m.share_codigo,
      bloqueado_hasta: m.share_bloqueado_hasta && m.share_bloqueado_hasta > new Date() ? m.share_bloqueado_hasta : null,
      accesos: await repo.accesos(id),
      envios: await repo.envios(id),
    };
  };
  const activar = (id: string) => repo.activar(id, crypto.randomBytes(32).toString('hex'), generarCodigo());
  const seguro = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) => async (req: AuthRequest, res: Response) => {
    try { await fn(req, res); } catch (e) {
      console.error('[MINUTA ENLACE]', e);
      if (!res.headersSent) res.status(500).json({ error: 'Algo falló. Intenta de nuevo.' });
    }
  };

  router.get('/minutas/:id/enlace', requireAuth, soloEquipoInterno, seguro(async (req, res) => {
    const m = await minuta(req, res);
    if (m) res.json(await estadoEnlace(m.id));
  }));

  router.post('/minutas/:id/enlace', requireAuth, soloEquipoInterno, seguro(async (req, res) => {
    const m = await minuta(req, res);
    if (!m) return;
    const b = accionSchema.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Acción inválida' });
    if (b.data.accion === 'activar') await activar(m.id);
    if (b.data.accion === 'apagar') await repo.apagar(m.id);
    if (b.data.accion === 'cambiar_codigo') {
      if (!m.share_token) await activar(m.id);
      await repo.cambiarCodigo(m.id, generarCodigo());
    }
    res.json(await estadoEnlace(m.id));
  }));

  router.get('/minutas/:id/contactos', requireAuth, soloEquipoInterno, seguro(async (req, res) => {
    const m = await minuta(req, res);
    if (m) res.json(await repo.contactos(m.brand_id));
  }));

  router.post('/minutas/:id/resumen-cliente', requireAuth, soloEquipoInterno, seguro(async (req, res) => {
    const m = await minuta(req, res);
    if (!m) return;
    // Codex summarizes what the meeting was about, from the points the client will see. No status, progress or
    // dates: the client sees those in the link, and without them Codex cannot turn the summary into a status report.
    const vista = minutaParaCliente((await cargarDetalle(m.id))!, () => '');
    const entrada = {
      minuta: { titulo: vista.titulo, fecha: vista.fecha, marca: vista.brand_nombre, resumen: vista.resumen ?? '' },
      puntos: vista.items.map((p) => ({ titulo: p.titulo, descripcion: p.descripcion ?? '', lo_debe_el_cliente: p.responsable_cliente })),
    };
    try {
      // One retry when the text comes back malformed; a second bad answer is reported, never used.
      for (let intento = 1; intento <= 2; intento++) {
        const r = await deps.runner.trabajo('minuta-resumen-cliente', entrada) as { resumen?: unknown } | null;
        if (typeof r?.resumen === 'string' && resumenValido(r.resumen)) return res.json({ resumen: r.resumen.trim() });
      }
      throw new Error('Codex devolvió un resumen inválido dos veces');
    } catch (e) {
      if (e instanceof ErrorRunnerOcupado) return res.status(429).json({ error: 'Codex está ocupado con otro trabajo. Escribe el resumen tú o intenta en un momento.' });
      console.error('[MINUTA ENLACE] resumen:', e);
      res.status(502).json({ error: 'No se pudo preparar el resumen. Escríbelo tú o intenta de nuevo.' });
    }
  }));

  router.post('/minutas/:id/enviar-cliente', requireAuth, soloEquipoInterno, seguro(async (req, res) => {
    const m = await minuta(req, res);
    if (!m) return;
    const b = envioSchema.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Revisa los nombres y correos.' });
    const { medio, para, resumen } = b.data;
    if (medio === 'correo' && para.length === 0) return res.status(400).json({ error: 'Elige al menos una persona para el correo.' });

    const detalle = (await cargarDetalle(m.id))!;
    const armar = (enlace: repo.EnlaceMinuta | null) => ({
      nombres: para.map((p) => p.nombre), fecha: detalle.fecha, titulo: detalle.titulo, marca: detalle.brand_nombre, resumen,
      enlace: url(enlace?.share_token ?? null) ?? '[el enlace se crea al enviar]', codigo: enlace?.share_codigo ?? '[se crea al enviar]',
    });
    // The preview is the exact same text, with nothing sent, recorded or created.
    if (medio === 'vista_previa') return res.json({ mensaje: mensajeCliente(armar(m.share_token ? m : null)) });

    // Sending always leaves the link on, creating it the first time.
    if (!m.share_activo || !m.share_token) await activar(m.id);
    const datos = armar((await repo.porId(m.id))!);
    const mensaje = mensajeCliente(datos);
    if (medio === 'correo') {
      const plantilla = await minutaClienteEmail({ ...datos, fecha: fechaCorta(detalle.fecha), codigoMinuta: detalle.codigo });
      const ok = await deps.correo.enviar({ ...plantilla, to: para.map((p) => p.email).join(', ') });
      if (!ok) return res.status(502).json({ error: 'No se pudo enviar el correo. Copia el mensaje o intenta de nuevo.' });
    }
    await repo.guardarContactos(m.brand_id, para, req.userId!);
    await repo.registrarEnvio(m.id, medio, para, mensaje, req.userId!);
    res.json({ mensaje, enlace: await estadoEnlace(m.id) });
  }));

  return router;
}
