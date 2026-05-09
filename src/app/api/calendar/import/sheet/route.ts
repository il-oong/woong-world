export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const csvUrl = searchParams.get("url");

  if (!csvUrl) {
    return new Response("url required", { status: 400 });
  }

  // 구글 시트 export URL만 허용
  if (!csvUrl.startsWith("https://docs.google.com/spreadsheets/")) {
    return new Response("only google sheets urls allowed", { status: 403 });
  }

  try {
    const res = await fetch(csvUrl, {
      headers: { "User-Agent": "BiseoAssistant/1.0" },
    });
    if (!res.ok) {
      return new Response(`sheet fetch failed: ${res.status}`, { status: 502 });
    }
    const text = await res.text();
    // Google가 로그인 페이지(HTML)를 반환한 경우
    if (text.trimStart().startsWith("<!")) {
      return new Response("시트가 공개 설정되어 있지 않습니다. 공유 → 링크가 있는 모든 사용자로 변경해주세요.", { status: 403 });
    }
    return new Response(text, {
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "fetch failed", { status: 500 });
  }
}
