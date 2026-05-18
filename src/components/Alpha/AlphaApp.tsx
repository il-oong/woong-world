"use client";

import { useState } from "react";
import PortfolioSheet from "./PortfolioSheet";
import WatchlistSheet from "./WatchlistSheet";
import JkpAnalysis from "./JkpAnalysis";
import EconomicCalendar from "./EconomicCalendar";
import InvestSettings from "./InvestSettings";

type Tab = "portfolio" | "watchlist" | "jkp" | "calendar" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "portfolio", label: "포트폴리오" },
  { id: "watchlist", label: "관심종목" },
  { id: "jkp", label: "JKP 분석" },
  { id: "calendar", label: "경제 캘린더" },
  { id: "settings", label: "투자 설정" },
];

export default function AlphaApp() {
  const [tab, setTab] = useState<Tab>("portfolio");

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 pb-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-t-md px-4 py-2 text-xs font-medium transition ${
              tab === t.id
                ? "border border-b-0 border-zinc-700 bg-zinc-900 text-amber-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {tab === "portfolio" && <PortfolioSheet />}
        {tab === "watchlist" && <WatchlistSheet />}
        {tab === "jkp" && <JkpAnalysis />}
        {tab === "calendar" && <EconomicCalendar />}
        {tab === "settings" && <InvestSettings />}
      </div>
    </div>
  );
}
