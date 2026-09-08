import { NextRequest, NextResponse } from 'next/server';
import { buildSystemPrompt, buildUserMessage, readScene, readSetup } from '@/lib/prompt';
import type { Mode } from '@/lib/prompt';
import { countPatterns, getGrammarPool } from '@/lib/grammar';

export const runtime = 'edge';

// Sonnet 5 tu choi temperature/top_p/top_k khac mac dinh (loi 400) va bat adaptive
// thinking khi khong khai bao. Tat thinking de thinking khong an het max_tokens
// (max_tokens la tran cho ca thinking lan text) va de giu do tre thap.
const CONFIG: Record<Mode, { model: string; max_tokens: number; extra: Record<string, unknown> }> = {
  fix: { model: 'claude-haiku-4-5-20251001', max_tokens: 700, extra: { temperature: 0 } },
  deep: { model: 'claude-sonnet-5', max_tokens: 1200, extra: { thinking: { type: 'disabled' } } },
};

function extractJson(raw: string): any {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Phản hồi không chứa JSON');
  }
  return JSON.parse(raw.slice(start, end + 1));
}

// Body loi cua Anthropic: {"type":"error","error":{"type":"...","message":"..."}}
// Lay ca type lan message roi doi sang tieng Viet cho hoc vien hieu.
function viError(status: number, detail: string): string {
  let type = '';
  let message = '';
  try {
    const j = JSON.parse(detail);
    if (typeof j?.error?.type === 'string') type = j.error.type;
    if (typeof j?.error?.message === 'string') message = j.error.message.trim();
    else if (typeof j?.message === 'string') message = j.message.trim();
  } catch (e) {}

  const hay = (type + ' ' + message).toLowerCase();
  if (hay.includes('credit')) return 'Tài khoản API hết credit, cần nạp thêm';
  if (hay.includes('rate')) return 'Gọi quá nhanh, chờ chút';
  return message || 'API ' + status;
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

    const setup = readSetup(body);
    const scene = readScene(body);
    const cfg = CONFIG[mode];
    const system = buildSystemPrompt(setup);
    const user = buildUserMessage(mode, text, context, scene);

    // dryRun: xem prompt dung ra sao mà không gọi API, không tốn tiền.
    // Dùng để kiểm tra cấu hình lớp bằng curl.
    if (body?.dryRun === true) {
      return NextResponse.json({
        dryRun: true,
        model: cfg.model,
        setup,
        poolPatterns:
          setup.curriculum === 'xirian' && setup.lesson !== null
            ? countPatterns(getGrammarPool(setup.level, setup.lesson))
            : 0,
        systemChars: system.length,
        system,
        user,
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Chưa cấu hình ANTHROPIC_API_KEY' }, { status: 500 });
    }

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
        // Hồ sơ ngữ pháp dài và không đổi suốt buổi học -> cache lại,
        // các lần gọi sau trong buổi chỉ trả ~10% giá cho phần này.
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Anthropic ' + res.status + ' (' + mode + '):', detail.slice(0, 300));
      return NextResponse.json({ error: viError(res.status, detail) }, { status: res.status });
    }

    const data = await res.json();
    const raw: string = data?.content?.[0]?.text ?? '';
    const parsed = extractJson(raw);

    const u = data?.usage;
    if (u) {
      console.log(
        `[usage ${mode}] in=${u.input_tokens} cache_write=${u.cache_creation_input_tokens ?? 0} ` +
          `cache_read=${u.cache_read_input_tokens ?? 0} out=${u.output_tokens}`
      );
      parsed._usage = {
        input: u.input_tokens,
        cache_write: u.cache_creation_input_tokens ?? 0,
        cache_read: u.cache_read_input_tokens ?? 0,
        output: u.output_tokens,
      };
    }

    return NextResponse.json(parsed);
  } catch (e: any) {
    console.error('analyze error:', e?.message);
    return NextResponse.json({ error: e?.message || 'Lỗi không xác định' }, { status: 500 });
  }
}
