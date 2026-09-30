import { authorize, failure, json, readBody } from "@/lib/housing/http";
import { noticeSchema, todayKst } from "@/lib/housing/model";
import { saveNotice, getNotices } from "@/lib/housing/store";
export async function POST(req: Request) {
  try {
    const a = await authorize(req, true);
    if (a.error) return a.error;
    const body = await readBody(req);
    if (body.confirmed !== true)
      return json(
        { error: "공고 원문과 분석 내용을 대조한 뒤 확인해주세요" },
        400,
      );
    const notice = noticeSchema.parse({
      ...body.notice,
      reviewedAt: todayKst(),
    });
    const existing = (await getNotices()).find((n) => n.id === notice.id);
    if (existing && !notice.changeNote.trim())
      return json({ error: "정정 등록 시 변경 내용을 적어주세요" }, 400);
    await saveNotice(notice);
    return json({ notice });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: Request) {
  try {
    const a = await authorize(req, true);
    if (a.error) return a.error;
    const { id } = await readBody(req, 1000);
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(id))
      return json({ error: "공고번호 확인 필요" }, 400);
    await a.db.hset("housing:v1:notices", { [id]: null });
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
