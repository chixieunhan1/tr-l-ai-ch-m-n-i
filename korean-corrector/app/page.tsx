'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { LEVEL_LABEL, LEVEL_ORDER, getLesson, lessonCount } from '@/lib/grammar';
import type { LevelId } from '@/lib/grammar';

interface AE { wrong: string; right: string; why: string }
interface KV { ko: string; vi: string }
interface FixData { corrected: string; errors: AE[] }
interface DeepData { upgrades: KV[]; examples: KV[]; note: string }
interface RI {
  id: number;
  text: string;
  merged?: boolean;
  fix?: FixData;
  deep?: DeepData;
  fixErr?: string;
  deepErr?: string;
  fixLoading: boolean;
  deepLoading: boolean;
}
interface Job { id: number; text: string; context: string[] }
interface LogLine { n: number; t: number; tag: string; msg: string }

const LOG_MAX = 400;
const DUP_MS = 10000; // chan submit trung text trong 10s

const MAX_CONCURRENT = 2;
const CONTEXT_SIZE = 5;
const MERGE_MS = 3000;

type Curriculum = 'xirian' | 'other';
type Register = 'auto' | 'banmal' | 'jondaetmal';
interface Setup {
  level: LevelId;
  curriculum: Curriculum;
  lesson: number;
  topic: string;
  register: Register;
}
const SETUP_KEY = 'xirian.setup.v1';
const DEFAULT_SETUP: Setup = {
  level: 'sc1', curriculum: 'xirian', lesson: 1, topic: '', register: 'auto',
};
const REGISTER_LABEL: Record<Register, string> = {
  auto: 'Tự động',
  banmal: 'Bạn bè, người thân (반말)',
  jondaetmal: 'Người lớn, thầy cô, người lạ (존댓말)',
};

function loadSetup(): Setup | null {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!LEVEL_ORDER.includes(s?.level)) return null;
    return {
      level: s.level,
      curriculum: s.curriculum === 'other' ? 'other' : 'xirian',
      lesson: Math.min(Math.max(Number(s.lesson) || 1, 1), lessonCount(s.level)),
      topic: typeof s.topic === 'string' ? s.topic : '',
      register: s.register === 'banmal' || s.register === 'jondaetmal' ? s.register : 'auto',
    };
  } catch (e) { return null }
}

// Dòng tóm tắt hiện khi thanh cài đặt đã thu lại.
function setupSummary(s: Setup): string {
  const bits = [LEVEL_LABEL[s.level]];
  if (s.curriculum === 'xirian') {
    const l = getLesson(s.level, s.lesson);
    bits.push('서울대 bài ' + s.lesson + (l ? ' · ' + l.title : ''));
  } else {
    bits.push('giáo trình khác');
  }
  bits.push(REGISTER_LABEL[s.register]);
  if (s.topic.trim()) bits.push('“' + s.topic.trim() + '”');
  return bits.join('  ·  ');
}

// Nguong im lang theo duoi cau tieng Han.
const MS_UNFINISHED = 4000; // con dang noi do, cho lau
const MS_FINISHED = 1200;   // cau da tron, chot nhanh
const MS_REORDER = 1500;    // dao trat tu, phan duoi ngan
const MS_DEFAULT = 2000;

// LIEN TU noi ve: ve cau con dang do, nguoi noi chac chan chua dut y.
const CONJ_TAIL = ['고','서','는데','은데','니까','면','지만','거나','려고','면서','다가','는지'];
// Cap [phu am cuoi, phan con lai] cho duoi viet bang jamo: ㄴ데
const CONJ_JONG: [string, string][] = [['ㄴ', '데']];
// TRO TU gan vao danh tu. Cung cho 4000ms, nhung luat dao trat tu duoc phep de len.
const PART_TAIL = ['이','가','은','는','을','를','에','에서','로','으로','도','만','와','과','하고','랑','이랑',
  '의','부터','까지','처럼','보다','한테','에게','께'];

// Duoi cau hoan chinh
const END_TAIL = ['요','습니다','습니까','죠','네요','군요','거든요','잖아요','을까요','을게요',
  '세요','어','아','지','야','니','냐','자','구나','네'];
// ㅂ니다, ㅂ니까, ㄹ까요, ㄹ게요
// ㅂ니까 la dang chung cua 습니까 (vd 안녕하십니까); thieu no thi 십니까 bi doc nham
// thanh lien tu 니까 -> cho 4000ms trong khi cau chao da tron.
const END_JONG: [string, string][] = [['ㅂ', '니다'], ['ㅂ', '니까'], ['ㄹ', '까요'], ['ㄹ', '게요']];
// Duoi mot am tiet de trung voi danh tu thuong (한국어, 편지, 모자, 어머니...).
// Van tinh la het cau khi o cuoi, nhung khong dung de bat luat dao trat tu.
const WEAK_END = ['어','아','지','야','니','냐','자','네'];

