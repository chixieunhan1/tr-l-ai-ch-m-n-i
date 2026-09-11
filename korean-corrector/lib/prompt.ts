// Dung system prompt + user message tu cai dat buoi hoc.
// Tach khoi route.ts de test duoc ma khong keo theo next/server.
import {
  LEVEL_LABEL,
  formatPoolForPrompt,
  getGrammarPool,
  getLesson,
  isLevelId,
  lessonCount,
} from './grammar';
import type { GrammarLesson, LevelId } from './grammar';
import { formatVocabForPrompt, getVocabPool, hasVocab } from './vocab';
import { formatSceneForPrompt, normalizeScene } from './scene';
import type { Scene } from './scene';

export type { Scene, SceneReport } from './scene';

/** Đọc scene client gửi lên. */
export function readScene(body: any): Scene | null {
  return body?.scene ? normalizeScene(body.scene) : null;
}

/** Một đoạn = các câu học viên nói giữa hai lần bấm "Hết đoạn". */
export interface PassageInput {
  originals: string[];
  /** Cùng độ dài với originals; câu chưa kịp sửa thì lặp lại câu gốc. */
  correcteds: string[];
}

const cleanLine = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function readPassage(body: any): PassageInput {
  const rawO: unknown[] = Array.isArray(body?.originals) ? body.originals : [];
  const rawC: unknown[] = Array.isArray(body?.correcteds) ? body.correcteds : [];
  const originals: string[] = [];
  const correcteds: string[] = [];
  // Zip TRUOC khi loc: loc originals roi moi index vao correcteds se lech cap
  // neu co mot cau rong nam giua.
  rawO.forEach((o, i) => {
    const text = cleanLine(o);
    if (!text) return;
    originals.push(text);
    correcteds.push(cleanLine(rawC[i]) || text);
  });
  return { originals, correcteds };
}

export type Mode = 'fix' | 'deep' | 'passage';
export type Curriculum = 'xirian' | 'other';
export type Register = 'auto' | 'banmal' | 'jondaetmal';

export const MAX_REVIEW = 2;

export interface Setup {
  level: LevelId;
  curriculum: Curriculum;
  lesson: number | null;
  /** Bài ôn thêm — tối đa 2, đều < bài hiện tại. Bài hiện tại luôn là trọng tâm nên không nằm ở đây. */
  review: number[];
  topic: string;
  register: Register;
}

