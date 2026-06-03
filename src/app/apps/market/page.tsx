import { redirect } from "next/navigation";
import { getValidSession } from "@/lib/google";
import MarketHub from "@/components/Market/MarketHub";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const session = await getValidSession();
  if (!session?.email) redirect("/");

  return <MarketHub />;
}
