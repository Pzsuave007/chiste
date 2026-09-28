#!/usr/bin/env bash
# Chiste Studio AI — bootstrap a FRESH server (run as ROOT).
# Clones the repo and runs the first install. After this, run deploy/harden.sh.
set -euo pipefail

GH_USER="Pzsuave007"
REPO="chiste"
CP_USER="hazlocon"
REPO_DIR="/home/${CP_USER}/${REPO}"

echo "==> Ensuring git"
command -v git >/dev/null 2>&1 || dnf install -y git >/dev/null
git config --global --add safe.directory '*' 2>/dev/null || true

echo "==> Clone / update repo at ${REPO_DIR}"
if [ -d "${REPO_DIR}/.git" ]; then
  cd "${REPO_DIR}" && git fetch --all --prune && git reset --hard origin/main
else
  git clone "https://github.com/${GH_USER}/${REPO}.git" "${REPO_DIR}"
fi

echo "==> First install"
bash "${REPO_DIR}/deploy/install_server.sh"

echo ""
echo "==> Next steps:"
echo "   1) sudo bash ${REPO_DIR}/deploy/harden.sh   # swap + mongo autostart + systemd"
echo "   2) cPanel: SSL (Let's Encrypt) + Force HTTPS + Apache modules mod_proxy, mod_proxy_http, mod_headers, mod_rewrite"
echo "   3) curl -i https://hazlocon.com/api/   -> 200 + JSON"
