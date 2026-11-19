import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { PluginMarket } from "@/components/PluginMarket";

export const dynamic = "force-dynamic";

export default async function PluginMarketPage() {
  if (!(await isAdminSession())) redirect("/");

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 md:py-16">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
          woong / plugins / market
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
          플러그인 마켓
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          GitHub 공개 저장소를 분류·랭킹별로 둘러보고, 마음에 들면 허브에 추가하거나 ZIP으로 내려받으세요.
        </p>
        <Link
          href="/plugins"
          className="mt-3 inline-block text-xs text-[var(--muted)] hover:text-foreground"
        >
          ← 내 플러그인 관리
        </Link>
      </header>
      <PluginMarket />
    </div>
  );
}
