"""Smoke tests for the front-end motion layer.

They check that the layer's files exist, that every page still renders and links
them, and that the layer has no CDN dependency. Run with:
    SECRET_KEY=test DATABASE_URL=sqlite:// python -m pytest tests
"""
import os
import re
from pathlib import Path

import pytest

os.environ.setdefault("SECRET_KEY", "test-key")
os.environ.setdefault("DATABASE_URL", "sqlite://")

STATIC = Path(__file__).resolve().parent.parent / "app" / "static"
FX_FILES = [
    "css/fx.css", "css/fx-flair.css", "css/dashboard.css", "css/pages.css",
    "js/sound.js", "js/app.js", "js/pages.js",
    "js/fx/core.js", "js/fx/icons.js", "js/fx/ambient.js",
    "js/fx/art.js", "js/fx/flair.js", "js/fx/motion.js", "js/fx/pointer.js",
    "vendor/gsap.min.js", "vendor/ScrollTrigger.min.js", "vendor/lenis.min.js",
    "vendor/fonts/inter-latin-wght-normal.woff2",
]


@pytest.fixture()
def client():
    from app import create_app, db
    app = create_app()
    app.config.update(TESTING=True)
    with app.app_context():
        db.create_all()
        yield app.test_client()


@pytest.mark.parametrize("name", FX_FILES)
def test_asset_exists(name):
    assert (STATIC / name).is_file() and (STATIC / name).stat().st_size > 0


@pytest.mark.parametrize("name", FX_FILES)
def test_asset_is_served(client, name):
    assert client.get("/static/" + name).status_code == 200


@pytest.mark.parametrize("path", ["/login", "/register"])
def test_public_pages_link_the_layer(client, path):
    resp = client.get(path)
    assert resp.status_code == 200
    html = resp.get_data(as_text=True)
    assert "css/fx.css" in html and "css/fx-flair.css" in html
    for name in ("core", "icons", "ambient", "flair", "motion", "pointer"):
        assert f"js/fx/{name}.js" in html
    # core.js must load before the modules that register with it
    assert html.index("js/fx/core.js") < html.index("js/fx/pointer.js")
    # flair must run before motion so headings are split before reveals are set up
    assert html.index("js/fx/flair.js") < html.index("js/fx/motion.js")


def test_layer_has_no_external_dependencies():
    for name in FX_FILES:
        if name.endswith(".woff2") or ".min." in name:
            continue
        text = (STATIC / name).read_text(encoding="utf-8")
        assert not re.search(r"https?://(?!www\.w3\.org)", text), name


def test_saved_data_pages_still_need_a_login(client):
    # the home page is open to guests now; pages that hold personal data are not
    for path in ("/playlist", "/favorites", "/profile", "/moodometer"):
        assert client.get(path).status_code == 401, path


def test_art_module_is_loaded_before_flair(client):
    html = client.get("/login").get_data(as_text=True)
    assert html.index("js/fx/art.js") < html.index("js/fx/flair.js")


def test_no_live_blur_in_motion_css():
    from pathlib import Path
    css = (Path(__file__).resolve().parent.parent / "app/static/css/fx.css").read_text()
    assert "backdrop-filter:" not in css
