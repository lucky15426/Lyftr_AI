import litellm
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import KEY_1, KEY_2, make_settings

META_FIELDS = {
    "resolution_source", "model", "latency_ms", "input_tokens",
    "output_tokens", "key_id", "fallback_attempts",
}


def rate_limited():
    return litellm.RateLimitError(message="429 quota exceeded", llm_provider="fakeprov", model="m")


def server_error():
    return litellm.InternalServerError(message="boom", llm_provider="fakeprov", model="m")


# 1 -----------------------------------------------------------------
def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "keys_configured": 2, "cache_enabled": True}


def test_health_503_without_keys(tmp_path, provider):
    app = create_app(make_settings(tmp_path, llm_api_keys=[]))
    r = TestClient(app).get("/health")
    assert r.status_code == 503 and r.json()["keys_configured"] == 0


# 2 -----------------------------------------------------------------
def test_successful_chat(chat):
    r = chat("What is the capital of France?", session_id="s-123")
    assert r.status_code == 200
    body = r.json()
    assert body["session_id"] == "s-123"
    assert "capital of France" in body["reply"]
    meta = body["metadata"]
    assert set(meta) == META_FIELDS
    assert meta["resolution_source"] == "LIVE_INFERENCE"
    assert meta["key_id"] == "key_1" and meta["fallback_attempts"] == 0
    assert meta["model"] == "fakeprov/test-model"
    assert meta["latency_ms"] >= 40


# 3 / 4 -------------------------------------------------------------
@pytest.mark.parametrize("payload", [
    {"session_id": "s"},
    {"session_id": "s", "message": ""},
    {"session_id": "s", "message": "    "},
    {"message": "hi"},
    {"session_id": "", "message": "hi"},
    {"session_id": "x" * 129, "message": "hi"},
])
def test_validation_errors_422(client, payload):
    r = client.post("/chat", json=payload)
    assert r.status_code == 422
    assert "detail" in r.json()


def test_message_too_long(chat):
    assert chat("a" * 4001).status_code == 422
    assert chat("a" * 4000).status_code == 200
    # the limit applies after trimming whitespace
    assert chat("  " + "a" * 4000 + "  ", session_id="s-2").status_code == 200


def test_malformed_json_is_json_error(client):
    r = client.post("/chat", content="{not json", headers={"content-type": "application/json"})
    assert r.status_code == 422 and "detail" in r.json()


# 5 -----------------------------------------------------------------
def test_multi_turn_context(chat, provider):
    chat("first question", session_id="mt")
    r = chat("second question", session_id="mt")
    assert "turn=2" in r.json()["reply"]
    sent = provider.calls[-1]["messages"]
    assert [m["role"] for m in sent] == ["user", "assistant", "user"]
    assert sent[0]["content"] == "first question"
    assert sent[-1]["content"] == "second question"


def test_system_prompt_sent_and_hidden_from_history(client, chat, provider):
    r = chat("hi", session_id="sp", system_prompt="You are a pirate.")
    assert "system=True" in r.json()["reply"]
    assert provider.calls[-1]["messages"][0] == {"role": "system", "content": "You are a pirate."}
    # system prompt persists for follow-ups in the same session
    r2 = chat("again", session_id="sp")
    assert "system=True" in r2.json()["reply"]
    msgs = client.get("/sessions/sp/messages").json()["messages"]
    assert [m["role"] for m in msgs] == ["user", "assistant", "user", "assistant"]
    assert "pirate" not in str(msgs)


# 6 -----------------------------------------------------------------
def test_session_isolation(client, chat, provider):
    chat("alpha secret", session_id="A")
    chat("beta question", session_id="B")
    assert "alpha" not in str(provider.calls[-1]["messages"])
    a = client.get("/sessions/A/messages").json()["messages"]
    b = client.get("/sessions/B/messages").json()["messages"]
    assert [m["content"] for m in a if m["role"] == "user"] == ["alpha secret"]
    assert [m["content"] for m in b if m["role"] == "user"] == ["beta question"]


