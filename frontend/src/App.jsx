import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ChevronDown, Menu, Radio, Settings2, X } from "lucide-react";
import { checkHealth, sendChat } from "./api.js";
import Sidebar from "./components/Sidebar.jsx";
import Message from "./components/Message.jsx";
import Composer from "./components/Composer.jsx";
import Welcome from "./components/Welcome.jsx";
import { RouteLine, buildRoute } from "./components/RouteTrace.jsx";

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const newSessionId = () => `s-${uid()}`;

export default function App() {
  const [sessionId, setSessionId] = useState(newSessionId); // fresh session on every page load
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showSystem, setShowSystem] = useState(false);
  const [simulate, setSimulate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("checking");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const endRef = useRef(null);
  const inflight = useRef(false);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const s = await checkHealth();
      if (alive) setStatus(s);
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, error]);

  const send = useCallback(
    async (override) => {
      const text = (typeof override === "string" ? override : input).trim();
      if (!text || inflight.current) return;
      inflight.current = true;
      setError("");
      setInput("");
      setLoading(true);
      setMessages((m) => [...m, { id: uid(), role: "user", content: text }]);
      try {
        const res = await sendChat({ sessionId, message: text, systemPrompt, simulateFailure: simulate });
        setMessages((m) => [
          ...m,
          { id: uid(), role: "assistant", content: res.reply, metadata: res.metadata },
        ]);
        setStatus("online");
      } catch (e) {
        // The server stores nothing for a failed turn, so mirror that: drop the bubble, restore the text.
        setMessages((m) => m.slice(0, -1));
        setInput(text);
        setError(e.message || "Something went wrong.");
      } finally {
        inflight.current = false;
        setLoading(false);
      }
    },
    [input, sessionId, systemPrompt, simulate]
  );

  const newChat = () => {
    if (inflight.current) return;
    setSessionId(newSessionId());
    setMessages([]);
    setError("");
    setInput("");
    setSidebarOpen(false);
  };

  const replies = messages.filter((m) => m.role === "assistant");
  const metas = replies.map((m) => m.metadata).filter(Boolean);
  const stats = {
    replies: metas.length,
    cacheHits: metas.filter((m) => m.resolution_source === "LLM_CACHE").length,
    failovers: metas.filter((m) => m.fallback_attempts > 0).length,
    avgLatency: metas.length ? Math.round(metas.reduce((a, m) => a + m.latency_ms, 0) / metas.length) : 0,
    tokens: metas.reduce((a, m) => a + (m.input_tokens ?? 0) + (m.output_tokens ?? 0), 0),
  };
  const maxLatency = Math.max(1, ...metas.map((m) => m.latency_ms));
  const lastMeta = metas[metas.length - 1];

  return (
    <div className="aurora relative flex h-full overflow-hidden bg-ink text-zinc-100">
      <Sidebar
        sessionId={sessionId}
        status={status}
        onNewChat={newChat}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        simulate={simulate}
        onSimulate={setSimulate}
        stats={stats}
      />

      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="glass flex items-center gap-3 border-x-0 border-t-0 px-4 py-2.5">
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 md:hidden" aria-label="Open sidebar">
            <Menu size={20} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Radio size={14} className={loading ? "text-warn" : "text-zinc-500"} />
            <span className="hidden font-mono text-[10.5px] uppercase tracking-[0.2em] text-zinc-500 sm:block">Live route</span>
            <div className="min-w-0 flex-1">
              {loading ? (
                <div className="relative h-px w-full bg-line" data-testid="route-busy">
                  <span className="packet" />
                  <span className="absolute -top-4 left-0 font-mono text-[10.5px] text-warn">routing request…</span>
                </div>
              ) : lastMeta ? (
                <RouteLine hops={buildRoute(lastMeta)} />
              ) : (
                <span className="font-mono text-[11px] text-zinc-600">idle — send a message to trace its route</span>
              )}
            </div>
          </div>
        </header>

        <div className="grid-bg flex-1 overflow-y-auto" data-testid="chat-scroll">
          {messages.length === 0 && !loading ? (
            <Welcome onPick={(t) => send(t)} />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
              {messages.map((m) => (
                <Message key={m.id} message={m} maxLatency={maxLatency} />
              ))}
              {loading && (
                <div className="rise glass flex items-center gap-3 rounded-2xl px-4 py-3.5" data-testid="loading-indicator" role="status" aria-label="Assistant is responding">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="h-1.5 w-6 animate-pulse rounded-full bg-cyan-300/70" style={{ animationDelay: `${i * 0.2}s` }} />
                    ))}
                  </span>
                  <span className="caret font-mono text-xs text-zinc-400">thinking</span>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="glass border-x-0 border-b-0 px-4 pb-7 pt-3">
          <div className="mx-auto max-w-3xl">
            {error && (
              <div role="alert" data-testid="error-message" className="mb-3 flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2.5 text-sm text-rose-200">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-bad" />
                <span className="flex-1">{error}</span>
                <button onClick={() => setError("")} aria-label="Dismiss error" className="text-rose-300/60 hover:text-rose-100">
                  <X size={16} />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowSystem((v) => !v)}
              className="mb-2 flex items-center gap-1.5 font-mono text-[11px] text-zinc-500 hover:text-zinc-200"
              aria-expanded={showSystem}
            >
              <Settings2 size={13} /> system prompt{systemPrompt.trim() ? " · set" : " (optional)"}
              <ChevronDown size={13} className={`transition ${showSystem ? "rotate-180" : ""}`} />
            </button>
            {showSystem && (
              <textarea
                data-testid="system-prompt-input"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={2}
                maxLength={4000}
                placeholder="e.g. You are a concise assistant that answers in one sentence."
                aria-label="System prompt"
                className="mb-3 w-full resize-none rounded-xl border border-line bg-panel px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-cyan-300/60"
              />
            )}

            <Composer value={input} onChange={setInput} onSend={() => send()} loading={loading} />
          </div>
        </div>
      </main>
    </div>
  );
}
