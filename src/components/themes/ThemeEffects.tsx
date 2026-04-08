"use client";

import { useEffect, useRef } from "react";

// ──────────────────────────────────────────
// Shared canvas pixel art renderer
// ──────────────────────────────────────────

function usePixelCanvas(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, p: number) => void,
  pixelScale = 4,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const p = pixelScale;

    function resize() {
      if (!canvas) return;
      canvas.width = Math.ceil(window.innerWidth / p);
      canvas.height = Math.ceil(window.innerHeight / p);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    }

    resize();
    window.addEventListener("resize", resize);

    function loop(time: number) {
      if (!ctx || !canvas) return;
      ctx.imageSmoothingEnabled = false;
      draw(ctx, canvas.width, canvas.height, time * 0.001, p);
      animId = requestAnimationFrame(loop);
    }
    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [draw, pixelScale]);

  return canvasRef;
}

function PixelCanvas({ draw, scale = 4 }: { draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, p: number) => void; scale?: number }) {
  const ref = usePixelCanvas(draw, scale);
  return (
    <canvas
      ref={ref}
      className="absolute inset-0 pointer-events-none"
      style={{ imageRendering: "pixelated", opacity: 0.35 }}
    />
  );
}

// pixel helper
function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
}

// ──────────────────────────────────────────
// ECHO — 비 내리는 네온 도시 야경
// ──────────────────────────────────────────

