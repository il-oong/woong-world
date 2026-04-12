/**
 * Lightweight API guards: rate limiting, error sanitization, input validation,
 * and same-origin checks. All utilities are pure/synchronous and work in both
 * Node and Edge runtimes (no external deps).
 *
 * Rate limiting is in-memory per instance — good enough to deter abuse bursts
 * but not a replacement for Redis-backed limiting (e.g. Upstash) in a
 * multi-instance deploy.
 */

import { NextRequest, NextResponse } from "next/server";

// ─── Rate limiting ───────────────────────────────────────────────────────────

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Sweep expired buckets when the map gets big to avoid unbounded growth. */
function maybeSweep(now: number) {
  if (buckets.size < 10_000) return;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  maybeSweep(now);

  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

/** Extract a stable-ish client identifier. Falls back to "anonymous". */
export function clientKey(req: NextRequest, scope: string): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "anon";
  return `${scope}:${ip}`;
}

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": Math.max(
          1,
          Math.ceil((result.resetAt - Date.now()) / 1000),
        ).toString(),
      },
    },
  );
}

// ─── Error sanitization ──────────────────────────────────────────────────────

/**
 * In production, return a generic message to the client so we don't leak file
 * paths, stack traces, or upstream error bodies. In dev, pass the real message
 * through for debugging.
 */
export function sanitizeError(err: unknown): string {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) return "Internal error";
  if (err instanceof Error) return err.message;
  return String(err);
}

// ─── Input helpers ───────────────────────────────────────────────────────────

/** Strip control characters and clamp length. Returns empty string for non-strings. */
export function sanitizeText(input: unknown, maxLen = 4000): string {
  if (typeof input !== "string") return "";
  // Remove C0/C1 control chars except newline/tab; collapse weird whitespace.
  const cleaned = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return cleaned.slice(0, maxLen);
}

/** Sanitize a one-line context hint (used inside LLM system prompts). */
export function sanitizeInline(input: unknown, maxLen = 500): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[`<>]/g, "")
    .trim()
    .slice(0, maxLen);
}

export function isAllowedId(id: unknown, allow: ReadonlySet<string>): id is string {
  return typeof id === "string" && allow.has(id);
}

// ─── Origin check (lightweight CSRF mitigation) ──────────────────────────────

/**
 * For state-changing requests from the browser, require that Origin or Referer
 * matches the request host. This blocks trivial cross-site POSTs that would
 * otherwise burn through LLM credits. It does NOT replace proper auth.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const host = req.headers.get("host");
  if (!host) return false;

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  // Some clients omit Origin on same-origin requests; fall back to Referer.
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }
  // No Origin and no Referer — treat as untrusted for POST.
  return false;
}
