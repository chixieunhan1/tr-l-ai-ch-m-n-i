import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

type Mode = 'fix' | 'deep';

// Sonnet 5 tu choi temperature/top_p/top_k khac mac dinh (loi 400) va bat adaptive
// thinking khi khong khai bao. Tat thinking de thinking khong an het max_tokens
// (max_tokens la tran cho ca thinking lan text) va de giu do tre thap.
const CONFIG: Record<Mode, { model: string; max_tokens: number; extra: Record<string, unknown> }> = {
  fix: { model: 'claude-haiku-4-5-20251001', max_tokens: 500, extra: { temperature: 0 } },
  deep: { model: 'claude-sonnet-5', max_tokens: 1000, extra: { thinking: { type: 'disabled' } } },
};

function contextBlock(context: string[]): string {
  if (!context.length) return '';
  return (
    'Ngữ cảnh hội thoại gần đây (CHỈ để hiểu mạch câu chuyện, TUYỆT ĐỐI không phân tích hay sửa các câu này):\n' +
    context.map((c) => '- ' + c).join('\n') +
    '\n\n'
  );
}

function buildPrompt(mode: Mode, text: string, context: string[]): string {
  const head =
    'Bạn là giáo viên tiếng Hàn dạy học viên người Việt.\n\n' + contextBlock(context);

  if (mode === 'fix') {
    return (
      head +
      'Câu cần sửa: ' +
      text +
      '\n\n' +
      'Sửa lỗi ngữ pháp, chính tả, cách chia đuôi câu. Nếu câu đã đúng thì corrected chính là câu đó và errors là mảng rỗng.\n' +
      'Trường "why" phải viết bằng tiếng Việt có dấu, ngắn gọn một câu.\n' +
      'CHỈ trả về JSON thuần, không markdown, không giải thích thêm:\n' +
      '{"corrected":"câu đã sửa","errors":[{"wrong":"phần sai","right":"phần đúng","why":"lý do bằng tiếng Việt"}]}'
    );
  }

  return (
    head +
    'Câu của học viên: ' +
    text +
    '\n\n' +
    'Đưa ra 2-3 cách diễn đạt tự nhiên hơn (upgrades), 2 câu ví dụ khác cùng ý (examples), và ghi chú ngữ pháp 2-4 câu.\n' +
    'Các trường "vi" và "note" phải viết bằng tiếng Việt có dấu.\n' +
    'CHỈ trả về JSON thuần, không markdown, không giải thích thêm:\n' +
    '{"upgrades":[{"ko":"","vi":""}],"examples":[{"ko":"","vi":""}],"note":"ghi chú ngữ pháp bằng tiếng Việt"}'
  );
}

function extractJson(raw: string): any {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Phản hồi không chứa JSON');
  }
  return JSON.parse(raw.slice(start, end + 1));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text: unknown = body?.text;
    const mode: Mode = body?.mode === 'deep' ? 'deep' : 'fix';
    const context: string[] = Array.isArray(body?.context)
      ? body.context.filter((c: unknown): c is string => typeof c === 'string' && c.trim() !== '')
      : [];

    if (typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Thiếu câu cần phân tích' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Chưa cấu hình ANTHROPIC_API_KEY' }, { status: 500 });
    }

    const cfg = CONFIG[mode];
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: cfg.max_tokens,
        ...cfg.extra,
        messages: [{ role: 'user', content: buildPrompt(mode, text, context) }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Anthropic ' + res.status + ' (' + mode + '):', detail.slice(0, 300));
      return NextResponse.json({ error: 'API ' + res.status }, { status: res.status });
    }

    const data = await res.json();
    const raw: string = data?.content?.[0]?.text ?? '';
    return NextResponse.json(extractJson(raw));
  } catch (e: any) {
    console.error('analyze error:', e?.message);
    return NextResponse.json({ error: e?.message || 'Lỗi không xác định' }, { status: 500 });
  }
}