export function EchoEffect() {
  return <PixelCanvas scale={3} draw={(ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);

    // Sky gradient
    for (let y = 0; y < h * 0.5; y++) {
      const ratio = y / (h * 0.5);
      const r = Math.floor(2 + ratio * 8);
      const g = Math.floor(5 + ratio * 20);
      const b = Math.floor(15 + ratio * 25);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, y, w, 1);
    }

    // City skyline — jagged buildings
    const buildings = [0.7, 0.5, 0.8, 0.45, 0.65, 0.55, 0.75, 0.4, 0.6, 0.5, 0.72, 0.48, 0.68, 0.52, 0.78, 0.42, 0.58, 0.62, 0.45, 0.7];
    const bw = Math.ceil(w / buildings.length);
    for (let i = 0; i < buildings.length; i++) {
      const bh = h * buildings[i] * 0.45;
      const bx = i * bw;
      const by = h * 0.5 - bh;

      // Building body
      for (let y = by; y < h * 0.5; y++) {
        for (let x = bx + 1; x < bx + bw - 1; x++) {
          px(ctx, x, y, `rgb(${8 + i % 3},${12 + i % 5},${20 + i % 4})`);
        }
      }

      // Windows — blinking
      for (let wy = by + 2; wy < h * 0.5 - 2; wy += 3) {
        for (let wx = bx + 2; wx < bx + bw - 2; wx += 3) {
          const on = Math.sin(t * 0.5 + wx * 0.7 + wy * 1.3 + i) > 0.1;
          if (on) {
            const colors = ["#00ff88", "#00ddff", "#ffee55", "#ff66aa"];
            px(ctx, wx, wy, colors[(wx + wy + i) % colors.length]);
          }
        }
      }
    }

    // Water reflection
    for (let y = Math.floor(h * 0.5); y < h; y++) {
      const mirrorY = Math.floor(h * 0.5) - (y - Math.floor(h * 0.5));
      if (mirrorY >= 0) {
        const distort = Math.sin(t * 2 + y * 0.3) * 2;
        for (let x = 0; x < w; x++) {
          const srcX = Math.floor(x + distort) % w;
          if (srcX >= 0 && srcX < w && mirrorY < h) {
            const imgData = ctx.getImageData(srcX, mirrorY, 1, 1).data;
            ctx.fillStyle = `rgba(${imgData[0] * 0.3},${imgData[1] * 0.4},${imgData[2] * 0.5},0.4)`;
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    }

    // Rain
    for (let i = 0; i < 40; i++) {
      const rx = (i * 17 + t * 30) % w;
      const ry = (i * 31 + t * 80) % h;
      px(ctx, rx, ry, "rgba(100,200,255,0.4)");
      if (ry + 1 < h) px(ctx, rx, ry + 1, "rgba(100,200,255,0.2)");
    }
  }} />;
}

// ──────────────────────────────────────────
// OTONDO — 별이 쏟아지는 사막 + 피라미드
// ──────────────────────────────────────────

export function OtondoEffect() {
  return <PixelCanvas scale={3} draw={(ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);

    // Night sky
    for (let y = 0; y < h * 0.6; y++) {
      const r = y / (h * 0.6);
      ctx.fillStyle = `rgb(${Math.floor(5 + r * 15)},${Math.floor(2 + r * 8)},${Math.floor(15 + r * 10)})`;
      ctx.fillRect(0, y, w, 1);
    }

    // Stars
    for (let i = 0; i < 60; i++) {
      const sx = (i * 37 + 11) % w;
      const sy = (i * 23 + 7) % Math.floor(h * 0.55);
      const twinkle = Math.sin(t * 2 + i * 1.7) * 0.5 + 0.5;
      if (twinkle > 0.3) {
        px(ctx, sx, sy, `rgba(255,230,180,${twinkle * 0.8})`);
      }
    }

    // Shooting star
    const ssX = (t * 20) % (w + 40) - 20;
    const ssY = 10 + Math.sin(t * 0.3) * 15;
    for (let i = 0; i < 6; i++) {
      px(ctx, ssX - i * 2, ssY + i, `rgba(255,215,100,${0.8 - i * 0.12})`);
    }

    // Sand dunes
    const horizon = h * 0.6;
    for (let x = 0; x < w; x++) {
      const duneH = Math.sin(x * 0.03 + 1) * 8 + Math.sin(x * 0.07) * 4;
      for (let y = horizon - duneH; y < h; y++) {
        const depth = (y - horizon + duneH) / (h - horizon + duneH);
        const r = Math.floor(40 + depth * 30 + Math.sin(x * 0.1) * 5);
        const g = Math.floor(25 + depth * 15);
        const b = Math.floor(10 + depth * 5);
        px(ctx, x, y, `rgb(${r},${g},${b})`);
      }
    }

    // Pyramids
    const pyramids = [
      { cx: w * 0.3, size: 25, color: [50, 35, 15] },
      { cx: w * 0.65, size: 18, color: [55, 38, 18] },
      { cx: w * 0.85, size: 12, color: [45, 32, 14] },
    ];
    for (const p of pyramids) {
      for (let row = 0; row < p.size; row++) {
        const py = horizon - p.size + row;
        const half = p.size - row;
        for (let dx = -half; dx <= half; dx++) {
          const shade = dx < 0 ? 1 : 0.7;
          px(ctx, p.cx + dx, py,
            `rgb(${Math.floor(p.color[0] * shade)},${Math.floor(p.color[1] * shade)},${Math.floor(p.color[2] * shade)})`);
        }
      }
    }

    // Gold dust particles floating
    for (let i = 0; i < 15; i++) {
      const gx = (i * 43 + t * 5) % w;
      const gy = horizon - 20 + Math.sin(t + i * 2) * 10;
      px(ctx, gx, gy, `rgba(232,197,71,${0.3 + Math.sin(t * 3 + i) * 0.3})`);
    }
  }} />;
}

// ──────────────────────────────────────────
// ALPHA — 매트릭스 코드 폭포 + 빨간 캔들
// ──────────────────────────────────────────

