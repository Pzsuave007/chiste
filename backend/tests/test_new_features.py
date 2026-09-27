"""New features tests: punchline sfx on last scene, default_voice_id persistence,
auto-voice generation on render (scenes with dialogue but no audio_asset_id)."""
import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
S = requests.Session()
S.headers.update({"Content-Type": "application/json"})


# ---- Punchline SFX on last scene ----
def test_script_last_scene_has_punchline_sfx():
    r = S.post(
        f"{API}/scripts/generate",
        json={"joke": "Un gato entra en una biblioteca y pide un libro sobre ratones.",
              "language": "es", "duration": 15},
        timeout=90,
    )
    assert r.status_code == 200, r.text
    scenes = r.json()["scenes"]
    assert len(scenes) > 0
    assert scenes[-1]["sfx"] == "punchline", f"Expected last sfx=punchline, got {scenes[-1]['sfx']}"


# ---- Voices + config ----
@pytest.fixture(scope="module")
def voices():
    r = S.get(f"{API}/voices", timeout=30)
    assert r.status_code == 200
    v = r.json()
    assert isinstance(v, list) and len(v) > 0
    return v


def test_config_flags():
    r = S.get(f"{API}/config").json()
    assert r["elevenlabs_enabled"] is True
    assert r["render_enabled"] is True


# ---- default_voice_id persistence ----
def test_default_voice_id_persists_via_post_and_put(voices):
    vid = voices[0]["voice_id"]
    # POST with default_voice_id
    pr = S.post(f"{API}/projects", json={
        "title": "TEST_defvoice", "language": "es", "duration": 10, "topic": "x",
        "default_voice_id": vid,
    }).json()
    pid = pr["id"]
    try:
        assert pr.get("default_voice_id") == vid
        got = S.get(f"{API}/projects/{pid}").json()
        assert got.get("default_voice_id") == vid
        # PUT change to another voice
        vid2 = voices[1]["voice_id"] if len(voices) > 1 else vid
        pu = S.put(f"{API}/projects/{pid}", json={"default_voice_id": vid2})
        assert pu.status_code == 200
        got2 = S.get(f"{API}/projects/{pid}").json()
        assert got2.get("default_voice_id") == vid2
    finally:
        S.delete(f"{API}/projects/{pid}")


# ---- Auto-voice on render: scene has image + dialogue but no audio_asset_id / no voice_id ----
def test_auto_voice_on_render(voices):
    vid = voices[0]["voice_id"]
    # create project with default_voice_id
    pr = S.post(f"{API}/projects", json={
        "title": "TEST_autovoice", "language": "es", "duration": 8, "topic": "gatos",
        "default_voice_id": vid,
    }).json()
    pid = pr["id"]
    try:
        # generate one scene image
        scene = {
            "index": 0,
            "character_name": "Gato",
            "dialogue": "Miau, hola mundo",
            "camera_motion": "zoom_in",
            "sfx": "punchline",
            "image_prompt": "A funny orange cartoon cat in a library holding a book",
            # NO voice_id, NO audio_asset_id
        }
        S.put(f"{API}/projects/{pid}", json={"scenes": [scene], "joke_text": "gato biblioteca"})
        img = S.post(f"{API}/projects/{pid}/scenes/0/generate-image",
                     json={"scene": scene, "characters": [], "language": "es"}, timeout=180)
        assert img.status_code == 200, img.text
        # Verify scene has NO audio yet
        proj = S.get(f"{API}/projects/{pid}").json()
        s0 = proj["scenes"][0]
        assert s0.get("image_asset_id")
        assert not s0.get("audio_asset_id")
        assert not s0.get("voice_id")

        # Trigger render
        rr = S.post(f"{API}/projects/{pid}/render")
        assert rr.status_code == 200
        # Poll
        deadline = time.time() + 240
        final = None
        while time.time() < deadline:
            st = S.get(f"{API}/projects/{pid}/render-status").json()
            if st["status"] in ("completed", "failed"):
                final = st
                break
            time.sleep(4)
        assert final and final["status"] == "completed", f"Render failed: {final}"

        # Check scene now has audio_asset_id (auto voice)
        proj2 = S.get(f"{API}/projects/{pid}").json()
        s0b = proj2["scenes"][0]
        assert s0b.get("audio_asset_id"), "Auto-voice should have populated audio_asset_id"
        assert s0b.get("voice_id"), "Auto-voice should have set voice_id (fallback default)"

        # Verify MP4 has audio stream (using ffprobe via imageio-ffmpeg)
        vr = S.get(f"{BASE_URL}{final['video_url']}", timeout=60)
        assert vr.status_code == 200
        assert vr.headers.get("content-type", "").startswith("video/")
        # Save to tmp and probe
        import tempfile, subprocess, shutil
        tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
        tmp.write(vr.content); tmp.close()
        try:
            # Try ffprobe from imageio-ffmpeg (it provides ffmpeg, not ffprobe; use ffmpeg -i)
            ff = shutil.which("ffprobe") or shutil.which("ffmpeg")
            if ff:
                out = subprocess.run([ff, "-i", tmp.name], capture_output=True, text=True)
                info = (out.stdout + out.stderr).lower()
                assert "audio" in info, f"No audio stream in MP4: {info[:500]}"
        finally:
            os.unlink(tmp.name)
    finally:
        S.delete(f"{API}/projects/{pid}")
