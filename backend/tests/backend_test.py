"""Backend integration tests for Chiste Studio AI"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://reel-studio-303.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

session = requests.Session()
session.headers.update({"Content-Type": "application/json"})


# ---------------- Config / health ----------------
def test_root():
    r = session.get(f"{API}/")
    assert r.status_code == 200


def test_config():
    r = session.get(f"{API}/config")
    assert r.status_code == 200
    d = r.json()
    assert "render_enabled" in d
    assert d["render_engine"] == "ffmpeg-local"
    assert "cost_model" in d


# ---------------- Voices (graceful degradation expected) ----------------
def test_voices_graceful():
    r = session.get(f"{API}/voices")
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d, list)  # empty list acceptable when key invalid


# ---------------- Projects CRUD ----------------
_created_project_id = None


def test_create_project():
    global _created_project_id
    payload = {"title": "TEST_project", "language": "es", "duration": 15, "topic": "gatos"}
    r = session.post(f"{API}/projects", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["title"] == "TEST_project"
    assert "id" in d
    _created_project_id = d["id"]


def test_get_project():
    r = session.get(f"{API}/projects/{_created_project_id}")
    assert r.status_code == 200
    assert r.json()["id"] == _created_project_id


def test_list_projects():
    r = session.get(f"{API}/projects")
    assert r.status_code == 200
    assert any(p["id"] == _created_project_id for p in r.json())


# ---------------- Joke generation ----------------
def test_joke_generate():
    r = session.post(f"{API}/jokes/generate", json={"topic": "gatos", "language": "es", "duration": 15, "project_id": _created_project_id}, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "joke" in d or "text" in d
    joke_text = d.get("joke") or d.get("text")
    assert joke_text and len(joke_text) > 5


# ---------------- Script generation ----------------
_scenes = None


def test_script_generate():
    global _scenes
    joke_text = "Un gato entra en una biblioteca y pide un libro sobre ratones."
    r = session.post(
        f"{API}/scripts/generate",
        json={"joke": joke_text, "language": "es", "duration": 15, "project_id": _created_project_id},
        timeout=90,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "scenes" in d
    assert isinstance(d["scenes"], list)
    assert len(d["scenes"]) > 0
    _scenes = d["scenes"]


def test_update_project_with_scenes():
    r = session.put(f"{API}/projects/{_created_project_id}", json={"scenes": _scenes, "joke_text": "Un gato entra en una biblioteca"})
    assert r.status_code == 200


# ---------------- Costs & failures ----------------
def test_costs_summary():
    r = session.get(f"{API}/costs/summary")
    assert r.status_code == 200
    d = r.json()
    assert "total" in d or "total_amount" in d or "by_kind" in d or "by_service" in d


def test_failures_list():
    r = session.get(f"{API}/failures")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------------- Characters ----------------
_char_id = None


def test_character_create():
    global _char_id
    r = session.post(f"{API}/characters", json={"name": "TEST_char", "description": "gato con sombrero", "color": "#ff0000"})
    assert r.status_code == 200, r.text
    d = r.json()
    _char_id = d["id"]
    assert d["name"] == "TEST_char"


def test_character_list():
    r = session.get(f"{API}/characters")
    assert r.status_code == 200
    assert any(c["id"] == _char_id for c in r.json())


def test_character_delete():
    r = session.delete(f"{API}/characters/{_char_id}")
    assert r.status_code in (200, 204)


# ---------------- Cleanup ----------------
def test_delete_project():
    r = session.delete(f"{API}/projects/{_created_project_id}")
    assert r.status_code in (200, 204)
    r2 = session.get(f"{API}/projects/{_created_project_id}")
    assert r2.status_code == 404
