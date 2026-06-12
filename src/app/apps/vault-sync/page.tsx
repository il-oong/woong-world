import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { VaultSyncDashboard } from "@/components/VaultSyncDashboard";

export const dynamic = "force-dynamic";

export default async function VaultSyncPage() {
  if (!(await isAdminSession())) redirect("/");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:py-12">
      <header className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
          plugin / vault-sync
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
          옵시디언 동기화
        </h1>
        <p className="mt-1 text-xs text-[var(--muted)]">
          obsidian/ 노트를 GitHub로 백업·복원합니다. 배포본에서도 작동하며, 실시간
          파일 동기화만 로컬 전용입니다.
        </p>
      </header>
      <VaultSyncDashboard />
    </div>
  );
}
