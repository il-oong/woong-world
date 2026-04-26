export type SpecFeatureStatus = "done" | "wip" | "planned";

export type SpecFeature = {
  title: string;
  status: SpecFeatureStatus;
  notes: string;
};

export const SPEC_FEATURES: SpecFeature[] = [
  {
    title: "허브 메인 (서비스 카드 그리드)",
    status: "done",
    notes:
      "GitHub 레포 메타데이터로 자동 enrich. 카테고리 필터, 검색, 즐겨찾기, ⌘K 팔레트.",
  },
  {
    title: "iframe 프리뷰 모달",
    status: "done",
    notes: "카드 클릭 시 라이브/기획서/코드구조 탭. GitHub은 별도 버튼.",
  },
  {
    title: "Google Calendar 연동",
    status: "done",
    notes: "OAuth 로그인, 이벤트 조회/추가/삭제, 카테고리 색상 매핑.",
  },
  {
    title: "카테고리 시스템",
    status: "done",
    notes: "인생 / 회사 / VFX / 앱개발 / 재즈. Calendar colorId + extendedProperties.",
  },
  {
    title: "캘린더 크기 조절(S/M/L/XL)",
    status: "done",
    notes: "localStorage 기억. 홈 위젯과 풀 페이지 모두 지원.",
  },
  {
    title: "주/월/년 계획 관리 (/plans)",
    status: "done",
    notes: "Upstash Redis 영속화. 카테고리별 분류, 체크리스트, 진행률, 메모.",
  },
  {
    title: "Gemini AI 리뷰",
    status: "done",
    notes: "gemini-2.5-flash-lite. 개별 계획·전체 포트폴리오 두 모드.",
  },
  {
    title: "채팅 비서 (뇌 대리)",
    status: "done",
    notes:
      "우하단 플로팅 위젯. 캘린더+계획+업로드 파일을 컨텍스트로 받아 답변. 텍스트/마크다운/JSON/PDF/DOCX/이미지/URL 첨부. 봇이 일정·계획 액션 제안하면 사용자가 [승인]해서 실행.",
  },
  {
    title: "상단 nav (허브/기획서/일정/계획/GitHub)",
    status: "done",
    notes: "어느 페이지에서도 한 번에 이동. GitHub은 외부 링크 메뉴 1개.",
  },
  {
    title: "게임풍 UI/UX 리스킨",
    status: "planned",
    notes: "픽셀/도트 폰트, 카드 모션, 사운드. 컴포넌트 구조는 그대로 두고 시각만 교체.",
  },
  {
    title: "검색에 계획·일정도 포함",
    status: "planned",
    notes: "현재 ⌘K는 서비스만 검색. 추후 cross-cutting 검색.",
  },
  {
    title: "공개 게시 (OAuth verification)",
    status: "planned",
    notes: "Google Cloud OAuth Production 전환. refresh token 7일 만료 해소.",
  },
];

export const SPEC_STATUS_STYLE: Record<
  SpecFeatureStatus,
  { label: string; color: string }
> = {
  done: { label: "DONE", color: "#46d6db" },
  wip: { label: "WIP", color: "#ffa726" },
  planned: { label: "PLANNED", color: "#a36ee0" },
};

export function countFeatures(features: SpecFeature[] = SPEC_FEATURES) {
  return features.reduce(
    (acc, f) => {
      acc[f.status] += 1;
      return acc;
    },
    { done: 0, wip: 0, planned: 0 } as Record<SpecFeatureStatus, number>,
  );
}
