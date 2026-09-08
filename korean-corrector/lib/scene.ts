// Theo doi hoan canh hoi thoai. Tach rieng khoi UI de test duoc phan quyet dinh
// "co thay scene khong" ma khong can goi model.

export interface Scene {
  topic: string;
  setting: string;
  interlocutor: string;
  register: string; // '반말' | '존댓말' | ''
}

/** Model tra ve scene kem co `changed`. */
export interface SceneReport extends Scene {
  changed?: boolean;
}

export const EMPTY_SCENE: Scene = { topic: '', setting: '', interlocutor: '', register: '' };

export const SCENE_FIELDS: (keyof Scene)[] = ['topic', 'setting', 'interlocutor', 'register'];

export function isEmptyScene(s: Scene | null | undefined): boolean {
  return !s || SCENE_FIELDS.every((k) => !String(s[k] || '').trim());
}

const clean = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 120) : '');

/** Loc scene tho tu model ve dung 4 truong. */
export function normalizeScene(raw: any): Scene {
  return {
    topic: clean(raw?.topic),
    setting: clean(raw?.setting),
    interlocutor: clean(raw?.interlocutor),
    register: raw?.register === '반말' || raw?.register === '존댓말' ? raw.register : '',
  };
}

/** "Đặt tình huống trước" -> scene khởi tạo. */
export function sceneFromPreset(preset: string): Scene {
  return { ...EMPTY_SCENE, topic: clean(preset) };
}

export function sceneLabel(s: Scene): string {
  return SCENE_FIELDS.map((k) => String(s[k] || '').trim()).filter(Boolean).join(' · ');
}

export interface SceneState {
  scene: Scene;
  /** Số lần changed=true LIÊN TIẾP — chỉ dùng khi scene bị khoá bởi "đặt tình huống trước". */
  pending: number;
}

export const INITIAL_SCENE_STATE: SceneState = { scene: EMPTY_SCENE, pending: 0 };

export type SceneOutcome = 'replaced' | 'merged' | 'held';

export interface SceneStep {
  state: SceneState;
  outcome: SceneOutcome;
}

/**
 * Áp một báo cáo scene từ model vào state hiện tại.
 *
 * - changed=false → giữ nguyên scene, chỉ điền vào các trường ĐANG TRỐNG.
 * - changed=true, scene không khoá → thay hẳn.
 * - changed=true, scene bị khoá (do "đặt tình huống trước") → phải changed=true
 *   HAI LẦN LIÊN TIẾP mới thay; lần đầu chỉ ghi nhận (outcome 'held').
 */
export function reduceScene(
  state: SceneState,
  report: SceneReport | null | undefined,
  locked: boolean
): SceneStep {
  if (!report) return { state, outcome: 'merged' };
  const incoming = normalizeScene(report);
  const changed = report.changed === true;

  if (!changed) {
    // Cập nhật nhẹ: chỉ lấp chỗ trống, không ghi đè thông tin đã có.
    const merged: Scene = { ...state.scene };
    for (const k of SCENE_FIELDS) {
      if (!String(merged[k] || '').trim() && incoming[k]) merged[k] = incoming[k];
    }
    return { state: { scene: merged, pending: 0 }, outcome: 'merged' };
  }

  if (locked && state.pending < 1) {
    // Lần lệch đầu tiên khi đã đặt tình huống trước — chưa đổi vội.
    return { state: { scene: state.scene, pending: state.pending + 1 }, outcome: 'held' };
  }

  if (isEmptyScene(incoming)) {
    return { state: { scene: state.scene, pending: 0 }, outcome: 'merged' };
  }
  return { state: { scene: incoming, pending: 0 }, outcome: 'replaced' };
}

/** Khối HOÀN CẢNH đưa vào user message (KHÔNG để trong system prompt — scene đổi liên tục sẽ phá cache). */
export function formatSceneForPrompt(s: Scene | null | undefined): string {
  if (isEmptyScene(s)) {
    return 'HOÀN CẢNH HIỆN TẠI: (chưa có — hãy tự suy ra từ câu này và các câu ngữ cảnh)';
  }
  const v = s!;
  const bits = [
    'chủ đề = ' + (v.topic || '?'),
    'địa điểm/tình huống = ' + (v.setting || '?'),
    'đang nói với = ' + (v.interlocutor || '?'),
    'lối nói = ' + (v.register || '?'),
  ];
  return 'HOÀN CẢNH HIỆN TẠI: ' + bits.join('; ');
}
