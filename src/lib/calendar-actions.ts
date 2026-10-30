import type { ProposedAction } from "./assistant";
import type { CalendarEvent } from "./google";

/** Google refuses some edits on events it created itself (Gmail bookings, birthdays, ...). */
export function isEventTypeRestriction(error: unknown): boolean {
  return (
    error instanceof Error &&
    /eventTypeRestriction|Event type cannot be changed/i.test(error.message)
  );
}

/**
 * The model names events by id, but the approval card must describe the event that will really be
 * touched. Keep only update/delete actions whose id is in the calendar context the user can see,
 * and fill delete cards from that real event instead of the model's own wording.
 */
export function normalizeEventActions(
  actions: ProposedAction[],
  events: CalendarEvent[],
): { actions: ProposedAction[]; dropped: number } {
  const byId = new Map(events.map((e) => [e.id, e]));
  const out: ProposedAction[] = [];
  let dropped = 0;
  for (const action of actions) {
    if (action.type !== "update_event" && action.type !== "delete_event") {
      out.push(action);
      continue;
    }
    const event =
      !action.params.calendarId || action.params.calendarId === "primary"
        ? byId.get(action.params.eventId)
        : undefined;
    if (!event) {
      dropped++;
      continue;
    }
    if (action.type === "delete_event") {
      out.push({
        ...action,
        params: {
          ...action.params,
          summary: event.summary?.trim() || "(제목 없음)",
          start: event.start.dateTime ?? event.start.date,
        },
      });
    } else {
      out.push(action);
    }
  }
  return { actions: out, dropped };
}
