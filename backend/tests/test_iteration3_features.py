"""Iteration 3 tests:
- SFX only at end (non-last='none', last='punchline')
- Character consistency (char_refs anchor + image edit)
- Background music (upload/persist volume/delete) + render with music has audio stream
- Laugh intensity persistence + render still valid MP4
"""
import os
import time
import io
import tempfile
import subprocess
import shutil
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
S = requests.Session()
S.headers.update({"Content-Type": "application/json"})


def _probe_audio(mp4_bytes: bytes) -> bool:
    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    tmp.write(mp4_bytes); tmp.close()
    try:
        ff = shutil.which("ffprobe") or shutil.which("ffmpeg")
        if not ff:
            return True
        out = subprocess.run([ff, "-i", tmp.name], capture_output=True, text=True)
        info = (out.stdout + out.stderr).lower()
        return "audio" in info
    finally:
        os.unlink(tmp.name)


def _poll_render(pid: str, timeout: int = 240):
    deadline = time.time() + timeout
    while time.time() < deadline:
        st = S.get(f"{API}/projects/{pid}/render-status").json()
        if st["status"] in ("completed", "failed"):
            return st
        time.sleep(4)
    return None


# ---------- 1. SFX ONLY AT THE END ----------
def test_sfx_only_at_end():
    r = S.post(f"{API}/scripts/generate", json={
        "joke": "Un gato entra en una biblioteca y pide un libro de ratones.",
        "language": "es", "duration": 15,
    }, timeout=90)
    assert r.status_code == 200, r.text
    scenes = r.json()["scenes"]
    assert len(scenes) >= 2
    # every non-last scene must be 'none', last must be 'punchline'
    for i, s in enumerate(scenes[:-1]):
        assert s["sfx"] == "none", f"scene {i} sfx should be 'none', got {s['sfx']}"
    assert scenes[-1]["sfx"] == "punchline"


# ---------- 2. CHARACTER CONSISTENCY via image-edit anchor ----------
@pytest.mark.slow
def test_character_consistency_anchor():
    pr = S.post(f"{API}/projects", json={
        "title": "TEST_charref", "language": "es", "duration": 10, "topic": "gato",
    }).json()
    pid = pr["id"]
    try:
        scenes = [
            {"index": 0, "character_name": "Gato", "dialogue": "Hola",
             "camera_motion": "static", "sfx": "none",
             "image_prompt": "A friendly orange cartoon cat wearing a red bow, standing in a cozy library, cartoon style"},
            {"index": 1, "character_name": "Gato", "dialogue": "Adios",
             "camera_motion": "zoom_in", "sfx": "punchline",
             "image_prompt": "The same orange cartoon cat holding a book about mice, laughing"},
        ]
        pu = S.put(f"{API}/projects/{pid}", json={"scenes": scenes})
        assert pu.status_code == 200

        # First image (text-to-image, sets anchor)
        r0 = S.post(f"{API}/projects/{pid}/scenes/0/generate-image",
                    json={"scene": scenes[0], "characters": [], "language": "es"},
                    timeout=240)
        assert r0.status_code == 200, r0.text
        assert r0.json().get("asset_id")

        # Verify anchor stored
        p1 = S.get(f"{API}/projects/{pid}").json()
        assert p1.get("char_refs", {}).get("gato"), f"char_refs missing gato: {p1.get('char_refs')}"
        assert p1["scenes"][0].get("image_asset_id")

        # Second image (should use edit_image_bytes with anchor)
        r1 = S.post(f"{API}/projects/{pid}/scenes/1/generate-image",
                    json={"scene": scenes[1], "characters": [], "language": "es"},
                    timeout=240)
        assert r1.status_code == 200, r1.text
        assert r1.json().get("asset_id")

        p2 = S.get(f"{API}/projects/{pid}").json()
        assert p2["scenes"][1].get("image_asset_id")
        # anchor should still exist
        assert p2["char_refs"].get("gato")
    finally:
        S.delete(f"{API}/projects/{pid}")


