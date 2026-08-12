/**
 * CHẤM MỘT CÂU TRẢ LỜI (specs §9.2).
 *
 * Hàm THUẦN: không DB, không cấu hình, không I/O → kiểm thử độc lập bằng vitest.
 * Mọi ràng buộc chấm điểm nằm ở đây để lớp trên (learning/service.ts) chỉ lo
 * ghi nhận kết quả và cập nhật hồ sơ năng lực.
 *
 * Quy ước nghiệp vụ:
 *  - Học sinh Việt Nam gõ "1,5" thay vì "1.5" → phải chấp nhận cả hai.
 *  - Đáp án tự luận ngắn chấp nhận nhiều biến thể → `correctAnswer` được phép là mảng.
 *  - Bỏ trống / null KHÔNG bao giờ ném lỗi: đó là câu chưa làm, không phải sự cố.
 */
import type { QuestionType } from '@prisma/client';

export interface GradeResult {
  isCorrect: boolean;
  /** Dạng đã chuẩn hóa để lưu vào ItemAttempt.answer — luôn tái hiện được lựa chọn của học sinh. */
  normalizedAnswer: unknown;
  /** Chỉ điền khi cần nói rõ vì sao không chấm được (bỏ trống, sai định dạng, thiếu đáp án chuẩn). */
  message?: string;
}

export interface GradableItem {
  questionType: QuestionType;
  correctAnswer: unknown;
  /** Sai số cho phép của câu điền số; bỏ trống = phải khớp tuyệt đối. */
  answerTolerance?: number | null;
}

/** Bù sai số dấu phẩy động của IEEE-754, không phải sai số nghiệp vụ. */
const FLOAT_EPSILON = 1e-9;

/** Dấu câu ở CUỐI đáp án tự luận không mang nghĩa → bỏ trước khi so sánh. */
const TRAILING_PUNCTUATION = /[.,;:!?…]+$/u;

// ---------------------------------------------------------------------------
// Chuẩn hóa
// ---------------------------------------------------------------------------

