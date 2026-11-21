import { useEffect, useRef } from "react";
import { ArrowUp, Loader2 } from "lucide-react";

export default function Composer({ value, onChange, onSend, loading }) {
  const ref = useRef(null);

  // auto-grow up to ~6 lines
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!loading) onSend();
    }
  };

  const canSend = !loading && value.trim().length > 0;

  return (
    <div className="relative rounded-[22px] bg-gradient-to-r from-violet-500/40 via-cyan-400/40 to-lime-300/40 p-px transition focus-within:from-violet-500 focus-within:via-cyan-400 focus-within:to-lime-300 focus-within:shadow-[0_0_32px_-6px_rgba(94,234,212,.45)]">
      <div className="flex items-end gap-2 rounded-[21px] bg-panel p-2">
        <textarea
          ref={ref}
          data-testid="chat-input"
          rows={1}
          value={value}
          maxLength={4000}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask anything — then watch how it gets answered…"
          aria-label="Message"
          className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2 text-[15px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600"
        />
        <button
          type="button"
          data-testid="send-button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-lime-300 text-zinc-900 transition hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}
        </button>
      </div>
      <p className="pointer-events-none absolute -bottom-5 right-3 hidden font-mono text-[10px] text-zinc-600 sm:block">
        Enter ↵ send · Shift+Enter newline
      </p>
    </div>
  );
}
