import { after, type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import {
  buildBulkQuery,
  createBulkPreview,
  getBulkJob,
  isBulkStorageConfigured,
  runBulkJob,
  startBulkJob,
} from "@/lib/mail-bulk";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HEX32 = /^[a-f0-9]{32}$/;

async function authenticate() {
  if (!isBulkStorageConfigured()) {
    return {
      res: Response.json({ error: "storage_not_configured" }, { status: 503 }),
    };
  }
  const session = await getValidSession();
  if (!session?.email) {
    return { res: Response.json({ error: "not_connected" }, { status: 401 }) };
  }
  return { session, email: session.email };
}

/** Progress polling: GET ?jobId=... */
export async function GET(req: NextRequest) {
  const a = await authenticate();
  if (!a.session) return a.res;
  const jobId = req.nextUrl.searchParams.get("jobId") ?? "";
  if (!HEX32.test(jobId)) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }
  const job = await getBulkJob(a.email, jobId);
  if (!job) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ job });
}

/**
 * Two-step flow:
 *  - { action: "preview", preset?, query? } -> match count + confirm token
 *  - { action: "start", token, confirmCount } -> starts a background trash job
 * Messages go to the Gmail trash (recoverable for 30 days), never permanently deleted.
 */
export async function POST(req: NextRequest) {
  const a = await authenticate();
  if (!a.session) return a.res;
  const { session, email } = a;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    if (body.action === "preview") {
      const built = buildBulkQuery(body.preset, body.query);
      if ("error" in built) {
        return Response.json({ error: built.error }, { status: 400 });
      }
      return Response.json(await createBulkPreview(session, email, built.query));
    }

    if (body.action === "start") {
      if (
        typeof body.token !== "string" ||
        !HEX32.test(body.token) ||
        typeof body.confirmCount !== "number"
      ) {
        return Response.json({ error: "invalid_input" }, { status: 400 });
      }
      const started = await startBulkJob(email, body.token, body.confirmCount);
      if (!started.ok) {
        const status = started.error === "preview_expired" ? 410 : 409;
        return Response.json({ error: started.error }, { status });
      }
      const { job, ids } = started;
      after(() => runBulkJob(session, email, job, ids));
      return Response.json({ job }, { status: 202 });
    }
  } catch (e) {
    console.error("[mail bulk-trash]", e);
    return Response.json({ error: "gmail_failed" }, { status: 502 });
  }
  return Response.json({ error: "invalid_input" }, { status: 400 });
}
