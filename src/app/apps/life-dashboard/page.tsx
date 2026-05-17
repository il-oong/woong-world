import { redirect } from "next/navigation";
import { getValidSession } from "@/lib/google";
import LifeDashboardApp from "@/components/LifeDashboard/LifeDashboardApp";

export const dynamic = "force-dynamic";

export default async function LifeDashboardPage() {
  const session = await getValidSession();
  if (!session?.email) redirect("/");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">라이프 대시보드</h1>
        <p className="text-sm text-zinc-500 mt-1">거창한 다짐 말고, 시스템으로 삽니다</p>
      </div>
      <LifeDashboardApp />
    </div>
  );
}
