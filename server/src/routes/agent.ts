import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { query, queryOne, uuid } from '../db/mysql.js';
import { hasRole } from '../utils/roles.js';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

/**
 * Chat del agente de mantenimiento (solo admin).
 * El agente corre en la copia aislada /var/www/tiusdei-agent como usuario `agente`,
 * con barandas. Patrón asíncrono: POST /agent/chat responde al toque y el agente
 * trabaja en background; el frontend consulta los mensajes hasta que aparece la respuesta.
 */
export const agentRouter = Router();

const WS = '/var/www/tiusdei-agent';
const RUNNER = `${WS}/.agent/agent-run.sh`;
const PROMOTE = '/var/www/tiusdei/.agent/promote.sh';
const UPLOAD_DIR = `${WS}/.agent/uploads`;
const PROMPT_DIR = '/tmp/tiusdei-agent-prompts';

for (const d of [PROMPT_DIR]) { try { fs.mkdirSync(d, { recursive: true }); } catch { /* */ } }

async function ensureAdmin(req: AuthRequest, res: any): Promise<boolean> {
  const ok = await hasRole(req.userId!, ['admin']);
  if (!ok) { res.status(403).json({ error: 'Solo admin' }); return false; }
  return true;
}

// ── Listar sesiones del usuario ──
agentRouter.get('/agent/sessions', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureAdmin(req, res))) return;
    const rows = await query<any[]>(
      'SELECT id, titulo, status, created_at, updated_at FROM agent_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50',
      [req.userId]
    );
    res.json(rows);
  } catch (e) { console.error('[AGENT] sessions:', e); res.status(500).json({ error: 'Error' }); }
});

// ── Mensajes de una sesión ──
agentRouter.get('/agent/sessions/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureAdmin(req, res))) return;
    const sid = String(req.params.id);
    const sess = await queryOne<any>('SELECT id, status FROM agent_sessions WHERE id = ?', [sid]);
    if (!sess) return res.status(404).json({ error: 'Sesión no encontrada' });
    const msgs = await query<any[]>(
      'SELECT id, role, content, created_at FROM agent_messages WHERE session_id = ? ORDER BY created_at',
      [sid]
    );
    res.json({ status: sess.status, messages: msgs });
  } catch (e) { console.error('[AGENT] messages:', e); res.status(500).json({ error: 'Error' }); }
});

// ── Subir imagen (la lee el agente) ──
const upload = multer({
  storage: multer.diskStorage({
    destination: (_r, _f, cb) => { try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {/* */} cb(null, UPLOAD_DIR); },
    filename: (_r, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname) || '.png'}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_r, file, cb) => cb(null, !!file.mimetype && file.mimetype.startsWith('image/')),
});
agentRouter.post('/agent/upload', requireAuth, upload.single('image'), async (req: AuthRequest, res) => {
  try {
    if (!(await ensureAdmin(req, res))) return;
    if (!req.file) return res.status(400).json({ error: 'No se envió imagen' });
    res.status(201).json({ path: path.join(UPLOAD_DIR, req.file.filename) });
  } catch (e) { console.error('[AGENT] upload:', e); res.status(500).json({ error: 'Error' }); }
});

