import type { Notice } from "./model";

export function scheduleWindow(today: string) {
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
  return {
    months: [today.slice(0, 7), next],
    end: new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10),
  };
}

export function eventsThroughNextMonth(
  notices: Notice[],
  today: string,
  enabledTypes: Notice["events"][number]["type"][],
) {
  const { end } = scheduleWindow(today);
  return notices
    .flatMap((notice) => notice.events
      .filter((event) => event.date >= today && event.date <= end && enabledTypes.includes(event.type))
      .map((event) => ({ notice, event })))
    .sort((a, b) => a.event.date.localeCompare(b.event.date) ||
      a.notice.title.localeCompare(b.notice.title, "ko-KR") ||
      a.event.label.localeCompare(b.event.label, "ko-KR"));
}
