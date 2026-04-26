import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import {
  addFile,
  isAssistantStorageConfigured,
  listFiles,
} from "@/lib/assistant";
import { processUploadedFile } from "@/lib/files";

export const dynamic = "force-dynamic";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  if (!isAssistantStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const files = await listFiles(session.email);
  return Response.json({ files });
}

export async function POST(req: NextRequest) {
  if (!isAssistantStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "invalid_form" }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "no_file" }, { status: 400 });
  }

  try {
    const processed = await processUploadedFile(session.email, file);
    await addFile(session.email, processed);
    return Response.json({ file: processed });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "upload_failed" },
      { status: 500 },
    );
  }
}
