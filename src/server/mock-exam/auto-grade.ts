/**
 * TẦNG CHẤM KHÔNG CẦN AI (AI_GRADING_SPEC.md §3).
 *
 * Luật số một của cả tính năng này: **không bao giờ để AI chấm những gì code
 * chấm được.** Bốn kiểu dưới đây chấm bằng thuật toán — kết quả tất định, miễn
 * phí, không cần chờ mạng, và đúng 100% nên trang kết quả có phần điểm không
 * bao giờ phải bàn cãi.
 */
import type { MockGradingMode } from '@prisma/client';
import { checkNumeric, normalizeNumeric } from './numeric';
import { checkExpression, parseExpressionConfig } from './expression';

export interface AutoGradeInput {
  gradingMode: MockGradingMode;
  maxPoints: number;
  answerKey: unknown;
  config: unknown;
  /** Đáp án dạng chữ: trắc nghiệm, đáp số, biểu thức. */
  answerText: string | null;
  /** Đáp án dạng lưới (câu 15). */
  answerJson: unknown;
}

export interface AutoGradeResult {
  correct: boolean;
  awarded: number;
  /** Ghi lại vì sao — hiện ở trang kết quả và ở màn hình giáo viên. */
  detail: { reason?: string; expected?: string; matchedCells?: number; totalCells?: number };
  /** Đúng một phần nhưng luật chấm là được ăn cả — nhờ người xem lại. */
  needsReview: boolean;
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** Chuẩn hóa đáp án trắc nghiệm: bỏ khoảng trắng, bỏ dấu chấm, viết hoa. */
function normalizeChoice(value: string): string {
  return value.trim().replace(/[.)\s]/g, '').toUpperCase();
}

function gradeExact(input: AutoGradeInput): AutoGradeResult {
  const key = readRecord(input.answerKey);
  const expected = typeof key.value === 'string' ? key.value : String(key.value ?? '');
  const given = input.answerText ?? '';

  if (given.trim() === '') {
    return {
      correct: false,
      awarded: 0,
      detail: { reason: 'Em chưa chọn đáp án.', expected },
      needsReview: false,
    };
  }

  const correct = normalizeChoice(given) === normalizeChoice(expected);
  return {
    correct,
    awarded: correct ? input.maxPoints : 0,
    detail: { expected, reason: correct ? undefined : `Đáp án đúng là ${expected}.` },
    needsReview: false,
  };
}

function gradeNumericAnswer(input: AutoGradeInput): AutoGradeResult {
  const key = readRecord(input.answerKey);
  const expectedRaw = typeof key.value === 'string' ? key.value : String(key.value ?? '');
  const display = typeof key.display === 'string' ? key.display : expectedRaw;
  const tolerance = typeof key.tolerance === 'number' ? key.tolerance : 1e-6;
  const given = input.answerText ?? '';

  if (given.trim() === '') {
    return {
      correct: false,
      awarded: 0,
      detail: { reason: 'Em chưa điền đáp số.', expected: display },
      needsReview: false,
    };
  }

  if (normalizeNumeric(given) === null) {
    return {
      correct: false,
      awarded: 0,
      detail: {
        reason: 'Không đọc được đáp số em viết. Hãy viết dạng số, phân số (7/18) hoặc hỗn số (27 7/18).',
        expected: display,
      },
      // Máy không hiểu chữ học sinh viết thì đừng vội cho 0 — để người xem lại.
      needsReview: true,
    };
  }

  const correct = checkNumeric(given, expectedRaw, tolerance);
  return {
    correct,
    awarded: correct ? input.maxPoints : 0,
    detail: { expected: display, reason: correct ? undefined : `Đáp án đúng là ${display}.` },
    needsReview: false,
  };
}

function gradeExpressionAnswer(input: AutoGradeInput): AutoGradeResult {
  const config = parseExpressionConfig(input.config);
  if (!config) {
    return {
      correct: false,
      awarded: 0,
      detail: { reason: 'Câu này thiếu cấu hình verifier nên chưa chấm được.' },
      needsReview: true,
    };
  }

  const given = input.answerText ?? '';
  if (given.trim() === '') {
    return {
      correct: false,
      awarded: 0,
      detail: { reason: 'Em chưa viết biểu thức nào.' },
      needsReview: false,
    };
  }

  const check = checkExpression(given, config);
  return {
    correct: check.ok,
    awarded: check.ok ? input.maxPoints : 0,
    detail: {
      reason: check.reason,
      expected: `Một biểu thức dùng đúng các chữ số ${config.digits.join(', ')} và bằng ${config.target}`,
    },
    needsReview: false,
  };
}

/** Đọc mảng 2 chiều các ô, chấp nhận cả `null` cho ô bỏ trống. */
function readGrid(value: unknown): (string | null)[][] | null {
  if (!Array.isArray(value)) return null;
  const rows: (string | null)[][] = [];
  for (const row of value) {
    if (!Array.isArray(row)) return null;
    rows.push(row.map((cell) => (typeof cell === 'string' && cell !== '' ? cell : null)));
  }
  return rows;
}

function gradeGrid(input: AutoGradeInput): AutoGradeResult {
  const key = readRecord(input.answerKey);
  const expected = readGrid(key.grid);
  const given = readGrid(input.answerJson);

  if (!expected) {
    return {
      correct: false,
      awarded: 0,
      detail: { reason: 'Câu này thiếu đáp án lưới nên chưa chấm được.' },
      needsReview: true,
    };
  }

  const totalCells = expected.reduce((sum, row) => sum + row.length, 0);

  if (!given) {
    return {
      correct: false,
      awarded: 0,
      detail: { reason: 'Em chưa vẽ dấu nào vào lưới.', matchedCells: 0, totalCells },
      needsReview: false,
    };
  }

  let matched = 0;
  for (const [r, row] of expected.entries()) {
    for (const [c, cell] of row.entries()) {
      if (given[r]?.[c] === cell) matched += 1;
    }
  }

  const correct = matched === totalCells;
  return {
    correct,
    awarded: correct ? input.maxPoints : 0,
    detail: {
      matchedCells: matched,
      totalCells,
      reason: correct ? undefined : `Em vẽ đúng ${matched}/${totalCells} ô.`,
    },
    // Sai 1–2 ô thường là lệch một hàng chứ không phải không hiểu bài; luật chấm
    // là được ăn cả nên đánh dấu để giáo viên quyết định có cho điểm phần không.
    needsReview: !correct && matched >= totalCells - 2,
  };
}

/**
 * Chấm một câu bằng thuật toán. Trả `null` nếu câu đó phải nhờ AI (essay) —
 * chỗ gọi tự biết đường đẩy sang pipeline chấm tự luận.
 */
export function autoGrade(input: AutoGradeInput): AutoGradeResult | null {
  switch (input.gradingMode) {
    case 'EXACT':
      return gradeExact(input);
    case 'NUMERIC':
      return gradeNumericAnswer(input);
    case 'EXPRESSION':
      return gradeExpressionAnswer(input);
    case 'GRID':
      return gradeGrid(input);
    case 'ESSAY':
      return null;
    default:
      return null;
  }
}
