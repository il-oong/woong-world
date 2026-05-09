import type { CategoryId } from "./categories";

export type CsvRow = {
  summary: string;
  date: string;        // YYYY-MM-DD
  startTime?: string;  // HH:mm
  endTime?: string;    // HH:mm
  category?: string;
  location?: string;
};

const CATEGORY_MAP: Record<string, CategoryId> = {
  인생: "life", 개인: "life", life: "life",
  회사: "company", 업무: "company", 직장: "company", company: "company",
  vfx: "vfx", VFX: "vfx",
  앱개발: "appdev", 개발: "appdev", dev: "appdev", appdev: "appdev",
  재즈: "jazz", 음악: "jazz", jazz: "jazz",
};

export function mapCategory(raw: string | undefined): CategoryId {
  if (!raw) return "life";
  return CATEGORY_MAP[raw.trim()] ?? "life";
}

export function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Detect header row
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = {
    summary: header.findIndex((h) => ["제목", "title", "summary", "이름"].includes(h)),
    date: header.findIndex((h) => ["날짜", "date"].includes(h)),
    startTime: header.findIndex((h) => ["시작시간", "시작", "start", "starttime"].includes(h)),
    endTime: header.findIndex((h) => ["종료시간", "종료", "end", "endtime"].includes(h)),
    category: header.findIndex((h) => ["카테고리", "category", "분류"].includes(h)),
    location: header.findIndex((h) => ["장소", "location", "위치"].includes(h)),
  };

  if (idx.summary === -1 || idx.date === -1) return [];

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const summary = cols[idx.summary]?.trim();
    const date = cols[idx.date]?.trim();
    if (!summary || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    rows.push({
      summary,
      date,
      startTime: idx.startTime >= 0 ? cols[idx.startTime]?.trim() || undefined : undefined,
      endTime: idx.endTime >= 0 ? cols[idx.endTime]?.trim() || undefined : undefined,
      category: idx.category >= 0 ? cols[idx.category]?.trim() || undefined : undefined,
      location: idx.location >= 0 ? cols[idx.location]?.trim() || undefined : undefined,
    });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      cols.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}
