// Dung system prompt + user message tu cai dat buoi hoc.
// Tach khoi route.ts de test duoc ma khong keo theo next/server.
import {
  LEVEL_LABEL,
  formatPoolForPrompt,
  formatUpcomingForPrompt,
  getGrammarPool,
  getLesson,
  getUpcoming,
  isLevelId,
  lessonCount,
} from './grammar';
import type { LevelId } from './grammar';

export type Mode = 'fix' | 'deep';
export type Curriculum = 'xirian' | 'other';
export type Register = 'auto' | 'banmal' | 'jondaetmal';

export interface Setup {
  level: LevelId;
  curriculum: Curriculum;
  lesson: number | null;
  topic: string;
  register: Register;
}

export function readSetup(body: any): Setup {
  const level: LevelId = isLevelId(body?.level) ? body.level : 'sc1';
  const curriculum: Curriculum = body?.curriculum === 'other' ? 'other' : 'xirian';
  const register: Register =
    body?.register === 'banmal' || body?.register === 'jondaetmal' ? body.register : 'auto';

  let lesson: number | null = null;
  if (curriculum === 'xirian') {
    const n = Number(body?.lesson);
    if (Number.isFinite(n)) lesson = Math.min(Math.max(Math.round(n), 1), lessonCount(level));
  }

  const topic = typeof body?.topic === 'string' ? body.topic.trim().slice(0, 300) : '';
  return { level, curriculum, lesson, topic, register };
}

const LEVEL_RULES: Record<LevelId, string> = {
  sc1:
    'CHỈ sửa: trợ từ, cách chia đuôi, thì, từ vựng dùng sai. TUYỆT ĐỐI KHÔNG sửa chỉ vì "chưa tự nhiên" — câu đúng ngữ pháp thì để nguyên.\n' +
    'Gợi ý nâng cấp: đúng 2 câu. Mỗi câu chỉ được thêm ĐÚNG 1 pattern so với câu gốc.\n' +
    'Ghi chú: 1–2 câu, tiếng Việt đơn giản, KHÔNG dùng thuật ngữ ngữ pháp.',
  sc2:
    'Sửa: trợ từ, chia đuôi, thì, từ vựng sai, VÀ cách liên kết câu (-고, -아서/어서, -지만, -(으)면). Vẫn không sửa chỉ vì "chưa tự nhiên".\n' +
    'Gợi ý nâng cấp: 2–3 câu, được phép ghép hai ý của học viên thành một câu.\n' +
    'Ghi chú: 2–3 câu, tiếng Việt dễ hiểu.',
  tc1:
    'Sửa cả cách diễn đạt vụng, không chỉ lỗi ngữ pháp. Khi hợp ngữ cảnh thì ưu tiên 간접화법 và các mẫu -나 보다 / -던데 / -거든요.\n' +
    'Gợi ý nâng cấp: 3 câu, xếp từ lịch sự/sách vở đến tự nhiên.\n' +
    'Ghi chú: giải thích sắc thái khác nhau giữa các cách nói, 3–4 câu.',
  tc2:
    'Sửa theo chuẩn người bản xứ: gồm sắc thái, thành ngữ, và phân biệt văn nói / văn viết.\n' +
    'Gợi ý nâng cấp: 3 câu, trong đó ít nhất 1 câu đúng như người Hàn thật sự nói; được dùng 관용 표현.\n' +
    'Ghi chú: đi sâu, so sánh các cách nói với nhau.',
};

/** SC1 chua day 반말; SC2 day 반말 o bai 10. Truoc do luon keo ve 존댓말. */
export function forcesJondae(s: Setup): boolean {
  return s.level === 'sc1' || (s.level === 'sc2' && s.lesson !== null && s.lesson < 10);
}

function registerRules(s: Setup): string {
  if (s.register === 'jondaetmal' || (s.register === 'auto' && forcesJondae(s))) {
    return (
      'Học viên phải nói 존댓말. Sửa mọi câu đang ở dạng 반말 thành 존댓말.' +
      (s.register === 'auto' && forcesJondae(s)
        ? ' (Lớp này chưa học 반말 nên dù đang để "Tự động" vẫn luôn kéo về 존댓말.)'
        : '')
    );
  }
  if (s.register === 'banmal') {
    return 'Học viên đang luyện 반말. Sửa mọi câu đang ở dạng 존댓말 thành 반말.';
  }
  return (
    'Tự suy ra từ cách học viên đang nói và các câu ngữ cảnh phía trước.\n' +
    'Nếu học viên dùng 반말 một cách NHẤT QUÁN thì KHÔNG được sửa sang 존댓말 — chỉ sửa khi học viên trộn lẫn hai dạng trong cùng một đoạn.\n' +
    'Trong ghi chú, thêm một câu ngắn kiểu "câu này đang ở dạng 반말" để giáo viên biết.'
  );
}

export function todayTopic(s: Setup): string {
  if (s.topic) return s.topic;
  if (s.curriculum !== 'xirian' || s.lesson === null) return '';
  const l = getLesson(s.level, s.lesson);
  if (!l) return '';
  return `Bài ${l.number} — ${l.title} — ${l.patterns.map((p) => p.form).join(', ')}`;
}

