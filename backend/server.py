from fastapi import FastAPI, APIRouter, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import base64
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
from elevenlabs.client import ElevenLabs
from render import render_video

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Local disk media storage (images/audio/video) — avoids bloating MongoDB on low-RAM servers
MEDIA_DIR = os.environ.get('MEDIA_DIR', str(ROOT_DIR / 'media_store'))
Path(MEDIA_DIR).mkdir(parents=True, exist_ok=True)
# Public base URL so external services (fal.ai) can fetch our assets by absolute HTTPS URL
PUBLIC_BASE_URL = os.environ.get('PUBLIC_BASE_URL', '').rstrip('/')

def _public_asset_url(asset_id: str) -> str:
    return f"{PUBLIC_BASE_URL}/api/assets/{asset_id}"
_EXT = {
    "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp",
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
    "audio/ogg": "ogg", "video/mp4": "mp4",
}

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
ELEVENLABS_API_KEY = os.environ.get('ELEVENLABS_API_KEY')
CREATOMATE_API_KEY = os.environ.get('CREATOMATE_API_KEY')

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------------- Cost model ----------------
COST = {
    "joke": 0.01,
    "script": 0.02,
    "image": 0.04,          # per gpt-image-1 image
    "tts_per_char": 0.00018,  # ElevenLabs approx
    "render_per_sec": 0.0,    # FFmpeg local render is free
}

def now_iso():
    return datetime.now(timezone.utc).isoformat()

async def log_cost(project_id: Optional[str], kind: str, units: float, amount: float, detail: str = ""):
    doc = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "kind": kind,
        "units": units,
        "amount": round(amount, 4),
        "detail": detail,
        "created_at": now_iso(),
    }
    await db.cost_events.insert_one(doc)
    doc.pop("_id", None)
    return doc

async def log_failure(service: str, endpoint: str, error: str, project_id: Optional[str] = None, payload: Optional[dict] = None):
    doc = {
        "id": str(uuid.uuid4()),
        "service": service,
        "endpoint": endpoint,
        "error": str(error)[:500],
        "project_id": project_id,
        "payload": payload or {},
        "resolved": False,
        "attempts": 1,
        "created_at": now_iso(),
    }
    await db.api_failures.insert_one(doc)
    logger.error(f"[{service}] {endpoint} failed: {error}")

# ---------------- Asset storage (images/audio on local disk) ----------------
async def save_asset(kind: str, content_type: str, data_bytes: bytes, project_id: Optional[str] = None) -> str:
    asset_id = str(uuid.uuid4())
    ext = _EXT.get(content_type, "bin")
    rel = f"{kind}/{asset_id}.{ext}"
    fpath = Path(MEDIA_DIR) / rel
    fpath.parent.mkdir(parents=True, exist_ok=True)
    await asyncio.to_thread(fpath.write_bytes, data_bytes)
    await db.assets.insert_one({
        "id": asset_id,
        "kind": kind,
        "content_type": content_type,
        "path": rel,
        "project_id": project_id,
        "created_at": now_iso(),
    })
    return asset_id

