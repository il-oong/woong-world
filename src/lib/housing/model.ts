import { z } from "zod";

export const dimensions = [
  "money",
  "transport",
  "location",
  "condition",
  "investment",
] as const;
export type Dimension = (typeof dimensions)[number];
export const labels: Record<Dimension, string> = {
  money: "돈",
  transport: "교통",
  location: "입지",
  condition: "컨디션",
  investment: "투자",
};
export const amenities = ["마트", "병원", "학교", "공원"] as const;
const amount = z.number().finite().min(0).max(100_000_000_000);
const nullableAmount = amount.nullable().default(null);
const text = z.string().trim().max(2000);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "유효한 날짜가 아닙니다",
  );
export const httpsUrl = z
  .string()
  .max(2000)
  .url()
  .refine((v) => {
    if (!URL.canParse(v)) return false;
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  }, "https 주소를 입력하세요");
const imageUrl = z.union([
  httpsUrl,
  z.string().regex(/^\/housing\/[a-zA-Z0-9/_-]+\.(?:png|jpg|jpeg|webp)$/, "주택 이미지 경로를 확인하세요"),
]);
export const pointSchema = z.object({
  lat: z.number().min(33).max(39),
  lng: z.number().min(124).max(132),
});
export const profileSchema = z.object({
  cash: nullableAmount,
  monthlySaving: nullableAmount,
  loan: nullableAmount,
  monthlyBudget: nullableAmount,
  interestRate: z.number().min(0).max(30).default(4),
  loanYears: z.number().int().min(1).max(50).default(30),
  workplace: z.string().trim().max(200).default(""),
  maxCommute: z.number().int().min(1).max(240).default(60),
  minArea: z.number().min(1).max(400).default(59),
  minRooms: z.number().int().min(1).max(10).default(2),
  preferredAmenities: z
    .array(z.enum(amenities))
    .max(4)
    .default(["마트", "병원"]),
  region: z.string().trim().max(100).default(""),
  preferredRegion: z.string().trim().max(100).default(""),
  account: z.enum(["yes", "no", "unknown"]).default("unknown"),
  accountMonths: z.number().int().min(0).max(1200).nullable().default(null),
  accountDeposit: nullableAmount,
  homeless: z.enum(["yes", "no", "unknown"]).default("unknown"),
  weights: z
    .object({
      money: z.number().min(0).max(100),
      transport: z.number().min(0).max(100),
      location: z.number().min(0).max(100),
      condition: z.number().min(0).max(100),
      investment: z.number().min(0).max(100),
    })
    .default({
      money: 30,
      transport: 25,
      location: 20,
      condition: 15,
      investment: 10,
    })
    .refine(
      (v) => Object.values(v).some((n) => n > 0),
      "중요도는 하나 이상 0보다 커야 합니다",
    ),
});
export type Profile = z.infer<typeof profileSchema>;
export const emptyProfile = (): Profile => profileSchema.parse({});
export const ruleKeys = [
  "account",
  "eligibility",
  "income",
  "resale",
  "residence",
  "rewinning",
  "other",
] as const;
export const ruleLabels: Record<(typeof ruleKeys)[number], string> = {
  account: "청약통장",
  eligibility: "신청 자격·거주 지역",
  income: "소득·자산",
  resale: "전매제한",
  residence: "거주의무",
  rewinning: "재당첨 제한",
  other: "중복 신청·기타 주의사항",
};
const ruleSchema = z.object({
  key: z.enum(ruleKeys),
  summary: text,
  page: z.string().max(100),
  quote: text,
});
const unitSchema = z.object({
  id: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  area: z.number().positive().max(500).nullable().default(null),
  rooms: z.number().int().positive().max(20).nullable().default(null),
  price: nullableAmount,
  monthlyRent: nullableAmount,
  floorPlanUrl: httpsUrl.nullable().default(null),
  floorPlanImageUrl: imageUrl.nullable().default(null),
  payments: z
    .array(
      z.object({ label: z.string().min(1).max(100), date: dateSchema.nullable(), amount }),
    )
    .max(30)
    .default([]),
});
export const noticeSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    title: z.string().trim().min(1).max(200),
    kind: z.enum(["sale", "rent"]),
    audience: z.enum(["general", "youth"]).default("general"),
    supplyType: z.string().min(1).max(100),
    address: z.string().max(300),
    sourceUrl: httpsUrl,
    applicationUrl: httpsUrl,
    publishedAt: dateSchema,
    point: pointSchema.nullable().default(null),
    moveIn: dateSchema.nullable().default(null),
    moveInNote: z.string().max(200).default(""),
    priceNote: z.string().max(500).default(""),
    locationUrl: httpsUrl.nullable().default(null),
    locationImageUrl: imageUrl.nullable().default(null),
    events: z
      .array(
        z.object({
          label: z.string().min(1).max(100),
          date: dateSchema,
          type: z.enum(["notice", "open", "close", "result", "contract"]),
          time: z
            .string()
            .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
            .nullable()
            .default(null),
        }),
      )
      .min(1)
      .max(40),
    units: z
      .array(unitSchema)
      .min(1)
      .max(40)
      .refine(
        (v) => new Set(v.map((u) => u.id)).size === v.length,
        "주택형 ID 중복",
      ),
    rules: z
      .array(ruleSchema)
      .max(7)
      .default([])
      .refine(
        (v) => new Set(v.map((r) => r.key)).size === v.length,
        "필수정보 항목 중복",
      ),
    requirements: z
      .object({
        accountRequired: z.boolean().nullable().default(null),
        accountMonths: z
          .number()
          .int()
          .min(0)
          .max(1200)
          .nullable()
          .default(null),
        accountDeposit: nullableAmount,
        homelessRequired: z.boolean().nullable().default(null),
      })
      .default({
        accountRequired: null,
        accountMonths: null,
        accountDeposit: null,
        homelessRequired: null,
      }),
    nearby: z
      .array(
        z.object({
          kind: z.enum(amenities),
          name: z.string().max(100),
          meters: z.number().min(0).max(50000),
          source: httpsUrl,
          checkedAt: dateSchema,
        }),
      )
      .max(30)
      .default([]),
    comparable: z
      .object({
        pricePerM2: z.number().positive().max(1e9),
        source: httpsUrl,
        checkedAt: dateSchema,
        note: text,
      })
      .nullable()
      .default(null),
    reviewedAt: dateSchema.nullable().default(null),
    changeNote: z.string().max(1000).default(""),
  })
  .superRefine((n, ctx) => {
    for (const u of n.units) {
      if (
        u.payments.length &&
        u.price !== null &&
        u.payments.reduce((s, p) => s + p.amount, 0) !== u.price
      )
        ctx.addIssue({
          code: "custom",
          message: `${u.name}: 납부액 합계가 공급금액/보증금과 다릅니다`,
          path: ["units"],
        });
    }
    const opens = n.events
      .filter((e) => e.type === "open")
      .map((e) => e.date)
      .sort();
    const closes = n.events
      .filter((e) => e.type === "close")
      .map((e) => e.date)
      .sort();
    if (opens.length && closes.length && opens[0] > closes[closes.length - 1])
      ctx.addIssue({
        code: "custom",
        message: "접수 마감이 시작보다 빠릅니다",
        path: ["events"],
      });
  });
