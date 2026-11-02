import { type NextRequest } from "next/server";
import { isAdminSession } from "@/lib/admin";
import {
  MARKET_CATEGORIES,
  fetchMarket,
  type MarketCategoryId,
  type MarketSort,
} from "@/lib/plugin-market";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SORTS: MarketSort[] = ["stars", "updated", "forks"];

export async function GET(req: NextRequest) {
  if (!(await isAdminSession())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const category = (sp.get("category") ?? "ai") as MarketCategoryId;
  const sort = (sp.get("sort") ?? "stars") as MarketSort;
  if (!MARKET_CATEGORIES.some((c) => c.id === category)) {
    return Response.json({ error: "invalid_category" }, { status: 400 });
  }
  if (!SORTS.includes(sort)) {
    return Response.json({ error: "invalid_sort" }, { status: 400 });
  }
  try {
    const items = await fetchMarket(category, sort);
    return Response.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "market_failed";
    // GitHub 403/429 = rate limit
    const rate = msg === "github_403" || msg === "github_429";
    return Response.json(
      { error: rate ? "rate_limited" : msg },
      { status: 502 },
    );
  }
}
