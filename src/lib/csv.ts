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

function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // YYYY.MM.DD or YYYY/MM/DD
  if (/^\d{4}[./]\d{2}[./]\d{2}$/.test(s)) return s.replace(/[./]/g, "-");
  // M/D/YYYY or MM/DD/YYYY (US format)
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // YYYY년 MM월 DD일
  const kor = s.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/);
  if (kor) {
    const [, y, m, d] = kor;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function detectSeparator(header: string): string {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const ch of header) {
    if (ch in counts) counts[ch as keyof typeof counts]++;
  }
  if (counts["\t"] >= counts[","] && counts["\t"] >= counts[";"] && counts["\t"] > 0) return "\t";
  if (counts[";"] > counts[","]) return ";";
  return ",";
}

function splitLine(line: string, sep: string): string[] {
  if (sep === "\t") return line.split("\t").map((c) => c.trim());
  const cols: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === sep && !inQuote) {
      cols.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

export function parseCsv(text: string): CsvRow[] {
  // BOM 제거
  const cleaned = text.replace(/^﻿/, "");
  const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const sep = detectSeparator(lines[0]);
  const header = splitLine(lines[0], sep).map((h) => h.toLowerCase().replace(/['"]/g, ""));

  const idx = {
    summary: header.findIndex((h) => ["제목", "title", "summary", "이름", "name", "event", "일정"].includes(h)),
    date: header.findIndex((h) => ["날짜", "date", "일자", "일시"].includes(h)),
    startTime: header.findIndex((h) => ["시작시간", "시작", "start", "starttime", "start_time", "시작 시간"].includes(h)),
    endTime: header.findIndex((h) => ["종료시간", "종료", "end", "endtime", "end_time", "종료 시간"].includes(h)),
    category: header.findIndex((h) => ["카테고리", "category", "분류", "cat"].includes(h)),
    location: header.findIndex((h) => ["장소", "location", "위치", "venue", "place"].includes(h)),
  };

  if (idx.summary === -1 || idx.date === -1) return [];

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i], sep);
    const summary = cols[idx.summary]?.trim().replace(/^["']|["']$/g, "");
    const rawDate = cols[idx.date]?.trim().replace(/^["']|["']$/g, "");
    if (!summary || !rawDate) continue;
    const date = normalizeDate(rawDate);
    if (!date) continue;

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