// Lien tu mo cau: bao hieu cau moi, khong duoc noi vao cau truoc
const OPENERS = ['그리고','그래서','그런데','근데','그러니까','하지만','그럼','또'];
// Dai tu chu ngu: cung bao hieu cau moi. Dung chung cho luat gop cau va luat dao trat tu.
const SUBJECTS = ['저는','제가','나는','내가','우리는','우리','저희'];
// Cau chao / tu dem: tron ve mat ngu phap nhung thuong chi la mo dau, nguoi noi con noi tiep.
// Luat dao trat tu bo qua chung, xet duoi hoan chinh ke tiep.
const GREETINGS = ['안녕하세요','안녕하십니까','네','예','아니요','감사합니다','고맙습니다',
  '죄송합니다','미안해요','그래요','맞아요','알겠습니다'];

const JONGSEONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ',
  'ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

// Phu am cuoi (batchim) cua mot am tiet Han
function jong(ch: string): string {
  const c = (ch || '').charCodeAt(0) - 0xac00;
  if (isNaN(c) || c < 0 || c > 11171) return '';
  return JONGSEONG[c % 28];
}

type Kind = 'end' | 'conj' | 'part';
interface Rule { tail: string; jong: string; kind: Kind; strong: boolean; w: number }

const mkRule = (kind: Kind) => (tail: string, j: string): Rule => ({
  tail, jong: j, kind, strong: kind === 'end' && !WEAK_END.includes(tail), w: tail.length + (j ? 1 : 0),
});
const endRule = mkRule('end');
const conjRule = mkRule('conj');
const partRule = mkRule('part');
const isConn = (k?: Kind) => k === 'conj' || k === 'part';

// Gop mot bang, sap theo do dai giam dan de duoi dai khop truoc duoi ngan
// (vd 는데요 an ra duoi hoan chinh 요, khong phai lien tu 는데).
const RULES: Rule[] = [
  ...END_TAIL.map(t => endRule(t, '')),
  ...END_JONG.map(([j, t]) => endRule(t, j)),
  ...CONJ_TAIL.map(t => conjRule(t, '')),
  ...CONJ_JONG.map(([j, t]) => conjRule(t, j)),
  ...PART_TAIL.map(t => partRule(t, '')),
].sort((a, b) => b.w - a.w);

function matchTail(word: string): Rule | null {
  for (const r of RULES) {
    if (!word.endsWith(r.tail)) continue;
    if (!r.jong) return r;
    const prev = word[word.length - r.tail.length - 1];
    if (prev && jong(prev) === r.jong) return r;
  }
  return null;
}

const norm = (w: string) => w.replace(/[.,!?~…·]+$/, '');

// Phan sau duoi phai TOAN danh tu / tro tu / pho tu (밥은, 어제, 학교에서, 너무).
// Dinh mot lien tu hay mot duoi hoan chinh ro rang la co dong tu da chia -> khong phai dao.
const isPlainTail = (w: string) => {
  const t = matchTail(norm(w));
  return !(t?.kind === 'conj' || (t?.kind === 'end' && t.strong));
};

// Dao trat tu: duoi hoan chinh nam giua cau, phan sau chi 1-3 tu.
// Chi nhan duoi ro rang (strong), neu khong danh tu nhu 한국어 se bi hieu nham la het cau.
// Duyet TU TRAI SANG PHAI de con bo qua duoc cau chao dung dau. Tra ve tu mang duoi do.
function reorderPivot(words: string[]): string | null {
  const n = words.length;
  for (let i = 0; i <= n - 2; i++) {
    const m = matchTail(norm(words[i]));
    if (!m || m.kind !== 'end' || !m.strong) continue;

    // (2) Cau chao/tu dem chi la mo dau -> bo qua, xet duoi hoan chinh ke tiep.
    if (GREETINGS.includes(norm(words[i]))) continue;

    const tail = words.slice(i + 1);
    if (tail.length > 3) continue;                              // phan sau chi 1-3 tu
    if (OPENERS.some(o => tail[0].startsWith(o))) continue;     // lien tu mo cau -> cau moi
    if (SUBJECTS.some(s => tail[0].startsWith(s))) continue;    // (1) dai tu chu ngu -> cau moi
    if (!tail.every(isPlainTail)) continue;                     // (3) phai toan danh/tro/pho tu

    return words[i];
  }
  return null;
}

interface Wait { ms: number; reason: string }

function decideSilence(text: string): Wait {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { ms: MS_DEFAULT, reason: 'chưa có chữ' };
  const last = words[words.length - 1];
  const m = matchTail(last);

  // Chong nhieu: sau khi Chrome restart phien, no hay bat tieng tho thanh MOT am tiet le
  // (네, 어, 아...). Neu tu ngay truoc van la lien tu chua het cau thi tin lien tu, cho tiep,
  // dung de mot am tiet rac keo nguong tu 4000ms xuong 1200ms. Bo doan nay neu thay cat nham.
  if (m?.kind === 'end' && !m.strong && last.length === 1 && words.length >= 2) {
    const prev = matchTail(words[words.length - 2]);
    if (isConn(prev?.kind)) {
      return { ms: MS_UNFINISHED, reason: 'đuôi "' + prev!.tail + '" chưa hết câu, bỏ qua "' + last + '" (nhiễu?)' };
    }
  }

  if (m?.kind === 'end') return { ms: MS_FINISHED, reason: 'đuôi "' + m.tail + '" — câu đã trọn' };

  // LIEN TU thang moi luat: ve cau dang do thi du truoc do co cau tron cung phai cho.
  // "안녕하세요 만나서 반갑고" -> 4000ms, khong phai 1500ms dao trat tu.
  if (m?.kind === 'conj') return { ms: MS_UNFINISHED, reason: 'liên từ "' + m.tail + '" — vế câu còn dở' };

  // Dao trat tu chi duoc de len luat TRO TU (dung nhu spec: "ưu tiên hơn luật trợ từ").
  const pivot = reorderPivot(words);
  if (pivot) return { ms: MS_REORDER, reason: 'đảo trật tự sau "' + pivot + '"' };

  if (m?.kind === 'part') return { ms: MS_UNFINISHED, reason: 'trợ từ "' + m.tail + '" — câu chưa hết' };
  return { ms: MS_DEFAULT, reason: 'không rõ đuôi "' + last + '"' };
}

