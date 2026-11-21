"""LiteLLM gateway: key pool, ordered failover, built-in response caching."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import litellm
from litellm.caching.caching import Cache

from .config import Settings

log = logging.getLogger("gateway")

LIVE = "LIVE_INFERENCE"
CACHE = "LLM_CACHE"


class AllProvidersUnavailable(Exception):
    """Every key in the pool failed with a retryable error."""


class UpstreamError(Exception):
    """A non-retryable provider error (e.g. a 400 bad request)."""


@dataclass
class LLMResult:
    reply: str
    resolution_source: str
    model: str
    latency_ms: int
    input_tokens: int
    output_tokens: int
    key_id: Optional[str]
    fallback_attempts: int

    def metadata(self) -> dict:
        return {
            "resolution_source": self.resolution_source,
            "model": self.model,
            "latency_ms": self.latency_ms,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "key_id": self.key_id,
            "fallback_attempts": self.fallback_attempts,
        }


def parse_simulation(header: Optional[str]) -> Dict[str, int]:
    """'key_1=429,key_2=500' / '*=429' -> {'key_1': 429, 'key_2': 500}. Bad entries are ignored."""
    out: Dict[str, int] = {}
    for part in (header or "").split(","):
        name, sep, code = part.partition("=")
        name, code = name.strip(), code.strip()
        if sep and name and code.isdigit():
            out[name] = int(code)
    return out


def _simulated_error(status: int, model: str) -> Exception:
    msg = f"simulated provider failure (HTTP {status})"
    if status == 429:
        return litellm.RateLimitError(message=msg, llm_provider="simulated", model=model)
    if status >= 500:
        return litellm.InternalServerError(message=msg, llm_provider="simulated", model=model)
    return litellm.APIError(status_code=status, message=msg, llm_provider="simulated", model=model)


def is_failover_error(exc: Exception) -> bool:
    """429 / quota exhaustion / 5xx / network failures / key-specific auth errors."""
    if isinstance(
        exc,
        (
            litellm.RateLimitError,
            litellm.InternalServerError,
            litellm.ServiceUnavailableError,
            litellm.Timeout,
            litellm.APIConnectionError,
            litellm.AuthenticationError,
            litellm.PermissionDeniedError,
        ),
    ):
        return True
    status = getattr(exc, "status_code", None)
    if isinstance(status, int) and (status in (401, 403, 429) or status >= 500):
        return True
    text = str(exc).lower()
    return any(t in text for t in ("quota", "resource_exhausted", "rate limit", "rate_limit"))


class LLMGateway:
    def __init__(self, settings: Settings):
        self.model = settings.llm_model
        self.timeout = settings.llm_timeout_seconds
        self.cache_ttl = settings.cache_ttl_seconds
        self.simulation_enabled = settings.enable_failure_simulation
        # key ids are generated in order: key_1, key_2, ...
        self.pool: List[Tuple[str, str]] = [
            (f"key_{i}", k) for i, k in enumerate(settings.llm_api_keys, start=1)
        ]
        self.cache_enabled = True
        # LiteLLM's built-in cache. The key is derived from model + full messages
        # (+ sampling params) -- never from the API key, so any key can serve a hit.
        litellm.cache = Cache(type="local")
        self._warm_up()

    @staticmethod
    def _warm_up() -> None:
        """LiteLLM lazily imports a chunk of modules on the first cache lookup (~250ms).
        Import them at startup so the first real cache hit is already fast."""
        try:
            import litellm.llms.anthropic.messages.native.response_cache  # noqa: F401
        except Exception:  # best effort only; never block startup
            log.debug("cache warm-up skipped", exc_info=True)

    @property
    def keys_configured(self) -> int:
        return len(self.pool)

    def complete(self, messages: List[dict], simulate: Optional[Dict[str, int]] = None) -> LLMResult:
        simulate = simulate if (simulate and self.simulation_enabled) else {}
        # Failure simulation targets the live provider path, so bypass cache *reads*
        # for that request; otherwise a cached prompt would mask the simulated outage.
        cache_ctl = {"no-cache": True} if simulate else {"ttl": self.cache_ttl}

        attempts = 0
        for key_id, api_key in self.pool:
            started = time.perf_counter()
            try:
                status = simulate.get(key_id, simulate.get("*"))
                if status is not None:
                    raise _simulated_error(status, self.model)
                resp = litellm.completion(
                    model=self.model,
                    messages=messages,
                    api_key=api_key,
                    timeout=self.timeout,
                    num_retries=0,  # failover is ours; no hidden same-key retries
                    caching=True,
                    cache=cache_ctl,
                )
            except Exception as exc:  # noqa: BLE001
                if is_failover_error(exc):
                    attempts += 1
                    log.warning("%s failed (%s); trying next key", key_id, type(exc).__name__)
                    continue
                log.error("non-retryable provider error: %s", type(exc).__name__)
                raise UpstreamError(type(exc).__name__) from exc
            latency_ms = int(round((time.perf_counter() - started) * 1000))

            hit = bool((getattr(resp, "_hidden_params", None) or {}).get("cache_hit"))
            usage = getattr(resp, "usage", None)
            return LLMResult(
                reply=resp.choices[0].message.content or "",
                resolution_source=CACHE if hit else LIVE,
                model=self.model,
                latency_ms=latency_ms,
                input_tokens=int(getattr(usage, "prompt_tokens", 0) or 0),
                output_tokens=int(getattr(usage, "completion_tokens", 0) or 0),
                key_id=None if hit else key_id,
                fallback_attempts=0 if hit else attempts,
            )
        raise AllProvidersUnavailable()
