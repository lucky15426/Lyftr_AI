import { RouteLine, buildRoute, sourceTheme } from "./RouteTrace.jsx";

function Row({ k, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
      <span className="uppercase tracking-wider text-muted">{k}</span>
      <span className="text-right text-ink">{children}</span>
    </div>
  );
}

// Per-message receipt. Each data-testid element contains only the raw value.
export default function MetaBadges({ meta, maxLatency = 1 }) {
  const theme = sourceTheme(meta);
  const pct = Math.max(4, Math.min(100, (meta.latency_ms / Math.max(maxLatency, 1)) * 100));
  const total = (meta.input_tokens ?? 0) + (meta.output_tokens ?? 0);

  return (
    <div className="tear mt-4 space-y-2 pt-3" aria-label="Response metadata">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
        <span>Receipt</span>
        <span className={theme.text}>
          ● <span data-testid="meta-source" className="tracking-normal">{meta.resolution_source}</span>
        </span>
      </div>

      <Row k="route">
        <RouteLine hops={buildRoute(meta)} />
      </Row>
      <Row k="model">
        <span data-testid="meta-model">{meta.model}</span>
      </Row>
      <Row k="latency">
        <span className="inline-flex items-center gap-2">
          <span className="hidden h-2 w-24 overflow-hidden rounded-sm border border-ink/70 bg-paper sm:block">
            <span className={`grow block h-full ${theme.bar}`} style={{ width: `${pct}%` }} />
          </span>
          <span>
            <span data-testid="meta-latency">{meta.latency_ms}</span> ms
          </span>
        </span>
      </Row>
      <Row k="tokens">
        in <span data-testid="meta-input-tokens">{meta.input_tokens}</span> · out{" "}
        <span data-testid="meta-output-tokens">{meta.output_tokens}</span>
        <span className="text-muted"> ({total.toLocaleString()})</span>
      </Row>
      <Row k="key">
        <span data-testid="meta-key-id">{meta.key_id ?? "none"}</span>
        {meta.fallback_attempts > 0 && (
          <span className="text-warn">
            {" "}· failover <span data-testid="meta-fallback-attempts">{meta.fallback_attempts}</span>
          </span>
        )}
      </Row>
    </div>
  );
}
