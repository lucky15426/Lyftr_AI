"""FastAPI application: /health, /chat, /sessions/{id}/messages."""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import Settings
from .db import Database
from .gateway import AllProvidersUnavailable, LLMGateway, UpstreamError, parse_simulation
from .schemas import ChatRequest, ChatResponse, HistoryResponse

log = logging.getLogger("app")


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    settings = settings or Settings.from_env()
    db = Database(settings.database_url)
    db.init()
    gateway = LLMGateway(settings)
    if gateway.keys_configured < 2:
        log.warning("only %d API key(s) configured; failover needs at least 2", gateway.keys_configured)

    app = FastAPI(title="Lyftr AI Chatbot API", version="1.0.0")
    app.state.db, app.state.gateway, app.state.settings = db, gateway, settings

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    # ---- JSON-only error handling (never HTML, never stack traces) ----
    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        detail = [
            {"loc": list(e.get("loc", [])), "msg": str(e.get("msg", "")), "type": e.get("type", "")}
            for e in exc.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": detail})

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        log.exception("unhandled error")
        return JSONResponse(status_code=500, content={"detail": "internal server error"})

    # ---- routes (sync handlers run in a threadpool; LiteLLM/sqlite calls are blocking) ----
    @app.get("/health")
    def health():
        db_ok = db.ping()
        keys = gateway.keys_configured
        body = {
            "status": "ok" if (db_ok and keys > 0) else "error",
            "keys_configured": keys,
            "cache_enabled": gateway.cache_enabled,
        }
        return JSONResponse(status_code=200 if body["status"] == "ok" else 503, content=body)

    @app.post("/chat", response_model=ChatResponse)
    def chat(req: ChatRequest, x_simulate_failure: Optional[str] = Header(default=None)):
        rows = db.fetch_rows(req.session_id)
        stored_system = next((r["content"] for r in reversed(rows) if r["role"] == "system"), None)
        system_prompt = req.system_prompt or stored_system

        messages = [{"role": "system", "content": system_prompt}] if system_prompt else []
        messages += [{"role": r["role"], "content": r["content"]} for r in rows if r["role"] in ("user", "assistant")]
        messages.append({"role": "user", "content": req.message})

        try:
            result = gateway.complete(messages, parse_simulation(x_simulate_failure))
        except AllProvidersUnavailable:
            raise HTTPException(status_code=503, detail="all providers unavailable")
        except UpstreamError:
            raise HTTPException(status_code=502, detail="upstream provider error")

        meta = result.metadata()
        # Only successful turns reach the database.
        db.save_exchange(
            req.session_id,
            req.message,
            result.reply,
            meta,
            system_prompt=req.system_prompt if req.system_prompt != stored_system else None,
        )
        return ChatResponse(session_id=req.session_id, reply=result.reply, metadata=meta)

    @app.get("/sessions/{session_id}/messages", response_model=HistoryResponse, response_model_exclude_none=True)
    def history(session_id: str):
        rows = [r for r in db.fetch_rows(session_id) if r["role"] != "system"]
        if not rows:
            raise HTTPException(status_code=404, detail="session not found")
        return {"session_id": session_id, "messages": rows}

    return app
