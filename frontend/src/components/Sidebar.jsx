import { Plus, X, FlaskConical } from "lucide-react";

const STATUS = {
  online: { label: "backend online", dot: "bg-cache" },
  degraded: { label: "backend degraded", dot: "bg-warn" },
  offline: { label: "backend offline", dot: "bg-bad" },
  checking: { label: "checking…", dot: "bg-muted" },
};

const SIMULATIONS = [
  { value: "", label: "Off (real providers)" },
  { value: "key_1=429", label: "key_1 → 429" },
  { value: "key_1=500", label: "key_1 → 500" },
  { value: "key_1=429,key_2=500", label: "key_1 → 429, key_2 → 500" },
  { value: "*=429", label: "All keys → 429" },
];

function Line({ k, v, tone = "" }) {
  return (
    <div className="flex items-baseline gap-2 font-mono text-[12px]">
      <span className="text-muted">{k}</span>
      <span className="flex-1 border-b border-dotted border-muted/50" />
      <span className={`font-semibold ${tone}`}>{v}</span>
    </div>
  );
}

export default function Sidebar({ sessionId, status, onNewChat, open, onClose, simulate, onSimulate, stats }) {
  const s = STATUS[status] ?? STATUS.checking;
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-ink/40 md:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r-[1.5px] border-ink bg-side p-5 transition-transform md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="font-serif text-3xl font-bold leading-none tracking-tight">
              lyftr<span className="text-warn">.</span>
            </p>
            <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">chat with receipts</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-ink/5 md:hidden" aria-label="Close sidebar">
            <X size={18} />
          </button>
        </div>

        <button
          type="button"
          data-testid="new-chat-button"
          onClick={onNewChat}
          className="hard-sm mt-6 flex items-center justify-center gap-2 rounded-lg border-[1.5px] border-ink bg-ink px-3 py-2.5 text-sm font-semibold text-paper transition hover:-translate-y-px hover:bg-warn"
        >
          <Plus size={16} /> New chat
        </button>

        <div className="mt-8">
          <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">This session</p>
          <div className="space-y-2">
            <Line k="replies" v={stats.replies} />
            <Line k="avg latency" v={`${stats.avgLatency} ms`} tone="text-live" />
            <Line k="cache hits" v={stats.cacheHits} tone="text-cache" />
            <Line k="failovers" v={stats.failovers} tone="text-warn" />
            <Line k="tokens" v={stats.tokens.toLocaleString()} />
          </div>
        </div>

        <div className="mt-8">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Session id</p>
          <p data-testid="session-id" className="mt-1.5 break-all rounded-md border border-line bg-card px-2.5 py-2 font-mono text-[10.5px] text-muted">
            {sessionId}
          </p>
        </div>

        <div className="mt-8">
          <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            <FlaskConical size={12} /> Break a key
          </p>
          <select
            data-testid="simulate-select"
            value={simulate}
            onChange={(e) => onSimulate(e.target.value)}
            className="mt-1.5 w-full rounded-md border-[1.5px] border-ink bg-card px-2.5 py-2 text-xs outline-none focus:border-warn"
            aria-label="Simulate provider failure"
          >
            {SIMULATIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] leading-snug text-muted">
            Failover demo. Sends X-Simulate-Failure (needs ENABLE_FAILURE_SIMULATION=true).
          </p>
        </div>

        <div className="mt-auto flex items-center gap-2 border-t-[1.5px] border-dashed border-line pt-4 font-mono text-[11px] text-muted" data-testid="backend-status" data-status={status}>
          <span className={`h-2 w-2 rounded-full border border-ink ${s.dot}`} />
          {s.label}
        </div>
      </aside>
    </>
  );
}
