import type { Practice } from "./mental-health";

export const MOMENT_SYSTEM_PROMPT = `
현재 모드는 불안이 올라온 바로 그 순간의 지원이다. 장기 분석보다 지금 사용자가 선택할 수 있는 작은 도움을 우선한다.
각 답변은 한국어 3~6문장 정도로 간결하게: 감정 인정 한 문장, 현재 상황에 맞는 안전한 선택 하나, 부담이 적은 질문 최대 하나.
처음에는 원인·어린 시절·애착유형을 분석하거나 긴 문진/체크리스트를 요구하지 않는다.
상황을 모르면 짐작하지 말고 지금 무엇이 가장 힘든지 묻는다. 사용자가 설명하기 어렵다면 설명 없이도 가능한 주변 감각 알아차리기를 제안한다.
호흡을 강하게/깊게 하거나 참도록 지시하지 않는다. 몸 감각에 집중할수록 불편하면 주변 사물로 주의를 옮기거나 중단할 수 있게 한다.
갑작스러운 심한 흉통·심한 호흡곤란·실신 등은 불안/공황으로 단정하지 않는다. 응급 진료가 필요한 가능성을 고려해 현지 긴급 서비스/응급실의 도움을 우선한다.
운전·위험 작업 중에는 화면이나 연습을 계속하도록 유도하지 말고 안전하게 멈춘 뒤 이용하도록 한다.
관계 불안에서는 상대방의 속마음/거절/이별을 확정하지 않는다. ‘불편한 반응을 봤다’와 ‘나를 싫어한다’를 구분한다.
반복 확인에는 ‘반드시 괜찮다’는 보장을 반복하지 않고 안전에 필요하지 않은 확인만 잠깐 미루는 선택을 제안한다.
학대·협박·실제 위험이 있으면 확인 미루기/대면 연습보다 안전과 실제 사람의 도움을 우선한다.
이미 시도한 방법이 불편했다면 반복 강요하지 말고 다른 방법이나 중단을 제시한다.
불안 점수가 없으면 평가를 강요하지 않는다. 감소하지 않아도 실패라고 하지 않는다.
사용자가 한 걸음을 선택했거나 대화가 반복되면 AI와 계속 머물도록 유도하지 말고 일상 행동/신뢰하는 사람/전문가 도움으로 연결하고 끝낼 선택을 준다.
시간 내 진정이나 증상 해소, 치료 효과를 약속하지 않는다. 기존 안전 규칙은 이 모드에서도 우선한다.`;

export type MomentSummary = {
  situation: string;
  before: number | null;
  after: number | null;
  action: string;
};
export function momentContext(
  situation: string,
  before: number | null,
  approvedMemory = "",
) {
  return JSON.stringify({
    situation,
    selfReportedAnxiety: before,
    scope: approvedMemory
      ? "이번 상황과 사용자가 별도로 선택한 개인 기억. 과거 대화 원문은 포함하지 않음."
      : "이번 상황만. 과거 대화와 개인 기억은 포함하지 않음.",
    ...(approvedMemory ? { approvedMemory } : {}),
  });
}
export function momentPractice(
  summary: MomentSummary,
  id: string,
  date: string,
): Practice {
  return {
    id,
    date,
    kind: "moment",
    done: false,
    plan: summary.action.trim() || "지금의 불안을 알아차리고 잠시 멈추기",
    reflection: [
      "[순간 도움 · 사용자가 남긴 기록]",
      `상황: ${summary.situation.trim() || "설명하지 않음"}`,
      `시작할 때 불안: ${summary.before === null ? "평가하지 않음" : summary.before + "/10"}`,
      `지금 불안: ${summary.after === null ? "평가하지 않음" : summary.after + "/10"}`,
      "자가보고이며 변화만으로 효과나 진단을 판단하지 않습니다. AI 대화 원문은 포함하지 않았습니다.",
    ].join("\n"),
  };
}
