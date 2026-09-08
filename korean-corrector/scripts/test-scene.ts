// Test cho lib/scene.ts.
//
// LUU Y VE PHAM VI: quyet dinh "changed = true hay false" la do MODEL dua ra, khong
// tat dinh, nen khong test duoc bang assert. O day test PHAN CUA CHUNG TA: khi model
// tra ve changed=true/false thi app cap nhat scene co dung khong. Hai kich ban trong
// yeu cau duoc dung lai y nguyen, chi khac la ta bom san ket qua cua model.
// Muon do chinh model thi chay scripts/curl-scene.sh (can ANTHROPIC_API_KEY).
import {
  EMPTY_SCENE, INITIAL_SCENE_STATE, formatSceneForPrompt, isEmptyScene,
  normalizeScene, reduceScene, sceneFromPreset, sceneLabel,
} from '../lib/scene';
import type { Scene, SceneReport, SceneState } from '../lib/scene';

let pass = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log('  PASS  ' + name) }
  else { fails.push(name); console.log('  FAIL  ' + name + (detail ? ' → ' + detail : '')) }
}
const eq = (name: string, got: unknown, want: unknown) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

const QUAN_AN: Scene = { topic: 'gọi món', setting: 'quán ăn', interlocutor: 'nhân viên phục vụ', register: '존댓말' };
const KY_NGHI: Scene = { topic: 'kỳ nghỉ hè', setting: 'nói chuyện phiếm', interlocutor: 'bạn', register: '존댓말' };

const rep = (s: Scene, changed: boolean): SceneReport => ({ ...s, changed });

// Chay mot chuoi bao cao scene qua reducer, tra ve lich su.
function run(reports: SceneReport[], locked = false, start: SceneState = INITIAL_SCENE_STATE) {
  let st = start;
  const hist: { outcome: string; label: string }[] = [];
  for (const r of reports) {
    const step = reduceScene(st, r, locked);
    st = step.state;
    hist.push({ outcome: step.outcome, label: sceneLabel(st.scene) });
  }
  return { state: st, hist };
}

// --- 1. Kich ban trong yeu cau ----------------------------------------------
console.log('\n[1] Hai kịch bản trong yêu cầu');

// 3 cau goi mon roi 1 cau ve ky nghi -> changed=true o cau 4
const a = run([
  rep(QUAN_AN, false), rep(QUAN_AN, false), rep(QUAN_AN, false), rep(KY_NGHI, true),
]);
eq('3 câu gọi món + 1 câu kỳ nghỉ → câu 4 thay scene',
  a.hist.map((h) => h.outcome), ['merged', 'merged', 'merged', 'replaced']);
eq('… scene cuối là kỳ nghỉ', a.state.scene.topic, 'kỳ nghỉ hè');

// 3 cau goi mon roi 1 cau dem "근데 오늘 날씨 좋네요" -> changed=false
const b = run([
  rep(QUAN_AN, false), rep(QUAN_AN, false), rep(QUAN_AN, false),
  rep({ ...QUAN_AN, topic: 'thời tiết' }, false), // model coi la cau dem
]);
eq('3 câu gọi món + 1 câu đệm thời tiết → KHÔNG thay scene',
  b.hist.map((h) => h.outcome), ['merged', 'merged', 'merged', 'merged']);
eq('… vẫn đang ở quán ăn', b.state.scene.topic, 'gọi món');
eq('… vẫn nói với nhân viên', b.state.scene.interlocutor, 'nhân viên phục vụ');

// --- 2. changed=false chi lap cho trong ------------------------------------
console.log('\n[2] changed=false chỉ lấp chỗ trống');
const partial: SceneState = { scene: { topic: 'gọi món', setting: '', interlocutor: '', register: '' }, pending: 0 };
const m = reduceScene(partial, rep({ topic: 'ăn uống', setting: 'quán ăn', interlocutor: 'nhân viên', register: '존댓말' }, false), false);
eq('không ghi đè topic đã có', m.state.scene.topic, 'gọi món');
eq('lấp setting đang trống', m.state.scene.setting, 'quán ăn');
eq('lấp interlocutor đang trống', m.state.scene.interlocutor, 'nhân viên');

// --- 3. Dat tinh huong truoc = khoa scene ----------------------------------
console.log('\n[3] "Đặt tình huống trước" khoá scene');
const preset = sceneFromPreset('đóng vai đi khám bệnh, nói với bác sĩ');
eq('preset thành topic', preset.topic, 'đóng vai đi khám bệnh, nói với bác sĩ');

const locked1 = run([rep(KY_NGHI, true)], true, { scene: preset, pending: 0 });
eq('lệch 1 câu → GIỮ nguyên', locked1.hist[0].outcome, 'held');
eq('… scene chưa đổi', locked1.state.scene.topic, preset.topic);

const locked2 = run([rep(KY_NGHI, true), rep(KY_NGHI, true)], true, { scene: preset, pending: 0 });
eq('lệch 2 câu LIÊN TIẾP → mới đổi', locked2.hist.map((h) => h.outcome), ['held', 'replaced']);
eq('… scene đã đổi', locked2.state.scene.topic, 'kỳ nghỉ hè');

const brokenStreak = run([rep(KY_NGHI, true), rep(preset, false), rep(KY_NGHI, true)], true, { scene: preset, pending: 0 });
eq('lệch 1 → về lại → lệch 1: chuỗi bị ngắt, chưa đổi',
  brokenStreak.hist.map((h) => h.outcome), ['held', 'merged', 'held']);
eq('… vẫn giữ tình huống đặt trước', brokenStreak.state.scene.topic, preset.topic);

// Khong khoa thi doi ngay tu cau dau
eq('không đặt trước → lệch 1 câu là đổi ngay',
  run([rep(KY_NGHI, true)], false, { scene: QUAN_AN, pending: 0 }).hist[0].outcome, 'replaced');

// --- 4. Chuan hoa & bien -----------------------------------------------------
console.log('\n[4] Chuẩn hoá & biên');
eq('register lạ bị bỏ', normalizeScene({ register: 'polite' }).register, '');
eq('register hợp lệ được giữ', normalizeScene({ register: '반말' }).register, '반말');
eq('cắt chuỗi quá dài', normalizeScene({ topic: 'x'.repeat(300) }).topic.length, 120);
eq('scene rỗng', isEmptyScene(EMPTY_SCENE), true);
eq('scene có 1 trường thì không rỗng', isEmptyScene({ ...EMPTY_SCENE, topic: 'a' }), false);
eq('report rỗng thì giữ nguyên state',
  reduceScene({ scene: QUAN_AN, pending: 0 }, null, false).state.scene.topic, 'gọi món');
eq('changed=true nhưng scene rỗng thì không xoá scene cũ',
  reduceScene({ scene: QUAN_AN, pending: 0 }, rep(EMPTY_SCENE, true), false).state.scene.topic, 'gọi món');

// --- 5. Chuoi cho prompt -----------------------------------------------------
console.log('\n[5] Chuỗi đưa vào prompt');
const line = formatSceneForPrompt(QUAN_AN);
check('có đủ 4 trường', ['gọi món', 'quán ăn', 'nhân viên phục vụ', '존댓말'].every((x) => line.includes(x)));
check('scene rỗng → dặn tự suy', formatSceneForPrompt(EMPTY_SCENE).includes('hãy tự suy ra'));

console.log(`\n${fails.length === 0 ? 'ALL PASS' : fails.length + ' FAILURES'} — ${pass} pass`);
if (fails.length) { for (const f of fails) console.log('  - ' + f); process.exit(1) }
