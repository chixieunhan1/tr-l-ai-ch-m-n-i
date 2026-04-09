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
    const prompt = 'Analyze this Korean sentence from a Vietnamese student. Return ONLY valid JSON. All reason, note, vi fields MUST be in Vietnamese with diacritics. Include 2-3 natural alternative expressions in upgrades.\n\nSentence: ' + text + '\n\nJSON format:\n{"original":"original","isCorrect":true/false,"corrected":"fixed","errors":[{"wrong":"x","right":"y","reason":"Vietnamese"}],"upgrades":[{"ko":"better Korean","vi":"Vietnamese"}],"note":"Vietnamese"}';
    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '{"original":"' }
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
    if (endIdx === 0) {
      console.error('No JSON end:', clean.substring(0, 200));
      return NextResponse.json({ error: 'Bad response' }, { status: 500 });
    }
    let jsonStr = clean.substring(0, endIdx + 1);
    jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, ' ');
    const parsed = JSON.parse(jsonStr);
    return NextResponse.json(parsed);
  } catch (e: any) {
    console.error('Error:', e.message);
    return NextResponse.json({ error: e.message || 'Error' }, { status: 500 });
  }
}