# ---------- 3. BACKGROUND MUSIC + LAUGH INTENSITY + RENDER ----------
@pytest.fixture(scope="module")
def _voices():
    r = S.get(f"{API}/voices", timeout=30).json()
    assert r
    return r


def _make_mp3_bytes() -> bytes:
    # Use TTS to generate a small mp3
    r = S.post(f"{API}/tts/generate", json={"text": "test", "language": "es"}, timeout=60)
    if r.status_code == 200 and r.headers.get("content-type", "").startswith("audio"):
        return r.content
    # Fallback: try voice_id required
    return None


def test_music_upload_persist_volume_delete_then_render(_voices):
    vid = _voices[0]["voice_id"]
    pr = S.post(f"{API}/projects", json={
        "title": "TEST_music", "language": "es", "duration": 8, "topic": "gato",
        "default_voice_id": vid, "music_volume": 20, "laugh_intensity": "loud",
    }).json()
    pid = pr["id"]
    assert pr.get("laugh_intensity") == "loud"
    assert pr.get("music_volume") == 20
    try:
        # generate a small mp3 via TTS
        tts = S.post(f"{API}/tts/generate", json={
            "text": "hola mundo", "language": "es", "voice_id": vid,
        }, timeout=60)
        assert tts.status_code == 200, tts.text
        mp3_bytes = tts.content
        assert len(mp3_bytes) > 100

        # Upload music (multipart)
        files = {"file": ("bg.mp3", mp3_bytes, "audio/mpeg")}
        # requests will set multipart Content-Type; drop the default JSON header
        up = requests.post(f"{API}/projects/{pid}/music", files=files, timeout=60)
        assert up.status_code == 200, up.text
        music_asset_id = up.json().get("music_asset_id")
        assert music_asset_id

        # Verify GET project shows music_asset_id
        got = S.get(f"{API}/projects/{pid}").json()
        assert got.get("music_asset_id") == music_asset_id

        # Persist music_volume via PUT
        pu = S.put(f"{API}/projects/{pid}", json={"music_volume": 35})
        assert pu.status_code == 200
        assert S.get(f"{API}/projects/{pid}").json().get("music_volume") == 35

        # Persist laugh_intensity via PUT
        pu2 = S.put(f"{API}/projects/{pid}", json={"laugh_intensity": "soft"})
        assert pu2.status_code == 200
        assert S.get(f"{API}/projects/{pid}").json().get("laugh_intensity") == "soft"

        # Add a single scene with image + dialogue (no voice_id -> auto voice)
        scene = {
            "index": 0, "character_name": "Gato", "dialogue": "Miau",
            "camera_motion": "static", "sfx": "punchline",
            "image_prompt": "A friendly orange cartoon cat, cartoon style",
        }
        S.put(f"{API}/projects/{pid}", json={"scenes": [scene]})
        img = S.post(f"{API}/projects/{pid}/scenes/0/generate-image",
                     json={"scene": scene, "characters": [], "language": "es"},
                     timeout=240)
        assert img.status_code == 200, img.text

        # Render
        rr = S.post(f"{API}/projects/{pid}/render")
        assert rr.status_code == 200
        final = _poll_render(pid, timeout=240)
        assert final and final["status"] == "completed", f"render failed: {final}"

        # Download MP4 and probe audio
        vr = S.get(f"{BASE_URL}{final['video_url']}", timeout=60)
        assert vr.status_code == 200
        assert vr.headers.get("content-type", "").startswith("video/")
        assert _probe_audio(vr.content), "MP4 should have audio stream (music + voice)"

        # DELETE music, verify cleared
        d = S.delete(f"{API}/projects/{pid}/music")
        assert d.status_code == 200
        assert S.get(f"{API}/projects/{pid}").json().get("music_asset_id") in (None, "")
    finally:
        S.delete(f"{API}/projects/{pid}")
