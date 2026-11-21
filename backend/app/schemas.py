from __future__ import annotations

from typing import Annotated, Any, Dict, List, Optional

from pydantic import BaseModel, StringConstraints, field_validator

SessionId = Annotated[str, StringConstraints(min_length=1, max_length=128)]
Message = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class ChatRequest(BaseModel):
    session_id: SessionId
    message: Message
    system_prompt: Optional[str] = None

    @field_validator("system_prompt")
    @classmethod
    def _clean_system_prompt(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if len(v) > 4000:
            raise ValueError("system_prompt must be at most 4000 characters")
        return v or None


class ChatMetadata(BaseModel):
    resolution_source: str
    model: str
    latency_ms: int
    input_tokens: int
    output_tokens: int
    key_id: Optional[str]
    fallback_attempts: int


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    metadata: ChatMetadata


class HistoryMessage(BaseModel):
    role: str
    content: str
    metadata: Optional[Dict[str, Any]] = None


class HistoryResponse(BaseModel):
    session_id: str
    messages: List[HistoryMessage]
