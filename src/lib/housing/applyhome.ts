import { noticeSchema, dateSchema, type Notice } from "./model";
type Row = Record<string, string | number | null>;
const str = (r: Row, k: string) => String(r[k] ?? "");
export function fromApplyhome(detail: Row, models: Row[]): Notice {
  const house = str(detail, "HOUSE_MANAGE_NO"),
    id = str(detail, "PBLANC_NO");
  const sourceUrl = `https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=${house}&pblancNo=${id}`;
  const events: Notice["events"] = [];
  for (const [field, label, type] of [
    ["SPSPLY_RCEPT_BGNDE", "특별공급 시작", "open"],
    ["SPSPLY_RCEPT_ENDDE", "특별공급 마감", "close"],
    ["GNRL_RNK1_CRSPAREA_RCPTDE", "1순위 해당지역 시작", "open"],
    ["GNRL_RNK1_CRSPAREA_ENDDE", "1순위 해당지역 마감", "close"],
    ["GNRL_RNK1_ETC_GG_RCPTDE", "1순위 경기지역 시작", "open"],
    ["GNRL_RNK1_ETC_GG_ENDDE", "1순위 경기지역 마감", "close"],
    ["GNRL_RNK1_ETC_AREA_RCPTDE", "1순위 기타지역 시작", "open"],
    ["GNRL_RNK1_ETC_AREA_ENDDE", "1순위 기타지역 마감", "close"],
    ["GNRL_RNK2_CRSPAREA_RCPTDE", "2순위 해당지역 시작", "open"],
    ["GNRL_RNK2_CRSPAREA_ENDDE", "2순위 해당지역 마감", "close"],
    ["GNRL_RNK2_ETC_GG_RCPTDE", "2순위 경기지역 시작", "open"],
    ["GNRL_RNK2_ETC_GG_ENDDE", "2순위 경기지역 마감", "close"],
    ["GNRL_RNK2_ETC_AREA_RCPTDE", "2순위 기타지역 시작", "open"],
    ["GNRL_RNK2_ETC_AREA_ENDDE", "2순위 기타지역 마감", "close"],
    ["RCEPT_BGNDE", "전체 접수 시작", "open"],
    ["RCEPT_ENDDE", "전체 접수 마감", "close"],
    ["PRZWNER_PRESNATN_DE", "당첨 발표", "result"],
    ["CNTRCT_CNCLS_BGNDE", "계약 시작", "contract"],
    ["CNTRCT_CNCLS_ENDDE", "계약 마감", "contract"],
  ] as const) {
    const date = dateSchema.safeParse(str(detail, field));
    if (date.success) events.push({ label, type, date: date.data, time: null });
  }
  if (str(detail, "RENT_SECD") !== "0")
    throw Error("분양전환 임대는 별도 공고 분석이 필요합니다");
  return noticeSchema.parse({
    id,
    title: str(detail, "HOUSE_NM"),
    kind: "sale",
    supplyType: str(detail, "HOUSE_DTL_SECD_NM") || "APT 분양",
    address: str(detail, "HSSPLY_ADRES"),
    publishedAt: str(detail, "RCRIT_PBLANC_DE"),
    sourceUrl,
    applicationUrl: sourceUrl,
    events,
    units: models.map((m) => ({
      id: str(m, "MODEL_NO"),
      name: `${str(m, "HOUSE_TY")} (최고 공급금액)`,
      area: null,
      price: str(m, "LTTOT_TOP_AMOUNT").trim()
        ? Number(str(m, "LTTOT_TOP_AMOUNT").replaceAll(",", "")) * 10000
        : null,
    })),
    // SUPLY_AR is supply area, not exclusive area. Never substitute it.
    changeNote:
      "공공데이터에서 가져온 주택형별 최고 공급금액입니다. 전용면적·층별 가격·납부 일정·필수정보는 모집공고 원문 대조가 필요합니다.",
  });
}
export async function importApplyhome(sourceUrl: string) {
  const u = new URL(sourceUrl);
  if (
    u.hostname !== "www.applyhome.co.kr" ||
    u.pathname !== "/ai/aia/selectAPTLttotPblancDetail.do"
  )
    throw Error("APT 청약홈 공고 링크를 입력해주세요");
  const house = u.searchParams.get("houseManageNo"),
    id = u.searchParams.get("pblancNo");
  if (!house || !id || !/^\d{10}$/.test(house) || !/^\d{10}$/.test(id))
    throw Error("공고번호가 올바르지 않습니다");
  const key = process.env.APPLYHOME_SERVICE_KEY;
  if (!key) throw Error("공공데이터포털 청약홈 서비스 키가 필요합니다");
  async function get(endpoint: string) {
    const url = new URL(
      `https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/${endpoint}`,
    );
    for (const [k, v] of Object.entries({
      serviceKey: key!,
      page: "1",
      perPage: "100",
      "cond[HOUSE_MANAGE_NO::EQ]": house!,
      "cond[PBLANC_NO::EQ]": id!,
    }))
      url.searchParams.set(k, v);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    if (!response.ok) throw Error("청약홈 데이터 조회 실패");
    const data = await response.json();
    if (!Array.isArray(data.data) || data.totalCount > 100)
      throw Error("공고 데이터 확인 필요");
    return data.data as Row[];
  }
  const [details, models] = await Promise.all([
    get("getAPTLttotPblancDetail"),
    get("getAPTLttotPblancMdl"),
  ]);
  if (details.length !== 1 || !models.length)
    throw Error("공고를 찾지 못했습니다");
  return fromApplyhome(details[0], models);
}
