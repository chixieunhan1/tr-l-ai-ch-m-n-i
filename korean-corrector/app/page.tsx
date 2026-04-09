'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface AnalysisError { wrong: string; right: string; reason: string; }
interface Upgrade { ko: string; vi: string; }
interface AnalysisResult { original: string; isCorrect: boolean; corrected: string; errors: AnalysisError[]; upgrades: Upgrade[]; note: string; }
interface ResultItem { id: number; text: string; loading: boolean; data?: AnalysisResult; error?: string; }

export default function Home() {
  const [isOn, setIsOn] = useState(false);
  const [finalBuf, setFinalBuf] = useState('');
  const [interimBuf, setInterimBuf] = useState('');
  const [results, setResults] = useState<ResultItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const recogRef = useRef<any>(null);
  const isOnRef = useRef(false);
  const finalRef = useRef('');
  const interimRef = useRef('');
  const analyzingRef = useRef(false);
  const idRef = useRef(0);
  const initRecogRef = useRef<(() => any) | null>(null);

  useEffect(() => { isOnRef.current = isOn; }, [isOn]);

  const analyze = useCallback(async (text: string) => {
    if (analyzingRef.current || !text.trim()) return;
    analyzingRef.current = true;
    setIsAnalyzing(true);
    const id = ++idRef.current;
    setResults((prev) => [{ id, text, loading: true }, ...prev]);
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data: AnalysisResult = await res.json();
      setResults((prev) => prev.map((r) => (r.id === id ? { ...r, loading: false, data } : r)));
    } catch (e: any) {
      setResults((prev) => prev.map((r) => r.id === id ? { ...r, loading: false, error: e.message || 'Lỗi kết nối' } : r));
    }
    finalRef.current = ''; interimRef.current = ''; setFinalBuf(''); setInterimBuf('');
    analyzingRef.current = false; setIsAnalyzing(false);
    if (isOnRef.current) {
      if (recogRef.current) { try { recogRef.current.onend = null; recogRef.current.stop(); } catch (e) {} }
      recogRef.current = null;
      setTimeout(() => {
        if (isOnRef.current && initRecogRef.current) {
          recogRef.current = initRecogRef.current();
          if (recogRef.current) { try { recogRef.current.start(); } catch (e) {} }
        }
      }, 300);
    }
  }, []);

  const handleGrade = useCallback(() => {
    const full = (finalRef.current + interimRef.current).trim();
    if (full && !analyzingRef.current) analyze(full);
  }, [analyze]);

  const initRecog = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR(); r.lang = 'ko-KR'; r.continuous = true; r.interimResults = true;
    r.onresult = (e: any) => {
      let f = '', i = '';
      for (let j = 0; j < e.results.length; j++) { if (e.results[j].isFinal) f += e.results[j][0].transcript; else i += e.results[j][0].transcript; }
      finalRef.current = f; interimRef.current = i; setFinalBuf(f); setInterimBuf(i);
    };
    r.onerror = (e: any) => { if (e.error === 'no-speech') return; };
    r.onend = () => { if (isOnRef.current) { setTimeout(() => { try { r.start(); } catch (e) {} }, 300); } };
    return r;
  }, []);

  initRecogRef.current = initRecog;

  const toggleMic = useCallback(() => {
    if (!isOn) {
      if (!recogRef.current) recogRef.current = initRecog();
      if (!recogRef.current) return;
      try { recogRef.current.start(); } catch (e) {}
      setIsOn(true);
    } else {
      if (recogRef.current) { try { recogRef.current.onend = null; recogRef.current.stop(); } catch (e) {} }
      recogRef.current = null; setIsOn(false);
    }
  }, [isOn, initRecog]);

  const highlight = (corrected: string, errors: AnalysisError[]) => {
    let s = corrected;
    errors.forEach((e) => { s = s.replace(e.right, `<span class="fix-chip">${e.right}</span>`); });
    return s;
  };

  const hasText = !!(finalBuf.trim() || interimBuf.trim());

  return (
    <>
      <style jsx global>{`
        :root { --bg:#0f0f11;--surface:#1a1a1e;--surface2:#222228;--border:rgba(255,255,255,0.07);--accent:#7c6cfa;--red:#f87171;--red-bg:rgba(248,113,113,0.08);--green:#4ade80;--green-bg:rgba(74,222,128,0.08);--purple:#c084fc;--purple-bg:rgba(192,132,252,0.08);--blue:#60a5fa;--blue-bg:rgba(96,165,250,0.08);--amber:#fbbf24;--text:#e8e8f0;--text2:#8888a0;--text3:#555568; }
        * { box-sizing:border-box;margin:0;padding:0; }
        body { font-family:'Be Vietnam Pro',sans-serif;background:var(--bg);color:var(--text);min-height:100vh; }
        @keyframes pulse-dot { 0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(248,113,113,0.4)} 50%{opacity:0.7;box-shadow:0 0 0 6px rgba(248,113,113,0)} }
        @keyframes mic-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(248,113,113,0.2)} 50%{box-shadow:0 0 0 12px rgba(248,113,113,0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes slide-in { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      <header style={{padding:'18px 28px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',background:'var(--surface)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:8,height:8,borderRadius:'50%',background:isOn?'#f87171':'var(--accent)',animation:isOn?'pulse-dot 1.2s infinite':'none'}}/>
          <div>
            <div style={{fontSize:14,fontWeight:600,letterSpacing:'.02em'}}>Trợ lý sửa lỗi tiếng Hàn</div>
            <div style={{fontSize:11,color:'var(--text3)',marginTop:1}}>Xirian · Real-time Korean corrector</div>
          </div>
        </div>
        <div style={{fontSize:11,padding:'4px 10px',borderRadius:20,border:isOn?'1px solid rgba(248,113,113,0.3)':'1px solid var(--border)',color:isOn?'#f87171':'var(--text2)',background:isOn?'rgba(248,113,113,0.08)':'var(--surface2)'}}>
          {isOn ? 'Đang nghe...' : 'Chưa bắt đầu'}
        </div>
      </header>

      <main style={{flex:1,display:'flex',flexDirection:'column',padding:'24px 28px',gap:20,maxWidth:860,width:'100%',margin:'0 auto'}}>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:28,display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
          <div style={{display:'flex',alignItems:'center',gap:20}}>
            <button onClick={toggleMic} style={{width:72,height:72,borderRadius:'50%',border:isOn?'1.5px solid #f87171':'1.5px solid var(--border)',background:isOn?'rgba(248,113,113,0.1)':'var(--surface2)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',animation:isOn?'mic-pulse 1.5s infinite':'none'}}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={isOn?'#f87171':'var(--text2)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>
              </svg>
            </button>
            <button onClick={handleGrade} disabled={!hasText||isAnalyzing} style={{padding:'14px 28px',borderRadius:12,border:'none',background:hasText&&!isAnalyzing?'var(--accent)':'var(--surface2)',color:hasText&&!isAnalyzing?'white':'var(--text3)',fontSize:15,fontWeight:600,cursor:hasText&&!isAnalyzing?'pointer':'default',fontFamily:"'Be Vietnam Pro',sans-serif"}}>
              {isAnalyzing ? '⏳ Đang chấm...' : '✏️ Chấm'}
            </button>
          </div>
          <div style={{width:'100%',minHeight:40,textAlign:'center',fontSize:18,fontFamily:"'Noto Sans KR',sans-serif",lineHeight:1.6}}>
            {finalBuf||interimBuf ? (<>{finalBuf&&<span style={{color:'var(--text)'}}>{finalBuf}</span>}{interimBuf&&<span style={{color:'var(--text3)'}}>{interimBuf}</span>}</>) : (<span style={{fontSize:14,color:'var(--text3)',fontFamily:"'Be Vietnam Pro'"}}>Bấm mic → nghe tiếng Hàn → bấm Chấm khi nói xong</span>)}
          </div>
          <div style={{fontSize:12,color:'var(--text3)'}}>Cần dùng Chrome · Bật Loopback trên AG01 để nghe Zoom</div>
        </div>

        {results.length > 0 && (<>
          <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.08em'}}>Kết quả phân tích</div>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {results.map((r) => {
              if (r.loading) return (<div key={r.id} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'16px 20px',fontSize:13,color:'var(--text3)',display:'flex',alignItems:'center',gap:10}}><div style={{width:14,height:14,borderRadius:'50%',border:'2px solid var(--border)',borderTopColor:'var(--accent)',animation:'spin .7s linear infinite',flexShrink:0}}/><span>Đang phân tích: <em style={{color:'var(--text)'}}>{r.text}</em></span></div>);
              if (r.error) return (<div key={r.id} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'16px 20px',fontSize:13,color:'var(--red)'}}>Lỗi: {r.error}</div>);
              const d = r.data!;
              const errRows = d.errors&&d.errors.length>0 ? d.errors.map((e,i)=>(<div key={i} style={{marginBottom:8}}><span className="err-chip">{e.wrong}</span>{' → '}<span className="fix-chip">{e.right}</span><div style={{fontSize:12,color:'var(--text2)',marginTop:2}}>{e.reason}</div></div>)) : <span className="ok-tag">Câu đúng rồi!</span>;
              const fixContent = d.isCorrect ? <span className="ok-tag">Không cần sửa</span> : <span dangerouslySetInnerHTML={{__html:highlight(d.corrected,d.errors)}}/>;
              return (<div key={r.id} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden',animation:'slide-in .25s ease'}}>
                <Row label="🔴 Gốc" type="orig">{d.original}</Row>
                <Row label="✅ Sửa" type="fix">{fixContent}</Row>
                <Row label="⚠️ Lỗi" type="err" vi>{errRows}</Row>
                <Row label="✨ Nâng" type="up">{(d.upgrades||[]).map((u,i)=>(<div key={i} style={{marginBottom:8}}><div style={{fontSize:14,color:'var(--text)',fontFamily:"'Noto Sans KR',sans-serif"}}>{u.ko}</div><div style={{fontSize:12,color:'var(--text2)',marginTop:2}}>{u.vi}</div></div>))}</Row>
                <Row label="💡 Chú" type="note" vi last><span style={{fontSize:13,color:'var(--text2)'}}>{d.note||''}</span></Row>
              </div>);
            })}
          </div>
        </>)}
      </main>

      <style jsx>{`
        .err-chip { display:inline;background:rgba(248,113,113,0.15);color:var(--red);border-radius:3px;padding:1px 5px;font-size:13px; }
        .fix-chip { display:inline;background:rgba(74,222,128,0.12);color:var(--green);border-radius:3px;padding:1px 5px;font-size:13px; }
        .ok-tag { display:inline-block;background:var(--green-bg);color:var(--green);font-size:12px;padding:2px 10px;border-radius:20px;border:1px solid rgba(74,222,128,0.2); }
      `}</style>
    </>
  );
}

function Row({label,type,vi,last,children}:{label:string;type:string;vi?:boolean;last?:boolean;children:React.ReactNode}) {
  const colors:Record<string,{color:string;bg:string}> = {orig:{color:'var(--red)',bg:'var(--red-bg)'},fix:{color:'var(--green)',bg:'var(--green-bg)'},err:{color:'var(--amber)',bg:'rgba(251,191,36,0.06)'},up:{color:'var(--purple)',bg:'var(--purple-bg)'},note:{color:'var(--blue)',bg:'var(--blue-bg)'}};
  const c = colors[type]||colors.note;
  return (<div style={{display:'flex',borderBottom:last?'none':'1px solid var(--border)'}}>
    <div style={{width:80,flexShrink:0,padding:'12px 14px',fontSize:11,fontWeight:600,display:'flex',alignItems:'flex-start',gap:5,borderRight:'1px solid var(--border)',color:c.color,background:c.bg}}>{label}</div>
    <div style={{flex:1,padding:'12px 16px',fontSize:14,lineHeight:1.7,fontFamily:vi?"'Be Vietnam Pro',sans-serif":"'Noto Sans KR',sans-serif"}}>{children}</div>
  </div>);
}
