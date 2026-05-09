import { type NextRequest } from "next/server";
import { getSubscriptionsForHour, isVapidConfigured, sendPushNotification } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isVapidConfigured()) {
    return Response.json({ skipped: "push_not_configured" });
  }

  // 현재 서울 기준 시각
  const seoulHour = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  ).getHours();

  const items = await getSubscriptionsForHour(seoulHour);
  if (items.length === 0) {
    return Response.json({ sent: 0, hour: seoulHour });
  }

  const results = await Promise.allSettled(
    items.map(({ record }) =>
      sendPushNotification(record, {
        title: "비서 ✦ 오늘 브리핑",
        body: "오늘 일정 브리핑이 준비됐습니다. 탭해서 확인하세요.",
        url: "/",
      }),
    ),
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;

  return Response.json({ sent, failed, hour: seoulHour });
}
