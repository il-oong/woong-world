import { z } from "zod";
import { readSession } from "@/lib/session";
import { workspaceSchema } from "@/lib/mental-health";
import {
  loadWorkspace,
  saveWorkspace,
  deleteWorkspace,
  storageReady,
} from "@/lib/mental-health-store";
import { aiReady } from "@/lib/mental-health-ai";
import { privateJson, sameOrigin, limitedJson } from "@/lib/mental-health-http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const session = await readSession();
  if (!session?.email) return privateJson({ error: "not_connected" }, 401);
  if (req.headers.get("x-mental-owner") !== session.email)
    return privateJson({ error: "account_changed" }, 409);
  try {
    const stored = storageReady()
      ? await loadWorkspace(session.email)
      : { data: null, revision: null, expiresAt: null };
    return privateJson({
      ...stored,
      storageReady: storageReady(),
      aiReady: aiReady() && storageReady(),
    });
  } catch {
    return privateJson({ error: "storage_unavailable" }, 503);
  }
}
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "forbidden" }, 403);
  const session = await readSession();
  if (!session?.email) return privateJson({ error: "not_connected" }, 401);
  if (req.headers.get("x-mental-owner") !== session.email)
    return privateJson({ error: "account_changed" }, 409);
  let input;
  try {
    input = z
      .object({
        consent: z.literal(true),
        revision: z.string().uuid().nullable(),
        data: workspaceSchema,
      })
      .strict()
      .parse(await limitedJson(req));
  } catch {
    return privateJson({ error: "invalid_input" }, 400);
  }
  try {
    return privateJson(
      await saveWorkspace(session.email, input.data, input.revision),
    );
  } catch (e) {
    return privateJson(
      {
        error:
          e instanceof Error && e.message === "conflict"
            ? "conflict"
            : "storage_unavailable",
      },
      e instanceof Error && e.message === "conflict" ? 409 : 503,
    );
  }
}
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "forbidden" }, 403);
  const session = await readSession();
  if (!session?.email) return privateJson({ error: "not_connected" }, 401);
  if (req.headers.get("x-mental-owner") !== session.email)
    return privateJson({ error: "account_changed" }, 409);
  try {
    return privateJson({ revision: await deleteWorkspace(session.email) });
  } catch {
    return privateJson({ error: "storage_unavailable" }, 503);
  }
}
