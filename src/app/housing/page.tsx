import { loadHousing } from "@/lib/housing/load";
import { todayKst } from "@/lib/housing/model";
import { Dashboard } from "@/components/Housing/Dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  return <Dashboard data={await loadHousing()} today={todayKst()} />;
}
