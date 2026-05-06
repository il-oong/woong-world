import { NextRequest, NextResponse } from "next/server";
import { sendToAll, getCheongakSnapshot, saveCheongakSnapshot } from "@/lib/push";
import type { CheongakItem } from "@/app/api/cheongak/route";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Vercel Cron은 Authorization 헤더로 CRON_SECRET 전달
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // 현재 청약 목록 가져오기
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  let items: CheongakItem[] = [];
  try {
    const res = await fetch(`${base}/api/cheongak`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json() as { items: CheongakItem[] };
      items = data.items;
    }
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }

  // 이전 스냅샷과 비교
  const prevIds = await getCheongakSnapshot();
  const currentIds = items.map((i) => i.id);
  const newItems = items.filter((i) => !prevIds.includes(i.id));

  // 스냅샷 갱신
  await saveCheongakSnapshot(currentIds);

  if (newItems.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "no new 청약" });
  }

  // 새 청약이 있으면 push 전송
  const names = newItems.slice(0, 3).map((i) => i.name).join(", ");
  const body = newItems.length === 1
    ? `${newItems[0].name} — ${newItems[0].location}`
    : `${names} 외 ${newItems.length - 1}건`;

  try {
    await sendToAll({
      title: `🏠 새 청약 ${newItems.length}건`,
      body,
      url: "/cheongak",
    });
  } catch {
    // VAPID 미설정 시 무시
  }

  return NextResponse.json({ ok: true, sent: newItems.length, newItems: newItems.map((i) => i.id) });
}
