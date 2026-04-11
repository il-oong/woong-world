"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import crewData from "@/data/crew.json";
import PixelIcon from "@/components/shared/PixelIcon";

const teams = [...new Set(crewData.map((m) => m.teamId))];

export default function CrewHubPage() {
  const [filter, setFilter] = useState<string | null>(null);
  const filtered = filter ? crewData.filter((m) => m.teamId === filter) : crewData;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-baseline justify-between border-b border-white/[0.06] pb-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white/90">Crew</h1>
          <p className="text-xs font-mono text-white/20 mt-1">{filtered.length} members</p>
        </div>
      </div>

      {/* Filters — horizontal scroll, minimal */}
      <div className="flex gap-6 mb-10 overflow-x-auto pb-2 border-b border-white/[0.03]">
        <button
          onClick={() => setFilter(null)}
          className={`text-[11px] font-mono tracking-wider uppercase shrink-0 pb-2 transition-colors ${
            !filter ? "text-white/70 border-b border-white/30" : "text-white/20 hover:text-white/40"
          }`}
        >
          All
        </button>
        {teams.map((teamId) => {
          const team = crewData.find((m) => m.teamId === teamId);
          return (
            <button
              key={teamId}
              onClick={() => setFilter(teamId === filter ? null : teamId)}
              className={`text-[11px] font-mono tracking-wider uppercase shrink-0 pb-2 transition-colors ${
                filter === teamId ? "text-white/70 border-b border-white/30" : "text-white/20 hover:text-white/40"
              }`}
            >
              {team?.team.replace("팀", "")}
            </button>
          );
        })}
      </div>

      {/* Crew list — table-like, not cards */}
      <div className="space-y-0">
        {filtered.map((member, i) => (
          <motion.div
            key={member.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.02 }}
          >
            <Link
              href={`/admin/crew/${member.id}`}
              className="group flex items-center gap-4 md:gap-6 py-4 border-t border-white/[0.03] hover:bg-white/[0.01] transition-colors -mx-3 px-3"
            >
              {/* Pixel avatar */}
              <div className="shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                <PixelIcon type="crew" id={member.teamId} size={32} />
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-3">
                  <span className="text-base text-white/70 group-hover:text-white/95 transition-colors font-medium truncate">
                    {member.name.split(" (")[0]}
                  </span>
                  <span className="text-[10px] font-mono text-white/15 hidden sm:inline">
                    {member.name.includes("(") ? member.name.split("(")[1]?.replace(")", "") : ""}
                  </span>
                </div>
                <div className="text-[11px] text-white/25 mt-0.5 truncate">{member.role}</div>
              </div>

              {/* Team */}
              <span className="text-[10px] font-mono text-white/15 tracking-wider hidden md:block w-28 text-right shrink-0">
                {member.team}
              </span>

              {/* Tags */}
              <div className="hidden lg:flex gap-2 w-40 shrink-0 justify-end">
                {member.tags.slice(0, 2).map((tag) => (
                  <span key={tag} className="text-[9px] font-mono text-white/10">
                    {tag}
                  </span>
                ))}
              </div>

              {/* Arrow */}
              <svg
                className="w-3 h-3 text-white/8 group-hover:text-white/30 group-hover:translate-x-0.5 transition-all shrink-0"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </motion.div>
        ))}
      </div>
      <div className="border-t border-white/[0.03]" />
    </div>
  );
}
