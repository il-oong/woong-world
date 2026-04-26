import Link from "next/link";
import { PlansPanel } from "@/components/PlansPanel";

export const metadata = {
  title: "Plans — Woong Hub",
};

export default function PlansPage() {
  return (
    <div className="relative">
      <div className="bg-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-8 flex items-baseline justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
              woong / hub / plans
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              계획 관리
            </h1>
            <p className="mt-1 text-xs text-[var(--muted)]">
              주간 / 월간 / 연간 계획을 카테고리별로 관리하고 AI 리뷰로 보완점을 받아봅니다.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <Link href="/calendar" className="text-[var(--muted)] hover:text-foreground">
              일정 →
            </Link>
            <Link href="/" className="text-[var(--muted)] hover:text-foreground">
              ← 허브로
            </Link>
          </div>
        </header>

        <PlansPanel />
      </div>
    </div>
  );
}
