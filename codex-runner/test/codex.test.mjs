import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generarMinuta, promptConFecha, verificarSesion } from '../codex.mjs';

// A fake `codex` binary: writes a fixed JSON wherever `-o` points, like `codex exec` does.
async function codexFalso(t, cuerpo) {
  const dir = await mkdtemp(path.join(tmpdir(), 'codex-falso-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'codex');
  await writeFile(bin, `#!/usr/bin/env bash\n${cuerpo}\n`);
  await chmod(bin, 0o755);
  return bin;
}

const ESCRIBE_JSON = `
entrada="$(cat)"
while [ $# -gt 0 ]; do
  if [ "$1" = "-o" ]; then salida="$2"; fi
  if [ "$1" = "--sandbox" ]; then sandbox="$2"; fi
  shift
done
printf '{"titulo":"T","resumen":"%s","puntos":[],"sandbox":"%s"}' "$entrada" "$sandbox" > "$salida"`;

test('reemplaza la fecha de la reunión en el prompt', () => {
  assert.equal(promptConFecha('La reunión fue el {{FECHA}}. Otra vez: {{FECHA}}.', '2026-09-24'), 'La reunión fue el 2026-09-24. Otra vez: 2026-09-24.');
});

test('corre codex en modo solo lectura, le pasa la transcripción por stdin y devuelve su JSON', async (t) => {
  const bin = await codexFalso(t, ESCRIBE_JSON);
  const r = await generarMinuta({ transcripcion: 'Revisamos el home', fecha: '2026-09-24' }, { bin });
  assert.deepEqual(r, { titulo: 'T', resumen: 'Revisamos el home', puntos: [], sandbox: 'read-only' });
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
