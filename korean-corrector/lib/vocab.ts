import { VOCAB_DATA } from './vocab-data';
import { LEVEL_ORDER, lessonCount } from './grammar';
import type { LevelId, VocabLevelData, VocabWord } from './grammar-types';

export type { VocabLesson, VocabLevelData, VocabWord } from './grammar-types';

/** data/vocab/ là tuỳ chọn — chưa có thì mọi hàm dưới đây trả rỗng. */
export function hasVocab(): boolean {
  return VOCAB_DATA.length > 0;
}

/** Pool từ vựng TÍCH LUỸ, cùng quy tắc với ngữ pháp. */
export function getVocabPool(level: LevelId, lessonNumber: number): VocabLevelData[] {
  const idx = LEVEL_ORDER.indexOf(level);
  const upTo = Math.max(0, Math.min(lessonNumber, lessonCount(level)));
  const out: VocabLevelData[] = [];
  for (let i = 0; i <= idx; i++) {
    const d = VOCAB_DATA.find((v) => v.level === LEVEL_ORDER[i]);
    if (!d) continue;
    const lessons = i < idx ? d.lessons : d.lessons.filter((l) => l.number <= upTo);
    if (lessons.length) out.push({ level: d.level, label: d.label, lessons });
  }
  return out;
}

export function countWords(pool: VocabLevelData[]): number {
  return pool.reduce((n, lv) => n + lv.lessons.reduce((m, l) => m + l.words.length, 0), 0);
}

/**
 * Chuỗi từ vựng cho prompt. Quá dài thì chỉ giữ `limit` từ GẦN NHẤT
 * (các bài cao nhất) — đó là phần học viên vừa học nên cần ôn nhất.
 */
export function formatVocabForPrompt(pool: VocabLevelData[], limit = 400): string {
  const flat: { level: LevelId; lesson: number; w: VocabWord }[] = [];
  for (const lv of pool) {
    for (const l of lv.lessons) {
      for (const w of l.words) flat.push({ level: lv.level, lesson: l.number, w });
    }
  }
  const kept = flat.length > limit ? flat.slice(flat.length - limit) : flat;
  const dropped = flat.length - kept.length;

  const byLesson = new Map<string, string[]>();
  for (const item of kept) {
    const key = item.level + '|' + item.lesson;
    if (!byLesson.has(key)) byLesson.set(key, []);
    byLesson.get(key)!.push(item.w.meaning ? `${item.w.word} (${item.w.meaning})` : item.w.word);
  }

  const lines: string[] = [];
  for (const [key, words] of byLesson) {
    const [lv, n] = key.split('|');
    lines.push(`[${lv.toUpperCase()} B${n}] ` + words.join(' · '));
  }
  return (
    (dropped > 0 ? `(đã lược ${dropped} từ của các bài cũ hơn, giữ ${kept.length} từ gần nhất)\n` : '') +
    lines.join('\n')
  );
}
