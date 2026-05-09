"use client";

import Link from "next/link";
import { CalendarPanel } from "@/components/CalendarPanel";
import { CsvImport } from "@/components/CsvImport";
import { useState } from "react";

export default function CalendarPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="relative">
      <div className="bg-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-8 flex items-baseline justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
              biseo / calendar
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              일정 관리
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <CsvImport onImported={() => setRefreshKey((k) => k + 1)} />
            <Link href="/" className="text-xs text-[var(--muted)] hover:text-foreground">
              ← 홈
            </Link>
          </div>
        </header>

        <CalendarPanel key={refreshKey} variant="full" />
      </div>
    </div>
  );
}
