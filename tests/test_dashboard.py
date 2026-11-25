"""Tests for the home dashboard and the removal of blocking page transitions.

Run with:  SECRET_KEY=test DATABASE_URL=sqlite:// python -m pytest tests
"""
import json
import os
import re
from pathlib import Path

import pytest

os.environ.setdefault("SECRET_KEY", "test-key")
os.environ.setdefault("DATABASE_URL", "sqlite://")

STATIC = Path(__file__).resolve().parent.parent / "app" / "static"


@pytest.fixture()
def logged_in():
    from app import create_app, db
    from app.models import Playlist, PlaylistCatalogTrack, User

    app = create_app()
    app.config.update(TESTING=True)
    with app.app_context():
        db.drop_all()
        db.create_all()
        user = User(username="dash", email="dash@example.com", password="x",
                    preferred_language="Hindi", preferred_mood="Calm", favorite_singer="Arijit Singh")
        db.session.add(user)
        db.session.commit()
        pl = Playlist(name="Evening Calm", user_id=user.id)
        db.session.add(pl)
        db.session.commit()
        db.session.add(PlaylistCatalogTrack(playlist_id=pl.id, catalog_slug="air-on-the-g-string"))
        db.session.commit()
        client = app.test_client()
        with client.session_transaction() as sess:
            sess["_user_id"] = str(user.id)
            sess["_fresh"] = True
        yield client, user.id


def test_home_renders_the_dashboard(logged_in):
    client, _ = logged_in
    resp = client.get("/home")
    assert resp.status_code == 200
    html = resp.get_data(as_text=True)
    for marker in ("dash-side", "dash-top", "dashWork", "dash-player", "dash-bottomnav", "moodGrid", "audioPlayer"):
        assert marker in html
    assert "css/dashboard.css" in html and "js/dashboard.js" in html


def test_home_data_block_lists_tracks_and_playlists(logged_in):
    client, _ = logged_in
    html = client.get("/home").get_data(as_text=True)
    raw = re.search(r'<script type="application/json" id="dashData">(.*?)</script>', html, re.S).group(1)
    data = json.loads(raw)
    slugs = {t["slug"] for t in data["tracks"]}
    assert {"air-on-the-g-string", "moonlight-sonata"} <= slugs
    assert data["playlists"][0]["name"] == "Evening Calm"
    assert data["playlists"][0]["slugs"] == ["air-on-the-g-string"]
    assert data["current"] == "Calm"
    assert "Happy" in data["saveable"]


def test_mood_checkin_still_works(logged_in):
    client, _ = logged_in
    resp = client.post("/mood-checkin", data={"mood": "Happy"})
    assert resp.status_code == 302
    assert "Happy" in client.get("/home").get_data(as_text=True)
    bad = client.post("/mood-checkin", data={"mood": "Nope"})
    assert bad.status_code == 302


def test_other_pages_still_render(logged_in):
    client, _ = logged_in
    for path in ("/music", "/playlist", "/moodometer", "/recommendations", "/profile", "/listen/air-on-the-g-string"):
        assert client.get(path).status_code == 200, path


def test_no_blocking_intro_or_curtain_left(logged_in):
    client, _ = logged_in
    base = client.get("/login").get_data(as_text=True)
    assert "fx-veil" not in base
    flair_js = (STATIC / "js/fx/flair.js").read_text()
    flair_css = (STATIC / "css/fx-flair.css").read_text()
    for word in ("fx-curtain", "fx-intro", "closeCurtain", "buildIntro"):
        assert word not in flair_js and word not in flair_css
    core = (STATIC / "js/fx/core.js").read_text()
    assert "setTimeout(FX.openGate" not in core      # no failsafe delay: the gate is always open


def test_no_interface_sound_effects():
    """UI sound effects were removed on request: no module, no Web Audio code, no toggle."""
    assert not (STATIC / "js/fx/sound.js").exists()
    mine = list((STATIC / "js" / "fx").glob("*.js")) + [STATIC / "js" / "dashboard.js"]
    for path in mine + list((STATIC / "css").glob("*.css")):
        text = path.read_text(errors="ignore")
        assert "AudioContext" not in text, path
        assert "fx-sound" not in text, path


def test_pages_do_not_load_a_sound_module(logged_in):
    client, _ = logged_in
    assert "fx/sound.js" not in client.get("/login").get_data(as_text=True)
    assert "fx/sound.js" not in client.get("/home").get_data(as_text=True)
