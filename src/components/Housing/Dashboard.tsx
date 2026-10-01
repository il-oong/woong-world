"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { type HousingData } from "@/lib/housing/load";
import {
  type Commute,
  type Notice,
  applicationStatus,
  isClosed,
  won,
} from "@/lib/housing/model";
import { rankNotices } from "@/lib/housing/scoring";
import { eventsThroughNextMonth, scheduleWindow } from "@/lib/housing/schedule";
import { Bars, button, HousingHeader, panel, request } from "./shared";
const eventStyle = {
  notice: "bg-sky-300/15 text-sky-200",
  open: "bg-teal-300/15 text-teal-200",
  close: "bg-rose-400/15 text-rose-200",
  result: "bg-violet-400/15 text-violet-200",
  contract: "bg-amber-300/15 text-amber-200",
};
type EventType = Notice["events"][number]["type"];
const eventTypes: { type: EventType; label: string }[] = [
  { type: "notice", label: "공고 게시" },
  { type: "open", label: "접수 시작" },
  { type: "close", label: "접수 마감" },
  { type: "result", label: "당첨 발표" },
  { type: "contract", label: "계약" },
];
export function Dashboard({
  data,
  today,
}: {
  data: HousingData;
  today: string;
}) {
  const [month, setMonth] = useState(today.slice(0, 7)),
    [day, setDay] = useState<string | null>(null),
    [filter, setFilter] = useState("all"),
    [housingType, setHousingType] = useState<"all" | "sale" | "youth">("all"),
    [enabledTypes, setEnabledTypes] = useState<EventType[]>(eventTypes.map((e) => e.type)),
    [favorites, setFavorites] = useState(data.favorites),
    [message, setMessage] = useState(""),
    [commutes, setCommutes] = useState(data.commutes),
    [busy, setBusy] = useState(false),
    [favBusy, setFavBusy] = useState<string | null>(null);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const compared = useMemo(() => rankNotices(data.notices.filter((n) => !isClosed(n) ||
    (day !== null && n.events.some((e) => e.date === day))), data.profile, commutes,
    new Date(`${today}T00:00:00+09:00`), data.notices), [data.notices, data.profile, commutes, today, day]);
  const ranked = compared.filter((r) => !isClosed(r.notice));
  const rankMap = new Map(
    ranked
      .filter(
        (r) => !r.assessment.blockers.length && r.assessment.total !== null,
      )
      .map((r, i) => [r.notice.id, i + 1]),
  );
  const visible = data.notices.filter((n) =>
    (housingType === "all" || (housingType === "youth" ? n.audience === "youth" : n.kind === "sale")) &&
    (filter === "favorites"
      ? favorites.includes(n.id)
      : filter === "recommended"
        ? rankMap.has(n.id)
        : true),
  );
  const visibleIds = new Set(visible.map((n) => n.id));
  const showEvent = (type: EventType) => enabledTypes.includes(type);
  const schedule = scheduleWindow(today);
  const upcoming = eventsThroughNextMonth(visible, today, enabledTypes);
  const cards = compared.filter(({ notice: n }) => visibleIds.has(n.id) &&
    (day ? n.events.some((e) => e.date === day && showEvent(e.type)) : !isClosed(n)));
  const [year, mon] = month.split("-").map(Number),
    offset = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay(),
    days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  function shift(delta: number) {
    const d = new Date(Date.UTC(year, mon - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
    setDay(null);
  }
  async function favorite(id: string) {
    if (favBusy) return;
    setFavBusy(id);
    try {
      const selected = !favorites.includes(id);
      await request("/api/housing/favorites", "POST", { id, selected });
      setFavorites((prev) =>
        selected ? [...prev, id] : prev.filter((v) => v !== id),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setFavBusy(null);
    }
  }
  async function traffic() {
    setBusy(true);
    setMessage("");
    let success = 0,
      failed = 0;
    for (const n of visible.filter((n) => !isClosed(n) && n.point).slice(0, 20)) {
      try {
        const r = await request<{ commute: Commute }>(
          "/api/housing/commute",
          "POST",
          { id: n.id },
        );
        setCommutes((prev) => ({ ...prev, [n.id]: r.commute }));
        success++;
      } catch {
        failed++;
      }
    }
    setMessage(
      `교통 조회 ${success}건 완료${failed ? ` · ${failed}건 확인 필요 (서비스 설정·주소 확인)` : ""}. 한 번에 최대 20건을 조회합니다.`,
    );
    setBusy(false);
  }
  return (
    <>
      <HousingHeader
        title="다음 집을 고르는 나만의 기준"
        description="일정을 놓치지 않고, 내 생활에 맞는 청약부터 살펴보세요."
      >
        <Link href="/housing/profile" className={button}>
          {data.profile ? "내 정보 수정" : "내 정보 등록"}
        </Link>
        {data.admin && (
          <Link href="/housing/manage" className={button}>
            공고 등록·분석
          </Link>
        )}
      </HousingHeader>
      <p className="mb-5 text-xs text-slate-400">
        {data.feedUpdatedAt
          ? `청약홈·LH·서울시 공고 갱신: ${new Date(data.feedUpdatedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} · 자격과 임대조건은 공고문 확인 여부를 별도 표시합니다.`
          : "공식 청약 공고 자동 갱신 준비 중 · 확인된 공고부터 표시합니다."}
      </p>
      {data.error && (
        <p role="alert" className={`${panel} mb-5 text-amber-200`}>
          {data.error}
        </p>
      )}
      {!data.profile && (
        <div className="mb-6 rounded-2xl border border-teal-300/20 bg-teal-300/5 px-6 py-5">
          <p className="font-medium text-teal-100">
            분양가·면적으로 먼저 비교해보세요
          </p>
          <p className="mt-2 text-sm text-slate-400">
            등록 전에도 공급가·주택형으로 예비 순위를 보여줍니다. 내 예산,
            직장 주소, 선호 지역을 저장하면 본인 기준으로 비교합니다.
          </p>
        </div>
      )}
      <section className={`${panel} !p-3 sm:!p-6`} aria-label="청약 일정 달력">
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="주택 종류 필터">
          {([["all", "전체 주택"], ["sale", "분양"], ["youth", "청년주택"]] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={housingType === value}
              onClick={() => { setHousingType(value); setDay(null); }}
              className={`rounded-lg border px-3 py-1.5 text-sm ${housingType === value ? "border-teal-300 bg-teal-300 text-slate-950" : "border-white/10 text-slate-300 hover:bg-white/5"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              className={button}
              onClick={() => shift(-1)}
              aria-label="이전 달"
            >
              ‹
            </button>
            <h2 className="text-xl font-semibold tabular-nums">
              {year}년 {mon}월
            </h2>
            <button
              className={button}
              onClick={() => shift(1)}
              aria-label="다음 달"
            >
              ›
            </button>
            <button
              className={`${button} hidden sm:block`}
              onClick={() => {
                setMonth(today.slice(0, 7));
                setDay(null);
              }}
            >
              오늘
            </button>
          </div>
          <div className="flex gap-1">
            {[
              ["all", "전체 일정"],
              ["recommended", "예비 추천"],
              ["favorites", "관심 청약"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`rounded-lg px-3 py-2 text-xs ${filter === value ? "bg-teal-300 text-slate-950" : "text-slate-400 hover:bg-white/5"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="달력 일정 종류 필터">
          <span className="mr-1 text-xs text-slate-400">일정 표시</span>
          {eventTypes.map(({ type, label }) => (
            <button key={type} type="button" aria-pressed={showEvent(type)}
              onClick={() => setEnabledTypes((current) => current.includes(type)
                ? current.filter((value) => value !== type)
                : [...current, type])}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${showEvent(type)
                ? `${eventStyle[type]} border-current`
                : "border-white/10 text-slate-500 hover:text-slate-300"}`}>
              {showEvent(type) ? "●" : "○"} {label}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-0">
            <div className="grid grid-cols-7">
              {["일", "월", "화", "수", "목", "금", "토"].map((v, i) => (
                <div
                  key={v}
                  className={`pb-3 text-center text-xs ${i === 0 ? "text-rose-300" : "text-slate-500"}`}
                >
                  {v}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10">
              {Array.from(
                { length: Math.ceil((offset + days) / 7) * 7 },
                (_, i) => {
                  const num = i - offset + 1;
                  const date = `${month}-${String(num).padStart(2, "0")}`;
                  const events = visible.flatMap((n) =>
                    n.events
                      .filter((e) => e.date === date && showEvent(e.type))
                      .map((e) => ({ n, e })),
                  );
                  return (
                    <div
                      key={i}
                      className={`min-h-24 min-w-0 p-1 sm:min-h-28 sm:p-2 ${date === day ? "bg-[#183338]" : "bg-[#111720]"}`}
                    >
                      {num > 0 && num <= days && (
                        <>
                          <button
                            aria-label={`${date} 일정 보기`}
                            onClick={() => setDay(date)}
                            className={`mb-2 grid h-7 w-7 place-items-center rounded-full text-xs ${date === today ? "bg-teal-300 text-slate-950" : "text-slate-300 hover:bg-white/10"}`}
                          >
                            {num}
                          </button>
                          <div className="space-y-1">
                            {events.map(({ n, e }, j) => (
                              <Link
                                key={`${n.id}-${j}`}
                                href={`/housing/${n.id}`}
                                className={`block truncate rounded px-1.5 py-1 text-[10px] sm:text-xs ${eventStyle[e.type]}`}
                                aria-label={`${n.title} · ${e.label}`}
                                title={`${n.title} · ${e.label}`}
                              >
                                {favorites.includes(n.id) ? "★ " : ""}{n.title}
                              </Link>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-400">
          색상별 일정은 위 필터에서 켜고 끌 수 있습니다 · 한국시간 기준
          <span className="sm:hidden"> · 날짜를 눌러 목록 보기</span>
        </p>
      </section>
      <section className="mt-6" aria-label="다가오는 청약 일정">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">
          기준일 다음 달까지의 일정
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          {today} 기준 · {schedule.end}까지 · 현재 발표된 공고만 집계하며 새 공고는 매일 갱신됩니다.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {schedule.months.map((monthKey) => {
            const monthly = upcoming.filter(({ event }) => event.date.startsWith(monthKey));
            return <div key={monthKey} className="rounded-xl border border-white/10 bg-white/[.02] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-semibold">{Number(monthKey.slice(0, 4))}년 {Number(monthKey.slice(5))}월 · {monthly.length}건</h3>
                <button type="button" className="text-xs text-teal-200 underline" onClick={() => { setMonth(monthKey); setDay(null); }}>
                  달력 보기
                </button>
              </div>
              <div className="space-y-2">
                {monthly.slice(0, showAllUpcoming ? undefined : 3).map(({ notice, event }, index) =>
                  <Link href={`/housing/${notice.id}`} key={`${notice.id}-${event.date}-${event.label}-${index}`}
                    className="block rounded-lg border border-white/10 p-2.5 hover:border-teal-300/30">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${eventStyle[event.type]}`}>{event.label}</span>
                    <span className="ml-2 text-xs text-slate-400">{event.date}</span>
                    <p className="mt-1.5 truncate text-sm">{notice.title}</p>
                  </Link>,
                )}
                {!monthly.length && <p className="text-xs text-slate-500">현재 발표된 일정이 없습니다.</p>}
              </div>
            </div>;
          })}
        </div>
        {schedule.months.some((monthKey) => upcoming.filter(({ event }) => event.date.startsWith(monthKey)).length > 3) &&
        <button type="button" className={`${button} mt-3`} onClick={() => setShowAllUpcoming((value) => !value)}>
          {showAllUpcoming ? "일정 접기" : `두 달 전체 일정 ${upcoming.length}건 보기`}
        </button>}
      </section>
      <section className="mt-9">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              {day
                ? `${day} 청약 일정`
                : data.profile
                  ? "나에게 맞는 추천 청약"
                  : housingType === "youth" ? "청년주택 일정·조건" : "분양가·면적 예비 비교"}
            </h2>
            <p className="mt-2 text-xs text-slate-400">
              확인된 항목과 추정값의 가중평균 순 · 항목별 추정 근거는 상세에서 확인 · 실제 당첨 순위와 다릅니다.
            </p>
          </div>
          <div className="flex gap-2">
            {day && (
              <button className={button} onClick={() => setDay(null)}>
                날짜 선택 해제
              </button>
            )}
            {data.profile && (
              <button
                className={button}
                disabled={busy || !data.notices.length}
                onClick={traffic}
              >
                {busy ? "교통 분석 중…" : "내 직장 기준 교통 반영"}
              </button>
            )}
          </div>
        </div>
        <p role="status" className="mb-3 text-sm text-amber-200">
          {message}
        </p>
        {!cards.length && (
          <div className={`${panel} py-14 text-center`}>
            <p className="text-lg">
              {data.notices.length
                ? "선택한 조건에 해당하는 청약이 없습니다"
                : "아직 등록된 청약 공고가 없습니다"}
            </p>
            <p className="mt-3 text-sm text-slate-400">
              {data.notices.length
                ? "전체 일정이나 다른 날짜를 선택해보세요."
                : "공식 공고를 등록하면 이곳에 일정과 분석 결과가 표시됩니다."}
            </p>
            <a
              className={`${button} mt-5`}
              href={housingType === "youth" ? "https://soco.seoul.go.kr/youth/bbs/BMSR00015/list.do?menuNo=400008" : "https://www.applyhome.co.kr"}
              target="_blank"
              rel="noopener noreferrer"
            >
              {housingType === "youth" ? "서울 청년안심주택 공고 확인 ↗" : "청약홈 확인 ↗"}
            </a>
          </div>
        )}
        <div className="grid gap-5 lg:grid-cols-2">
          {cards.map(({ notice: n, unit, assessment: a }) => (
            <article
              key={n.id}
              className={`${panel} relative transition hover:border-teal-300/30`}
            >
              <Link
                href={`/housing/${n.id}?unit=${encodeURIComponent(unit.id)}`}
                className="block rounded-lg focus-visible:outline-2 focus-visible:outline-teal-300"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-teal-300">
                    {rankMap.has(n.id)
                      ? `${data.profile ? "내 예비 추천" : "예비 비교"} ${rankMap.get(n.id)}위`
                      : a.blockers.length
                        ? "조건 확인 필요"
                        : "분석 대기"}
                  </span>
                  <span className="text-xs text-slate-400">
                    {applicationStatus(n)}
                  </span>
                </div>
                <div className="my-5 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold">{n.title}</h3>
                    <p className="mt-2 text-xs text-slate-400">
                      {n.supplyType} · {unit.name} · {n.kind === "rent" ? `보증금 ${won(unit.price)}` : won(unit.price)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <strong className="text-3xl text-teal-200">
                      {a.total ?? "—"}
                    </strong>
                    <p className="text-[10px] text-slate-500">
                      {a.total === null ? "비교 자료 부족" : a.provisional ? "예비 점수" : "종합점수"}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">{a.measuredCount ?? 0}/5항목 · 평가 비중 {a.coverage}%</p>
                  </div>
                </div>
                <Bars assessment={a} compact />
                <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400">
                  {a.blockers.length
                    ? a.blockers.join(" · ")
                    : a.total === null
                      ? "내 정보나 비교 자료가 필요합니다. 상세에서 필요한 정보를 확인하세요."
                      : a.provisional
                        ? "일부 항목만 평가한 예비 비교입니다. 추정 점수는 실제 교통·입지·투자 분석과 다를 수 있습니다."
                        : "현재 확인한 항목으로 비교한 결과입니다. 신청 자격은 공고 원문을 확인하세요."}
                </p>
                <span className="mt-3 inline-block text-sm text-teal-200">
                  상세 분석 보기 →
                </span>
              </Link>
              <button
                disabled={favBusy !== null}
                className={`${button} mt-4`}
                aria-pressed={favorites.includes(n.id)}
                onClick={() => favorite(n.id)}
              >
                {favorites.includes(n.id) ? "★ 관심 등록됨" : "☆ 관심 등록"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