// ── Enviar mensaje (asíncrono) ──
agentRouter.post('/agent/chat', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureAdmin(req, res))) return;
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const imagePaths: string[] = Array.isArray(req.body?.image_paths) ? req.body.image_paths.filter((x: unknown) => typeof x === 'string') : [];
    if (!message && imagePaths.length === 0) return res.status(400).json({ error: 'Mensaje vacío' });

    let sessionId = typeof req.body?.session_id === 'string' ? req.body.session_id : '';
    let claudeSessionId: string | null = null;
    if (sessionId) {
      const s = await queryOne<any>('SELECT id, claude_session_id, status FROM agent_sessions WHERE id = ?', [sessionId]);
      if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
      if (s.status === 'running') return res.status(409).json({ error: 'El agente todavía está trabajando en el mensaje anterior' });
      claudeSessionId = s.claude_session_id || null;
    } else {
      sessionId = uuid();
      await query('INSERT INTO agent_sessions (id, user_id, titulo, status) VALUES (?, ?, ?, "idle")',
        [sessionId, req.userId, message.slice(0, 80) || 'Conversación']);
    }

    // Guardar mensaje del usuario
    await query('INSERT INTO agent_messages (id, session_id, role, content) VALUES (?, ?, "user", ?)',
      [uuid(), sessionId, message + (imagePaths.length ? `\n\n[imágenes: ${imagePaths.length}]` : '')]);
    await query('UPDATE agent_sessions SET status = "running", updated_at = NOW(3) WHERE id = ?', [sessionId]);

    // Construir el prompt (con rutas de imágenes si las hay)
    let prompt = message;
    if (imagePaths.length) {
      prompt += '\n\nImágenes adjuntas (leelas con la tool Read):\n' + imagePaths.map((p) => `- ${p}`).join('\n');
    }
    const promptFile = path.join(PROMPT_DIR, `${sessionId}-${Date.now()}.txt`);
    fs.writeFileSync(promptFile, prompt, { mode: 0o644 });

    // Lanzar el runner como usuario agente (no-root), en background
    const args = ['-u', 'agente', RUNNER, promptFile];
    if (claudeSessionId) args.push(claudeSessionId);
    const child = spawn('sudo', args, { detached: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', async (code) => {
      let reply = '';
      let newCid: string | null = claudeSessionId;
      try {
        const json = JSON.parse(out);
        reply = String(json.result || '').trim();
        if (json.session_id) newCid = String(json.session_id);
      } catch {
        reply = out.trim() || `(el agente no devolvió texto. code=${code}) ${err.slice(0, 300)}`;
      }
      if (!reply) reply = `(sin respuesta. code=${code})`;
      try {
        await query('INSERT INTO agent_messages (id, session_id, role, content) VALUES (?, ?, "assistant", ?)',
          [uuid(), sessionId, reply]);
        await query('UPDATE agent_sessions SET status = "idle", claude_session_id = ?, updated_at = NOW(3) WHERE id = ?',
          [newCid, sessionId]);
      } catch (e) { console.error('[AGENT] save reply:', e); }
      try { fs.unlinkSync(promptFile); } catch { /* */ }
    });
    child.unref();

    res.status(202).json({ session_id: sessionId, status: 'running' });
  } catch (e) { console.error('[AGENT] chat:', e); res.status(500).json({ error: 'Error al enviar al agente' }); }
});

// ── Bitácora de acciones del agente ──
agentRouter.get('/agent/actions', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureAdmin(req, res))) return;
    const rows = await query<any[]>(
      'SELECT id, origen, tipo, titulo, detalle, estado, riesgo, created_at FROM agent_actions ORDER BY created_at DESC LIMIT 100',
      []
    );
    res.json(rows);
  } catch (e) { console.error('[AGENT] actions:', e); res.status(500).json({ error: 'Error' }); }
});

// ── Promover a producción (corre promote.sh, asíncrono via bitácora) ──
agentRouter.post('/agent/promote', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await ensureAdmin(req, res))) return;
    const actionId = uuid();
    await query('INSERT INTO agent_actions (id, origen, tipo, titulo, estado, riesgo) VALUES (?, "chat", "promote", "Promoción a producción", "pendiente_aprobacion", "alto")', [actionId]);
    const child = spawn('bash', [PROMOTE], { detached: true });
    let out = ''; let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', async (code) => {
      const ok = /PROMOTE_OK/.test(out);
      await query('UPDATE agent_actions SET estado = ?, detalle = ? WHERE id = ?',
        [ok ? 'aplicado' : 'fallido', (out + '\n' + err).slice(-4000), actionId]).catch(() => {});
    });
    child.unref();
    res.status(202).json({ action_id: actionId, status: 'running' });
  } catch (e) { console.error('[AGENT] promote:', e); res.status(500).json({ error: 'Error al promover' }); }
});
