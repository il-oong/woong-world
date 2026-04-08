"use client";

import { use, useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import crewData from "@/data/crew.json";
import PixelIcon from "@/components/shared/PixelIcon";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function CrewMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const member = crewData.find((m) => m.id === id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!member) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-white/30">크루 멤버를 찾을 수 없습니다.</div>
      </div>
    );
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crewId: member.id,
          message: userMessage,
          history: messages.map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
          })),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || data.error || "응답 실패" },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "[오류] 서버 연결 실패" },
      ]);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Back */}
      <Link href="/admin/crew" className="text-xs text-white/30 hover:text-white/50 transition-colors">
        ← 크루 허브
      </Link>

      {/* Profile header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 flex items-start gap-4"
      >
        <PixelIcon type="crew" id={member.teamId} size={48} />
        <div>
          <h1 className="text-xl font-bold text-white/90">{member.name}</h1>
          <p className="text-sm text-white/40">{member.role} · {member.team}</p>
          <p className="text-xs text-white/30 mt-1">{member.desc}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {member.tags.map((tag) => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/30">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Chat interface */}
      <div className="mt-8">
        <h2 className="text-sm font-medium text-yellow-400/60 mb-4">인터컴 통신</h2>

        {/* Messages */}
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 h-80 overflow-y-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-white/20 text-sm py-12">
              {member.name.split(" (")[0]}에게 메시지를 보내세요.
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-yellow-400/10 text-yellow-400/80 border border-yellow-400/20"
                    : "bg-white/5 text-white/60 border border-white/5"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="text-[10px] text-white/30 mb-1">{member.emoji} {member.name.split(" (")[0]}</div>
                )}
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-white/30 text-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-400/40 animate-pulse" />
              {member.name.split(" (")[0]} 응답 중...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2 mt-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={`${member.name.split(" (")[0]}에게 메시지...`}
            className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white/80 placeholder:text-white/20 outline-none focus:border-yellow-400/30 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 rounded-lg bg-yellow-400/10 text-yellow-400/80 border border-yellow-400/20 text-sm hover:bg-yellow-400/20 transition-colors disabled:opacity-30"
          >
            전송
          </button>
        </div>
      </div>
    </div>
  );
}