export function AlphaEffect() {
  return <PixelCanvas scale={3} draw={(ctx, w, h, t) => {
    // Fade trail
    ctx.fillStyle = "rgba(10,2,2,0.15)";
    ctx.fillRect(0, 0, w, h);

    // Matrix rain columns
    const cols = Math.floor(w / 2);
    for (let i = 0; i < cols; i++) {
      const x = i * 2;
      const speed = 3 + (i % 5);
      const y = Math.floor((t * speed * 8 + i * 37) % (h + 20));
      const chars = "01%$+-=<>{}";
      const charIdx = Math.floor(t * 10 + i * 3) % chars.length;

      // Head (bright)
      if (y < h) {
        ctx.fillStyle = i % 7 === 0 ? "#ff2244" : "#ff4466";
        ctx.fillRect(x, y, 1, 1);
      }
      // Trail
      for (let trail = 1; trail < 8; trail++) {
        const ty = y - trail * 2;
        if (ty >= 0 && ty < h) {
          const alpha = 0.5 - trail * 0.06;
          ctx.fillStyle = `rgba(${i % 3 === 0 ? 255 : 180},${30 + trail * 5},${40 + trail * 8},${alpha})`;
          ctx.fillRect(x, ty, 1, 1);
        }
      }
    }

    // Candlestick chart at bottom
    const candleY = h * 0.75;
    for (let i = 0; i < 30; i++) {
      const cx = Math.floor(w * 0.1 + i * (w * 0.8 / 30));
      const isGreen = Math.sin(i * 1.3 + t * 0.2) > 0;
      const bodyH = 3 + Math.abs(Math.sin(i * 2.1 + t * 0.1)) * 6;
      const wickH = bodyH * 0.6;
      const color = isGreen ? "#00cc44" : "#ff2244";

      // Wick
      px(ctx, cx, candleY - bodyH - wickH, color);
      px(ctx, cx, candleY + wickH, color);
      // Body
      for (let y = 0; y < bodyH; y++) {
        px(ctx, cx, candleY - y, color);
        if (cx + 1 < w) px(ctx, cx + 1, candleY - y, color);
      }
    }
  }} />;
}

// ──────────────────────────────────────────
// GOPOINT — 레트로 아케이드 그리드 + 네온 트레일
// ──────────────────────────────────────────

