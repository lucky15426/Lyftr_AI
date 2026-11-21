"""SQLite persistence for conversation history (stdlib sqlite3 only)."""
from __future__ import annotations

import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages (session_id, id);
"""


def parse_sqlite_path(url: str) -> str:
    """'sqlite:////data/app.db' -> '/data/app.db'; 'sqlite:///x.db' -> 'x.db'."""
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        raise ValueError("DATABASE_URL must start with sqlite:/// (SQLite only)")
    path = url[len(prefix):]
    if not path or path == ":memory:":
        raise ValueError("in-memory SQLite is not supported; use a file path")
    return path


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self, url: str):
        self.path = parse_sqlite_path(url)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        return conn

    def init(self) -> None:
        parent = os.path.dirname(os.path.abspath(self.path))
        os.makedirs(parent, exist_ok=True)
        with closing(self._connect()) as conn, conn:
            conn.executescript(SCHEMA)

    def ping(self) -> bool:
        try:
            with closing(self._connect()) as conn:
                conn.execute("SELECT 1 FROM messages LIMIT 1").fetchall()
            return True
        except Exception:
            return False

    def fetch_rows(self, session_id: str) -> List[Dict[str, Any]]:
        """All rows for one session, oldest first (includes system rows)."""
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT role, content, metadata FROM messages WHERE session_id = ? ORDER BY id ASC",
                (session_id,),
            ).fetchall()
        return [
            {
                "role": r["role"],
                "content": r["content"],
                "metadata": json.loads(r["metadata"]) if r["metadata"] else None,
            }
            for r in rows
        ]

    def save_exchange(
        self,
        session_id: str,
        user_message: str,
        assistant_reply: str,
        assistant_metadata: Dict[str, Any],
        system_prompt: Optional[str] = None,
    ) -> None:
        """Persist a successful turn atomically (all rows or none)."""
        ts = _now()
        rows = []
        if system_prompt:
            rows.append((session_id, "system", system_prompt, None, ts))
        rows.append((session_id, "user", user_message, None, ts))
        rows.append((session_id, "assistant", assistant_reply, json.dumps(assistant_metadata), ts))
        with closing(self._connect()) as conn, conn:
            conn.executemany(
                "INSERT INTO messages (session_id, role, content, metadata, created_at) VALUES (?,?,?,?,?)",
                rows,
            )
