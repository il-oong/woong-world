"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Single animated eye. Closed by default — opens on hover.
 * Each role has unique iris color + pupil behavior.
 */

type EyeStyle = {
  shape: "round" | "narrow" | "wide" | "sharp" | "soft";
  irisColor: string;
  pupilBehavior: "calm" | "darting" | "focused" | "sleepy" | "intense";
  blinkRate: number;
};

const EYE_STYLES: Record<string, EyeStyle> = {
  ceo:       { shape: "wide",   irisColor: "#e8c547", pupilBehavior: "focused",  blinkRate: 4000 },
  marketing: { shape: "round",  irisColor: "#fb923c", pupilBehavior: "darting",  blinkRate: 3000 },
  planning:  { shape: "soft",   irisColor: "#5eead4", pupilBehavior: "calm",     blinkRate: 5000 },
  sales:     { shape: "sharp",  irisColor: "#4ade80", pupilBehavior: "intense",  blinkRate: 3500 },
  dev:       { shape: "narrow", irisColor: "#a78bfa", pupilBehavior: "focused",  blinkRate: 6000 },
  design:    { shape: "round",  irisColor: "#f472b6", pupilBehavior: "calm",     blinkRate: 4500 },
  game:      { shape: "wide",   irisColor: "#4ade80", pupilBehavior: "darting",  blinkRate: 2500 },
  analysis:  { shape: "narrow", irisColor: "#fbbf24", pupilBehavior: "focused",  blinkRate: 5500 },
  codedev:   { shape: "narrow", irisColor: "#60a5fa", pupilBehavior: "intense",  blinkRate: 7000 },
  webdesign: { shape: "soft",   irisColor: "#22d3ee", pupilBehavior: "calm",     blinkRate: 4000 },
};

const TYPE_MAP: Record<string, string> = {
  game: "game", web: "webdesign", app: "codedev", tool: "dev",
  "3d": "design", management: "ceo", data: "analysis",
};

interface PixelIconProps {
  type: "crew" | "project";
  id: string;
  size?: number;
  className?: string;
  color?: string;
}

