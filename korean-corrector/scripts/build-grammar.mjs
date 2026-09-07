// Parse 4 file markdown ngu phap -> sinh lib/grammar-data.ts luc BUILD.
// Chay tu dong qua npm "prebuild", hoac thu cong: npm run gen:grammar
//
// 4 file co 4 dinh dang khac han nhau nen moi cap mot parser rieng:
//   SC1 - bang markdown, pattern nam trong 1 o, phan cach bang (1)(2)(3)(4)
//   SC2 - muc "### Bai N - title", moi pattern la "N. **form** - nghia"
//   TC1 - muc "### Bai N - title", pattern nam trong khoi "- **문법과 표현**:"
//   TC2 - muc "## Bai N - title",  moi pattern la "N. `form` - nghia"

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DATA_DIR = join(ROOT, 'data', 'grammar');
const OUT = join(ROOT, 'lib', 'grammar-data.ts');

const read = (name) => readFileSync(join(DATA_DIR, name), 'utf8');

// --- tien ich chung ---------------------------------------------------------

const stripMd = (s) =>
  s.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '').trim();

// Bo dau ngoac bao ngoai: "(vi ... nen)" -> "vi ... nen"
const unwrapParens = (s) => {
  const t = s.trim();
  return /^\(.*\)$/.test(t) ? t.slice(1, -1).trim() : t;
};

const cleanMeaning = (s) => {
  const m = unwrapParens(stripMd(s)).replace(/\s+/g, ' ').trim();
  // Ghi chu ve BAI, khong phai nghia cua pattern.
  if (/bài này chỉ/i.test(m)) return '';
  return m;
};

// Bo emoji/canh bao dinh sau title: "... 먹어요 ⭐ SEOLLAL" -> "... 먹어요"
const cleanTitle = (s) =>
  stripMd(s).replace(/\s*[⭐⚠️🔸].*$/u, '').replace(/\s+/g, ' ').trim();

const backticks = (s) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());

// Cat file thanh cac khoi bai theo mot regex header cho truoc.
function sections(md, headerRe) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      if (cur) out.push(cur);
      cur = { number: Number(m[1]), title: cleanTitle(m[2]), lines: [] };
      continue;
    }
    // Header cung cap hoac cao hon thi ket thuc khoi bai hien tai.
    if (cur && /^#{1,3} /.test(line)) { out.push(cur); cur = null; continue; }
    if (cur) cur.lines.push(line);
  }
  if (cur) out.push(cur);
  return out;
}

// --- SC1: bang markdown -----------------------------------------------------

function parseSc1(md) {
  const lessons = [];
  for (const line of md.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    // cells[0] rong vi dong bat dau bang '|'
    if (!/^\d+$/.test(cells[1] || '')) continue;      // bo header + cac bang khac
    const number = Number(cells[1]);
    const title = cleanTitle(cells[2] || '');          // title SNU (goc sach)
    const patterns = [];
    for (const seg of (cells[4] || '').split(/[①②③④⑤⑥]/)) {
      if (!seg.trim()) continue;
      const forms = backticks(seg);
      if (!forms.length) continue;
      const rest = seg.slice(seg.lastIndexOf('`') + 1);
      patterns.push({ form: forms.join(', '), meaning: cleanMeaning(rest) });
    }
    if (patterns.length) lessons.push({ number, title, patterns });
  }
  return lessons;
}

// --- SC2: "N. **form** — nghia" --------------------------------------------

function parseSc2(md) {
  return sections(md, /^###\s+Bài\s+(\d+)\s+—\s+(.+)$/).map((s) => {
    const patterns = [];
    for (const line of s.lines) {
      const m = line.match(/^\d+\.\s+\*\*(.+?)\*\*\s*—\s*(.*)$/);
      if (m) patterns.push({ form: stripMd(m[1]), meaning: cleanMeaning(m[2]) });
    }
    return { number: s.number, title: s.title, patterns };
  }).filter((l) => l.patterns.length);
}

