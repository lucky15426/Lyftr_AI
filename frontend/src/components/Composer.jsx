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
    <div className="relative">
      <div className="hard flex items-end gap-2 rounded-xl border-[1.5px] border-ink bg-card p-2 transition focus-within:translate-x-px focus-within:translate-y-px focus-within:shadow-[2px_2px_0_0_var(--color-ink)]">
        <textarea
          ref={ref}
          data-testid="chat-input"
          rows={1}
          value={value}
          maxLength={4000}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask anything, then read the receipt…"
          aria-label="Message"
          className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed outline-none placeholder:text-muted/70"
        />
        <button
          type="button"
          data-testid="send-button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-[1.5px] border-ink bg-warn text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:border-line disabled:bg-line disabled:text-muted"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}
        </button>
      </div>
      <p className="pointer-events-none absolute -bottom-5 right-1 hidden font-mono text-[10px] text-muted sm:block">
        enter to send · shift+enter for a new line
      </p>
    </div>
  );
}
