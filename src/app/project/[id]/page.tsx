"use client";

import { use, useEffect, useState, useRef } from "react";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { isFirebaseConfigured } from "@/lib/firebase";
import projectsData from "@/data/projects.json";
import {
  EchoEffect, OtondoEffect, AlphaEffect, GoPointEffect,
  BoardroomEffect, DotStudioEffect, ThreeDEffect, ZazzEffect,
  LifeoneyEffect, WoongsCo, PortfolioEffect, DefaultEffect,
} from "@/components/themes/ThemeEffects";

const themeConfig: Record<string, {
  bg: string;
  accent: string;
  font: string;
  heroStyle: string;
  cardBg: string;
  titleEffect: string;
}> = {
  echo: {
    bg: "from-[#020f08] via-[#041a10] to-[#010a05]",
    accent: "text-emerald-400",
    font: "font-mono",
    heroStyle: "tracking-[0.2em] uppercase",
    cardBg: "bg-emerald-950/20 border-emerald-500/10",
    titleEffect: "drop-shadow-[0_0_25px_rgba(0,255,136,0.3)]",
  },
  otondo: {
    bg: "from-[#120c02] via-[#1a0e04] to-[#0a0602]",
    accent: "text-amber-200",
    font: "font-serif",
    heroStyle: "italic tracking-wide",
    cardBg: "bg-amber-950/20 border-amber-500/10",
    titleEffect: "drop-shadow-[0_0_25px_rgba(255,215,0,0.2)]",
  },
  alpha: {
    bg: "from-[#120202] via-[#1a0404] to-[#0a0202]",
    accent: "text-red-400",
    font: "font-mono",
    heroStyle: "tracking-tight font-black",
    cardBg: "bg-red-950/20 border-red-500/10",
    titleEffect: "drop-shadow-[0_0_20px_rgba(255,23,68,0.3)]",
  },
  gopoint: {
    bg: "from-[#040a02] via-[#081404] to-[#020602]",
    accent: "text-lime-400",
    font: "font-sans",
    heroStyle: "font-black",
    cardBg: "bg-lime-950/20 border-lime-500/10",
    titleEffect: "drop-shadow-[0_0_20px_rgba(118,255,3,0.3)]",
  },
  boardroom: {
    bg: "from-[#020410] via-[#04081a] to-[#020308]",
    accent: "text-blue-400",
    font: "font-sans",
    heroStyle: "font-light tracking-wider",
    cardBg: "bg-blue-950/20 border-blue-500/10",
    titleEffect: "",
  },
  dotstudio: {
    bg: "from-[#021010] via-[#041a1a] to-[#020a0a]",
    accent: "text-cyan-300",
    font: "font-sans",
    heroStyle: "font-medium",
    cardBg: "bg-cyan-950/20 border-cyan-500/10",
    titleEffect: "",
  },
  zazz: {
    bg: "from-[#120a00] via-[#1a1000] to-[#0a0800]",
    accent: "text-amber-400",
    font: "font-sans",
    heroStyle: "font-black tracking-tighter",
    cardBg: "bg-amber-950/20 border-amber-500/10",
    titleEffect: "",
  },
  lifeoney: {
    bg: "from-[#08041a] via-[#0c061a] to-[#04020a]",
    accent: "text-purple-400",
    font: "font-sans",
    heroStyle: "font-bold",
    cardBg: "bg-purple-950/20 border-purple-500/10",
    titleEffect: "",
  },
  woongs: {
    bg: "from-[#0a0804] via-[#120e08] to-[#060402]",
    accent: "text-yellow-400",
    font: "font-sans",
    heroStyle: "font-bold",
    cardBg: "bg-yellow-950/20 border-yellow-500/10",
    titleEffect: "drop-shadow-[0_0_20px_rgba(255,215,0,0.15)]",
  },
  portfolio: {
    bg: "from-[#020a0e] via-[#04101a] to-[#020608]",
    accent: "text-cyan-400",
    font: "font-sans",
    heroStyle: "font-light tracking-[0.15em]",
    cardBg: "bg-cyan-950/20 border-cyan-500/10",
    titleEffect: "",
  },
  "3d": {
    bg: "from-[#0a0604] via-[#120a06] to-[#060402]",
    accent: "text-orange-400",
    font: "font-mono",
    heroStyle: "font-bold tracking-wide",
    cardBg: "bg-orange-950/20 border-orange-500/10",
    titleEffect: "",
  },
  default: {
    bg: "from-[#06060c] via-[#08081a] to-[#04040a]",
    accent: "text-white/80",
    font: "font-sans",
    heroStyle: "",
    cardBg: "bg-white/[0.02] border-white/5",
    titleEffect: "",
  },
};

