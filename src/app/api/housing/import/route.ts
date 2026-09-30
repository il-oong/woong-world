import { z } from "zod";
import { authorize, failure, json, readBody } from "@/lib/housing/http";
import { httpsUrl } from "@/lib/housing/model";
import { importApplyhome } from "@/lib/housing/applyhome";
export async function POST(req: Request) {
  try {
    const a = await authorize(req, true);
    if (a.error) return a.error;
    const { sourceUrl } = z
      .object({ sourceUrl: httpsUrl })
      .parse(await readBody(req, 3000));
    if (!process.env.APPLYHOME_SERVICE_KEY)
      return json(
        {
          error:
            "공공데이터포털 청약홈 API 키(APPLYHOME_SERVICE_KEY)가 필요합니다. 공고문 분석 또는 직접 입력을 이용해주세요.",
        },
        503,
      );
    return json({ notice: await importApplyhome(sourceUrl) });
  } catch (e) {
    return failure(e);
  }
}
