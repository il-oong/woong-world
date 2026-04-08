"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { isFirebaseConfigured } from "@/lib/firebase";
import projectsData from "@/data/projects.json";
import PixelIcon from "@/components/shared/PixelIcon";

const projects = projectsData.projects;

export default function HomePage() {
  const { isAdmin } = useAuth();
  const demoMode = !isFirebaseConfigured;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.08], [1, 0]);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [time, setTime] = useState("");

  // Clock
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Generate positions — collision-free placement
  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const margin = 70; // min distance between nodes
    const padX = 80;
    const padTop = 160; // avoid title area
    const padBottom = 80;
    const placed: { x: number; y: number }[] = [];
    const pos: Record<string, { x: number; y: number }> = {};

    for (const p of projects) {
      let bestX = 0, bestY = 0, found = false;

      // Try up to 200 random positions, pick one with no overlap
      for (let attempt = 0; attempt < 200; attempt++) {
        const cx = padX + Math.random() * (w - padX * 2);
        const cy = padTop + Math.random() * (h - padTop - padBottom);

        const tooClose = placed.some(
          (q) => Math.hypot(q.x - cx, q.y - cy) < margin
        );

        if (!tooClose) {
          bestX = cx;
          bestY = cy;
          found = true;
          break;
        }
      }

      if (!found) {
        // Fallback: grid
        const idx = placed.length;
        const cols = Math.ceil(Math.sqrt(projects.length));
        const cellW = (w - padX * 2) / cols;
        const cellH = (h - padTop - padBottom) / Math.ceil(projects.length / cols);
        bestX = padX + (idx % cols) * cellW + cellW / 2 + (Math.random() - 0.5) * 20;
        bestY = padTop + Math.floor(idx / cols) * cellH + cellH / 2 + (Math.random() - 0.5) * 20;
      }

      placed.push({ x: bestX, y: bestY });
      pos[p.id] = { x: bestX, y: bestY };
    }

    setPositions(pos);
  }, []);

  // Interactive canvas — connection lines
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    function draw() {
      if (!canvas || !ctx) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const entries = Object.entries(positions);
      if (entries.length === 0) { animId = requestAnimationFrame(draw); return; }

      // Draw connections to hovered node
      if (hoveredId && positions[hoveredId]) {
        const hp = positions[hoveredId];
        for (const [id, pos] of entries) {
          if (id === hoveredId) continue;
          const dist = Math.hypot(pos.x - hp.x, pos.y - hp.y);
          if (dist < 350) {
            const alpha = (1 - dist / 350) * 0.15;
            ctx.beginPath();
            ctx.moveTo(hp.x, hp.y);
            ctx.lineTo(pos.x, pos.y);
            ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // Mouse proximity lines
      for (const [id, pos] of entries) {
        const dist = Math.hypot(pos.x - mousePos.x, pos.y - mousePos.y);
        if (dist < 200) {
          const alpha = (1 - dist / 200) * 0.06;
          ctx.beginPath();
          ctx.moveTo(mousePos.x, mousePos.y);
          ctx.lineTo(pos.x, pos.y);
          ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      animId = requestAnimationFrame(draw);
    }

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [positions, hoveredId, mousePos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const hoveredProject = projects.find(p => p.id === hoveredId);

  return (
    <div ref={containerRef} className="min-h-[200vh] bg-[#08080c]" onMouseMove={handleMouseMove}>

      {/* ─── CONSTELLATION SECTION ─── */}
      <section className="h-screen relative overflow-hidden sticky top-0">
        {/* Canvas for connection lines */}
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-10" />

        {/* Project nodes */}
        {projects.map((project) => {
          const pos = positions[project.id];
          if (!pos) return null;
          const isHovered = hoveredId === project.id;

          return (
            <motion.div
              key={project.id}
              className="absolute z-20"
              style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -50%)" }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.random() * 0.8 + 0.3, type: "spring", damping: 15 }}
            >
              <Link
                href={`/project/${project.id}`}
                className="group block relative"
                onMouseEnter={() => setHoveredId(project.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Glow behind */}
                <div
                  className="absolute inset-0 rounded-full blur-xl transition-opacity duration-500"
                  style={{
                    background: project.color,
                    opacity: isHovered ? 0.15 : 0,
                    transform: "scale(3)",
                  }}
                />

                {/* Eye icon — slit when idle, opens on hover */}
                <div className={`relative transition-all duration-300 ${isHovered ? "scale-150" : "scale-100"}`}>
                  <PixelIcon
                    type="project"
                    id={project.type}
                    size={isHovered ? 36 : 24}
                    color={project.color}
                  />
                </div>

                {/* Name always visible — faded, brightens on hover */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap text-center">
                  <div className={`text-[10px] transition-all duration-300 ${
                    isHovered ? "text-white/80 tracking-wide" : "text-white/15"
                  }`}>
                    {project.name}
                  </div>
                  <AnimatePresence>
                    {isHovered && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-[8px] font-mono text-white/20 mt-0.5"
                      >
                        {project.category}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Link>
            </motion.div>
          );
        })}

        {/* Title overlay — top left */}
        <motion.div style={{ opacity: heroOpacity }} className="absolute top-14 left-6 z-30 pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            <h1 className="text-[clamp(2.5rem,8vw,5rem)] font-bold leading-[0.9] tracking-[-0.03em] text-white/90">
              Woong
            </h1>
            <h1 className="text-[clamp(2.5rem,8vw,5rem)] font-bold leading-[0.9] tracking-[-0.03em] text-stroke text-white/15">
              World
            </h1>
          </motion.div>
        </motion.div>

        {/* Bottom info bar */}
        <div className="absolute bottom-6 left-6 right-6 z-30 flex items-end justify-between pointer-events-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="text-[10px] font-mono text-white/15 tracking-wider"
          >
            {time} KST — {projects.length} WORLDS
          </motion.div>

          {/* Hovered project info — bottom center */}
          <AnimatePresence mode="wait">
            {hoveredProject && (
              <motion.div
                key={hoveredProject.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="text-center"
              >
                <div className="text-sm text-white/60">{hoveredProject.name}</div>
                <div className="text-[10px] font-mono text-white/20 mt-0.5">{hoveredProject.description}</div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
            className="flex gap-6 pointer-events-auto"
          >
            {(isAdmin || demoMode) && (
              <Link href="/admin" className="text-[10px] font-mono tracking-[0.2em] text-white/10 hover:text-[#e8c547]/50 transition-colors uppercase">
                System
              </Link>
            )}
          </motion.div>
        </div>
      </section>

      {/* ─── SCROLL SECTION: Index ─── */}
      <section className="relative z-40 bg-[#08080c] px-6 pt-20 pb-16 max-w-[1400px] mx-auto">
        <div className="flex items-baseline justify-between border-t border-white/[0.06] pt-6 mb-10">
          <span className="text-[11px] font-mono text-white/20 tracking-[0.3em] uppercase">All Projects</span>
          <span className="text-[11px] font-mono text-white/10">{projects.length}</span>
        </div>

        {/* Compact grid — not a boring list */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-px bg-white/[0.03]">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/project/${project.id}`}
              className="group bg-[#08080c] p-5 hover:bg-white/[0.02] transition-colors relative overflow-hidden"
            >
              {/* Color accent line at top */}
              <div
                className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: project.color }}
              />

              <div className="flex items-start gap-3">
                <div className="opacity-40 group-hover:opacity-100 transition-opacity mt-0.5">
                  <PixelIcon type="project" id={project.type} size={16} color={project.color} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-white/60 group-hover:text-white/90 transition-colors truncate font-medium">
                    {project.name}
                  </div>
                  <div className="text-[9px] font-mono text-white/15 mt-1 uppercase tracking-wider">
                    {project.language || project.category}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.04] mt-16 pt-6 flex items-center justify-between">
          <span className="text-[10px] font-mono text-white/10">2026 — Kim Won Woong</span>
          <span className="text-[10px] font-mono text-white/10">Seoul, KR</span>
        </div>
      </section>
    </div>
  );
}