const typeLabels: Record<string, { label: string; action: string; icon: string }> = {
  web: { label: "웹 프로젝트", action: "라이브 데모 보기", icon: "🌐" },
  game: { label: "게임", action: "플레이하기", icon: "🎮" },
  app: { label: "앱", action: "다운로드", icon: "📱" },
  tool: { label: "도구", action: "다운로드", icon: "🔧" },
  "3d": { label: "3D 작품", action: "갤러리 보기", icon: "🎨" },
  data: { label: "데이터", action: "자세히 보기", icon: "📊" },
  management: { label: "관리 시스템", action: "자세히 보기", icon: "⚙️" },
};

const themeEffects: Record<string, React.FC> = {
  echo: EchoEffect,
  otondo: OtondoEffect,
  alpha: AlphaEffect,
  gopoint: GoPointEffect,
  boardroom: BoardroomEffect,
  dotstudio: DotStudioEffect,
  zazz: ZazzEffect,
  lifeoney: LifeoneyEffect,
  woongs: WoongsCo,
  portfolio: PortfolioEffect,
  "3d": ThreeDEffect,
};

export default function ProjectDivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isAdmin } = useAuth();
  const demoMode = !isFirebaseConfigured;
  const project = projectsData.projects.find((p) => p.id === id);

  // Mouse parallax
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 50, damping: 20 });
  const parallaxX = useTransform(springX, [0, 1], [-15, 15]);
  const parallaxY = useTransform(springY, [0, 1], [-10, 10]);

  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      mouseX.set(e.clientX / window.innerWidth);
      mouseY.set(e.clientY / window.innerHeight);
    };
    window.addEventListener("mousemove", handleMouse);
    return () => window.removeEventListener("mousemove", handleMouse);
  }, [mouseX, mouseY]);

  // Scroll progress
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!project) {
    return (
      <div className="pt-14 min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-white/30"
        >
          프로젝트를 찾을 수 없습니다.
        </motion.div>
      </div>
    );
  }

  const theme = themeConfig[project.theme] || themeConfig.default;
  const typeInfo = typeLabels[project.type] || typeLabels.web;
  const ThemeEffect = themeEffects[project.theme] || (() => <DefaultEffect color={project.color} />);

  return (
    <div className={`pt-14 min-h-screen bg-gradient-to-b ${theme.bg} relative`}>
      {/* Theme-specific background effect */}
      <ThemeEffect />

      {/* Back */}
      <motion.div
        className="fixed top-5 left-6 z-30 mix-blend-difference"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <Link
          href="/"
          className="link-grow text-[11px] font-mono tracking-[0.2em] uppercase text-white/40 hover:text-white/80 transition-colors"
        >
          ← Back
        </Link>
      </motion.div>

      {/* HERO SECTION — full viewport, immersive */}
      <div className="relative min-h-[80vh] flex items-center overflow-hidden">
        <motion.div
          style={{ x: parallaxX, y: parallaxY }}
          className="max-w-5xl mx-auto px-6 relative z-10"
        >
          {/* Type label */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="mb-6"
          >
            <span className="text-[10px] font-mono tracking-[0.3em] uppercase" style={{ color: `${project.color}80` }}>
              {typeInfo.label}
            </span>
          </motion.div>

          {/* Title */}
          <motion.h1
            className={`text-5xl md:text-7xl font-bold ${theme.accent} ${theme.font} ${theme.heroStyle} ${theme.titleEffect} leading-none`}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            {project.name}
          </motion.h1>

          {/* Description with typewriter feel */}
          <motion.p
            className="text-white/35 text-lg md:text-xl mt-6 max-w-2xl leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            {project.description}
          </motion.p>

          {/* Meta line */}
          <motion.div
            className="flex items-center gap-4 mt-8 text-[11px] font-mono text-white/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            {project.language && <span>{project.language}</span>}
            <span className="text-white/8">·</span>
            <span className="tracking-wider uppercase">{project.category}</span>
          </motion.div>

          {/* Actions — text links, not pill buttons */}
          <motion.div
            className="flex items-center gap-8 mt-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
          >
            <button
              className="text-sm font-medium transition-colors link-grow"
              style={{ color: project.color }}
            >
              {typeInfo.action}
            </button>

            {project.github && (
              <a
                href={`https://github.com/${project.github}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white/30 hover:text-white/60 transition-colors link-grow"
              >
                Source
              </a>
            )}

            {(isAdmin || demoMode) && (
              <Link
                href="/admin/plans"
                className="text-sm text-[#e8c547]/40 hover:text-[#e8c547]/70 transition-colors link-grow"
              >
                Plans
              </Link>
            )}
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0 }}
          animate={{ opacity: scrollY > 50 ? 0 : 0.3 }}
          transition={{ delay: 2 }}
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-xs text-white/30 flex flex-col items-center gap-2"
          >
            <span>스크롤</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7 7m0 0l-7-7" />
            </svg>
          </motion.div>
        </motion.div>
      </div>

      {/* Content — GitHub data */}
      <ProjectContent github={project.github} description={project.description} color={project.color} />
    </div>
  );
}

// ─── GitHub-powered content section ───

function ProjectContent({ github, description, color }: { github: string | null; description: string; color: string }) {
  const [data, setData] = useState<{
    info: { stars: number; forks: number; updatedAt: string; topics: string[] } | null;
    commits: { sha: string; message: string; author: string; date: string }[];
    readme: string | null;
  }>({ info: null, commits: [], readme: null });

  useEffect(() => {
    if (!github) return;
    fetch(`/api/github?repo=${github}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [github]);

  return (
    <div className="max-w-5xl mx-auto px-6 pb-24 relative z-10">
      <div className="border-t border-white/[0.04] pt-8">
        <div className="grid grid-cols-12 gap-y-8">
          {/* About */}
          <div className="col-span-12 md:col-span-3">
            <span className="text-[10px] font-mono text-white/15 tracking-[0.2em] uppercase">About</span>
          </div>
          <div className="col-span-12 md:col-span-9">
            <p className="text-sm text-white/35 leading-relaxed max-w-lg">{description}</p>
            {data.readme && (
              <pre className="text-xs text-white/20 leading-relaxed mt-4 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono">
                {data.readme.slice(0, 1500)}
              </pre>
            )}
            {data.info?.topics && data.info.topics.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {data.info.topics.map((t) => (
                  <span key={t} className="text-[9px] font-mono text-white/15 border border-white/[0.05] px-2 py-0.5">{t}</span>
                ))}
              </div>
            )}
          </div>

          <div className="col-span-12 border-t border-white/[0.03]" />

          {/* Activity */}
          <div className="col-span-12 md:col-span-3">
            <span className="text-[10px] font-mono text-white/15 tracking-[0.2em] uppercase">Activity</span>
          </div>
          <div className="col-span-12 md:col-span-9">
            {data.commits.length > 0 ? (
              <div className="space-y-3">
                {data.commits.map((c) => (
                  <div key={c.sha} className="flex items-baseline gap-3">
                    <span className="text-[10px] font-mono text-white/15 shrink-0" style={{ color: `${color}50` }}>{c.sha}</span>
                    <span className="text-xs text-white/30 truncate">{c.message}</span>
                    <span className="text-[9px] font-mono text-white/10 shrink-0">
                      {new Date(c.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/10 font-mono">
                {github ? "Loading commits..." : "로컬 프로젝트 — GitHub 연동 없음"}
              </p>
            )}

            {data.info && (
              <div className="flex gap-6 mt-6 text-[10px] font-mono text-white/15">
                <span>★ {data.info.stars}</span>
                <span>⑂ {data.info.forks}</span>
                <span>Updated {new Date(data.info.updatedAt).toLocaleDateString("ko-KR")}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
