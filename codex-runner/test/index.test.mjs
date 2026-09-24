import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const INDEX = fileURLToPath(new URL('../index.mjs', import.meta.url));

function arrancar(env) {
  const hijo = spawn(process.execPath, [INDEX], { env: { PATH: process.env.PATH, ...env } });
  let salida = '';
  hijo.stdout.on('data', (d) => { salida += d; });
  hijo.stderr.on('data', (d) => { salida += d; });
  return { hijo, salida: () => salida };
}

test('no arranca con un token corto', async () => {
  const { hijo, salida } = arrancar({ RUNNER_TOKEN: 'corto' });
  const codigo = await new Promise((r) => hijo.on('close', r));
  assert.equal(codigo, 1);
  assert.match(salida(), /RUNNER_TOKEN debe tener al menos 32 caracteres/);
});

test('escucha solo en 127.0.0.1 en el puerto indicado', async (t) => {
  const { hijo, salida } = arrancar({ RUNNER_TOKEN: 'z'.repeat(40), PORT: '38917' });
  t.after(() => hijo.kill());
  for (let i = 0; i < 50 && !/escuchando/.test(salida()); i++) await new Promise((r) => setTimeout(r, 50));
  assert.match(salida(), /escuchando en 127\.0\.0\.1:38917/);
  const r = await fetch('http://127.0.0.1:38917/salud');
  assert.equal(r.status, 401);
});
