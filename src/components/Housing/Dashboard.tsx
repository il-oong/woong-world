"use client";
import { useState } from "react";
import Link from "next/link";
import { type HousingData } from "@/lib/housing/load";
import {
  type Commute,
  applicationStatus,
  isClosed,
  won,
} from "@/lib/housing/model";
import { rankNotices } from "@/lib/housing/scoring";
import { Bars, button, HousingHeader, panel, request } from "./shared";
const eventStyle = {
  open: "bg-teal-300/15 text-teal-200",
  close: "bg-rose-400/15 text-rose-200",
  result: "bg-violet-400/15 text-violet-200",
  contract: "bg-amber-300/15 text-amber-200",
};
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
    [favorites, setFavorites] = useState(data.favorites),
    [message, setMessage] = useState(""),
    [commutes, setCommutes] = useState(data.commutes),
    [busy, setBusy] = useState(false),
    [favBusy, setFavBusy] = useState<string | null>(null);
  const ranked = rankNotices(
    data.notices.filter((n) => !isClosed(n)),
    data.profile,
    commutes,
  );
  const rankMap = new Map(
    ranked
      .filter(
        (r) => !r.assessment.blockers.length && r.assessment.total !== null,
      )
      .map((r, i) => [r.notice.id, i + 1]),
  );
  const visible = data.notices.filter((n) =>
    filter === "favorites"
      ? favorites.includes(n.id)
      : filter === "recommended"
        ? rankMap.has(n.id)
        : true,
  );
  const cards = rankNotices(
    visible.filter((n) =>
      day ? n.events.some((e) => e.date === day) : !isClosed(n),
    ),
    data.profile,
    commutes,
  );
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
    for (const n of data.notices.filter((n) => !isClosed(n)).slice(0, 20)) {
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
          ? `공식 청약홈 기본정보 갱신: ${new Date(data.feedUpdatedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} · 자격과 전매제한은 공고문 확인 여부를 별도 표시합니다.`
          : "공식 청약홈 자동 갱신 준비 중 · 확인된 공고부터 표시합니다."}
      </p>
      {data.error && (
        <p role="alert" className={`${panel} mb-5 text-amber-200`}>
          {data.error}
        </p>
      )}
      {!data.profile && (
        <div className="mb-6 rounded-2xl border border-teal-300/20 bg-teal-300/5 px-6 py-5">
          <p className="font-medium text-teal-100">
            나에게 맞는 추천을 시작해보세요
          </p>
          <p className="mt-2 text-sm text-slate-400">
            예산, 직장, 원하는 집을 등록하면 다섯 가지 능력치로 비교할 수
            있습니다. 등록 전에는 전체 일정이 표시됩니다.
          </p>
        </div>
      )}
      <section className={`${panel} !p-3 sm:!p-6`} aria-label="청약 일정 달력">
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
              ["recommended", "내 추천"],
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
                      .filter((e) => e.date === date)
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
                                title={`${n.title} · ${e.label}`}
                              >
                                <span>
                                  {favorites.includes(n.id) ? "★ " : ""}
                                  {e.label}
                                </span>
                                <span className="block truncate font-medium">
                                  {n.title}
                                </span>
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
          🟢 접수 시작 · 🔴 마감 · 🟣 발표 · 🟡 계약 · 한국시간 기준
          <span className="sm:hidden"> · 날짜를 눌러 목록 보기</span>
        </p>
      </section>
      <section className="mt-6" aria-label="다가오는 청약 일정">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">
          다가오는 일정
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {visible
            .flatMap((n) =>
              n.events.filter((e) => e.date >= today).map((e) => ({ n, e })),
            )
            .sort((a, b) => a.e.date.localeCompare(b.e.date))
            .slice(0, 3)
            .map(({ n, e }, i) => (
              <Link
                href={`/housing/${n.id}`}
                key={`${n.id}-${i}`}
                className="rounded-xl border border-white/10 bg-white/[.02] p-4 hover:border-teal-300/30"
              >
                <span className="text-xs text-teal-300">
                  {e.date} · {e.label}
                </span>
                <p className="mt-2 truncate text-sm">{n.title}</p>
              </Link>
            ))}
        </div>
        {!visible.some((n) => n.events.some((e) => e.date >= today)) && (
          <p className="text-xs text-slate-500">등록된 예정 일정이 없습니다.</p>
        )}
      </section>
      <section className="mt-9">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              {day
                ? `${day} 청약 일정`
                : data.profile
                  ? "나에게 맞는 추천 청약"
                  : "접수 중·예정 청약"}
            </h2>
            <p className="mt-2 text-xs text-slate-400">
              조건 충족 후보 → 종합점수 순 · 정보가 부족하면 순위 보류 · 실제
              당첨 순위와 다릅니다.
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
              href="https://www.applyhome.co.kr"
              target="_blank"
              rel="noopener noreferrer"
            >
              청약홈 확인 ↗
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
                      ? `내 추천 ${rankMap.get(n.id)}위`
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
                      {n.supplyType} · {unit.name} · {won(unit.price)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <strong className="text-3xl text-teal-200">
                      {a.total ?? "—"}
                    </strong>
                    <p className="text-[10px] text-slate-500">
                      {a.total === null ? `분석 ${a.coverage}%` : "종합점수"}
                    </p>
                  </div>
                </div>
                <Bars assessment={a} compact />
                <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400">
                  {a.blockers.length
                    ? a.blockers.join(" · ")
                    : a.total === null
                      ? "아직 확인할 정보가 있어 추천 순위를 보류합니다."
                      : "입력한 필수 조건에 맞는 후보입니다. 세부 자격은 원문을 확인하세요."}
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
