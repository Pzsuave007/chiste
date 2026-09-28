#!/usr/bin/env bash
# Chiste Studio AI — one-command UPDATE (run as ROOT after every "Save to Github").
# Pulls latest, refreshes deps/backend, re-injects keys, republishes the build,
# restarts the backend and health-checks it with retries.
set -euo pipefail

CP_USER="hazlocon"
DOMAIN="hazlocon.com"
PORT="8013"
SERVICE="chiste-backend"
REPO_DIR="/home/${CP_USER}/chiste"
APP_DIR="/opt/${CP_USER}/backend"
MEDIA_DIR="${APP_DIR}/media_store"
PUBLIC_HTML="/home/${CP_USER}/public_html"
ENVF="${APP_DIR}/.env"
DB_NAME="chiste_prod"

EMK_B64="c2stZW1lcmdlbnQtZUViRGE5ZkJmMmI2MUUzRjI4"
ELK_B64="c2tfMzliMjkwMGI3NWU4ODkzNzY4N2FjZDVjYjFkMzEzOWY0OWE0NDAzMDFhNTlhOTU3"

echo "==> [1/8] Pull latest"
git config --global --add safe.directory '*' 2>/dev/null || true
cd "${REPO_DIR}"
git fetch --all --prune
git reset --hard origin/main

echo "==> [2/8] Refresh python deps"
"${APP_DIR}/venv/bin/pip" install -r "${REPO_DIR}/deploy/requirements.prod.txt" >/dev/null
"${APP_DIR}/venv/bin/pip" install emergentintegrations \
    --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ >/dev/null

echo "==> [3/8] Copy backend code"
cp "${REPO_DIR}"/backend/*.py "${APP_DIR}/"

echo "==> [4/8] Ensure full .env (always write current keys)"
touch "${ENVF}"
EMK="$(printf '%s' "${EMK_B64}" | base64 -d)"
ELK="$(printf '%s' "${ELK_B64}" | base64 -d)"
sed -i '/^EMERGENT_LLM_KEY=/d;/^ELEVENLABS_API_KEY=/d' "${ENVF}"
echo "EMERGENT_LLM_KEY=${EMK}"  >> "${ENVF}"
echo "ELEVENLABS_API_KEY=${ELK}" >> "${ENVF}"
grep -q '^MONGO_URL='    "${ENVF}" || echo "MONGO_URL=mongodb://localhost:27017" >> "${ENVF}"
grep -q '^DB_NAME='      "${ENVF}" || echo "DB_NAME=${DB_NAME}" >> "${ENVF}"
grep -q '^PORT='         "${ENVF}" || echo "PORT=${PORT}" >> "${ENVF}"
grep -q '^MEDIA_DIR='    "${ENVF}" || echo "MEDIA_DIR=${MEDIA_DIR}" >> "${ENVF}"
grep -q '^CORS_ORIGINS=' "${ENVF}" || echo "CORS_ORIGINS=https://${DOMAIN},https://www.${DOMAIN}" >> "${ENVF}"

echo "==> [5/8] Verify build exists"
if [ ! -f "${REPO_DIR}/frontend/build/index.html" ]; then
  echo "!! frontend/build/index.html missing — build in Emergent and Save to Github. Aborting."
  exit 1
fi

echo "==> [6/8] Publish build + .htaccess"
rm -rf "${PUBLIC_HTML}/static" "${PUBLIC_HTML}/index.html" \
       "${PUBLIC_HTML}/asset-manifest.json" "${PUBLIC_HTML}/favicon.ico" \
       "${PUBLIC_HTML}/manifest.json" "${PUBLIC_HTML}/robots.txt" 2>/dev/null || true
cp -r "${REPO_DIR}/frontend/build/." "${PUBLIC_HTML}/"
sed "s/8013/${PORT}/g" "${REPO_DIR}/deploy/htaccess" > "${PUBLIC_HTML}/.htaccess"

echo "==> [7/8] Permissions + restart"
mkdir -p "${MEDIA_DIR}"
chown -R "${CP_USER}:${CP_USER}" "/opt/${CP_USER}"
chmod -R u+rwX "${MEDIA_DIR}"
chown -R "${CP_USER}:${CP_USER}" "${PUBLIC_HTML}"
find "${PUBLIC_HTML}" -type f -exec chmod 644 {} \;
find "${PUBLIC_HTML}" -type d -exec chmod 755 {} \;
systemctl restart "${SERVICE}"

echo "==> [8/8] Health check (retries)"
OK=0
for i in $(seq 1 12); do
  RESP="$(curl -s --max-time 8 "http://127.0.0.1:${PORT}/api/" || true)"
  echo "   try ${i}: ${RESP:-<no response>}"
  echo "${RESP}" | grep -q 'Chiste Studio AI API' && { OK=1; break; }
  sleep 3
done
[ "${OK}" = "1" ] && echo "==> ✅ Backend healthy. Reload the site with Ctrl+Shift+R." \
                    || { echo "==> ❌ Backend not healthy. Check: journalctl -u ${SERVICE} -n 60 --no-pager"; exit 1; }
