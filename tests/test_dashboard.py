"""Tests for the guest-first app shell, the sign-in pop-up, favourites and the sound manager.

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
JSON_HEADERS = {"X-Moodify": "json"}
NEWBIE = {"username": "newbie", "email": "newbie@example.com", "mobile": "9876543210", "password": "secret123"}


def _app():
    from app import create_app, db
    app = create_app()
    app.config.update(TESTING=True)
    return app, db


@pytest.fixture()
def guest():
    app, db = _app()
    with app.app_context():
        db.drop_all()
        db.create_all()
        yield app.test_client()


@pytest.fixture()
def logged_in():
    from app.models import Playlist, PlaylistCatalogTrack, User

    app, db = _app()
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
        yield client, user.id, pl.id


def app_data(html):
    raw = re.search(r'<script type="application/json" id="appData">(.*?)</script>', html, re.S).group(1)
    return json.loads(raw)


# ---------------------------------------------------------------- guest first

def test_home_is_the_default_entry_point_for_guests(guest):
    for path in ("/", "/home"):
        resp = guest.get(path)
        assert resp.status_code == 200, path
        html = resp.get_data(as_text=True)
        for marker in ("dash-side", "dash-top", "dashWork", "dash-player", "dash-bottomnav", "audioPlayer", "trackGrid"):
            assert marker in html, marker
        assert 'data-auth-open="login"' in html and 'data-auth-open="register"' in html
        assert 'id="authModal"' in html
        assert 'id="soundToggle"' in html
    data = app_data(guest.get("/").get_data(as_text=True))
    assert data["signedIn"] is False


def test_guest_can_browse_public_pages(guest):
    for path in ("/music", "/moods", "/mood/Calm", "/listen/air-on-the-g-string"):
        assert guest.get(path).status_code == 200, path
    assert guest.get("/mood/NotAMood").status_code == 404


def test_unknown_page_renders_inside_the_shell(guest):
    resp = guest.get("/definitely-not-here")
    assert resp.status_code == 404
    assert "dash-side" in resp.get_data(as_text=True)


def test_personal_pages_show_a_gate_not_a_redirect(guest):
    for path in ("/playlist", "/favorites", "/profile", "/moodometer", "/recommendations", "/setup"):
        resp = guest.get(path)
        assert resp.status_code == 401, path
        assert "dash-side" in resp.get_data(as_text=True), path
        assert guest.get(path, headers=JSON_HEADERS).get_json()["ok"] is False


def test_there_is_no_standalone_login_page(guest):
    """/login and /register only send the visitor to the home page with the pop-up open."""
    resp = guest.get("/login")
    assert resp.status_code == 302 and resp.headers["Location"] == "/?auth=login"
    resp = guest.get("/register?next=/playlist")
    assert resp.status_code == 302 and resp.headers["Location"] == "/?auth=register&next=/playlist"
    assert guest.get("/login?next=//evil.example.com").headers["Location"] == "/?auth=login"   # unsafe next is dropped
    assert not (Path(__file__).resolve().parent.parent / "app" / "templates" / "auth.html").exists()


def test_members_are_sent_home_from_the_old_login_urls(logged_in):
    client, *_ = logged_in
    for path in ("/login", "/register"):
        resp = client.get(path)
        assert resp.status_code == 302 and resp.headers["Location"] == "/"


def test_login_popup_markup_for_logged_out_visitors(guest):
    html = guest.get("/").get_data(as_text=True)
    assert 'id="authModal"' in html and "aria-modal" in html
    for needle in ('data-auth-tab="login"', 'data-auth-tab="register"', 'data-pw-toggle', 'af-login-email',
                   'af-reg-username', 'af-reg-mobile', 'data-busy-label', 'data-auth-close', 'auth-x'):
        assert needle in html, needle
    assert 'data-allow-guest' in html                      # the Sound button keeps working while logged out


def test_members_do_not_get_the_popup(logged_in):
    client, *_ = logged_in
    html = client.get("/").get_data(as_text=True)
    assert 'id="authModal"' not in html
    assert "Log out" in html


def test_click_gate_is_wired_in_the_script():
    js = (STATIC / "js/app.js").read_text()
    assert "guestClickGate" in js and "addEventListener('click', guestClickGate, true)" in js
    assert "isAuthenticated" in js and "data-allow-guest" in js
    assert "Escape" in js


def test_popup_is_flat_sharp_and_quick():
    css = (STATIC / "css/pages.css").read_text()
    block = css[css.index(".auth-card {"):css.index("@keyframes auth-in")]
    assert "backdrop-filter" not in block
    assert re.search(r"border-radius:\s*[0-4]px", block)
    assert "ease-out" in block and re.search(r"animation:\s*auth-in\s+0\.1[5-9]s|animation:\s*auth-in\s+0\.2s", block)


def test_health_endpoint_is_cheap(guest):
    from sqlalchemy import event
    from app import db
    statements = []
    event.listen(db.engine, "before_cursor_execute", lambda *a: statements.append(a[2]))
    resp = guest.get("/health")
    assert resp.status_code == 200 and resp.get_json() == {"status": "ok"}
    assert guest.head("/health").status_code == 200
    assert statements == []                                  # no database access


def test_register_and_login_over_json(guest):
    bad = guest.post("/login", data={"email": "nobody@example.com", "password": "x"}, headers=JSON_HEADERS)
    assert bad.status_code == 400 and bad.get_json()["ok"] is False
    made = guest.post("/register", data=NEWBIE,
                      headers=JSON_HEADERS)
    assert made.get_json()["ok"] is True
    guest.get("/logout")
    ok = guest.post("/login", data={"email": "newbie@example.com", "password": "secret123"}, headers=JSON_HEADERS)
    body = ok.get_json()
    assert body["ok"] is True and body["redirect"]
    assert any(c.startswith("remember_token=") for c in ok.headers.getlist("Set-Cookie"))   # stays signed in


def test_json_errors_name_the_field_for_inline_messages(guest):
    guest.post("/register", data=NEWBIE)
    guest.get("/logout")
    dup = guest.post("/register", data=dict(NEWBIE, email="other@example.com", mobile="9123456780"), headers=JSON_HEADERS).get_json()
    assert dup["ok"] is False and dup["field"] == "username"
    dup = guest.post("/register", data=dict(NEWBIE, username="other"), headers=JSON_HEADERS).get_json()
    assert dup["field"] == "email"
    short = guest.post("/register", data=dict(NEWBIE, username="x1", email="x1@example.com", mobile="9000000001", password="abc"), headers=JSON_HEADERS).get_json()
    assert short["field"] == "password"
    bad = guest.post("/login", data={"email": "newbie@example.com", "password": "nope"}, headers=JSON_HEADERS).get_json()
    assert bad["ok"] is False and bad["field"] is None


def test_next_parameter_cannot_leave_the_site(guest):
    guest.post("/register", data=NEWBIE)
    guest.get("/logout")
    resp = guest.post("/login?next=https://evil.example.com/", data={"email": "newbie@example.com", "password": "secret123"},
                      headers=JSON_HEADERS)
    assert "evil.example.com" not in resp.get_json()["redirect"]


def test_logout_returns_to_the_guest_home(logged_in):
    client, *_ = logged_in
    resp = client.get("/logout")
    assert resp.status_code == 302 and resp.headers["Location"].endswith("/")
    assert app_data(client.get("/").get_data(as_text=True))["signedIn"] is False


# ---------------------------------------------------------------- signed in

def test_data_block_lists_tracks_playlists_and_favourites(logged_in):
    client, _, pl_id = logged_in
    data = app_data(client.get("/").get_data(as_text=True))
    assert data["signedIn"] is True
    assert {"air-on-the-g-string", "moonlight-sonata"} <= {t["slug"] for t in data["tracks"]}
    assert data["playlists"][0]["name"] == "Evening Calm"
    assert data["playlists"][0]["slugs"] == ["air-on-the-g-string"]
    assert data["current"] == "Calm"
    assert "Happy" in data["saveable"]
    assert data["favorites"] == []


def test_every_page_renders_for_a_member(logged_in):
    client, _, pl_id = logged_in
    for path in ("/", "/home", "/music", "/moods", "/mood/Happy", "/playlist", f"/playlist/{pl_id}", "/favorites",
                 "/profile", "/moodometer", "/recommendations", "/setup", "/listen/air-on-the-g-string"):
        resp = client.get(path)
        assert resp.status_code == 200, path
        assert "dash-side" in resp.get_data(as_text=True), path


def test_playlist_detail_shows_a_tracklist(logged_in):
    client, _, pl_id = logged_in
    html = client.get(f"/playlist/{pl_id}").get_data(as_text=True)
    assert "tl-row" in html and "data-play-playlist" in html
    assert "air-on-the-g-string" in html


def test_favourites_toggle(logged_in):
    client, *_ = logged_in
    first = client.post("/favorites/toggle", data={"slug": "air-on-the-g-string"}, headers=JSON_HEADERS).get_json()
    assert first["ok"] and first["favorite"] is True and "air-on-the-g-string" in first["favorites"]
    assert "air-on-the-g-string" in client.get("/favorites").get_data(as_text=True)
    second = client.post("/favorites/toggle", data={"slug": "air-on-the-g-string"}, headers=JSON_HEADERS).get_json()
    assert second["favorite"] is False and second["favorites"] == []


def test_favourites_toggle_rejects_unknown_tracks_and_guests(logged_in, guest):
    client, *_ = logged_in
    assert client.post("/favorites/toggle", data={"slug": "no-such-track"}, headers=JSON_HEADERS).status_code in (400, 404)


def test_guest_cannot_toggle_a_favourite(guest):
    resp = guest.post("/favorites/toggle", data={"slug": "air-on-the-g-string"}, headers=JSON_HEADERS)
    assert resp.status_code == 401


def test_mood_checkin_still_works(logged_in):
    client, *_ = logged_in
    resp = client.post("/mood-checkin", data={"mood": "Happy"})
    assert resp.status_code == 302
    assert "Happy" in client.get("/").get_data(as_text=True)
    as_json = client.post("/mood-checkin", data={"mood": "Calm"}, headers=JSON_HEADERS).get_json()
    assert as_json["ok"] is True and as_json["mood"] == "Calm"
    bad = client.post("/mood-checkin", data={"mood": "Nope"}, headers=JSON_HEADERS)
    assert bad.status_code in (400, 302)


def test_add_to_playlist_returns_json_for_the_shell(logged_in):
    client, _, pl_id = logged_in
    resp = client.post(f"/playlist/{pl_id}/add", data={"slug": "moonlight-sonata"}, headers=JSON_HEADERS)
    assert resp.get_json()["ok"] is True
    assert "moonlight-sonata" in app_data(client.get("/").get_data(as_text=True))["playlists"][0]["slugs"]


# ---------------------------------------------------------------- transitions and sound

def test_no_blocking_intro_or_curtain_left(guest):
    base = guest.get("/").get_data(as_text=True)
    assert "fx-veil" not in base
    flair_js = (STATIC / "js/fx/flair.js").read_text()
    flair_css = (STATIC / "css/fx-flair.css").read_text()
    for word in ("fx-curtain", "fx-intro", "closeCurtain", "buildIntro"):
        assert word not in flair_js and word not in flair_css
    core = (STATIC / "js/fx/core.js").read_text()
    assert "setTimeout(FX.openGate" not in core      # no failsafe delay: the gate is always open


def test_page_swap_is_quick():
    """Workspace swaps fade out and in within the 150-220 ms window the brief asks for."""
    css = (STATIC / "css/dashboard.css").read_text()
    js = (STATIC / "js/app.js").read_text()
    assert ".is-out" in css and ".is-in" in css
    assert re.search(r"is-out[^}]*?(0?\.1\d?s|1\d\dms)", css)
    assert "X-Moodify-Nav" in js


def test_sound_manager_is_one_global_web_audio_module(guest):
    text = (STATIC / "js/sound.js").read_text()
    assert "AudioContext" in text and "moodify.sound" in text
    assert not re.search(r"\.(mp3|wav|ogg)\b", text)          # fully synthesised, no audio files
    assert not re.search(r"https?://(?!www\.w3\.org)", text)  # no external dependency
    assert text.count("new (global.AudioContext") + text.count("new AudioContext") <= 1
    for page in ("/", "/music", "/moods"):
        html = guest.get(page).get_data(as_text=True)
        assert "js/sound.js" in html, page
