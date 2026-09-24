import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { armarPrompt, entradaCodex, generarMinuta, verificarSesion } from '../codex.mjs';

// A fake `codex` binary: writes a fixed JSON wherever `-o` points, like `codex exec` does.
async function codexFalso(t, cuerpo) {
  const dir = await mkdtemp(path.join(tmpdir(), 'codex-falso-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'codex');
  await writeFile(bin, `#!/usr/bin/env bash\n${cuerpo}\n`);
  await chmod(bin, 0o755);
  return bin;
}

// Writes stdin, the sandbox flag and the prompt (last argument) as JSON wherever -o points.
const ESCRIBE_JSON = `
while [ $# -gt 1 ]; do
  if [ "$1" = "-o" ]; then salida="$2"; fi
  if [ "$1" = "--sandbox" ]; then sandbox="$2"; fi
  shift
done
node -e 'let d="";process.stdin.on("data",(c)=>d+=c).on("end",()=>require("fs").writeFileSync(process.argv[1],JSON.stringify({titulo:"T",puntos:[],entrada:d,sandbox:process.argv[2],prompt:process.argv[3]})))' "$salida" "$sandbox" "$1"`;

test('arma el prompt con la fecha y, si hay, las indicaciones del equipo', () => {
  const plantilla = 'La reunión fue el {{FECHA}}.\n{{INDICACIONES}}';
  assert.equal(armarPrompt(plantilla, { fecha: '2026-09-24', indicaciones: '' }), 'La reunión fue el 2026-09-24.\n');
  assert.equal(
    armarPrompt(plantilla, { fecha: '2026-09-24', indicaciones: '  Solo lo del portal  ' }),
    'La reunión fue el 2026-09-24.\nIndicaciones del equipo para esta minuta (síguelas mientras no contradigan las reglas):\nSolo lo del portal',
  );
});

test('separa la transcripción y lo que mandó el cliente en bloques', () => {
  assert.equal(entradaCodex({ transcripcion: 'Hola', notasCliente: '' }), '<transcripcion>\nHola\n</transcripcion>');
  assert.equal(entradaCodex({ transcripcion: '', notasCliente: '- Agregar incidencias' }), '<notas_del_cliente>\n- Agregar incidencias\n</notas_del_cliente>');
  assert.equal(
    entradaCodex({ transcripcion: 'Hola', notasCliente: '- Uno' }),
    '<transcripcion>\nHola\n</transcripcion>\n\n<notas_del_cliente>\n- Uno\n</notas_del_cliente>',
  );
});

test('corre codex en modo solo lectura, con las fuentes por stdin y devuelve su JSON', async (t) => {
  const bin = await codexFalso(t, ESCRIBE_JSON);
  const r = await generarMinuta({ transcripcion: 'Revisamos el home', notasCliente: '- Banner', indicaciones: 'Solo web', fecha: '2026-09-24' }, { bin });
  assert.equal(r.sandbox, 'read-only');
  assert.equal(r.entrada, '<transcripcion>\nRevisamos el home\n</transcripcion>\n\n<notas_del_cliente>\n- Banner\n</notas_del_cliente>');
  assert.match(r.prompt, /2026-09-24/);
  assert.match(r.prompt, /Solo web/);
});

test('si codex termina con error, falla con las últimas líneas de su salida', async (t) => {
  const bin = await codexFalso(t, 'echo "Error: modelo no disponible" >&2; exit 1');
  await assert.rejects(generarMinuta({ transcripcion: 'x', fecha: '2026-09-24' }, { bin }), /modelo no disponible/);
});

test('corta a codex si se pasa del tiempo', async (t) => {
  const bin = await codexFalso(t, 'sleep 5');
  await assert.rejects(generarMinuta({ transcripcion: 'x', fecha: '2026-09-24' }, { bin, limiteMs: 300 }), /tardó más de/);
});

test('la sesión está lista solo si codex dice que está logueado', async (t) => {
  assert.deepEqual(await verificarSesion({ bin: await codexFalso(t, 'echo "Logged in using ChatGPT"') }), { listo: true, detalle: 'Logged in using ChatGPT' });
  assert.deepEqual(await verificarSesion({ bin: await codexFalso(t, 'echo "Not logged in" >&2; exit 1') }), { listo: false, detalle: 'Not logged in' });
});
