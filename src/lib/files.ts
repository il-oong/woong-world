import { put, del } from "@vercel/blob";
import type { FileKind, UploadedFile } from "./assistant";
import { newId } from "./assistant";

const MAX_INLINE_TEXT = 1_000_000; // 1 MB of text stored inline in Redis
const MAX_BLOB_BYTES = 25_000_000; // 25 MB upload cap

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function detectKind(name: string, mime?: string): FileKind {
  const lower = name.toLowerCase();
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/.test(lower)) {
    return "image";
  }
  if (lower.endsWith(".pdf") || m === "application/pdf") return "pdf";
  if (
    lower.endsWith(".docx") ||
    m ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (lower.endsWith(".json") || m === "application/json") return "json";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  return "text";
}

async function extractPdf(buf: Uint8Array): Promise<string> {
  // Dynamic import keeps the heavy package out of cold-start unless needed.
  // pdfjs-dist legacy build runs in Node without a worker.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "";
  const loadingTask = pdfjs.getDocument({
    data: buf,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ");
    out.push(pageText);
  }
  return out.join("\n\n").trim();
}

async function extractDocx(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: buf });
  return result.value.trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export async function processUploadedFile(
  email: string,
  file: File,
): Promise<UploadedFile> {
  if (file.size > MAX_BLOB_BYTES) {
    throw new Error(`파일이 너무 큽니다 (최대 ${MAX_BLOB_BYTES / 1_000_000} MB)`);
  }
  const kind = detectKind(file.name, file.type);
  const id = newId("f");
  const now = Date.now();
  const buf = new Uint8Array(await file.arrayBuffer());

  const out: UploadedFile = {
    id,
    name: file.name,
    kind,
    mimeType: file.type,
    bytes: file.size,
    createdAt: now,
  };

  // Always upload the original to Blob (lets us re-process later, or send images to Gemini).
  if (isBlobConfigured()) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `assistant/${email.toLowerCase()}/${id}-${safeName}`;
    const result = await put(path, Buffer.from(buf), {
      access: "public",
      contentType: file.type || "application/octet-stream",
      addRandomSuffix: false,
    });
    out.blobUrl = result.url;
  }

  // Extract text by kind.
  if (kind === "text" || kind === "markdown" || kind === "json") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    out.textContent = text.slice(0, MAX_INLINE_TEXT);
  } else if (kind === "pdf") {
    try {
      out.textContent = (await extractPdf(buf)).slice(0, MAX_INLINE_TEXT);
    } catch {
      out.textContent = "(PDF 텍스트 추출 실패)";
    }
  } else if (kind === "docx") {
    try {
      out.textContent = (await extractDocx(Buffer.from(buf))).slice(
        0,
        MAX_INLINE_TEXT,
      );
    } catch {
      out.textContent = "(DOCX 텍스트 추출 실패)";
    }
  }
  // images: no text extraction, sent inline at chat time

  return out;
}

export async function fetchUrlAsFile(
  email: string,
  rawUrl: string,
): Promise<UploadedFile> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("유효하지 않은 URL");
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error("http(s) URL만 지원");
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; BiseoAssistant/1.0)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`URL fetch failed: ${res.status}`);
  const html = await res.text();
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : url.hostname;
  const text = stripHtml(html).slice(0, MAX_INLINE_TEXT);

  const id = newId("f");
  return {
    id,
    name: title || url.toString(),
    kind: "url",
    url: url.toString(),
    textContent: text,
    bytes: text.length,
    mimeType: "text/html",
    createdAt: Date.now(),
  };
}

export async function deleteBlob(blobUrl: string | undefined): Promise<void> {
  if (!blobUrl || !isBlobConfigured()) return;
  try {
    await del(blobUrl);
  } catch {
    // best effort
  }
}
