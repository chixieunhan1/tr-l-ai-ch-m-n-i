import { NextRequest, NextResponse } from 'next/server';
import {
  buildPassageMessage, buildSystemPrompt, buildUserMessage, readPassage, readScene, readSetup,
} from '@/lib/prompt';
import type { Mode } from '@/lib/prompt';
import { countPatterns, getGrammarPool } from '@/lib/grammar';
import { TOOLS, readToolUse } from '@/lib/schema';

export const runtime = 'edge';

// Sonnet 5 tu choi temperature/top_p/top_k khac mac dinh (loi 400) va bat adaptive
// thinking khi khong khai bao. Tat thinking de thinking khong an het max_tokens
// (max_tokens la tran cho ca thinking lan text) va de giu do tre thap.
const CONFIG: Record<Mode, { model: string; max_tokens: number; extra: Record<string, unknown> }> = {
  fix: { model: 'claude-haiku-4-5-20251001', max_tokens: 800, extra: { temperature: 0 } },
  deep: { model: 'claude-sonnet-5', max_tokens: 2000, extra: { thinking: { type: 'disabled' } } },
  passage: { model: 'claude-sonnet-5', max_tokens: 3000, extra: { thinking: { type: 'disabled' } } },
};

// Cau tra loi bi cat vi het max_tokens -> goi lai MOT lan voi tran gap doi.
const RETRY_TOO_LONG = 'Câu trả lời quá dài, đang thử lại';

/** Body gui len Anthropic. Tach ra de dryRun soi duoc y het luc goi that. */
function buildBody(mode: Mode, system: string, user: string, maxTokens: number) {
  const cfg = CONFIG[mode];
  const tool = TOOLS[mode];
  return {
    model: cfg.model,
    max_tokens: maxTokens,
    ...cfg.extra,
    // Ho so ngu phap dai va khong doi suot buoi hoc -> cache lai,
    // cac lan goi sau trong buoi chi tra ~10% gia cho phan nay.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    // Structured output: ep model goi dung tool nay, ket qua ve o tool_use.input
    // dung schema. Khong con phai boc JSON tu text nen het loi parse.
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
  };
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
    const mode: Mode =
      body?.mode === 'deep' || body?.mode === 'passage' ? body.mode : 'fix';
    const context: string[] = Array.isArray(body?.context)
      ? body.context.filter((c: unknown): c is string => typeof c === 'string' && c.trim() !== '')
      : [];

    const setup = readSetup(body);
    const scene = readScene(body);
    const cfg = CONFIG[mode];
    const system = buildSystemPrompt(setup);

    let user: string;
    if (mode === 'passage') {
      const passage = readPassage(body);
      if (!passage.originals.length) {
        return NextResponse.json({ error: 'Đoạn chưa có câu nào' }, { status: 400 });
      }
      user = buildPassageMessage(passage, scene);
    } else {
      if (typeof text !== 'string' || !text.trim()) {
        return NextResponse.json({ error: 'Thiếu câu cần phân tích' }, { status: 400 });
      }
      user = buildUserMessage(mode, text, context, scene);
    }

    // dryRun: xem prompt dung ra sao mà không gọi API, không tốn tiền.
    // Dùng để kiểm tra cấu hình lớp bằng curl.
    if (body?.dryRun === true) {
      const sent = buildBody(mode, system, user, cfg.max_tokens);
      return NextResponse.json({
        dryRun: true,
        model: cfg.model,
        max_tokens: sent.max_tokens,
        tools: sent.tools,
        tool_choice: sent.tool_choice,
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

    const send = (maxTokens: number) =>
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(buildBody(mode, system, user, maxTokens)),
      });

    let res = await send(cfg.max_tokens);
    if (!res.ok) {
      const detail = await res.text();
      console.error('Anthropic ' + res.status + ' (' + mode + '):', detail.slice(0, 300));
      return NextResponse.json({ error: viError(res.status, detail) }, { status: res.status });
    }
    let data = await res.json();
    let read = readToolUse(data);

    // Het tran token -> block tool_use bi cat giua chung, input khong day du.
    // Goi lai dung MOT lan voi tran gap doi; van cat nua thi bao cho hoc vien.
    if (!read.ok && read.kind === 'max_tokens') {
      const bigger = cfg.max_tokens * 2;
      console.error(`[${mode}] stop_reason=max_tokens ở ${cfg.max_tokens}, gọi lại với ${bigger}`);
      res = await send(bigger);
      if (!res.ok) {
        const detail = await res.text();
        console.error('Anthropic ' + res.status + ' (' + mode + ' retry):', detail.slice(0, 300));
        return NextResponse.json({ error: viError(res.status, detail) }, { status: res.status });
      }
      data = await res.json();
      read = readToolUse(data);
    }

    if (!read.ok) {
      // Nhat ky debug: giu ca raw lan stop_reason de lan sau chan doan duoc.
      const raw = JSON.stringify(data).slice(0, 2000);
      if (read.kind === 'max_tokens') {
        console.error(`[${mode}] vẫn max_tokens sau khi gấp đôi · raw=` + raw);
        return NextResponse.json(
          { error: RETRY_TOO_LONG, stop_reason: 'max_tokens', raw },
          { status: 500 }
        );
      }
      console.error(
        `[${mode}] không có block tool_use · stop_reason=${read.stop_reason} · raw=` + raw
      );
      return NextResponse.json(
        { error: 'Model không gọi tool như yêu cầu', stop_reason: read.stop_reason, raw },
        { status: 500 }
      );
    }
    const parsed: any = read.input;

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
