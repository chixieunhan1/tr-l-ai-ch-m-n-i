import { GRAMMAR_DATA } from './grammar-data';
import type { GrammarLesson, GrammarLevelData, LevelId } from './grammar-types';

export type { GrammarLesson, GrammarLevelData, GrammarPattern, LevelId } from './grammar-types';

/** Thứ tự cấp độ — quyết định "cấp thấp hơn" khi gom pool tích luỹ. */
export const LEVEL_ORDER: LevelId[] = ['sc1', 'sc2', 'tc1', 'tc2'];

export const LEVELS: GrammarLevelData[] = GRAMMAR_DATA;

export const LEVEL_LABEL: Record<LevelId, string> = {
  sc1: 'Sơ cấp 1',
  sc2: 'Sơ cấp 2',
  tc1: 'Trung cấp 1',
  tc2: 'Trung cấp 2',
};

export function isLevelId(v: unknown): v is LevelId {
  return typeof v === 'string' && (LEVEL_ORDER as string[]).includes(v);
}

function levelData(level: LevelId): GrammarLevelData {
  const d = LEVELS.find((l) => l.level === level);
  if (!d) throw new Error('Không có dữ liệu ngữ pháp cho cấp ' + level);
  return d;
}

/** Số bài của một cấp (SC1 có 16, ba cấp còn lại 18). */
export function lessonCount(level: LevelId): number {
  return levelData(level).lessons.length;
}

export function getLesson(level: LevelId, lessonNumber: number): GrammarLesson | undefined {
  return levelData(level).lessons.find((l) => l.number === lessonNumber);
}

/**
 * Pool TÍCH LUỸ: toàn bộ các cấp thấp hơn + cấp hiện tại từ bài 1 đến bài N.
 * Bài N+1 trở đi của cấp hiện tại và mọi cấp cao hơn đều bị loại.
 */
export function getGrammarPool(level: LevelId, lessonNumber: number): GrammarLevelData[] {
  const idx = LEVEL_ORDER.indexOf(level);
  const upTo = Math.max(0, Math.min(lessonNumber, lessonCount(level)));
  const out: GrammarLevelData[] = [];
  for (let i = 0; i <= idx; i++) {
    const d = levelData(LEVEL_ORDER[i]);
    const lessons = i < idx ? d.lessons : d.lessons.filter((l) => l.number <= upTo);
    if (lessons.length) out.push({ level: d.level, label: d.label, lessons });
  }
  return out;
}

export interface UpcomingLesson {
  level: LevelId;
  label: string;
  lesson: GrammarLesson;
}

/**
 * 1–2 bài kế tiếp, để gợi ý "sắp học".
 * Hết bài của cấp hiện tại thì lấn sang cấp kế tiếp (SC1 bài 16 → SC2 bài 1…).
 */
export function getUpcoming(level: LevelId, lessonNumber: number, count = 2): UpcomingLesson[] {
  const out: UpcomingLesson[] = [];
  let idx = LEVEL_ORDER.indexOf(level);
  let n = lessonNumber + 1;
  while (out.length < count && idx < LEVEL_ORDER.length) {
    const d = levelData(LEVEL_ORDER[idx]);
    const lesson = d.lessons.find((l) => l.number === n);
    if (lesson) {
      out.push({ level: d.level, label: d.label, lesson });
      n++;
    } else {
      idx++;
      n = 1;
    }
  }
  return out;
}

const shortMeaning = (m: string, max = 46) =>
  m.length <= max ? m : m.slice(0, max - 1).trimEnd() + '…';

const lessonLine = (l: GrammarLesson) =>
  `B${l.number} ${l.title}: ` +
  l.patterns.map((p) => (p.meaning ? `${p.form} (${shortMeaning(p.meaning)})` : p.form)).join(' · ');

/** Chuỗi gọn để nhúng vào system prompt — chỉ form + nghĩa ngắn, không ví dụ. */
export function formatPoolForPrompt(pool: GrammarLevelData[]): string {
  return pool
    .map((lv) => {
      const last = lv.lessons[lv.lessons.length - 1];
      const head = `## ${lv.label} (bài 1–${last.number})`;
      return head + '\n' + lv.lessons.map(lessonLine).join('\n');
    })
    .join('\n\n');
}

/** Dạng gọn cho phần "sắp học" trong prompt. */
export function formatUpcomingForPrompt(up: UpcomingLesson[]): string {
  return up.map((u) => `${u.label} ${lessonLine(u.lesson)}`).join('\n');
}

export function countPatterns(pool: GrammarLevelData[]): number {
  return pool.reduce((n, lv) => n + lv.lessons.reduce((m, l) => m + l.patterns.length, 0), 0);
}
