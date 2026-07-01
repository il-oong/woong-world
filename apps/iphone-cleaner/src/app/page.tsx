import Link from "next/link";

const steps = [
  {
    number: "01",
    icon: "📱",
    title: "사이트 접속",
    description: "아이폰 또는 PC 브라우저에서 이 페이지에 접속하세요. 별도 앱 설치가 필요 없습니다.",
  },
  {
    number: "02",
    icon: "🖼️",
    title: "사진 선택",
    description: '"사진 분석" 페이지에서 사진 선택 버튼을 누르고 분석하고 싶은 사진을 선택하세요. 아이폰에서는 사진첩이 바로 열립니다.',
  },
  {
    number: "03",
    icon: "✨",
    title: "결과 확인 & 정리",
    description: "중복 사진과 스크린샷 목록을 확인하고 아이폰 사진 앱에서 직접 삭제하세요.",
  },
];

const cards = [
  {
    href: "/analyze",
    icon: "🖼️",
    title: "중복 사진 & 스크린샷 분석",
    description:
      "선택한 사진 중 완전히 동일한 중복 파일과 스크린샷을 자동으로 찾아냅니다. 모든 처리는 브라우저 내에서 안전하게 이루어집니다.",
    color: "#6c63ff",
    badge: "사진 분석",
  },
  {
    href: "/guide",
    icon: "🗂️",
    title: "시스템 데이터 정리 가이드",
    description:
      "앱 캐시, 메시지 첨부파일, Safari 데이터 등 아이폰 저장공간을 차지하는 시스템 데이터를 줄이는 방법을 안내합니다.",
    color: "#22c55e",
    badge: "가이드",
  },
];

export default function HomePage() {
  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "60px 24px" }}>
      <style>{`
        .card-link { display: block; padding: 28px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; text-decoration: none; transition: all 0.2s; position: relative; overflow: hidden; }
        .card-link:hover { transform: translateY(-2px); background: var(--bg-card-hover); }
      `}</style>

      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: "72px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "6px 16px", borderRadius: "999px", backgroundColor: "rgba(108,99,255,0.12)", border: "1px solid rgba(108,99,255,0.3)", fontSize: "13px", color: "#a89fff", marginBottom: "28px" }}>
          <span>🔒</span>
          <span>100% 브라우저 처리 — 파일이 외부로 전송되지 않습니다</span>
        </div>
        <h1 style={{ fontSize: "clamp(30px, 5vw, 50px)", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-1px", marginBottom: "20px", background: "linear-gradient(135deg, #e8e8f0 0%, #a89fff 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
          아이폰 저장공간<br />스마트하게 정리하기
        </h1>
        <p style={{ fontSize: "16px", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: "500px", margin: "0 auto" }}>
          중복 사진, 스크린샷을 자동으로 찾아 저장공간을 확보하세요.
          USB 연결 없이 아이폰 브라우저에서 바로 사용 가능합니다.
        </p>
      </div>

      {/* Steps */}
      <div style={{ marginBottom: "72px" }}>
        <h2 style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.5px", color: "var(--text-secondary)", marginBottom: "20px" }}>
          사용 방법
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "18px", padding: "22px", backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "14px" }}>
              <div style={{ width: "42px", height: "42px", borderRadius: "12px", backgroundColor: "rgba(108,99,255,0.1)", border: "1px solid rgba(108,99,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>
                {s.icon}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#6c63ff", letterSpacing: "0.5px" }}>STEP {s.number}</span>
                  <span style={{ fontSize: "15px", fontWeight: 600 }}>{s.title}</span>
                </div>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.65 }}>{s.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div>
        <h2 style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.5px", color: "var(--text-secondary)", marginBottom: "20px" }}>
          기능 선택
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
          {cards.map((c, i) => (
            <Link key={i} href={c.href} className="card-link" style={{ borderTop: `3px solid ${c.color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                <span style={{ fontSize: "34px" }}>{c.icon}</span>
                <span style={{ fontSize: "11px", fontWeight: 600, padding: "4px 10px", borderRadius: "999px", backgroundColor: `${c.color}20`, color: c.color }}>{c.badge}</span>
              </div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px", letterSpacing: "-0.3px" }}>{c.title}</h3>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.65 }}>{c.description}</p>
              <div style={{ marginTop: "18px", fontSize: "13px", color: c.color, fontWeight: 600 }}>시작하기 →</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
