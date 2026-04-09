import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: 'Ban la giao vien tieng Han cho hoc sinh Viet Nam. Phan tich cau tieng Han. CHI tra ve 1 JSON object DUY NHAT, KHONG co bat ky text nao khac truoc hoac sau JSON. Format: {"original":"cau goc","isCorrect":true,"corrected":"cau sua","errors":[{"wrong":"sai","right":"dung","reason":"ly do tieng Viet"}],"upgrades":[{"ko":"cau nang cao hon","vi":"nghia tieng Viet"}],"note":"ghi chu ngan tieng Viet"}',
        messages: [{ role: 'user', content: text }],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('Anthropic API error:', res.status, errBody);
      return NextResponse.json({ error: 'API error: ' + res.status }, { status: res.status });
    }
    const data = await res.json();
    let raw = data.content[0].text;
    raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found:', raw);
      return NextResponse.json({ error: 'Invalid response' }, { status: 500 });
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (e: any) {
    console.error('Analyze error:', e);
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
