import { Plus, X, FlaskConical, Activity } from "lucide-react";

const STATUS = {
  online: { label: "backend online", dot: "bg-cache" },
  degraded: { label: "backend degraded", dot: "bg-warn" },
  offline: { label: "backend offline", dot: "bg-bad" },
  checking: { label: "checking…", dot: "bg-zinc-500" },
};

const SIMULATIONS = [
  { value: "", label: "Off (real providers)" },
  { value: "key_1=429", label: "key_1 → 429" },
  { value: "key_1=500", label: "key_1 → 500" },
  { value: "key_1=429,key_2=500", label: "key_1 → 429, key_2 → 500" },
  { value: "*=429", label: "All keys → 429" },
];

function Stat({ label, value, tone = "text-zinc-100" }) {
  return (
    <div className="rounded-xl border border-line bg-white/[0.02] px-3 py-2">
      <p className={`font-mono text-xl font-semibold ${tone}`}>{value}</p>
      <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
    </div>
  );
}

export default function Sidebar({ sessionId, status, onNewChat, open, onClose, simulate, onSimulate, stats }) {
  const s = STATUS[status] ?? STATUS.checking;
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`glass fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-y-0 border-l-0 p-4 transition-transform md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative h-8 w-8">
              <span className="absolute inset-0 rotate-6 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500" />
              <span className="absolute inset-0 -rotate-6 rounded-lg bg-gradient-to-br from-cyan-300 to-lime-300 mix-blend-screen" />
            </div>
            <div className="leading-tight">
              <p className="text-lg font-bold tracking-tight">Lyftr</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-500">route-aware chat</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 md:hidden" aria-label="Close sidebar">
            <X size={18} />
          </button>
        </div>

        <button
          type="button"
          data-testid="new-chat-button"
          onClick={onNewChat}
          className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:brightness-110"
        >
          <Plus size={16} /> New chat
        </button>

        <div className="mt-7">
          <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            <Activity size={12} /> Session telemetry
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="replies" value={stats.replies} />
            <Stat label="avg ms" value={stats.avgLatency} tone="text-live" />
            <Stat label="cache hits" value={stats.cacheHits} tone="text-cache" />
            <Stat label="failovers" value={stats.failovers} tone="text-warn" />
          </div>
          <p className="mt-2 font-mono text-[10.5px] text-zinc-500">{stats.tokens.toLocaleString()} tokens used</p>
        </div>

        <div className="mt-7">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Session id</p>
          <p data-testid="session-id" className="mt-1.5 break-all rounded-lg border border-line bg-white/[0.02] px-2.5 py-2 font-mono text-[10.5px] text-zinc-400">
            {sessionId}
          </p>
        </div>

        <div className="mt-7">
          <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            <FlaskConical size={12} /> Failover demo
          </p>
          <select
            data-testid="simulate-select"
            value={simulate}
            onChange={(e) => onSimulate(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-line bg-panel px-2.5 py-2 text-xs text-zinc-300 outline-none focus:border-cyan-300/60"
            aria-label="Simulate provider failure"
          >
            {SIMULATIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] leading-snug text-zinc-600">
            Sends X-Simulate-Failure (needs ENABLE_FAILURE_SIMULATION=true).
          </p>
        </div>

        <div className="mt-auto flex items-center gap-2 rounded-xl border border-line bg-white/[0.02] px-3 py-2.5 font-mono text-[11px] text-zinc-400" data-testid="backend-status" data-status={status}>
          <span className={`h-2 w-2 rounded-full ${s.dot} ${status === "online" ? "pulse-ring text-cache" : ""}`} />
          {s.label}
        </div>
      </aside>
    </>
  );
}
