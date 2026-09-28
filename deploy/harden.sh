#!/usr/bin/env bash
# Chiste Studio AI — harden the VPS (run as ROOT, ONCE per server).
# 1) 2 GB swap  2) MongoDB autostart  3) backend as systemd (Restart=always).
set -euo pipefail

CP_USER="hazlocon"
PORT="8013"
SERVICE="chiste-backend"
APP_DIR="/opt/${CP_USER}/backend"

echo "==> [1/3] Swap (2 GB)"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "   swap enabled"
else
  echo "   swap already present"
fi

echo "==> [2/3] MongoDB autostart"
systemctl enable --now mongod 2>/dev/null || systemctl enable --now mongodb 2>/dev/null || \
  echo "   (adjust mongo service name if this warns)"

echo "==> [3/3] systemd service ${SERVICE}"
cat > "/etc/systemd/system/${SERVICE}.service" <<EOF
[Unit]
Description=Chiste Studio AI backend (FastAPI/uvicorn)
After=network.target mongod.service
Wants=mongod.service

[Service]
Type=simple
User=${CP_USER}
Group=${CP_USER}
WorkingDirectory=${APP_DIR}
Environment=PORT=${PORT}
ExecStart=${APP_DIR}/venv/bin/uvicorn server:app --host 127.0.0.1 --port ${PORT}
Restart=always
RestartSec=3
StartLimitIntervalSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "${SERVICE}"
sleep 3
systemctl --no-pager status "${SERVICE}" | head -n 6 || true
echo "==> Hardening done. Backend on 127.0.0.1:${PORT}."
