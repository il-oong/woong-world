"use client";

import { useMemo } from "react";
import {
  buildMonthGrid,
  WEEKDAY_LABELS,
  eventOnDay,
  eventStartIso,
  eventEndIso,
  toIso,
} from "@/lib/calendar-util";
import type { CalendarEvent } from "@/lib/google";
import { categoryFromEvent } from "@/lib/categories";

export type CalendarSize = "sm" | "md" | "lg" | "xl";

const SIZE_CONFIG: Record<
  CalendarSize,
  {
    cellHeight: string;
    dayLabel: string;
    eventText: string;
    maxEvents: number;
    showLabels: boolean;
  }
> = {
  sm: {
    cellHeight: "min-h-[42px]",
    dayLabel: "text-[10px]",
    eventText: "text-[9px]",
    maxEvents: 0,
    showLabels: false,
  },
  md: {
    cellHeight: "min-h-[80px]",
    dayLabel: "text-xs",
    eventText: "text-[10px]",
    maxEvents: 3,
    showLabels: true,
  },
  lg: {
    cellHeight: "min-h-[110px]",
    dayLabel: "text-sm",
    eventText: "text-[11px]",
    maxEvents: 4,
    showLabels: true,
  },
  xl: {
    cellHeight: "min-h-[150px]",
    dayLabel: "text-base",
    eventText: "text-xs",
    maxEvents: 6,
    showLabels: true,
  },
};

type EventDayPos = "single" | "start" | "middle" | "end";

function getEventDayPos(ev: CalendarEvent, iso: string): EventDayPos {
  const start = eventStartIso(ev);
  const end = eventEndIso(ev);
  if (!start || !end || start === end) return "single";
  if (iso === start) return "start";
  if (iso === end) return "end";
  return "middle";
}

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
  size?: CalendarSize;
}) {
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const cell of cells) {
      map.set(cell.iso, events.filter((ev) => eventOnDay(ev, cell.iso)));
    }
    return map;
  }, [cells, events]);

  const cfg = SIZE_CONFIG[size];

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)]">
      {/* Weekday headers */}
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

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const dayEvents = eventsByDay.get(cell.iso) ?? [];
          const isSelected = selectedIso === cell.iso;

          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => onSelect?.(cell.iso)}
              className={`${cfg.cellHeight} relative flex flex-col items-start gap-0.5 border-b border-r border-[var(--border)] text-left transition last:border-r-0 ${
                cell.inMonth ? "bg-transparent" : "bg-white/[0.015]"
              } ${onSelect ? "hover:bg-white/[0.04]" : "cursor-default"} ${
                isSelected ? "ring-1 ring-inset ring-[var(--accent)]/60" : ""
              }`}
            >
              {/* Date number */}
              <span
                className={`${cfg.dayLabel} font-mono px-1.5 pt-1.5 leading-none ${
                  cell.isToday
                    ? "rounded bg-[var(--accent)] mx-1 mt-1 px-1.5 py-0.5 font-medium text-black"
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

              {/* Events */}
              {cfg.showLabels &&
                dayEvents.slice(0, cfg.maxEvents).map((ev) => {
                  const cat = categoryFromEvent(ev);
                  const color = cat?.color;
                  const pos = getEventDayPos(ev, cell.iso);
                  const isSpanning = pos !== "single";

                  const baseColor = color ?? "var(--accent)";
                  const bgColor = color ? `${color}30` : "color-mix(in oklab, var(--accent) 15%, transparent)";

                  if (!isSpanning) {
                    return (
                      <span
                        key={ev.id}
                        className={`block w-full truncate rounded px-1 py-0.5 ${cfg.eventText}`}
                        style={{ background: bgColor, color: baseColor }}
                        title={ev.summary ?? ""}
                      >
                        {ev.summary ?? "(제목 없음)"}
                      </span>
                    );
                  }

                  // Spanning event — extend to cell edges for visual continuity
                  const isStart = pos === "start";
                  const isEnd = pos === "end";

                  return (
                    <span
                      key={ev.id}
                      className={`block py-0.5 overflow-hidden ${cfg.eventText} ${
                        isStart ? "rounded-l pl-1 pr-0 -mr-px" : ""
                      } ${
                        isEnd ? "rounded-r pr-1 pl-0 -ml-px" : ""
                      } ${
                        !isStart && !isEnd ? "pl-0 pr-0 -mx-px" : ""
                      }`}
                      style={{
                        background: bgColor,
                        color: isStart ? baseColor : "transparent",
                        width: isStart || isEnd ? "calc(100% + 1px)" : "calc(100% + 2px)",
                        marginLeft: !isStart ? "-1px" : undefined,
                      }}
                      title={ev.summary ?? ""}
                    >
                      {isStart ? (ev.summary ?? "(제목 없음)") : " "}
                    </span>
                  );
                })}

              {cfg.showLabels && dayEvents.length > cfg.maxEvents && (
                <span className={`${cfg.eventText} px-1.5 text-[var(--muted)]`}>
                  +{dayEvents.length - cfg.maxEvents}
                </span>
              )}

              {/* SM: dot indicators */}
              {!cfg.showLabels && dayEvents.length > 0 && (
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
