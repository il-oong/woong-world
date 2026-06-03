import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { getPosts, createPost } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const market = (req.nextUrl.searchParams.get("market") ?? "KR") as "KR" | "US" | "COIN";
  const page = Number(req.nextUrl.searchParams.get("page") ?? "1");
  const posts = await getPosts(market, page);
  return NextResponse.json(posts);
}

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.content?.trim()) return NextResponse.json({ error: "content required" }, { status: 400 });

  const name = session.email.split("@")[0];
  const post = await createPost({
    author: name,
    content: body.content.trim(),
    market: body.market ?? "KR",
    stockTags: body.stockTags ?? [],
    createdAt: Date.now(),
    isPoll: body.isPoll ?? false,
    pollOptions: body.pollOptions ?? undefined,
    pollVotes: body.pollOptions ? Object.fromEntries((body.pollOptions as string[]).map((o: string) => [o, 0])) : undefined,
  });
  return NextResponse.json(post, { status: 201 });
}
