import { redirect } from "next/navigation";
import { getValidSession } from "@/lib/google";
import AlphaApp from "@/components/Alpha/AlphaApp";

export const dynamic = "force-dynamic";

export default async function AlphaPage() {
  const session = await getValidSession();
  if (!session?.email) redirect("/");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">ALPHA 투자 분석</h1>
        <p className="text-sm text-zinc-500 mt-1">
          JKP · O&apos;Neil · Lynch · Weinstein · Minervini — 4에이전트 기반 투자 어시스턴트
        </p>
      </div>
      <AlphaApp />
    </div>
  );
}