// --- TC1: khoi "- **문법과 표현**:" ----------------------------------------

function parseTc1(md) {
  return sections(md, /^###\s+Bài\s+(\d+)\s+—\s+(.+)$/).map((s) => {
    const patterns = [];
    let inGrammar = false;
    for (const line of s.lines) {
      if (/^-\s+\*\*문법과 표현\*\*/.test(line)) { inGrammar = true; continue }
      if (/^-\s+\*\*/.test(line)) { inGrammar = false; continue }  // 발음 / 문화 / ...
      if (!inGrammar) continue;
      const m = line.match(/^\s*\d+\.\s+(.+)$/);
      if (!m) continue;
      const forms = backticks(m[1]);
      if (!forms.length) continue;
      const rest = m[1].slice(m[1].lastIndexOf('`') + 1);
      patterns.push({ form: forms.join(', '), meaning: cleanMeaning(rest) });
    }
    return { number: s.number, title: s.title, patterns };
  }).filter((l) => l.patterns.length);
}

// --- TC2: "N. `form` — nghia" ----------------------------------------------

function parseTc2(md) {
  return sections(md, /^##\s+Bài\s+(\d+)\s+—\s+(.+)$/).map((s) => {
    const patterns = [];
    for (const line of s.lines) {
      const m = line.match(/^\d+\.\s+`(.+)`\s*—\s*(.*)$/);
      if (m) patterns.push({ form: m[1].trim(), meaning: cleanMeaning(m[2]) });
    }
    return { number: s.number, title: s.title, patterns };
  }).filter((l) => l.patterns.length);
}

// --- sinh file --------------------------------------------------------------

const LEVELS = [
  { level: 'sc1', label: 'Sơ cấp 1', file: 'grammar-by-lesson-sc1.md', parse: parseSc1 },
  { level: 'sc2', label: 'Sơ cấp 2', file: 'grammar-by-lesson-sc2.md', parse: parseSc2 },
  { level: 'tc1', label: 'Trung cấp 1', file: 'grammar-by-lesson-tc1.md', parse: parseTc1 },
  { level: 'tc2', label: 'Trung cấp 2', file: 'grammar-by-lesson-tc2.md', parse: parseTc2 },
];

const EXPECTED_LESSONS = { sc1: 16, sc2: 18, tc1: 18, tc2: 18 };

const data = LEVELS.map(({ level, label, file, parse }) => {
  const lessons = parse(read(file)).sort((a, b) => a.number - b.number);
  const want = EXPECTED_LESSONS[level];
  if (lessons.length !== want) {
    throw new Error(`[grammar] ${level}: parse ra ${lessons.length} bài, mong đợi ${want}`);
  }
  for (let i = 0; i < lessons.length; i++) {
    if (lessons[i].number !== i + 1) {
      throw new Error(`[grammar] ${level}: thiếu/lệch bài số ${i + 1}`);
    }
    if (!lessons[i].patterns.length) {
      throw new Error(`[grammar] ${level} bài ${i + 1}: không có pattern nào`);
    }
  }
  return { level, label, lessons };
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  '// AUTO-GENERATED bởi scripts/build-grammar.mjs — ĐỪNG sửa tay.\n' +
    '// Nguồn: data/grammar/*.md · sinh lại bằng: npm run gen:grammar\n' +
    "import type { GrammarLevelData } from './grammar-types';\n\n" +
    'export const GRAMMAR_DATA: GrammarLevelData[] = ' +
    JSON.stringify(data, null, 2) +
    ';\n',
  'utf8'
);

const total = data.reduce((n, l) => n + l.lessons.reduce((m, x) => m + x.patterns.length, 0), 0);
console.log(
  '[grammar] ' +
    data.map((d) => `${d.level}=${d.lessons.length} bài/` +
      d.lessons.reduce((m, x) => m + x.patterns.length, 0) + ' pattern').join('  ') +
    `  · tổng ${total} pattern → lib/grammar-data.ts`
);
