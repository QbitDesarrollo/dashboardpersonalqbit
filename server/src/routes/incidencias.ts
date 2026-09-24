import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { getUserRole } from '../utils/roles.js';
import { createNotification } from '../utils/notifications.js';
import { sendEmail, incidenciaNuevaEmail, incidenciaComentarioEmail, incidenciaEstadoEmail } from '../services/email.js';

export const incidenciasRouter = Router();

const TIPOS = ['BUG', 'MEJORA', 'QUEJA', 'CONSULTA'];
const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];
const ESTADOS = ['ABIERTO', 'EN_PROGRESO', 'RESUELTO', 'CERRADO'];

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec';

/** Acceso al módulo de incidencias: todo el equipo interno puede ver, crear y
 *  comentar (pedido de Steven 21-jul). Cambiar estado/prioridad queda para
 *  admin/ejecutivo; asignar/eliminar solo admin (cada endpoint lo valida). */
async function requireIncidenciaAccess(req: AuthRequest): Promise<{ ok: boolean; role: string }> {
  const role = await getUserRole(req.userId!);
  return { ok: role === 'admin' || role === 'ejecutivo' || role === 'equipo', role };
}

/** Registra una línea en el timeline de actividad. Fire-and-forget. */
function logActividad(incidenciaId: string, usuarioId: string, accion: string): void {
  query(
    'INSERT INTO incidencia_actividad (id, incidencia_id, usuario_id, accion) VALUES (?, ?, ?, ?)',
    [uuid(), incidenciaId, usuarioId, accion]
  ).catch((e) => console.error('[INCIDENCIAS] logActividad fail:', e));
}

/**
 * Destinatarios de notificación para una incidencia:
 * admins activos + creador + asignado (deduplicado, sin el actor).
 */
async function getDestinatarios(incidenciaId: string, excludeUserId: string): Promise<{ id: string; email: string; nombre: string }[]> {
  const rows = await query<{ id: string; email: string; nombre: string }[]>(
    `SELECT DISTINCT p.id, p.email, p.nombre
     FROM profiles p
     WHERE p.activo = 1 AND (
       p.rol = 'admin'
       OR p.id = (SELECT creado_por_id FROM incidencias WHERE id = ?)
       OR p.id = (SELECT asignado_a_id FROM incidencias WHERE id = ?)
     )`,
    [incidenciaId, incidenciaId]
  );
  return rows.filter((r) => r.id !== excludeUserId && r.email && r.email.includes('@'));
}

const emailEnabled = () => !!(process.env.MAILGUN_API_KEY || process.env.SMTP_PASS);

