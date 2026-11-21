import { useState } from "react";
import { Check, Copy } from "lucide-react";
import MetaBadges from "./MetaBadges.jsx";
import { sourceTheme } from "./RouteTrace.jsx";

export default function Message({ message, maxLatency }) {
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    return (
      <div className="rise flex justify-end" data-testid="user-message">
        <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-[15px] leading-relaxed text-paper sm:max-w-[72%]">
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
      <div className="hard group relative rounded-xl border-[1.5px] border-ink bg-card px-4 py-4 sm:px-5" style={{ "--shadow": theme.shadow }}>
        <span className={`absolute -top-3 left-4 -rotate-1 rounded-md border-[1.5px] border-ink px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-white ${theme.bar}`}>
          {theme.name}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy reply"
          className="absolute right-3 top-2.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] text-muted opacity-0 transition hover:bg-ink/5 hover:text-ink focus:opacity-100 group-hover:opacity-100"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "copied" : "copy"}
        </button>
        <p className="mt-1 whitespace-pre-wrap break-words text-[15.5px] leading-[1.7]">{message.content}</p>
        {message.metadata && <MetaBadges meta={message.metadata} maxLatency={maxLatency} />}
      </div>
    </div>
  );
}
