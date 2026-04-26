import {
  readSession,
  writeSession,
  type GoogleSession,
} from "./session";
import { getCategory, type CategoryId } from "./categories";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const TZ = "Asia/Seoul";

export const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export type CalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  htmlLink?: string;
  colorId?: string;
  extendedProperties?: {
    private?: { category?: string };
  };
  reminders?: {
    useDefault?: boolean;
    overrides?: { method: "email" | "popup"; minutes: number }[];
  };
};

export type CreateEventInput = {
  summary: string;
  description?: string;
  kind: "timed" | "allday" | "project";
  start: string;
  end: string;
  reminderMinutes?: number | null;
  categoryId?: CategoryId;
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} environment variable is required`);
  return v;
}

export function isConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI &&
      process.env.SESSION_SECRET,
  );
}

export function getAuthUrl(state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", required("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", required("GOOGLE_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: required("GOOGLE_CLIENT_ID"),
      client_secret: required("GOOGLE_CLIENT_SECRET"),
      redirect_uri: required("GOOGLE_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: required("GOOGLE_CLIENT_ID"),
      client_secret: required("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
  return res.json();
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

export async function getValidSession(): Promise<GoogleSession | null> {
  const session = await readSession();
  if (!session) return null;
  if (session.expiresAt - 60_000 > Date.now()) return session;
  try {
    const tokens = await refreshAccessToken(session.refreshToken);
    const next: GoogleSession = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      email: session.email,
    };
    await writeSession(next);
    return next;
  } catch {
    return null;
  }
}

export async function listEvents(
  session: GoogleSession,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const url = new URL(`${CALENDAR_API}/calendars/primary/events`);
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "250");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  const data = (await res.json()) as { items?: CalendarEvent[] };
  return data.items ?? [];
}

export async function createEvent(
  session: GoogleSession,
  input: CreateEventInput,
): Promise<CalendarEvent> {
  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description || undefined,
  };

  if (input.kind === "timed") {
    body.start = { dateTime: input.start, timeZone: TZ };
    body.end = { dateTime: input.end, timeZone: TZ };
  } else {
    // allday or project — Google's end.date is exclusive
    body.start = { date: input.start };
    body.end = { date: addOneDay(input.end) };
  }

  if (input.reminderMinutes !== undefined && input.reminderMinutes !== null) {
    body.reminders = {
      useDefault: false,
      overrides: [{ method: "popup", minutes: input.reminderMinutes }],
    };
  }

  if (input.categoryId) {
    const category = getCategory(input.categoryId);
    body.colorId = category.colorId;
    body.extendedProperties = { private: { category: category.id } };
  }

  const res = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function deleteEvent(
  session: GoogleSession,
  eventId: string,
): Promise<void> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.accessToken}` },
    },
  );
  // 410 = already deleted
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    throw new Error(`Delete failed: ${res.status}`);
  }
}

function addOneDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + 1));
  return date.toISOString().slice(0, 10);
}
