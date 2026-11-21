import { ArrowUpRight } from "lucide-react";

const IDEAS = [
  { t: "What is the capital of France?", tag: "ask it twice → cache" },
  { t: "Explain how API key failover works in two sentences.", tag: "then break a key" },
  { t: "Write a haiku about caching.", tag: "watch the receipt" },
];

const PATHS = [
  { n: "01", name: "Live", d: "A fresh answer straight from the model.", c: "bg-live" },
  { n: "02", name: "Cache", d: "Asked before? Replied from memory in milliseconds.", c: "bg-cache" },
  { n: "03", name: "Failover", d: "A key died. The next one quietly took over.", c: "bg-warn" },
];

export default function Welcome({ onPick }) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col justify-center px-5 py-10" data-testid="welcome">
      <p className="rise font-mono text-[11px] uppercase tracking-[0.3em] text-muted">Lyftr · route-aware chat</p>
      <h1 className="rise mt-3 font-serif text-5xl font-bold leading-[1.02] tracking-tight sm:text-7xl">
        Every answer,
        <br />
        <em className="font-medium text-warn">with receipts.</em>
      </h1>
      <p className="rise mt-5 max-w-md text-[15px] leading-relaxed text-muted">
        Most chatbots hide how they work. This one prints a receipt for every reply: which path it took, which key paid for it, how long it took and how many tokens it used.
      </p>

      <div className="rise mt-8 grid gap-3 sm:grid-cols-3">
        {PATHS.map((p) => (
          <div key={p.name} className="hard-sm rounded-lg border-[1.5px] border-ink bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-muted">{p.n}</span>
              <span className={`h-2.5 w-2.5 rounded-full border border-ink ${p.c}`} />
            </div>
            <p className="mt-2 font-serif text-lg font-bold">{p.name}</p>
            <p className="mt-1 text-[12.5px] leading-snug text-muted">{p.d}</p>
          </div>
        ))}
      </div>

      <div className="rise mt-6 border-t-[1.5px] border-ink">
        {IDEAS.map((i) => (
          <button
            key={i.t}
            type="button"
            onClick={() => onPick(i.t)}
            className="group flex w-full items-center justify-between gap-3 border-b border-line px-1 py-3.5 text-left transition hover:bg-ink/[0.04]"
          >
            <span className="text-[15px] font-medium">{i.t}</span>
            <span className="flex shrink-0 items-center gap-2 font-mono text-[10.5px] text-muted">
              <span className="hidden sm:inline">{i.tag}</span>
              <ArrowUpRight size={16} className="text-ink transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-warn" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
