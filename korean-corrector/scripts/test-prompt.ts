// Test cho lib/prompt.ts — dung system prompt cho 3 cau hinh trong yeu cau.
// Kiem tra tren PROMPT chu khong tren dau ra cua model, vi dau ra khong tat dinh.
import {
  buildPassageMessage, buildSystemPrompt, buildUserMessage, focusLessons, forcesJondae,
  readPassage, readSetup, todayTopic,
} from '../lib/prompt';
import type { Setup } from '../lib/prompt';

let pass = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log('  PASS  ' + name) }
  else { fails.push(name); console.log('  FAIL  ' + name + (detail ? ' → ' + detail : '')) }
}
const eq = (name: string, got: unknown, want: unknown) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

// Chi lay rieng khoi "Ngu phap da hoc" — muc "Sap hoc" nam ngoai va CO QUYEN
// chua bai N+1, N+2, nen khong duoc gop chung khi kiem tra pool.
function poolSection(sys: string): string {
  const i = sys.indexOf('# Ngữ pháp học viên ĐÃ HỌC');
  if (i === -1) return '';
  const j = sys.indexOf('\n# ', i + 1);
  return j === -1 ? sys.slice(i) : sys.slice(i, j);
}

const SENT = '저는 어제 친구 만나요 그리고 밥 먹어요';

// --- Cau hinh 1: SC1 bai 5, 존댓말 ------------------------------------------
console.log('\n[A] SC1 bài 5 · 존댓말');
const a: Setup = { level: 'sc1', curriculum: 'xirian', lesson: 5, review: [], topic: '', register: 'jondaetmal' };
const sa = buildSystemPrompt(a);
check('nói rõ lớp Sơ cấp 1 học đến bài 5', sa.includes('Sơ cấp 1') && sa.includes('học đến bài 5'));
check('pool CÓ -았/었- (bài 5)', sa.includes('V-았/었-'));
check('pool CÓ V-고 (bài 5)', sa.includes('V-고'));
check('pool KHÔNG có -(으)면서 (SC1 bài 16)', !sa.includes('(으)면서'));
check('pool KHÔNG có -아서/어서 (SC1 bài 10)', !sa.includes('V-아서/어서'));
check('pool KHÔNG có bài 6+', !/\bB6 /.test(poolSection(sa)) && !/\bB10 /.test(poolSection(sa)));
check('pool dừng đúng ở B5', /\bB5 /.test(poolSection(sa)));

// Doi lai so voi ban truoc: luat "sap hoc" da bi bo han.
check('KHÔNG còn mục "Sắp học"', !sa.includes('# Sắp học'));
check('KHÔNG còn ngoại lệ "sắp học ở bài X"', !sa.includes('sắp học ở bài'));
check('có luật TÍCH LUỸ NGHIÊM NGẶT', sa.includes('TÍCH LUỸ NGHIÊM NGẶT') && sa.includes('KHÔNG có bất kỳ ngoại lệ nào'));
check('luật Sơ cấp 1: cấm sửa vì "chưa tự nhiên"', sa.includes('KHÔNG sửa chỉ vì "chưa tự nhiên"'));
check('luật 존댓말', sa.includes('Sửa mọi câu đang ở dạng 반말 thành 존댓말'));
check('Bài hôm nay tự lấy từ bài 5', sa.includes('# Bài hôm nay') && sa.includes('주말에 친구를 만났어요'));

// --- Cau hinh 2: TC1 bai 10, Tu dong ---------------------------------------
console.log('\n[B] TC1 bài 10 · Tự động');
const b: Setup = { level: 'tc1', curriculum: 'xirian', lesson: 10, review: [], topic: '', register: 'auto' };
const sb = buildSystemPrompt(b);
check('nói rõ Trung cấp 1 bài 10', sb.includes('Trung cấp 1') && sb.includes('học đến bài 10'));
check('pool CÓ -고 나서 (SC2 bài 5)', sb.includes('V-고 나서'));
check('pool CÓ -(으)ㄴ 후에 (SC2 bài 15)', sb.includes('V-(으)ㄴ 후에'));
check('pool CÓ -다가 (SC2 bài 8)', sb.includes('V-다가'));
check('pool có đủ 3 cấp SC1+SC2+TC1', ['## Sơ cấp 1', '## Sơ cấp 2', '## Trung cấp 1'].every((h) => sb.includes(h)));
check('KHÔNG có ngữ pháp TC2', !sb.includes('## Trung cấp 2'));
check('KHÔNG có TC1 bài 11+ (V-게 하다 ở bài 15)', !sb.includes('V-게 하다'));
check('Tự động: không ép về 존댓말', sb.includes('Tự suy ra từ cách học viên đang nói'));
check('… có dặn không sửa 반말 nhất quán', sb.includes('KHÔNG được sửa sang 존댓말'));
eq('TC1 bài 10 không bị ép 존댓말', forcesJondae(b), false);

