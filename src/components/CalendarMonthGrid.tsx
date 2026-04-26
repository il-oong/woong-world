"use client";

import { useMemo } from "react";
import {
  buildMonthGrid,
  WEEKDAY_LABELS,
  eventOnDay,
} from "@/lib/calendar-util";
import type { CalendarEvent } from "@/lib/google";
import { categoryFromEvent } from "@/lib/categories";

export function CalendarMonthGrid({
  year,
  month,
  events,
  selectedIso,
  onSelect,
  size = "md",
}: {
  year: number;
  month: number;
  events: CalendarEvent[];
  selectedIso?: string;
  onSelect?: (iso: string) => void;
  size?: "sm" | "md";
}) {
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const cell of cells) {
      map.set(
        cell.iso,
        events.filter((ev) => eventOnDay(ev, cell.iso)),
      );
    }
    return map;
  }, [cells, events]);

  const cellHeight = size === "sm" ? "min-h-[42px]" : "min-h-[80px]";
  const dayLabelSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)]">
      <div className="grid grid-cols-7 border-b border-[var(--border)] bg-white/[0.02]">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={`px-2 py-1.5 text-center text-[10px] font-mono uppercase tracking-wider ${
              i === 0
                ? "text-rose-300/70"
                : i === 6
                  ? "text-sky-300/70"
                  : "text-[var(--muted)]"
            }`}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const dayEvents = eventsByDay.get(cell.iso) ?? [];
          const isSelected = selectedIso === cell.iso;
          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => onSelect?.(cell.iso)}
              className={`${cellHeight} relative flex flex-col items-start gap-1 border-b border-r border-[var(--border)] p-1.5 text-left transition last:border-r-0 ${
                cell.inMonth ? "bg-transparent" : "bg-white/[0.015]"
              } ${onSelect ? "hover:bg-white/[0.04]" : "cursor-default"} ${
                isSelected ? "ring-1 ring-inset ring-[var(--accent)]/60" : ""
              }`}
            >
              <span
                className={`${dayLabelSize} font-mono ${
                  cell.isToday
                    ? "rounded bg-[var(--accent)] px-1.5 py-0.5 font-medium text-black"
                    : cell.inMonth
                      ? cell.isWeekend
                        ? cell.date.getDay() === 0
                          ? "text-rose-300/80"
                          : "text-sky-300/80"
                        : "text-foreground"
                      : "text-[var(--muted)]/40"
                }`}
              >
                {cell.date.getDate()}
              </span>

              {size === "md" && dayEvents.slice(0, 3).map((ev) => {
                const cat = categoryFromEvent(ev);
                const color = cat?.color;
                return (
                  <span
                    key={ev.id}
                    className="block w-full truncate rounded px-1 py-0.5 text-[10px]"
                    style={
                      color
                        ? { background: `${color}26`, color }
                        : { background: "color-mix(in oklab, var(--accent) 15%, transparent)", color: "var(--accent)" }
                    }
                    title={ev.summary ?? ""}
                  >
                    {ev.summary ?? "(제목 없음)"}
                  </span>
                );
              })}
              {size === "md" && dayEvents.length > 3 && (
                <span className="text-[10px] text-[var(--muted)]">
                  +{dayEvents.length - 3} more
                </span>
              )}

              {size === "sm" && dayEvents.length > 0 && (
                <span className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
                  {Array.from(
                    new Set(
                      dayEvents
                        .map((ev) => categoryFromEvent(ev)?.color)
                        .filter((c): c is string => Boolean(c)),
                    ),
                  )
                    .slice(0, 4)
                    .map((c, i) => (
                      <span
                        key={`${c}-${i}`}
                        className="h-1 w-1 rounded-full"
                        style={{ background: c }}
                      />
                    ))}
                  {dayEvents.every((ev) => !categoryFromEvent(ev)) && (
                    <span className="h-1 w-1 rounded-full bg-[var(--accent)]" />
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
