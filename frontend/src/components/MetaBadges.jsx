import { RouteLine, buildRoute, sourceTheme } from "./RouteTrace.jsx";

const fmt = (n) => (n ?? 0).toLocaleString();

// Per-message "flight recorder". Each data-testid element contains only the raw value.
export default function MetaBadges({ meta, maxLatency = 1 }) {
  const theme = sourceTheme(meta);
  const pct = Math.max(4, Math.min(100, (meta.latency_ms / Math.max(maxLatency, 1)) * 100));
  const total = (meta.input_tokens ?? 0) + (meta.output_tokens ?? 0);
  const inPct = total ? ((meta.input_tokens ?? 0) / total) * 100 : 50;

  return (
    <div className="mt-3 space-y-2.5 border-t border-line pt-3" aria-label="Response metadata">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`font-mono text-[11px] font-semibold tracking-wide ${theme.text}`}>
          ● <span data-testid="meta-source">{meta.resolution_source}</span>
        </span>
        <span className="font-mono text-[11px] text-zinc-500" title="Model">
          <span data-testid="meta-model">{meta.model}</span>
        </span>
      </div>

      <RouteLine hops={buildRoute(meta)} />

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div title="Latency">
          <div className="mb-1 flex justify-between font-mono text-[10.5px] text-zinc-500">
            <span>latency</span>
            <span className="text-zinc-300">
              <span data-testid="meta-latency">{meta.latency_ms}</span> ms
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div className={`grow h-full rounded-full ${theme.rail}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div title="Input vs output tokens">
          <div className="mb-1 flex justify-between font-mono text-[10.5px] text-zinc-500">
            <span>
              in <span className="text-zinc-300" data-testid="meta-input-tokens">{meta.input_tokens}</span>
            </span>
            <span>
              out <span className="text-zinc-300" data-testid="meta-output-tokens">{meta.output_tokens}</span>
            </span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-white/5">
            <div className="grow h-full bg-violet-400/80" style={{ width: `${inPct}%` }} />
            <div className="grow h-full bg-cyan-300/80" style={{ width: `${100 - inPct}%` }} />
          </div>
        </div>
      </div>

      <p className="font-mono text-[10.5px] text-zinc-600">
        key <span data-testid="meta-key-id" className="text-zinc-400">{meta.key_id ?? "none"}</span>
        {meta.fallback_attempts > 0 && (
          <>
            {" · "}failover <span data-testid="meta-fallback-attempts" className="text-warn">{meta.fallback_attempts}</span>
          </>
        )}
        {" · "}{fmt(total)} tokens
      </p>
    </div>
  );
}
