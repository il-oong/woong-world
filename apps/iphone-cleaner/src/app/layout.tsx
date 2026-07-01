import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "iPhone 정리 도우미",
  description: "아이폰 저장공간을 분석하고 정리하는 도구",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
        <style>{`
          .nav-link {
            padding: 6px 14px;
            border-radius: 8px;
            font-size: 14px;
            color: var(--text-secondary);
            text-decoration: none;
            transition: all 0.15s;
          }
          .nav-link:hover {
            color: var(--text-primary);
            background-color: var(--bg-card);
          }
        `}</style>
        <header
          style={{
            borderBottom: "1px solid var(--border)",
            backgroundColor: "var(--bg-secondary)",
            position: "sticky",
            top: 0,
            zIndex: 50,
          }}
        >
          <div
            style={{
              maxWidth: "1100px",
              margin: "0 auto",
              padding: "0 24px",
              height: "56px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Link
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                textDecoration: "none",
              }}
            >
              <span style={{ fontSize: "22px" }}>📱</span>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: "16px",
                  color: "var(--text-primary)",
                  letterSpacing: "-0.3px",
                }}
              >
                iPhone 정리 도우미
              </span>
            </Link>
            <nav style={{ display: "flex", gap: "4px" }}>
              <Link href="/" className="nav-link">홈</Link>
              <Link href="/analyze" className="nav-link">사진 분석</Link>
              <Link href="/guide" className="nav-link">시스템 가이드</Link>
            </nav>
          </div>
        </header>
        <main style={{ minHeight: "calc(100vh - 56px)" }}>{children}</main>
      </body>
    </html>
  );
}
