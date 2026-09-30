"use client";
import Link from "next/link";
import { dimensions, labels } from "@/lib/housing/model";
import type { Assessment } from "@/lib/housing/scoring";
export const button =
  "inline-flex items-center justify-center rounded-xl border border-white/15 px-4 py-2.5 text-sm transition hover:border-teal-300/60 hover:bg-teal-300/5 disabled:opacity-40 disabled:cursor-not-allowed";
export const input =
  "mt-2 w-full rounded-xl border border-white/15 bg-[#10151d] px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300/60";
export const panel =
  "rounded-2xl border border-white/10 bg-[#111720] p-5 sm:p-7";
export function External({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={button}>
      {children} ↗
    </a>
  );
}
export function Bars({
  assessment,
  compact = false,
}: {
  assessment: Assessment;
  compact?: boolean;
}) {
  return (
    <div className="space-y-3">
      {dimensions.map((key, i) => {
        const m = assessment.metrics[key];
        return (
          <div key={key}>
            <div className="flex items-center gap-3 text-sm">
              <span className="w-14 shrink-0 text-slate-300">
                {labels[key]}
              </span>
              <div
                className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5"
                role="meter"
                aria-label={labels[key]}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={m.value ?? undefined}
                aria-valuetext={m.value === null ? "분석 대기" : `${m.value}점`}
              >
                <div
                  className={
                    [
                      "h-full rounded-full bg-teal-300",
                      "h-full rounded-full bg-sky-400",
                      "h-full rounded-full bg-violet-400",
                      "h-full rounded-full bg-amber-300",
                      "h-full rounded-full bg-rose-400",
                    ][i]
                  }
                  style={{ width: `${m.value ?? 0}%` }}
                />
              </div>
              <span className="w-16 text-right tabular-nums text-slate-300">
                {m.value ?? "미확인"}
              </span>
            </div>
            {!compact && (
              <p className="mt-1.5 pl-[68px] text-xs leading-relaxed text-slate-400">
                {m.reason}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
export function HousingHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        <Link
          href="/housing"
          className="text-xs font-semibold tracking-[.22em] text-teal-300"
        >
          HOUSING / 청약
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          {description}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </header>
  );
}
export async function request<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error ?? "요청에 실패했습니다");
  return data;
}