export function GoPointEffect() {
  return <PixelCanvas scale={3} draw={(ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);

    // Vaporwave grid floor
    const horizon = h * 0.45;
    const gridColor = "rgba(118,255,3,0.15)";

    // Horizontal lines (perspective)
    for (let i = 0; i < 20; i++) {
      const ratio = i / 20;
      const y = horizon + ratio * ratio * (h - horizon);
      ctx.fillStyle = gridColor;
      ctx.fillRect(0, Math.floor(y), w, 1);
    }

    // Vertical lines (converging)
    const vanishX = w / 2;
    for (let i = -15; i <= 15; i++) {
      const bottomX = vanishX + i * (w / 10);
      const steps = 40;
      for (let s = 0; s < steps; s++) {
        const ratio = s / steps;
        const x = vanishX + (bottomX - vanishX) * ratio * ratio;
        const y = horizon + ratio * ratio * (h - horizon);
        if (x >= 0 && x < w && y < h) {
          px(ctx, x, y, gridColor);
        }
      }
    }

    // Sun circle
    const sunR = 20;
    const sunY = horizon - sunR - 5;
    const sunX = w / 2;
    for (let dy = -sunR; dy <= sunR; dy++) {
      for (let dx = -sunR; dx <= sunR; dx++) {
        if (dx * dx + dy * dy <= sunR * sunR) {
          const stripe = Math.floor((dy + sunR) / 3) % 2 === 0;
          if (stripe || dy < 0) {
            const dist = Math.sqrt(dx * dx + dy * dy) / sunR;
            const r = Math.floor(255 - dist * 80);
            const g = Math.floor(100 + dist * 155);
            px(ctx, sunX + dx, sunY + dy, `rgb(${r},${g},3)`);
          }
        }
      }
    }

    // Floating orbs
    for (let i = 0; i < 8; i++) {
      const ox = w * 0.2 + (i * w * 0.08);
      const oy = h * 0.2 + Math.sin(t * 1.5 + i * 1.1) * 15;
      const size = 2 + Math.sin(t + i) * 1;
      ctx.fillStyle = `rgba(118,255,3,${0.3 + Math.sin(t * 2 + i) * 0.2})`;
      ctx.beginPath();
      ctx.arc(ox, oy, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }} />;
}

// ──────────────────────────────────────────
// BOARDROOM — 이소메트릭 오피스 빌딩
// ──────────────────────────────────────────

export function BoardroomEffect() {
  return <PixelCanvas scale={3} draw={(ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);

    // Dark blue background
    ctx.fillStyle = "#050810";
    ctx.fillRect(0, 0, w, h);

    // Isometric building blocks
    const blocks = [
      { x: w * 0.3, y: h * 0.4, bw: 30, bh: 40, color: [15, 25, 50] },
      { x: w * 0.55, y: h * 0.35, bw: 25, bh: 50, color: [12, 20, 45] },
      { x: w * 0.75, y: h * 0.45, bw: 20, bh: 30, color: [18, 28, 48] },
    ];

    for (const b of blocks) {
      // Front face
      for (let y = 0; y < b.bh; y++) {
        for (let x = 0; x < b.bw; x++) {
          px(ctx, b.x + x, b.y + y, `rgb(${b.color[0]},${b.color[1]},${b.color[2]})`);
        }
      }
      // Windows
      for (let wy = 3; wy < b.bh - 2; wy += 5) {
        for (let wx = 2; wx < b.bw - 2; wx += 4) {
          const lit = Math.sin(t * 0.8 + wx * 0.5 + wy * 0.3 + b.x) > -0.2;
          px(ctx, b.x + wx, b.y + wy, lit ? "#3366cc" : "#0a1520");
          px(ctx, b.x + wx + 1, b.y + wy, lit ? "#4477dd" : "#0a1520");
          px(ctx, b.x + wx, b.y + wy + 1, lit ? "#2255aa" : "#0a1520");
          px(ctx, b.x + wx + 1, b.y + wy + 1, lit ? "#3366bb" : "#0a1520");
        }
      }
      // Top face
      for (let x = 0; x < b.bw; x++) {
        px(ctx, b.x + x, b.y - 1, `rgb(${b.color[0] + 10},${b.color[1] + 15},${b.color[2] + 20})`);
      }
    }

    // Data particles floating between buildings
    for (let i = 0; i < 20; i++) {
      const dx = (t * 8 + i * 17) % w;
      const dy = h * 0.3 + Math.sin(t + i * 0.8) * h * 0.15;
      px(ctx, dx, dy, `rgba(68,138,255,${0.3 + Math.sin(t * 3 + i) * 0.2})`);
    }
  }} />;
}

// ──────────────────────────────────────────
// DOTSTUDIO — 움직이는 도트 만화경
// ──────────────────────────────────────────

export function DotStudioEffect() {
  return <PixelCanvas scale={3} draw={(ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;

    // Rotating dot kaleidoscope
    for (let ring = 0; ring < 8; ring++) {
      const radius = 15 + ring * 12;
      const dots = 8 + ring * 4;
      const speed = (ring % 2 === 0 ? 1 : -1) * (0.3 + ring * 0.05);

      for (let i = 0; i < dots; i++) {
        const angle = (i / dots) * Math.PI * 2 + t * speed;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;

        if (x >= 0 && x < w && y >= 0 && y < h) {
          const hue = (ring * 40 + i * 15 + t * 30) % 360;
          const colors = ["#22d3ee", "#06b6d4", "#0891b2", "#67e8f9", "#a5f3fc", "#0e7490"];
          px(ctx, x, y, colors[(ring + i) % colors.length]);

          // Glow pixel
          if (ring < 4) {
            if (x + 1 < w) px(ctx, x + 1, y, `rgba(34,211,238,0.15)`);
            if (y + 1 < h) px(ctx, x, y + 1, `rgba(34,211,238,0.15)`);
          }
        }
      }
    }

    // Center eye
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy <= 9) {
          px(ctx, cx + dx, cy + dy, "#0e7490");
        }
        if (dx * dx + dy * dy <= 4) {
          px(ctx, cx + dx, cy + dy, "#22d3ee");
        }
        if (dx * dx + dy * dy <= 1) {
          px(ctx, cx + dx, cy + dy, "#ffffff");
        }
      }
    }
  }} />;
}

