"use client";

import { useState } from "react";
import MarketTicker from "./MarketTicker";
import MarketBoard from "./MarketBoard";
import MarketChat from "./MarketChat";

export default function MarketHub() {
  const [chatOpen, setChatOpen] = useState(false);
  const [tickerOpen, setTickerOpen] = useState(true);

  return (
    <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden">
      {/* Top nav */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 shrink-0 bg-zinc-950/90 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <a href="/" className="text-zinc-600 hover:text-zinc-300 transition text-sm">← 홈</a>
          <div className="w-px h-4 bg-zinc-800" />
          <span className="text-sm font-semibold text-white">마켓 허브</span>
          <span className="text-[10px] font-mono text-zinc-600">MARKET HUB</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTickerOpen((v) => !v)}
            className={`px-2.5 py-1 rounded text-[11px] border transition ${
              tickerOpen ? "border-zinc-600 text-zinc-300 bg-zinc-800" : "border-zinc-800 text-zinc-600 hover:border-zinc-700"
            }`}
          >
            시세창
          </button>
          <button
            onClick={() => setChatOpen((v) => !v)}
            className={`px-2.5 py-1 rounded text-[11px] border transition ${
              chatOpen ? "border-emerald-500/50 text-emerald-300 bg-emerald-500/10" : "border-zinc-800 text-zinc-600 hover:border-zinc-700"
            }`}
          >
            💬 채팅
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Ticker panel */}
        {tickerOpen && (
          <div className="w-56 shrink-0 hidden md:flex flex-col min-h-0">
            <MarketTicker />
          </div>
        )}

        {/* Center: Board */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <MarketBoard />
        </div>

        {/* Right: Chat */}
        {chatOpen && (
          <div className="w-72 shrink-0 hidden lg:flex flex-col min-h-0">
            <MarketChat onClose={() => setChatOpen(false)} />
          </div>
        )}
      </div>

      {/* Mobile: Floating chat button */}
      <div className="lg:hidden fixed bottom-4 right-4 z-20">
        <button
          onClick={() => setChatOpen((v) => !v)}
          className="w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-500 shadow-lg text-white flex items-center justify-center text-xl transition"
        >
          💬
        </button>
      </div>

      {/* Mobile chat overlay */}
      {chatOpen && (
        <div className="lg:hidden fixed inset-0 z-30 flex flex-col bg-zinc-950">
          <MarketChat onClose={() => setChatOpen(false)} />
        </div>
      )}
    </div>
  );
}
