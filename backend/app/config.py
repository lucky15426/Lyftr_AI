"""Environment-driven configuration. No secrets are hardcoded anywhere."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import List

from dotenv import load_dotenv


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _split(value: str | None) -> List[str]:
    return [p.strip() for p in (value or "").split(",") if p.strip()]


@dataclass(frozen=True)
class Settings:
    llm_api_keys: List[str] = field(default_factory=list)
    llm_model: str = "gemini/gemini-3.1-flash-lite"
    database_url: str = "sqlite:///./app.db"
    allowed_origins: List[str] = field(default_factory=lambda: ["http://localhost:3000"])
    enable_failure_simulation: bool = False
    cache_ttl_seconds: int = 86400
    llm_timeout_seconds: float = 30.0

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv()  # no-op when variables are already set (Docker/Render)
        return cls(
            llm_api_keys=_split(os.getenv("LLM_API_KEYS")),
            llm_model=os.getenv("LLM_MODEL", cls.llm_model).strip(),
            database_url=os.getenv("DATABASE_URL", cls.database_url).strip(),
            allowed_origins=_split(os.getenv("ALLOWED_ORIGINS")) or ["http://localhost:3000"],
            enable_failure_simulation=_bool(os.getenv("ENABLE_FAILURE_SIMULATION")),
            cache_ttl_seconds=int(os.getenv("CACHE_TTL_SECONDS", "86400")),
            llm_timeout_seconds=float(os.getenv("LLM_TIMEOUT_SECONDS", "30")),
        )
