# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # 개발 서버 (localhost:3000)
npm run build    # 프로덕션 빌드
npm run lint     # ESLint 검사
```

Windows 전용 스크립트: `dev.bat`, `desktop-dev.bat`

## Required Environment Variables

`.env.local`에 아래 변수가 없으면 기능이 동작하지 않는다.

### 기본 (필수)

| 변수 | 용도 | 발급 위치 |
|------|------|-----------|
| `GEMINI_API_KEY` | AI 어시스턴트 (Google Gemini 2.5-flash-lite) | Google AI Studio |
| `GOOGLE_CLIENT_ID` | Google OAuth | Google Cloud Console → 사용자 인증 정보 |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | Google Cloud Console → 사용자 인증 정보 |
| `GOOGLE_REDIRECT_URI` | OAuth 콜백 URL | 직접 입력 (로컬: `http://localhost:3000/api/google/callback`) |
| `SESSION_SECRET` | JWT 암호화 (32바이트 이상) | `openssl rand -hex 32` |
| `UPSTASH_REDIS_REST_URL` | Redis | Upstash 콘솔 → 프로젝트 → REST API |
| `UPSTASH_REDIS_REST_TOKEN` | Redis 인증 | Upstash 콘솔 → 프로젝트 → REST API |

### 브리핑 음성 (필수)

| 변수 | 용도 | 발급 위치 |
|------|------|-----------|
| `GOOGLE_TTS_API_KEY` | 음성 합성 (Google Cloud TTS) | Google Cloud Console → API 키 (Cloud Text-to-Speech API 활성화 필요) |
| `BLOB_READ_WRITE_TOKEN` | 음성 MP3 파일 저장 | Vercel 대시보드 → Storage → Blob → 스토어 생성 후 자동 주입 |

### 선택

| 변수 | 용도 | 발급 위치 |
|------|------|-----------|
| `GITHUB_TOKEN` | GitHub API rate limit 우회 + 플러그인 상태등 조회 | GitHub → Settings → Developer settings → Personal access tokens |
| `ADMIN_EMAIL` | 웅허브 관리자 이메일 (기본값 `kww2962@gmail.com`) | 직접 입력 |

## Architecture

**개인 생산성 허브** — 다크 테마 UI에 GitHub 포트폴리오, Google 캘린더, AI 어시스턴트(Gemini), 목표 관리를 통합한 Next.js 앱.

### 데이터 흐름

- **AI 어시스턴트**: 클라이언트 → `/api/assistant/chat` → `lib/gemini.ts` (캘린더/플랜/플러그인 컨텍스트 주입) → Redis에 대화 기록 저장
- **캘린더**: `lib/session.ts` (JWT 쿠키) → `lib/google.ts` (OAuth + Calendar API) → `/api/google/events`
- **플랜**: `/api/plans` → `lib/plans.ts` → Redis
- **파일**: Vercel Blob 저장 → Redis에 메타데이터
- **웅허브 (관리자 모드)**: `ADMIN_EMAIL`로 로그인 시 활성화. `src/data/plugins.json`에 등록된 플러그인을 `/api/plugins/status`가 GitHub Actions/PR 상태로 🟢🟡🔴 점등. `/plugins/[id]`에서 iframe으로 임베드 또는 외부 링크.

### 핵심 패턴

- **세션**: `lib/session.ts`의 `jose` 기반 JWT 암호화 쿠키. Google 토큰과 사용자 식별자를 여기에 보관한다.
- **관리자(웅허브)**: `lib/admin.ts`의 `isAdminEmail()` / `isAdminSession()`으로 게이팅. `ADMIN_EMAIL` 환경변수 (기본 `kww2962@gmail.com`).
- **플러그인 레지스트리**: `src/data/plugins.json` — id/repo/branch/pr/url/path. `lib/plugins.ts`에서 타입과 헬퍼, `lib/github-status.ts`에서 GitHub API로 CI·PR 상태 조회.
- **제안 액션(Proposed Actions)**: Gemini가 캘린더 이벤트 추가나 플랜 생성을 "제안"하면 UI에서 승인/거절. `/api/assistant/action`으로 처리.
- **Redis 키 네임스페이스**: `chat:{sessionId}`, `files:{sessionId}`, `plans:{userId}` 패턴 사용.
- **서비스 카테고리**: `lib/categories.ts`에 정의. 캘린더 이벤트와 플랜에도 같은 카테고리 체계를 공유한다.

### 주요 컴포넌트 관계

```
layout.tsx
├── TopNav.tsx          — 전역 네비게이션 (admin이면 "웅허브" + /plugins)
└── AssistantWidget.tsx — 플로팅 AI 버튼
    └── AssistantPanel.tsx — 채팅 UI (파일, 메시지, 액션)

page.tsx (홈)
├── BriefingPlayer
├── CalendarWidget      — 미니 캘린더
└── HubGrid             — admin 전용, 플러그인 카드 + 상태등

plugins/[id]/page.tsx   — admin 전용, 상단 허브 프레임 + 하단 iframe
└── PluginEmbed
```

### CSP 및 보안 헤더

`next.config.ts`에서 관리. GitHub, Google Fonts, Vercel Blob 도메인이 허용 목록에 있다. 새 외부 리소스를 추가하면 CSP도 함께 업데이트해야 한다.
