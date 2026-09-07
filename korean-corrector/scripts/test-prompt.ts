// Test cho lib/prompt.ts — dung system prompt cho 3 cau hinh trong yeu cau.
// Kiem tra tren PROMPT chu khong tren dau ra cua model, vi dau ra khong tat dinh.
import { buildSystemPrompt, buildUserMessage, forcesJondae, readSetup, todayTopic } from '../lib/prompt';
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
const a: Setup = { level: 'sc1', curriculum: 'xirian', lesson: 5, topic: '', register: 'jondaetmal' };
const sa = buildSystemPrompt(a);
check('nói rõ lớp Sơ cấp 1 học đến bài 5', sa.includes('Sơ cấp 1') && sa.includes('học đến bài 5'));
check('pool CÓ -았/었- (bài 5)', sa.includes('V-았/었-'));
check('pool CÓ V-고 (bài 5)', sa.includes('V-고'));
check('pool KHÔNG có -(으)면서 (SC1 bài 16)', !sa.includes('(으)면서'));
check('pool KHÔNG có -아서/어서 (SC1 bài 10)', !sa.includes('V-아서/어서'));
check('pool KHÔNG có bài 6+', !/\bB6 /.test(poolSection(sa)) && !/\bB10 /.test(poolSection(sa)));
check('pool dừng đúng ở B5', /\bB5 /.test(poolSection(sa)));
check('có mục "Sắp học" (bài 6–7)', sa.includes('# Sắp học') && /\bB6 /.test(sa) && /\bB7 /.test(sa));
check('luật Sơ cấp 1: cấm sửa vì "chưa tự nhiên"', sa.includes('KHÔNG sửa chỉ vì "chưa tự nhiên"'));
check('luật 존댓말', sa.includes('Sửa mọi câu đang ở dạng 반말 thành 존댓말'));
check('Bài hôm nay tự lấy từ bài 5', sa.includes('# Bài hôm nay') && sa.includes('주말에 친구를 만났어요'));

// --- Cau hinh 2: TC1 bai 10, Tu dong ---------------------------------------
console.log('\n[B] TC1 bài 10 · Tự động');
const b: Setup = { level: 'tc1', curriculum: 'xirian', lesson: 10, topic: '', register: 'auto' };
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
const c: Setup = { level: 'tc2', curriculum: 'other', lesson: null, topic: '', register: 'auto' };
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
eq('SC2 bài 9 + Tự động → ép', forcesJondae({ level: 'sc2', curriculum: 'xirian', lesson: 9, topic: '', register: 'auto' }), true);
eq('SC2 bài 10 + Tự động → KHÔNG ép (bài dạy 반말)', forcesJondae({ level: 'sc2', curriculum: 'xirian', lesson: 10, topic: '', register: 'auto' }), false);
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

// --- readSetup --------------------------------------------------------------
console.log('\n[F] readSetup');
eq('kẹp số bài quá lớn về 16 cho SC1', readSetup({ level: 'sc1', curriculum: 'xirian', lesson: 99 }).lesson, 16);
eq('curriculum=other thì bỏ số bài', readSetup({ level: 'tc2', curriculum: 'other', lesson: 5 }).lesson, null);
eq('level lạ thì về sc1', readSetup({ level: 'xx' }).level, 'sc1');
eq('register lạ thì về auto', readSetup({ level: 'tc1', register: 'xx' }).register, 'auto');

console.log(`\n${fails.length === 0 ? 'ALL PASS' : fails.length + ' FAILURES'} — ${pass} pass`);
if (fails.length) { for (const f of fails) console.log('  - ' + f); process.exit(1) }
