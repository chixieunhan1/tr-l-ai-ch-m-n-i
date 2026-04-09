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
      if (!res.ok) throw new Error('Server error: ' + res.status);
      const data: AnalysisResult = await res.json();
      setResults((prev) => prev.map((r) => (r.id === id ? { ...r, loading: false, data } : r)));
    } catch (e: any) {
      setResults((prev) => prev.map((r) => r.id === id ? { ...r, loading: false, error: e.message } : r));
    }
    analyzingRef.current = false;
    setIsAnalyzing(false);
  }, []);

  const handleGrade = useCallback(() => {
    const full = (finalRef.current + interimRef.current).trim();
    if (full && !analyzingRef.current) {
      finalRef.current = '';
      interimRef.current = '';
      setFinalBuf('');
      setInterimBuf('');
      if (recogRef.current) {
        try { recogRef.current.onend = null; recogRef.current.stop(); } catch (e) {}
      }
      recogRef.current = null;
      setTimeout(() => {
        if (isOnRef.current && initRecogRef.current) {
          recogRef.current = initRecogRef.current();
          if (recogRef.current) { try { recogRef.current.start(); } catch (e) {} }
        }
      }, 300);
      analyze(full);
    }
  }, [analyze]);

  const initRecog = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.lang = 'ko-KR';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e: any) => {
      let f = '', i = '';
      for (let j = 0; j < e.results.length; j++) {
        if (e.results[j].isFinal) f += e.results[j][0].transcript;
        else i += e.results[j][0].transcript;
      }
      finalRef.current = f;
      interimRef.current = i;
      setFinalBuf(f);
      setInterimBuf(i);
    };
    r.onerror = () => {};
    r.onend = () => {
      if (isOnRef.current) {
        setTimeout(() => { try { r.start(); } catch (e) {} }, 300);
      }
    };
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
      if (recogRef.current) {
        try { recogRef.current.onend = null; recogRef.current.stop(); } catch (e) {}
      }
      recogRef.current = null;
      setIsOn(false);
    }
  }, [isOn, initRecog]);

  const highlight = (corrected: string, errors: AnalysisError[]) => {
    let s = corrected;
    errors.forEach((e) => {
      s = s.replace(e.right, '<span class="fix-chip">' + e.right + '</span>');
    });
    return s;
  };

  const hasText = !!(finalBuf.trim() || interimBuf.trim());

  return (
    <>
      <style jsx global>{`
        :root { --bg:#0f0f11;--surface:#1a1a1e;--surface2:#222228;--border:rgba(255,255,255,0.07);--accent:#7c6cfa;--red:#f87171;--red-bg:rgba(248,113,113,0.08);--green:#4ade80;--green-bg:rgba(74,222,128,0.08);--purple:#c084fc;--purple-bg:rgba(192,132,252,0.08);--blue:#60a5fa;--blue-bg:rgba(96,165,250,0.08);--amber:#fbbf24;--text:#e8e8f0;--text2:#8888a0;--text3:#555568; }
        * { box-sizing:border-box;margin:0;padding:0; }
        body { font-family:'Be Vietnam Pro',sans-serif;background:var(--bg);color:var(--text);min-height:100vh; }
