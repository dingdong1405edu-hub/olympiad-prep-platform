/**
 * CHẤM CÂU "TẠO RA SỐ N TỪ CÁC CHỮ SỐ CHO TRƯỚC" (grading_mode = expression)
 * — AI_GRADING_SPEC.md §3.2.
 *
 * Câu 10 của đề ASMOPSS: dùng đúng ba chữ số 2, 4, 8 (mỗi số một lần) tạo ra
 * số 2. Có vô số lời giải đúng (`8-4-2`, `(8-4)/2`, `2^4/8`, `0.2*8+0.4`…) nên
 * không thể so chuỗi với đáp án mẫu — phải kiểm hai điều kiện độc lập:
 *   1. Tập chữ số dùng đúng bằng tập được cho (kể cả số lần dùng).
 *   2. Biểu thức tính ra đúng số đích.
 *
 * BẪY ĐÃ XỬ LÝ: `0.2` chỉ dùng chữ số 2 — số 0 ở đây là cách viết dấu thập
 * phân, không phải một chữ số được dùng. Đếm thô mọi ký tự số sẽ loại oan
 * `0.2*8+0.4`, vốn là một trong các đáp án mẫu của chính đề bài.
 */
import { MAX_EXPRESSION_LENGTH, evaluateExpression, normalizeSymbols } from './expr';

export interface ExpressionConfig {
  /** Các chữ số bắt buộc dùng, mỗi số đúng một lần. */
  digits: number[];
  target: number;
  tolerance?: number;
  maxLength?: number;
}

export interface ExpressionCheck {
  ok: boolean;
  /** Lý do trượt, viết cho học sinh tiểu học đọc. */
  reason?: string;
  /** Giá trị tính được — dùng cho ô xem trước ngay khi đang gõ. */
  value?: number;
}

/**
 * Bỏ số 0 đứng ngay trước dấu thập phân: `0.2` → `.2`, `10.5` giữ nguyên,
 * `(4*8)^0.2` → `(4*8)^.2`.
 */
function stripDecimalLeadingZero(expr: string): string {
  return expr.replace(/(^|[^0-9.])0(?=\.\d)/g, '$1');
}

export function checkExpression(input: string, config: ExpressionConfig): ExpressionCheck {
  const maxLength = config.maxLength ?? MAX_EXPRESSION_LENGTH;
  const raw = input.trim();

  if (raw === '') return { ok: false, reason: 'Em chưa viết biểu thức nào.' };
  if (raw.length > maxLength) {
    return { ok: false, reason: `Biểu thức quá dài (tối đa ${maxLength} ký tự).` };
  }

  const normalized = normalizeSymbols(raw);
  if (!/^[0-9+\-*/^().sqrt]+$/.test(normalized)) {
    return {
      ok: false,
      reason: 'Chỉ được dùng chữ số, dấu + − × ÷ ^ ( ) và căn bậc hai.',
    };
  }

  const used = (stripDecimalLeadingZero(normalized).match(/\d/g) ?? []).map(Number).sort();
  const needed = [...config.digits].sort();
  if (used.length !== needed.length || used.some((digit, index) => digit !== needed[index])) {
    return {
      ok: false,
      reason: `Phải dùng đúng các chữ số ${config.digits.join(', ')}, mỗi số một lần.`,
    };
  }

  const evaluated = evaluateExpression(normalized);
  if (!evaluated.ok) return { ok: false, reason: evaluated.error };

  const tolerance = config.tolerance ?? 1e-9;
  if (Math.abs(evaluated.value - config.target) > tolerance) {
    return {
      ok: false,
      reason: `Biểu thức của em bằng ${formatNumber(evaluated.value)}, không bằng ${config.target}.`,
      value: evaluated.value,
    };
  }

  return { ok: true, value: evaluated.value };
}

/** Bỏ đuôi 0.0000001 do dấu phẩy động sinh ra khi hiện số cho học sinh đọc. */
export function formatNumber(value: number): string {
  const rounded = Math.round(value * 1e9) / 1e9;
  return String(rounded);
}

/** Đọc `config` (JSON trong DB) thành tham số verifier; null nếu câu cấu hình sai. */
export function parseExpressionConfig(value: unknown): ExpressionConfig | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  const digits = record.digits;
  const target = record.target;
  if (!Array.isArray(digits) || digits.some((d) => typeof d !== 'number')) return null;
  if (typeof target !== 'number') return null;

  return {
    digits: digits as number[],
    target,
    tolerance: typeof record.tolerance === 'number' ? record.tolerance : undefined,
    maxLength: typeof record.max_length === 'number' ? record.max_length : undefined,
  };
}
