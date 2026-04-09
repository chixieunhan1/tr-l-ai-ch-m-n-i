'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
interface AE { wrong: string; right: string; reason: string }
interface Up { ko: string; vi: string }
interface AR { original: string; isCorrect: boolean; corrected: string; errors: AE[]; upgrades: Up[]; note: string }
interface RI { id: number; text: string; loading: boolean; data?: AR; error?: string }
export default function Home() {
  const [isOn, setIsOn] = useState(false);
  const [buf, setBuf] = useState('');
  const [results, setResults] = useState<RI[]>([]);
  const [busy, setBusy] = useState(false);
  const recogRef = useRef<any>(null);
  const isOnRef = useRef(false);
  const bufRef = useRef('');
  const busyRef = useRef(false);
  const idRef = useRef(0);
  const initRef = useRef<(()=>any)|null>(null);
  useEffect(() => { isOnRef.current = isOn }, [isOn]);
  const analyze = useCallback(async (text: string) => {
    if (busyRef.current || !text.trim()) return;
    busyRef.current = true; setBusy(true);
    const id = ++idRef.current;
    setResults(p => [{ id, text, loading: true }, ...p]);
    try {
      const r = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (!r.ok) throw new Error('Server error: ' + r.status);
      const d: AR = await r.json();
      setResults(p => p.map(x => x.id === id ? { ...x, loading: false, data: d } : x));
    } catch (e: any) {
      setResults(p => p.map(x => x.id === id ? { ...x, loading: false, error: e.message } : x));
    }
    busyRef.current = false; setBusy(false);
  }, []);
  const grade = useCallback(() => {
    const t = bufRef.current.trim();
    if (t && !busyRef.current) {
      bufRef.current = ''; setBuf('');
      if (recogRef.current) { try { recogRef.current.onend = null; recogRef.current.stop() } catch(e){} }
      recogRef.current = null;
      setTimeout(() => { if (isOnRef.current && initRef.current) { recogRef.current = initRef.current(); if (recogRef.current) try { recogRef.current.start() } catch(e){} } }, 300);
      analyze(t);
    }
  }, [analyze]);
  const mkRecog = useCallback(() => {
    const S = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!S) return null;
    const r = new S(); r.lang = 'ko-KR'; r.continuous = true; r.interimResults = true;
    r.onresult = (e: any) => { let f='',i=''; for(let j=0;j<e.results.length;j++){if(e.results[j].isFinal)f+=e.results[j][0].transcript;else i+=e.results[j][0].transcript} bufRef.current=f+i; setBuf(f+i) };
    r.onerror = () => {};
    r.onend = () => { if (isOnRef.current) setTimeout(() => { try{r.start()}catch(e){} }, 300) };
    return r;
  }, []);
  initRef.current = mkRecog;
  const toggleMic = useCallback(() => {
    if (!isOn) { if(!recogRef.current)recogRef.current=mkRecog(); if(!recogRef.current)return; try{recogRef.current.start()}catch(e){} setIsOn(true) }
    else { if(recogRef.current){try{recogRef.current.onend=null;recogRef.current.stop()}catch(e){}} recogRef.current=null; setIsOn(false) }
  }, [isOn, mkRecog]);
  const hl = (c: string, errs: AE[]) => { let s=c; errs.forEach(e=>{s=s.replace(e.right,'<span class="gc">'+e.right+'</span>')}); return s };
  const has = !!buf.trim();
  return (<>
    <style jsx global>{':root{--bg:#0f0f11;--sf:#1a1a1e;--sf2:#222228;--bd:rgba(255,255,255,.07);--ac:#7c6cfa;--rd:#f87171;--rb:rgba(248,113,113,.08);--gn:#4ade80;--gb:rgba(74,222,128,.08);--pp:#c084fc;--pb:rgba(192,132,252,.08);--bl:#60a5fa;--bb:rgba(96,165,250,.08);--am:#fbbf24;--tx:#e8e8f0;--t2:#8888a0;--t3:#555568}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Be Vietnam Pro,sans-serif;background:var(--bg);color:var(--tx);min-height:100vh}@keyframes pd{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(248,113,113,.4)}50%{opacity:.7;box-shadow:0 0 0 6px rgba(248,113,113,0)}}@keyframes mp{0%,100%{box-shadow:0 0 0 0 rgba(248,113,113,.2)}50%{box-shadow:0 0 0 12px rgba(248,113,113,0)}}@keyframes sp{to{transform:rotate(360deg)}}@keyframes si{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}'}</style>
    <header style={{padding:'18px 28px',borderBottom:'1px solid var(--bd)',display:'flex',alignItems:'center',justifyContent:'space-between',background:'var(--sf)'}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:8,height:8,borderRadius:'50%',background:isOn?'#f87171':'var(--ac)',animation:isOn?'pd 1.2s infinite':'none'}}/><div><div style={{fontSize:14,fontWeight:600}}>Trợ lý sửa lỗi tiếng Hàn</div><div style={{fontSize:11,color:'var(--t3)'}}>Xirian</div></div></div>
      <div style={{fontSize:11,padding:'4px 10px',borderRadius:20,border:isOn?'1px solid rgba(248,113,113,.3)':'1px solid var(--bd)',color:isOn?'#f87171':'var(--t2)',background:isOn?'rgba(248,113,113,.08)':'var(--sf2)'}}>{isOn?'Đang nghe...':'Chưa bắt đầu'}</div>
    </header>
    <main style={{flex:1,display:'flex',flexDirection:'column',padding:'24px 28px',gap:20,maxWidth:860,width:'100%',margin:'0 auto'}}>
      <div style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:16,padding:28,display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
        <div style={{display:'flex',alignItems:'center',gap:20}}>
          <button onClick={toggleMic} style={{width:72,height:72,borderRadius:'50%',border:isOn?'1.5px solid #f87171':'1.5px solid var(--bd)',background:isOn?'rgba(248,113,113,.1)':'var(--sf2)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',animation:isOn?'mp 1.5s infinite':'none'}}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={isOn?'#f87171':'var(--t2)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg></button>
          <button onClick={grade} disabled={!has||busy} style={{padding:'14px 28px',borderRadius:12,border:'none',background:has&&!busy?'var(--ac)':'var(--sf2)',color:has&&!busy?'white':'var(--t3)',fontSize:15,fontWeight:600,cursor:has&&!busy?'pointer':'default'}}>{busy?'Đang chấm...':'Chấm'}</button>
        </div>
        <textarea value={buf} onChange={e=>{bufRef.current=e.target.value;setBuf(e.target.value);if(!e.target.value.trim()&&recogRef.current&&isOnRef.current){try{recogRef.current.onend=null;recogRef.current.stop()}catch(x){}recogRef.current=null;setTimeout(()=>{if(isOnRef.current&&initRef.current){recogRef.current=initRef.current();if(recogRef.current)try{recogRef.current.start()}catch(x){}}},300)}}} placeholder="Bấm mic, nghe tiếng Hàn, sửa nếu cần, bấm Chấm" style={{width:'100%',minHeight:60,textAlign:'center',fontSize:18,fontFamily:'Noto Sans KR,sans-serif',lineHeight:1.6,background:'transparent',border:'1px solid var(--bd)',borderRadius:8,color:'var(--tx)',padding:10,resize:'vertical',outline:'none'}}/>
        <div style={{fontSize:12,color:'var(--t3)'}}>Loopback AG01 + Chrome</div>
      </div>
      {results.length>0&&<><div style={{fontSize:11,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.08em'}}>Kết quả phân tích</div><div style={{display:'flex',flexDirection:'column',gap:12}}>{results.map(r=>{
        if(r.loading)return <div key={r.id} style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:12,padding:'16px 20px',fontSize:13,color:'var(--t3)',display:'flex',alignItems:'center',gap:10}}><div style={{width:14,height:14,borderRadius:'50%',border:'2px solid var(--bd)',borderTopColor:'var(--ac)',animation:'sp .7s linear infinite'}}/><span>Đang phân tích: <em style={{color:'var(--tx)'}}>{r.text}</em></span></div>;
        if(r.error)return <div key={r.id} style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:12,padding:'16px 20px',fontSize:13,color:'var(--rd)'}}>Lỗi: {r.error}</div>;
        const d=r.data!;const er=d.errors&&d.errors.length>0?d.errors.map((e,i)=><div key={i} style={{marginBottom:8}}><span className="ec">{e.wrong}</span>{' → '}<span className="gc">{e.right}</span><div style={{fontSize:12,color:'var(--t2)',marginTop:2}}>{e.reason}</div></div>):<span className="ok">Câu đúng!</span>;
        const fc=d.isCorrect?<span className="ok">Không cần sửa</span>:<span dangerouslySetInnerHTML={{__html:hl(d.corrected,d.errors)}}/>;
        return <div key={r.id} style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:12,overflow:'hidden',animation:'si .25s ease'}}><R l="🔴 Gốc" t="orig">{d.original}</R><R l="✅ Sửa" t="fix">{fc}</R><R l="⚠️ Lỗi" t="err" v>{er}</R><R l="✨ Nâng" t="up"<R l="✨ Nâng" t="up" la>{(d.upgrades||[]).map((u,i)=><div key={i} style={{marginBottom:8}}><div style={{fontSize:14,color:'var(--tx)',fontFamily:'Noto Sans KR,sans-serif'}}>{u.ko}</div><div style={{fontSize:12,color:'var(--t2)',marginTop:2}}>{u.vi}</div></div>)}</R></div>
      })}</div></>}
    </main>
    <style jsx>{'.ec{display:inline;background:rgba(248,113,113,.15);color:var(--rd);border-radius:3px;padding:1px 5px;font-size:13px}.gc{display:inline;background:rgba(74,222,128,.12);color:var(--gn);border-radius:3px;padding:1px 5px;font-size:13px}.ok{display:inline-block;background:var(--gb);color:var(--gn);font-size:12px;padding:2px 10px;border-radius:20px;border:1px solid rgba(74,222,128,.2)}'}</style>
  </>);
}
function R({l,t,v,la,children}:{l:string;t:string;v?:boolean;la?:boolean;children:React.ReactNode}){const c:{[k:string]:{c:string;b:string}}={orig:{c:'var(--rd)',b:'var(--rb)'},fix:{c:'var(--gn)',b:'var(--gb)'},err:{c:'var(--am)',b:'rgba(251,191,36,.06)'},up:{c:'var(--pp)',b:'var(--pb)'},note:{c:'var(--bl)',b:'var(--bb)'}};const s=c[t]||c.note;return <div style={{display:'flex',borderBottom:la?'none':'1px solid var(--bd)'}}><div style={{width:80,flexShrink:0,padding:'12px 14px',fontSize:11,fontWeight:600,display:'flex',alignItems:'flex-start',gap:5,borderRight:'1px solid var(--bd)',color:s.c,background:s.b}}>{l}</div><div style={{flex:1,padding:'12px 16px',fontSize:14,lineHeight:1.7,fontFamily:v?'Be Vietnam Pro,sans-serif':'Noto Sans KR,sans-serif'}}>{children}</div></div>}