export type Notice = z.infer<typeof noticeSchema>;
export type Unit = Notice["units"][number];
export type Commute = {
  minutes: number;
  transfers: number;
  walkMinutes: number;
  checkedAt: string;
  destination: string;
};
export function todayKst(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
    now,
  );
}
export function won(n: number | null) {
  return n === null ? "확인 필요" : `${n.toLocaleString("ko-KR")}원`;
}
export function isClosed(n: Notice, now = new Date()) {
  const ends = n.events
    .filter((e) => e.type === "close")
    .map((e) => `${e.date}T${e.time ?? "23:59"}:59+09:00`)
    .sort();
  return ends.length > 0 && Date.parse(ends[ends.length - 1]) < now.getTime();
}
export function applicationStatus(n: Notice, now = new Date()) {
  if (isClosed(n, now)) return "접수 마감";
  const starts = n.events
    .filter((e) => e.type === "open")
    .map((e) => `${e.date}T${e.time ?? "00:00"}:00+09:00`)
    .sort();
  if (!starts.length) return "접수 일정 확인";
  if (!n.events.some((e) => e.type === "close") &&
    starts.every((start) => now.getTime() > Date.parse(start.slice(0, 10) + "T23:59:59+09:00")))
    return "접수일 경과 · 기간 원문 확인";
  return now.getTime() < Date.parse(starts[0])
    ? "접수 예정"
    : n.events.some((e) => e.type === "close")
      ? "접수 기간 · 유형별 일정 확인"
      : "접수일 · 시간 원문 확인";
}
