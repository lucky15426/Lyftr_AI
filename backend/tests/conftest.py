"""Test harness.

A fake LiteLLM *custom provider* stands in for Gemini. Requests still go through
`litellm.completion`, so LiteLLM's real built-in cache and exception types are
exercised -- only the network hop is replaced.
"""
import time
from typing import Dict, List

import litellm
import pytest
from fastapi.testclient import TestClient
from litellm import CustomLLM
from litellm.types.utils import Usage

from app.config import Settings
from app.main import create_app

MODEL = "fakeprov/test-model"
KEY_1, KEY_2 = "test-key-1", "test-key-2"


def words(text: str) -> int:
    return len(text.split())


class FakeProvider(CustomLLM):
    def __init__(self):
        super().__init__()
        self.calls: List[dict] = []  # every real (non-cached) provider call
        self.failures: Dict[str, Exception] = {}  # api_key -> exception to raise
        self.delay = 0.05

    def reset(self):
        self.calls.clear()
        self.failures.clear()

    def completion(self, model, messages, model_response, **kwargs):
        api_key = kwargs.get("api_key")
        self.calls.append({"api_key": api_key, "messages": messages})
        if api_key in self.failures:
            raise self.failures[api_key]
        time.sleep(self.delay)  # make live calls measurably slower than cache hits
        turns = sum(1 for m in messages if m["role"] == "user")
        has_system = any(m["role"] == "system" for m in messages)
        reply = f"turn={turns} system={has_system} echo={messages[-1]['content']}"
        model_response.choices[0].message.content = reply
        model_response.model = model
        prompt = sum(words(m["content"]) for m in messages)
        model_response.usage = Usage(
            prompt_tokens=prompt, completion_tokens=words(reply), total_tokens=prompt + words(reply)
        )
        return model_response


_provider = FakeProvider()
litellm.custom_provider_map = [{"provider": "fakeprov", "custom_handler": _provider}]


@pytest.fixture
def provider():
    _provider.reset()
    yield _provider
    _provider.reset()


def make_settings(tmp_path, **overrides) -> Settings:
    base = dict(
        llm_api_keys=[KEY_1, KEY_2],
        llm_model=MODEL,
        database_url=f"sqlite:///{(tmp_path / 'test.db').as_posix()}",
        allowed_origins=["http://localhost:3000"],
        enable_failure_simulation=True,
    )
    base.update(overrides)
    return Settings(**base)


@pytest.fixture
def client(tmp_path, provider):
    # create_app installs a fresh LiteLLM cache -> every test starts with an empty cache
    with TestClient(create_app(make_settings(tmp_path)), raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def chat(client):
    def _chat(message="Hello", session_id="s-1", headers=None, **extra):
        body = {"session_id": session_id, "message": message, **extra}
        return client.post("/chat", json=body, headers=headers or {})

    return _chat
