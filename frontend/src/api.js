// Backend base URL comes from the environment. In dev we fall back to localhost;
// production builds never contain a hardcoded localhost URL.
const BASE = (
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? "http://localhost:8000" : "")
).replace(/\/+$/, "");

function describe(detail, status) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : "input";
    return `Invalid ${field}: ${first.msg}`;
  }
  return `Request failed (HTTP ${status})`;
}

async function request(path, options) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, options);
  } catch {
    throw new Error("Cannot reach the backend. Check that the server is running.");
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const msg =
      res.status === 503 && body?.detail === "all providers unavailable"
        ? "All AI providers are currently unavailable. Please try again shortly."
        : describe(body?.detail, res.status);
    throw new Error(msg);
  }
  return body;
}

export function sendChat({ sessionId, message, systemPrompt, simulateFailure }) {
  const payload = { session_id: sessionId, message };
  if (systemPrompt?.trim()) payload.system_prompt = systemPrompt.trim();
  const headers = { "Content-Type": "application/json" };
  if (simulateFailure?.trim()) headers["X-Simulate-Failure"] = simulateFailure.trim();
  return request("/chat", { method: "POST", headers, body: JSON.stringify(payload) });
}

export async function checkHealth() {
  try {
    const res = await fetch(`${BASE}/health`);
    return res.ok ? "online" : "degraded";
  } catch {
    return "offline";
  }
}
