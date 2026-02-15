#!/bin/bash
# =============================================================
# TIUSDEI Portal - Script de despliegue para Ubuntu
# =============================================================
# Uso: chmod +x deploy/deploy.sh && sudo ./deploy/deploy.sh
# =============================================================

set -e

APP_DIR="/var/www/tiusdei"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_VERSION="20"

echo "=========================================="
echo "  TIUSDEI Portal - Despliegue Ubuntu"
echo "=========================================="

# 1. Instalar Node.js si no existe
if ! command -v node &> /dev/null; then
    echo "[1/8] Instalando Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "[1/8] Node.js ya instalado: $(node -v)"
fi

# 2. Instalar PM2 globalmente
if ! command -v pm2 &> /dev/null; then
    echo "[2/8] Instalando PM2..."
    sudo npm install -g pm2
else
    echo "[2/8] PM2 ya instalado"
fi

# 3. Instalar Nginx si no existe
if ! command -v nginx &> /dev/null; then
    echo "[3/8] Instalando Nginx..."
    sudo apt-get update
    sudo apt-get install -y nginx
else
    echo "[3/8] Nginx ya instalado"
fi

# 4. Crear directorio de la app
echo "[4/8] Preparando directorios..."
sudo mkdir -p ${APP_DIR}/logs
sudo chown -R $USER:$USER ${APP_DIR}

# 5. Copiar archivos
echo "[5/8] Copiando archivos..."
cp -r ${REPO_DIR}/server ${APP_DIR}/
cp ${REPO_DIR}/ecosystem.config.cjs ${APP_DIR}/

# 6. Build del frontend
echo "[6/8] Construyendo frontend..."
cd ${REPO_DIR}
npm install
npm run build
cp -r ${REPO_DIR}/dist ${APP_DIR}/

# 7. Build del backend
echo "[7/8] Construyendo backend..."
cd ${APP_DIR}/server
npm install
npm run build

# 8. Configurar y arrancar servicios
echo "[8/8] Iniciando servicios..."

# Copiar config de nginx (no toca otros sitios existentes)
sudo cp ${REPO_DIR}/deploy/nginx.conf /etc/nginx/sites-available/tiusdei
sudo ln -sf /etc/nginx/sites-available/tiusdei /etc/nginx/sites-enabled/tiusdei
sudo nginx -t && sudo systemctl reload nginx

# Arrancar API con PM2
cd ${APP_DIR}
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

echo ""
echo "=========================================="
echo "  Despliegue completado!"
echo "=========================================="
echo ""
echo "  Frontend: https://tiusdei.qbit.ec"
echo "  API:      https://tiusdei.qbit.ec/api/health"
echo ""
echo "  Comandos útiles:"
echo "    pm2 status          - Ver estado del API"
echo "    pm2 logs tiusdei-api - Ver logs del API"
echo "    pm2 restart all     - Reiniciar API"
echo ""
echo "  IMPORTANTE: Configura el archivo .env del servidor:"
echo "    cp ${APP_DIR}/server/.env.example ${APP_DIR}/server/.env"
echo "    nano ${APP_DIR}/server/.env"
echo ""
echo "  Para HTTPS con Let's Encrypt:"
echo "    sudo apt install certbot python3-certbot-nginx"
echo "    sudo certbot --nginx -d tiusdei.qbit.ec"
echo ""
