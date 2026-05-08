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

| 변수 | 용도 |
|------|------|
| `GEMINI_API_KEY` | AI 어시스턴트 (Google Gemini 2.5-flash-lite) |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `GOOGLE_REDIRECT_URI` | OAuth 콜백 URL |
| `SESSION_SECRET` | JWT 암호화 (32바이트 이상) |
| `UPSTASH_REDIS_REST_URL` | Redis (채팅 기록, 플랜 저장) |
| `UPSTASH_REDIS_REST_TOKEN` | Redis 인증 |
| `GITHUB_TOKEN` | GitHub API rate limit 우회 (선택) |

## Architecture

**개인 생산성 허브** — 다크 테마 UI에 GitHub 포트폴리오, Google 캘린더, AI 어시스턴트(Gemini), 목표 관리를 통합한 Next.js 앱.

### 데이터 흐름

- **서비스 목록**: `src/data/services.json` (시드) → `/api/services` → `lib/github.ts`로 GitHub 메타데이터 실시간 보강
- **AI 어시스턴트**: 클라이언트 → `/api/assistant/chat` → `lib/gemini.ts` (캘린더/플랜 컨텍스트 주입) → Redis에 대화 기록 저장
- **캘린더**: `lib/session.ts` (JWT 쿠키) → `lib/google.ts` (OAuth + Calendar API) → `/api/google/events`
- **플랜**: `/api/plans` → `lib/plans.ts` → Redis
- **파일**: Vercel Blob 저장 → Redis에 메타데이터

### 핵심 패턴

- **세션**: `lib/session.ts`의 `jose` 기반 JWT 암호화 쿠키. Google 토큰과 사용자 식별자를 여기에 보관한다.
- **제안 액션(Proposed Actions)**: Gemini가 캘린더 이벤트 추가나 플랜 생성을 "제안"하면 UI에서 승인/거절. `/api/assistant/action`으로 처리.
- **Redis 키 네임스페이스**: `chat:{sessionId}`, `files:{sessionId}`, `plans:{userId}` 패턴 사용.
- **서비스 카테고리**: `lib/categories.ts`에 정의. 캘린더 이벤트와 플랜에도 같은 카테고리 체계를 공유한다.

### 주요 컴포넌트 관계

```
layout.tsx
├── TopNav.tsx          — 전역 네비게이션
└── AssistantWidget.tsx — 플로팅 AI 버튼
    └── AssistantPanel.tsx — 채팅 UI (파일, 메시지, 액션)

page.tsx (홈)
├── HubGrid.tsx         — 서비스 카드 그리드
│   └── ServiceCard.tsx
└── CalendarWidget.tsx  — 미니 캘린더
```

### CSP 및 보안 헤더

`next.config.ts`에서 관리. GitHub, Google Fonts, Vercel Blob 도메인이 허용 목록에 있다. 새 외부 리소스를 추가하면 CSP도 함께 업데이트해야 한다.