// ─────────────────────────────────────────────────────────────────────────────
// GET /incidencias  — lista + KPIs + filtros
// ─────────────────────────────────────────────────────────────────────────────
incidenciasRouter.get('/incidencias', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { ok } = await requireIncidenciaAccess(req);
    if (!ok) return res.status(403).json({ error: 'Sin acceso al módulo de incidencias' });

    const estado = req.query.estado as string | undefined;
    const tipo = req.query.tipo as string | undefined;
    const prioridad = req.query.prioridad as string | undefined;
    const modulo = req.query.modulo as string | undefined;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit), 10) || 50, 1), 200);
    const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);

    const where: string[] = [];
    const params: string[] = [];
    if (estado && ESTADOS.includes(estado)) { where.push('i.estado = ?'); params.push(estado); }
    if (tipo && TIPOS.includes(tipo)) { where.push('i.tipo = ?'); params.push(tipo); }
    if (prioridad && PRIORIDADES.includes(prioridad)) { where.push('i.prioridad = ?'); params.push(prioridad); }
    if (modulo) { where.push('i.modulo = ?'); params.push(modulo); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    // Orden: ABIERTO→EN_PROGRESO→RESUELTO→CERRADO, luego CRITICA→ALTA→MEDIA→BAJA, luego reciente
    const orderSql = `
      ORDER BY FIELD(i.estado,'ABIERTO','EN_PROGRESO','RESUELTO','CERRADO'),
               FIELD(i.prioridad,'CRITICA','ALTA','MEDIA','BAJA'),
               i.fecha_creacion DESC`;

    const [countRow, rows] = await Promise.all([
      queryOne<{ total: number }>(`SELECT COUNT(*) as total FROM incidencias i ${whereSql}`, params),
      query<any[]>(
        `SELECT i.*,
                cp.nombre AS creado_por_nombre, cp.avatar_url AS creado_por_avatar,
                ap.nombre AS asignado_a_nombre, ap.avatar_url AS asignado_a_avatar,
                (SELECT COUNT(*) FROM incidencia_comentarios c WHERE c.incidencia_id = i.id) AS comentarios_count
         FROM incidencias i
         LEFT JOIN profiles cp ON cp.id = i.creado_por_id
         LEFT JOIN profiles ap ON ap.id = i.asignado_a_id
         ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
        [...params, String(limit), String(offset)]
      ),
    ]);

    // KPIs (siempre globales, no afectados por filtros)
    const kpiRow = await queryOne<any>(
      `SELECT
        SUM(estado='ABIERTO') AS abiertos,
        SUM(estado='EN_PROGRESO') AS en_progreso,
        SUM(estado='RESUELTO') AS resueltos,
        SUM(estado='CERRADO') AS cerrados,
        COUNT(*) AS total,
        AVG(CASE WHEN fecha_cierre IS NOT NULL THEN TIMESTAMPDIFF(HOUR, fecha_creacion, fecha_cierre) END) AS horas_promedio
       FROM incidencias`
    );

    res.json({
      incidencias: rows,
      total: Number(countRow?.total ?? 0),
      kpis: {
        abiertos: Number(kpiRow?.abiertos ?? 0),
        en_progreso: Number(kpiRow?.en_progreso ?? 0),
        resueltos: Number(kpiRow?.resueltos ?? 0),
        cerrados: Number(kpiRow?.cerrados ?? 0),
        total: Number(kpiRow?.total ?? 0),
        horas_promedio: kpiRow?.horas_promedio != null ? Number(Number(kpiRow.horas_promedio).toFixed(1)) : null,
      },
    });
  } catch (e) {
    console.error('[INCIDENCIAS] list:', e);
    res.status(500).json({ error: 'Error al cargar incidencias' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /incidencias/:id  — detalle con comentarios + actividad
// ─────────────────────────────────────────────────────────────────────────────
incidenciasRouter.get('/incidencias/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { ok } = await requireIncidenciaAccess(req);
    if (!ok) return res.status(403).json({ error: 'Sin acceso' });
    const id = String(req.params.id);

    const inc = await queryOne<any>(
      `SELECT i.*,
              cp.nombre AS creado_por_nombre, cp.avatar_url AS creado_por_avatar,
              ap.nombre AS asignado_a_nombre, ap.avatar_url AS asignado_a_avatar
       FROM incidencias i
       LEFT JOIN profiles cp ON cp.id = i.creado_por_id
       LEFT JOIN profiles ap ON ap.id = i.asignado_a_id
       WHERE i.id = ?`,
      [id]
    );
    if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada' });

    const comentarios = await query<any[]>(
      `SELECT c.*, p.nombre AS usuario_nombre, p.avatar_url AS usuario_avatar
       FROM incidencia_comentarios c
       LEFT JOIN profiles p ON p.id = c.usuario_id
       WHERE c.incidencia_id = ? ORDER BY c.fecha ASC`,
      [id]
    );
    const actividad = await query<any[]>(
      `SELECT a.*, p.nombre AS usuario_nombre, p.avatar_url AS usuario_avatar
       FROM incidencia_actividad a
       LEFT JOIN profiles p ON p.id = a.usuario_id
       WHERE a.incidencia_id = ? ORDER BY a.fecha ASC`,
      [id]
    );

    res.json({ incidencia: inc, comentarios, actividad });
  } catch (e) {
    console.error('[INCIDENCIAS] detail:', e);
    res.status(500).json({ error: 'Error al cargar incidencia' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /incidencias  — crear
// ─────────────────────────────────────────────────────────────────────────────
incidenciasRouter.post('/incidencias', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { ok } = await requireIncidenciaAccess(req);
    if (!ok) return res.status(403).json({ error: 'Sin acceso' });

    const { titulo, descripcion, tipo, prioridad, modulo } = req.body || {};
    if (!titulo || typeof titulo !== 'string' || !titulo.trim()) {
      return res.status(400).json({ error: 'El título es obligatorio' });
    }
    const t = TIPOS.includes(tipo) ? tipo : 'BUG';
    const p = PRIORIDADES.includes(prioridad) ? prioridad : 'MEDIA';
    const id = uuid();

    await query(
      `INSERT INTO incidencias (id, titulo, descripcion, tipo, prioridad, estado, modulo, creado_por_id)
       VALUES (?, ?, ?, ?, ?, 'ABIERTO', ?, ?)`,
      [id, titulo.trim().slice(0, 200), typeof descripcion === 'string' ? descripcion : null, t, p, modulo || null, req.userId]
    );

    logActividad(id, req.userId!, `Creó la incidencia (${t}, prioridad ${p})`);

    // Notificar a admins (in-app + email). El creador no recibe.
    const destinatarios = await getDestinatarios(id, req.userId!);
    const autor = await queryOne<{ nombre: string }>('SELECT nombre FROM profiles WHERE id = ?', [req.userId]);
    const autorNombre = autor?.nombre || 'Alguien';
    for (const d of destinatarios) {
      createNotification(d.id, `Nueva incidencia: ${titulo.trim()}`, null).catch(() => {});
      if (emailEnabled()) {
        incidenciaNuevaEmail({
          recipientName: d.nombre,
          autorNombre,
          titulo: titulo.trim(),
          tipo: t,
          prioridad: p,
          modulo: modulo || '—',
          incidenciaUrl: `${FRONTEND_URL}/incidencias?id=${id}`,
        }).then((m) => { m.to = d.email; return sendEmail(m); }).catch((e) => console.error('[INCIDENCIAS] email nueva:', e));
      }
    }

    const row = await queryOne<any>('SELECT * FROM incidencias WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (e) {
    console.error('[INCIDENCIAS] create:', e);
    res.status(500).json({ error: 'Error al crear incidencia' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /incidencias/:id/comentarios
// ─────────────────────────────────────────────────────────────────────────────
incidenciasRouter.post('/incidencias/:id/comentarios', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { ok } = await requireIncidenciaAccess(req);
    if (!ok) return res.status(403).json({ error: 'Sin acceso' });
    const id = String(req.params.id);
    const { comentario, es_resolucion } = req.body || {};
    if (!comentario || typeof comentario !== 'string' || !comentario.trim()) {
      return res.status(400).json({ error: 'El comentario no puede estar vacío' });
    }
    const inc = await queryOne<any>('SELECT id, titulo FROM incidencias WHERE id = ?', [id]);
    if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada' });

    const esRes = es_resolucion === true || es_resolucion === 1 || es_resolucion === '1';
    const comId = uuid();
    await query(
      'INSERT INTO incidencia_comentarios (id, incidencia_id, usuario_id, comentario, es_resolucion) VALUES (?, ?, ?, ?, ?)',
      [comId, id, req.userId, comentario, esRes ? 1 : 0]
    );
    logActividad(id, req.userId!, esRes ? 'Agregó una respuesta de resolución' : 'Agregó un comentario');

    const autor = await queryOne<{ nombre: string }>('SELECT nombre FROM profiles WHERE id = ?', [req.userId]);
    const autorNombre = autor?.nombre || 'Alguien';
    const destinatarios = await getDestinatarios(id, req.userId!);
    for (const d of destinatarios) {
      createNotification(d.id, `${autorNombre} comentó en: ${inc.titulo}`, null).catch(() => {});
      if (emailEnabled()) {
        incidenciaComentarioEmail({
          recipientName: d.nombre,
          autorNombre,
          titulo: inc.titulo,
          comentarioTexto: comentario.replace(/<[^>]*>/g, ' ').slice(0, 400),
          incidenciaUrl: `${FRONTEND_URL}/incidencias?id=${id}`,
        }).then((m) => { m.to = d.email; return sendEmail(m); }).catch((e) => console.error('[INCIDENCIAS] email comentario:', e));
      }
    }

    const row = await queryOne<any>(
      `SELECT c.*, p.nombre AS usuario_nombre, p.avatar_url AS usuario_avatar
       FROM incidencia_comentarios c LEFT JOIN profiles p ON p.id = c.usuario_id WHERE c.id = ?`,
      [comId]
    );
    res.status(201).json(row);
  } catch (e) {
    console.error('[INCIDENCIAS] comentario:', e);
    res.status(500).json({ error: 'Error al agregar comentario' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /incidencias/:id/estado
// ─────────────────────────────────────────────────────────────────────────────
incidenciasRouter.patch('/incidencias/:id/estado', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { ok, role } = await requireIncidenciaAccess(req);
    if (!ok || role === 'equipo') return res.status(403).json({ error: 'Solo admin/ejecutivo pueden cambiar el estado' });
    const id = String(req.params.id);
    const estado = String(req.body?.estado || '');
    if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });

    const inc = await queryOne<any>('SELECT id, titulo, estado FROM incidencias WHERE id = ?', [id]);
    if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada' });
    if (inc.estado === estado) return res.json({ ok: true, sin_cambio: true });

    const cierra = estado === 'RESUELTO' || estado === 'CERRADO';
    const reabre = (inc.estado === 'RESUELTO' || inc.estado === 'CERRADO') && !cierra;
    if (cierra) {
      await query('UPDATE incidencias SET estado = ?, fecha_cierre = NOW(3) WHERE id = ?', [estado, id]);
    } else if (reabre) {
      await query('UPDATE incidencias SET estado = ?, fecha_cierre = NULL WHERE id = ?', [estado, id]);
    } else {
      await query('UPDATE incidencias SET estado = ? WHERE id = ?', [estado, id]);
    }

    logActividad(id, req.userId!, `Cambió el estado de ${inc.estado} a ${estado}`);

    const autor = await queryOne<{ nombre: string }>('SELECT nombre FROM profiles WHERE id = ?', [req.userId]);
    const autorNombre = autor?.nombre || 'Alguien';
    const destinatarios = await getDestinatarios(id, req.userId!);
    for (const d of destinatarios) {
      createNotification(d.id, `Incidencia "${inc.titulo}" → ${estado}`, null).catch(() => {});
      if (emailEnabled()) {
        incidenciaEstadoEmail({
          recipientName: d.nombre,
          autorNombre,
          titulo: inc.titulo,
          estadoAnterior: inc.estado,
          estadoNuevo: estado,
          incidenciaUrl: `${FRONTEND_URL}/incidencias?id=${id}`,
        }).then((m) => { m.to = d.email; return sendEmail(m); }).catch((e) => console.error('[INCIDENCIAS] email estado:', e));
      }
    }

    res.json({ ok: true, estado });
  } catch (e) {
    console.error('[INCIDENCIAS] estado:', e);
    res.status(500).json({ error: 'Error al cambiar estado' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /incidencias/:id/prioridad
// ─────────────────────────────────────────────────────────────────────────────
incidenciasRouter.patch('/incidencias/:id/prioridad', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { ok, role } = await requireIncidenciaAccess(req);
    if (!ok || role === 'equipo') return res.status(403).json({ error: 'Solo admin/ejecutivo pueden cambiar la prioridad' });
    const id = String(req.params.id);
    const prioridad = String(req.body?.prioridad || '');
    if (!PRIORIDADES.includes(prioridad)) return res.status(400).json({ error: 'Prioridad inválida' });

    const inc = await queryOne<any>('SELECT id, prioridad FROM incidencias WHERE id = ?', [id]);
    if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada' });
    if (inc.prioridad === prioridad) return res.json({ ok: true, sin_cambio: true });

    await query('UPDATE incidencias SET prioridad = ? WHERE id = ?', [prioridad, id]);
    logActividad(id, req.userId!, `Cambió la prioridad de ${inc.prioridad} a ${prioridad}`);
    res.json({ ok: true, prioridad });
  } catch (e) {
    console.error('[INCIDENCIAS] prioridad:', e);
    res.status(500).json({ error: 'Error al cambiar prioridad' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /incidencias/:id/asignar  — solo ADMIN
// ─────────────────────────────────────────────────────────────────────────────
incidenciasRouter.patch('/incidencias/:id/asignar', requireAuth, async (req: AuthRequest, res) => {
  try {
    const role = await getUserRole(req.userId!);
    if (role !== 'admin') return res.status(403).json({ error: 'Solo admin puede asignar' });
    const id = String(req.params.id);
    const asignado_a_id = req.body?.asignado_a_id ? String(req.body.asignado_a_id) : null;

    const inc = await queryOne<any>('SELECT id, titulo FROM incidencias WHERE id = ?', [id]);
    if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada' });

    const asignado = asignado_a_id || null;
    await query('UPDATE incidencias SET asignado_a_id = ? WHERE id = ?', [asignado, id]);

    if (asignado) {
      const u = await queryOne<{ nombre: string }>('SELECT nombre FROM profiles WHERE id = ?', [asignado]);
      logActividad(id, req.userId!, `Asignó la incidencia a ${u?.nombre || 'un usuario'}`);
      if (asignado !== req.userId) {
        createNotification(asignado, `Se te asignó la incidencia: ${inc.titulo}`, null).catch(() => {});
      }
    } else {
      logActividad(id, req.userId!, 'Quitó la asignación');
    }
    res.json({ ok: true, asignado_a_id: asignado });
  } catch (e) {
    console.error('[INCIDENCIAS] asignar:', e);
    res.status(500).json({ error: 'Error al asignar' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /incidencias/:id  — solo ADMIN
// ─────────────────────────────────────────────────────────────────────────────
incidenciasRouter.delete('/incidencias/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const role = await getUserRole(req.userId!);
    if (role !== 'admin') return res.status(403).json({ error: 'Solo admin puede eliminar' });
    const id = String(req.params.id);
    const inc = await queryOne<any>('SELECT id FROM incidencias WHERE id = ?', [id]);
    if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada' });
    // CASCADE elimina comentarios y actividad automáticamente
    await query('DELETE FROM incidencias WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[INCIDENCIAS] delete:', e);
    res.status(500).json({ error: 'Error al eliminar incidencia' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /incidencias-asignables  — usuarios admin+ejecutivo activos (para el select de asignar)
// ─────────────────────────────────────────────────────────────────────────────
incidenciasRouter.get('/incidencias-asignables', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { ok, role } = await requireIncidenciaAccess(req);
    if (!ok || role === 'equipo') return res.status(403).json({ error: 'Sin acceso' });
    const rows = await query<any[]>(
      `SELECT id, nombre, email, avatar_url, rol FROM profiles
       WHERE activo = 1 AND rol IN ('admin','ejecutivo') ORDER BY nombre`
    );
    res.json(rows);
  } catch (e) {
    console.error('[INCIDENCIAS] asignables:', e);
    res.status(500).json({ error: 'Error' });
  }
});
