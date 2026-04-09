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
          content: 'Analyze this Korean sentence spoken by a Vietnamese student. Return ONLY valid JSON.\n\nSentence: ' + text + '\n\nJSON format:\n{"original":"the sentence","isCorrect":true/false,"corrected":"fixed sentence","errors":[{"wrong":"x","right":"y","reason":"Vietnamese"}],"upgrades":[{"ko":"better Korean","vi":"Vietnamese meaning"}],"note":"Vietnamese note"}'
        },
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