function getSilenceMs(text: string): number {
  return decideSilence(text).ms;
}

// Ghep van ban giua cac phien nhan dang, bo khoang trang thua.
function joinText(a: string, b: string): string {
  return [a.trim(), b.trim()].filter(Boolean).join(' ');
}

const SEL: React.CSSProperties = {
  fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bd)',
  background: 'var(--sf2)', color: 'var(--tx)', outline: 'none', cursor: 'pointer',
};
const LAB: React.CSSProperties = {
  fontSize: 10, color: 'var(--t3)', marginBottom: 4, display: 'block',
  textTransform: 'uppercase', letterSpacing: '.06em',
};

function logColor(tag: string): string {
  if (tag === 'FIRE') return 'var(--rd)';
  if (tag === 'CHẶN TRÙNG') return 'var(--am)';
  if (tag === 'submit' || tag === 'thẻ mới' || tag === 'gộp câu') return 'var(--gn)';
  if (tag.startsWith('timer')) return 'var(--am)';
  if (tag === 'onresult') return 'var(--bl)';
  if (tag === 'onerror' || tag === 'restart lỗi') return 'var(--rd)';
  return 'var(--t2)';
}

// Cau bat dau bang dai tu chu ngu hoac lien tu mo cau -> cau moi, khong noi.
function startsNewSentence(text: string): boolean {
  const first = text.trim().split(/\s+/)[0] || '';
  return SUBJECTS.some(s => first.startsWith(s)) || OPENERS.some(o => first.startsWith(o));
}

