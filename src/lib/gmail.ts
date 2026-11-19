import type { GoogleSession } from "./session";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

export type GmailMessageSummary = {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string;
  subject: string;
  date: number;
  unread: boolean;
  labelIds: string[];
};

export type GmailMessageDetail = GmailMessageSummary & {
  body: string;
  cc?: string;
  bcc?: string;
};

type GmailListResponse = {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

type GmailHeader = { name: string; value: string };

type GmailPayloadPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPayloadPart[];
};

type GmailRawMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailPayloadPart;
};

function auth(session: GoogleSession): HeadersInit {
  return { Authorization: `Bearer ${session.accessToken}` };
}

function header(payload: GmailPayloadPart | undefined, name: string): string {
  if (!payload?.headers) return "";
  const found = payload.headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return found?.value ?? "";
}

function decodeBase64Url(data: string): string {
  // Gmail's base64url substitutes -_ for +/ and omits padding.
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLen);
  try {
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function extractBody(payload: GmailPayloadPart | undefined): string {
  if (!payload) return "";
  // Prefer text/plain; fall back to text/html stripped, then to any single-body part.
  const findByMime = (mime: string): string => {
    if (payload.mimeType === mime && payload.body?.data) {
      return decodeBase64Url(payload.body.data);
    }
    if (!payload.parts) return "";
    for (const part of payload.parts) {
      if (part.mimeType === mime && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Recurse into multipart children (e.g. multipart/alternative inside multipart/mixed).
    for (const part of payload.parts) {
      const nested = extractBodyFromPart(part, mime);
      if (nested) return nested;
    }
    return "";
  };
  const plain = findByMime("text/plain");
  if (plain) return plain;
  const html = findByMime("text/html");
  if (html) {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return "";
}

function extractBodyFromPart(
  part: GmailPayloadPart,
  mime: string,
): string {
  if (part.mimeType === mime && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  if (part.parts) {
    for (const child of part.parts) {
      const nested = extractBodyFromPart(child, mime);
      if (nested) return nested;
    }
  }
  return "";
}

function toSummary(msg: GmailRawMessage): GmailMessageSummary {
  const labelIds = msg.labelIds ?? [];
  return {
    id: msg.id,
    threadId: msg.threadId,
    snippet: msg.snippet ?? "",
    from: header(msg.payload, "From"),
    to: header(msg.payload, "To"),
    subject: header(msg.payload, "Subject") || "(제목 없음)",
    date: msg.internalDate ? Number(msg.internalDate) : 0,
    unread: labelIds.includes("UNREAD"),
    labelIds,
  };
}

export async function listGmailMessages(
  session: GoogleSession,
  options: { query?: string; maxResults?: number; labelIds?: string[] } = {},
): Promise<GmailMessageSummary[]> {
  const url = new URL(`${GMAIL_API}/users/me/messages`);
  url.searchParams.set(
    "maxResults",
    String(Math.min(Math.max(options.maxResults ?? 10, 1), 50)),
  );
  if (options.query) url.searchParams.set("q", options.query);
  if (options.labelIds?.length) {
    for (const id of options.labelIds) url.searchParams.append("labelIds", id);
  }

  const res = await fetch(url, { headers: auth(session), cache: "no-store" });
  if (!res.ok) throw new Error(`GmailList failed: ${res.status}`);
  const data = (await res.json()) as GmailListResponse;
  const ids = (data.messages ?? []).map((m) => m.id);
  if (ids.length === 0) return [];

  // Metadata format gives us headers without downloading the full body.
  const results = await Promise.all(
    ids.map(async (id) => {
      const metaUrl = new URL(`${GMAIL_API}/users/me/messages/${id}`);
      metaUrl.searchParams.set("format", "metadata");
      for (const name of ["From", "To", "Subject", "Date"]) {
        metaUrl.searchParams.append("metadataHeaders", name);
      }
      const r = await fetch(metaUrl, { headers: auth(session), cache: "no-store" });
      if (!r.ok) return null;
      return (await r.json()) as GmailRawMessage;
    }),
  );
  return results
    .filter((m): m is GmailRawMessage => m !== null)
    .map(toSummary);
}

export async function getGmailMessage(
  session: GoogleSession,
  id: string,
): Promise<GmailMessageDetail | null> {
  const url = new URL(`${GMAIL_API}/users/me/messages/${encodeURIComponent(id)}`);
  url.searchParams.set("format", "full");
  const res = await fetch(url, { headers: auth(session), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GmailGet failed: ${res.status}`);
  const raw = (await res.json()) as GmailRawMessage;
  const summary = toSummary(raw);
  return {
    ...summary,
    body: extractBody(raw.payload),
    cc: header(raw.payload, "Cc") || undefined,
    bcc: header(raw.payload, "Bcc") || undefined,
  };
}

type SendInput = {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  /** Reply context — when present, the message threads under threadId with proper References/In-Reply-To. */
  replyTo?: {
    threadId: string;
    messageIdHeader: string;
    references?: string;
  };
};

function encodeRfc2047(text: string): string {
  // Gmail accepts plain ASCII in headers; non-ASCII must be RFC 2047 encoded.
  // Use the base64 form to keep line folding simple.
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  const b64 = Buffer.from(text, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

function buildRawMessage(input: SendInput, from?: string): string {
  const headers: string[] = [];
  if (from) headers.push(`From: ${from}`);
  headers.push(`To: ${input.to}`);
  if (input.cc) headers.push(`Cc: ${input.cc}`);
  if (input.bcc) headers.push(`Bcc: ${input.bcc}`);
  headers.push(`Subject: ${encodeRfc2047(input.subject)}`);
  headers.push("MIME-Version: 1.0");
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push("Content-Transfer-Encoding: 8bit");
  if (input.replyTo) {
    headers.push(`In-Reply-To: ${input.replyTo.messageIdHeader}`);
    const refs = input.replyTo.references
      ? `${input.replyTo.references} ${input.replyTo.messageIdHeader}`
      : input.replyTo.messageIdHeader;
    headers.push(`References: ${refs}`);
  }
  const message = `${headers.join("\r\n")}\r\n\r\n${input.body}`;
  return Buffer.from(message, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendGmailMessage(
  session: GoogleSession,
  input: SendInput,
): Promise<{ id: string; threadId: string }> {
  const raw = buildRawMessage(input, session.email);
  const body: Record<string, unknown> = { raw };
  if (input.replyTo?.threadId) body.threadId = input.replyTo.threadId;
  const res = await fetch(`${GMAIL_API}/users/me/messages/send`, {
    method: "POST",
    headers: {
      ...auth(session),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`GmailSend failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { id: string; threadId: string };
}

/** Fetches the headers required to build a correct reply (threading, References). */
export async function getReplyContext(
  session: GoogleSession,
  id: string,
): Promise<{
  threadId: string;
  messageIdHeader: string;
  references?: string;
  subject: string;
  from: string;
  replyTo: string;
} | null> {
  const url = new URL(`${GMAIL_API}/users/me/messages/${encodeURIComponent(id)}`);
  url.searchParams.set("format", "metadata");
  for (const name of ["Message-ID", "References", "Subject", "From", "Reply-To"]) {
    url.searchParams.append("metadataHeaders", name);
  }
  const res = await fetch(url, { headers: auth(session), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GmailMeta failed: ${res.status}`);
  const raw = (await res.json()) as GmailRawMessage;
  const messageIdHeader = header(raw.payload, "Message-ID");
  if (!messageIdHeader) return null;
  return {
    threadId: raw.threadId,
    messageIdHeader,
    references: header(raw.payload, "References") || undefined,
    subject: header(raw.payload, "Subject"),
    from: header(raw.payload, "From"),
    replyTo: header(raw.payload, "Reply-To"),
  };
}

export async function trashGmailMessage(
  session: GoogleSession,
  id: string,
): Promise<void> {
  const res = await fetch(
    `${GMAIL_API}/users/me/messages/${encodeURIComponent(id)}/trash`,
    { method: "POST", headers: auth(session) },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`GmailTrash failed: ${res.status}`);
  }
}

export async function modifyGmailLabels(
  session: GoogleSession,
  id: string,
  options: { add?: string[]; remove?: string[] },
): Promise<void> {
  const body: Record<string, string[]> = {};
  if (options.add?.length) body.addLabelIds = options.add;
  if (options.remove?.length) body.removeLabelIds = options.remove;
  if (Object.keys(body).length === 0) return;
  const res = await fetch(
    `${GMAIL_API}/users/me/messages/${encodeURIComponent(id)}/modify`,
    {
      method: "POST",
      headers: { ...auth(session), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`GmailModify failed: ${res.status}`);
}
