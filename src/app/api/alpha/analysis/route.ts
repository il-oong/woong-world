import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { Redis } from "@upstash/redis";
import type { JkpAnalysisResult } from "@/lib/alpha";

export const dynamic = "force-dynamic";

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis not configured");
  return new Redis({ url, token });
}

export type AnalysisJob = {
  status: "pending" | "done" | "error";
  result?: JkpAnalysisResult;
  error?: string;
  ticker: string;
  name: string;
  createdAt: number;
};

export function jobKey(jobId: string) {
  return `alpha:analysis:${jobId}`;
}

// POST: create pending job, return jobId immediately
export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker, name, market } = await req.json() as { ticker: string; name: string; market?: string };
  if (!ticker || !name) return NextResponse.json({ error: "ticker, name required" }, { status: 400 });

  const jobId = `j_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const job: AnalysisJob = {
    status: "pending",
    ticker,
    name,
    createdAt: Date.now(),
  };

  const redis = getRedis();
  await redis.set(jobKey(jobId), job, { ex: 600 }); // 10분 TTL

  return NextResponse.json({ jobId, ticker, name, market });
}

// GET: poll job status
export async function GET(req: NextRequest) {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  const redis = getRedis();
  const job = await redis.get<AnalysisJob>(jobKey(jobId));
  if (!job) return NextResponse.json({ error: "job_not_found" }, { status: 404 });

  return NextResponse.json(job);
}
