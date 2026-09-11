// Schema cua tool cho tung mode. Model bi ep goi tool (tool_choice) nen ket qua
// ve thang o block tool_use.input — khong con phai boc JSON tu text nua.
//
// Luat cua strict tool use: MOI object phai co "additionalProperties": false va
// "required" liet ke DU moi truong. Khong duoc dung minimum/maximum/minLength...
// (structured outputs khong ho tro, se bao loi schema).
// Vi vay khong co truong nao la tuy chon: khong co gi thi tra "" hoac [] hoac false.
import type { Mode } from './prompt';

export interface Tool {
  name: string;
  description: string;
  strict: true;
  input_schema: Record<string, unknown>;
}

const str = (description: string) => ({ type: 'string', description });

const obj = (properties: Record<string, unknown>, description?: string) => ({
  type: 'object',
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const arr = (items: unknown, description: string) => ({ type: 'array', description, items });

const PATTERNS = arr(
  obj({
    form: str('Dạng pattern, ví dụ "-고 싶다".'),
    lesson: { type: 'integer', description: 'Số bài chứa pattern đó.' },
  }),
  'Pattern CỦA BÀI TRỌNG TÂM mà câu này thực sự dùng. Không dùng cái nào thì để mảng rỗng.'
);

const KO_VI = {
  ko: str('Câu tiếng Hàn.'),
  vi: str('Nghĩa tiếng Việt, có dấu.'),
};

const UPGRADES = arr(obj({ ...KO_VI, patterns: PATTERNS }), 'Các cách diễn đạt hay hơn.');

const EXAMPLES = arr(
  obj({
    ...KO_VI,
    patterns: PATTERNS,
    situation_changed: {
      type: 'boolean',
      description: 'true khi phải đổi sang tình huống khác câu gốc; mặc định false.',
    },
  }),
  'Câu/đoạn ví dụ cùng chủ đề.'
);

const NOTE = str('Ghi chú bằng tiếng Việt có dấu.');

/** Ket qua doc mot phan hoi cua Anthropic. */
export type ToolRead =
  | { ok: true; input: any }
  /** Bi cat vi het max_tokens — goi lai voi tran cao hon. */
  | { ok: false; kind: 'max_tokens' }
  /** Khong thay block tool_use — model khong goi tool nhu da ep. */
  | { ok: false; kind: 'no_tool'; stop_reason: string | null };

/**
 * Lay ket qua tu block tool_use. Tach rieng khoi route de test duoc ma khong
 * can goi API that.
 *
 * Phai xet stop_reason TRUOC: het max_tokens thi block tool_use bi cat giua
 * chung, `input` co the thieu truong hoac khong co han.
 */
export function readToolUse(data: any): ToolRead {
  if (data?.stop_reason === 'max_tokens') return { ok: false, kind: 'max_tokens' };
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const block = blocks.find((b: any) => b?.type === 'tool_use');
  if (!block || !block.input) {
    return { ok: false, kind: 'no_tool', stop_reason: data?.stop_reason ?? null };
  }
  return { ok: true, input: block.input };
}

export const TOOLS: Record<Mode, Tool> = {
  fix: {
    name: 'tra_ket_qua_sua',
    description: 'Trả về kết quả sửa lỗi cho câu của học viên.',
    strict: true,
    input_schema: obj({
      corrected: str('Câu đã sửa. Câu vốn đã đúng thì chép lại nguyên câu đó.'),
      register_detected: {
        type: 'string',
        enum: ['반말', '존댓말'],
        description: 'Dạng của câu cần chấm.',
      },
      scene: obj(
        {
          topic: str('Chủ đề, tiếng Việt.'),
          setting: str('Địa điểm / tình huống, tiếng Việt.'),
          interlocutor: str('Đang nói chuyện với ai, tiếng Việt.'),
          register: { type: 'string', enum: ['반말', '존댓말'], description: 'Lối nói.' },
          changed: {
            type: 'boolean',
            description: 'true CHỈ KHI câu này lệch rõ ràng khỏi hoàn cảnh hiện tại.',
          },
        },
        'Hoàn cảnh hội thoại SAU câu này.'
      ),
      errors: arr(
        obj({
          wrong: str('Phần sai.'),
          right: str('Phần đúng.'),
          why: str('Lý do, tiếng Việt có dấu, ngắn gọn một câu.'),
        }),
        'Các lỗi trong câu. Câu đúng thì để mảng rỗng.'
      ),
    }),
  },

  deep: {
    name: 'tra_goi_y_nang_cap',
    description: 'Trả về gợi ý nâng cấp, câu ví dụ và ghi chú cho một câu.',
    strict: true,
    input_schema: obj({
      upgrades: UPGRADES,
      examples: EXAMPLES,
      note: NOTE,
    }),
  },

  passage: {
    name: 'tra_ket_qua_cham_doan',
    description: 'Trả về kết quả chấm cả đoạn.',
    strict: true,
    input_schema: obj({
      rewritten: str('Cả đoạn viết lại tự nhiên, giữ nguyên ý và số lượng thông tin.'),
      cohesion: str('2–4 câu tiếng Việt nhận xét mạch và liên kết.'),
      consistency: str('Lỗi nhất quán (반말/존댓말 lẫn, thì lẫn). Không có thì để chuỗi rỗng.'),
      recurring: arr(
        obj({
          error: str('Tên lỗi, ví dụ "quên 을/를".'),
          count: { type: 'integer', description: 'Số lần lỗi đó xuất hiện, tối thiểu 2.' },
          fix: str('Cách sửa, tiếng Việt có dấu.'),
        }),
        'Lỗi lặp từ 2 lần trở lên. Không có thì để mảng rỗng.'
      ),
      upgrades: UPGRADES,
      examples: EXAMPLES,
      note: NOTE,
    }),
  },
};
