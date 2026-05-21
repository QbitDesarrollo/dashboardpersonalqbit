#!/usr/bin/env bash
# safe-deploy.sh <checkpoint_commit>
# Valida y aplica los cambios del working tree. Si el build o el health-check
# fallan, hace rollback duro al commit de checkpoint y restaura el servicio.
# Salida: imprime DEPLOY_OK o DEPLOY_FAILED:<motivo> en la última línea.
set -uo pipefail
cd /var/www/tiusdei || { echo "DEPLOY_FAILED:no_repo"; exit 1; }

CKPT="${1:-}"
LOGDIR=/var/log/tiusdei-agent
mkdir -p "$LOGDIR"
LOG="$LOGDIR/deploy.log"
ts() { date '+%F %T'; }
log() { echo "[$(ts)] $*" >> "$LOG"; echo "$*"; }

rollback() {
  if [ -n "$CKPT" ]; then
    log "ROLLBACK -> $CKPT"
    git reset --hard "$CKPT" >>"$LOG" 2>&1
    # Borrar archivos nuevos sin trackear que agregó el fix (scoped a código,
    # NO toca .agent/, logs, node_modules ni .env que son gitignored/fuera de scope)
    git clean -fd server/src src public >>"$LOG" 2>&1
    (cd server && npm run build) >>"$LOG" 2>&1
    npm run build >>"$LOG" 2>&1
    pm2 restart tiusdei-api >>"$LOG" 2>&1
    log "rollback aplicado"
  else
    log "sin checkpoint: rollback manual requerido"
  fi
}

log "=== safe-deploy inicio (ckpt=${CKPT:-none}) ==="

# ¿Cambió frontend? (para no rebuildear el front si solo tocó backend)
FRONT_CHANGED=0
if [ -n "$(git status --porcelain src public index.html 2>/dev/null)" ]; then FRONT_CHANGED=1; fi
BACK_CHANGED=0
if [ -n "$(git status --porcelain server/src 2>/dev/null)" ]; then BACK_CHANGED=1; fi
log "cambios: backend=$BACK_CHANGED frontend=$FRONT_CHANGED"

# 1) Build backend (siempre valida tipos, es rápido)
log "tsc/build backend..."
if ! (cd server && npm run build) >>"$LOG" 2>&1; then
  log "FALLO build backend"; rollback; echo "DEPLOY_FAILED:build_backend"; exit 2
fi

# 2) Build frontend solo si cambió
if [ "$FRONT_CHANGED" = "1" ]; then
  log "build frontend..."
  if ! npm run build >>"$LOG" 2>&1; then
    log "FALLO build frontend"; rollback; echo "DEPLOY_FAILED:build_frontend"; exit 2
  fi
fi

# 3) Restart backend solo si cambió backend
if [ "$BACK_CHANGED" = "1" ]; then
  pm2 restart tiusdei-api >>"$LOG" 2>&1
  sleep 4
fi

# 4) Health-check
CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3003/api/health)
if [ "$CODE" != "200" ]; then
  log "HEALTH-CHECK FALLO (http=$CODE)"; rollback
  sleep 4
  CODE2=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3003/api/health)
  log "post-rollback health=$CODE2"
  echo "DEPLOY_FAILED:health_$CODE"; exit 3
fi

log "=== DEPLOY OK (health 200) ==="
echo "DEPLOY_OK"
