import { Database, KeyRound, Cpu, UserRound, X, Search } from "lucide-react";

// Turn response metadata into the ordered hops a request took.
export function buildRoute(meta) {
  if (!meta) return [];
  if (meta.resolution_source === "LLM_CACHE") {
    return [{ id: "cache", label: "cache", state: "hit", icon: Database }];
  }
  const hops = [{ id: "cache", label: "cache", state: "miss", icon: Search }];
  const failed = meta.fallback_attempts || 0;
  for (let i = 1; i <= failed; i++) {
    hops.push({ id: `key_${i}`, label: `key_${i}`, state: "fail", icon: KeyRound });
  }
  hops.push({ id: meta.key_id || "key", label: meta.key_id || "key", state: "ok", icon: KeyRound });
  hops.push({ id: "model", label: meta.model?.split("/").pop() || "model", state: "ok", icon: Cpu });
  return hops;
}

const STATE = {
  hit: "border-cache bg-cache/10 text-cache",
  miss: "border-line bg-transparent text-muted line-through decoration-muted/50",
  fail: "border-bad bg-bad/10 text-bad line-through",
  ok: "border-live bg-live/10 text-live",
};

export function Hop({ hop }) {
  const Icon = hop.state === "fail" ? X : hop.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border-[1.5px] px-1.5 py-0.5 font-mono text-[10.5px] font-medium ${STATE[hop.state]}`}>
      <Icon size={11} aria-hidden="true" />
      {hop.label}
    </span>
  );
}

export function RouteLine({ hops }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-md border-[1.5px] border-ink bg-ink px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-paper">
        <UserRound size={11} /> you
      </span>
      {hops.map((h) => (
        <span key={h.id + h.state} className="inline-flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-muted">→</span>
          <Hop hop={h} />
        </span>
      ))}
    </div>
  );
}

export function sourceTheme(meta) {
  if (meta?.resolution_source === "LLM_CACHE") return { bar: "bg-cache", text: "text-cache", shadow: "var(--color-cache)", name: "From cache" };
  if (meta?.fallback_attempts > 0) return { bar: "bg-warn", text: "text-warn", shadow: "var(--color-warn)", name: "Failover" };
  return { bar: "bg-live", text: "text-live", shadow: "var(--color-live)", name: "Live" };
}