@api_router.get("/assets/{asset_id}")
async def get_asset(asset_id: str):
    doc = await db.assets.find_one({"id": asset_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Asset not found")
    # backward compat: legacy assets stored base64 inline in Mongo
    if doc.get("data"):
        return Response(content=base64.b64decode(doc["data"]), media_type=doc["content_type"])
    fpath = Path(MEDIA_DIR) / doc["path"]
    if not fpath.exists():
        raise HTTPException(404, "Asset file missing")
    data = await asyncio.to_thread(fpath.read_bytes)
    return Response(content=data, media_type=doc["content_type"])

# ---------------- LLM helpers ----------------
def strip_json(text: str) -> str:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    return text

async def llm_complete(system: str, prompt: str, session: str = "chiste") -> str:
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session, system_message=system).with_model("openai", "gpt-5.4")
    resp = await chat.send_message(UserMessage(text=prompt))
    return resp if isinstance(resp, str) else str(resp)

# ---------------- Image generation (gpt-image-1) ----------------
STYLE_PREFIXES = {
    "comic": (
        "Modern digital comic book illustration. Bold, clean, crisp black ink outlines of even weight; "
        "FULL COLOR with a natural, realistic color palette and true-to-life skin tones and natural lighting; "
        "subtle Ben-Day halftone dot shading; smooth cel shading; sharp high-quality vector-like linework; "
        "well-proportioned faces and correct, clean anatomy; dynamic polished composition. Professional comic-book look. "
        "NOT oversaturated, NOT painterly, NOT faded, NOT sketchy, no cross-hatching. A single clear scene. "
        "NO text, NO words, NO speech bubbles, NO captions, no logos, no watermarks."
    ),
    "illustration": (
        "Editorial illustration, warm flat vector style, clean shapes, soft harmonious palette, subtle texture, "
        "culturally relevant, no text, no words, no logos, no watermarks."
    ),
}

async def gen_image_bytes(prompt: str, size: str = "1024x1536", quality: str = "medium") -> bytes:
    """gpt-image-1 via Emergent proxy with portrait size support; falls back to library default on error."""
    def _call():
        import base64 as _b64, requests as _rq
        from litellm import image_generation as _img
        from emergentintegrations.llm.utils import get_integration_proxy_url
        r = _img(model="openai/gpt-image-1", prompt=prompt, n=1, api_key=EMERGENT_LLM_KEY,
                 api_base=get_integration_proxy_url() + "/llm", quality=quality, size=size)
        d = r.data[0]
        if getattr(d, "b64_json", None):
            return _b64.b64decode(d.b64_json)
        if getattr(d, "url", None):
            return _rq.get(d.url).content
        raise RuntimeError("Unexpected image response")
    try:
        return await asyncio.to_thread(_call)
    except Exception as e:
        logger.warning(f"portrait image gen failed ({e}); falling back to default size")
        image_gen = OpenAIImageGeneration(api_key=EMERGENT_LLM_KEY)
        imgs = await image_gen.generate_images(prompt=prompt, model="gpt-image-1", number_of_images=1)
        if not imgs:
            raise RuntimeError("No image returned")
        return imgs[0]

async def edit_image_bytes(ref_bytes: bytes, prompt: str, size: str = "1024x1536", quality: str = "medium") -> bytes:
    """gpt-image-1 image edit: keeps the reference character consistent in a new scene."""
    def _call():
        import base64 as _b64, io as _io
        from litellm import image_edit as _edit
        from emergentintegrations.llm.utils import get_integration_proxy_url
        bio = _io.BytesIO(ref_bytes)
        bio.name = "ref.png"
        r = _edit(image=bio, prompt=prompt,
                  model="gpt-image-1", api_key=EMERGENT_LLM_KEY,
                  api_base=get_integration_proxy_url() + "/llm", size=size, quality=quality,
                  custom_llm_provider="openai")
        return _b64.b64decode(r.data[0].b64_json)
    return await asyncio.to_thread(_call)

# ---------------- Models ----------------
class JokeRequest(BaseModel):
    topic: str = "standup"
    language: str = "es"
    duration: int = 30
    custom_joke: Optional[str] = None

class ScriptRequest(BaseModel):
    joke: str
    language: str = "es"
    duration: int = 30
    topic: str = ""
    characters: List[Dict[str, Any]] = []
    comedian: Optional[Dict[str, Any]] = None
    protagonist: Optional[Dict[str, Any]] = None

class Character(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    visual_dna: str = ""
    color: str = "#FF5A36"
    voice_id: Optional[str] = None
    voice_name: Optional[str] = None
    reference_image_asset_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)

class CharacterCreate(BaseModel):
    name: str
    description: str = ""
    color: str = "#FF5A36"
    voice_id: Optional[str] = None
    voice_name: Optional[str] = None
    generate_image: bool = False
    reference_image_asset_id: Optional[str] = None

class Scene(BaseModel):
    index: int
    character_name: str = ""
    character_id: Optional[str] = None
    dialogue: str = ""
    is_narration: bool = False
    camera_motion: str = "zoom_in"
    sfx: str = "none"
    image_prompt: str = ""
    image_asset_id: Optional[str] = None
    audio_asset_id: Optional[str] = None
    voice_id: Optional[str] = None
    approved: bool = False
    clip_asset_id: Optional[str] = None
    clip_src: Optional[str] = None

class ProjectCreate(BaseModel):
    title: str
    language: str = "es"
    topic: str = "standup"
    duration: int = 30
    art_style: str = "comic"
    default_voice_id: Optional[str] = None
    music_volume: int = 20
    laugh_intensity: str = "medium"
    joke: str = ""
    scenes: List[Scene] = []
    animate: bool = False

class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    joke: Optional[str] = None
    scenes: Optional[List[Scene]] = None
    status: Optional[str] = None
    default_voice_id: Optional[str] = None
    music_volume: Optional[int] = None
    laugh_intensity: Optional[str] = None
    animate: Optional[bool] = None

class TTSRequest(BaseModel):
    text: str
    voice_id: str
    stability: float = 0.5
    similarity_boost: float = 0.75
    style: float = 0.4
    project_id: Optional[str] = None

class SceneGenRequest(BaseModel):
    scene: Scene
    characters: List[Dict[str, Any]] = []
    language: str = "es"

# ---------------- Joke generation ----------------
@api_router.post("/jokes/generate")
async def generate_joke(req: JokeRequest):
    if req.custom_joke and req.custom_joke.strip():
        await log_cost(None, "joke", 1, COST["joke"], "custom")
        return {"joke": req.custom_joke.strip(), "source": "custom"}
    lang = "Spanish (Latin American)" if req.language == "es" else "English"
    system = (
        "You are a professional comedy writer for short vertical cartoon videos (TikTok/Reels/Shorts). "
        "Write punchy, clean, family-friendly jokes with a clear setup and punchline."
    )
    prompt = (
        f"Write ONE original short joke in {lang} about the topic: '{req.topic}'. "
        f"It should fit a {req.duration}-second cartoon video. Keep it concise, visual and funny. "
        "Return ONLY the joke text, no preface."
    )
    try:
        joke = await llm_complete(system, prompt, "joke-gen")
        await log_cost(None, "joke", 1, COST["joke"], req.topic)
        return {"joke": joke.strip(), "source": "ai"}
    except Exception as e:
        await log_failure("openai", "/jokes/generate", e)
        raise HTTPException(502, "Joke generation failed. Please retry.")

# ---------------- Stand-up generation (single comedian, no story) ----------------
async def generate_standup_script(req: ScriptRequest):
    lang = "Spanish" if req.language == "es" else "English"
    n_beats = max(2, min(3, round(req.duration / 12)))
    comedian = req.comedian or {}
    cname = (comedian.get("name") or "").strip()
    cdesc = (comedian.get("description") or comedian.get("visual_dna") or "").strip()
    if cname and cdesc:
        who = (f"The comedian is an EXISTING character named {cname}: {cdesc}. "
               "Keep this exact name and look; do NOT invent a new one.")
    elif cname:
        who = f"The comedian is named {cname}. Invent a short cartoon visual description for them."
    else:
        who = "Invent ONE cartoon stand-up comedian (give them a name and a short visual description)."
    system = (
        "You write a stand-up comedy bit for a vertical cartoon short. A SINGLE cartoon comedian stands at a "
        "microphone on a small comedy-club stage and tells the whole joke straight to the audience. "
        "There is NO story, NO other characters and NO location changes: the same comedian on the same stage "
        "the entire time. You always respond with strict JSON."
    )
    prompt = (
        f"Joke (in {lang}):\n{req.joke}\n\n{who}\n"
        f"Split the delivery into {n_beats} short beats (setup building to the punchline) for a ~{req.duration}s clip. "
        "Every beat is the SAME comedian at the SAME microphone on the SAME stage; only the facial expression and "
        "hand gesture change between beats.\n"
        "Return STRICT JSON:\n"
        '{"comedian":{"name":"","description":"cartoon visual description"},'
        '"scenes":[{"dialogue":"","expression":"facial expression + hand gesture for this beat"}]}\n'
        f"Write all dialogue in {lang}. Keep each line short and punchy. The LAST beat is the punchline. Return ONLY JSON."
    )
    try:
        raw = await llm_complete(system, prompt, "standup-gen")
        data = json.loads(strip_json(raw))
        com = data.get("comedian", {}) or {}
        final_name = cname or com.get("name", "Comediante")
        final_desc = cdesc or com.get("description", "")
        beats = data.get("scenes", []) or []
        scenes = []
        for i, b in enumerate(beats):
            expr = (b.get("expression") or "").strip()
            img_prompt = (
                f"A single cartoon stand-up comedian named {final_name}: {final_desc}. "
                "Standing at a vintage microphone on a small comedy-club stage, exposed red brick wall background, "
                "warm spotlight from above, a wooden stool nearby. Medium shot facing the audience. "
                f"Expression and gesture: {expr}."
            )
            scenes.append(Scene(
                index=i,
                character_name=final_name,
                dialogue=b.get("dialogue", ""),
                is_narration=False,
                camera_motion="zoom_in" if i == 0 else "static",
                sfx="punchline" if i == len(beats) - 1 else "none",
                image_prompt=img_prompt,
            ).model_dump())
        await log_cost(None, "script", 1, COST["script"], "standup")
        return {"characters": [{"name": final_name, "description": final_desc}], "scenes": scenes}
    except HTTPException:
        raise
    except Exception as e:
        await log_failure("openai", "/scripts/generate (standup)", e)
        raise HTTPException(502, "Script generation failed. Please retry.")

# ---------------- Script generation ----------------
@api_router.post("/scripts/generate")
async def generate_script(req: ScriptRequest):
    if req.topic == "standup":
        return await generate_standup_script(req)
    lang = "Spanish" if req.language == "es" else "English"
    n_scenes = max(2, min(6, round(req.duration / 8)))
    proto = req.protagonist or {}
    pname = (proto.get("name") or "").strip()
    pdesc = (proto.get("description") or proto.get("visual_dna") or "").strip()
    char_hint = ""
    if pname:
        char_hint = (
            f"The MAIN CHARACTER (protagonist) is {pname}: {pdesc}. "
            f"{pname} must appear in EVERY scene as the one telling or acting out the joke, and you MUST use "
            f'the exact name "{pname}" as character_name in every scene. Add extra minor characters only if strictly needed. '
        )
    elif req.characters:
        names = ", ".join([c.get("name", "") for c in req.characters])
        char_hint = f"Use these existing characters when possible: {names}. "
    system = (
        "You are a storyboard writer for short cartoon comedy videos. You break a joke into visual scenes "
        "with per-character dialogue, camera movement and a sound effect. You always respond with strict JSON."
    )
    prompt = (
        f"Break this joke into a storyboard of about {n_scenes} scenes for a {req.duration}s vertical cartoon video in {lang}.\n\n"
        f"JOKE:\n{req.joke}\n\n{char_hint}"
        "Return STRICT JSON with this shape:\n"
        '{"characters":[{"name":"","description":"visual cartoon description"}],'
        '"scenes":[{"character_name":"","dialogue":"","is_narration":false,'
        '"camera_motion":"zoom_in|zoom_out|pan_left|pan_right|tilt_up|static",'
        '"sfx":"none|laugh|drum|boing|pop|whoosh|applause|ding",'
        '"image_prompt":"detailed cartoon scene illustration prompt, flat vector style, vibrant colors, 9:16"}]}\n'
        "Keep dialogue short and punchy. The final scene must land the punchline. Return ONLY JSON."
    )
    try:
        raw = await llm_complete(system, prompt, "script-gen")
        data = json.loads(strip_json(raw))
        scenes = []
        for i, s in enumerate(data.get("scenes", [])):
            scenes.append(Scene(
                index=i,
                character_name=s.get("character_name", ""),
                dialogue=s.get("dialogue", ""),
                is_narration=bool(s.get("is_narration", False)),
                camera_motion=s.get("camera_motion", "zoom_in"),
                sfx=s.get("sfx", "none"),
                image_prompt=s.get("image_prompt", ""),
            ).model_dump())
        await log_cost(None, "script", 1, COST["script"])
        # keep sound effects only at the end: silence between scenes, punchline (drums+laughs) at the last
        for i, s in enumerate(scenes):
            s["sfx"] = "punchline" if i == len(scenes) - 1 else "none"
        return {"characters": data.get("characters", []), "scenes": scenes}
    except HTTPException:
        raise
    except Exception as e:
        await log_failure("openai", "/scripts/generate", e)
        raise HTTPException(502, "Script generation failed. Please retry.")

# ---------------- Characters ----------------
async def make_visual_dna(name: str, description: str) -> str:
    if not description.strip():
        return ""
    try:
        system = ("You create a canonical 'visual DNA' for a cartoon character so an image model draws it "
                  "identically every time. Output ONE compact comma-separated line.")
        prompt = (f"Character name: {name}. Notes: {description}. "
                  "Produce a concise canonical visual description (max 55 words) covering: species/gender, age, "
                  "skin/fur color, hair style & color, eye color, distinctive facial features, exact outfit with colors, "
                  "body type, and 'flat vector cartoon style'. Return ONLY the description line.")
        dna = await llm_complete(system, prompt, "visual-dna")
        return dna.strip().replace("\n", " ")
    except Exception:
        return description.strip()

async def gen_character_image(description: str, name: str, color: str, style: str = "comic", project_id=None) -> str:
    prefix = STYLE_PREFIXES.get(style, STYLE_PREFIXES["comic"])
    prompt = (
        f"{prefix} Full-body character reference of a cartoon character named {name}: {description}. "
        f"Full body visible, neutral friendly pose, centered on a plain light studio background."
    )
    img = await gen_image_bytes(prompt, size="1024x1536", quality="medium")
    return await save_asset("character_image", "image/png", img, project_id)

@api_router.get("/characters")
async def list_characters():
    docs = await db.characters.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs

# ---------------- App settings (channel default character) ----------------
class SettingsUpdate(BaseModel):
    default_character_id: Optional[str] = None

@api_router.get("/settings")
async def get_settings():
    doc = await db.settings.find_one({"key": "app"}, {"_id": 0}) or {}
    return {"default_character_id": doc.get("default_character_id")}

@api_router.put("/settings")
async def update_settings(req: SettingsUpdate):
    await db.settings.update_one(
        {"key": "app"},
        {"$set": {"default_character_id": req.default_character_id}},
        upsert=True,
    )
    return {"default_character_id": req.default_character_id}

@api_router.post("/characters/cartoonize")
async def cartoonize_photo(file: UploadFile = File(...), name: str = Form("")):
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    try:
        import io as _io
        from PIL import Image
        im = Image.open(_io.BytesIO(raw)).convert("RGB")
        buf = _io.BytesIO(); im.save(buf, format="PNG"); png = buf.getvalue()
        prefix = STYLE_PREFIXES["comic"]
        who = f" named {name.strip()}" if name.strip() else ""
        prompt = (
            f"{prefix} Turn the real person in this photo into a full-body cartoon character reference{who}, "
            "in this exact comic/vector cartoon style. Keep their recognizable features: face shape, hairstyle and "
            "hair color, skin tone, facial hair, glasses, and general outfit style. Neutral friendly pose, "
            "centered on a plain light studio background. Full body visible."
        )
        img = await edit_image_bytes(png, prompt)
        asset_id = await save_asset("character_image", "image/png", img, None)
        await log_cost(None, "image", 1, COST["image"], "cartoonize")
        return {"asset_id": asset_id, "url": f"/api/assets/{asset_id}"}
    except HTTPException:
        raise
    except Exception as e:
        await log_failure("openai", "/characters/cartoonize", e)
        raise HTTPException(502, "Could not cartoonize this photo. Try another clear, front-facing photo.")

@api_router.post("/characters")
async def create_character(req: CharacterCreate):
    char = Character(**req.model_dump(exclude={"generate_image"}))
    char.visual_dna = await make_visual_dna(req.name, req.description)
    if req.generate_image and not req.reference_image_asset_id:
        try:
            char.reference_image_asset_id = await gen_character_image(
                char.visual_dna or req.description, req.name, req.color)
            await log_cost(None, "image", 1, COST["image"], f"character:{req.name}")
        except Exception as e:
            await log_failure("openai", "/characters (image)", e)
    doc = char.model_dump()
    await db.characters.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.post("/characters/{char_id}/generate-image")
async def regenerate_character_image(char_id: str):
    char = await db.characters.find_one({"id": char_id}, {"_id": 0})
    if not char:
        raise HTTPException(404, "Character not found")
    try:
        desc = char.get("visual_dna") or char.get("description", "")
        asset_id = await gen_character_image(desc, char["name"], char.get("color", "#FF5A36"))
        await db.characters.update_one({"id": char_id}, {"$set": {"reference_image_asset_id": asset_id}})
        await log_cost(None, "image", 1, COST["image"], f"character:{char['name']}")
        return {"reference_image_asset_id": asset_id}
    except Exception as e:
        await log_failure("openai", "/characters/generate-image", e)
        raise HTTPException(502, "Image generation failed. Please retry.")

@api_router.put("/characters/{char_id}")
async def update_character(char_id: str, req: CharacterCreate):
    # Only update provided fields; never wipe the reference image or other data on edit.
    updates = {k: v for k, v in req.model_dump(exclude={"generate_image"}).items() if v is not None}
    if req.name:
        updates["visual_dna"] = await make_visual_dna(req.name, req.description)
    r = await db.characters.update_one({"id": char_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Character not found")
    return await db.characters.find_one({"id": char_id}, {"_id": 0})

@api_router.delete("/characters/{char_id}")
async def delete_character(char_id: str):
    await db.characters.delete_one({"id": char_id})
    return {"ok": True}

# ---------------- ElevenLabs voices ----------------
_voice_cache: Dict[str, Any] = {}

async def fetch_voices() -> List[dict]:
    if _voice_cache.get("voices"):
        return _voice_cache["voices"]
    if not ELEVENLABS_API_KEY:
        return []
    try:
        el = ElevenLabs(api_key=ELEVENLABS_API_KEY)
        res = await asyncio.to_thread(el.voices.get_all)
        voices = [{
            "voice_id": v.voice_id,
            "name": v.name,
            "preview_url": getattr(v, "preview_url", None),
            "category": getattr(v, "category", None),
            "labels": getattr(v, "labels", {}) or {},
        } for v in res.voices]
        _voice_cache["voices"] = voices
        return voices
    except Exception as e:
        await log_failure("elevenlabs", "/voices", e)
        return []

async def tts_bytes(text: str, voice_id: str) -> bytes:
    def _call():
        from elevenlabs import VoiceSettings
        el = ElevenLabs(api_key=ELEVENLABS_API_KEY)
        gen = el.text_to_speech.convert(
            text=text, voice_id=voice_id, model_id="eleven_multilingual_v2",
            voice_settings=VoiceSettings(stability=0.5, similarity_boost=0.75, style=0.4, use_speaker_boost=True),
        )
        return b"".join(list(gen))
    return await asyncio.to_thread(_call)

@api_router.get("/voices")
async def get_voices():
    return await fetch_voices()

@api_router.post("/tts/generate")
async def generate_tts(req: TTSRequest):
    if not ELEVENLABS_API_KEY:
        raise HTTPException(400, "ElevenLabs API key not configured")
    try:
        audio = await tts_bytes(req.text, req.voice_id)
        asset_id = await save_asset("audio", "audio/mpeg", audio, req.project_id)
        await log_cost(req.project_id, "tts", len(req.text), len(req.text) * COST["tts_per_char"], "tts")
        return {"asset_id": asset_id, "url": f"/api/assets/{asset_id}"}
    except Exception as e:
        await log_failure("elevenlabs", "/tts/generate", e, req.project_id)
        raise HTTPException(502, "Voice generation failed. Please retry.")

# ---------------- Sound effects (ElevenLabs) ----------------
SFX_PROMPTS = {
    "laugh": ("sitcom audience laughing, comedy laugh track", 2.5),
    "drum": ("comedy rimshot drum sting, ba dum tss", 1.5),
    "punchline": ("a short comedy rimshot drum sting ba dum tss, immediately followed by a warm sitcom audience laughter", 3.5),
    "boing": ("cartoon boing spring sound effect", 1.2),
    "pop": ("cartoon pop bubble sound effect", 1.0),
    "whoosh": ("fast cartoon whoosh transition sound", 1.0),
    "applause": ("audience applause and cheering", 2.5),
    "ding": ("bright ding bell notification chime", 1.0),
}

async def get_sfx_bytes(name: str) -> Optional[bytes]:
    if not name or name == "none" or name not in SFX_PROMPTS or not ELEVENLABS_API_KEY:
        return None
    doc = await db.sfx_library.find_one({"name": name}, {"_id": 0})
    if doc:
        return base64.b64decode(doc["data"])
    # "punchline" = reliable rimshot + audible laughter, built by concatenating the two effects
    if name == "punchline":
        try:
            from render import concat_audio_bytes
            drum = await get_sfx_bytes("drum")
            laugh = await get_sfx_bytes("laugh")
            combined = await asyncio.to_thread(concat_audio_bytes, [drum, laugh], 0.15)
            if not combined:
                return laugh or drum
            await db.sfx_library.insert_one({
                "name": "punchline", "data": base64.b64encode(combined).decode(),
                "content_type": "audio/mpeg", "created_at": now_iso()})
            return combined
        except Exception as e:
            await log_failure("elevenlabs", "/sfx-punchline", e)
            return None
    try:
        prompt, dur = SFX_PROMPTS[name]
        el = ElevenLabs(api_key=ELEVENLABS_API_KEY)
        gen = el.text_to_sound_effects.convert(text=prompt, duration_seconds=dur, prompt_influence=0.5)
        audio = b"".join(list(gen))
        await db.sfx_library.insert_one({
            "name": name, "data": base64.b64encode(audio).decode(),
            "content_type": "audio/mpeg", "created_at": now_iso()})
        await log_cost(None, "tts", 1, COST["tts_per_char"] * 40, f"sfx:{name}")
        return audio
    except Exception as e:
        await log_failure("elevenlabs", "/sfx", e)
        return None

# ---------------- Music library (ElevenLabs compose) ----------------
MUSIC_PRESETS = {
    "comedy": ("upbeat quirky comedy cartoon background music, playful, light, fun, bouncy", "Comedia divertida"),
    "quirky": ("whimsical playful xylophone and pizzicato strings, comedic, cheeky", "Juguetona"),
    "happy": ("happy ukulele with claps, feel-good, sunny, positive", "Feliz / alegre"),
    "lofi": ("chill lofi hip hop beat, relaxed, soft, mellow", "Lofi relajado"),
    "suspense": ("light comedic suspense, sneaky tiptoe pizzicato, tension", "Suspenso ligero"),
    "epic": ("triumphant uplifting cinematic orchestral, motivational", "Épica / motivacional"),
}

class MusicPresetReq(BaseModel):
    preset_id: str

@api_router.get("/music/library")
async def music_library():
    return [{"id": k, "name": v[1]} for k, v in MUSIC_PRESETS.items()]

async def get_music_preset_asset(preset_id: str) -> Optional[str]:
    doc = await db.music_library.find_one({"preset_id": preset_id}, {"_id": 0})
    if doc:
        return doc["asset_id"]
    if preset_id not in MUSIC_PRESETS or not ELEVENLABS_API_KEY:
        return None
    prompt = MUSIC_PRESETS[preset_id][0]
    def _call():
        el = ElevenLabs(api_key=ELEVENLABS_API_KEY)
        return b"".join(list(el.music.compose(prompt=prompt, music_length_ms=22000, force_instrumental=True)))
    audio = await asyncio.to_thread(_call)
    asset_id = await save_asset("music", "audio/mpeg", audio)
    await db.music_library.insert_one({"preset_id": preset_id, "asset_id": asset_id, "created_at": now_iso()})
    await log_cost(None, "tts", 1, 0.02, f"music:{preset_id}")
    return asset_id

@api_router.post("/projects/{project_id}/music/preset")
async def set_music_preset(project_id: str, req: MusicPresetReq):
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")
    try:
        asset_id = await get_music_preset_asset(req.preset_id)
    except Exception as e:
        await log_failure("elevenlabs", "/music/preset", e, project_id)
        raise HTTPException(502, "Music generation failed. Please retry.")
    if not asset_id:
        raise HTTPException(400, "Invalid preset or music not available")
    await db.projects.update_one({"id": project_id}, {"$set": {
        "music_asset_id": asset_id, "music_preset": req.preset_id, "updated_at": now_iso()}})
    return {"music_asset_id": asset_id, "url": f"/api/assets/{asset_id}", "preset_id": req.preset_id}

# ---------------- Scene image generation ----------------
def build_scene_prompt(scene: dict, char_map: Dict[str, str], style: str = "comic") -> str:
    prefix = STYLE_PREFIXES.get(style, STYLE_PREFIXES["comic"])
    cname = (scene.get("character_name") or "").strip()
    char_desc = ""
    dna = char_map.get(cname.lower()) if cname else None
    if dna:
        char_desc = f" The character {cname} MUST look EXACTLY the same in every scene: {dna}."
    return f"{prefix} {scene.get('image_prompt','')}.{char_desc} Vertical 9:16 composition."

def build_edit_prompt(scene: dict, cname: str, style: str = "comic") -> str:
    prefix = STYLE_PREFIXES.get(style, STYLE_PREFIXES["comic"])
    return (
        f"{prefix} Keep the SAME character{(' ' + cname) if cname else ''} from the reference image: "
        "identical face, colors, markings, outfit, proportions and art style. "
        f"New scene: {scene.get('image_prompt','')}. "
        "Only change the pose, expression and background to fit the scene. "
        "NO text, NO letters, NO words. Vertical 9:16 composition."
    )

@api_router.post("/projects/{project_id}/scenes/{index}/generate-image")
async def generate_scene_image(project_id: str, index: int, req: SceneGenRequest):
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")
    try:
        style = project.get("art_style", "comic")
        cname = (req.scene.character_name or "").strip()
        ckey = cname.lower()
        # find an anchor reference image for this character (library ref or previously generated in this project)
        ref_asset_id = None
        char_map = {}
        if cname:
            db_char = await db.characters.find_one({"name": cname}, {"_id": 0})
            if db_char:
                ref_asset_id = db_char.get("reference_image_asset_id")
                char_map[ckey] = db_char.get("visual_dna") or db_char.get("description", "")
            if not ref_asset_id:
                ref_asset_id = (project.get("char_refs") or {}).get(ckey)
        for c in req.characters:
            k = (c.get("name") or "").lower()
            if k and k not in char_map and c.get("description"):
                char_map[k] = c["description"]

        ref_bytes = await _asset_bytes(ref_asset_id) if ref_asset_id else None
        if ref_bytes:
            prompt = build_edit_prompt(req.scene.model_dump(), cname, style)
            img = await edit_image_bytes(ref_bytes, prompt)
        else:
            prompt = build_scene_prompt(req.scene.model_dump(), char_map, style)
            img = await gen_image_bytes(prompt, size="1024x1536", quality="medium")

        asset_id = await save_asset("scene_image", "image/png", img, project_id)
        await _update_scene_field(project_id, index, "image_asset_id", asset_id)
        # lock this character's look for later scenes (anchor) if not already anchored
        if cname and not ref_asset_id:
            char_refs = project.get("char_refs") or {}
            char_refs[ckey] = asset_id
            await db.projects.update_one({"id": project_id}, {"$set": {"char_refs": char_refs}})
        await log_cost(project_id, "image", 1, COST["image"], f"scene:{index}")
        return {"asset_id": asset_id, "url": f"/api/assets/{asset_id}"}
    except Exception as e:
        await log_failure("openai", "/scenes/generate-image", e, project_id)
        raise HTTPException(502, "Image generation failed. Please retry.")

@api_router.post("/projects/{project_id}/scenes/{index}/generate-audio")
async def generate_scene_audio(project_id: str, index: int, req: SceneGenRequest):
    if not ELEVENLABS_API_KEY:
        raise HTTPException(400, "ElevenLabs API key not configured")
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")
    scene = req.scene
    voice_id = scene.voice_id
    if not voice_id:
        for c in req.characters:
            if c.get("name") == scene.character_name:
                voice_id = c.get("voice_id")
                break
    if not voice_id:
        raise HTTPException(400, "No voice assigned to this scene/character")
    try:
        audio = await tts_bytes(scene.dialogue, voice_id)
        asset_id = await save_asset("audio", "audio/mpeg", audio, project_id)
        await _update_scene_field(project_id, index, "audio_asset_id", asset_id)
        await _update_scene_field(project_id, index, "voice_id", voice_id)
        await log_cost(project_id, "tts", len(scene.dialogue), len(scene.dialogue) * COST["tts_per_char"], f"scene:{index}")
        return {"asset_id": asset_id, "url": f"/api/assets/{asset_id}"}
    except HTTPException:
        raise
    except Exception as e:
        await log_failure("elevenlabs", "/scenes/generate-audio", e, project_id)
        raise HTTPException(502, "Voice generation failed. Please retry.")

async def _update_scene_field(project_id: str, index: int, field: str, value):
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        return
    scenes = project.get("scenes", [])
    for s in scenes:
        if s.get("index") == index:
            s[field] = value
    await db.projects.update_one({"id": project_id}, {"$set": {"scenes": scenes, "updated_at": now_iso()}})

# ---------------- Projects ----------------
@api_router.get("/projects")
async def list_projects():
    docs = await db.projects.find({}, {"_id": 0}).sort("updated_at", -1).to_list(200)
    return docs

@api_router.post("/projects")
async def create_project(req: ProjectCreate):
    doc = {
        "id": str(uuid.uuid4()),
        "title": req.title,
        "language": req.language,
        "topic": req.topic,
        "duration": req.duration,
        "art_style": req.art_style,
        "default_voice_id": req.default_voice_id,
        "music_asset_id": None,
        "music_volume": req.music_volume,
        "laugh_intensity": req.laugh_intensity,
        "animate": req.animate,
        "char_refs": {},
        "joke": req.joke,
        "scenes": [s.model_dump() for s in req.scenes],
        "status": "draft",
        "render_id": None,
        "video_url": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.projects.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/projects/{project_id}")
async def get_project(project_id: str):
    doc = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Project not found")
    return doc

@api_router.put("/projects/{project_id}")
async def update_project(project_id: str, req: ProjectUpdate):
    updates = {k: v for k, v in req.model_dump(exclude_none=True).items()}
    if "scenes" in updates and updates["scenes"] is not None:
        updates["scenes"] = [s if isinstance(s, dict) else s for s in updates["scenes"]]
    updates["updated_at"] = now_iso()
    r = await db.projects.update_one({"id": project_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Project not found")
    return await db.projects.find_one({"id": project_id}, {"_id": 0})

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    await db.projects.delete_one({"id": project_id})
    return {"ok": True}

@api_router.post("/projects/{project_id}/music")
async def upload_music(project_id: str, file: UploadFile = File(...)):
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    asset_id = await save_asset("music", file.content_type or "audio/mpeg", data, project_id)
    await db.projects.update_one({"id": project_id}, {"$set": {"music_asset_id": asset_id, "music_preset": None, "updated_at": now_iso()}})
    return {"music_asset_id": asset_id, "url": f"/api/assets/{asset_id}"}

@api_router.delete("/projects/{project_id}/music")
async def remove_music(project_id: str):
    await db.projects.update_one({"id": project_id}, {"$set": {"music_asset_id": None, "music_preset": None, "updated_at": now_iso()}})
    return {"ok": True}

# ---------------- Local FFmpeg render (free, self-hosted) ----------------
async def _asset_bytes(asset_id: Optional[str]) -> Optional[bytes]:
    if not asset_id:
        return None
    doc = await db.assets.find_one({"id": asset_id}, {"_id": 0})
    if not doc:
        return None
    if doc.get("data"):
        return base64.b64decode(doc["data"])
    fpath = Path(MEDIA_DIR) / doc["path"]
    return await asyncio.to_thread(fpath.read_bytes) if fpath.exists() else None

async def _ensure_scene_audio(project: dict) -> dict:
    """Guarantee every dialogue scene has a synchronized voice before rendering."""
    if not ELEVENLABS_API_KEY:
        return project
    voices = await fetch_voices()
    fallback = project.get("default_voice_id") or (voices[0]["voice_id"] if voices else None)
    db_chars = await db.characters.find({}, {"_id": 0}).to_list(200)
    char_voice = {c["name"].lower(): c.get("voice_id") for c in db_chars if c.get("name")}
    scenes = project.get("scenes", [])
    changed = False
    for s in scenes:
        if s.get("dialogue") and not s.get("audio_asset_id"):
            vid = s.get("voice_id") or char_voice.get((s.get("character_name") or "").lower()) or fallback
            if not vid:
                continue
            try:
                audio = await tts_bytes(s["dialogue"], vid)
                aid = await save_asset("audio", "audio/mpeg", audio, project["id"])
                s["audio_asset_id"] = aid
                s["voice_id"] = vid
                changed = True
                await log_cost(project["id"], "tts", len(s["dialogue"]),
                               len(s["dialogue"]) * COST["tts_per_char"], f"auto-scene:{s.get('index')}")
            except Exception as e:
                await log_failure("elevenlabs", "/produce-audio", e, project["id"])
    if changed:
        await db.projects.update_one({"id": project["id"]}, {"$set": {"scenes": scenes, "updated_at": now_iso()}})
    return project

async def _render_task(project_id: str):
    try:
        project = await db.projects.find_one({"id": project_id}, {"_id": 0})
        project = await _ensure_scene_audio(project)  # auto-generate any missing voices, synced per scene
        intensity = {"soft": 0.55, "medium": 0.9, "loud": 1.35}.get(project.get("laugh_intensity", "medium"), 0.9)
        laugh_sfx = {"laugh", "punchline", "applause"}
        scenes_data = []
        for s in project.get("scenes", []):
            if not s.get("image_asset_id"):
                continue
            img = await _asset_bytes(s["image_asset_id"])
            aud = await _asset_bytes(s.get("audio_asset_id"))
            sfx = await get_sfx_bytes(s.get("sfx"))
            sfx_name = s.get("sfx")
            scenes_data.append({
                "image_bytes": img,
                "audio_bytes": aud,
                "sfx_bytes": sfx,
                "sfx_volume": intensity if sfx_name in laugh_sfx else 0.85,
                "dialogue": s.get("dialogue", ""),
                "camera_motion": s.get("camera_motion", "zoom_in"),
            })
        music = await _asset_bytes(project.get("music_asset_id"))
        mp4 = await asyncio.to_thread(render_video, scenes_data, music, project.get("music_volume", 20))
        asset_id = await save_asset("video", "video/mp4", mp4, project_id)
        await db.projects.update_one({"id": project_id}, {"$set": {
            "status": "completed", "video_url": f"/api/assets/{asset_id}",
            "render_id": asset_id, "updated_at": now_iso()}})
        await log_cost(project_id, "render", 1, 0.0, "ffmpeg-local")
        logger.info(f"Render completed for project {project_id}")
    except Exception as e:
        await log_failure("ffmpeg", "/render", e, project_id)
        await db.projects.update_one({"id": project_id}, {"$set": {
            "status": "failed", "updated_at": now_iso()}})

@api_router.post("/projects/{project_id}/render")
async def render_project(project_id: str):
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")
    scenes_with_img = [s for s in project.get("scenes", []) if s.get("image_asset_id")]
    if not scenes_with_img:
        raise HTTPException(400, "Generate scene images before exporting the video")
    await db.projects.update_one({"id": project_id}, {"$set": {
        "status": "rendering", "video_url": None, "updated_at": now_iso()}})
    asyncio.create_task(_render_task(project_id))
    return {"status": "rendering"}

@api_router.get("/projects/{project_id}/render-status")
async def render_status(project_id: str):
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")
    return {"status": project.get("status", "draft"), "video_url": project.get("video_url")}

@api_router.post("/projects/{project_id}/reset-export")
async def reset_export(project_id: str):
    r = await db.projects.update_one({"id": project_id}, {"$set": {
        "video_url": None, "render_id": None, "status": "approved", "updated_at": now_iso()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Project not found")
    return await db.projects.find_one({"id": project_id}, {"_id": 0})

# ---------------- Cost & failures ----------------
@api_router.get("/costs/summary")
async def cost_summary():
    events = await db.cost_events.find({}, {"_id": 0}).to_list(5000)
    total = sum(e["amount"] for e in events)
    by_kind: Dict[str, Dict[str, float]] = {}
    for e in events:
        k = e["kind"]
        by_kind.setdefault(k, {"amount": 0.0, "units": 0.0, "count": 0})
        by_kind[k]["amount"] += e["amount"]
        by_kind[k]["units"] += e["units"]
        by_kind[k]["count"] += 1
    for k in by_kind:
        by_kind[k]["amount"] = round(by_kind[k]["amount"], 4)
    recent = sorted(events, key=lambda x: x["created_at"], reverse=True)[:20]
    return {"total": round(total, 4), "by_kind": by_kind, "recent": recent}

@api_router.get("/failures")
async def list_failures():
    docs = await db.api_failures.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs

@api_router.post("/failures/{failure_id}/resolve")
async def resolve_failure(failure_id: str):
    await db.api_failures.update_one({"id": failure_id}, {"$set": {"resolved": True}})
    return {"ok": True}

@api_router.get("/config")
async def get_config():
    return {
        "elevenlabs_enabled": bool(ELEVENLABS_API_KEY),
        "render_enabled": True,
        "render_engine": "ffmpeg-local",
        "cost_model": COST,
    }

@api_router.get("/")
async def root():
    return {"message": "Chiste Studio AI API"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
