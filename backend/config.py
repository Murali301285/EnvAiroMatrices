"""
Central config loader.

Reads .env once on import and exposes typed constants used across the backend.
Keep secrets out of source control — .env is gitignored; .env.example is a template.
"""
from __future__ import annotations

import os
from dotenv import load_dotenv

# Load .env from the backend directory (next to this file)
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_BACKEND_DIR, ".env"))


def _env(key: str, default: str | None = None, required: bool = False) -> str:
    val = os.getenv(key, default)
    if required and (val is None or val == ""):
        raise RuntimeError(f"Required environment variable '{key}' is not set")
    return val or ""


def _env_int(key: str, default: int) -> int:
    try:
        return int(os.getenv(key, str(default)))
    except (TypeError, ValueError):
        return default


def _env_list(key: str, default: str = "") -> list[str]:
    raw = os.getenv(key, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# --- Database ---
DATABASE_URL: str = _env("DATABASE_URL", required=True)

# --- Auth / Secrets ---
JWT_SECRET_KEY: str = _env("JWT_SECRET_KEY", "change_me")
JWT_ALGORITHM: str = _env("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_HOURS: int = _env_int("JWT_EXPIRE_HOURS", 8)
IOT_SHARED_SECRET: str = _env("IOT_SHARED_SECRET", "change_me")
WOLOO_API_KEY: str = _env("WOLOO_API_KEY", "")

# --- Retention ---
LOG_RETENTION_DAYS: int = _env_int("LOG_RETENTION_DAYS", 2)
DB_RETENTION_DAYS: int = _env_int("DB_RETENTION_DAYS", 2)

# --- CORS ---
CORS_ORIGINS: list[str] = _env_list("CORS_ORIGINS", "http://localhost:5173")

# --- Server ---
HOST: str = _env("HOST", "0.0.0.0")
PORT: int = _env_int("PORT", 8381)

# --- Paths ---
BACKEND_DIR: str = _BACKEND_DIR
