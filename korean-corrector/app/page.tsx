'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

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

const MAX_CONCURRENT = 2;
const CONTEXT_SIZE = 3;
const MERGE_MS = 3000;

// Nguong im lang theo duoi cau tieng Han.
const MS_UNFINISHED = 4000; // con dang noi do, cho lau
const MS_FINISHED = 1200;   // cau da tron, chot nhanh
const MS_REORDER = 1500;    // dao trat tu, phan duoi ngan
const MS_DEFAULT = 2000;

// Lien tu noi ve / tro tu -> cau chua het
const CONN_TAIL = ['고','서','는데','은데','니까','면','지만','거나','려고','면서','다가','는지',
  '이','가','은','는','을','를','에','에서','로','으로','도','만','와','과','하고','랑','이랑',
  '의','부터','까지','처럼','보다','한테','에게','께'];
// Cap [phu am cuoi, phan con lai] cho duoi viet bang jamo: ㄴ데
const CONN_JONG: [string, string][] = [['ㄴ', '데']];

// Duoi cau hoan chinh
const END_TAIL = ['요','습니다','습니까','죠','네요','군요','거든요','잖아요','을까요','을게요',
  '세요','어','아','지','야','니','냐','자','구나','네'];
// ㅂ니다, ㄹ까요, ㄹ게요
const END_JONG: [string, string][] = [['ㅂ', '니다'], ['ㄹ', '까요'], ['ㄹ', '게요']];
// Duoi mot am tiet de trung voi danh tu thuong (한국어, 편지, 모자, 어머니...).
// Van tinh la het cau khi o cuoi, nhung khong dung de bat luat dao trat tu.
const WEAK_END = ['어','아','지','야','니','냐','자','네'];

// Lien tu mo cau: bao hieu cau moi, khong duoc noi vao cau truoc
const OPENERS = ['그리고','그래서','그런데','근데','그러니까','하지만','그럼','또'];
// Dai tu chu ngu: cung bao hieu cau moi
const SUBJECTS = ['저는','나는','제가','내가','우리'];

const JONGSEONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ',
  'ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

// Phu am cuoi (batchim) cua mot am tiet Han
function jong(ch: string): string {
  const c = (ch || '').charCodeAt(0) - 0xac00;
  if (isNaN(c) || c < 0 || c > 11171) return '';
  return JONGSEONG[c % 28];
}

type Kind = 'end' | 'conn';
interface Rule { tail: string; jong: string; kind: Kind; strong: boolean; w: number }

const endRule = (tail: string, j: string): Rule => ({
  tail, jong: j, kind: 'end', strong: !WEAK_END.includes(tail), w: tail.length + (j ? 1 : 0),
});
const connRule = (tail: string, j: string): Rule => ({
  tail, jong: j, kind: 'conn', strong: false, w: tail.length + (j ? 1 : 0),
});

