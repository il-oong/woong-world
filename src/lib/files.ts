import { put, del } from "@vercel/blob";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { FileKind, UploadedFile } from "./assistant";
import { newId } from "./assistant";

const MAX_INLINE_TEXT = 1_000_000;
const MAX_BLOB_BYTES = 25_000_000;
const MAX_REMOTE_BYTES = 2_000_000;
const MAX_REMOTE_REDIRECTS = 3;

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
    m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (lower.endsWith(".json") || m === "application/json") return "json";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  return "text";
}

async function extractPdf(buf: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "";
  const loadingTask = pdfjs.getDocument({
    data: buf,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;
  const out: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    out.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
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
    throw new Error(`File is too large (maximum ${MAX_BLOB_BYTES / 1_000_000} MB)`);
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

  if (kind === "text" || kind === "markdown" || kind === "json") {
    out.textContent = new TextDecoder("utf-8", { fatal: false })
      .decode(buf)
      .slice(0, MAX_INLINE_TEXT);
  } else if (kind === "pdf") {
    try {
      out.textContent = (await extractPdf(buf)).slice(0, MAX_INLINE_TEXT);
    } catch {
      out.textContent = "(PDF text extraction failed)";
    }
  } else if (kind === "docx") {
    try {
      out.textContent = (await extractDocx(Buffer.from(buf))).slice(0, MAX_INLINE_TEXT);
    } catch {
      out.textContent = "(DOCX text extraction failed)";
    }
  }
  return out;
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice(7));
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("2001:db8:")
    );
  }
  return true;
}

function hostnameOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "");
}

async function resolvePublicAddress(url: URL): Promise<{ address: string; family: 4 | 6 }> {
  if (url.username || url.password) throw new Error("URL user info is not allowed");
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new Error("Only standard web ports are allowed");
  }
  const hostname = hostnameOf(url);
  const directFamily = isIP(hostname);
  if (directFamily === 4 || directFamily === 6) {
    if (isPrivateAddress(hostname)) throw new Error("Private network URLs are not allowed");
    return { address: hostname, family: directFamily };
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  const selected = addresses.find((entry) => !isPrivateAddress(entry.address));
  if (!selected) throw new Error("URL resolves to a private network address");
  return { address: selected.address, family: selected.family as 4 | 6 };
}

async function requestRemoteText(
  url: URL,
  destination: { address: string; family: 4 | 6 },
): Promise<{ status: number; location?: string; contentType: string; body: Buffer }> {
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const client = request(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BiseoAssistant/1.0)",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "Accept-Encoding": "identity",
        },
        lookup: (_hostname, _options, callback) =>
          callback(null, destination.address, destination.family),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const contentLength = Number(response.headers["content-length"] ?? 0);
        if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_BYTES) {
          response.resume();
          reject(new Error("URL content is too large"));
          return;
        }
        const chunks: Buffer[] = [];
        let received = 0;
        response.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_REMOTE_BYTES) {
            client.destroy(new Error("URL content is too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          resolve({
            status,
            location: typeof response.headers.location === "string" ? response.headers.location : undefined,
            contentType: String(response.headers["content-type"] ?? "").toLowerCase(),
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    client.setTimeout(8_000, () => client.destroy(new Error("URL request timed out")));
    client.on("error", reject);
    client.end();
  });
}

async function fetchSafeRemoteText(rawUrl: string): Promise<{ url: URL; html: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }
  for (let redirects = 0; redirects <= MAX_REMOTE_REDIRECTS; redirects += 1) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Only http(s) URLs are allowed");
    }
    const response = await requestRemoteText(url, await resolvePublicAddress(url));
    if (response.status >= 300 && response.status < 400 && response.location) {
      if (redirects === MAX_REMOTE_REDIRECTS) throw new Error("Too many URL redirects");
      url = new URL(response.location, url);
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`URL fetch failed: ${response.status}`);
    }
    if (
      response.contentType &&
      !response.contentType.startsWith("text/") &&
      !response.contentType.includes("application/xhtml+xml")
    ) {
      throw new Error("Only text and HTML URLs can be imported");
    }
    return { url, html: response.body.toString("utf8") };
  }
  throw new Error("Too many URL redirects");
}

export async function fetchUrlAsFile(
  email: string,
  rawUrl: string,
): Promise<UploadedFile> {
  void email;
  const { url, html } = await fetchSafeRemoteText(rawUrl);
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const title = titleMatch ? stripHtml(titleMatch[1]).slice(0, 200) : url.hostname;
  const text = stripHtml(html).slice(0, MAX_INLINE_TEXT);
  return {
    id: newId("f"),
    name: title || url.toString(),
    kind: "url",
    url: url.toString(),
    textContent: text,
    bytes: Buffer.byteLength(text, "utf8"),
    mimeType: "text/html",
    createdAt: Date.now(),
  };
}

export async function deleteBlob(blobUrl: string | undefined): Promise<void> {
  if (!blobUrl || !isBlobConfigured()) return;
  try {
    await del(blobUrl);
  } catch {
    // Blob cleanup is best effort.
  }
}
