import { NextRequest, NextResponse } from "next/server";

export type CheongakItem = {
  id: string;
  name: string;
  location: string;
  region: string;
  type: "apt" | "officetel" | "villa";
  supply: number;
  startDate: string;
  endDate: string;
  winDate: string;
  minPrice: number | null;
  maxPrice: number | null;
  areas: string[];
  conditions: string[];
  applyUrl: string;
  source: "demo" | "api";
};

// 공공데이터포털 청약 API (APTHOME_API_KEY 필요)
async function fetchLiveData(): Promise<CheongakItem[]> {
  const key = process.env.APTHOME_API_KEY;
  if (!key) return [];
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const url = `https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail?page=1&perPage=30&serviceKey=${key}&cond%5BRCRIT_PBLANC_DE%3A%3AGTE%5D=${yyyy}${mm}01`;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const json = await res.json() as {
      data?: Array<{
        HOUSE_NM: string; HSSPLY_ADRES: string; SUBSCRPT_AREA_CODE_NM: string;
        HOUSE_SECD_NM: string; TOT_SUPLY_HSHLDCO: string;
        RCRIT_PBLANC_DE: string; PRZWNER_PRESNATN_DE: string;
        SUBSCRPT_RCEPT_BGNDE: string; SUBSCRPT_RCEPT_ENDDE: string;
        HMPG_ADRES: string;
      }>;
      totalCount?: number;
    };
    return (json.data ?? []).map((d, i) => ({
      id: `api-${i}`,
      name: d.HOUSE_NM,
      location: d.HSSPLY_ADRES,
      region: d.SUBSCRPT_AREA_CODE_NM,
      type: d.HOUSE_SECD_NM?.includes("오피") ? "officetel" : "apt",
      supply: parseInt(d.TOT_SUPLY_HSHLDCO) || 0,
      startDate: d.SUBSCRPT_RCEPT_BGNDE ?? d.RCRIT_PBLANC_DE,
      endDate: d.SUBSCRPT_RCEPT_ENDDE ?? d.RCRIT_PBLANC_DE,
      winDate: d.PRZWNER_PRESNATN_DE ?? "",
      minPrice: null,
      maxPrice: null,
      areas: [],
      conditions: [],
      applyUrl: d.HMPG_ADRES || "https://www.applyhome.co.kr",
      source: "api" as const,
    }));
  } catch { return []; }
}

const DEMO: CheongakItem[] = [
  {
    id: "demo-1", name: "래미안 원펜타스", location: "서울시 서초구 반포동",
    region: "서울", type: "apt", supply: 641,
    startDate: "2026-05-20", endDate: "2026-05-22", winDate: "2026-06-05",
    minPrice: 150000, maxPrice: 250000, areas: ["59㎡", "84㎡"],
    conditions: ["무주택자 우선", "1순위 서울 거주 2년 이상"],
    applyUrl: "https://www.applyhome.co.kr", source: "demo",
  },
  {
    id: "demo-2", name: "힐스테이트 더 운정", location: "경기도 파주시 운정동",
    region: "경기", type: "apt", supply: 1240,
    startDate: "2026-05-25", endDate: "2026-05-27", winDate: "2026-06-10",
    minPrice: 42000, maxPrice: 65000, areas: ["59㎡", "74㎡", "84㎡"],
    conditions: ["무주택자", "청약통장 6개월 이상"],
    applyUrl: "https://www.applyhome.co.kr", source: "demo",
  },
  {
    id: "demo-3", name: "e편한세상 광주 첨단 퍼스트", location: "광주광역시 광산구 첨단동",
    region: "광주", type: "apt", supply: 488,
    startDate: "2026-06-02", endDate: "2026-06-04", winDate: "2026-06-18",
    minPrice: 28000, maxPrice: 45000, areas: ["59㎡", "84㎡"],
    conditions: ["무주택자", "광주 1순위"],
    applyUrl: "https://www.applyhome.co.kr", source: "demo",
  },
  {
    id: "demo-4", name: "더샵 판교 포레스트", location: "경기도 성남시 분당구 판교동",
    region: "경기", type: "apt", supply: 320,
    startDate: "2026-06-10", endDate: "2026-06-12", winDate: "2026-06-25",
    minPrice: 120000, maxPrice: 180000, areas: ["84㎡", "101㎡"],
    conditions: ["무주택자 우선", "1순위 경기 거주 1년 이상"],
    applyUrl: "https://www.applyhome.co.kr", source: "demo",
  },
  {
    id: "demo-5", name: "신흥역 하늘채 랜더스원", location: "인천광역시 남동구 신흥동",
    region: "인천", type: "apt", supply: 750,
    startDate: "2026-06-15", endDate: "2026-06-17", winDate: "2026-07-01",
    minPrice: 35000, maxPrice: 55000, areas: ["59㎡", "74㎡", "84㎡"],
    conditions: ["무주택자", "청약통장 12개월 이상"],
    applyUrl: "https://www.applyhome.co.kr", source: "demo",
  },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region");

  const live = await fetchLiveData();
  const items = live.length > 0 ? live : DEMO;

  const filtered = region && region !== "전체"
    ? items.filter((i) => i.region === region || i.location.includes(region))
    : items;

  return NextResponse.json({ items: filtered, isDemo: live.length === 0 });
}