/** Bài trọng tâm = bài đang học + các bài ôn thêm. */
export function focusLessons(s: Setup): number[] {
  if (s.curriculum !== 'xirian' || s.lesson === null) return [];
  return [s.lesson, ...s.review];
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

  let review: number[] = [];
  if (lesson !== null && Array.isArray(body?.review)) {
    const cur: number = lesson;
    const nums: number[] = body.review
      .map((v: unknown) => Math.round(Number(v)))
      .filter((n: number) => Number.isFinite(n) && n >= 1 && n < cur);
    review = Array.from(new Set<number>(nums)).sort((x, y) => x - y).slice(0, MAX_REVIEW);
  }

  const topic = typeof body?.topic === 'string' ? body.topic.trim().slice(0, 300) : '';
  return { level, curriculum, lesson, review, topic, register };
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

// Lay tu bang "5 mốc DỄ NHẦM NHẤT" trong data/grammar/grammar-by-lesson-sc1.md.
// Ghi ro "Sơ cấp 1" o moi dong: lop TC1/TC2 cung co bai 9/10/11/12/14 cua rieng ho,
// khong ghi ro thi ghi chu se dan nham sang sach khac.
//
// `needs` = bai SC1 cao nhat ma dong do nhac toi. Chi nhung dong nao NAM TRONG pool,
// vi luat tich luy nghiem ngat: hoc vien moi hoc SC1 bai 5 thi nhac 못 V (bai 12) vua
// vo ich vua lam lo pattern bai chua hoc vao context.
const CONFUSABLE_ROWS: { needs: number; line: string }[] = [
  { needs: 12, line: '- `-아서/어서` dạy HAI lần, hai nghĩa khác nhau: Sơ cấp 1 bài 10 = "rồi" (trình tự hành động) · Sơ cấp 1 bài 12 = "vì… nên" (nguyên nhân). Khi ghi chú phải dẫn đúng bài theo NGHĨA đang dùng trong câu, không được gộp làm một.' },
  { needs: 12, line: '- `못 V` (không thể): Sơ cấp 1 bài 12, KHÔNG phải bài 11. Bài 11 chỉ có `-지 마세요` (đừng).' },
  { needs: 12, line: '- `잘하다 / 못하다` (giỏi / không giỏi): Sơ cấp 1 bài 9 — khác hẳn `못 V` của bài 12.' },
  { needs: 11, line: '- `ㅡ 탈락` (아파요, 바빠요, 썼어요): Sơ cấp 1 bài 11.' },
  { needs: 14, line: '- `N한테/께` (cho ai): Sơ cấp 1 bài 14, KHÔNG phải bài 9. Bài 9 chỉ có `N의` (của).' },
];

function confusableSection(s: Setup): string {
  // Cap cao hon SC1 thi pool da gom tron SC1 (16 bai).
  const sc1Reach = s.level === 'sc1' ? (s.lesson ?? 0) : lessonCount('sc1');
  const rows = CONFUSABLE_ROWS.filter((r) => r.needs <= sc1Reach);
  if (!rows.length) return '';
  return (
    '# Mốc dễ nhầm (mọi số bài dưới đây đều là bài của SƠ CẤP 1)\n' +
    rows.map((r) => r.line).join('\n')
  );
}

const UPGRADE_RULE =
  '# Gợi ý nâng cấp phải thực sự nâng\n' +
  '- Mỗi câu ở phần "Nâng" phải khác câu đã sửa ít nhất MỘT cấu trúc ngữ pháp hoặc MỘT cách diễn đạt.\n' +
  '- TUYỆT ĐỐI không lặp lại nguyên văn câu đã sửa làm gợi ý — kể cả gợi ý đầu tiên. ' +
  'Nếu câu học viên vốn đã đúng và không còn gì để nâng theo đúng trình độ, hãy đổi cách diễn đạt chứ đừng chép lại câu cũ.';

// data/vocab/ co thi nhung tu vung tich luy; chua co thi dan model bam theo
// chu de cua cac bai da hoc (tieu de bai da nam san trong danh sach ngu phap).
function vocabSection(s: Setup): string {
  const head = '# Từ vựng\n';
  if (s.curriculum === 'xirian' && s.lesson !== null && hasVocab()) {
    const pool = getVocabPool(s.level, s.lesson);
    if (pool.length) {
      return (
        head +
        formatVocabForPrompt(pool) +
        '\n\n- TÍCH LUỸ NGHIÊM NGẶT: chỉ dùng từ vựng trong danh sách trên, cộng từ cơ bản nhất của cấp. Không dùng từ của bài chưa học.'
      );
    }
  }
  return (
    head +
    `- Chưa có danh sách từ vựng cho lớp này. Chỉ dùng từ vựng cơ bản đúng trình độ ${LEVEL_LABEL[s.level]}.\n` +
    (s.curriculum === 'xirian' && s.lesson !== null
      ? '- Ưu tiên từ thuộc chủ đề các bài đã học — tiêu đề mỗi bài trong danh sách ngữ pháp ở trên CHÍNH LÀ chủ đề của bài đó.\n'
      : '') +
    '- Tránh từ vượt quá phạm vi cấp này. Nếu buộc phải dùng một từ khó hơn, giải thích nghĩa trong ghi chú.'
  );
}

const lessonPatternLine = (l: GrammarLesson) =>
  `B${l.number} ${l.title}: ` + l.patterns.map((p) => p.form).join(' · ');

function focusSection(s: Setup): string {
  const nums = focusLessons(s);
  if (!nums.length) return '';
  const lessons = nums
    .map((n) => getLesson(s.level, n))
    .filter((l): l is GrammarLesson => !!l);

  const head =
    '# Bài trọng tâm: bài ' + s.lesson +
    (s.review.length ? ' · ôn thêm bài ' + s.review.join(', ') : '') + '\n' +
    lessons.map(lessonPatternLine).join('\n');

  return (
    head +
    '\n\n## Cách dùng bài trọng tâm\n' +
    '- Phần Nâng: ít nhất 2/3 số câu phải dùng ≥1 pattern của bài trọng tâm (3 câu → ít nhất 2 câu; 2 câu → cả 2 câu).\n' +
    '- MỖI câu ở phần Nâng VÀ phần Ví dụ đều phải trả thêm trường "patterns": danh sách pattern CỦA BÀI TRỌNG TÂM mà câu đó thực sự dùng, dạng [{"form":"-고 싶다","lesson":15}]. Câu không dùng pattern nào của bài trọng tâm thì để mảng rỗng [].\n' +
    '- Phần Ví dụ: cả 2 câu phải dùng pattern VÀ từ vựng của bài trọng tâm. Nếu không lồng được tự nhiên vào tình huống của câu gốc thì ĐƯỢC đổi sang tình huống khác, và câu đó phải trả thêm "situation_changed": true (mặc định false).\n' +
    '- Phần Ghi chú: DÒNG CUỐI CÙNG phải có dạng "Ôn bài X: <các pattern của bài X đã dùng>".\n' +
    '- ƯU TIÊN CÂU TỰ NHIÊN: nếu nhét pattern của bài trọng tâm vào sẽ làm câu gượng, KHÔNG được ép. Khi đó dùng pattern khác trong pool và nói rõ trong ghi chú là vì sao không dùng pattern bài trọng tâm.'
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
        '- TÍCH LUỸ NGHIÊM NGẶT: toàn bộ phần Sửa, Nâng, Ví dụ và Ghi chú do BẠN viết ra CHỈ được dùng ngữ pháp có trong danh sách trên. KHÔNG có bất kỳ ngoại lệ nào — kể cả pattern của bài kế tiếp, dù có đánh dấu "sắp học".\n' +
        '- Danh sách này KHÔNG dùng để cấm học viên: học viên tự dùng đúng một mẫu ngoài danh sách nhưng hợp cấp độ thì vẫn chấp nhận, không tính là lỗi.\n' +
        '- Nếu học viên sai ở ngữ pháp CHƯA học thì vẫn sửa, nhưng ghi chú thêm "phần này học ở bài X, giờ chưa cần nhớ".'
    );

    parts.push(vocabSection(s));
    parts.push(focusSection(s));

    // Chi co nghia khi duoc phep dan so bai (curriculum = xirian).
    const conf = confusableSection(s);
    if (conf) parts.push(conf);
  } else {
    parts.push(vocabSection(s));
  }

  // c. Cach sua theo cap
  parts.push('# Cách sửa cho ' + LEVEL_LABEL[s.level] + '\n' + LEVEL_RULES[s.level]);
  parts.push(UPGRADE_RULE);

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

  // g. Hoan canh hoi thoai — LUAT o day (on dinh, cache duoc);
  //    GIA TRI scene di trong user message vi no doi lien tuc.
  parts.push(
    '# Hoàn cảnh hội thoại (scene)\n' +
      'Mỗi lượt bạn nhận được dòng "HOÀN CẢNH HIỆN TẠI" gồm: chủ đề, địa điểm/tình huống, đang nói với ai, lối nói.\n' +
      '- Dùng hoàn cảnh đó để sửa và gợi ý CHO ĐÚNG TÌNH HUỐNG. Ví dụ đang ở quán ăn nói với nhân viên thì câu gợi ý phải là câu dùng được ngay tại quán ăn với nhân viên — không gợi ý câu chỉ hợp trong lớp học hay khi nói với bạn thân.\n' +
      '- Hoàn cảnh còn trống thì tự suy ra từ câu đang chấm và các câu ngữ cảnh.\n' +
      '- Lối nói trong hoàn cảnh phải khớp với "register_detected" của câu; lệch nhau thì nêu trong ghi chú.'
  );

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
  '"scene" mô tả hoàn cảnh hội thoại SAU câu này: topic (chủ đề), setting (địa điểm/tình huống), ' +
  'interlocutor (đang nói chuyện với ai), register ("반말" hoặc "존댓말"). Viết topic/setting/interlocutor bằng tiếng Việt, ngắn gọn.\n' +
  '"scene.changed" = true CHỈ KHI câu này lệch RÕ RÀNG khỏi HOÀN CẢNH HIỆN TẠI — tức đổi hẳn chủ đề, ' +
  'hoặc đổi địa điểm, hoặc đổi người đang nói chuyện.\n' +
  'MỘT câu lạc đề lẻ, câu đệm, câu xã giao (hỏi thời tiết, sức khoẻ, khen ngợi) thì "changed" = false — ' +
  'giữ nguyên hoàn cảnh cũ, vì người nói vẫn đang ở trong tình huống đó.\n' +
  'Hoàn cảnh hiện tại đang trống thì "changed" = false và điền scene bạn suy ra được.\n' +
  'Trả kết quả bằng cách gọi tool được cung cấp — không viết gì ngoài lời gọi tool.';

const DEEP_FORMAT =
  'Với câu trên, đưa ra các cách diễn đạt tự nhiên hơn (upgrades), 2 câu ví dụ khác cùng ý (examples), và ghi chú (note).\n' +
  'Số lượng upgrades và độ dài note theo đúng mục "Cách sửa" trong hướng dẫn hệ thống.\n' +
  'Các trường "vi" và "note" viết bằng tiếng Việt có dấu.\n' +
  '"patterns" liệt kê pattern CỦA BÀI TRỌNG TÂM mà câu đó dùng (mảng rỗng nếu không dùng cái nào).\n' +
  '"situation_changed" chỉ dùng cho examples, true khi phải đổi sang tình huống khác câu gốc.\n' +
  'Trả kết quả bằng cách gọi tool được cung cấp — không viết gì ngoài lời gọi tool.';

// Cham CA DOAN. Dung chung system prompt voi fix/deep (tich luy, bai trong tam,
// 반말/존댓말, moc de nham deu ap y het) nen van an cache.
const PASSAGE_FORMAT =
  'Chấm CẢ ĐOẠN trên như một chỉnh thể — KHÔNG chấm lại từng câu lẻ, việc đó đã làm rồi.\n' +
  '"rewritten": viết lại cả đoạn cho tự nhiên. ĐƯỢC ghép câu bằng liên từ CÓ TRONG danh sách ngữ pháp đã học. ' +
  'GIỮ NGUYÊN ý và số lượng thông tin của học viên — không thêm ý mới, không bỏ ý nào.\n' +
  '"cohesion": 2–4 câu tiếng Việt nhận xét mạch và liên kết; chỉ rõ chỗ nào nên ghép và ghép bằng liên từ nào.\n' +
  '"consistency": lỗi nhất quán trong đoạn (trộn lẫn 반말/존댓말, lẫn thì). Không có lỗi thì để chuỗi rỗng "".\n' +
  '"recurring": lỗi lặp lại TỪ 2 LẦN TRỞ LÊN trong đoạn, dạng [{"error":"quên 을/를","count":3,"fix":"cách sửa"}]. ' +
  '"count" là số lần lỗi đó thực sự xuất hiện. Lỗi chỉ xảy ra 1 lần thì KHÔNG đưa vào. Không có thì mảng rỗng.\n' +
  '"upgrades": 2–3 cách diễn đạt hay hơn cho CẢ ĐOẠN hoặc một đoạn con.\n' +
  '"examples": đúng 2 đoạn ngắn mẫu cùng chủ đề, dùng pattern VÀ từ vựng của bài trọng tâm.\n' +
  '"note": ghi chú tổng cho cả đoạn; độ dài theo đúng mục "Cách sửa" trong hướng dẫn hệ thống.\n' +
  'Các trường "vi", "cohesion", "consistency", "note" và "fix" viết bằng tiếng Việt có dấu.\n' +
  '"patterns" liệt kê pattern CỦA BÀI TRỌNG TÂM mà câu đó dùng (mảng rỗng nếu không dùng cái nào).\n' +
  'Trả kết quả bằng cách gọi tool được cung cấp — không viết gì ngoài lời gọi tool.';

export function buildPassageMessage(p: PassageInput, scene?: Scene | null): string {
  const rows = p.originals
    .map((o, i) => `${i + 1}. gốc: ${o}\n   đã sửa: ${p.correcteds[i]}`)
    .join('\n');
  return (
    formatSceneForPrompt(scene) + '\n\n' +
    'ĐOẠN CẦN CHẤM — ' + p.originals.length + ' câu học viên vừa nói, theo đúng thứ tự:\n' +
    rows + '\n\n' +
    PASSAGE_FORMAT
  );
}

export function buildUserMessage(
  mode: Mode,
  text: string,
  context: string[],
  scene?: Scene | null
): string {
  const head = context.length
    ? 'Các câu học viên vừa nói trước đó (CHỈ để hiểu mạch chuyện và đoán 반말/존댓말, TUYỆT ĐỐI không chấm lại các câu này):\n' +
      context.map((c) => '- ' + c).join('\n') +
      '\n\n'
    : '';
  return (
    head +
    formatSceneForPrompt(scene) + '\n\n' +
    'CÂU CẦN CHẤM: ' + text + '\n\n' +
    (mode === 'fix' ? FIX_FORMAT : DEEP_FORMAT)
  );
}
