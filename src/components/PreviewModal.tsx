"use client";

import { useEffect, useState } from "react";
import { CATEGORY_BY_ID, type Service } from "@/lib/types";

type Tab = "live" | "spec" | "tree";

type RepoTreeEntry = {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size: number;
  html_url: string;
};

function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diff = Date.now() - then;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "today";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))}w ago`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}mo ago`;
  return `${Math.floor(diff / (365 * day))}y ago`;
}

export function PreviewModal({
  service,
  onClose,
}: {
  service: Service;
  onClose: () => void;
}) {
  const initialTab: Tab = service.resolvedLiveUrl ? "live" : "spec";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const category = CATEGORY_BY_ID[service.category];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="m-auto flex h-[92vh] w-[96vw] max-w-7xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[#0b0b0f] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-xl"
            style={{ background: `${category.color}1a` }}
          >
            {service.icon ?? "📦"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h2 className="truncate text-sm font-medium">
                {service.resolvedTitle}
              </h2>
              <span
                className="font-mono text-[10px] uppercase tracking-wider"
                style={{ color: category.color }}
              >
                {category.label}
              </span>
            </div>
            <p className="truncate font-mono text-[11px] text-[var(--muted)]">
              {service.repo}
            </p>
          </div>

          <a
            href={service.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition hover:border-[var(--accent)]/50 hover:text-foreground"
            title="GitHub에서 새 탭으로 열기"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.69-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18a10.95 10.95 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.68.8.56 4.56-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5Z" />
            </svg>
            <span>GitHub</span>
            <span>↗</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
            aria-label="닫기"
          >
            ✕
          </button>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="flex w-44 shrink-0 flex-col border-r border-[var(--border)] bg-black/20 p-2 text-xs">
            <TabButton active={tab === "live"} onClick={() => setTab("live")}>
              <span className="text-[var(--accent)]">●</span> 라이브
            </TabButton>
            <TabButton active={tab === "spec"} onClick={() => setTab("spec")}>
              📋 기획서
            </TabButton>
            <TabButton active={tab === "tree"} onClick={() => setTab("tree")}>
              📁 코드 구조
            </TabButton>

            <div className="mt-auto flex flex-col gap-1 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--muted)]">
              {service.language && <div>{service.language}</div>}
              {typeof service.stars === "number" && service.stars > 0 && (
                <div>★ {service.stars}</div>
              )}
              {relativeTime(service.pushedAt) && (
                <div>{relativeTime(service.pushedAt)}</div>
              )}
              {service.isPrivate && <div>🔒 private</div>}
              {!service.exists && <div className="text-amber-300/70">⚠ unlinked</div>}
            </div>
          </aside>

          <main className="relative flex-1 overflow-auto bg-black">
            {tab === "live" && (
              <LiveTab
                service={service}
                iframeKey={iframeKey}
                onReload={() => {
                  setIframeLoaded(false);
                  setIframeKey((k) => k + 1);
                }}
                loaded={iframeLoaded}
                onLoad={() => setIframeLoaded(true)}
              />
            )}
            {tab === "spec" && <SpecTab service={service} />}
            {tab === "tree" && <TreeTab service={service} />}
          </main>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-left transition ${
        active
          ? "bg-white/10 text-foreground"
          : "text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function LiveTab({
  service,
  iframeKey,
  onReload,
  loaded,
  onLoad,
}: {
  service: Service;
  iframeKey: number;
  onReload: () => void;
  loaded: boolean;
  onLoad: () => void;
}) {
  if (!service.resolvedLiveUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="text-3xl">🌐</span>
        <h3 className="text-base font-medium">라이브 URL이 없습니다</h3>
        <p className="max-w-md text-xs leading-relaxed text-[var(--muted)]">
          이 프로젝트의 임베드 가능한 라이브 URL이 등록돼 있지 않습니다.{" "}
          <code className="rounded bg-white/5 px-1 font-mono text-[10px]">
            src/data/services.json
          </code>{" "}
          의 해당 항목에{" "}
          <code className="rounded bg-white/5 px-1 font-mono text-[10px]">
            liveUrl
          </code>{" "}
          을 추가하세요.
        </p>
        <a
          href={service.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-medium text-black hover:bg-[var(--accent)]/90"
        >
          ↗ GitHub에서 보기
        </a>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[11px]">
        <button
          type="button"
          onClick={onReload}
          className="rounded p-1 text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
          aria-label="새로고침"
          title="새로고침"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
        <span className="truncate font-mono text-[var(--muted)]">
          {service.resolvedLiveUrl}
        </span>
        <a
          href={service.resolvedLiveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto rounded px-1.5 py-0.5 text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
          title="새 탭에서 열기"
        >
          ↗
        </a>
      </div>
      <div className="relative flex-1">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)]">
            로딩 중...
          </div>
        )}
        <iframe
          key={iframeKey}
          src={service.resolvedLiveUrl}
          title={service.resolvedTitle}
          onLoad={onLoad}
          className="h-full w-full border-0"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-presentation"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
}

type RepoDoc = {
  path: string;
  size: number;
  content: string;
  truncated: boolean;
  html_url: string;
};

function SpecTab({ service }: { service: Service }) {
  const [docs, setDocs] = useState<RepoDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDocs(null);
    setError(null);
    setActivePath(null);
    fetch(`/api/repo-docs/${service.repo}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ docs: RepoDoc[] }>;
      })
      .then((d) => {
        if (cancelled) return;
        setDocs(d.docs);
        setActivePath(d.docs[0]?.path ?? null);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [service.repo]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-xs">
        <span className="text-2xl">📋</span>
        <p className="text-[var(--muted)]">기획서를 불러올 수 없습니다 ({error})</p>
        <p className="max-w-md leading-relaxed text-[var(--muted)]">
          비공개 레포라면{" "}
          <code className="rounded bg-white/5 px-1 font-mono">GITHUB_TOKEN</code>
          이 필요합니다. 또는 GitHub API rate limit (60 req/h, 인증 시 5000)일
          수도 있습니다.
        </p>
      </div>
    );
  }

  if (!docs) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--muted)]">
        .md 파일 수집 중...
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-xs">
        <span className="text-2xl">📋</span>
        <p className="text-[var(--muted)]">이 레포에는 .md 파일이 없습니다.</p>
        <p className="max-w-md leading-relaxed text-[var(--muted)]">
          README.md, SPEC.md, docs/*.md 등이 있으면 여기에 모아서 보여드립니다.
        </p>
      </div>
    );
  }

  const active = docs.find((d) => d.path === activePath) ?? docs[0];

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 overflow-y-auto border-r border-[var(--border)] bg-black/20 p-2 text-xs">
        <p className="px-2 pb-2 pt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
          {docs.length}개 .md
        </p>
        {docs.map((d) => (
          <button
            key={d.path}
            type="button"
            onClick={() => setActivePath(d.path)}
            className={`block w-full truncate rounded-md px-2 py-1.5 text-left font-mono text-[11px] transition ${
              d.path === active.path
                ? "bg-white/10 text-foreground"
                : "text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
            }`}
            title={d.path}
          >
            {d.path}
          </button>
        ))}
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-4 py-1.5 text-[11px]">
          <code className="truncate font-mono text-[var(--muted)]">
            {active.path}
          </code>
          <span className="font-mono text-[10px] text-[var(--muted)]">
            {formatSize(active.size)}
            {active.truncated && " · 잘림"}
          </span>
          <a
            href={active.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto rounded px-1.5 py-0.5 text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
            title="GitHub에서 원문 보기"
          >
            ↗
          </a>
        </div>
        <div className="flex-1 overflow-auto px-6 py-6">
          <Markdown source={active.content} />
          {active.truncated && (
            <p className="mt-6 rounded-md border border-[var(--border)] bg-black/20 px-3 py-2 text-[10px] text-[var(--muted)]">
              파일이 64KB 이상이라 일부만 표시됩니다. ↗ 버튼으로 GitHub에서 원문
              확인.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  // inline code
  out = out.replace(/`([^`]+)`/g, '<code class="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px]">$1</code>');
  // bold
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // italic (avoid clashing with bold)
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // links [text](url)
  out = out.replace(
    /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[var(--accent)] hover:underline">$1</a>',
  );
  return out;
}

function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    // fenced code
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const start = i + 1;
      let end = start;
      while (end < lines.length && !lines[end].startsWith("```")) end++;
      const code = lines.slice(start, end).join("\n");
      blocks.push(
        <pre
          key={key++}
          className="my-3 overflow-x-auto rounded-lg border border-[var(--border)] bg-black/40 p-3 text-[12px] leading-relaxed"
        >
          {lang && (
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
              {lang}
            </span>
          )}
          <code>{code}</code>
        </pre>,
      );
      i = end + 1;
      continue;
    }
    // headings
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls =
        level === 1
          ? "mt-4 mb-3 text-2xl font-semibold"
          : level === 2
            ? "mt-5 mb-2 text-xl font-semibold"
            : level === 3
              ? "mt-4 mb-2 text-lg font-medium"
              : "mt-3 mb-1.5 text-sm font-medium";
      blocks.push(
        <p
          key={key++}
          className={cls}
          dangerouslySetInnerHTML={{ __html: renderInline(h[2]) }}
        />,
      );
      i++;
      continue;
    }
    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="my-2 ml-5 list-disc space-y-1 text-sm leading-relaxed">
          {items.map((it, idx) => (
            <li
              key={idx}
              dangerouslySetInnerHTML={{ __html: renderInline(it) }}
            />
          ))}
        </ul>,
      );
      continue;
    }
    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="my-2 ml-5 list-decimal space-y-1 text-sm leading-relaxed">
          {items.map((it, idx) => (
            <li
              key={idx}
              dangerouslySetInnerHTML={{ __html: renderInline(it) }}
            />
          ))}
        </ol>,
      );
      continue;
    }
    // blank line
    if (line.trim() === "") {
      i++;
      continue;
    }
    // paragraph (collect consecutive non-empty non-special lines)
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p
        key={key++}
        className="my-2 text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: renderInline(para.join(" ")) }}
      />,
    );
  }
  return <div className="prose-invert">{blocks}</div>;
}