export default function PixelIcon({
  type,
  id,
  size = 48,
  className = "",
  color,
}: PixelIconProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [hovered, setHovered] = useState(false);
  const hoveredRef = useRef(false);

  // Keep ref in sync for animation loop
  useEffect(() => { hoveredRef.current = hovered; }, [hovered]);

  const stateRef = useRef({
    openAmount: 0, // 0 = closed, 1 = fully open
    pupilX: 0,
    pupilY: 0,
    targetX: 0,
    targetY: 0,
    blinkTimer: 0,
    blinkPhase: 0 as number,
    lookTimer: 0,
  });

  const getStyle = useCallback((): EyeStyle => {
    const key = type === "crew" ? id : (TYPE_MAP[id] || "dev");
    return EYE_STYLES[key] || EYE_STYLES.dev;
  }, [type, id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = size;
    canvas.height = size;

    const style = getStyle();
    const irisColor = color || style.irisColor;
    const state = stateRef.current;
    let lastTime = 0;

    state.lookTimer = Math.random() * 2000;

    const lookInterval = style.pupilBehavior === "darting" ? 1200 :
                         style.pupilBehavior === "calm" ? 3500 :
                         style.pupilBehavior === "focused" ? 5000 : 2000;

    function pickTarget() {
      const range = style.pupilBehavior === "darting" ? 1.5 :
                    style.pupilBehavior === "focused" ? 0.5 : 0.8;
      state.targetX = (Math.random() - 0.5) * range;
      state.targetY = (Math.random() - 0.5) * range * 0.5;
    }
    pickTarget();

    function draw(time: number) {
      if (!ctx || !canvas) return;
      const dt = lastTime ? time - lastTime : 16;
      lastTime = time;

      const isHovered = hoveredRef.current;

      // Smooth open/close
      const targetOpen = isHovered ? 1 : 0;
      state.openAmount += (targetOpen - state.openAmount) * (isHovered ? 0.12 : 0.08);
      if (Math.abs(state.openAmount - targetOpen) < 0.005) state.openAmount = targetOpen;

      // Update look direction (only when open)
      if (state.openAmount > 0.1) {
        state.lookTimer -= dt;
        if (state.lookTimer <= 0) {
          pickTarget();
          state.lookTimer = lookInterval + (Math.random() - 0.5) * 1000;
        }

        // Blink occasionally when open
        state.blinkTimer -= dt;
        if (state.blinkTimer <= 0 && state.blinkPhase === 0) {
          state.blinkPhase = 1;
          state.blinkTimer = 70;
        } else if (state.blinkPhase === 1 && state.blinkTimer <= 0) {
          state.blinkPhase = 2;
          state.blinkTimer = 50;
        } else if (state.blinkPhase === 2 && state.blinkTimer <= 0) {
          state.blinkPhase = 3;
          state.blinkTimer = 70;
        } else if (state.blinkPhase === 3 && state.blinkTimer <= 0) {
          state.blinkPhase = 0;
          state.blinkTimer = style.blinkRate + (Math.random() - 0.5) * 1500;
        }
      }

      // Smooth pupil
      state.pupilX += (state.targetX - state.pupilX) * 0.06;
      state.pupilY += (state.targetY - state.pupilY) * 0.06;

      // Clear
      ctx.clearRect(0, 0, size, size);

      // Don't draw anything if fully closed
      if (state.openAmount < 0.01) {
        // Just a tiny dot when closed
        ctx.fillStyle = irisColor;
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size * 0.04, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        animRef.current = requestAnimationFrame(draw);
        return;
      }

      const cx = size / 2;
      const cy = size / 2;
      const eyeW = size * 0.38;
      const baseEyeH = eyeW * getHeightRatio(style.shape);

      // Apply open amount + blink
      let blinkMult = 1;
      if (state.blinkPhase === 1) blinkMult = 0.2;
      else if (state.blinkPhase === 2) blinkMult = 0.05;
      else if (state.blinkPhase === 3) blinkMult = 0.4;

      const eyeH = baseEyeH * state.openAmount * blinkMult;

      if (eyeH < 0.5) {
        // Closed line
        ctx.strokeStyle = `${irisColor}40`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - eyeW, cy);
        ctx.lineTo(cx + eyeW, cy);
        ctx.stroke();

        animRef.current = requestAnimationFrame(draw);
        return;
      }

      // Sclera
      ctx.fillStyle = `rgba(255,255,255,${0.85 * state.openAmount})`;
      drawEyeShape(ctx, cx, cy, eyeW, eyeH, style.shape);

      // Iris
      const irisR = eyeW * 0.5;
      const maxShift = eyeW * 0.2;
      const ix = cx + state.pupilX * maxShift;
      const iy = cy + state.pupilY * maxShift * 0.6;

      ctx.fillStyle = irisColor;
      ctx.beginPath();
      ctx.arc(ix, iy, irisR, 0, Math.PI * 2);
      ctx.fill();

      // Pupil
      const pupilR = irisR * 0.45;
      ctx.fillStyle = "#08080c";
      ctx.beginPath();
      ctx.arc(ix + state.pupilX * 0.4, iy + state.pupilY * 0.3, pupilR, 0, Math.PI * 2);
      ctx.fill();

      // Highlight
      ctx.fillStyle = `rgba(255,255,255,${0.6 * state.openAmount})`;
      ctx.beginPath();
      ctx.arc(ix - irisR * 0.25, iy - irisR * 0.3, pupilR * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Top eyelid shadow
      ctx.strokeStyle = `rgba(255,255,255,${0.05 * state.openAmount})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy - eyeH * 0.15, eyeW * 0.95, eyeH * 0.6, 0, Math.PI, 0);
      ctx.stroke();

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [size, color, getStyle]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size, cursor: "pointer" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    />
  );
}

function getHeightRatio(shape: string): number {
  switch (shape) {
    case "wide": return 0.8;
    case "narrow": return 0.45;
    case "sharp": return 0.55;
    case "soft": return 0.7;
    default: return 0.65;
  }
}

function drawEyeShape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, shape: string) {
  ctx.beginPath();
  if (shape === "sharp") {
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w * 0.3, y - h, x + w * 0.5, y - h * 0.5);
    ctx.lineTo(x + w, y - h * 0.2);
    ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.7, x - w * 0.3, y + h * 0.5);
    ctx.closePath();
  } else {
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
  }
  ctx.fill();
}
