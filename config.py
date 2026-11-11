"""Configuration settings.

Secrets (database password, secret key) are NEVER written in this file.
They are read from environment variables, which for local development
come from a file called `.env` in the project root (see `.env.example`).
"""

import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

# Load variables from C:\MOODIFY\.env if the file exists.
load_dotenv(BASE_DIR / ".env")


def _require(name, hint):
    """Return an environment variable or stop with a friendly message."""
    value = os.getenv(name)
    if value is None or value == "":
        raise RuntimeError(
            f"Missing setting: {name}. {hint} "
            "Copy .env.example to .env and fill it in."
        )
    return value


def _build_database_uri():
    """Build the MySQL connection string from separate settings.

    You can either set DATABASE_URL (a full connection string), or set
    DB_USER / DB_PASSWORD / DB_HOST / DB_PORT / DB_NAME. With the second
    way you type your password exactly as it is. Special characters such as
    @ : / # are encoded automatically.
    """
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
    """Flask configuration class."""

    SECRET_KEY = _require(
        "SECRET_KEY",
        "It signs login sessions, so it must be a long random value.",
    )
    SQLALCHEMY_DATABASE_URI = _build_database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Safer session cookies
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
