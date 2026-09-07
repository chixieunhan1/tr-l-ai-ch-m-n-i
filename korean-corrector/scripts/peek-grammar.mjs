// Tien ich xem nhanh ket qua parse (khong tham gia build).
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../lib/grammar-data.ts', import.meta.url), 'utf8');
const start = src.indexOf('= [') + 2;
const D = JSON.parse(src.slice(start, src.lastIndexOf(']') + 1));

const show = (lv, n) => {
  const L = D.find((x) => x.level === lv).lessons.find((l) => l.number === n);
  console.log(`[${lv} B${L.number}] ${L.title}`);
  for (const p of L.patterns) console.log('    ' + p.form + (p.meaning ? '   ~ ' + p.meaning : ''));
};

show('sc1', 1);
show('sc1', 10);
show('sc2', 9);
show('tc1', 1);
show('tc1', 6);
show('tc2', 18);

for (const lv of D) {
  console.log(`\n${lv.level}: ` + lv.lessons.map((l) => l.number + ':' + l.patterns.length).join(' ') +
    `  = ${lv.lessons.reduce((a, l) => a + l.patterns.length, 0)}`);
}
const empty = D.flatMap((lv) => lv.lessons.flatMap((l) => l.patterns.map((p) => ({ lv: lv.level, n: l.number, p }))))
  .filter((x) => !x.p.form);
console.log('\npattern thieu form: ' + (empty.length || 'khong co'));
