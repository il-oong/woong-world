import Link from "next/link";
import { MailBulkTrash } from "@/components/MailBulkTrash";

export const metadata = {
  title: "메일 대량 삭제 — 비서",
};

export default function MailCleanupPage() {
  return (
    <div className="relative">
      <div className="bg-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto max-w-2xl px-6 py-12">
        <header className="mb-8 flex items-baseline justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
              biseo / mail
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              메일 대량 삭제
            </h1>
            <p className="mt-1 text-xs text-[var(--muted)]">
              조건에 맞는 메일을 한 번에 휴지통으로 옮깁니다. (30일 내 복구 가능)
            </p>
          </div>
          <Link href="/" className="text-xs text-[var(--muted)] hover:text-foreground">
            ← 홈
          </Link>
        </header>
        <MailBulkTrash />
      </div>
    </div>
  );
}
