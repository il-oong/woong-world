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
      headers: { "User-Agent": "BiseoAssistant/1.0", Accept: "text/csv,text/plain,*/*" },
      redirect: "follow",
    });
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
    const text = await res.text();
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
    return new Response(
      `네트워크 오류로 시트를 가져오지 못했습니다: ${e instanceof Error ? e.message : "알 수 없는 오류"}`,
      { status: 500 },
    );
  }
}
