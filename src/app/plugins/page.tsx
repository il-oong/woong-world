import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { PluginsManager } from "@/components/PluginsManager";

export const dynamic = "force-dynamic";

export default async function PluginsIndexPage() {
  const isAdmin = await isAdminSession();
  if (!isAdmin) redirect("/");

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 md:py-16">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
          woong / plugins
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
          플러그인 관리
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          허브에 연결된 모든 플러그인의 상태를 확인하고 추가/제거합니다.
        </p>
      </header>

      <PluginsManager />
    </div>
  );
}