// --- Cau hinh 3: Khac + TC2 -------------------------------------------------
console.log('\n[C] Giáo trình Khác · TC2');
const c: Setup = { level: 'tc2', curriculum: 'other', lesson: null, review: [], topic: '', register: 'auto' };
const sc = buildSystemPrompt(c);
check('nói rõ Trung cấp 2', sc.includes('Trung cấp 2'));
check('KHÔNG nhắc số bài', !/bài \d/.test(sc) && !/\bB\d+ /.test(sc));
check('có dặn tuyệt đối không nhắc số bài', sc.includes('TUYỆT ĐỐI không nhắc tới số bài'));
check('KHÔNG nhúng pool ngữ pháp', !sc.includes('# Ngữ pháp học viên ĐÃ HỌC'));
check('KHÔNG có mục Sắp học', !sc.includes('# Sắp học'));
check('KHÔNG có Bài hôm nay', !sc.includes('# Bài hôm nay'));
check('vẫn có luật sửa cấp TC2', sc.includes('관용 표현'));

// --- 반말/존댓말: cac truong hop ep buoc ------------------------------------
console.log('\n[D] Quy tắc ép 존댓말');
eq('SC1 + Tự động → ép', forcesJondae({ ...a, register: 'auto' }), true);
eq('SC2 bài 9 + Tự động → ép', forcesJondae({ level: 'sc2', curriculum: 'xirian', lesson: 9, review: [], topic: '', register: 'auto' }), true);
eq('SC2 bài 10 + Tự động → KHÔNG ép (bài dạy 반말)', forcesJondae({ level: 'sc2', curriculum: 'xirian', lesson: 10, review: [], topic: '', register: 'auto' }), false);
check('SC1 + Tự động vẫn ghi rõ lý do ép',
  buildSystemPrompt({ ...a, register: 'auto' }).includes('Lớp này chưa học 반말'));
check('chọn 반말 thì sửa ngược lại',
  buildSystemPrompt({ ...b, register: 'banmal' }).includes('Sửa mọi câu đang ở dạng 존댓말 thành 반말'));

// --- Bai hom nay + user message ---------------------------------------------
console.log('\n[E] Bài hôm nay & user message');
eq('topic tự động từ bài đang học', todayTopic(a).startsWith('Bài 5 — 주말에 친구를 만났어요'), true);
eq('topic nhập tay thì ưu tiên', todayTopic({ ...a, topic: 'Bài 15 — 여행' }), 'Bài 15 — 여행');
eq('curriculum=other thì không có topic tự động', todayTopic(c), '');

const um = buildUserMessage('fix', SENT, ['안녕하세요', '저는 학생이에요']);
check('user message chứa câu cần chấm', um.includes('CÂU CẦN CHẤM: ' + SENT));
check('user message chứa ngữ cảnh', um.includes('- 안녕하세요'));
check('fix mode yêu cầu register_detected', um.includes('register_detected'));
check('deep mode không có register_detected', !buildUserMessage('deep', SENT, []).includes('register_detected'));
check('không ngữ cảnh thì không có phần đầu', !buildUserMessage('fix', SENT, []).includes('vừa nói trước đó'));

// --- Goi y nang cap + moc de nham -------------------------------------------
console.log('\n[G] Gợi ý nâng cấp & Mốc dễ nhầm');
for (const [nameLv, sys] of [['SC1', sa], ['TC1', sb], ['TC2/Khác', sc]] as const) {
  check(nameLv + ': có luật "Nâng" phải khác câu sửa', sys.includes('khác câu đã sửa ít nhất MỘT cấu trúc'));
  check(nameLv + ': cấm lặp lại câu sửa làm gợi ý', sys.includes('không lặp lại nguyên văn câu đã sửa'));
}
// Moc de nham cung phai theo tich luy: chi hien moc nao nam trong pool.
const sc1Full = buildSystemPrompt({ ...a, lesson: 16 });
check('SC1 bài 16 có đủ mục Mốc dễ nhầm', sc1Full.includes('# Mốc dễ nhầm'));
check('TC1 cũng có Mốc dễ nhầm (pool gồm trọn SC1)', sb.includes('# Mốc dễ nhầm'));
check('SC1 bài 5 KHÔNG có Mốc dễ nhầm (mọi mốc đều ở bài ≥11)', !sa.includes('# Mốc dễ nhầm'));
check('SC1 bài 11 chỉ có mốc ㅡ 탈락',
  buildSystemPrompt({ ...a, lesson: 11 }).includes('`ㅡ 탈락`') &&
  !buildSystemPrompt({ ...a, lesson: 11 }).includes('`못 V`'));
