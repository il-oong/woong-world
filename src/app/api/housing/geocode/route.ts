import { z } from "zod";
import { authorize, failure, json, readBody } from "@/lib/housing/http";
import { geocode } from "@/lib/housing/services";
export async function POST(req: Request) {
  try {
    const a = await authorize(req, true);
    if (a.error) return a.error;
    const { address } = z
      .object({ address: z.string().min(3).max(300) })
      .parse(await readBody(req, 2000));
    const point = await geocode(address);
    return point
      ? json({ point })
      : json(
          {
            error:
              "주소를 하나의 위치로 확인하지 못했습니다. 카카오 서비스 설정과 실제 공급 주소를 확인해주세요.",
          },
          503,
        );
  } catch (e) {
    return failure(e);
  }
}
