# codex-runner

Turns a meeting transcript into a minuta draft (title, summary, points) with Codex CLI.
Tiusdei's API is its only client: it listens on 127.0.0.1, requires a bearer token and runs one minuta at a time.

- `GET /salud` → `{ listo, detalle }` from `codex login status`.
- `POST /minuta` `{ transcripcion, fecha: "YYYY-MM-DD" }` → JSON following `minuta.schema.json`.

The prompt (`prompt.txt`) and schema are the contract with Tiusdei; change them together with `server/src/minutas/ia/`.

## Tests

`npm test` (Node's built-in runner, no dependencies). A fake `codex` binary stands in for the real CLI.

## Install on QBIA

Runs as the `codex-ia` user (its Codex session lives in `/home/codex-ia/.codex`), isolated by systemd from `/var/www`.

```bash
sudo install -d -o root -g root -m 755 /opt/codex-runner
sudo install -o root -g root -m 644 index.mjs servidor.mjs codex.mjs prompt.txt minuta.schema.json /opt/codex-runner/
sudo install -o root -g codex-ia -m 640 .env.example /etc/codex-runner.env   # then set RUNNER_TOKEN
sudo install -o root -g root -m 644 codex-runner.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now codex-runner
```
