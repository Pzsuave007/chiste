"""Heavy end-to-end flow tests: voices, TTS, image gen, render.
These use real external APIs (ElevenLabs, OpenAI gpt-image-1) - can take up to 2 minutes.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
S = requests.Session()
S.headers.update({"Content-Type": "application/json"})


def test_config_elevenlabs_and_render_enabled():
    r = S.get(f"{API}/config")
    assert r.status_code == 200
    d = r.json()
    assert d["elevenlabs_enabled"] is True, f"elevenlabs_enabled should be True: {d}"
    assert d["render_enabled"] is True
    assert d["render_engine"] == "ffmpeg-local"


def test_custom_joke_passthrough():
    r = S.post(f"{API}/jokes/generate", json={"topic": "x", "language": "es", "duration": 15, "custom_joke": "Mi chiste custom"})
    assert r.status_code == 200
    d = r.json()
    assert d["joke"] == "Mi chiste custom"
    assert d["source"] == "custom"


@pytest.fixture(scope="module")
def voices():
    r = S.get(f"{API}/voices", timeout=30)
    assert r.status_code == 200
    v = r.json()
    assert isinstance(v, list) and len(v) > 0, "Expected non-empty voices list from ElevenLabs"
    assert "voice_id" in v[0] and "name" in v[0]
    return v


def test_voices_nonempty(voices):
    assert len(voices) >= 1


def test_tts_generate_and_fetch_asset(voices):
    voice_id = voices[0]["voice_id"]
    r = S.post(f"{API}/tts/generate", json={"text": "Hola mundo", "voice_id": voice_id}, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "asset_id" in d
    r2 = S.get(f"{BASE_URL}{d['url']}", timeout=30)
    assert r2.status_code == 200
    assert r2.headers.get("content-type", "").startswith("audio/")
    assert len(r2.content) > 500


@pytest.fixture(scope="module")
def project_with_scene(voices):
    # create project
    pr = S.post(f"{API}/projects", json={"title": "TEST_flow", "language": "es", "duration": 15, "topic": "gatos"}).json()
    pid = pr["id"]
    scene = {
        "index": 0,
        "character_name": "Gato",
        "dialogue": "Miau, hola",
        "camera_motion": "zoom_in",
        "sfx": "none",
        "image_prompt": "A funny orange cartoon cat in a library holding a book",
        "voice_id": voices[0]["voice_id"],
    }
    S.put(f"{API}/projects/{pid}", json={"scenes": [scene], "joke": "gato en biblioteca"})
    yield pid, scene, voices[0]["voice_id"]
    S.delete(f"{API}/projects/{pid}")


def test_generate_scene_image_persisted(project_with_scene):
    pid, scene, _ = project_with_scene
    r = S.post(f"{API}/projects/{pid}/scenes/0/generate-image",
               json={"scene": scene, "characters": [], "language": "es"}, timeout=180)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "asset_id" in d
    # verify persisted
    proj = S.get(f"{API}/projects/{pid}").json()
    assert proj["scenes"][0]["image_asset_id"] == d["asset_id"]
    # fetch asset
    ar = S.get(f"{BASE_URL}{d['url']}", timeout=30)
    assert ar.status_code == 200
    assert ar.headers.get("content-type", "").startswith("image/")
    assert len(ar.content) > 5000


def test_generate_scene_audio_persisted(project_with_scene):
    pid, scene, voice_id = project_with_scene
    scene["voice_id"] = voice_id
    r = S.post(f"{API}/projects/{pid}/scenes/0/generate-audio",
               json={"scene": scene, "characters": [], "language": "es"}, timeout=90)
    assert r.status_code == 200, r.text
    proj = S.get(f"{API}/projects/{pid}").json()
    assert proj["scenes"][0]["audio_asset_id"] is not None


def test_render_project_completes(project_with_scene):
    pid, _, _ = project_with_scene
    r = S.post(f"{API}/projects/{pid}/render")
    assert r.status_code == 200
    assert r.json()["status"] == "rendering"
    # poll
    deadline = time.time() + 180
    final = None
    while time.time() < deadline:
        st = S.get(f"{API}/projects/{pid}/render-status").json()
        if st["status"] in ("completed", "failed"):
            final = st
            break
        time.sleep(4)
    assert final and final["status"] == "completed", f"Render did not complete: {final}"
    assert final["video_url"]
    vr = S.get(f"{BASE_URL}{final['video_url']}", timeout=60)
    assert vr.status_code == 200
    assert vr.headers.get("content-type", "").startswith("video/")
    assert len(vr.content) > 20000


def test_character_generate_image():
    # create char without image, then regenerate image
    c = S.post(f"{API}/characters", json={"name": "TEST_charImg", "description": "un perro con gafas", "color": "#00ff00"}).json()
    cid = c["id"]
    try:
        r = S.post(f"{API}/characters/{cid}/generate-image", timeout=180)
        assert r.status_code == 200, r.text
        assert "reference_image_asset_id" in r.json()
    finally:
        S.delete(f"{API}/characters/{cid}")


def test_costs_after_flow():
    r = S.get(f"{API}/costs/summary")
    d = r.json()
    assert d["total"] >= 0
    assert "by_kind" in d
