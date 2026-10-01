"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  type Notice,
  noticeSchema,
  ruleKeys,
  ruleLabels,
  amenities,
} from "@/lib/housing/model";
import {
  button,
  input,
  panel,
  HousingHeader,
  request,
  External,
} from "./shared";
function blank(): Notice {
  return {
    id: "",
    title: "",
    kind: "sale",
    audience: "general",
    supplyType: "",
    address: "",
    sourceUrl: "",
    applicationUrl: "",
    publishedAt: "",
    point: null,
    moveIn: null,
    moveInNote: "",
    priceNote: "",
    locationUrl: null,
    locationImageUrl: null,
    events: [],
    units: [],
    rules: [],
    requirements: {
      accountRequired: null,
      accountMonths: null,
      accountDeposit: null,
      homelessRequired: null,
    },
    nearby: [],
    comparable: null,
    reviewedAt: null,
    changeNote: "",
  };
}
function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number | null;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-xs text-slate-300">
      {label}
      <input
        className={input}
        type={type}
        step={type === "number" ? "any" : undefined}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
const num = (v: string) => (v === "" ? null : Number(v));
export function NoticeManager({ notices }: { notices: Notice[] }) {
  const [draft, setDraft] = useState<Notice>(blank),
    [text, setText] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  function edit<K extends keyof Notice>(key: K, value: Notice[K]) {
    setDraft((p) => ({ ...p, [key]: value }));
    setConfirmed(false);
  }
  async function operation(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setBusy(false);
    }
  }
  async function load(mode: "import" | "analyze") {
    await operation(async () => {
      const r = await request<{ notice: Notice }>(
        `/api/housing/${mode}`,
        "POST",
        { sourceUrl: draft.sourceUrl, text },
      );
      setDraft(r.notice);
      setConfirmed(false);
      setMessage(
        "초안을 가져왔습니다. 아래 내용을 원문과 대조한 뒤 저장해주세요.",
      );
    });
  }
  function unitEdit(index: number, key: string, value: unknown) {
    edit(
      "units",
      draft.units.map((u, i) => (i === index ? { ...u, [key]: value } : u)),
    );
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    await operation(async () => {
      const parsed = noticeSchema.safeParse(draft);
      if (!parsed.success)
        throw Error(
          parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" / "),
        );
      await request("/api/housing/notices", "POST", {
        notice: parsed.data,
        confirmed,
      });
      router.push(`/housing/${draft.id}`);
      router.refresh();
    });
  }
  return (
    <>
      <HousingHeader
        title="공고 등록·사전 분석"
        description="공식 공고를 가져와 내용을 검토하고 공개합니다. AI 분석은 초안이며 확인되지 않은 조건은 비워둡니다."
      >
        <Link href="/housing" className={button}>
          달력으로
        </Link>
      </HousingHeader>
      <div className={`${panel} mb-6`}>
        <label className="text-sm">
          기존 공고 수정
          <select
            className={input}
            value={notices.some((n) => n.id === draft.id) ? draft.id : ""}
            onChange={(e) => {
              setDraft(notices.find((n) => n.id === e.target.value) ?? blank());
              setConfirmed(false);
              setText("");
            }}
          >
            <option value="">새 공고</option>
            {notices.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title} · {n.id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <form onSubmit={save} className="space-y-6">
        <section className={panel}>
          <h2 className="mb-5 text-lg font-semibold">01 / 공고 가져오기</h2>
          <Field
            label="공식 공고 주소 (청약홈 APT 링크 자동 조회 지원)"
            value={draft.sourceUrl}
            onChange={(v) => edit("sourceUrl", v)}
            type="url"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={busy || !draft.sourceUrl}
              onClick={() => load("import")}
            >
              청약홈 기본정보 가져오기
            </button>
            {draft.sourceUrl.startsWith("https://") && (
              <External href={draft.sourceUrl}>원문 열기</External>
            )}
          </div>
          <label className="mt-5 block text-sm">
            공고문 텍스트 (페이지 번호를 함께 붙여넣기)
            <textarea
              className={`${input} min-h-40`}
              maxLength={70000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="청약 자격, 전매제한, 공급금액, 납부 일정 등 공고문 내용을 붙여넣으세요."
            />
          </label>
          <p className="my-3 text-xs text-slate-400">
            분석 시 붙여넣은 공고문을 Google Gemini로 전송합니다. 개인정보는
            넣지 마세요. 자동 분석은 현재 편집 중인 초안을 대체합니다.
          </p>
          <button
            type="button"
            className={button}
            disabled={busy || text.length < 100 || !draft.sourceUrl}
            onClick={() => load("analyze")}
          >
            {busy ? "처리 중…" : "공고문으로 필수정보 분석"}
          </button>
        </section>
        <section className={panel}>
          <h2 className="mb-5 text-lg font-semibold">02 / 기본정보와 일정</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["id", "공고번호"],
                ["title", "단지명"],
                ["supplyType", "적용 공급 유형 (예: 민영 일반공급)"],
                ["address", "실제 공급 주소 (견본주택 주소 제외)"],
                ["applicationUrl", "공식 신청 페이지 주소"],
                ["publishedAt", "모집공고일"],
                ["moveIn", "확인된 입주일"],
                ["moveInNote", "입주 예정 안내 (정확한 날짜가 없을 때)"],
                ["priceNote", "금액 산정 기준·납부 안내"],
                ["locationUrl", "공식 현장 지도 주소"],
                ["locationImageUrl", "공식 위치 안내 이미지 주소"],
              ] as const
            ).map(([k, label]) => (
              <Field
                key={k}
                label={label}
                value={draft[k]}
                type={
                  k === "publishedAt" || k === "moveIn"
                    ? "date"
                    : k === "applicationUrl"
                      ? "url"
                      : "text"
                }
                onChange={(v) => edit(k, k === "moveIn" || k === "locationUrl" || k === "locationImageUrl" ? v || null : v)}
              />
            ))}
            <label className="text-xs">
              주택 유형
              <select
                className={input}
                value={draft.kind}
                onChange={(e) => edit("kind", e.target.value as Notice["kind"])}
              >
                <option value="sale">분양</option>
                <option value="rent">임대</option>
              </select>
            </label>
            <label className="text-xs">
              대상 분류
              <select className={input} value={draft.audience}
                onChange={(e) => edit("audience", e.target.value as Notice["audience"])}>
                <option value="general">일반</option>
                <option value="youth">청년주택</option>
              </select>
            </label>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Field
              label="검증한 단지 위도"
              value={draft.point?.lat ?? null}
              type="number"
              onChange={(v) =>
                edit(
                  "point",
                  v ? { lat: Number(v), lng: draft.point?.lng ?? 0 } : null,
                )
              }
            />
            <Field
              label="검증한 단지 경도"
              value={draft.point?.lng ?? null}
              type="number"
              onChange={(v) =>
                edit(
                  "point",
                  v ? { lng: Number(v), lat: draft.point?.lat ?? 0 } : null,
                )
              }
            />
            <button
              type="button"
              className={`${button} self-end`}
              disabled={busy || !draft.address}
              onClick={() =>
                operation(async () => {
                  const r = await request<{
                    point: NonNullable<Notice["point"]>;
                  }>("/api/housing/geocode", "POST", {
                    address: draft.address,
                  });
                  edit("point", r.point);
                  setMessage("찾은 좌표가 실제 단지 위치인지 확인해주세요.");
                })
              }
            >
              주소로 좌표 찾기
            </button>
          </div>
          <h3 className="mt-6 text-sm font-semibold">일정 (한국시간)</h3>
          {draft.events.map((ev, i) => (
            <div key={i} className="mt-3 grid items-end gap-3 sm:grid-cols-5">
              <Field
                label="일정 이름"
                value={ev.label}
                onChange={(v) =>
                  edit(
                    "events",
                    draft.events.map((e, j) =>
                      j === i ? { ...e, label: v } : e,
                    ),
                  )
                }
              />
              <Field
                label="날짜"
                type="date"
                value={ev.date}
                onChange={(v) =>
                  edit(
                    "events",
                    draft.events.map((e, j) =>
                      j === i ? { ...e, date: v } : e,
                    ),
                  )
                }
              />
              <Field
                label="시각 (모르면 비움)"
                type="time"
                value={ev.time}
                onChange={(v) =>
                  edit(
                    "events",
                    draft.events.map((e, j) =>
                      j === i ? { ...e, time: v || null } : e,
                    ),
                  )
                }
              />
              <select
                aria-label={`일정 ${i + 1} 종류`}
                className={input}
                value={ev.type}
                onChange={(e) =>
                  edit(
                    "events",
                    draft.events.map((v, j) =>
                      j === i
                        ? { ...v, type: e.target.value as typeof ev.type }
                        : v,
                    ),
                  )
                }
              >
                <option value="open">접수 시작</option>
                <option value="close">접수 마감</option>
                <option value="result">발표</option>
                <option value="contract">계약</option>
              </select>
              <button
                type="button"
                className={button}
                onClick={() =>
                  edit(
                    "events",
                    draft.events.filter((_, j) => i !== j),
                  )
                }
              >
                일정 삭제
              </button>
            </div>
          ))}
          <button
            type="button"
            className={`${button} mt-4`}
            onClick={() =>
              edit("events", [
                ...draft.events,
                { label: "", date: "", type: "open", time: null },
              ])
            }
          >
            + 일정 추가
          </button>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">03 / 주택형·평면도·납부액</h2>
          <p className="mt-2 text-xs text-slate-400">
            금액은 원 단위입니다. 납부액 합계는 공급금액 또는 보증금과 같아야
            합니다. 미확인 값은 비워두세요.
          </p>
          {draft.units.map((u, i) => (
            <div key={i} className="mt-5 rounded-xl border border-white/10 p-4">
              <div className="grid gap-4 sm:grid-cols-3">
                {(
                  [
                    ["id", "주택형 ID", "text"],
                    ["name", "주택형 이름", "text"],
                    ["area", "전용면적 (㎡)", "number"],
                    ["rooms", "방 개수", "number"],
                    ["price", "공급금액 / 보증금 (원)", "number"],
                    ["monthlyRent", "월 임대료 (원)", "number"],
                    ["floorPlanUrl", "공식 평면도 자료 링크", "url"],
                    ["floorPlanImageUrl", "공식 평면도 이미지 주소", "url"],
                  ] as const
                ).map(([k, label, type]) => (
                  <Field
                    key={k}
                    label={label}
                    type={type}
                    value={u[k]}
                    onChange={(v) =>
                      unitEdit(
                        i,
                        k,
                        type === "number"
                          ? num(v)
                          : type === "url"
                            ? v || null
                            : v,
                      )
                    }
                  />
                ))}
              </div>
              <h3 className="mt-4 text-sm">납부 일정</h3>
              {u.payments.map((p, j) => (
                <div
                  key={j}
                  className="mt-3 grid items-end gap-3 sm:grid-cols-4"
                >
                  <Field
                    label="납부 이름"
                    value={p.label}
                    onChange={(v) =>
                      unitEdit(
                        i,
                        "payments",
                        u.payments.map((p, k) =>
                          k === j ? { ...p, label: v } : p,
                        ),
                      )
                    }
                  />
                  <Field
                    label="납부 날짜 (미확정이면 비움)"
                    type="date"
                    value={p.date}
                    onChange={(v) =>
                      unitEdit(
                        i,
                        "payments",
                        u.payments.map((p, k) =>
                          k === j ? { ...p, date: v || null } : p,
                        ),
                      )
                    }
                  />
                  <Field
                    label="납부액 (원)"
                    type="number"
                    value={p.amount}
                    onChange={(v) =>
                      unitEdit(
                        i,
                        "payments",
                        u.payments.map((p, k) =>
                          k === j ? { ...p, amount: Number(v) } : p,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className={button}
                    onClick={() =>
                      unitEdit(
                        i,
                        "payments",
                        u.payments.filter((_, k) => k !== j),
                      )
                    }
                  >
                    납부 삭제
                  </button>
                </div>
              ))}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className={button}
                  onClick={() =>
                    unitEdit(i, "payments", [
                      ...u.payments,
                      { label: "", date: null, amount: 0 },
                    ])
                  }
                >
                  + 납부 일정
                </button>
                <button
                  type="button"
                  className={button}
                  onClick={() =>
                    edit(
                      "units",
                      draft.units.filter((_, j) => j !== i),
                    )
                  }
                >
                  주택형 삭제
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className={`${button} mt-4`}
            onClick={() =>
              edit("units", [
                ...draft.units,
                {
                  id: "",
                  name: "",
                  area: null,
                  rooms: null,
                  price: null,
                  monthlyRent: null,
                  floorPlanUrl: null,
                  floorPlanImageUrl: null,
                  payments: [],
                },
              ])
            }
          >
            + 주택형 추가
          </button>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">04 / 필수정보 요약과 근거</h2>
          <p className="mt-2 text-xs text-slate-400">
            전매제한·거주의무는 적용 대상, 기간, 기산일을 함께 적습니다. 빈
            항목은 확인 필요로 표시됩니다.
          </p>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {ruleKeys.map((key) => {
              const r = draft.rules.find((r) => r.key === key) ?? {
                key,
                summary: "",
                page: "",
                quote: "",
              };
              function set(field: "summary" | "page" | "quote", value: string) {
                edit(
                  "rules",
                  [
                    ...draft.rules.filter((v) => v.key !== key),
                    { ...r, [field]: value },
                  ].filter((v) => v.summary || v.page || v.quote),
                );
              }
              return (
                <div key={key} className="rounded-xl bg-white/[.02] p-4">
                  <label className="text-sm font-semibold">
                    {ruleLabels[key]}
                    <textarea
                      className={`${input} min-h-24`}
                      value={r.summary}
                      onChange={(e) => set("summary", e.target.value)}
                    />
                  </label>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field
                      label="원문 근거 페이지"
                      value={r.page}
                      onChange={(v) => set("page", v)}
                    />
                    <Field
                      label="짧은 근거 문구"
                      value={r.quote}
                      onChange={(v) => set("quote", v)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <h3 className="mt-6 text-sm font-semibold">
            자동 대조에 사용할 조건
          </h3>
          <p className="mt-2 text-xs text-slate-400">
            선택한 공급 유형 전체에 동일하게 적용될 때만 입력합니다. 유형별로
            다르면 확인 필요로 둡니다.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {(
              [
                ["accountRequired", "청약통장 필요"],
                ["homelessRequired", "무주택 필요"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="text-xs">
                {label}
                <select
                  className={input}
                  value={
                    draft.requirements[k] === null
                      ? "unknown"
                      : String(draft.requirements[k])
                  }
                  onChange={(e) =>
                    edit("requirements", {
                      ...draft.requirements,
                      [k]:
                        e.target.value === "unknown"
                          ? null
                          : e.target.value === "true",
                    })
                  }
                >
                  <option value="unknown">확인 필요</option>
                  <option value="true">필요</option>
                  <option value="false">불필요</option>
                </select>
              </label>
            ))}
            <Field
              label="통장 최소 가입 개월"
              type="number"
              value={draft.requirements.accountMonths}
              onChange={(v) =>
                edit("requirements", {
                  ...draft.requirements,
                  accountMonths: num(v),
                })
              }
            />
            <Field
              label="통장 최소 예치금 (원)"
              type="number"
              value={draft.requirements.accountDeposit}
              onChange={(v) =>
                edit("requirements", {
                  ...draft.requirements,
                  accountDeposit: num(v),
                })
              }
            />
          </div>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">05 / 입지·투자 비교 자료</h2>
          <p className="mt-2 text-xs text-slate-400">
            자료가 없으면 점수를 만들지 않습니다. 확인한 출처와 날짜를
            입력해주세요.
          </p>
          {draft.nearby.map((a, i) => (
            <div key={i} className="mt-4 grid items-end gap-3 sm:grid-cols-3">
              <label className="text-xs">
                시설 종류
                <select
                  className={input}
                  value={a.kind}
                  onChange={(e) =>
                    edit(
                      "nearby",
                      draft.nearby.map((v, j) =>
                        j === i
                          ? { ...v, kind: e.target.value as typeof a.kind }
                          : v,
                      ),
                    )
                  }
                >
                  {amenities.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              {(
                [
                  ["name", "시설 이름", "text"],
                  ["meters", "자료상 거리 (m)", "number"],
                  ["source", "근거 링크", "url"],
                  ["checkedAt", "확인일", "date"],
                ] as const
              ).map(([k, label, type]) => (
                <Field
                  key={k}
                  label={label}
                  value={a[k]}
                  type={type}
                  onChange={(v) =>
                    edit(
                      "nearby",
                      draft.nearby.map((a, j) =>
                        j === i
                          ? { ...a, [k]: type === "number" ? Number(v) : v }
                          : a,
                      ),
                    )
                  }
                />
              ))}
              <button
                className={button}
                type="button"
                onClick={() =>
                  edit(
                    "nearby",
                    draft.nearby.filter((_, j) => j !== i),
                  )
                }
              >
                시설 삭제
              </button>
            </div>
          ))}
          <button
            className={`${button} mt-4`}
            type="button"
            onClick={() =>
              edit("nearby", [
                ...draft.nearby,
                {
                  kind: "마트",
                  name: "",
                  meters: 0,
                  source: "",
                  checkedAt: "",
                },
              ])
            }
          >
            + 시설 자료
          </button>
          <label className="mt-6 flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.comparable !== null}
              onChange={(e) =>
                edit(
                  "comparable",
                  e.target.checked
                    ? { pricePerM2: 0, source: "", checkedAt: "", note: "" }
                    : null,
                )
              }
            />
            비교 가능한 주변 거래가격 자료 있음
          </label>
          {draft.comparable && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["pricePerM2", "전용면적 ㎡당 비교가격 (원)", "number"],
                  ["source", "거래가격 근거 링크", "url"],
                  ["checkedAt", "가격 기준일", "date"],
                  ["note", "비교 대상·면적·기간과 주의점", "text"],
                ] as const
              ).map(([k, label, type]) => (
                <Field
                  key={k}
                  label={label}
                  value={draft.comparable![k]}
                  type={type}
                  onChange={(v) =>
                    edit("comparable", {
                      ...draft.comparable!,
                      [k]: type === "number" ? Number(v) : v,
                    })
                  }
                />
              ))}
            </div>
          )}
        </section>
        <section className={panel}>
          <Field
            label="정정·변경 안내 (기존 공고 수정 시 필수)"
            value={draft.changeNote}
            onChange={(v) => edit("changeNote", v)}
          />
          <label className="mt-5 flex items-start gap-3 text-sm leading-6">
            <input
              className="mt-1.5"
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            공급 주소, 금액, 일정, 필수조건과 근거를 공식 원문과 대조했습니다.
            모르는 내용은 비워두었습니다.
          </label>
          <button
            type="submit"
            className={`${button} mt-5 bg-teal-300 !text-slate-950 font-semibold`}
            disabled={busy || !confirmed}
          >
            확인한 공고 저장·공개
          </button>
        </section>
        <p
          role="status"
          className="sticky bottom-3 rounded-xl bg-[#1a202b] p-4 text-sm text-amber-200 empty:hidden"
        >
          {message}
        </p>
      </form>
    </>
  );
}
