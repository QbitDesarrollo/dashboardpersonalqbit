import { crearServidor } from './servidor.mjs';
import { generarMinuta, verificarSesion } from './codex.mjs';

const {
  RUNNER_TOKEN = '', PORT = '3090',
  CODEX_BIN = 'codex', CODEX_MODELO = 'gpt-6-luna', CODEX_ESFUERZO = 'medium',
} = process.env;

if (RUNNER_TOKEN.length < 32) {
  console.error('RUNNER_TOKEN debe tener al menos 32 caracteres.');
  process.exit(1);
}

const servidor = crearServidor({
  token: RUNNER_TOKEN,
  generar: (datos) => generarMinuta(datos, { bin: CODEX_BIN, modelo: CODEX_MODELO, esfuerzo: CODEX_ESFUERZO }),
  verificarSesion: () => verificarSesion({ bin: CODEX_BIN }),
});

// Loopback only: Tiusdei's API is the one and only client.
servidor.listen(Number(PORT), '127.0.0.1', () => console.log(`[codex-runner] escuchando en 127.0.0.1:${PORT}`));
