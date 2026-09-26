# codex-runner

Turns a meeting transcript and/or the client's own notes (an email, a to-do list) into a minuta draft (title, summary, points) with Codex CLI.
It also runs the steps of Tiusdei's weekly project reports (see `REPORTES-PLAN.md` in the repo root).
Tiusdei's API is its only client: it listens on 127.0.0.1, requires a bearer token and runs one Codex job at a time (minuta or report step).

- `GET /salud` → `{ listo, detalle }` from `codex login status`.
- `POST /minuta` `{ transcripcion?, notas_cliente?, indicaciones?, fecha: "YYYY-MM-DD" }` → JSON following `minuta.schema.json`.
  At least one source is required. Sources reach Codex on stdin in separate blocks (`<transcripcion>`, `<notas_del_cliente>`);
  `indicaciones` come from the team and go into the prompt.

- `POST /trabajo` `{ tipo, entrada: {...}, indicaciones? }` → JSON following `reportes/<tipo>.schema.json`.
  `tipo` is one of `reporte-descripciones`, `reporte-avances`, `reporte-resumen`. `entrada` is data prepared by Tiusdei and reaches Codex
  on stdin inside `<datos>`; `indicaciones` (from the project leader) go into the prompt of `reporte-resumen`.

The prompts and schemas (`prompt.txt`, `minuta.schema.json`, `reportes/`) are the contract with Tiusdei; change them together with
`server/src/minutas/ia/` and `server/src/reportes/`.

## Tests

`npm test` (Node's built-in runner, no dependencies). A fake `codex` binary stands in for the real CLI.

## Install on QBIA

Runs as the `codex-ia` user (its Codex session lives in `/home/codex-ia/.codex`), isolated by systemd from `/var/www`.

```bash
sudo install -d -o root -g root -m 755 /opt/codex-runner
sudo install -o root -g root -m 644 index.mjs servidor.mjs codex.mjs prompt.txt minuta.schema.json /opt/codex-runner/
sudo install -d -o root -g root -m 755 /opt/codex-runner/reportes
sudo install -o root -g root -m 644 reportes/* /opt/codex-runner/reportes/
sudo install -o root -g codex-ia -m 640 .env.example /etc/codex-runner.env   # then set RUNNER_TOKEN
sudo install -o root -g root -m 644 codex-runner.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now codex-runner
```