// ──────────────────────────────────────────
// ZAZZ — 색 폭발 파이어웍스
// ──────────────────────────────────────────

export function ZazzEffect() {
  return <PixelCanvas scale={3} draw={(ctx, w, h, t) => {
    // Fade trail
    ctx.fillStyle = "rgba(10,8,0,0.08)";
    ctx.fillRect(0, 0, w, h);

    const colors = ["#ffab00", "#ff6d00", "#ff3d00", "#ffd600", "#aeea00", "#ff1744", "#d500f9", "#00e5ff"];

    // Firework bursts
    for (let burst = 0; burst < 5; burst++) {
      const phase = (t * 0.5 + burst * 1.3) % 4;
      if (phase > 2) continue;

      const bcx = (burst * 67 + 30) % w;
      const bcy = h * 0.2 + (burst * 41) % Math.floor(h * 0.4);
      const numParticles = 16;

      for (let i = 0; i < numParticles; i++) {
        const angle = (i / numParticles) * Math.PI * 2;
        const dist = phase * 15;
        const px2 = bcx + Math.cos(angle) * dist;
        const py2 = bcy + Math.sin(angle) * dist + phase * 2; // gravity
        const alpha = Math.max(0, 1 - phase * 0.4);

        if (px2 >= 0 && px2 < w && py2 >= 0 && py2 < h && alpha > 0) {
          const c = colors[(burst + i) % colors.length];
          ctx.fillStyle = c;
          ctx.globalAlpha = alpha;
          ctx.fillRect(Math.floor(px2), Math.floor(py2), 1, 1);
          ctx.globalAlpha = 1;
        }
      }
    }

    // Sparkle dots
    for (let i = 0; i < 10; i++) {
      const sx = (i * 53 + Math.floor(t * 20)) % w;
      const sy = (i * 37 + Math.floor(t * 12)) % h;
      if (Math.sin(t * 5 + i * 2) > 0.5) {
        px(ctx, sx, sy, colors[i % colors.length]);
      }
    }
  }} />;
}

// ──────────────────────────────────────────
// LIFEONEY — 코인 비 + 밤하늘
// ──────────────────────────────────────────

export function LifeoneyEffect() {
  return <PixelCanvas scale={3} draw={(ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);

    // Purple night sky
    for (let y = 0; y < h; y++) {
      const r = y / h;
      ctx.fillStyle = `rgb(${Math.floor(8 + r * 12)},${Math.floor(4 + r * 6)},${Math.floor(20 + r * 15)})`;
      ctx.fillRect(0, y, w, 1);
    }

    // Stars
    for (let i = 0; i < 30; i++) {
      const sx = (i * 47 + 13) % w;
      const sy = (i * 29 + 7) % Math.floor(h * 0.7);
      if (Math.sin(t * 1.5 + i * 2.3) > 0) {
        px(ctx, sx, sy, `rgba(200,180,255,0.5)`);
      }
    }

    // Falling coins
    for (let i = 0; i < 12; i++) {
      const cx = (i * 31 + 15) % w;
      const cy = ((t * 15 + i * 43) % (h + 10)) - 5;
      const frame = Math.floor(t * 4 + i) % 4;

      // Coin: 3x3 → 1x3 → 3x3 → 1x3 (rotation)
      const coinW = frame === 1 || frame === 3 ? 1 : 3;
      const coinColor = "#c084fc";
      const coinHighlight = "#e9d5ff";

      for (let dy = -1; dy <= 1; dy++) {
        const hw = Math.floor(coinW / 2);
        for (let dx = -hw; dx <= hw; dx++) {
          const py = Math.floor(cy + dy);
          const ppx = Math.floor(cx + dx);
          if (py >= 0 && py < h && ppx >= 0 && ppx < w) {
            px(ctx, ppx, py, dy === -1 && dx === 0 ? coinHighlight : coinColor);
          }
        }
      }
    }

    // Ground sparkle
    for (let i = 0; i < 20; i++) {
      const gx = (i * 19 + Math.floor(t * 3)) % w;
      const gy = h - 3 + (i % 3);
      if (Math.sin(t * 4 + i) > 0.3) {
        px(ctx, gx, gy, `rgba(192,132,252,0.4)`);
      }
    }
  }} />;
}

