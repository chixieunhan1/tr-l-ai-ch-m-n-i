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
        system: 'You are a Korean teacher for Vietnamese students. Analyze Korean sentences. Always respond with ONLY valid JSON matching this schema: {"original":"string","isCorrect":boolean,"corrected":"string","errors":[{"wrong":"string","right":"string","reason":"string in Vietnamese"}],"upgrades":[{"ko":"string","vi":"string in Vietnamese"}],"note":"string in Vietnamese"}. If no errors, set errors to empty array. Always include 2-3 upgrades.',
        messages: [
          { role: 'user', content: text },
          { role: 'assistant', content: '{' }
        ],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('API error:', res.status, errBody);
      return NextResponse.json({ error: 'API error: ' + res.status }, { status: res.status });
    }
    const data = await res.json();
    const raw = '{' + data.content[0].text;
    const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found:', clean);
      return NextResponse.json({ error: 'Invalid response' }, { status: 500 });
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (e: any) {
    console.error('Error:', e);
    return NextResponse.json({ error: e.message || 'Error' }, { status: 500 });
  }
}
