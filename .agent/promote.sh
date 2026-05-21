#!/usr/bin/env bash
# promote.sh — mueve cambios YA VALIDADOS del workspace aislado a producción.
# Garantías de seguridad:
#   - NUNCA toca .env / secretos de prod (los excluye del rsync).
#   - Respalda dist + src de prod antes de tocar nada.
#   - Verifica build en el WORKSPACE antes de promover (si el workspace no compila, aborta).
#   - Tras promover: restart + health-check. Si falla, restaura el respaldo y reinicia.
# Uso: promote.sh
set -uo pipefail

WS=/var/www/tiusdei-agent
PROD=/var/www/tiusdei
LOGDIR=/var/log/tiusdei-agent; mkdir -p "$LOGDIR"; LOG="$LOGDIR/promote.log"
BK="/var/backups/tiusdei/promote-$(date +%Y%m%d-%H%M%S)"
ts(){ date '+%F %T'; }
log(){ echo "[$(ts)] $*" >> "$LOG"; echo "$*"; }

log "=== PROMOTE inicio ==="

# 1) El workspace DEBE compilar (backend + frontend). Si no, no se promueve nada.
log "validando build del workspace..."
if ! (cd "$WS/server" && npm run build) >>"$LOG" 2>&1; then log "ABORT: workspace backend no compila"; echo "PROMOTE_ABORTED:ws_backend_build"; exit 2; fi
if ! (cd "$WS" && npm run build) >>"$LOG" 2>&1; then log "ABORT: workspace frontend no compila"; echo "PROMOTE_ABORTED:ws_frontend_build"; exit 2; fi
log "workspace compila OK"

# 2) Respaldo de prod (artefactos + fuente)
mkdir -p "$BK"
log "respaldando prod en $BK"
tar czf "$BK/prod-snapshot.tgz" -C "$PROD" dist server/dist src server/src 2>>"$LOG" || { log "ABORT: fallo respaldo"; echo "PROMOTE_ABORTED:backup"; exit 2; }

# 3) Sincronizar SOLO fuente + artefactos validados. Excluir secretos e infra.
RSYNC_EXCL="--exclude=.env --exclude=.agent.env --exclude=node_modules --exclude=.git --exclude=.agent"
log "sincronizando workspace -> prod (sin tocar .env)"
rsync -a --delete $RSYNC_EXCL "$WS/src/"        "$PROD/src/"        >>"$LOG" 2>&1
rsync -a --delete $RSYNC_EXCL "$WS/server/src/" "$PROD/server/src/" >>"$LOG" 2>&1
rsync -a --delete           "$WS/dist/"         "$PROD/dist/"        >>"$LOG" 2>&1
rsync -a --delete           "$WS/server/dist/"  "$PROD/server/dist/" >>"$LOG" 2>&1

# 4) Restart + health-check
pm2 restart tiusdei-api >>"$LOG" 2>&1
sleep 4
CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3003/api/health)
if [ "$CODE" != "200" ]; then
  log "HEALTH FALLO ($CODE) -> RESTAURANDO respaldo"
  tar xzf "$BK/prod-snapshot.tgz" -C "$PROD" >>"$LOG" 2>&1
  pm2 restart tiusdei-api >>"$LOG" 2>&1
  sleep 4
  CODE2=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3003/api/health)
  log "post-restauración health=$CODE2"
  echo "PROMOTE_FAILED:health_$CODE (restaurado, health ahora $CODE2)"; exit 3
fi

log "=== PROMOTE OK (health 200). Respaldo en $BK ==="
echo "PROMOTE_OK"
