"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import projectsData from "@/data/projects.json";

// Mock plan data — will be replaced with Firestore data
const mockPlans: Record<string, { progress: number; done: string[]; todo: string[]; issues: string[]; needCheck: string[] }> = {
  "echo-game": {
    progress: 95,
    done: ["GDD v3.0", "NPC 엔진 (Gemini API)", "클라이언트 기본 (Phaser 3)", "서버 기본 (Express)", "마이크로 기획 (NPC 성격, 비밀/단서)"],
    todo: ["사운드 시스템", "세이브/로드", "모바일 대응", "튜토리얼 시스템"],
    issues: ["Rate Limit 병목 (무료 티어)", "메모리 최적화 필요", "NPC 대화 할루시네이션"],
    needCheck: ["멀티플레이 구현 여부", "Steam 심사 기준", "웹/데스크탑 동시 배포"],
  },
  "woongs-company": {
    progress: 100,
    done: ["26명 팀원 프로필", "9개 팀 조직도", "회의록 자동 생성", "이슈 슬롯 시스템", "업무 보드"],
    todo: [],
    issues: [],
    needCheck: ["팀원 추가/삭제 자동화"],
  },
};

export default function PlansPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">
        <span className="text-yellow-400">Project</span>{" "}
        <span className="text-white/60">Plans</span>
      </h1>
      <p className="text-white/30 text-sm mt-1">프로젝트별 기획서 및 진행 현황</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
        {projectsData.projects.map((project, i) => {
          const plan = mockPlans[project.id];
          const progress = plan?.progress || 0;

          return (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                href={`/project/${project.id}`}
                className="group block bg-white/[0.02] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-all"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                      {project.name}
                    </div>
                    <div className="text-[10px] text-white/30 mt-0.5">{project.category} · {project.language || "N/A"}</div>
                  </div>
                  <div
                    className="text-lg font-bold"
                    style={{ color: project.color }}
                  >
                    {progress}%
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${progress}%`,
                      background: project.color,
                      opacity: 0.6,
                    }}
                  />
                </div>

                {/* Quick stats */}
                {plan && (
                  <div className="flex gap-4 mt-3 text-[10px]">
                    <span className="text-emerald-400/60">✅ {plan.done.length}</span>
                    <span className="text-red-400/60">🔴 {plan.todo.length}</span>
                    <span className="text-amber-400/60">⚠️ {plan.issues.length}</span>
                    <span className="text-blue-400/60">❓ {plan.needCheck.length}</span>
                  </div>
                )}

                {!plan && (
                  <div className="text-[10px] text-white/20 mt-3">기획서 미등록</div>
                )}
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