// ──────────────────────────────────────────
// WOONGS — 조직도 네트워크 노드
// ──────────────────────────────────────────

export function WoongsCo() {
  return <PixelCanvas scale={3} draw={(ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);

    // Dark warm bg
    ctx.fillStyle = "#0a0804";
    ctx.fillRect(0, 0, w, h);

    // Network nodes
    const nodes: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < 15; i++) {
      nodes.push({
        x: w * 0.15 + (i % 5) * (w * 0.17) + Math.sin(t * 0.5 + i) * 5,
        y: h * 0.2 + Math.floor(i / 5) * (h * 0.25) + Math.cos(t * 0.3 + i * 0.7) * 3,
        r: i === 0 ? 4 : (i < 6 ? 3 : 2),
      });
    }

    // Draw connections
    for (let i = 1; i < nodes.length; i++) {
      const parent = i < 6 ? 0 : (1 + ((i - 6) % 5));
      const a = nodes[parent];
      const b = nodes[i];
      const steps = 20;
      for (let s = 0; s <= steps; s++) {
        const ratio = s / steps;
        const lx = a.x + (b.x - a.x) * ratio;
        const ly = a.y + (b.y - a.y) * ratio;
        const pulse = Math.sin(t * 2 + ratio * 5 + i) * 0.3 + 0.3;
        px(ctx, lx, ly, `rgba(232,197,71,${pulse * 0.3})`);
      }
    }

    // Draw nodes
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const pulse = Math.sin(t * 2 + i) * 0.2 + 0.8;
      for (let dy = -n.r; dy <= n.r; dy++) {
        for (let dx = -n.r; dx <= n.r; dx++) {
          if (dx * dx + dy * dy <= n.r * n.r) {
            const alpha = i === 0 ? pulse : pulse * 0.5;
            px(ctx, n.x + dx, n.y + dy, `rgba(232,197,71,${alpha})`);
          }
        }
      }
    }

    // Data flow particles along connections
    for (let i = 0; i < 8; i++) {
      const progress = (t * 0.8 + i * 0.5) % 1;
      const fromIdx = i % nodes.length;
      const toIdx = Math.min(fromIdx + 1, nodes.length - 1);
      const a = nodes[fromIdx];
      const b = nodes[toIdx];
      const fx = a.x + (b.x - a.x) * progress;
      const fy = a.y + (b.y - a.y) * progress;
      px(ctx, fx, fy, "#e8c547");
    }
  }} />;
}

// ──────────────────────────────────────────
// PORTFOLIO — 타이핑 터미널
// ──────────────────────────────────────────

