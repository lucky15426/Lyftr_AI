import { Database, KeyRound, Cpu, UserRound, XCircle, CheckCircle2, Search } from "lucide-react";

// Turn response metadata into the ordered hops a request took.
export function buildRoute(meta) {
  if (!meta) return [];
  if (meta.resolution_source === "LLM_CACHE") {
    return [{ id: "cache", label: "Cache", state: "hit", icon: Database }];
  }
  const hops = [{ id: "cache", label: "Cache", state: "miss", icon: Search }];
  const failed = meta.fallback_attempts || 0;
  for (let i = 1; i <= failed; i++) {
    hops.push({ id: `key_${i}`, label: `key_${i}`, state: "fail", icon: KeyRound });
  }
  hops.push({ id: meta.key_id || "key", label: meta.key_id || "key", state: "ok", icon: KeyRound });
  hops.push({ id: "model", label: meta.model?.split("/").pop() || "model", state: "ok", icon: Cpu });
  return hops;
}

const STATE = {
  hit: "border-cache/60 bg-cache/10 text-cache",
  miss: "border-zinc-600/60 bg-zinc-500/10 text-zinc-400",
  fail: "border-bad/60 bg-bad/10 text-bad",
  ok: "border-live/60 bg-live/10 text-live",
  idle: "border-line bg-white/[0.02] text-zinc-600",
  busy: "border-warn/60 bg-warn/10 text-warn",
};

export function Hop({ hop, state }) {
  const Icon = state === "fail" ? XCircle : state === "hit" || state === "ok" ? hop.icon : hop.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10.5px] ${STATE[state ?? hop.state]}`}>
      <Icon size={11} aria-hidden="true" />
      {hop.label}
    </span>
  );
}

export function RouteLine({ hops, busy = false }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white/[0.03] px-2 py-0.5 font-mono text-[10.5px] text-zinc-400">
        <UserRound size={11} /> you
      </span>
      {hops.map((h) => (
        <span key={h.id + h.state} className="inline-flex items-center gap-1.5">
          <span className="h-px w-3 bg-line" />
          <Hop hop={h} state={busy ? "busy" : undefined} />
        </span>
      ))}
    </div>
  );
}

export function sourceTheme(meta) {
  if (meta?.resolution_source === "LLM_CACHE") return { rail: "bg-cache", text: "text-cache", name: "Served from cache" };
  if (meta?.fallback_attempts > 0) return { rail: "bg-warn", text: "text-warn", name: "Recovered via failover" };
  return { rail: "bg-live", text: "text-live", name: "Live inference" };
}

export { CheckCircle2 };
