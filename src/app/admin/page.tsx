"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import crewData from "@/data/crew.json";
import projectsData from "@/data/projects.json";
import PixelIcon from "@/components/shared/PixelIcon";

const leaders = crewData.filter((m) => m.isLeader || m.tier === 1).slice(0, 6);

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return "야간 근무 중이시군요";
  if (h < 12) return "좋은 아침입니다";
  if (h < 18) return "오후입니다";
  return "저녁입니다";
}

const reports = [
  "마케팅 캠페인 분석 완료",
  "기획팀 주간 리뷰 대기",
  "ECHO 클라이언트 업데이트 중",
  "디자인 시스템 v2 준비",
  "영업 파이프라인 리드 3건",
  "프론트엔드 최적화 진행",
];

export default function AdminDashboard() {
  const { user } = useAuth();
  const [phase, setPhase] = useState(0); // 0: greeting, 1: reports, 2: dashboard
  const [reportIndex, setReportIndex] = useState(0);

  useEffect(() => {
    // Phase 0 → 1 after 1.5s
    const t1 = setTimeout(() => setPhase(1), 1500);
    return () => clearTimeout(t1);
  }, []);

  useEffect(() => {
    if (phase !== 1) return;
    if (reportIndex >= leaders.length) {
      const t = setTimeout(() => setPhase(2), 800);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setReportIndex((i) => i + 1), 500);
    return () => clearTimeout(t);
  }, [phase, reportIndex]);

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 min-h-[80vh]">
      {/* Greeting + Reports overlay */}
      <AnimatePresence>
        {phase < 2 && (
          <motion.div
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.6 }}
            className="min-h-[60vh] flex flex-col justify-center"
          >
            {phase === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-2xl text-white/50 font-light"
              >
                {getGreeting()}, <span className="text-white/80">{user?.displayName || "사령관"}</span>
              </motion.div>
            )}

            {phase === 1 && (
              <div className="space-y-3">
                <div className="text-[10px] font-mono text-white/15 tracking-[0.3em] uppercase mb-6">
                  Status Report
                </div>
                {leaders.slice(0, reportIndex).map((leader, i) => (
                  <motion.div
                    key={leader.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-baseline gap-4"
                  >
                    <span className="text-xs font-mono text-white/20 w-24 shrink-0">{leader.name.split(" (")[0]}</span>
                    <span className="text-sm text-white/40">{reports[i]}</span>
                  </motion.div>
                ))}
                {reportIndex < leaders.length && (
                  <div className="text-[10px] font-mono text-white/10 animate-pulse">receiving...</div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dashboard */}
      {phase === 2 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          {/* Header — minimal */}
          <div className="flex items-baseline justify-between border-b border-white/[0.06] pb-4 mb-12">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white/90">System</h1>
              <p className="text-xs font-mono text-white/20 mt-1 tracking-wider">
                {projectsData.projects.length} projects / {crewData.length} crew
              </p>
            </div>
            <div className="text-[10px] font-mono text-[#e8c547]/40">COMMANDER</div>
          </div>

          {/* Navigation grid — asymmetric */}
          <div className="grid grid-cols-12 gap-4 md:gap-6">
            {/* Crew — large */}
            <Link
              href="/admin/crew"
              className="col-span-12 md:col-span-7 group border border-white/[0.04] hover:border-white/[0.1] transition-all p-8 relative overflow-hidden"
            >
              <div className="relative z-10">
                <div className="text-[10px] font-mono text-white/15 tracking-[0.3em] uppercase mb-4">Crew</div>
                <div className="text-4xl font-bold text-white/80 group-hover:text-white transition-colors">{crewData.length}</div>
                <div className="text-sm text-white/25 mt-2">AI 팀원</div>
                <div className="flex gap-1 mt-4">
                  {["ceo", "marketing", "planning", "dev", "design", "game"].map((tid) => (
                    <div key={tid} className="opacity-40 group-hover:opacity-80 transition-opacity">
                      <PixelIcon type="crew" id={tid} size={24} speed={1500} />
                    </div>
                  ))}
                  <span className="text-[10px] text-white/10 self-center ml-1 font-mono">+{crewData.length - 6}</span>
                </div>
              </div>
              <div className="absolute right-8 top-8 text-[120px] font-bold text-white/[0.015] leading-none">C</div>
            </Link>

            {/* Plans */}
            <Link
              href="/admin/plans"
              className="col-span-6 md:col-span-5 group border border-white/[0.04] hover:border-white/[0.1] transition-all p-8"
            >
              <div className="text-[10px] font-mono text-white/15 tracking-[0.3em] uppercase mb-4">Plans</div>
              <div className="text-4xl font-bold text-white/80 group-hover:text-white transition-colors">{projectsData.projects.length}</div>
              <div className="text-sm text-white/25 mt-2">프로젝트 기획서</div>
            </Link>

            {/* Workspace */}
            <Link
              href="/admin/workspace"
              className="col-span-6 md:col-span-4 group border border-white/[0.04] hover:border-white/[0.1] transition-all p-8"
            >
              <div className="text-[10px] font-mono text-white/15 tracking-[0.3em] uppercase mb-4">Dev Lab</div>
              <div className="text-sm text-white/30 mt-2 font-mono group-hover:text-white/50 transition-colors">
                $ agent --run
              </div>
              <div className="text-[10px] text-white/10 mt-3">에이전트 개발 환경</div>
            </Link>

            {/* Missions */}
            <Link
              href="/admin/missions"
              className="col-span-12 md:col-span-4 group border border-white/[0.04] hover:border-white/[0.1] transition-all p-8"
            >
              <div className="text-[10px] font-mono text-white/15 tracking-[0.3em] uppercase mb-4">Missions</div>
              <div className="flex items-baseline gap-6 mt-2">
                <div>
                  <div className="text-xs text-white/15 font-mono">09:00</div>
                  <div className="text-xs text-white/30">주간회의</div>
                </div>
                <div>
                  <div className="text-xs text-white/15 font-mono">19:00</div>
                  <div className="text-xs text-white/30">야간회의</div>
                </div>
              </div>
            </Link>

            {/* Back to world */}
            <Link
              href="/"
              className="col-span-12 md:col-span-4 group border border-white/[0.04] hover:border-white/[0.1] transition-all p-8 flex items-center justify-between"
            >
              <div>
                <div className="text-[10px] font-mono text-white/15 tracking-[0.3em] uppercase">World</div>
                <div className="text-xs text-white/25 mt-1">퍼블릭 뷰로 돌아가기</div>
              </div>
              <svg className="w-4 h-4 text-white/15 group-hover:text-white/40 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
