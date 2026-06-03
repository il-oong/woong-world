"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { ChatMessage } from "@/lib/market";

export default function MarketChat({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [onlineCount] = useState(Math.floor(Math.random() * 80) + 20);
  const bottomRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async () => {
    const res = await fetch("/api/market/chat");
    if (res.ok) {
      const data = await res.json() as ChatMessage[];
      setMessages(data);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
    intervalRef.current = setInterval(fetchMessages, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    const res = await fetch("/api/market/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: input.trim() }),
    });
    if (res.ok) {
      const msg = await res.json() as ChatMessage;
      setMessages((prev) => [...prev, msg]);
      setInput("");
    }
    setSending(false);
  };

  function timeStr(ts: number) {
    const d = new Date(ts);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-l border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-200">실시간 채팅</span>
          <span className="text-[10px] text-zinc-500">● {onlineCount}명</span>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition text-sm">✕</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
        {messages.map((m) => (
          <div key={m.id} className="space-y-0.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] font-semibold text-zinc-300">{m.author}</span>
              <span className="text-[9px] text-zinc-700">{timeStr(m.createdAt)}</span>
            </div>
            {m.stockTag && (
              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono border mr-1 ${
                (m.stockTag.change ?? 0) >= 0 ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"
              }`}>
                {m.stockTag.ticker} {m.stockTag.market}
                {m.stockTag.change !== null && <> {m.stockTag.change >= 0 ? "+" : ""}{m.stockTag.change.toFixed(2)}% ${m.stockTag.price?.toFixed(2)}</>}
              </span>
            )}
            <p className="text-xs text-zinc-400 leading-relaxed break-words">{m.content}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-2 py-2 border-t border-zinc-800 flex items-center gap-2 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="@종목명으로 태그 가능"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-none"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs text-white font-medium transition disabled:opacity-40"
        >
          전송
        </button>
      </div>
    </div>
  );
}