export default function Home() {
  const [isOn, setIsOn] = useState(false);
  const [buf, setBuf] = useState('');
  const [results, setResults] = useState<RI[]>([]);
  const [active, setActive] = useState(0);
  const [wait, setWait] = useState<{ ms: number; reason: string; until: number } | null>(null);
  const [, forceTick] = useState(0);
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP);
  const [setupOpen, setSetupOpen] = useState(true);
  const [debug, setDebug] = useState(false);   // chi bat khi URL co ?debug=1
  const [logOn, setLogOn] = useState(true);    // thu/mo bang trong che do debug
  const [logLines, setLogLines] = useState<LogLine[]>([]);

  const recogRef = useRef<any>(null);
  const isOnRef = useRef(false);
  const bufRef = useRef('');            // = committed + session, luon la van ban day du
  const committedRef = useRef('');      // van ban tu CAC PHIEN TRUOC (Chrome tu restart)
  const sessionRef = useRef('');        // van ban cua phien nhan dang hien tai
  const idRef = useRef(0);
  const baseIdxRef = useRef(0);
  const lenRef = useRef(0);
  const silenceRef = useRef<any>(null);
  const armTokenRef = useRef(0);        // chan timer cu da bi huy nhung van chay xong
  const historyRef = useRef<string[]>([]);
  const queueRef = useRef<Job[]>([]);
  const activeRef = useRef(0);
  const ctrlRef = useRef<Map<number, AbortController>>(new Map());
  const lastRef = useRef<{ id: number; text: string; at: number; context: string[]; sealed: boolean } | null>(null);
  const setupRef = useRef<Setup>(DEFAULT_SETUP);
  const debugRef = useRef(false);
  const logBoxRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<LogLine[]>([]);
  const logSeqRef = useRef(0);
  const t0Ref = useRef(0);
  const lastSubmitRef = useRef<{ text: string; at: number } | null>(null);
  const fireRef = useRef<(seal?: boolean, reason?: string) => void>(() => {});
  const drainRef = useRef<() => void>(() => {});
  const mkRef = useRef<(() => any) | null>(null);

  useEffect(() => { isOnRef.current = isOn }, [isOn]);
  useEffect(() => { t0Ref.current = Date.now() }, []);

  // Cài đặt buổi học: đọc localStorage sau khi mount (tránh lệch hydrate).
  // Đã có cài đặt cũ thì thu thanh lại luôn, chỉ hiện một dòng tóm tắt.
  useEffect(() => {
    const s = loadSetup();
    if (s) { setSetup(s); setupRef.current = s; setSetupOpen(false) }
  }, []);

  const updateSetup = useCallback((patch: Partial<Setup>) => {
    setSetup(prev => {
      const next = { ...prev, ...patch };
      if (patch.level) next.lesson = Math.min(next.lesson, lessonCount(patch.level));
      setupRef.current = next;
      try { localStorage.setItem(SETUP_KEY, JSON.stringify(next)) } catch (e) {}
      return next;
    });
  }, []);

  // Nhật ký chỉ bật khi mở app với ?debug=1. Đọc trong effect để khớp hydrate.
  useEffect(() => {
    let on = false;
    try { on = new URLSearchParams(window.location.search).get('debug') === '1' } catch (e) {}
    debugRef.current = on;
    setDebug(on);
  }, []);
  useEffect(() => () => { if (silenceRef.current) clearTimeout(silenceRef.current) }, []);

  // Nhật ký hiện thẳng trên màn hình — giáo viên không cần mở F12.
  const addLog = useCallback((tag: string, msg: string) => {
    const line: LogLine = { n: ++logSeqRef.current, t: Date.now() - t0Ref.current, tag, msg };
    console.log('[' + line.t + 'ms][' + tag + '] ' + msg);
    // Không debug thì không giữ dòng nào, cũng không render lại.
    if (!debugRef.current) return;
    logRef.current = logRef.current.concat(line).slice(-LOG_MAX);
    setLogLines(logRef.current);
  }, []);

  const patch = useCallback((id: number, p: Partial<RI>) => {
    setResults(prev => prev.map(r => (r.id === id ? { ...r, ...p } : r)));
  }, []);

  const call = useCallback(async (mode: 'fix' | 'deep', text: string, context: string[], signal: AbortSignal) => {
    const r = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text, mode, context,
        level: setupRef.current.level,
        curriculum: setupRef.current.curriculum,
        lesson: setupRef.current.curriculum === 'xirian' ? setupRef.current.lesson : null,
        topic: setupRef.current.topic,
        register: setupRef.current.register,
      }),
      signal,
    });
    if (!r.ok) {
      let msg = 'Lỗi ' + r.status;
      try { const j = await r.json(); if (j?.error) msg = j.error } catch (e) {}
      throw new Error(msg);
    }
    return r.json();
  }, []);

  // Mỗi câu chạy hai luồng song song; luồng nào về trước điền vào thẻ trước.
  const drain = useCallback(() => {
    while (activeRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const job = queueRef.current.shift()!;
      const ctrl = new AbortController();
      ctrlRef.current.set(job.id, ctrl);
      activeRef.current++; setActive(activeRef.current);
      const fix = call('fix', job.text, job.context, ctrl.signal)
        .then((d: FixData) => patch(job.id, { fix: d, fixLoading: false }))
        .catch((e: any) => { if (e?.name !== 'AbortError') patch(job.id, { fixErr: e.message, fixLoading: false }) });
      const deep = call('deep', job.text, job.context, ctrl.signal)
        .then((d: DeepData) => patch(job.id, { deep: d, deepLoading: false }))
        .catch((e: any) => { if (e?.name !== 'AbortError') patch(job.id, { deepErr: e.message, deepLoading: false }) });
      Promise.all([fix, deep]).then(() => {
        // Chi xoa neu van la controller cua chinh luot nay (tranh xoa nham luot gop moi).
        if (ctrlRef.current.get(job.id) === ctrl) ctrlRef.current.delete(job.id);
        activeRef.current--; setActive(activeRef.current);
        drainRef.current();
      });
    }
  }, [call, patch]);
  drainRef.current = drain;

  const submit = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const now = Date.now();

    // Chốt chặn thẻ trùng: cùng một câu bị submit hai lần thì bỏ lần sau.
    const ls = lastSubmitRef.current;
    if (ls && ls.text === text && now - ls.at < DUP_MS) {
      addLog('CHẶN TRÙNG', 'bỏ qua, y hệt thẻ cách đây ' + (now - ls.at) + 'ms: "' + text + '"');
      return;
    }
    lastSubmitRef.current = { text, at: now };
    addLog('submit', '"' + text + '"');

    const prev = lastRef.current;

    // Gộp câu: học viên ngắt giữa chừng rồi nói tiếp phần đuôi.
    if (prev && !prev.sealed && now - prev.at <= MERGE_MS && !startsNewSentence(text)) {
      const merged = prev.text + ' ' + text;
      ctrlRef.current.get(prev.id)?.abort();          // huỷ fetch đang chạy của thẻ cũ
      queueRef.current = queueRef.current.filter(j => j.id !== prev.id);
      historyRef.current = historyRef.current.slice(0, -1).concat(merged).slice(-10);
      lastRef.current = { ...prev, text: merged, at: now };
      patch(prev.id, {
        text: merged, merged: true,
        fix: undefined, deep: undefined, fixErr: undefined, deepErr: undefined,
        fixLoading: true, deepLoading: true,
      });
      queueRef.current.push({ id: prev.id, text: merged, context: prev.context });
      addLog('gộp câu', 'nối vào thẻ #' + prev.id + ' → "' + merged + '"');
      lastSubmitRef.current = { text: merged, at: now };
      drainRef.current();
      return;
    }

    const id = ++idRef.current;
    const context = historyRef.current.slice(-CONTEXT_SIZE);
    historyRef.current = historyRef.current.concat(text).slice(-10);
    lastRef.current = { id, text, at: now, context, sealed: false };
    setResults(p => [{ id, text, fixLoading: true, deepLoading: true }, ...p]);
    queueRef.current.push({ id, text, context });
    addLog('thẻ mới', '#' + id);
    drainRef.current();
  }, [patch, addLog]);

  // Huy timer dang chay. Tang token de callback cu (neu da vao hang doi) tu bo qua.
  const clearSilence = useCallback(() => {
    if (silenceRef.current) {
      clearTimeout(silenceRef.current); silenceRef.current = null;
      addLog('timer hủy', '');
    }
    armTokenRef.current++;
    setWait(null);
  }, [addLog]);

  // ĐÂY LÀ ĐƯỜNG DUY NHẤT tạo thẻ. Không nơi nào khác được gọi submit().
  // seal = học viên bấm "Xong câu": chốt luôn, câu sau không gộp vào nữa.
  const fire = useCallback((seal?: boolean, reason?: string) => {
    clearSilence();
    const text = bufRef.current;
    if (!text.trim()) { addLog('fire', 'bỏ qua, buffer rỗng (' + (reason || '?') + ')'); return }
    addLog('FIRE', (reason || '?') + ' → "' + text + '"');
    baseIdxRef.current = lenRef.current;
    committedRef.current = ''; sessionRef.current = '';
    bufRef.current = ''; setBuf('');
    submit(text);
    if (seal && lastRef.current) lastRef.current.sealed = true;
  }, [clearSilence, submit, addLog]);
  fireRef.current = fire;

  // Mỗi lần Web Speech trả kết quả mới thì tính lại ngưỡng và đặt lại timer.
  const armSilence = useCallback((text: string) => {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    const token = ++armTokenRef.current;
    const { ms, reason } = decideSilence(text);
    silenceRef.current = setTimeout(() => {
      silenceRef.current = null;
      // Timer cũ đã bị thay bằng timer mới thì không được chốt.
      if (token !== armTokenRef.current) { addLog('timer cũ', 'bỏ qua'); return }
      fireRef.current(false, 'timer ' + ms + 'ms — ' + reason);
    }, ms);
    addLog('timer đặt', ms + 'ms — ' + reason);
    setWait({ ms, reason, until: Date.now() + ms });
  }, [addLog]);

  const mkRecog = useCallback(() => {
    const S = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!S) return null;
    const r = new S();
    r.lang = 'ko-KR'; r.continuous = true; r.interimResults = true;

    // Phiên mới: chỉ reset chỉ số kết quả của phiên, KHÔNG đụng vào buffer.
    r.onstart = () => {
      baseIdxRef.current = 0; lenRef.current = 0; sessionRef.current = '';
      addLog('onstart', 'giữ buffer: "' + committedRef.current + '"');
    };

    r.onresult = (e: any) => {
      lenRef.current = e.results.length;
      // Ghép cả final lẫn interim của phiên này...
      let session = '';
      for (let j = baseIdxRef.current; j < e.results.length; j++) session += e.results[j][0].transcript;
      sessionRef.current = session;
      // ...rồi nối với phần đã nói ở các phiên trước, để ngưỡng đọc trên câu ĐẦY ĐỦ.
      const full = joinText(committedRef.current, session);
      bufRef.current = full; setBuf(full);
      const isFinal = e.results.length > 0 && !!e.results[e.results.length - 1].isFinal;
      const d = decideSilence(full);
      addLog('onresult', 'isFinal=' + isFinal + ' n=' + e.results.length + ' base=' + baseIdxRef.current
        + ' | "' + full + '" → ' + d.ms + 'ms (' + d.reason + ')');
      if (full.trim()) armSilence(full);
    };

    // Chrome tự kết thúc phiên sau vài giây im lặng. Các sự kiện dưới đây
    // TUYỆT ĐỐI không được chốt câu: giữ nguyên buffer và timer đang chạy.
    r.onspeechend = () => addLog('onspeechend', 'không flush');
    r.onaudioend = () => addLog('onaudioend', 'không flush');
    r.onerror = (e: any) => addLog('onerror', (e?.error || '?') + ' — không flush');
    r.onend = () => {
      // Dồn phần vừa nghe được sang committed để phiên sau không ghi đè mất.
      committedRef.current = joinText(committedRef.current, sessionRef.current);
      sessionRef.current = '';
      bufRef.current = committedRef.current;
      addLog('onend', 'không flush, timer ' + (silenceRef.current ? 'vẫn chạy' : 'không có')
        + ', giữ buffer: "' + bufRef.current + '"');
      if (isOnRef.current) setTimeout(() => {
        addLog('restart', 'gọi start()');
        try { r.start() } catch (err: any) { addLog('restart lỗi', err?.message || String(err)) }
      }, 200);
    };
    return r;
  }, [armSilence, addLog]);
  mkRef.current = mkRecog;

  // Nhật ký luôn cuộn xuống dòng mới nhất.
  useEffect(() => {
    const b = logBoxRef.current;
    if (debug && logOn && b) b.scrollTop = b.scrollHeight;
  }, [logLines, logOn, debug]);

  // Đếm ngược cho dòng trạng thái "Chờ Xs".
  useEffect(() => {
    if (!wait) return;
    const h = setInterval(() => forceTick(t => t + 1), 100);
    return () => clearInterval(h);
  }, [wait]);

  const toggleMic = useCallback(() => {
    if (!isOn) {
      if (!recogRef.current && mkRef.current) recogRef.current = mkRef.current();
      if (!recogRef.current) return;
      committedRef.current = ''; sessionRef.current = '';
      try { recogRef.current.start() } catch (e) {}
      setIsOn(true);
    } else {
      // Tắt mic là dừng hẳn, không chốt nốt — học viên bấm "Chấm" nếu muốn.
      clearSilence();
      if (recogRef.current) { try { recogRef.current.onend = null; recogRef.current.stop() } catch (e) {} }
      recogRef.current = null;
      setIsOn(false);
    }
  }, [isOn, clearSilence]);

  const has = !!buf.trim();
  // Bỏ trống "Bài hôm nay" thì lấy luôn tiêu đề + pattern của bài đang học làm gợi ý.
  const lessonNow = setup.curriculum === 'xirian' ? getLesson(setup.level, setup.lesson) : undefined;
  const autoTopic = lessonNow
    ? `Tự động: Bài ${lessonNow.number} — ${lessonNow.title} — ${lessonNow.patterns.map(p => p.form).join(', ')}`
    : '';

  return (<>
    <style jsx global>{':root{--bg:#0f0f11;--sf:#1a1a1e;--sf2:#222228;--bd:rgba(255,255,255,.07);--ac:#7c6cfa;--rd:#f87171;--rb:rgba(248,113,113,.08);--gn:#4ade80;--gb:rgba(74,222,128,.08);--pp:#c084fc;--pb:rgba(192,132,252,.08);--bl:#60a5fa;--bb:rgba(96,165,250,.08);--am:#fbbf24;--tx:#e8e8f0;--t2:#8888a0;--t3:#555568}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Be Vietnam Pro,sans-serif;background:var(--bg);color:var(--tx);min-height:100vh}@keyframes pd{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(248,113,113,.4)}50%{opacity:.7;box-shadow:0 0 0 6px rgba(248,113,113,0)}}@keyframes mp{0%,100%{box-shadow:0 0 0 0 rgba(248,113,113,.2)}50%{box-shadow:0 0 0 12px rgba(248,113,113,0)}}@keyframes si{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}@keyframes sk{0%,100%{opacity:.3}50%{opacity:.75}}'}</style>
    <header style={{padding:'18px 28px',borderBottom:'1px solid var(--bd)',display:'flex',alignItems:'center',justifyContent:'space-between',background:'var(--sf)'}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:8,height:8,borderRadius:'50%',background:isOn?'#f87171':'var(--ac)',animation:isOn?'pd 1.2s infinite':'none'}}/><div><div style={{fontSize:14,fontWeight:600}}>Trợ lý sửa lỗi tiếng Hàn</div><div style={{fontSize:11,color:'var(--t3)'}}>Xirian</div></div></div>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        {debug&&<button onClick={()=>setLogOn(v=>!v)} style={{fontSize:11,padding:'4px 10px',borderRadius:20,border:'1px solid var(--bd)',background:logOn?'var(--pb)':'var(--sf2)',color:logOn?'var(--pp)':'var(--t3)',cursor:'pointer'}}>Nhật ký {logOn?'▾':'▸'}</button>}
        <div style={{fontSize:11,padding:'4px 10px',borderRadius:20,border:isOn?'1px solid rgba(248,113,113,.3)':'1px solid var(--bd)',color:isOn?'#f87171':'var(--t2)',background:isOn?'rgba(248,113,113,.08)':'var(--sf2)'}}>{isOn?'Đang nghe...':'Chưa bắt đầu'}</div>
      </div>
    </header>
    <main style={{flex:1,display:'flex',flexDirection:'column',padding:'24px 28px',gap:20,maxWidth:860,width:'100%',margin:'0 auto'}}>
      <div style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:12,overflow:'hidden'}}>
        {setupOpen
          ?<div style={{padding:'14px 16px',display:'flex',flexWrap:'wrap',gap:14,alignItems:'flex-end'}}>
            <div>
              <label style={LAB}>Lớp</label>
              <select value={setup.level} onChange={e=>updateSetup({level:e.target.value as LevelId})} style={SEL}>
                {LEVEL_ORDER.map(l=><option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
              </select>
            </div>
            <div>
              <label style={LAB}>Giáo trình</label>
              <select value={setup.curriculum} onChange={e=>updateSetup({curriculum:e.target.value as Curriculum})} style={SEL}>
                <option value="xirian">Xirian (서울대)</option>
                <option value="other">Khác</option>
              </select>
            </div>
            {setup.curriculum==='xirian'&&<div>
              <label style={LAB}>Đã học đến bài</label>
              <select value={setup.lesson} onChange={e=>updateSetup({lesson:Number(e.target.value)})} style={SEL}>
                {Array.from({length:lessonCount(setup.level)},(_,i)=>i+1).map(n=><option key={n} value={n}>Bài {n}</option>)}
              </select>
            </div>}
            <div>
              <label style={LAB}>Nói với ai</label>
              <select value={setup.register} onChange={e=>updateSetup({register:e.target.value as Register})} style={SEL}>
                {(['auto','banmal','jondaetmal'] as Register[]).map(r=><option key={r} value={r}>{REGISTER_LABEL[r]}</option>)}
              </select>
            </div>
            <div style={{flex:'1 1 240px',minWidth:190}}>
              <label style={LAB}>Bài hôm nay (tuỳ chọn)</label>
              <input value={setup.topic} onChange={e=>updateSetup({topic:e.target.value})}
                placeholder={autoTopic||'VD: Bài 15 — 여행 — -(으)면, -고 싶다'}
                style={{...SEL,width:'100%',cursor:'text'}}/>
            </div>
            <button onClick={()=>setSetupOpen(false)} style={{...SEL,background:'var(--ac)',color:'#fff',border:'none',fontWeight:600,padding:'8px 18px'}}>Xong</button>
          </div>
          :<button onClick={()=>setSetupOpen(true)} title="Bấm để đổi cài đặt buổi học" style={{width:'100%',textAlign:'left',padding:'11px 16px',background:'transparent',border:'none',color:'var(--t2)',fontSize:12,cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
            <span>⚙️ {setupSummary(setup)}</span>
            <span style={{color:'var(--ac)',flexShrink:0}}>Đổi</span>
          </button>}
      </div>
      <div style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:16,padding:28,display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
        <div style={{display:'flex',alignItems:'center',gap:20}}>
          <button onClick={toggleMic} style={{width:72,height:72,borderRadius:'50%',border:isOn?'1.5px solid #f87171':'1.5px solid var(--bd)',background:isOn?'rgba(248,113,113,.1)':'var(--sf2)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',animation:isOn?'mp 1.5s infinite':'none'}}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={isOn?'#f87171':'var(--t2)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg></button>
          <button onClick={()=>fire(false,'nút Chấm')} disabled={!has} style={{padding:'14px 28px',borderRadius:12,border:'none',background:has?'var(--ac)':'var(--sf2)',color:has?'white':'var(--t3)',fontSize:15,fontWeight:600,cursor:has?'pointer':'default'}}>Chấm</button>
          <button onClick={()=>fire(true,'nút Xong câu')} disabled={!has} title="Gửi ngay và chốt câu, phần nói sau sẽ tính là câu mới" style={{padding:'14px 22px',borderRadius:12,border:has?'1px solid var(--ac)':'1px solid var(--bd)',background:'transparent',color:has?'var(--ac)':'var(--t3)',fontSize:14,fontWeight:600,cursor:has?'pointer':'default'}}>Xong câu</button>
        </div>
        <textarea value={buf} onChange={e=>{
          // Sửa tay: coi như phần đã chốt, và bỏ qua kết quả cũ của phiên hiện tại.
          committedRef.current=e.target.value; sessionRef.current=''; baseIdxRef.current=lenRef.current;
          bufRef.current=e.target.value; setBuf(e.target.value); clearSilence();
        }} placeholder="Bấm mic rồi nói. Ngừng nói là tự chấm — đuôi câu chưa xong thì máy chờ lâu hơn." style={{width:'100%',minHeight:60,textAlign:'center',fontSize:18,fontFamily:'Noto Sans KR,sans-serif',lineHeight:1.6,background:'transparent',border:'1px solid var(--bd)',borderRadius:8,color:'var(--tx)',padding:10,resize:'vertical',outline:'none'}}/>
        {wait
          ?<div style={{fontSize:12,color:'var(--am)',display:'flex',alignItems:'center',gap:8}}>
            <span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:'var(--am)',animation:'pd 1s infinite'}}/>
            Chờ {(Math.max(0,wait.until-Date.now())/1000).toFixed(1)}s / {(wait.ms/1000).toFixed(1)}s — {wait.reason}
          </div>
          :<div style={{fontSize:12,color:'var(--t3)'}}>{isOn?'Đang nghe, chưa đặt hẹn chốt':'Chưa bắt đầu'}</div>}
        <div style={{fontSize:12,color:'var(--t3)'}}>Loopback AG01 + Chrome{active>0?' · đang xử lý '+active+'/'+MAX_CONCURRENT:''}</div>
      </div>
      {debug&&logOn&&<div style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:12,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',borderBottom:'1px solid var(--bd)',background:'var(--sf2)'}}>
          <span style={{fontSize:11,fontWeight:600,color:'var(--t2)',textTransform:'uppercase',letterSpacing:'.08em'}}>Nhật ký · {logLines.length} dòng</span>
          <button onClick={()=>{logRef.current=[];setLogLines([])}} style={{fontSize:11,padding:'3px 10px',borderRadius:6,border:'1px solid var(--bd)',background:'transparent',color:'var(--t2)',cursor:'pointer'}}>Xoá</button>
        </div>
        <div ref={logBoxRef} style={{maxHeight:260,overflowY:'auto',padding:'8px 12px',fontFamily:'ui-monospace,Menlo,Consolas,monospace',fontSize:11,lineHeight:1.7}}>
          {logLines.length===0
            ?<div style={{color:'var(--t3)'}}>Chưa có sự kiện. Bấm mic rồi nói thử.</div>
            :logLines.map(l=>(
              <div key={l.n} style={{whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
                <span style={{color:'var(--t3)'}}>{String(l.t).padStart(6,' ')}ms </span>
                <span style={{color:logColor(l.tag),fontWeight:600}}>{l.tag}</span>
                {l.msg?<span style={{color:'var(--tx)'}}> {l.msg}</span>:null}
              </div>
            ))}
        </div>
      </div>}
      {results.length>0&&<><div style={{fontSize:11,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.08em'}}>Kết quả phân tích</div><div style={{display:'flex',flexDirection:'column',gap:12}}>{results.map(r=>(
        <div key={r.id} style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:12,overflow:'hidden',animation:'si .25s ease'}}>
          <R l="🔴 Gốc" t="orig">
            {r.text}
            {r.merged&&<div style={{fontSize:11,color:'var(--t3)',marginTop:4,fontFamily:'Be Vietnam Pro,sans-serif'}}>Đã nối với câu trước</div>}
          </R>
          <R l="✅ Sửa" t="fix">
            {r.fixLoading?<Sk w="70%"/>:r.fixErr?<E m={r.fixErr}/>:
              (r.fix!.errors&&r.fix!.errors.length>0?r.fix!.corrected:<span className="ok">Câu đúng, không cần sửa</span>)}
          </R>
          <R l="⚠️ Lỗi" t="err" v>
            {r.fixLoading?<Sk w="90%"/>:r.fixErr?<E m={r.fixErr}/>:
              (r.fix!.errors&&r.fix!.errors.length>0
                ?r.fix!.errors.map((e,i)=>(<div key={i} style={{marginBottom:8}}>
                    <span className="wrong">{e.wrong}</span>{' → '}<span className="right">{e.right}</span>
                    <div style={{fontSize:12,color:'var(--t2)',marginTop:2}}>{e.why}</div>
                  </div>))
                :<span className="ok">Không có lỗi</span>)}
          </R>
          <R l="✨ Nâng" t="up">
            {r.deepLoading?<Sk w="80%"/>:r.deepErr?<E m={r.deepErr}/>:
              (r.deep!.upgrades||[]).map((u,i)=>(<div key={i} style={{marginBottom:8}}>
                <div style={{fontSize:14,color:'var(--tx)',fontFamily:'Noto Sans KR,sans-serif'}}>{u.ko}</div>
                <div style={{fontSize:12,color:'var(--t2)',marginTop:2}}>{u.vi}</div>
              </div>))}
          </R>
          <R l="💬 Ví dụ" t="ex">
            {r.deepLoading?<Sk w="75%"/>:r.deepErr?<E m={r.deepErr}/>:
              (r.deep!.examples||[]).map((x,i)=>(<div key={i} style={{marginBottom:8}}>
                <div style={{fontSize:14,color:'var(--tx)',fontFamily:'Noto Sans KR,sans-serif'}}>{x.ko}</div>
                <div style={{fontSize:12,color:'var(--t2)',marginTop:2}}>{x.vi}</div>
              </div>))}
          </R>
          <R l="📝 Ghi chú" t="note" v>
            {r.deepLoading?<Sk w="95%"/>:r.deepErr?<E m={r.deepErr}/>:r.deep!.note}
          </R>
        </div>
      ))}</div></>}
    </main>
    <style jsx>{'.wrong{display:inline;background:rgba(248,113,113,.15);color:var(--rd);border-radius:3px;padding:1px 5px;font-size:13px}.right{display:inline;background:rgba(74,222,128,.12);color:var(--gn);border-radius:3px;padding:1px 5px;font-size:13px}.ok{display:inline-block;background:var(--gb);color:var(--gn);font-size:12px;padding:2px 10px;border-radius:20px;border:1px solid rgba(74,222,128,.2)}'}</style>
  </>);
}

