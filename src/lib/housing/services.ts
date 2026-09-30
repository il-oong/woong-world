import { z } from "zod";
import {
  type Notice,
  type Commute,
  pointSchema,
  type Profile,
  todayKst,
} from "./model";

export async function geocode(address: string) {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key || !address.trim()) return null;
  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", address);
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = await res.json();
  const first = body.documents?.[0];
  if (!first || body.documents.length !== 1) return null;
  const parsed = pointSchema.safeParse({
    lat: Number(first.y),
    lng: Number(first.x),
  });
  return parsed.success ? parsed.data : null;
}
export async function getCommute(
  notice: Notice,
  p: Profile,
): Promise<Commute | null> {
  if (!process.env.ODSAY_API_KEY || !p.workplace || !notice.point) return null;
  const end = await geocode(p.workplace);
  if (!end) return null;
  const url = new URL("https://api.odsay.com/v1/api/searchPubTransPathT");
  for (const [k, v] of Object.entries({
    apiKey: process.env.ODSAY_API_KEY,
    SX: notice.point.lng,
    SY: notice.point.lat,
    EX: end.lng,
    EY: end.lat,
    OPT: 0,
  }))
    url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = await res.json();
  // Intercity segments alone are not door-to-door commutes.
  if (body.result?.searchType !== 0) return null;
  const paths = z
    .array(
      z.object({
        info: z.object({
          totalTime: z.number().positive(),
          busTransitCount: z.number().nonnegative(),
          subwayTransitCount: z.number().nonnegative(),
        }),
        subPath: z.array(
          z.object({
            trafficType: z.number(),
            sectionTime: z.number().nonnegative(),
          }),
        ),
      }),
    )
    .safeParse(body.result?.path);
  if (!paths.success || !paths.data.length) return null;
  const best = paths.data.sort(
    (a, b) => a.info.totalTime - b.info.totalTime,
  )[0];
  return {
    minutes: best.info.totalTime,
    transfers: Math.max(
      0,
      best.info.busTransitCount + best.info.subwayTransitCount - 1,
    ),
    walkMinutes: best.subPath
      .filter((s) => s.trafficType === 3)
      .reduce((sum, s) => sum + s.sectionTime, 0),
    checkedAt: todayKst(),
    destination: p.workplace,
  };
}
