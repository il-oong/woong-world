# JARVIS 클라우드 개발 (웅허브 → PR)

웅허브 챗에서 개발을 요청하면 클라우드에서 구현하고 PR까지 올린다. 로컬 CLI·레포 연결 과정이 필요 없다.

```
웅허브 챗 → Gemini가 dev_task 제안 → [승인] → GitHub 이슈(jarvis-dev 라벨)
   → .github/workflows/jarvis-dev.yml → claude-code-action이 구현·lint·build → PR 생성
   → GET /api/jarvis/tasks 로 이슈/PR 상태 조회 → 머지는 사람이 결정
```

## 설정 (한 번만)
1. GitHub 레포에 Claude GitHub App 설치 (https://github.com/apps/claude)
2. 레포 Secrets: `CLAUDE_CODE_OAUTH_TOKEN` (구독 사용 시 `claude setup-token` 으로 발급, 유효 1년). API 키를 쓰려면 워크플로의 `claude_code_oauth_token` 줄을 `anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}` 로 바꾼다
3. 서버 환경변수 (Vercel/Railway): `JARVIS_GITHUB_TOKEN` (없으면 `GITHUB_TOKEN`) — Issues read/write, Pull requests read. 대상 레포는 `JARVIS_DEV_REPO` (기본 `il-oong/woong-world`)
4. 레포 Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests" 를 켠다 (워크플로가 PR을 연다).
5. 이슈 라벨 `jarvis-dev` 는 첫 요청 때 서버가 먼저 만들고, 이슈에 붙었는지 확인한다.

## 안전장치
- 관리자(`isAdminSession`)만 승인 가능, 승인 전에는 아무것도 실행되지 않는다.
- 에이전트는 PR만 연다. main 직접 push·머지 금지(프롬프트 + 브랜치 보호 권장).
- 라벨은 레포 쓰기 권한자만 붙일 수 있어 외부인이 워크플로를 트리거할 수 없다.
- 타임아웃 30분, `--max-turns 40` 으로 비용 상한.

## 다음 단계
- 웅허브 UI에 `/api/jarvis/tasks` 진행 패널(이슈→PR→CI 신호등) 추가
- 장시간 작업·시장조사용 Railway `jarvis-worker` 분리 (Redis 큐)
- 완료 시 웹푸시 알림 (`/api/push` 재사용)
