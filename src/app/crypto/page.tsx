import { redirect } from "next/navigation";
import { getValidSession } from "@/lib/google";
import CryptoApp from "@/components/Crypto/CryptoApp";

export const dynamic = "force-dynamic";

export default async function CryptoPage() {
  const session = await getValidSession();
  if (!session?.email) redirect("/");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">CRYPTO 트레이딩 분석</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Saylor · Hayes · PlanB · Pal · Woo — 5명 코인 트레이더 기반 어시스턴트
        </p>
      </div>
      <CryptoApp />
    </div>
  );
}
