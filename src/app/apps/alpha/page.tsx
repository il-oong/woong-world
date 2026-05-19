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
        <p className="text-sm text-zinc-500 mt-1">자동매매 없는 순수 분석 — JKP가 방향을 잡아드립니다</p>
      </div>
      <AlphaApp />
    </div>
  );
}
