import { getValidSession } from "@/lib/google";
import { allowedSheetUrl } from "@/lib/google-sheet-url";

export const dynamic = "force-dynamic";

const MAX_CSV_BYTES = 2_000_000;

async function readLimited(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length") ?? 0) > MAX_CSV_BYTES) throw new Error("too_large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CSV_BYTES) throw new Error("too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function GET(req: Request) {
  const session = await getValidSession();
  if (!session?.email) return new Response("not connected", { status: 401 });
  const { searchParams } = new URL(req.url);
  const csvUrl = searchParams.get("url");

  if (!csvUrl) {
    return new Response("url required", { status: 400 });
  }

  // 구글 시트 export URL만 허용
  let url = allowedSheetUrl(csvUrl);
  if (!url) {
    return new Response("only google sheets urls allowed", { status: 403 });
  }

  try {
    let res: Response | null = null;
    for (let i = 0; i <= 3; i++) {
      res = await fetch(url, {
        headers: { "User-Agent": "BiseoAssistant/1.0", Accept: "text/csv,text/plain,*/*" },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (res.status < 300 || res.status >= 400) break;
      const location = res.headers.get("location");
      if (!location || i === 3) return new Response("redirect blocked", { status: 502 });
      url = allowedSheetUrl(new URL(location, url).toString(), true);
      if (!url) return new Response("redirect blocked", { status: 403 });
    }
    if (!res) return new Response("sheet fetch failed", { status: 502 });
    if (res.status === 401 || res.status === 403) {
      return new Response(
        "시트가 비공개로 설정되어 있습니다. 시트 화면에서 [공유] → '링크가 있는 모든 사용자'로 변경한 뒤 다시 시도해주세요.",
        { status: 403 },
      );
    }
    if (!res.ok) {
      return new Response(
        `구글 시트를 가져오지 못했습니다 (HTTP ${res.status}). 시트가 삭제되었거나 URL이 잘못되었을 수 있습니다.`,
        { status: 502 },
      );
    }
    const text = await readLimited(res);
    // Google가 로그인 페이지/HTML을 반환한 경우 (200 OK여도)
    const head = text.trimStart();
    if (head.startsWith("<!") || head.startsWith("<html") || head.startsWith("<HTML")) {
      return new Response(
        "시트가 비공개로 설정되어 있습니다. 시트 화면에서 [공유] → '링크가 있는 모든 사용자'로 변경한 뒤 다시 시도해주세요.",
        { status: 403 },
      );
    }
    if (!text.trim()) {
      return new Response("시트가 비어 있습니다. 첫 번째 탭에 일정 데이터가 있는지 확인해주세요.", { status: 422 });
    }
    return new Response(text, {
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "too_large")
      return new Response("시트가 너무 큽니다 (최대 2MB).", { status: 413 });
    return new Response(
      `네트워크 오류로 시트를 가져오지 못했습니다: ${e instanceof Error ? e.message : "알 수 없는 오류"}`,
      { status: 500 },
    );
  }
}
