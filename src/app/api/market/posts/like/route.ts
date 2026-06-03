import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { likePost } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const likes = await likePost(id);
  return NextResponse.json({ likes });
}
