'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

interface AE { wrong: string; right: string; why: string }
interface KV { ko: string; vi: string }
interface FixData { corrected: string; errors: AE[] }
interface DeepData { upgrades: KV[]; examples: KV[]; note: string }
interface RI {
  id: number;
  text: string;
  fix?: FixData;
  deep?: DeepData;
  fixErr?: string;
  deepErr?: string;
  fixLoading: boolean;
  deepLoading: boolean;
}
interface Job { id: number; text: string; context: string[] }

const SILENCE_MS = 1200;
const MAX_CONCURRENT = 2;
const CONTEXT_SIZE = 3;

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
  const fireRef = useRef<() => void>(() => {});
  const drainRef = useRef<() => void>(() => {});
  const mkRef = useRef<(() => any) | null>(null);

  useEffect(() => { isOnRef.current = isOn }, [isOn]);
  useEffect(() => () => { if (silenceRef.current) clearTimeout(silenceRef.current) }, []);

  const patch = useCallback((id: number, p: Partial<RI>) => {
    setResults(prev => prev.map(r => (r.id === id ? { ...r, ...p } : r)));
  }, []);

  const call = useCallback(async (mode: 'fix' | 'deep', text: string, context: string[]) => {
    const r = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, mode, context }),
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
      activeRef.current++; setActive(activeRef.current);
      const fix = call('fix', job.text, job.context)
        .then((d: FixData) => patch(job.id, { fix: d, fixLoading: false }))
        .catch((e: any) => patch(job.id, { fixErr: e.message, fixLoading: false }));
      const deep = call('deep', job.text, job.context)
        .then((d: DeepData) => patch(job.id, { deep: d, deepLoading: false }))
        .catch((e: any) => patch(job.id, { deepErr: e.message, deepLoading: false }));
      Promise.all([fix, deep]).then(() => {
        activeRef.current--; setActive(activeRef.current);
        drainRef.current();
      });
    }
  }, [call, patch]);
  drainRef.current = drain;

  const submit = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const id = ++idRef.current;
    const context = historyRef.current.slice(-CONTEXT_SIZE);
    historyRef.current = historyRef.current.concat(text).slice(-10);
    setResults(p => [{ id, text, fixLoading: true, deepLoading: true }, ...p]);
    queueRef.current.push({ id, text, context });
    drainRef.current();
  }, []);

  const clearSilence = useCallback(() => {
    if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null }
  }, []);

  const fire = useCallback(() => {
    clearSilence();
    const text = bufRef.current;
    baseIdxRef.current = lenRef.current;
    bufRef.current = ''; setBuf('');
    submit(text);
  }, [clearSilence, submit]);
  fireRef.current = fire;

  const armSilence = useCallback(() => {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    silenceRef.current = setTimeout(() => { silenceRef.current = null; fireRef.current() }, SILENCE_MS);
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
      if (txt.trim()) armSilence();
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
          <button onClick={fire} disabled={!has} style={{padding:'14px 28px',borderRadius:12,border:'none',background:has?'var(--ac)':'var(--sf2)',color:has?'white':'var(--t3)',fontSize:15,fontWeight:600,cursor:has?'pointer':'default'}}>Chấm</button>
        </div>
        <textarea value={buf} onChange={e=>{bufRef.current=e.target.value;setBuf(e.target.value);clearSilence()}} placeholder="Bấm mic rồi nói. Ngừng 1,2 giây là tự chấm." style={{width:'100%',minHeight:60,textAlign:'center',fontSize:18,fontFamily:'Noto Sans KR,sans-serif',lineHeight:1.6,background:'transparent',border:'1px solid var(--bd)',borderRadius:8,color:'var(--tx)',padding:10,resize:'vertical',outline:'none'}}/>
        <div style={{fontSize:12,color:'var(--t3)'}}>Loopback AG01 + Chrome{active>0?' · đang xử lý '+active+'/'+MAX_CONCURRENT:''}</div>
      </div>
      {results.length>0&&<><div style={{fontSize:11,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.08em'}}>Kết quả phân tích</div><div style={{display:'flex',flexDirection:'column',gap:12}}>{results.map(r=>(
        <div key={r.id} style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:12,overflow:'hidden',animation:'si .25s ease'}}>
          <R l="🔴 Gốc" t="orig">{r.text}</R>
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