// Gop mot bang, sap theo do dai giam dan de duoi dai khop truoc duoi ngan
// (vd 는데요 an ra duoi hoan chinh 요, khong phai lien tu 는데).
const RULES: Rule[] = [
  ...END_TAIL.map(t => endRule(t, '')),
  ...END_JONG.map(([j, t]) => endRule(t, j)),
  ...CONN_TAIL.map(t => connRule(t, '')),
  ...CONN_JONG.map(([j, t]) => connRule(t, j)),
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

// Dao trat tu: duoi hoan chinh nam giua cau, phan sau chi 1-3 tu
// va khong bat dau bang lien tu mo cau. Chi nhan duoi ro rang (strong),
// neu khong danh tu nhu 한국어 se bi hieu nham la het cau.
function isReordered(words: string[]): boolean {
  const n = words.length;
  for (let i = n - 2; i >= Math.max(0, n - 4); i--) {
    const m = matchTail(words[i]);
    if (!m || m.kind !== 'end' || !m.strong) continue;
    if (OPENERS.some(o => words[i + 1].startsWith(o))) continue;
    return true;
  }
  return false;
}

function getSilenceMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return MS_DEFAULT;
  const m = matchTail(words[words.length - 1]);
  if (m?.kind === 'end') return MS_FINISHED;
  if (isReordered(words)) return MS_REORDER; // uu tien hon luat tro tu 4000ms
  if (m?.kind === 'conn') return MS_UNFINISHED;
  return MS_DEFAULT;
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

  const recogRef = useRef<any>(null);
  const isOnRef = useRef(false);
  const bufRef = useRef('');
  const idRef = useRef(0);
  const baseIdxRef = useRef(0);
  const lenRef = useRef(0);
  const silenceRef = useRef<any>(null);
  const historyRef = useRef<string[]>([]);
  const queueRef = useRef<Job[]>([]);
  const activeRef = useRef(0);
  const ctrlRef = useRef<Map<number, AbortController>>(new Map());
  const lastRef = useRef<{ id: number; text: string; at: number; context: string[]; sealed: boolean } | null>(null);
  const fireRef = useRef<() => void>(() => {});
  const drainRef = useRef<() => void>(() => {});
  const mkRef = useRef<(() => any) | null>(null);

  useEffect(() => { isOnRef.current = isOn }, [isOn]);
  useEffect(() => () => { if (silenceRef.current) clearTimeout(silenceRef.current) }, []);

  const patch = useCallback((id: number, p: Partial<RI>) => {
    setResults(prev => prev.map(r => (r.id === id ? { ...r, ...p } : r)));
  }, []);

  const call = useCallback(async (mode: 'fix' | 'deep', text: string, context: string[], signal: AbortSignal) => {
    const r = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, mode, context }),
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
      drainRef.current();
      return;
    }

    const id = ++idRef.current;
    const context = historyRef.current.slice(-CONTEXT_SIZE);
    historyRef.current = historyRef.current.concat(text).slice(-10);
    lastRef.current = { id, text, at: now, context, sealed: false };
    setResults(p => [{ id, text, fixLoading: true, deepLoading: true }, ...p]);
    queueRef.current.push({ id, text, context });
    drainRef.current();
  }, [patch]);

  const clearSilence = useCallback(() => {
    if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null }
  }, []);

  // seal = học viên bấm "Xong câu": chốt luôn, câu sau không gộp vào nữa.
  const fire = useCallback((seal?: boolean) => {
    clearSilence();
    const text = bufRef.current;
    if (!text.trim()) return;
    baseIdxRef.current = lenRef.current;
    bufRef.current = ''; setBuf('');
    submit(text);
    if (seal && lastRef.current) lastRef.current.sealed = true;
  }, [clearSilence, submit]);
  fireRef.current = fire;

  // Mỗi lần Web Speech trả kết quả mới thì tính lại ngưỡng và đặt lại timer.
  const armSilence = useCallback((text: string) => {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    silenceRef.current = setTimeout(() => { silenceRef.current = null; fireRef.current() }, getSilenceMs(text));
  }, []);

  const mkRecog = useCallback(() => {
    const S = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!S) return null;
    const r = new S();
    r.lang = 'ko-KR'; r.continuous = true; r.interimResults = true;
    r.onstart = () => { baseIdxRef.current = 0; lenRef.current = 0 };
    r.onresult = (e: any) => {
      lenRef.current = e.results.length;
      let txt = '';
      for (let j = baseIdxRef.current; j < e.results.length; j++) txt += e.results[j][0].transcript;
      bufRef.current = txt; setBuf(txt);
      if (txt.trim()) armSilence(txt);
    };
    r.onerror = () => {};
    r.onend = () => { if (isOnRef.current) setTimeout(() => { try { r.start() } catch (e) {} }, 200) };
    return r;
  }, [armSilence]);
  mkRef.current = mkRecog;

  const toggleMic = useCallback(() => {
    if (!isOn) {
      if (!recogRef.current && mkRef.current) recogRef.current = mkRef.current();
      if (!recogRef.current) return;
      try { recogRef.current.start() } catch (e) {}
      setIsOn(true);
    } else {
      clearSilence();
      if (recogRef.current) { try { recogRef.current.onend = null; recogRef.current.stop() } catch (e) {} }
      recogRef.current = null;
      setIsOn(false);
    }
  }, [isOn, clearSilence]);

  const has = !!buf.trim();

  return (<>
    <style jsx global>{':root{--bg:#0f0f11;--sf:#1a1a1e;--sf2:#222228;--bd:rgba(255,255,255,.07);--ac:#7c6cfa;--rd:#f87171;--rb:rgba(248,113,113,.08);--gn:#4ade80;--gb:rgba(74,222,128,.08);--pp:#c084fc;--pb:rgba(192,132,252,.08);--bl:#60a5fa;--bb:rgba(96,165,250,.08);--am:#fbbf24;--tx:#e8e8f0;--t2:#8888a0;--t3:#555568}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Be Vietnam Pro,sans-serif;background:var(--bg);color:var(--tx);min-height:100vh}@keyframes pd{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(248,113,113,.4)}50%{opacity:.7;box-shadow:0 0 0 6px rgba(248,113,113,0)}}@keyframes mp{0%,100%{box-shadow:0 0 0 0 rgba(248,113,113,.2)}50%{box-shadow:0 0 0 12px rgba(248,113,113,0)}}@keyframes si{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}@keyframes sk{0%,100%{opacity:.3}50%{opacity:.75}}'}</style>
    <header style={{padding:'18px 28px',borderBottom:'1px solid var(--bd)',display:'flex',alignItems:'center',justifyContent:'space-between',background:'var(--sf)'}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:8,height:8,borderRadius:'50%',background:isOn?'#f87171':'var(--ac)',animation:isOn?'pd 1.2s infinite':'none'}}/><div><div style={{fontSize:14,fontWeight:600}}>Trợ lý sửa lỗi tiếng Hàn</div><div style={{fontSize:11,color:'var(--t3)'}}>Xirian</div></div></div>
      <div style={{fontSize:11,padding:'4px 10px',borderRadius:20,border:isOn?'1px solid rgba(248,113,113,.3)':'1px solid var(--bd)',color:isOn?'#f87171':'var(--t2)',background:isOn?'rgba(248,113,113,.08)':'var(--sf2)'}}>{isOn?'Đang nghe...':'Chưa bắt đầu'}</div>
    </header>
    <main style={{flex:1,display:'flex',flexDirection:'column',padding:'24px 28px',gap:20,maxWidth:860,width:'100%',margin:'0 auto'}}>
      <div style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:16,padding:28,display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
        <div style={{display:'flex',alignItems:'center',gap:20}}>
          <button onClick={toggleMic} style={{width:72,height:72,borderRadius:'50%',border:isOn?'1.5px solid #f87171':'1.5px solid var(--bd)',background:isOn?'rgba(248,113,113,.1)':'var(--sf2)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',animation:isOn?'mp 1.5s infinite':'none'}}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={isOn?'#f87171':'var(--t2)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg></button>
          <button onClick={()=>fire()} disabled={!has} style={{padding:'14px 28px',borderRadius:12,border:'none',background:has?'var(--ac)':'var(--sf2)',color:has?'white':'var(--t3)',fontSize:15,fontWeight:600,cursor:has?'pointer':'default'}}>Chấm</button>
          <button onClick={()=>fire(true)} disabled={!has} title="Gửi ngay và chốt câu, phần nói sau sẽ tính là câu mới" style={{padding:'14px 22px',borderRadius:12,border:has?'1px solid var(--ac)':'1px solid var(--bd)',background:'transparent',color:has?'var(--ac)':'var(--t3)',fontSize:14,fontWeight:600,cursor:has?'pointer':'default'}}>Xong câu</button>
        </div>
        <textarea value={buf} onChange={e=>{bufRef.current=e.target.value;setBuf(e.target.value);clearSilence()}} placeholder="Bấm mic rồi nói. Ngừng nói là tự chấm — đuôi câu chưa xong thì máy chờ lâu hơn." style={{width:'100%',minHeight:60,textAlign:'center',fontSize:18,fontFamily:'Noto Sans KR,sans-serif',lineHeight:1.6,background:'transparent',border:'1px solid var(--bd)',borderRadius:8,color:'var(--tx)',padding:10,resize:'vertical',outline:'none'}}/>
        <div style={{fontSize:12,color:'var(--t3)'}}>Loopback AG01 + Chrome{active>0?' · đang xử lý '+active+'/'+MAX_CONCURRENT:''}</div>
      </div>
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
