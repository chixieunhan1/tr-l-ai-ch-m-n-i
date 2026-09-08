// Test cho lib/grammar.ts — chay bang: npm test
// Bien dich sang CommonJS qua tsconfig.test.json roi chay bang node, nen day la
// dung module that su duoc build vao app, khong phai ban sao.

import {
  LEVEL_ORDER,
  LEVELS,
  countPatterns,
  formatPoolForPrompt,
  getGrammarPool,
  getLesson,
  lessonCount,
} from '../lib/grammar';
import type { LevelId } from '../lib/grammar';
import { countWords, formatVocabForPrompt, getVocabPool, hasVocab } from '../lib/vocab';
import type { VocabLevelData } from '../lib/vocab';

let pass = 0;
const fails: string[] = [];

function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log('  PASS  ' + name) }
  else { fails.push(name + (detail ? ' → ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' → ' + detail : '')) }
}
const eq = (name: string, got: unknown, want: unknown) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// --- 1. Parse du 4 file ------------------------------------------------------
console.log('\n[1] Parse đủ 4 file');
eq('4 cấp', LEVELS.map((l) => l.level), ['sc1', 'sc2', 'tc1', 'tc2']);
eq('SC1 có 16 bài', lessonCount('sc1'), 16);
eq('SC2 có 18 bài', lessonCount('sc2'), 18);
eq('TC1 có 18 bài', lessonCount('tc1'), 18);
eq('TC2 có 18 bài', lessonCount('tc2'), 18);

for (const lv of LEVELS) {
  const bad = lv.lessons.filter((l) => !l.patterns.length || !l.title || l.patterns.some((p) => !p.form));
  check(`${lv.level}: bài nào cũng có title + pattern có form`, bad.length === 0,
    bad.map((b) => 'B' + b.number).join(','));
  const nums = lv.lessons.map((l) => l.number);
  eq(`${lv.level}: số bài liên tục 1..${nums.length}`, nums,
    Array.from({ length: nums.length }, (_, i) => i + 1));
}

// Vai moc noi dung, bat loi parser lech cot / lech regex
eq('SC1 B1 có đúng 3 pattern (sách ghi vậy)', getLesson('sc1', 1)!.patterns.length, 3);
eq('SC1 B12 pattern 3 = 못 V', getLesson('sc1', 12)!.patterns[2].form, '못 V');
eq('SC2 B9 có 5 pattern', getLesson('sc2', 9)!.patterns.length, 5);
eq('SC2 B10 title', getLesson('sc2', 10)!.title, '뭐 먹을래?');
eq('TC1 B18 có 2 pattern', getLesson('tc1', 18)!.patterns.length, 2);
eq('TC1 B1 pattern 1 gộp 3 dạng',
  getLesson('tc1', 1)!.patterns[0].form,
  'A-다고 하다, V-ㄴ다고/는다고 하다, N(이)라고 하다');
eq('TC2 B18 title (bỏ được đuôi ghi chú)', getLesson('tc2', 18)!.title, '흥부와 놀부');
eq('SC2 B16 title bỏ được " ⭐ SEOLLAL"', getLesson('sc2', 16)!.title, '설날에는 밥 대신 떡국을 먹어요');

// --- 2. Pool tich luy --------------------------------------------------------
console.log('\n[2] Pool tích luỹ');
const poolTc1B3 = getGrammarPool('tc1', 3);
eq('TC1 bài 3 → pool gồm sc1+sc2+tc1', poolTc1B3.map((p) => p.level), ['sc1', 'sc2', 'tc1']);
eq('… SC1 đủ 16 bài', poolTc1B3[0].lessons.length, 16);
eq('… SC2 đủ 18 bài', poolTc1B3[1].lessons.length, 18);
eq('… TC1 chỉ bài 1–3', poolTc1B3[2].lessons.map((l) => l.number), [1, 2, 3]);
check('… KHÔNG có TC2', !poolTc1B3.some((p) => p.level === 'tc2'));
check('… KHÔNG có TC1 bài 4+', !poolTc1B3[2].lessons.some((l) => l.number > 3));

const poolSc1B5 = getGrammarPool('sc1', 5);
eq('SC1 bài 5 → chỉ SC1', poolSc1B5.map((p) => p.level), ['sc1']);
eq('… chỉ bài 1–5', poolSc1B5[0].lessons.map((l) => l.number), [1, 2, 3, 4, 5]);

eq('TC2 bài 18 → pool đủ 4 cấp', getGrammarPool('tc2', 18).map((p) => p.level), LEVEL_ORDER);
eq('TC2 bài 18 → tổng pattern = 63+71+68+70', countPatterns(getGrammarPool('tc2', 18)), 272);
eq('Bài vượt số bài thật thì kẹp lại', getGrammarPool('sc1', 99)[0].lessons.length, 16);

// --- 3. formatPoolForPrompt --------------------------------------------------
console.log('\n[3] formatPoolForPrompt');
const txt = formatPoolForPrompt(getGrammarPool('sc1', 5));
check('có tiêu đề cấp', txt.includes('## Sơ cấp 1'));
check('có bài 5', txt.includes('B5 '));
check('KHÔNG có bài 6', !/\bB6 /.test(txt));
check('không kèm ví dụ tiếng Hàn dài dòng', !txt.includes('안녕하세요? 저는 마리코라고 합니다'));
check('có form của bài 5 (V-았/었-)', txt.includes('V-았/었-'));

const txtTc2 = formatPoolForPrompt(getGrammarPool('tc2', 18));
check('pool TC2 đủ 4 tiêu đề cấp',
  ['Sơ cấp 1', 'Sơ cấp 2', 'Trung cấp 1', 'Trung cấp 2'].every((s) => txtTc2.includes('## ' + s)));
console.log(`  (pool TC2 B18: ${countPatterns(getGrammarPool('tc2', 18))} pattern, ${txtTc2.length} ký tự)`);

// --- 4. Tu vung (data/vocab/ la tuy chon) ------------------------------------
console.log('\n[4] Từ vựng');
eq('chưa có data/vocab/ → hasVocab() = false', hasVocab(), false);
eq('… pool từ vựng rỗng', getVocabPool('sc1', 5).length, 0);

// Logic dinh dang test bang du lieu dung san, khong can file that.
const fake: VocabLevelData[] = [
  { level: 'sc1', label: 'Sơ cấp 1', lessons: [
    { number: 3, words: [{ word: '학교', meaning: 'trường học' }, { word: '가다', meaning: 'đi' }] },
    { number: 5, words: [{ word: '주말', meaning: 'cuối tuần' }] },
  ] },
];
const vtxt = formatVocabForPrompt(fake);
check('gom theo bài', vtxt.includes('[SC1 B3]') && vtxt.includes('[SC1 B5]'));
check('có từ + nghĩa', vtxt.includes('학교 (trường học)'));
eq('đếm đúng số từ', countWords(fake), 3);

const many: VocabLevelData[] = [
  { level: 'sc1', label: 'Sơ cấp 1', lessons: Array.from({ length: 10 }, (_, i) => ({
    number: i + 1,
    words: Array.from({ length: 60 }, (_, k) => ({ word: `w${i + 1}_${k}`, meaning: '' })),
  })) },
];
const capped = formatVocabForPrompt(many, 400);
check('quá dài thì cắt còn ~400 từ gần nhất', capped.includes('đã lược 200 từ'));
check('… giữ bài mới nhất (B10)', capped.includes('w10_59'));
check('… bỏ bài cũ nhất (B1)', !capped.includes('w1_0 '));

// --- ket qua -----------------------------------------------------------------
console.log(`\n${fails.length === 0 ? 'ALL PASS' : fails.length + ' FAILURES'} — ${pass} pass`);
if (fails.length) { for (const f of fails) console.log('  - ' + f); process.exit(1) }