check('SC1 bài 12 đã có mốc 못 V', buildSystemPrompt({ ...a, lesson: 12 }).includes('`못 V`'));
check('SC1 bài 12 CHƯA có mốc 한테/께 (bài 14)', !buildSystemPrompt({ ...a, lesson: 12 }).includes('`N한테/께`'));
check('Giáo trình Khác KHÔNG có Mốc dễ nhầm (không được dẫn số bài)', !sc.includes('# Mốc dễ nhầm'));
check('mốc ghi rõ là bài của Sơ cấp 1', sc1Full.includes('đều là bài của SƠ CẤP 1'));
check('-아서/어서 tách đúng 2 nghĩa/2 bài',
  sc1Full.includes('bài 10 = "rồi"') && sc1Full.includes('bài 12 = "vì… nên"'));
check('못 V ở bài 12 chứ không phải 11', sc1Full.includes('`못 V` (không thể): Sơ cấp 1 bài 12, KHÔNG phải bài 11'));
check('잘하다/못하다 ở bài 9', sc1Full.includes('`잘하다 / 못하다` (giỏi / không giỏi): Sơ cấp 1 bài 9'));
check('ㅡ 탈락 ở bài 11', sc1Full.includes('`ㅡ 탈락` (아파요, 바빠요, 썼어요): Sơ cấp 1 bài 11'));
check('한테/께 ở bài 14 chứ không phải 9', sc1Full.includes('`N한테/께` (cho ai): Sơ cấp 1 bài 14, KHÔNG phải bài 9'));
check('dặn dẫn bài theo nghĩa đang dùng', sc1Full.includes('dẫn đúng bài theo NGHĨA đang dùng'));
check('Khác + TC2 vẫn không lọt số bài nào', !/bài \d/.test(sc));

// --- Bai trong tam ----------------------------------------------------------
console.log('\n[H] Bài trọng tâm');
// (5) SC1 bai 5, trong tam bai 5 -> tuyet doi khong co pattern bai >= 6
const sc1Focus = buildSystemPrompt(a);
eq('trọng tâm mặc định = bài đang học', focusLessons(a), [5]);
check('nêu rõ bài trọng tâm là bài 5', sc1Focus.includes('# Bài trọng tâm: bài 5'));
check('không có phần "ôn thêm" khi chưa tick', !sc1Focus.includes('ôn thêm bài'));
for (const p of ['V-(으)세요', 'ㅂ 불규칙', 'V-(으)ㄹ까요?', 'ㅡ 탈락', '못 V', 'V-(으)면서', 'V-고 싶다']) {
  check(`toàn prompt KHÔNG chứa pattern bài ≥6: ${p}`, !sc1Focus.includes(p));
}
check('liệt kê pattern của bài trọng tâm', sc1Focus.includes('B5 주말에 친구를 만났어요: 날짜와 요일'));
check('luật 2/3 câu Nâng', sc1Focus.includes('ít nhất 2/3 số câu'));
check('yêu cầu trường patterns', sc1Focus.includes('"patterns"') && sc1Focus.includes('"lesson":15'));
check('yêu cầu situation_changed', sc1Focus.includes('"situation_changed": true'));
check('yêu cầu dòng cuối "Ôn bài X"', sc1Focus.includes('"Ôn bài X:'));
check('có điều khoản không ép nếu gượng', sc1Focus.includes('KHÔNG được ép'));

// (5) TC1 bai 10 + tick on bai 3 -> neu ro CA HAI bai trong tam
const bReview: Setup = { ...b, review: [3] };
const sbr = buildSystemPrompt(bReview);
eq('trọng tâm = bài hiện tại + bài ôn', focusLessons(bReview), [10, 3]);
check('nêu rõ hai bài trọng tâm', sbr.includes('# Bài trọng tâm: bài 10 · ôn thêm bài 3'));
check('liệt kê pattern bài 10', sbr.includes('B10 결혼하려면 아직 멀었어요'));
check('liệt kê pattern bài 3 (bài ôn)', sbr.includes('B3 비가 이렇게 많이 올 줄 몰랐어요'));

const bTwo = buildSystemPrompt({ ...b, review: [3, 7] });
check('hai bài ôn cùng lúc', bTwo.includes('ôn thêm bài 3, 7'));
check('Khác + TC2 KHÔNG có bài trọng tâm', !sc.includes('# Bài trọng tâm'));

// --- Tu vung ----------------------------------------------------------------
console.log('\n[I] Từ vựng');
check('luôn có mục Từ vựng', sa.includes('# Từ vựng') && sc.includes('# Từ vựng'));
check('chưa có data/vocab → dặn dùng từ cơ bản đúng cấp',
  sa.includes('Chưa có danh sách từ vựng') && sa.includes('Chỉ dùng từ vựng cơ bản đúng trình độ'));