export function buildSystemPrompt(s: Setup): string {
  const parts: string[] = [];

  // a. Vai tro
  parts.push(
    'Bạn là giáo viên tiếng Hàn dạy học viên người Việt, đang chấm bài nói cho lớp ' +
      LEVEL_LABEL[s.level] +
      (s.curriculum === 'xirian' && s.lesson !== null
        ? `, học đến bài ${s.lesson} theo giáo trình 서울대 한국어.`
        : '. Học viên KHÔNG theo giáo trình 서울대 한국어, nên TUYỆT ĐỐI không nhắc tới số bài nào cả; chỉ bám theo trình độ chung của cấp.')
  );

  // b. Pool ngu phap (chi khi theo giao trinh)
  if (s.curriculum === 'xirian' && s.lesson !== null) {
    parts.push(
      '# Ngữ pháp học viên ĐÃ HỌC\n' +
        formatPoolForPrompt(getGrammarPool(s.level, s.lesson)) +
        '\n\n## Cách dùng danh sách trên\n' +
        '- Đây là những gì học viên ĐÃ HỌC. Dùng để ƯU TIÊN gợi ý, KHÔNG dùng để cấm: học viên dùng đúng một mẫu ngoài danh sách nhưng cùng cấp độ thì vẫn chấp nhận, không tính là lỗi.\n' +
        '- Mọi gợi ý nâng cấp phải nằm trong danh sách trên. Ngoại lệ duy nhất: tối đa 1 gợi ý được dùng pattern ở mục "Sắp học", và phải ghi rõ "(sắp học ở bài X)".\n' +
        '- Nếu học viên sai ở ngữ pháp CHƯA học thì vẫn sửa, nhưng ghi chú thêm "phần này học ở bài X, giờ chưa cần nhớ".'
    );

    const up = getUpcoming(s.level, s.lesson, 2);
    if (up.length) {
      parts.push('# Sắp học (chỉ được dùng tối đa 1 gợi ý, phải đánh dấu rõ)\n' + formatUpcomingForPrompt(up));
    }
  }

  // c. Cach sua theo cap
  parts.push('# Cách sửa cho ' + LEVEL_LABEL[s.level] + '\n' + LEVEL_RULES[s.level]);

  // d. 반말 / 존댓말
  parts.push('# 반말 / 존댓말\n' + registerRules(s));

  // e. Bai hom nay
  const topic = todayTopic(s);
  if (topic) {
    parts.push(
      '# Bài hôm nay\n' + topic + '\n' +
        '- Ưu tiên nhận xét ngữ pháp của bài đang học.\n' +
        '- Học viên dùng ĐÚNG ngữ pháp của bài thì nêu rõ trong ghi chú.\n' +
        '- Câu có thể dùng ngữ pháp của bài mà học viên né đi thì gợi ý nâng cấp ĐẦU TIÊN phải dùng pattern đó.'
    );
  }

  // f. Giu cau truc cua hoc vien
  parts.push(
    '# Giữ cấu trúc câu của học viên\n' +
      'Không tách một câu thành nhiều câu, cũng không gộp nhiều câu thành một, nếu cấu trúc gốc không sai. ' +
      'Chỉ đổi cấu trúc khi thật sự cần, và khi đó phải giải thích lý do trong ghi chú.'
  );

  parts.push('Mọi phần tiếng Việt phải viết có dấu.');

  return parts.join('\n\n');
}

const FIX_FORMAT =
  'Sửa lỗi cho câu trên. Nếu câu đã đúng thì "corrected" chính là câu đó và "errors" là mảng rỗng.\n' +
  '"why" viết bằng tiếng Việt có dấu, ngắn gọn một câu.\n' +
  '"register_detected" là dạng của CÂU CẦN CHẤM: "반말" hoặc "존댓말".\n' +
  'CHỈ trả về JSON thuần, không markdown, không giải thích thêm:\n' +
  '{"corrected":"câu đã sửa","register_detected":"존댓말","errors":[{"wrong":"phần sai","right":"phần đúng","why":"lý do bằng tiếng Việt"}]}';

const DEEP_FORMAT =
  'Với câu trên, đưa ra các cách diễn đạt tự nhiên hơn (upgrades), 2 câu ví dụ khác cùng ý (examples), và ghi chú (note).\n' +
  'Số lượng upgrades và độ dài note theo đúng mục "Cách sửa" trong hướng dẫn hệ thống.\n' +
  'Các trường "vi" và "note" viết bằng tiếng Việt có dấu.\n' +
  'CHỈ trả về JSON thuần, không markdown, không giải thích thêm:\n' +
  '{"upgrades":[{"ko":"","vi":""}],"examples":[{"ko":"","vi":""}],"note":"ghi chú bằng tiếng Việt"}';

export function buildUserMessage(mode: Mode, text: string, context: string[]): string {
  const head = context.length
    ? 'Các câu học viên vừa nói trước đó (CHỈ để hiểu mạch chuyện và đoán 반말/존댓말, TUYỆT ĐỐI không chấm lại các câu này):\n' +
      context.map((c) => '- ' + c).join('\n') +
      '\n\n'
    : '';
  return head + 'CÂU CẦN CHẤM: ' + text + '\n\n' + (mode === 'fix' ? FIX_FORMAT : DEEP_FORMAT);
}
