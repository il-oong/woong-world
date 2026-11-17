import Link from "next/link";
import { JournalApp } from "@/components/JournalApp";

export const metadata = {
  title: "일기장 — 비서",
};

export default function JournalPage() {
  return (
    <div className="relative min-h-screen">
      <div className="bg-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8 flex items-baseline justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
              biseo / journal
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">일기장</h1>
            <p className="mt-1 text-xs text-[var(--muted)]">
              하루에 몇 번이든 쏟아내세요. 패스워드로 잠겨 있고, 서버도 평문으로 읽을 수 없어요.
            </p>
          </div>
          <Link href="/" className="text-xs text-[var(--muted)] hover:text-foreground">
            ← 홈
          </Link>
        </header>
        <JournalApp />
      </div>
    </div>
  );
}