function TreeTab({ service }: { service: Service }) {
  const [entries, setEntries] = useState<RepoTreeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);
    fetch(`/api/repo-tree/${service.repo}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ contents: RepoTreeEntry[] }>;
      })
      .then((d) => {
        if (!cancelled) setEntries(d.contents);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [service.repo]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-xs">
        <span className="text-2xl">📁</span>
        <p className="text-[var(--muted)]">코드 구조를 불러올 수 없습니다 ({error})</p>
        <p className="max-w-md leading-relaxed text-[var(--muted)]">
          비공개 레포라면 환경 변수{" "}
          <code className="rounded bg-white/5 px-1 font-mono">GITHUB_TOKEN</code>
          이 필요합니다. GitHub API rate limit (60 req/h, 인증 시 5000) 일 수도
          있습니다.
        </p>
      </div>
    );
  }

  if (!entries) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--muted)]">
        코드 구조 로딩 중...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 text-xs">
      <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
        {"// "}top-level — {service.repo}
      </h3>
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
        {entries.length === 0 && (
          <div className="px-4 py-6 text-center text-[var(--muted)]">
            (비어 있음)
          </div>
        )}
        {entries.map((e, i) => (
          <a
            key={e.path}
            href={e.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center justify-between gap-3 px-4 py-2 transition hover:bg-white/5 ${
              i !== 0 ? "border-t border-[var(--border)]/50" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{e.type === "dir" ? "📁" : "📄"}</span>
              <code className="font-mono text-[var(--accent)]">{e.name}</code>
            </div>
            {e.type === "file" && e.size > 0 && (
              <span className="font-mono text-[10px] text-[var(--muted)]">
                {formatSize(e.size)}
              </span>
            )}
          </a>
        ))}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-[var(--muted)]">
        한 단계만 표시됩니다. 깊은 트리는 GitHub에서 보세요.
      </p>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
