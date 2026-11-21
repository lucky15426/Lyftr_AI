import { useState } from "react";
import { Check, Copy } from "lucide-react";
import MetaBadges from "./MetaBadges.jsx";
import { sourceTheme } from "./RouteTrace.jsx";

export default function Message({ message, maxLatency }) {
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    return (
      <div className="rise flex justify-end" data-testid="user-message">
        <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-gradient-to-br from-violet-500 to-fuchsia-500 px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-lg shadow-violet-900/30 sm:max-w-[72%]">
          {message.content}
        </div>
      </div>
    );
  }

  const theme = sourceTheme(message.metadata);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="rise" data-testid="assistant-message">
      <div className="glass group relative flex overflow-hidden rounded-2xl">
        <div className={`w-1 shrink-0 ${theme.rail}`} aria-hidden="true" />
        <div className="min-w-0 flex-1 px-4 py-3.5 sm:px-5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className={`font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] ${theme.text}`}>
              {theme.name}
            </span>
            <button
              type="button"
              onClick={copy}
              aria-label="Copy reply"
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] text-zinc-500 opacity-0 transition hover:bg-white/5 hover:text-zinc-200 focus:opacity-100 group-hover:opacity-100"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "copied" : "copy"}
            </button>
          </div>
          <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.7] text-zinc-100">{message.content}</p>
          {message.metadata && <MetaBadges meta={message.metadata} maxLatency={maxLatency} />}
        </div>
      </div>
    </div>
  );
}
