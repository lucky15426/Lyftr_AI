import { Database, KeyRound, Zap } from "lucide-react";

const IDEAS = [
  { t: "What is the capital of France?", tag: "try it twice → cache" },
  { t: "Explain how API key failover works in two sentences.", tag: "then pick a failover demo" },
  { t: "Write a haiku about caching.", tag: "watch the route" },
];

const PATHS = [
  { icon: Zap, c: "text-live border-live/30", name: "Live", d: "Fresh answer from the model" },
  { icon: Database, c: "text-cache border-cache/30", name: "Cache", d: "Same prompt, instant reply" },
  { icon: KeyRound, c: "text-warn border-warn/30", name: "Failover", d: "A key died, the next one answers" },
];

export default function Welcome({ onPick }) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-5 py-8 text-center" data-testid="welcome">
      <p className="rise font-mono text-[11px] uppercase tracking-[0.3em] text-zinc-500">Transparent AI chat</p>
      <h1 className="rise mt-4 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
        See <span className="bg-gradient-to-r from-violet-400 via-cyan-300 to-lime-300 bg-clip-text text-transparent">how</span> every
        <br /> answer is made.
      </h1>
      <p className="rise mt-5 max-w-md text-sm leading-relaxed text-zinc-400">
        Other chatbots hide the plumbing. Lyftr shows the exact route each reply took — cache, API key or failover — with latency and tokens.
      </p>

      <div className="rise mt-8 grid w-full grid-cols-3 gap-2">
        {PATHS.map(({ icon: Icon, c, name, d }) => (
          <div key={name} className={`glass rounded-xl border p-3 text-left ${c}`}>
            <Icon size={16} />
            <p className="mt-2 text-sm font-semibold">{name}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{d}</p>
          </div>
        ))}
      </div>

      <div className="rise mt-5 flex w-full flex-col gap-2">
        {IDEAS.map((i) => (
          <button
            key={i.t}
            type="button"
            onClick={() => onPick(i.t)}
            className="glass group flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm text-zinc-200 transition hover:border-cyan-300/50 hover:bg-white/[0.04]"
          >
            <span>{i.t}</span>
            <span className="hidden shrink-0 font-mono text-[10px] text-zinc-600 transition group-hover:text-cyan-300 sm:block">{i.tag}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