function Sk({ w }: { w: string }) {
  return <div style={{display:'flex',flexDirection:'column',gap:6}}>
    <div style={{height:11,width:w,borderRadius:4,background:'var(--sf2)',animation:'sk 1.1s ease-in-out infinite'}}/>
    <div style={{height:11,width:'45%',borderRadius:4,background:'var(--sf2)',animation:'sk 1.1s ease-in-out .2s infinite'}}/>
  </div>;
}

function E({ m }: { m: string }) {
  return <span style={{fontSize:12,color:'var(--rd)'}}>Lỗi: {m}</span>;
}

function R({ l, t, v, children }: { l: string; t: string; v?: boolean; children: React.ReactNode }) {
  const c: { [k: string]: { c: string; b: string } } = {
    orig:{c:'var(--rd)',b:'var(--rb)'},
    fix:{c:'var(--gn)',b:'var(--gb)'},
    err:{c:'var(--am)',b:'rgba(251,191,36,.06)'},
    up:{c:'var(--pp)',b:'var(--pb)'},
    ex:{c:'var(--bl)',b:'var(--bb)'},
    note:{c:'var(--t2)',b:'var(--sf2)'},
  };
  const s = c[t] || { c:'var(--t2)', b:'var(--sf2)' };
  return <div style={{display:'flex',borderBottom:'1px solid var(--bd)'}}>
    <div style={{width:88,flexShrink:0,padding:'12px 14px',fontSize:11,fontWeight:600,display:'flex',alignItems:'flex-start',gap:5,borderRight:'1px solid var(--bd)',color:s.c,background:s.b}}>{l}</div>
    <div style={{flex:1,padding:'12px 16px',fontSize:14,lineHeight:1.7,fontFamily:v?'Be Vietnam Pro,sans-serif':'Noto Sans KR,sans-serif'}}>{children}</div>
  </div>;
}
