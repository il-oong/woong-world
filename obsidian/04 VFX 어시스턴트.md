# VFX 어시스턴트 플러그인

> [[02 플러그인 시스템]]의 외부 앱(B타입) 플러그인.  
> AI 영상 제작(Sora, Runway, Kling 등)을 위한 프롬프트 빌더 + VFX 기법 레퍼런스.

---

## 왜 필요한가

- AI 영상 툴에 영상 효과/편집점을 **어떻게 말해야 하는지** 모름
- 좋은 결과를 내는 프롬프트 패턴이 툴마다 다름
- VFX 용어(슬로모, 렌즈플레어, DOF 등)를 체계적으로 쌓아두면 재사용 가능

---

## 핵심 기능

### 1. 프롬프트 빌더
레고처럼 조합해서 완성 프롬프트 생성:

| 블록 | 예시 |
|------|------|
| **샷 타입** | close-up, wide shot, aerial, POV, over-the-shoulder |
| **카메라 무브** | slow dolly in, whip pan, crane shot, handheld shaky |
| **렌즈 특성** | anamorphic lens flare, shallow DOF, fisheye distortion |
| **조명** | golden hour rim light, neon glow, hard dramatic shadows |
| **컬러 그레이딩** | desaturated teal-orange, high contrast B&W, warm filmic |
| **효과/FX** | particle dust, volumetric fog, chromatic aberration |
| **편집 리듬** | cut on beat, smash cut, match cut, J-cut, L-cut |
| **무드** | cinematic, gritty, dreamlike, hyper-real |

→ 선택한 블록들을 자동으로 영문 프롬프트로 조합

---

### 2. AI 개선 (Gemini 연동)
- 내가 쓴 한국어 설명 → Gemini가 영문 VFX 프롬프트로 변환
- "슬로모로 입자 날리는 장면" → `ultra slow-motion, particle dust explosion, 1000fps, shallow depth of field`

---

### 3. 프롬프트 라이브러리
- 잘 된 프롬프트 저장 및 태그 분류
- Redis에 `vfx-prompts:{userId}` 키로 저장

---

### 4. 편집점 레퍼런스
컷 종류별 설명 + 언제 쓰는지:

| 편집 기법 | 효과 | AI 프롬프트 키워드 |
|-----------|------|-------------------|
| 매치컷 | 장면 전환의 연속감 | `match cut to...` |
| 스매시컷 | 강한 대비/충격 | `smash cut, abrupt transition` |
| J-컷 | 다음 씬 소리 먼저 | (영상 단독 툴엔 해당없음) |
| 점프컷 | 시간 압축, 불안감 | `jump cut sequence` |
| 슬로모 강조 | 감정 고조 | `ultra slow motion, time remap` |

---

## 아키텍처 방향

별도 레포 `il-oong/vfx-assistant`로 개발, Vercel 배포 후 woong-world에 등록.

```json
{
  "id": "vfx-assistant",
  "name": "VFX 어시스턴트",
  "description": "AI 영상 제작 프롬프트 빌더 및 VFX 기법 레퍼런스",
  "repo": "il-oong/vfx-assistant",
  "url": "https://vfx-assistant.vercel.app",
  "embeddable": true,
  "accent": "#f472b6",
  "tags": ["VFX", "영상", "프롬프트", "AI"]
}
```

---

## 스택 제안

| 항목 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | Next.js | woong-world와 동일, 빠르게 시작 |
| AI | Gemini (기존 키 재사용) | 비용 0, woong-world와 동일 패턴 |
| 저장 | Upstash Redis | 기존 환경변수 재사용 가능 |
| UI | Tailwind + shadcn/ui | 빠른 블록 선택 UI |

---

## 개발 순서

- [ ] 1단계: 프롬프트 빌더 정적 UI (블록 선택 → 조합 출력)
- [ ] 2단계: Gemini 연동 (한국어 → 영문 VFX 프롬프트 변환)
- [ ] 3단계: 라이브러리 저장 (Redis)
- [ ] 4단계: woong-world plugins.json 등록 + iframe 연결

---

#플러그인 #VFX #영상 #AI #프롬프트
