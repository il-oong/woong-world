import Link from "next/link";
import { CalendarPanel } from "@/components/CalendarPanel";

export const metadata = {
  title: "Calendar — Woong Hub",
};

export default function CalendarPage() {
  return (
    <div className="relative">
      <div className="bg-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-8 flex items-baseline justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
              woong / hub / calendar
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              일정 관리
            </h1>
          </div>
          <Link
            href="/"
            className="text-xs text-[var(--muted)] hover:text-foreground"
          >
            ← 허브로
          </Link>
        </header>

        <CalendarPanel variant="full" />
      </div>
    </div>
  );
}
