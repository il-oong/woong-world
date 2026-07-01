import Link from "next/link";

const steps = [
  {
    number: "01",
    icon: "🔌",
    title: "USB로 아이폰 연결",
    description: "Lightning 또는 USB-C 케이블로 아이폰을 PC에 연결하세요.",
  },
  {
    number: "02",
    icon: "🔓",
    title: "PC 접근 허용",
    description: '아이폰 화면에 "이 컴퓨터를 신뢰하겠습니까?" 팝업이 뜨면 "신뢰"를 탭하세요.',
  },
  {
    number: "03",
    icon: "📂",
    title: "DCIM 폴더 선택",
    description: '"사진 분석" 페이지에서 아이폰의 DCIM 폴더를 선택하면 자동으로 분석합니다.',
  },
];

const cards = [
  {
    href: "/analyze",
    icon: "🖼️",
    title: "중복 사진 & 스크린샷",
    description:
      "DCIM 폴더를 스캔하여 중복된 사진과 스크린샷을 찾아냅니다. 브라우저 내에서 안전하게 분석됩니다.",
    colorVar: "#6c63ff",
    badge: "사진 분석",
  },
  {
    href: "/guide",
    icon: "🗂️",
    title: "시스템 데이터 정리 가이드",
    description:
      "앱 캐시, 메시지 첨부파일, Safari 데이터 등 시스템 데이터를 줄이는 방법을 안내합니다.",
    colorVar: "#22c55e",
    badge: "가이드",
  },
];

export default function HomePage() {
  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "60px 24px" }}>
      <style>{`
        .action-card {
          display: block;
          padding: 28px;
          background-color: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
          text-decoration: none;
          transition: all 0.2s;
          position: relative;
          overflow: hidden;
        }
        .action-card:hover {
          background-color: var(--bg-card-hover);
          transform: translateY(-2px);
        }
        .action-card-purple:hover { border-color: #6c63ff; }
        .action-card-green:hover { border-color: #22c55e; }
      `}</style>

      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: "72px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 16px",
            borderRadius: "999px",
            backgroundColor: "rgba(108, 99, 255, 0.12)",
            border: "1px solid rgba(108, 99, 255, 0.3)",
            fontSize: "13px",
            color: "#a89fff",
            marginBottom: "28px",
          }}
        >
          <span>✨</span>
          <span>100% 브라우저 내 처리 — 파일이 외부로 전송되지 않습니다</span>
        </div>
        <h1
          style={{
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-1px",
            marginBottom: "20px",
            background: "linear-gradient(135deg, #e8e8f0 0%, #a89fff 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          아이폰 저장공간
          <br />
          스마트하게 정리하기
        </h1>
        <p
          style={{
            fontSize: "17px",
            color: "var(--text-secondary)",
            lineHeight: 1.7,
            maxWidth: "520px",
            margin: "0 auto",
          }}
        >
          중복 사진, 스크린샷, 불필요한 앱 데이터를 찾아 저장공간을 확보하세요.
          서버 전송 없이 브라우저에서 직접 분석합니다.
        </p>
      </div>

      {/* Steps */}
      <div style={{ marginBottom: "72px" }}>
        <h2
          style={{
            fontSize: "13px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "1px",
            color: "var(--text-secondary)",
            marginBottom: "24px",
          }}
        >
          시작하는 방법
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {steps.map((step, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "20px",
                padding: "24px",
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "14px",
              }}
            >
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  backgroundColor: "rgba(108, 99, 255, 0.1)",
                  border: "1px solid rgba(108, 99, 255, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  flexShrink: 0,
                }}
              >
                {step.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "6px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#6c63ff",
                      letterSpacing: "0.5px",
                    }}
                  >
                    STEP {step.number}
                  </span>
                  <span
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {step.title}
                  </span>
                </div>
                <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Cards */}
      <div>
        <h2
          style={{
            fontSize: "13px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "1px",
            color: "var(--text-secondary)",
            marginBottom: "24px",
          }}
        >
          기능 선택
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "16px",
          }}
        >
          {cards.map((card, i) => (
            <Link
              key={i}
              href={card.href}
              className={`action-card ${i === 0 ? "action-card-purple" : "action-card-green"}`}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: "3px",
                  backgroundColor: card.colorVar,
                  borderRadius: "16px 16px 0 0",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "16px",
                }}
              >
                <span style={{ fontSize: "36px" }}>{card.icon}</span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: "999px",
                    backgroundColor: `${card.colorVar}20`,
                    color: card.colorVar,
                  }}
                >
                  {card.badge}
                </span>
              </div>
              <h3
                style={{
                  fontSize: "17px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  marginBottom: "10px",
                  letterSpacing: "-0.3px",
                }}
              >
                {card.title}
              </h3>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.65 }}>
                {card.description}
              </p>
              <div
                style={{
                  marginTop: "20px",
                  fontSize: "13px",
                  color: card.colorVar,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                시작하기 <span>→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Privacy note */}
      <div
        style={{
          marginTop: "56px",
          padding: "20px 24px",
          backgroundColor: "rgba(34, 197, 94, 0.06)",
          border: "1px solid rgba(34, 197, 94, 0.15)",
          borderRadius: "12px",
          display: "flex",
          alignItems: "flex-start",
          gap: "14px",
        }}
      >
        <span style={{ fontSize: "20px", flexShrink: 0, marginTop: "1px" }}>🔒</span>
        <div>
          <p
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "#22c55e",
              marginBottom: "4px",
            }}
          >
            개인정보 보호
          </p>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            모든 파일 분석은 브라우저 내에서만 이루어집니다. 사진이나 파일 데이터가 서버로 전송되거나
            저장되지 않습니다. Web Crypto API와 File System Access API를 사용하여 로컬에서 안전하게
            처리됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
