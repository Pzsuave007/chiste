# Chiste Studio AI — PRD

## Problem statement (original)
Web app to create short 9:16 cartoon comedy videos for TikTok, Instagram Reels and YouTube Shorts. Bilingual (Spanish + English). MVP: static cartoon illustrations, AI character voices, simple camera movements, sound effects, synchronized subtitles. Features: AI joke generator (topic/language/duration + custom), script editor by character/scenes, reusable character library (visual ref + assigned voice), AI image generation with character consistency, ElevenLabs voices, video assembly into vertical MP4, storyboard with per-scene regeneration, approval workflow, project library, cost tracking + failure/retry handling.

## User choices
- Image generation: OpenAI **gpt-image-1** (Emergent Universal Key)
- Text/jokes: OpenAI **gpt-5.4** (Emergent Universal Key)
- Voices: **ElevenLabs** (user key, eleven_multilingual_v2)
- Video assembly: **self-hosted FFmpeg** (free) — replaced Creatomate at user's request (cost)
- Auth: none (open app), default language Spanish

## Architecture
- **Backend** FastAPI + MongoDB (`/app/backend/server.py`), FFmpeg module (`/app/backend/render.py`).
  - Assets (images/audio/video) stored base64 in Mongo, served at `GET /api/assets/{id}`.
  - LLM via emergentintegrations LlmChat (gpt-5.4); images via OpenAIImageGeneration (gpt-image-1); voices via elevenlabs SDK.
  - Render: background asyncio task -> imageio-ffmpeg builds per-scene segments (Ken Burns zoompan camera motion + PIL-rendered burned subtitles) -> concat -> 1080x1920 H.264 MP4.
- **Frontend** React + Tailwind + shadcn/ui + framer-motion. Bilingual context (`i18n.jsx`). Pages: Home (project library), Characters, Studio (Joke → Script/Storyboard → Approve/Export tabs).

## Personas
- Short-form comedy creators (LatAm/ES + EN) who want fast, cheap cartoon video production.

## Core requirements (static)
Joke gen, script/scene breakdown, character library, scene image gen, voices, storyboard preview + per-scene regen, approval workflow, project library, MP4 export, cost tracking + failure log, bilingual UI.

## Implemented (2026-09-26) — verified 24/24 backend, frontend E2E
- AI joke generator (topic/duration/language + custom joke).
- Script/storyboard generation (scenes: character, dialogue, camera motion, sfx, image prompt).
- Character library CRUD + AI reference image + assigned voice.
- Per-scene gpt-image-1 image generation with character-description consistency.
- ElevenLabs voices list (21) + per-scene TTS (ES/EN).
- 9:16 VideoPreview with camera-motion animation + subtitle overlay + audio playback.
- Approval workflow + "generate all" + FFmpeg MP4 export + in-app player + download.
- Project library (save/reopen/delete), cost summary dashboard, API failure log.
- Bilingual ES/EN toggle across UI.

## Implemented (2026-06) — later session
- Re-export/re-edit flow: `/projects/{id}/reset-export` clears stale video state; editing dialogue clears stale audio.
- Built-in ElevenLabs music library (presets) + volume control; punchline SFX (drums+laughs) at end of joke.
- Character consistency via anchor image (scene 0 text-to-image, scenes 1..N via gpt-image-1 image_edit).
- **Stand-up mode** (2026-06): when topic="standup", `/scripts/generate` routes to `generate_standup_script` — a SINGLE comedian on one stage delivering the whole joke across 2-3 beats (same character/stage, only expression changes), punchline SFX on last beat. Comedian can be picked from the user's character library (Studio Joke tab `standup-comedian-select`) or AI-invented. Voice uses the default/produce-panel voice (or the library char's voice if matched). Tested via curl (AI + library comedian) + UI smoke.

## Deployment package (2026-06) — VPS self-host
- Assets migrated from MongoDB base64 → **local disk** `MEDIA_DIR` (`save_asset`/`get_asset`/`_asset_bytes` in server.py); legacy base64 docs still served (backward compat). Dev default `backend/media_store/`.
- `render.py` font path made cross-distro robust (`_find_font`/`_load_font`: Debian + AlmaLinux/RHEL Liberation/DejaVu, `SUBTITLE_FONT_PATH` override, PIL default fallback).
- Frontend build committed (`frontend/.gitignore` un-ignores `/build`); `.gitignore` ignores `backend/media_store/`.
- `deploy/` folder for GoDaddy VPS + AlmaLinux + Apache/cPanel + Mongo (per user's elfaro guide): `bootstrap.sh`, `install_server.sh`, `harden.sh` (swap+mongo+systemd), `repair.sh`, `htaccess`, `requirements.prod.txt`, `backend.env.production.example`, `DEPLOY_CHISTE.md`.
- Config: repo `Pzsuave007/chiste`, domain `hazlocon.com`, cPanel user `hazlocon`, backend port `8013`, service `chiste-backend`, DB `chiste_prod`. Keys (Emergent + ElevenLabs) injected from base64 by scripts.

## Channel character + Photo→Cartoon (2026-06)
- **Channel default character**: `settings` collection + `GET/PUT /api/settings` (`default_character_id`). Star toggle on each card in Characters page (`channel-character-toggle`). Studio pre-selects it in every new project.
- **Unified main-character selector** in Studio Joke tab (`channel-character-select`, shows for all topics): passed as `comedian` in Stand-up and as `protagonist` in story mode. Story `generate_script` now forces the protagonist into every scene (`character_name` = their name) → same look across all videos via the character's saved reference image (anchor).
- **Photo → Cartoon**: `POST /api/characters/cartoonize` (multipart photo, normalized to PNG via Pillow, `gpt-image-1` image_edit with the app comic style) → returns a cartoon reference asset. Characters dialog has upload + preview + regenerate (`character-photo-upload`, `character-photo-preview`, `character-photo-regen`); `CharacterCreate.reference_image_asset_id` lets create use the cartoon directly. Tested via curl (great full-body result) + settings/protagonist curls + UI smoke.
- Deploy build helper: `frontend/build-prod.sh` (builds with relative /api + injects `/* eslint-disable */` into minified bundle so the committed build passes lint).

## Backlog
- P1: Sound-effect audio layering in render (SFX currently selectable/metadata only, not mixed into MP4).
- P1: Character-consistency via image reference (currently textual description only).
- P2: Bulk production + social publishing (TikTok/IG/YouTube).
- P2: Voice tone/style presets per character; per-scene voice preview from ElevenLabs preview_url.
- P2: Resolve-all / TTL for stale failure log; short cache TTL for /voices.

## Next tasks
- Mix selected SFX into the FFmpeg render timeline.
- Optional Dialog aria-describedby to silence a11y warnings.
