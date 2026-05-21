#!/usr/bin/env node
/**
 * PreToolUse hook para el agente autónomo de Tiusdei.
 * Recibe por stdin el JSON del tool call de Claude Code y BLOQUEA (exit 2)
 * cualquier operación peligrosa, pase lo que pase (incluso en modos permisivos).
 *
 * Contrato hook Claude Code: stdin = { tool_name, tool_input: {...} }
 *   exit 0  -> permitir
 *   exit 2  -> bloquear (stderr se le muestra al modelo)
 */
let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let payload = {};
  try { payload = JSON.parse(raw || '{}'); } catch { /* noop */ }
  const tool = payload.tool_name || '';
  const input = payload.tool_input || {};
  const block = (msg) => { process.stderr.write('BLOQUEADO por agent-guard: ' + msg + '\n'); process.exit(2); };

  // Texto a inspeccionar según la herramienta
  let text = '';
  if (tool === 'Bash') text = String(input.command || '');
  else if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit') {
    text = String(input.file_path || input.path || '');
    // proteger archivos sensibles de escritura
    const sensitive = [/\.env(\.|$)/i, /\.agent\.env/i, /id_rsa|id_claude|\.ssh\//i, /credentials/i, /\.git\/config/i];
    if (sensitive.some((r) => r.test(text))) block('intento de escribir un archivo sensible: ' + text);
  }
  const cmd = text.toLowerCase();

  // ── Reglas duras (bash y SQL) ──
  const deny = [
    [/rm\s+-rf?\s+(\/|~|\$home|\*)/, 'rm -rf peligroso'],
    [/\brm\s+-[a-z]*r[a-z]*\s+\//, 'rm recursivo sobre ruta absoluta'],
    [/\bmkfs\b/, 'formateo de disco'],
    [/\bdd\s+if=/, 'dd directo a disco'],
    [/:\(\)\s*\{.*\};:/, 'fork bomb'],
    [/>\s*\/dev\/sd[a-z]/, 'escritura a dispositivo de bloque'],
    [/chmod\s+-r?\s*777\s+\//, 'chmod 777 sobre ruta absoluta'],
    // git destructivo
    [/git\s+push\s+.*(--force|-f)\b/, 'git push --force'],
    [/git\s+reset\s+--hard\s+origin/, 'git reset --hard origin'],
    [/git\s+clean\s+-[a-z]*f/, 'git clean -f'],
    // matar procesos de forma amplia (regla de oro Tiusdei)
    [/pkill\s+-f\s+['"]?server\.js/, 'pkill -f server.js (mata todos los node). Usá pm2 stop o el path completo'],
    [/killall\s+node/, 'killall node'],
    // SQL destructivo
    [/drop\s+(table|database|schema)\b/, 'DROP de tabla/DB'],
    [/truncate\s+table/, 'TRUNCATE'],
    [/drop\s+database/, 'DROP DATABASE'],
    // DELETE / UPDATE sin WHERE
    [/delete\s+from\s+[`a-z0-9_."]+\s*(;|$|")/, 'DELETE sin WHERE'],
    [/update\s+[`a-z0-9_."]+\s+set\s+[^;]*?(;|$|")(?![^]*where)/, 'UPDATE sin WHERE'],
    // apagar/reiniciar el server
    [/\b(shutdown|reboot|halt|poweroff)\b/, 'apagar/reiniciar el server'],
    // tocar nginx/systemd de forma riesgosa
    [/systemctl\s+(stop|disable)\s+(nginx|mysql|mariadb)/, 'detener nginx/mysql'],
  ];

  for (const [re, why] of deny) {
    if (re.test(cmd)) block(why + ' — pedí aprobación humana para esto.');
  }

  // DELETE/UPDATE: exigir WHERE explícito (chequeo extra más estricto)
  if (/\b(delete\s+from|update)\b/.test(cmd) && /mysql|\.sql/.test(cmd)) {
    if (!/where/.test(cmd)) block('DELETE/UPDATE sin WHERE en SQL');
  }

  process.exit(0);
});
