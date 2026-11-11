"""Configuration settings for MOODIFY."""

import os
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


class Config:
    """Flask application configuration."""

    SECRET_KEY = _require(
        "SECRET_KEY",
        "Use a long, random secret key."
    )

    SQLALCHEMY_DATABASE_URI = _build_database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Database connection settings
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_recycle": 300,
        "pool_pre_ping": True,
    }

    # Session security
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = (
        os.getenv("COOKIE_SECURE", "false").lower() == "true"
    )