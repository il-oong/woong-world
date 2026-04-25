export type DayCell = {
  date: Date;
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
};

export function buildMonthGrid(year: number, month: number): DayCell[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: DayCell[] = [];

  for (let i = startWeekday; i > 0; i--) {
    cells.push(makeCell(new Date(year, month, 1 - i), false, today));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(makeCell(new Date(year, month, d), true, today));
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    cells.push(makeCell(next, false, today));
  }
  return cells;
}

function makeCell(date: Date, inMonth: boolean, today: Date): DayCell {
  const dow = date.getDay();
  return {
    date,
    iso: toIso(date),
    inMonth,
    isToday: date.getTime() === today.getTime(),
    isWeekend: dow === 0 || dow === 6,
  };
}

export function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function eventStartIso(ev: {
  start: { date?: string; dateTime?: string };
}): string {
  if (ev.start.date) return ev.start.date;
  if (ev.start.dateTime) return toIso(new Date(ev.start.dateTime));
  return "";
}

export function eventEndIso(ev: {
  end: { date?: string; dateTime?: string };
}): string {
  if (ev.end.date) {
    // Google's end.date is exclusive — subtract 1 day for display
    const [y, m, d] = ev.end.date.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d - 1));
    return dt.toISOString().slice(0, 10);
  }
  if (ev.end.dateTime) return toIso(new Date(ev.end.dateTime));
  return "";
}

export function isAllDay(ev: { start: { date?: string } }): boolean {
  return Boolean(ev.start.date);
}

export function eventOnDay(
  ev: { start: { date?: string; dateTime?: string }; end: { date?: string; dateTime?: string } },
  isoDay: string,
): boolean {
  const startIso = eventStartIso(ev);
  const endIso = eventEndIso(ev) || startIso;
  return isoDay >= startIso && isoDay <= endIso;
}

export function formatTimeRange(ev: {
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
}): string {
  if (isAllDay(ev)) {
    const s = eventStartIso(ev);
    const e = eventEndIso(ev);
    return s === e ? "종일" : `${s} → ${e}`;
  }
  const fmt = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };
  return `${fmt(ev.start.dateTime)} – ${fmt(ev.end.dateTime)}`;
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  const from = new Date(year, month - 1, 1).toISOString();
  const to = new Date(year, month + 2, 0, 23, 59, 59).toISOString();
  return { from, to };
}

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export const MONTH_LABELS = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];
