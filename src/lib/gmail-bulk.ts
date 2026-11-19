import type { GoogleSession } from "./session";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

/** Hard ceiling for one bulk operation (ids held in memory + Redis job size). */
export const BULK_MAX_MESSAGES = 20000;
/** Gmail batchModify accepts at most 1000 ids per call. */
export const BATCH_MODIFY_LIMIT = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function auth(session: GoogleSession): HeadersInit {
  return { Authorization: `Bearer ${session.accessToken}` };
}

/** fetch with exponential backoff on Gmail rate limits (429 / 403 rateLimit) and 5xx. */
async function gmailFetchRetry(
  url: string | URL,
  init: RequestInit,
  attempts = 5,
): Promise<Response> {
  let res!: Response;
  for (let i = 0; i < attempts; i++) {
    res = await fetch(url, { ...init, cache: "no-store" });
    const retryable =
      res.status === 429 || res.status >= 500 || res.status === 403;
    if (!retryable || i === attempts - 1) return res;
    if (res.status === 403) {
      // Retry 403 only when it is a rate limit, not a scope/permission error.
      const text = await res.clone().text();
      if (!/rateLimit/i.test(text)) return res;
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(
      retryAfter > 0 ? retryAfter * 1000 : Math.min(2 ** i * 1000, 16000),
    );
  }
  return res;
}

/**
 * Lists ids of messages matching `query` (spam included, trash excluded),
 * paging up to `cap`. `capped` is true when more matches exist beyond the cap.
 */
export async function listGmailMessageIds(
  session: GoogleSession,
  query: string,
  cap = BULK_MAX_MESSAGES,
): Promise<{ ids: string[]; capped: boolean }> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${GMAIL_API}/users/me/messages`);
    url.searchParams.set("maxResults", "500");
    url.searchParams.set("includeSpamTrash", "true");
    url.searchParams.set("q", `${query} -in:trash`);
    url.searchParams.set("fields", "messages/id,nextPageToken");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await gmailFetchRetry(url, { headers: auth(session) });
    if (!res.ok) throw new Error(`GmailList failed: ${res.status}`);
    const data = (await res.json()) as {
      messages?: { id: string }[];
      nextPageToken?: string;
    };
    for (const m of data.messages ?? []) ids.push(m.id);
    pageToken = data.nextPageToken;
    if (ids.length >= cap) {
      return { ids: ids.slice(0, cap), capped: ids.length > cap || !!pageToken };
    }
  } while (pageToken);
  return { ids, capped: false };
}

/** Moves up to 1000 messages to the trash (recoverable for 30 days; never permanent). */
export async function batchTrashGmailMessages(
  session: GoogleSession,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  if (ids.length > BATCH_MODIFY_LIMIT) throw new Error("batch too large");
  const res = await gmailFetchRetry(
    `${GMAIL_API}/users/me/messages/batchModify`,
    {
      method: "POST",
      headers: { ...auth(session), "Content-Type": "application/json" },
      body: JSON.stringify({
        ids,
        addLabelIds: ["TRASH"],
        removeLabelIds: ["INBOX", "SPAM"],
      }),
    },
  );
  if (!res.ok) throw new Error(`GmailBatchTrash failed: ${res.status}`);
}
