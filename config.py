
"""Configuration settings for MOODIFY."""

import os
from datetime import timedelta
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

# Load local environment variables from .env
load_dotenv(BASE_DIR / ".env")


def _require(name, hint):
    """Read a required environment variable."""
    value = os.getenv(name)

    if value is None or value == "":
        raise RuntimeError(
            f"Missing setting: {name}. {hint} "
            "Copy .env.example to .env and fill it in."
        )

    return value


def _build_database_uri():
    """Build the MySQL database connection URL."""

    full_url = os.getenv("DATABASE_URL")

    # Use the complete URL when provided by the hosting service.
    if full_url:
        return full_url

    user = os.getenv("DB_USER", "root")
    password = os.getenv("DB_PASSWORD")

    if password is None:
        raise RuntimeError(
            "Missing setting: DB_PASSWORD (or DATABASE_URL). "
            "Copy .env.example to .env and fill it in."
        )

    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "3306")
    name = os.getenv("DB_NAME", "moodify_db")

    return (
        f"mysql+pymysql://{quote_plus(user)}:{quote_plus(password)}"
        f"@{host}:{port}/{name}?charset=utf8mb4"
    )


def _build_engine_options():
    """Configure database connection pooling and optional SSL."""

    options = {
        "pool_recycle": 300,
        "pool_pre_ping": True,
    }

    # Optional SSL certificate for MySQL-compatible hosting.
    ca_path = os.getenv("DB_SSL_CA")

    if ca_path:
        options["connect_args"] = {
            "ssl_verify_cert": True,
            "ssl_verify_identity": True,
            "ssl_ca": ca_path,
        }

    return options


class Config:
    """Flask application configuration."""

    SECRET_KEY = _require(
        "SECRET_KEY",
        "Use a long, random secret key."
    )

    SQLALCHEMY_DATABASE_URI = _build_database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    SQLALCHEMY_ENGINE_OPTIONS = _build_engine_options()

    # Session security
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    # "Stay signed in": the login cookie lasts 30 days instead of ending with the browser.
    REMEMBER_COOKIE_DURATION = timedelta(days=30)
    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_SAMESITE = "Lax"

    # Enable secure cookies when deployed over HTTPS.
    SESSION_COOKIE_SECURE = (
        os.getenv("COOKIE_SECURE", "false").lower() == "true"
    )
    REMEMBER_COOKIE_SECURE = SESSION_COOKIE_SECURE
