import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ESQUEMA = path.join(AQUI, 'minuta.schema.json');
const PROMPT = path.join(AQUI, 'prompt.txt');

/** Report jobs Tiusdei may ask for; each one has reportes/<tipo>.prompt.txt and reportes/<tipo>.schema.json. */
export const TIPOS_TRABAJO = ['reporte-descripciones', 'reporte-avances', 'reporte-resumen', 'minuta-resumen-cliente'];

/** Prompt for one minuta: meeting date and, when given, the team's instructions (trusted, unlike the sources). */
export function armarPrompt(plantilla, { fecha, indicaciones = '' }) {
  const extra = indicaciones.trim()
    ? `Indicaciones del equipo para esta minuta (síguelas mientras no contradigan las reglas):\n${indicaciones.trim()}`
    : '';
  return plantilla.replaceAll('{{FECHA}}', fecha).replaceAll('{{INDICACIONES}}', extra);
}

/** What Codex reads on stdin: each source in its own block so it never mixes who said what. */
export function entradaCodex({ transcripcion = '', notasCliente = '' }) {
  return [
    transcripcion.trim() && `<transcripcion>\n${transcripcion.trim()}\n</transcripcion>`,
    notasCliente.trim() && `<notas_del_cliente>\n${notasCliente.trim()}\n</notas_del_cliente>`,
  ].filter(Boolean).join('\n\n');
}

/** Runs a command feeding `entrada` on stdin. Resolves with its output; rejects on error or timeout. */
function correr(bin, args, { entrada = '', limiteMs, cwd }) {
  return new Promise((resolve, reject) => {
    const hijo = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let salida = '';
    hijo.stdout.on('data', (d) => { salida += d; });
    hijo.stderr.on('data', (d) => { salida += d; });
    const reloj = setTimeout(() => {
      hijo.kill('SIGKILL');
      reject(new Error(`Codex tardó más de ${Math.round(limiteMs / 1000)} s.`));
    }, limiteMs);
    hijo.on('error', (e) => { clearTimeout(reloj); reject(e); });
    hijo.on('close', (codigo) => {
      clearTimeout(reloj);
      if (codigo === 0) resolve(salida);
      else reject(new Error(salida.trim().split('\n').slice(-5).join('\n') || `Codex terminó con código ${codigo}.`));
    });
    hijo.stdin.on('error', () => {});
    hijo.stdin.end(entrada);
  });
}

/**
 * Runs `codex exec` once: empty working folder, read-only sandbox, `entrada` on stdin and an answer that
 * must follow the JSON schema. Returns the parsed JSON.
 */
async function ejecutarCodex({ prompt, esquema, entrada }, { bin, modelo, esfuerzo, limiteMs }) {
  const carpeta = await mkdtemp(path.join(tmpdir(), 'codex-'));
  const salida = path.join(carpeta, 'salida.json');
  const vacia = path.join(carpeta, 'vacia');
  try {
    await mkdir(vacia);
    await correr(bin, [
      'exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '-C', vacia,
      '-m', modelo, '-c', `model_reasoning_effort="${esfuerzo}"`,
      '--output-schema', esquema, '-o', salida, prompt,
    ], { entrada, limiteMs, cwd: vacia });
    return JSON.parse(await readFile(salida, 'utf8'));
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}

/**
 * Turns a transcript and/or the client's own notes into a minuta draft with `codex exec`. Codex works in an empty
 * folder with a read-only sandbox and must answer with the JSON schema.
 */
export async function generarMinuta({ transcripcion = '', notasCliente = '', indicaciones = '', fecha }, {
  bin = 'codex', modelo = 'gpt-6-luna', esfuerzo = 'medium', limiteMs = 180_000,
} = {}) {
  const prompt = armarPrompt(await readFile(PROMPT, 'utf8'), { fecha, indicaciones });
  return ejecutarCodex({ prompt, esquema: ESQUEMA, entrada: entradaCodex({ transcripcion, notasCliente }) }, { bin, modelo, esfuerzo, limiteMs });
}

/**
 * One step of a weekly project report. `entrada` is data prepared by Tiusdei (sent as JSON inside <datos>);
 * `indicaciones` come from the project leader and only apply to the final write-up.
 */
export async function ejecutarTrabajo(tipo, { entrada, indicaciones = '' }, {
  bin = 'codex', modelo = 'gpt-6-luna', esfuerzo = 'medium', limiteMs = 240_000,
} = {}) {
  if (!TIPOS_TRABAJO.includes(tipo)) throw new Error('Tipo de trabajo desconocido.');
  const base = path.join(AQUI, 'reportes', tipo);
  const extra = indicaciones.trim()
    ? `Indicaciones del líder del proyecto para esta versión (síguelas mientras no contradigan las reglas):\n${indicaciones.trim()}`
    : '';
  const prompt = (await readFile(`${base}.prompt.txt`, 'utf8')).replaceAll('{{INDICACIONES}}', extra);
  return ejecutarCodex({ prompt, esquema: `${base}.schema.json`, entrada: `<datos>\n${JSON.stringify(entrada)}\n</datos>` }, { bin, modelo, esfuerzo, limiteMs });
}

/** Whether the Codex CLI has a logged-in session (`codex login status`). */
export async function verificarSesion({ bin = 'codex', limiteMs = 15_000 } = {}) {
  try {
    const salida = (await correr(bin, ['login', 'status'], { limiteMs })).trim();
    return { listo: /logged in/i.test(salida) && !/not logged in/i.test(salida), detalle: salida.split('\n')[0] };
  } catch (e) {
    return { listo: false, detalle: (e instanceof Error ? e.message : String(e)).split('\n')[0] };
  }
}