function collapseSpaces(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

/** Dạng so sánh của đáp án tự luận: gộp khoảng trắng, bỏ hoa thường, bỏ dấu câu cuối. */
function canonicalText(value: string): string {
  return collapseSpaces(value).toLowerCase().replace(TRAILING_PUNCTUATION, '').trim();
}

/** Dạng so sánh của khóa phương án: chỉ bỏ khoảng trắng và hoa thường. */
function canonicalKey(value: string): string {
  return collapseSpaces(value).toLowerCase();
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.filter((v) => !isBlank(v)).length === 0;
  return false;
}

/**
 * Đọc số theo cách viết của người Việt:
 *   "1,5" → 1.5 | "1.234,5" → 1234.5 | "1,234,567" → 1234567 | " 12 " → 12
 * Một dấu phẩy duy nhất luôn được hiểu là dấu thập phân (quy ước VN).
 */
function parseNumberLoose(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  let text = value.replace(/\s+/gu, '');
  if (text === '') return null;
  text = text.replace(/^\+/, '');

  const hasDot = text.includes('.');
  const hasComma = text.includes(',');

  if (hasDot && hasComma) {
    // Dấu nào đứng sau cùng thì dấu đó là thập phân, dấu còn lại là phân cách nghìn.
    text =
      text.lastIndexOf(',') > text.lastIndexOf('.')
        ? text.replace(/\./gu, '').replace(',', '.')
        : text.replace(/,/gu, '');
  } else if (hasComma) {
    const parts = text.split(',');
    text = parts.length === 2 ? parts.join('.') : parts.join('');
  } else if (hasDot) {
    const parts = text.split('.');
    if (parts.length > 2) text = parts.join('');
  }

  if (!/^-?\d*\.?\d+$/u.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Tách danh sách lựa chọn từ mảng hoặc chuỗi kiểu "A,C" / "A; C". */
function toChoiceList(value: unknown): string[] {
  const raw: unknown[] = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const entry of raw) {
    if (entry === null || entry === undefined) continue;
    if (typeof entry === 'number' || typeof entry === 'boolean') {
      out.push(String(entry));
      continue;
    }
    if (typeof entry !== 'string') continue;
    for (const piece of entry.split(/[,;|]/u)) {
      const trimmed = piece.trim();
      if (trimmed !== '') out.push(trimmed);
    }
  }
  return out;
}

/** Danh sách đáp án chuẩn dạng chữ — hỗ trợ `correctAnswer` là mảng nhiều biến thể. */
function toTextList(value: unknown): string[] {
  const raw: unknown[] = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const entry of raw) {
    if (entry === null || entry === undefined) continue;
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      const text = String(entry).trim();
      if (text !== '') out.push(text);
    }
  }
  return out;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

// ---------------------------------------------------------------------------

const EMPTY_MESSAGE = 'Bạn chưa chọn hoặc chưa nhập đáp án.';
const MISSING_KEY_MESSAGE =
  'Câu hỏi này chưa có đáp án chuẩn hợp lệ. Hãy bấm "Báo lỗi câu hỏi" để chúng tôi kiểm tra.';

export function gradeAnswer(item: GradableItem, answer: unknown): GradeResult {
  if (isBlank(answer)) {
    return { isCorrect: false, normalizedAnswer: null, message: EMPTY_MESSAGE };
  }

  switch (item.questionType) {
    case 'SINGLE_CHOICE':
      return gradeSingleChoice(item, answer);
    case 'MULTIPLE_CHOICE':
      return gradeMultipleChoice(item, answer);
    case 'NUMERIC':
      return gradeNumeric(item, answer);
    case 'SHORT_ANSWER':
      return gradeShortAnswer(item, answer);
    default:
      // Kiểu câu hỏi mới chưa có luật chấm riêng → chấm như trả lời ngắn.
      return gradeShortAnswer(item, answer);
  }
}

// ---------------------------------------------------------------------------

function gradeSingleChoice(item: GradableItem, answer: unknown): GradeResult {
  const picked = toChoiceList(answer);
  if (picked.length === 0) {
    return { isCorrect: false, normalizedAnswer: null, message: EMPTY_MESSAGE };
  }

  const accepted = unique(toChoiceList(item.correctAnswer).map(canonicalKey));
  if (accepted.length === 0) {
    return { isCorrect: false, normalizedAnswer: picked[0], message: MISSING_KEY_MESSAGE };
  }

  if (picked.length > 1) {
    return {
      isCorrect: false,
      normalizedAnswer: picked,
      message: 'Câu này chỉ được chọn một phương án.',
    };
  }

  const choice = picked[0]!;
  return { isCorrect: accepted.includes(canonicalKey(choice)), normalizedAnswer: choice };
}

function gradeMultipleChoice(item: GradableItem, answer: unknown): GradeResult {
  const pickedRaw = toChoiceList(answer);
  if (pickedRaw.length === 0) {
    return { isCorrect: false, normalizedAnswer: null, message: EMPTY_MESSAGE };
  }

  // Sắp xếp để lựa chọn lưu lại ổn định, nhưng giữ nguyên chữ hoa thường học sinh gửi lên.
  const normalizedAnswer = unique(pickedRaw.map((v) => v.trim())).sort((a, b) =>
    canonicalKey(a).localeCompare(canonicalKey(b)),
  );

  const expected = unique(toChoiceList(item.correctAnswer).map(canonicalKey));
  if (expected.length === 0) {
    return { isCorrect: false, normalizedAnswer, message: MISSING_KEY_MESSAGE };
  }

  const picked = unique(pickedRaw.map(canonicalKey));
  // Đúng khi HAI TẬP HỢP trùng khớp hoàn toàn — thứ tự chọn không quan trọng.
  const isCorrect = picked.length === expected.length && picked.every((key) => expected.includes(key));

  return {
    isCorrect,
    normalizedAnswer,
    message: isCorrect ? undefined : 'Bạn chọn còn thiếu hoặc thừa phương án.',
  };
}

function gradeNumeric(item: GradableItem, answer: unknown): GradeResult {
  const value = parseNumberLoose(Array.isArray(answer) ? answer[0] : answer);
  if (value === null) {
    return {
      isCorrect: false,
      normalizedAnswer: null,
      message: 'Đáp án của câu này phải là một số. Bạn có thể dùng dấu phẩy thập phân, ví dụ 1,5.',
    };
  }

  const targets = (Array.isArray(item.correctAnswer) ? item.correctAnswer : [item.correctAnswer])
    .map(parseNumberLoose)
    .filter((v): v is number => v !== null);
  if (targets.length === 0) {
    return { isCorrect: false, normalizedAnswer: value, message: MISSING_KEY_MESSAGE };
  }

  const tolerance = Math.abs(item.answerTolerance ?? 0);
  const isCorrect = targets.some((target) => Math.abs(value - target) <= tolerance + FLOAT_EPSILON);

  return { isCorrect, normalizedAnswer: value };
}

function gradeShortAnswer(item: GradableItem, answer: unknown): GradeResult {
  const raw = Array.isArray(answer) ? answer[0] : answer;
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return { isCorrect: false, normalizedAnswer: null, message: EMPTY_MESSAGE };
  }

  const text = collapseSpaces(String(raw));
  if (text === '') {
    return { isCorrect: false, normalizedAnswer: null, message: EMPTY_MESSAGE };
  }

  const targets = toTextList(item.correctAnswer);
  if (targets.length === 0) {
    return { isCorrect: false, normalizedAnswer: text, message: MISSING_KEY_MESSAGE };
  }

  const canonical = canonicalText(text);
  if (targets.some((target) => canonicalText(target) === canonical)) {
    return { isCorrect: true, normalizedAnswer: text };
  }

  // Đáp án chuẩn là một con số → vẫn phải chấp nhận "1,5" khi chuẩn ghi "1.5".
  const value = parseNumberLoose(text);
  if (value !== null) {
    const numericTargets = targets
      .map(parseNumberLoose)
      .filter((v): v is number => v !== null);
    const tolerance = Math.abs(item.answerTolerance ?? 0);
    if (numericTargets.some((target) => Math.abs(value - target) <= tolerance + FLOAT_EPSILON)) {
      return { isCorrect: true, normalizedAnswer: text };
    }
  }

  return { isCorrect: false, normalizedAnswer: text };
}