# 7 -----------------------------------------------------------------
def test_history_ordering_and_shape(client, chat):
    chat("one", session_id="h")
    chat("two", session_id="h")
    body = client.get("/sessions/h/messages").json()
    assert body["session_id"] == "h"
    msgs = body["messages"]
    assert [m["role"] for m in msgs] == ["user", "assistant", "user", "assistant"]
    assert msgs[0]["content"] == "one" and msgs[2]["content"] == "two"
    assert "metadata" not in msgs[0]
    assert msgs[1]["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    assert {"input_tokens", "output_tokens"} <= set(msgs[1]["metadata"])


# 8 -----------------------------------------------------------------
def test_unknown_session_404(client):
    r = client.get("/sessions/nope/messages")
    assert r.status_code == 404 and r.json() == {"detail": "session not found"}


def test_unknown_route_is_json(client):
    r = client.get("/nope")
    assert r.status_code == 404 and "detail" in r.json()


# 9 / 10 / 11 -------------------------------------------------------
def test_cache_hit_across_sessions(chat, provider):
    first = chat("What is the capital of France?", session_id="c1").json()
    second = chat("What is the capital of France?", session_id="c2").json()
    assert first["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    m = second["metadata"]
    assert m["resolution_source"] == "LLM_CACHE"
    assert second["reply"] == first["reply"]  # identical text
    assert m["key_id"] is None and m["fallback_attempts"] == 0
    assert m["input_tokens"] == first["metadata"]["input_tokens"] > 0  # stored usage
    assert m["output_tokens"] == first["metadata"]["output_tokens"] > 0
    assert m["latency_ms"] < first["metadata"]["latency_ms"]  # faster than live
    assert len(provider.calls) == 1  # provider really was not called again


def test_different_prompts_do_not_share_cache(chat, provider):
    a = chat("prompt A", session_id="d1").json()
    b = chat("prompt B", session_id="d2").json()
    assert b["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    assert a["reply"] != b["reply"]
    assert len(provider.calls) == 2


def test_system_prompt_and_history_are_part_of_cache_key(chat, provider):
    chat("same", session_id="k1")
    # same message, different system prompt -> miss
    r = chat("same", session_id="k2", system_prompt="Be terse.")
    assert r.json()["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    # same message, different history -> miss
    chat("other", session_id="k3")
    r = chat("same", session_id="k3")
    assert r.json()["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    # same system prompt + same message in a new session -> hit
    r = chat("same", session_id="k4", system_prompt="Be terse.")
    assert r.json()["metadata"]["resolution_source"] == "LLM_CACHE"


def test_cache_is_independent_of_api_key(tmp_path, provider):
    """A response produced via key_1 must be served from cache to everyone."""
    app = create_app(make_settings(tmp_path))
    with TestClient(app) as c:
        c.post("/chat", json={"session_id": "x", "message": "shared"})
        provider.failures[KEY_1] = rate_limited()
        provider.failures[KEY_2] = rate_limited()
        r = c.post("/chat", json={"session_id": "y", "message": "shared"})
        assert r.status_code == 200 and r.json()["metadata"]["resolution_source"] == "LLM_CACHE"


# 12 ----------------------------------------------------------------
@pytest.mark.parametrize("exc", [rate_limited, server_error])
def test_failover_to_second_key(chat, provider, exc):
    provider.failures[KEY_1] = exc()
    r = chat("failover please")
    assert r.status_code == 200
    m = r.json()["metadata"]
    assert m["key_id"] == "key_2" and m["fallback_attempts"] == 1
    assert m["resolution_source"] == "LIVE_INFERENCE"
    assert "failover please" in r.json()["reply"]  # a real provider reply, not an error string
    assert [c["api_key"] for c in provider.calls] == [KEY_1, KEY_2]


def test_real_failover_does_not_disable_key(chat, provider):
    provider.failures[KEY_1] = rate_limited()
    chat("one")
    provider.failures.clear()  # key_1 recovers
    assert chat("two", session_id="s-2").json()["metadata"]["key_id"] == "key_1"


# 13 ----------------------------------------------------------------
def test_all_keys_fail_503(client, chat, provider):
    provider.failures[KEY_1] = rate_limited()
    provider.failures[KEY_2] = server_error()
    r = chat("doomed", session_id="dead")
    assert r.status_code == 503
    assert r.json() == {"detail": "all providers unavailable"}
    # 15: failed requests are not persisted
    assert client.get("/sessions/dead/messages").status_code == 404


# 14 ----------------------------------------------------------------
@pytest.mark.parametrize("header,key,attempts", [
    ("key_1=429", "key_2", 1),
    ("key_1=500", "key_2", 1),
    ("key_1 = 429 , key_3=500", "key_2", 1),
])
def test_simulated_failover(chat, provider, header, key, attempts):
    r = chat("simulate me", headers={"X-Simulate-Failure": header})
    assert r.status_code == 200
    m = r.json()["metadata"]
    assert m["key_id"] == key and m["fallback_attempts"] == attempts
    assert [c["api_key"] for c in provider.calls] == [KEY_2]  # key_1 never reached the provider
    assert "simulate me" in r.json()["reply"]


@pytest.mark.parametrize("header", ["key_1=429,key_2=500", "*=429", "*=500"])
def test_simulated_total_failure(client, chat, provider, header):
    r = chat("nope", session_id="sim", headers={"X-Simulate-Failure": header})
    assert r.status_code == 503 and r.json() == {"detail": "all providers unavailable"}
    assert provider.calls == []
    assert client.get("/sessions/sim/messages").status_code == 404


def test_simulation_is_per_request(chat):
    chat("x", headers={"X-Simulate-Failure": "key_1=429"})
    m = chat("y", session_id="s-2").json()["metadata"]
    assert m["key_id"] == "key_1" and m["fallback_attempts"] == 0


def test_simulation_bypasses_cache(chat):
    chat("cached prompt")
    r = chat("cached prompt", session_id="s-2", headers={"X-Simulate-Failure": "*=429"})
    assert r.status_code == 503


def test_simulation_disabled(tmp_path, provider):
    app = create_app(make_settings(tmp_path, enable_failure_simulation=False))
    with TestClient(app) as c:
        r = c.post("/chat", json={"session_id": "s", "message": "hi"}, headers={"X-Simulate-Failure": "*=429"})
        assert r.status_code == 200 and r.json()["metadata"]["key_id"] == "key_1"


def test_non_retryable_error_is_502_json(client, chat, provider):
    provider.failures[KEY_1] = litellm.BadRequestError(message="bad", model="m", llm_provider="fakeprov")
    r = chat("bad", session_id="bad")
    assert r.status_code == 502 and "detail" in r.json()
    assert client.get("/sessions/bad/messages").status_code == 404


# 16 ----------------------------------------------------------------
def test_token_usage_is_per_request(chat):
    r1 = chat("one two three", session_id="t").json()["metadata"]
    r2 = chat("four five", session_id="t").json()["metadata"]
    # request 1: 3 prompt words. request 2 context = turn1 user + assistant reply + new message
    assert r1["input_tokens"] == 3
    assert r2["input_tokens"] > r1["input_tokens"]
    assert r2["input_tokens"] == 3 + r1["output_tokens"] + 2  # current request only, not cumulative totals
    assert r2["output_tokens"] > 0


def test_no_secrets_in_responses(client, chat):
    chat("hello", session_id="sec")
    blob = client.get("/health").text + chat("hello", session_id="sec2").text + client.get("/sessions/sec/messages").text
    assert KEY_1 not in blob and KEY_2 not in blob


def test_cors_preflight(client):
    r = client.options("/chat", headers={
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-simulate-failure",
    })
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"
