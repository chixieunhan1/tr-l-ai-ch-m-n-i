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
        system: `Bạn là giáo viên tiếng Hàn cho học sinh Việt Nam trình độ sơ-trung cấp. Phân tích câu tiếng Hàn học sinh vừa nói.

Trả về JSON thuần túy (không markdown, không backtick):
{
  "original": "câu gốc",
  "isCorrect": true/false,
  "corrected": "câu đã sửa (nếu đúng thì giống original)",
  "errors": [{"wrong":"phần sai","right":"phần đúng","reason":"lý do ngắn tiếng Việt"}],
  "upgrades": [{"ko":"cách nói tự nhiên hơn","vi":"nghĩa/ghi chú tiếng Việt"}],
  "note": "ghi chú ngắn về hoàn cảnh dùng hoặc sắc thái (1-2 câu tiếng Việt)"
}

- errors: chỉ lỗi thực sự. Nếu đúng thì []
- upgrades: luôn có 2-3 cách nói tự nhiên hơn kể cả khi câu đúng`,
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Anthropic API error:', res.status, errBody);
      return NextResponse.json(
        { error: `Anthropic API error: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    let raw = data.content[0].text.replace(/```json|```/g, '').trim();
const jsonMatch = raw.match(/\{[\s\S]*\}/);
if (!jsonMatch) throw new Error('No JSON found in response');
const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json(parsed);
  } catch (e: any) {
    console.error('Analyze error:', e);
    return NextResponse.json(
      { error: e.message || 'Internal error' },
      { status: 500 }
    );
  }
}