export function PortfolioEffect() {
  return <PixelCanvas scale={3} draw={(ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#040810";
    ctx.fillRect(0, 0, w, h);

    // Scan line
    const scanY = Math.floor((t * 20) % h);
    ctx.fillStyle = "rgba(94,234,212,0.03)";
    ctx.fillRect(0, scanY, w, 2);

    // Grid dots — subtle
    for (let x = 0; x < w; x += 8) {
      for (let y = 0; y < h; y += 8) {
        px(ctx, x, y, "rgba(94,234,212,0.04)");
      }
    }

    // Floating geometric shapes
    for (let i = 0; i < 6; i++) {
      const ox = w * 0.15 + i * w * 0.13;
      const oy = h * 0.3 + Math.sin(t * 0.7 + i * 1.5) * h * 0.15;
      const size = 5 + i * 2;
      const alpha = 0.1 + Math.sin(t + i) * 0.05;

      // Triangle / square / circle alternating
      if (i % 3 === 0) {
        // Triangle
        for (let row = 0; row < size; row++) {
          const hw = Math.floor(row * size / size);
          for (let dx = -hw; dx <= hw; dx++) {
            px(ctx, ox + dx, oy + row - size / 2, `rgba(94,234,212,${alpha})`);
          }
        }
      } else if (i % 3 === 1) {
        // Square outline
        for (let s = 0; s < size; s++) {
          px(ctx, ox - size / 2 + s, oy - size / 2, `rgba(94,234,212,${alpha})`);
          px(ctx, ox - size / 2 + s, oy + size / 2, `rgba(94,234,212,${alpha})`);
          px(ctx, ox - size / 2, oy - size / 2 + s, `rgba(94,234,212,${alpha})`);
          px(ctx, ox + size / 2, oy - size / 2 + s, `rgba(94,234,212,${alpha})`);
        }
      } else {
        // Circle
        for (let dy = -size / 2; dy <= size / 2; dy++) {
          for (let dx = -size / 2; dx <= size / 2; dx++) {
            if (Math.abs(dx * dx + dy * dy - (size / 2) * (size / 2)) < size) {
              px(ctx, ox + dx, oy + dy, `rgba(94,234,212,${alpha})`);
            }
          }
        }
      }
    }
  }} />;
}

// ──────────────────────────────────────────
// 3D — 회전하는 와이어프레임 큐브
// ──────────────────────────────────────────

export function ThreeDEffect() {
  return <PixelCanvas scale={3} draw={(ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const size = Math.min(w, h) * 0.25;

    // Cube vertices
    const verts = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ];

    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    // Rotate
    const cosA = Math.cos(t * 0.5);
    const sinA = Math.sin(t * 0.5);
    const cosB = Math.cos(t * 0.3);
    const sinB = Math.sin(t * 0.3);

    function project(v: number[]): [number, number] {
      let x = v[0], y = v[1], z = v[2];
      // Rotate Y
      const x2 = x * cosA - z * sinA;
      const z2 = x * sinA + z * cosA;
      // Rotate X
      const y2 = y * cosB - z2 * sinB;
      const z3 = y * sinB + z2 * cosB;
      const scale = 2 / (3 + z3);
      return [cx + x2 * size * scale, cy + y2 * size * scale];
    }

    // Draw edges
    for (const [a, b] of edges) {
      const [x1, y1] = project(verts[a]);
      const [x2, y2] = project(verts[b]);
      const steps = 20;
      for (let s = 0; s <= steps; s++) {
        const ratio = s / steps;
        const lx = x1 + (x2 - x1) * ratio;
        const ly = y1 + (y2 - y1) * ratio;
        if (lx >= 0 && lx < w && ly >= 0 && ly < h) {
          px(ctx, lx, ly, "#ff6e40");
        }
      }
    }

    // Vertices as bright dots
    for (const v of verts) {
      const [x, y] = project(v);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx * dx + dy * dy <= 1) {
            px(ctx, x + dx, y + dy, "#ffab91");
          }
        }
      }
    }
  }} />;
}

// ──────────────────────────────────────────
// DEFAULT
// ──────────────────────────────────────────

export function DefaultEffect({ color }: { color: string }) {
  return <PixelCanvas scale={4} draw={(ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);

    // Gentle floating particles
    for (let i = 0; i < 20; i++) {
      const x = (i * 37 + t * 3) % w;
      const y = h * 0.3 + Math.sin(t * 0.5 + i * 1.3) * h * 0.2;
      const alpha = 0.1 + Math.sin(t + i * 0.5) * 0.08;
      px(ctx, x, y, `rgba(255,255,255,${alpha})`);
    }
  }} />;
}
