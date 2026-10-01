import { load } from "cheerio";
import { dateSchema, noticeSchema, type Notice, todayKst } from "./model";

const lhBase = "https://apply.lh.or.kr";
const seoulBase = "https://soco.seoul.go.kr";

function date(value: string): string | null {
  const normalized = value.trim().replace(/[.]/g, "-").replace(/-$/, "");
  return dateSchema.safeParse(normalized).success ? normalized : null;
}

function clock(value: string): string | null {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

async function readText(url: string, fetcher: typeof fetch): Promise<string> {
  const response = await fetcher(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw Error(`공식 청년주택 페이지 조회 실패: ${response.status}`);
  return response.text();
}

async function readJson(url: string, body: URLSearchParams, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw Error(`서울 청년안심주택 목록 조회 실패: ${response.status}`);
  return response.json();
}

export type LhYouthRow = {
  id: string;
  title: string;
  category: string;
  region: string;
  publishedAt: string;
  detailUrl: string;
};

export function parseLhYouthList(html: string): LhYouthRow[] {
  const $ = load(html);
  const rows: LhYouthRow[] = [];
  $("a.wrtancInfoBtn").each((_, element) => {
    const link = $(element);
    const cells = link.closest("tr").find("td");
    const id = link.attr("data-id1") ?? "";
    const ccr = link.attr("data-id2") ?? "";
    const upper = link.attr("data-id3") ?? "";
    const type = link.attr("data-id4") ?? "";
    const title = link.find("em").remove().end().text().replace(/\s+/g, " ").trim();
    const publishedAt = date($(cells[5]).text());
    if (!/^\d{8,20}$/.test(id) || !/^\d{2}$/.test(ccr) || !/^\d{2}$/.test(upper) || !/^\d{2}$/.test(type) || !publishedAt || !title)
      throw Error("LH 청년주택 목록 형식이 바뀌었습니다. 기존 자료를 유지합니다.");
    if (!title.includes("청년")) return;
    const detailUrl = new URL("/lhapply/apply/wt/wrtanc/selectWrtancInfo.do", lhBase);
    for (const [key, value] of Object.entries({ aisTpCd: type, ccrCnntSysDsCd: ccr, mi: "1026", panId: id, uppAisTpCd: upper }))
      detailUrl.searchParams.set(key, value);
    rows.push({ id, title, category: $(cells[1]).text().trim(), region: $(cells[3]).text().trim(), publishedAt, detailUrl: detailUrl.toString() });
  });
  return rows;
}

export function parseLhYouthDetail(row: LhYouthRow, html: string): Notice {
  const $ = load(html);
  const script = $("script").map((_, element) => $(element).html() ?? "").get().join("\n");
  const readVariable = (name: string) => script.match(new RegExp(`\\bvar\\s+${name}\\s*=\\s*['\"]([^'\"]*)`))?.[1] ?? "";
  const starts = date(readVariable("sbscAcpStDt"));
  const closes = date(readVariable("sbscAcpClsgDt"));
  const events: Notice["events"] = [];
  if (starts) events.push({ label: "청년주택 접수 시작", date: starts, type: "open", time: clock(readVariable("sbscAcpStHm")) });
  if (closes) events.push({ label: "청년주택 접수 마감", date: closes, type: "close", time: clock(readVariable("sbscAcpClsgHm")) });
  const result = $("li").filter((_, element) => $(element).text().includes("당첨자발표일")).first().text().match(/(20\d{2}\.\d{2}\.\d{2})/);
  if (result) events.push({ label: "당첨자 발표", date: date(result[1])!, type: "result", time: null });
  if (!events.length) events.push({ label: "공고 게시", date: row.publishedAt, type: "notice", time: null });
  return noticeSchema.parse({
    id: `lh-youth-${row.id}`,
    title: row.title,
    kind: "rent",
    audience: "youth",
    supplyType: `LH 청년주택 · ${row.category || "임대"}`,
    address: row.region.length <= 100 ? row.region : "",
    sourceUrl: row.detailUrl,
    applicationUrl: row.detailUrl,
    publishedAt: row.publishedAt,
    events,
    units: [{ id: "overview", name: "모집 주택 전체", area: null, rooms: null, price: null, monthlyRent: null }],
    priceNote: "지역·주택별 보증금과 월 임대료는 LH 모집공고문을 확인하세요.",
    changeNote: "LH 공식 공고 페이지의 게시일·접수일을 수집했습니다. 신청 자격·임대료·세부 위치는 원문에서 확인하세요.",
  });
}

export type SeoulYouthRow = {
  id: number;
  title: string;
  publishedAt: string;
  applicationDate: string | null;
  category: string;
  detailUrl: string;
};

export function parseSeoulYouthPage(input: unknown): { rows: SeoulYouthRow[]; pages: number } {
  if (!input || typeof input !== "object") throw Error("서울 청년안심주택 목록 형식 확인 필요");
  const value = input as Record<string, unknown>;
  const paging = value.pagingInfo as Record<string, unknown> | undefined;
  if (!Array.isArray(value.resultList) || !paging || !Number.isInteger(paging.totPage) || (paging.totPage as number) < 1)
    throw Error("서울 청년안심주택 목록 형식 확인 필요");
  const rows = value.resultList.map((item: unknown) => {
    const row = item as Record<string, unknown>;
    const id = Number(row.boardId);
    const title = String(row.nttSj ?? "").trim();
    const publishedAt = date(String(row.optn1 ?? ""));
    if (!Number.isSafeInteger(id) || id <= 0 || !title || !publishedAt)
      throw Error("서울 청년안심주택 공고 형식 확인 필요");
    return {
      id, title, publishedAt,
      applicationDate: date(String(row.optn4 ?? "")),
      category: String(row.optn2) === "1" ? "공공임대" : String(row.optn2) === "2" ? "민간임대" : "임대",
      detailUrl: `${seoulBase}/youth/bbs/BMSR00015/view.do?boardId=${id}&menuNo=400008`,
    };
  });
  return { rows, pages: paging.totPage as number };
}

export function parseSeoulYouthDetail(row: SeoulYouthRow, html: string): Notice {
  const $ = load(html);
  const location = $("p").map((_, element) => $(element).text().replace(/\s+/g, " ").trim()).get()
    .find((text) => /(?:주택위치|소재지)\s*[:：]/.test(text));
  const address = location?.match(/(?:주택위치|소재지)\s*[:：]\s*(.+)/)?.[1]?.replace(/[（(].*$/, "").trim() ?? "";
  const events: Notice["events"] = row.applicationDate
    ? [{ label: "청약신청일", date: row.applicationDate, type: "open", time: null }]
    : [{ label: "공고 게시", date: row.publishedAt, type: "notice", time: null }];
  return noticeSchema.parse({
    id: `seoul-youth-${row.id}`,
    title: row.title,
    kind: "rent",
    audience: "youth",
    supplyType: `서울 청년안심주택 · ${row.category}`,
    address: address.slice(0, 300),
    sourceUrl: row.detailUrl,
    applicationUrl: row.detailUrl,
    publishedAt: row.publishedAt,
    events,
    units: [{ id: "overview", name: "모집 주택 전체", area: null, rooms: null, price: null, monthlyRent: null }],
    priceNote: "보증금·월 임대료는 공급 유형과 주택형에 따라 다릅니다. 서울시 공고문을 확인하세요.",
    changeNote: "서울시 공식 목록의 청약신청일을 표시했습니다. 기간·시간·신청 링크·자격은 공고 상세와 첨부문서를 확인하세요.",
  });
}

async function inBatches<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const result: R[] = [];
  for (let i = 0; i < items.length; i += 5) result.push(...await Promise.all(items.slice(i, i + 5).map(fn)));
  return result;
}

export async function collectYouthHousing(now = new Date(), fetcher: typeof fetch = fetch): Promise<Notice[]> {
  const today = todayKst(now);
  const cutoffDate = new Date(`${today}T00:00:00+09:00`);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 45);
  const cutoff = todayKst(cutoffDate);
  const end = new Date(`${today}T00:00:00+09:00`);
  end.setUTCMonth(end.getUTCMonth() + 2);
  const lhListUrl = new URL("/lhapply/apply/wt/wrtanc/selectWrtancList.do", lhBase);
  for (const [key, value] of Object.entries({ mi: "1026", panNm: "청년", panSs: "", startDt: cutoff, endDt: todayKst(end), listCo: "100", viewType: "srch" }))
    lhListUrl.searchParams.set(key, value);
  const lhHtml = await readText(lhListUrl.toString(), fetcher);
  const $lh = load(lhHtml);
  const lhTotalText = $lh(".bbs_total strong").first().text().replace(/,/g, "").trim();
  const lhTotal = Number(lhTotalText);
  const lhCount = $lh("a.wrtancInfoBtn").length;
  if (!/^\d+$/.test(lhTotalText) || lhTotal !== lhCount || lhTotal > 100)
    throw Error("LH 청년주택 목록 건수가 맞지 않거나 페이지 한도를 넘었습니다. 기존 자료를 유지합니다.");
  const lhRows = parseLhYouthList(lhHtml);
  const lh = await inBatches(lhRows.filter((row) => row.publishedAt >= cutoff), async (row) =>
    parseLhYouthDetail(row, await readText(row.detailUrl, fetcher)));

  const seoulRows: SeoulYouthRow[] = [];
  let pages = 1;
  for (let page = 1; page <= pages; page++) {
    if (page > 20) throw Error("서울 청년안심주택 목록이 안전 한도를 넘었습니다. 기존 자료를 유지합니다.");
    const parsed = parseSeoulYouthPage(await readJson(`${seoulBase}/youth/pgm/home/yohome/bbsListJson.json`, new URLSearchParams({
      bbsId: "BMSR00015", pageIndex: String(page), searchAdresGu: "", searchCondition: "1", searchKeyword: "", optn2: "", optn5: "",
    }), fetcher));
    if (page === 1 && !parsed.rows.length) throw Error("서울 청년안심주택 목록이 비어 있습니다. 기존 자료를 유지합니다.");
    seoulRows.push(...parsed.rows.filter((row) => row.publishedAt >= cutoff));
    pages = parsed.pages;
    if (!parsed.rows.length || parsed.rows.every((row) => row.publishedAt < cutoff)) break;
  }
  const seoul = await inBatches(seoulRows, async (row) =>
    parseSeoulYouthDetail(row, await readText(row.detailUrl, fetcher)));
  const notices = [...lh, ...seoul];
  if (new Set(notices.map((notice) => notice.id)).size !== notices.length) throw Error("청년주택 공고 ID가 중복됐습니다.");
  return notices;
}
