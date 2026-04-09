import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'No key' }, { status: 500 });
    }
    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
content: 'Phan tich cau tieng Han cua hoc sinh Viet Nam. Tra ve CHI 1 JSON hop le. QUAN TRONG: Tat ca reason, note, vi PHAI viet bang TIENG VIET co dau (vi du: Sai tro tu chu ngu, Dung sai thi dong tu). KHONG dung tieng Anh. upgrades gom 2-3 cach noi tu nhien hon.\n\nCau: ' + text + '\n\nJSON format:\n{"original":"cau goc","isCorrect":true/false,"corrected":"cau da sua","errors":[{"wrong":"phan sai","right":"phan dung","reason":"giai thich bang TIENG VIET"}],"upgrades":[{"ko":"cau tieng Han tu nhien hon","vi":"nghia TIENG VIET"}],"note":"ghi chu TIENG VIET"}'        },
        {
          role: 'assistant',
          content: '{"original":"'
        }
      ]
    };
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'API ' + res.status }, { status: res.status });
    }
    const data = await res.json();
    const full = '{"original":"' + data.content[0].text;
    const clean = full.replace(/```json/g, '').replace(/```/g, '').trim();
    let endIdx = 0;
    let depth = 0;
    for (let i = 0; i < clean.length; i++) {
      if (clean[i] === '{') depth++;
      if (clean[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
    }
    const jsonStr = clean.substring(0, endIdx + 1);
    const parsed = JSON.parse(jsonStr);
    return NextResponse.json(parsed);
  } catch (e: any) {
    console.error('Error:', e.message, e);
    return NextResponse.json({ error: e.message || 'Error' }, { status: 500 });
  }
}
