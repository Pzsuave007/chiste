#!/usr/bin/env bash
# Chiste Studio AI — first install on the VPS (run as ROOT, once).
# Installs system deps, Python venv + prod requirements, copies backend,
# writes the prod .env (with keys), creates the media store and publishes
# the pre-built frontend. Does NOT build the frontend on the server.
set -euo pipefail

# ---------------- Config ----------------
CP_USER="hazlocon"
DOMAIN="hazlocon.com"
PORT="8013"
REPO_DIR="/home/${CP_USER}/chiste"
APP_DIR="/opt/${CP_USER}/backend"
MEDIA_DIR="${APP_DIR}/media_store"
PUBLIC_HTML="/home/${CP_USER}/public_html"
DB_NAME="chiste_prod"

# base64-encoded keys (decoded at write time; keep this repo PRIVATE)
EMK_B64="c2stZW1lcmdlbnQtZUViRGE5ZkJmMmI2MUUzRjI4"
ELK_B64="c2tfMzliMjkwMGI3NWU4ODkzNzY4N2FjZDVjYjFkMzEzOWY0OWE0NDAzMDFhNTlhOTU3"

echo "==> [1/8] System packages"
dnf install -y python3.11 python3.11-devel gcc gcc-c++ make \
    dejavu-sans-fonts liberation-fonts >/dev/null 2>&1 || \
  dnf install -y python3 python3-devel gcc dejavu-sans-fonts >/dev/null 2>&1 || true

PY=python3.11
command -v $PY >/dev/null 2>&1 || PY=python3

echo "==> [2/8] Python venv at ${APP_DIR}/venv"
mkdir -p "${APP_DIR}"
$PY -m venv "${APP_DIR}/venv"
"${APP_DIR}/venv/bin/pip" install --upgrade pip wheel >/dev/null
"${APP_DIR}/venv/bin/pip" install -r "${REPO_DIR}/deploy/requirements.prod.txt" >/dev/null
"${APP_DIR}/venv/bin/pip" install emergentintegrations \
    --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ >/dev/null

echo "==> [3/8] Copy backend code"
cp "${REPO_DIR}"/backend/*.py "${APP_DIR}/"

echo "==> [4/8] Write prod .env"
ENVF="${APP_DIR}/.env"
EMK="$(printf '%s' "${EMK_B64}" | base64 -d)"
ELK="$(printf '%s' "${ELK_B64}" | base64 -d)"
cat > "${ENVF}" <<EOF
MONGO_URL=mongodb://localhost:27017
DB_NAME=${DB_NAME}
CORS_ORIGINS=https://${DOMAIN},https://www.${DOMAIN}
MEDIA_DIR=${MEDIA_DIR}
PORT=${PORT}
EMERGENT_LLM_KEY=${EMK}
ELEVENLABS_API_KEY=${ELK}
EOF

echo "==> [5/8] Media store"
mkdir -p "${MEDIA_DIR}"

echo "==> [6/8] Publish frontend build -> ${PUBLIC_HTML}"
if [ ! -f "${REPO_DIR}/frontend/build/index.html" ]; then
  echo "!! frontend/build/index.html missing. Build in Emergent (REACT_APP_BACKEND_URL='') and Save to Github."
  exit 1
fi
mkdir -p "${PUBLIC_HTML}"
rm -rf "${PUBLIC_HTML}/static" "${PUBLIC_HTML}/index.html" \
       "${PUBLIC_HTML}/asset-manifest.json" "${PUBLIC_HTML}/favicon.ico" \
       "${PUBLIC_HTML}/manifest.json" "${PUBLIC_HTML}/robots.txt" 2>/dev/null || true
cp -r "${REPO_DIR}/frontend/build/." "${PUBLIC_HTML}/"

echo "==> [7/8] .htaccess (API proxy + SPA fallback)"
sed "s/8013/${PORT}/g" "${REPO_DIR}/deploy/htaccess" > "${PUBLIC_HTML}/.htaccess"

echo "==> [8/8] Permissions"
chown -R "${CP_USER}:${CP_USER}" "/opt/${CP_USER}"
chmod -R u+rwX "${MEDIA_DIR}"
chown -R "${CP_USER}:${CP_USER}" "${PUBLIC_HTML}"
find "${PUBLIC_HTML}" -type f -exec chmod 644 {} \;
find "${PUBLIC_HTML}" -type d -exec chmod 755 {} \;

echo "==> Install done. Next: run deploy/harden.sh (swap + mongo autostart + systemd service)."
