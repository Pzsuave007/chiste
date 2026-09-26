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

## Backlog
- P1: Sound-effect audio layering in render (SFX currently selectable/metadata only, not mixed into MP4).
- P1: Character-consistency via image reference (currently textual description only).
- P2: Bulk production + social publishing (TikTok/IG/YouTube).
- P2: Voice tone/style presets per character; per-scene voice preview from ElevenLabs preview_url.
- P2: Resolve-all / TTL for stale failure log; short cache TTL for /voices.

## Next tasks
- Mix selected SFX into the FFmpeg render timeline.
- Optional Dialog aria-describedby to silence a11y warnings.
