import { Redis } from "@upstash/redis";
import {
  BATCH_MODIFY_LIMIT,
  batchTrashGmailMessages,
  BULK_MAX_MESSAGES,
  listGmailMessageIds,
} from "./gmail-bulk";
import type { GoogleSession } from "./session";

export const BULK_PRESETS = {
  spam: { label: "스팸", query: "in:spam" },
  social: { label: "소셜(SNS)", query: "category:social" },
  promotions: { label: "프로모션", query: "category:promotions" },
  unread: { label: "안 읽음", query: "is:unread" },
} as const;

export type BulkPresetId = keyof typeof BULK_PRESETS;

function isPresetId(v: unknown): v is BulkPresetId {
  return typeof v === "string" && Object.hasOwn(BULK_PRESETS, v);
}

/** Builds the Gmail query from a preset and/or an extra user-supplied filter. */
export function buildBulkQuery(
  preset: unknown,
  extra: unknown,
): { query: string } | { error: string } {
  const parts: string[] = [];
  if (preset !== undefined && preset !== "") {
    if (!isPresetId(preset)) return { error: "invalid_preset" };
    parts.push(BULK_PRESETS[preset].query);
  }
  if (typeof extra === "string" && extra.trim()) {
    const e = extra.trim();
    if (e.length > 300 || /[\r\n\0]/.test(e)) return { error: "invalid_query" };
    parts.push(e);
  }
  if (parts.length === 0) return { error: "condition_required" };
  return { query: parts.join(" ") };
}

export type BulkJob = {
  id: string;
  query: string;
  status: "running" | "done" | "failed";
  total: number;
  processed: number;
  error?: string;
  startedAt: number;
  finishedAt?: number;
};

type Preview = { query: string; count: number; capped: boolean; ids: string[] };

function getCreds() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export function isBulkStorageConfigured(): boolean {
  return getCreds() !== null;
}

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const c = getCreds();
  if (!c) throw new Error("Redis credentials not set");
  _redis = new Redis(c);
  return _redis;
}

const previewKey = (email: string, token: string) =>
  `mail-bulk:preview:${email.toLowerCase()}:${token}`;
const jobKey = (email: string, id: string) =>
  `mail-bulk:job:${email.toLowerCase()}:${id}`;
const activeKey = (email: string) => `mail-bulk:active:${email.toLowerCase()}`;

const rid = () => crypto.randomUUID().replace(/-/g, "");

function parse<T>(raw: T | string): T {
  return typeof raw === "string" ? (JSON.parse(raw) as T) : raw;
}

/** Counts matches and stores the frozen id list under a short-lived confirm token. */
export async function createBulkPreview(
  session: GoogleSession,
  email: string,
  query: string,
) {
  const { ids, capped } = await listGmailMessageIds(
    session,
    query,
    BULK_MAX_MESSAGES,
  );
  if (ids.length === 0) return { count: 0, capped: false, token: null, query };
  const token = rid();
  const data: Preview = { query, count: ids.length, capped, ids };
  await redis().set(previewKey(email, token), JSON.stringify(data), {
    ex: 600,
  });
  return { count: ids.length, capped, token, query };
}

export async function getBulkJob(
  email: string,
  id: string,
): Promise<BulkJob | null> {
  const raw = await redis().get<BulkJob | string>(jobKey(email, id));
  return raw ? parse<BulkJob>(raw) : null;
}

async function saveJob(email: string, job: BulkJob) {
  await redis().set(jobKey(email, job.id), JSON.stringify(job), { ex: 86400 });
}

export type StartResult =
  | { ok: true; job: BulkJob; ids: string[] }
  | {
      ok: false;
      error: "preview_expired" | "count_mismatch" | "job_in_progress";
    };

/** Validates the confirmation (token + exact count) and registers a running job. */
export async function startBulkJob(
  email: string,
  token: string,
  confirmedCount: number,
): Promise<StartResult> {
  const raw = await redis().get<Preview | string>(previewKey(email, token));
  if (!raw) return { ok: false, error: "preview_expired" };
  const preview = parse<Preview>(raw);
  if (preview.count !== confirmedCount) {
    return { ok: false, error: "count_mismatch" };
  }

  // One bulk job per user at a time (lock expires in case a run dies).
  const jobId = rid();
  const locked = await redis().set(activeKey(email), jobId, {
    nx: true,
    ex: 1800,
  });
  if (!locked) return { ok: false, error: "job_in_progress" };
  await redis().del(previewKey(email, token)); // single use

  const job: BulkJob = {
    id: jobId,
    query: preview.query,
    status: "running",
    total: preview.ids.length,
    processed: 0,
    startedAt: Date.now(),
  };
  await saveJob(email, job);
  return { ok: true, job, ids: preview.ids };
}

/** Trashes ids in batches, persisting progress after each batch. */
export async function runBulkJob(
  session: GoogleSession,
  email: string,
  job: BulkJob,
  ids: string[],
) {
  try {
    for (let i = 0; i < ids.length; i += BATCH_MODIFY_LIMIT) {
      await batchTrashGmailMessages(
        session,
        ids.slice(i, i + BATCH_MODIFY_LIMIT),
      );
      job.processed = Math.min(i + BATCH_MODIFY_LIMIT, ids.length);
      await saveJob(email, job);
    }
    job.status = "done";
  } catch (e) {
    job.status = "failed";
    job.error = e instanceof Error ? e.message : "unknown";
  } finally {
    job.finishedAt = Date.now();
    await saveJob(email, job);
    await redis().del(activeKey(email));
  }
}