check('… và bám chủ đề theo tiêu đề bài', sa.includes('tiêu đề mỗi bài trong danh sách ngữ pháp ở trên CHÍNH LÀ chủ đề'));
check('Khác: không nhắc tiêu đề bài', !sc.includes('CHÍNH LÀ chủ đề'));

// --- Cham ca doan -----------------------------------------------------------
// Dung cau hinh cua dryRun trong yeu cau: SC1 bai 5, 3 cau.
console.log('\n[J] Chấm cả đoạn (mode passage)');
const P3 = ['친구를 만났어요', '밥을 먹었어요', '영화를 봤어요'];
const p3 = readPassage({ originals: P3, correcteds: ['친구를 만났어요', '밥을 먹었어요', ''] });
eq('readPassage giữ đủ 3 câu gốc', p3.originals, P3);
eq('câu chưa có bản sửa thì lấy lại câu gốc', p3.correcteds[2], '영화를 봤어요');
eq('readPassage bỏ câu rỗng', readPassage({ originals: ['가요', '  ', '와요'] }).originals, ['가요', '와요']);
eq('bỏ câu rỗng nhưng KHÔNG lệch cặp gốc/sửa',
  readPassage({ originals: ['가요', '', '와요'], correcteds: ['갑니다', 'X', '옵니다'] }).correcteds,
  ['갑니다', '옵니다']);
eq('body không có originals → đoạn rỗng', readPassage({}).originals, []);

const pm = buildPassageMessage(p3);
check('prompt nêu rõ đoạn có 3 câu', pm.includes('ĐOẠN CẦN CHẤM — 3 câu'));
for (let i = 0; i < P3.length; i++) {
  check('prompt chứa câu ' + (i + 1) + ': ' + P3[i], pm.includes(`${i + 1}. gốc: ${P3[i]}`));
}
check('prompt kèm cả bản đã sửa của từng câu', pm.includes('đã sửa: 영화를 봤어요'));
for (const f of ['"rewritten"', '"cohesion"', '"consistency"', '"recurring"', '"upgrades"', '"examples"', '"note"']) {
  check('prompt yêu cầu trường ' + f, pm.includes(f));
}
check('rewritten phải giữ nguyên số ý', pm.includes('không thêm ý mới, không bỏ ý nào'));
check('recurring chỉ tính lỗi lặp ≥2 lần', pm.includes('TỪ 2 LẦN TRỞ LÊN'));
check('consistency rỗng khi không có lỗi', pm.includes('Không có lỗi thì để chuỗi rỗng'));
check('không có scene thì vẫn có dòng HOÀN CẢNH', pm.includes('HOÀN CẢNH HIỆN TẠI'));
check('scene được nhúng vào prompt đoạn',
  buildPassageMessage(p3, { topic: 'cuối tuần', setting: 'lớp học', interlocutor: 'cô giáo', register: '존댓말' })
    .includes('chủ đề = cuối tuần'));

// System prompt cua doan dung y het mode deep -> van la SC1 bai 5.
check('đoạn dùng lại pool dừng ở bài 5', /\bB5 /.test(poolSection(sa)) && !/\bB6 /.test(poolSection(sa)));
check('đoạn vẫn có bài trọng tâm', sa.includes('# Bài trọng tâm: bài 5'));
check('đoạn vẫn có luật tích luỹ nghiêm ngặt', sa.includes('TÍCH LUỸ NGHIÊM NGẶT'));

// --- readSetup --------------------------------------------------------------
console.log('\n[F] readSetup');
eq('kẹp số bài quá lớn về 16 cho SC1', readSetup({ level: 'sc1', curriculum: 'xirian', lesson: 99 }).lesson, 16);
eq('curriculum=other thì bỏ số bài', readSetup({ level: 'tc2', curriculum: 'other', lesson: 5 }).lesson, null);
eq('level lạ thì về sc1', readSetup({ level: 'xx' }).level, 'sc1');
eq('register lạ thì về auto', readSetup({ level: 'tc1', register: 'xx' }).register, 'auto');
eq('review chỉ giữ bài < bài hiện tại',
  readSetup({ level: 'tc1', curriculum: 'xirian', lesson: 5, review: [2, 5, 9, 3] }).review, [2, 3]);
eq('review tối đa 2 bài',
  readSetup({ level: 'tc1', curriculum: 'xirian', lesson: 10, review: [1, 2, 3, 4] }).review, [1, 2]);
eq('review bỏ trùng',
  readSetup({ level: 'tc1', curriculum: 'xirian', lesson: 10, review: [3, 3, 3] }).review, [3]);
eq('curriculum=other thì review rỗng',
  readSetup({ level: 'tc2', curriculum: 'other', review: [1, 2] }).review, []);

console.log(`\n${fails.length === 0 ? 'ALL PASS' : fails.length + ' FAILURES'} — ${pass} pass`);
if (fails.length) { for (const f of fails) console.log('  - ' + f); process.exit(1) }
