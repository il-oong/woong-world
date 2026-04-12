"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import projectsData from "@/data/projects.json";

/**
 * Plan snapshots. `progress` is NOT stored — it is derived from the
 * done/todo checklists at render time so the displayed percentage is always
 * self-consistent with the underlying items. See `computeProgress` below.
 */
interface Plan {
  done: string[];
  todo: string[];
  issues: string[];
  needCheck: string[];
}

const mockPlans: Record<string, Plan> = {
  "echo-game": {
    done: ["GDD v3.0", "NPC 엔진 골격 (Gemini API)", "클라이언트 설정 (Phaser 3)", "서버 골격 (Express)", "마이크로 기획 (NPC 성격, 비밀/단서)", "Steam 출시 계획서"],
    todo: ["Phaser 6개 씬 구현", "서버 Gemini 연동", "나비효과 시스템", "세이브/로드", "에셋 제작", "Electron 래퍼"],
    issues: ["Rate Limit 병목 (무료 티어)", "씬 파일 전혀 없음", "에셋 빈 폴더만 존재"],
    needCheck: ["Steam 심사 기준", "웹/데스크탑 동시 배포", "빌드 시스템 선택 (Vite)"],
  },
  "woongs-company": {
    done: ["26명 팀원 프로필", "9개 팀 조직도", "회의록 자동 생성", "이슈 슬롯 시스템", "업무 보드"],
    todo: [],
    issues: [],
    needCheck: ["팀원 추가/삭제 자동화"],
  },
  "otondo-fur-crm": {
    done: ["고객 관리 UI", "CRM 대시보드", "고객 데이터 모델"],
    todo: ["매출 분석 리포트", "이메일 자동화"],
    issues: ["모바일 반응형 미완"],
    needCheck: ["실제 고객 데이터 연동"],
  },
  "portfolio-html": {
    done: ["이력서 레이아웃", "프로젝트 갤러리", "반응형 디자인", "애니메이션"],
    todo: ["최신 프로젝트 추가"],
    issues: [],
    needCheck: ["도메인 연결"],
  },
  "lifeoney": {
    done: ["Flutter 프로젝트 초기화", "금융 데이터 모델"],
    todo: ["지출 추적 UI", "예산 설정", "차트 시각화", "알림 시스템"],
    issues: ["Dart 의존성 버전 충돌"],
    needCheck: ["금융 API 선정", "iOS/Android 배포"],
  },
  "nup-modeling": {
    done: ["데이터 모델링 엔진", "Python 분석 파이프라인"],
    todo: ["웹 UI", "시각화 대시보드"],
    issues: [],
    needCheck: ["대용량 데이터 성능"],
  },
  "boardroom-ai": {
    done: ["멀티 에이전트 프레임워크", "회의 시뮬레이션 UI"],
    todo: ["에이전트 커스텀 설정", "회의록 자동 생성", "실시간 스트리밍"],
    issues: ["API 비용 최적화 필요"],
    needCheck: ["에이전트 수 제한", "Gemini vs Claude 선택"],
  },
  "zazz": {
    done: ["프로젝트 구조 설정", "기본 UI 레이아웃"],
    todo: ["크리에이티브 에디터", "공유 기능", "갤러리"],
    issues: [],
    needCheck: ["디자인 방향성"],
  },
  "interior-crm": {
    done: ["프로젝트 초기화", "고객 모델"],
    todo: ["견적서 생성", "시공 스케줄", "사진 관리", "리포트"],
    issues: ["기술 스택 미확정"],
    needCheck: ["Otondo CRM과 코드 공유 가능 여부"],
  },
  "alpha-investment": {
    done: ["JKP 페르소나 시스템", "7 AI 에이전트 설계", "투자 분석 대시보드", "Gemini 연동"],
    todo: ["실시간 시세 연동", "포트폴리오 최적화"],
    issues: ["KIS API 인증 복잡"],
    needCheck: ["금융 규제 준수", "투자 조언 면책"],
  },
  "alpha": {
    done: ["Gemini 2.5 Flash 연동", "KIS API 기본 연결"],
    todo: ["자동 매매 로직", "리스크 관리", "백테스트"],
    issues: ["KIS API Rate Limit"],
    needCheck: ["자동매매 법적 검토"],
  },
  "lifr-korea": {
    done: ["웹 프레임워크 설정", "기본 페이지"],
    todo: ["핵심 기능 구현", "결제 시스템", "관리자 페이지"],
    issues: [],
    needCheck: ["사업자 등록 여부"],
  },
  "dot-studio": {
    done: ["캔버스 에디터 기초", "AI 오케스트레이션 설계", "Figma 스타일 UI"],
    todo: ["노드 연결 시스템", "AI 워크플로우 실행", "내보내기"],
    issues: ["ReactFlow 성능 최적화"],
    needCheck: ["프로덕트 포지셔닝"],
  },
  "gopoint": {
    done: ["Windows 오버레이", "마우스 트레일 렌더링", "설정 UI", "시스템 트레이"],
    todo: ["커스텀 트레일 효과"],
    issues: [],
    needCheck: ["Windows 11 호환성"],
  },
  "steam-echo": {
    done: ["Steam 스토어 페이지 초안", "Steamworks 계정"],
    todo: ["스토어 이미지 제작", "트레일러 영상", "Steam 빌드 업로드", "심사 제출"],
    issues: ["게임 빌드 미완성"],
    needCheck: ["연령 등급", "가격 책정", "출시 일정"],
  },
  "code-project": {
    done: ["프로젝트 구조"],
    todo: ["핵심 기능 개발", "테스트", "문서화"],
    issues: [],
    needCheck: ["프로젝트 범위 확정"],
  },
  "ilung-3d": {
    done: ["3D 모델링 기초", "렌더링 파이프라인"],
    todo: ["인터랙티브 뷰어", "애니메이션", "웹 배포"],
    issues: [],
    needCheck: ["Three.js vs Babylon.js"],
  },
  "iloong": {
    done: ["3D 에셋 일부"],
    todo: ["캐릭터 모델링", "환경 설정", "웹 뷰어"],
    issues: [],
    needCheck: ["ilung-3D와 통합 여부"],
  },
};

/**
 * Real progress = done / (done + todo), rounded. When there are no tracked
 * items we fall back to 0 rather than inventing a number.
 */
function computeProgress(plan: Plan | undefined): number {
  if (!plan) return 0;
  const total = plan.done.length + plan.todo.length;
  if (total === 0) return 0;
  return Math.round((plan.done.length / total) * 100);
}

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
          const progress = computeProgress(plan);

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
