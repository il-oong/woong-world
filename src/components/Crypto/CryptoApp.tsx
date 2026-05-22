"use client";

import { useState } from "react";
import CoinRecommendations from "./CoinRecommendations";
import CryptoInvestSettings from "./InvestSettings";

type Tab = "recs" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "recs", label: "추천 코인" },
  { id: "settings", label: "트레이더 가중치" },
];

export default function CryptoApp() {
  const [tab, setTab] = useState<Tab>("recs");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-zinc-600">
          <span className="font-mono text-amber-500/70">JKP CRYPTO</span> — Saylor · Hayes · PlanB · Pal · Woo
          5트레이더 기반 코인 어시스턴트
        </p>
      </div>

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

      <div>
        {tab === "recs" && <CoinRecommendations />}
        {tab === "settings" && <CryptoInvestSettings />}
      </div>
    </div>
  );
}
