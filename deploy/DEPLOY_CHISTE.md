# 🚀 Deploy — Chiste Studio AI → tu VPS (hazlocon.com)

App full-stack (React + FastAPI + MongoDB) que genera videos cartoon 9:16.
Sigue el patrón de tu guía `elfaro/deploy/NEXT_PROJECT_GUIDE.md`.

## Datos de este proyecto
| Cosa | Valor |
|------|-------|
| Repo | `github.com/Pzsuave007/chiste` |
| Dominio | `hazlocon.com` (+ `www.hazlocon.com`) |
| Usuario cPanel | `hazlocon` |
| Puerto backend | **8013** |
| Servicio systemd | `chiste-backend` |
| Backend runtime | `/opt/hazlocon/backend` |
| Repo en server | `/home/hazlocon/chiste` |
| Docroot | `/home/hazlocon/public_html` |
| DB | `chiste_prod` (Mongo local) |
| Assets | **disco local** `MEDIA_DIR=/opt/hazlocon/backend/media_store` |

## ⚠️ Específico de esta app (léelo)
- **Render de video con FFmpeg**: el MP4 se arma en el server con `imageio-ffmpeg` (binario estático, no requiere `dnf install ffmpeg`). Consume CPU/RAM unos segundos por video → el **swap de `harden.sh` es obligatorio**.
- **Fuente de subtítulos**: `render.py` autodetecta la fuente (Liberation/DejaVu). `install_server.sh` instala `dejavu-sans-fonts` y `liberation-fonts`. Si hiciera falta, fija `SUBTITLE_FONT_PATH` en el `.env`.
- **Dos servicios de IA**: `EMERGENT_LLM_KEY` (textos GPT + imágenes gpt-image-1) y `ELEVENLABS_API_KEY` (voces/SFX/música). Ambas se inyectan desde base64 en los scripts.
- **Sin autenticación** (MVP abierto). No hay JWT/admin.
- 🔒 **Mantén este repo PRIVADO**: las claves van en base64 dentro de los scripts (ofuscación, no cifrado).

## Pasos (server fresco)
```bash
# 1) En Emergent: frontend ya construido con URL relativa y commiteado (Save to Github)
# 2) En el server como root:
git config --global --add safe.directory '*'
curl -sSL https://raw.githubusercontent.com/Pzsuave007/chiste/main/bootstrap.sh | bash
sudo bash /home/hazlocon/chiste/deploy/harden.sh
# 3) cPanel: SSL + Force HTTPS + módulos Apache (mod_proxy, mod_proxy_http, mod_headers, mod_rewrite)
# 4) Verificar:
curl -i https://hazlocon.com/api/     # -> 200 + {"message":"Chiste Studio AI API"}
```

## Updates futuros (cada vez)
```bash
sudo bash /home/hazlocon/chiste/deploy/repair.sh
# luego Ctrl+Shift+R en el navegador
```

## Logs útiles
```bash
journalctl -u chiste-backend -n 60 --no-pager   # backend
ss -ltn | grep 27017                              # ¿mongo arriba?
systemctl restart chiste-backend                  # reiniciar backend
tail -n 50 /usr/local/apache/logs/error_log       # apache
```
