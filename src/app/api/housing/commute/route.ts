import { z } from "zod";
import { authorize, failure, json, readBody } from "@/lib/housing/http";
import {
  getNotices,
  getProfile,
  userKey,
  routeFingerprint,
} from "@/lib/housing/store";
import { getCommute } from "@/lib/housing/services";
export async function POST(req: Request) {
  try {
    const a = await authorize(req);
    if (a.error) return a.error;
    const { id } = z
      .object({ id: z.string().max(80) })
      .parse(await readBody(req, 1000));
    const [notices, profile] = await Promise.all([
      getNotices(),
      getProfile(a.email),
    ]);
    const n = notices.find((n) => n.id === id);
    if (!n || !profile)
      return json({ error: "공고와 내 정보 등록을 먼저 완료해주세요" }, 400);
    const commute = await getCommute(n, profile);
    if (commute) {
      const key = `${userKey(a.email)}:commutes`;
      await a.db.hset(key, {
        [id]: { fingerprint: routeFingerprint(n, profile), commute },
      });
      await a.db.expire(key, 86400);
    }
    return commute
      ? json({ commute })
      : json(
          {
            error:
              "경로를 확인하지 못했습니다. 지도 서비스 연결, 단지 좌표, 정확한 직장 주소를 확인해주세요.",
          },
          503,
        );
  } catch (e) {
    return failure(e);
  }
}
