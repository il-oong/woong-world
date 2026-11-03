/**
 * 도면 양식(판교 푸르지오 그랑블 시공도면 42p) 규격 상수.
 * 원본 PDF(A3 가로 420×297mm)의 벡터를 직접 측정한 값이다. 단위는 mm, 선 굵기는 pt(1pt=0.3528mm).
 * 좌표는 용지 왼쪽 위 (0,0) 기준.
 * 글자는 원본에서 외곽선으로 변환되어 폰트명을 알 수 없다 — 글리프 높이만 실측했고 em 크기는 추정(산세리프, 숫자·대문자 높이 ≈ 0.714em 가정).
 */
export const SHEET = { width: 420, height: 297 } as const;

/** 선 굵기 (pt). 0.12≈0.04mm, 0.36≈0.13mm, 0.72≈0.25mm */
export const PEN = { hair: 0.12, thin: 0.36, bold: 0.72 } as const;

export const COLOR = {
  black: "#000000", // 도면선·글자
  dim: "#DCDCDC", // 치수선·치수보조선·치수 눈금 (0.863 gray)
  wallHatch: "#8D8D8D", // 벽체 해치·벽 외곽 (0.555 gray)
  labelBar: "#525252", // 타이틀블록 라벨 바 (0.324 gray), 글자는 흰색
  note: "#0000FF", // 도면 위 지시 글·인출선·구름(리비전 클라우드)
  noteRed: "#DD0037", // NOTE 강조(지정 손잡이 등)
  white: "#FFFFFF",
} as const;

/** 상세도 시트(TOP/FRONT/SIDE VIEW 분할 시트) 프레임 */
export const DETAIL_SHEET = {
  outerRect: { x: 4.53, y: 3.2, w: 411.01, h: 290.66, pen: PEN.thin }, // 바깥 얇은 테두리
  innerFrame: { x0: 8.93, y0: 7.61, x1: 411.14, y1: 289.46, thickness: 0.97 }, // 굵은 안쪽 프레임(채움 띠)
  centerDividerX: 210.02, // 세로 구분선 (y 8.07~267.45), pen bold
  rowLines: [18.02, 114.29, 124.23], // 가로 구분선 (x 9.4~410.68), pen bold
  noteRowLines: [30.1, 42.1, 54.2], // NOTE 칸 줄(x 210~410.7), pen bold, 행높이≈12.1
  titleBlockTop: { y: 267.19, h: 0.51 }, // 타이틀블록 상단 띠(채움)
  headings: {
    // 칸 제목: TOP VIEW / NOTE / FRONT VIEW_ DOOR / FRONT VIEW_ BODY / SIDE VIEW
    left: { x: 17.1, baselineRowTop: 8.07, rowBottom: 18.02 },
    capHeight: 3.34, // ≈ em 4.7mm(13pt)
    secondRowTop: 114.29, // 하단 칸 제목 행 114.29~124.23
    noteTextX: 218.1, // NOTE 글자 시작 (구분선+8mm)
  },
} as const;

/** 타이틀블록 (y 267~289) */
export const TITLE_BLOCK = {
  rows: [
    { y: 275.5, fields: ["SITE LOCATION", "SHEET NO.", "DATE"] },
    { y: 285.8, fields: ["PROJECT TITLE", "SUBJECT TITLE", "SCALE"] },
  ],
  // 필드 밑줄(pen bold) x 범위
  underlines: [
    { x0: 57.6, x1: 217.7 },
    { x0: 229.4, x1: 293.8 },
    { x0: 305.9, x1: 362.5 },
  ],
  labelBar: { fill: COLOR.labelBar, textColor: COLOR.white, textHeight: 3.43 /* 막대 포함 높이 */ },
  valueDigitHeight: 3.89, // 값 글자(숫자) 높이 ≈ em 5.4mm(15pt), 검정
} as const;

/** 치수 표기 규격 (상세도 시트, 축척 1/30 기준 실측) */
export const DIMENSION = {
  lineColor: COLOR.dim,
  linePen: PEN.thin,
  tick: { style: "slash45", length: 1.62, pen: PEN.thin }, // 45° 사선 눈금, 화살표 아님
  lineOvershoot: 1.2, // 치수선이 첫/끝 눈금을 넘어 나가는 길이
  extensionOvershoot: 1.2, // 보조선이 치수선을 넘어 나가는 길이
  extensionGap: 1.2, // 보조선과 대상 물체 사이 간격
  rowPitch: 7.5, // 치수선 열 간격(전체 3,900열 ↔ 분할열)
  firstRowFromObject: 6.6, // 대상 물체 윤곽 ↔ 가장 가까운 치수선
  textGapAboveLine: 0.87, // 글자 아래 ↔ 치수선
  textPlacement: "centered-above-line", // 가로: 선 위 중앙. 세로 치수: 90° 회전, 선 왼쪽
  digitHeight: 2.84, // 축척 1/30 시트 ≈ em 3.9mm(11pt) 검정
  digitHeightPlan: 3.2, // 평면도(축척 1/20) ≈ em 4.5mm
  format: "천단위 쉼표(3,900), 단위 생략(mm)",
} as const;

/** 벽체: 45° 해치 */
export const WALL = {
  hatch: { angle: 45, xPitch: 0.43, pen: PEN.hair, color: COLOR.wallHatch },
  outline: { pen: PEN.hair, color: COLOR.wallHatch },
  thicknessAt1_30: 3.3, // 실제 약 100mm
} as const;

/** 가구/도면 윤곽선 */
export const OBJECT_LINE = { pen: PEN.bold, color: COLOR.black, joinCap: "round" } as const;

/** 지시선·구름·메모(파랑) */
export const ANNOTATION = { color: COLOR.note, leaderPen: 0.24, textHeightHangul: 3.43, cloud: "연속 원호 구름, 선 0.72pt급" } as const;

/** 평면도 시트(드레스룸/자녀침실/주방): 안쪽 굵은 프레임·구획선 없음, 얇은 바깥 테두리만 */
export const PLAN_SHEET = {
  title: { x: 19.0, line1BaselineY: 271.9, line2BaselineY: 284.8, glyphHeight: 5.4 }, // 좌하단 2줄(현장명/공간명 평면도)
  scale: { align: "right-bottom", x1: 396.8, glyphHeight: 5.8 }, // 우하단 "SCALE 1/20"
  pens: { wallHatch: PEN.hair, dimension: PEN.thin, furniture: PEN.bold },
} as const;
