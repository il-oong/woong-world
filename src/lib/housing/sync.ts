import { fetchApplyhomePage, fromApplyhome, type ApplyhomeRow } from "./applyhome";
import { dateSchema, type Notice, todayKst } from "./model";

type Page = { data: ApplyhomeRow[]; totalCount: number };
type Reader = typeof fetchApplyhomePage;
const LIMIT = 500;

export async function collectHousing(now = new Date(), read: Reader = fetchApplyhomePage): Promise<{ updatedAt: string; notices: Notice[] }> {
  const today = todayKst(now);
  const cutoff = new Date(`${today}T00:00:00+09:00`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 45);
  const filters = { "cond[RCRIT_PBLANC_DE::GTE]": todayKst(cutoff) };
  const first: Page = await read("getAPTLttotPblancDetail", 1, filters);
  if (first.totalCount > LIMIT) throw Error(`최근 45일 공고 ${first.totalCount}건이 안전 한도 ${LIMIT}건을 초과했습니다. 수집 범위를 점검하세요.`);
  const rows = [...first.data];
  for (let page = 2; rows.length < first.totalCount; page++) {
    const next = await read("getAPTLttotPblancDetail", page, filters);
    if (next.totalCount !== first.totalCount || !next.data.length) throw Error("청약홈 페이지 자료가 조회 중 변경됐습니다. 기존 자료를 유지합니다.");
    rows.push(...next.data);
  }
  if (rows.length !== first.totalCount || (first.totalCount === 0 && rows.length === 0))
    throw Error("청약홈 조회 결과가 비어 있습니다. 기존 자료를 유지합니다.");
  const eligible = rows.filter((row) =>
    String(row.RENT_SECD ?? "") === "0" &&
    dateSchema.safeParse(String(row.RCRIT_PBLANC_DE ?? "")).success &&
    String(row.PBLANC_NO ?? "").length === 10,
  );
  if (!eligible.length) throw Error("분양 공고를 확인하지 못했습니다. 기존 자료를 유지합니다.");
  const notices: Notice[] = [];
  for (let i = 0; i < eligible.length; i += 5) {
    const batch = await Promise.all(eligible.slice(i, i + 5).map(async (row) => {
      const query = {
        "cond[HOUSE_MANAGE_NO::EQ]": String(row.HOUSE_MANAGE_NO),
        "cond[PBLANC_NO::EQ]": String(row.PBLANC_NO),
      };
      const models = await read("getAPTLttotPblancMdl", 1, query);
      if (!models.totalCount || models.totalCount > 100 || models.data.length !== models.totalCount)
        throw Error(`${row.PBLANC_NO} 주택형 자료가 불완전합니다. 기존 자료를 유지합니다.`);
      return fromApplyhome(row, models.data);
    }));
    notices.push(...batch);
  }
  if (new Set(notices.map((n) => n.id)).size !== notices.length) throw Error("공고번호 중복 확인 필요");
  return { updatedAt: now.toISOString(), notices: notices.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id)) };
}
