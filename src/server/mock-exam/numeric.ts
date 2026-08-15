/**
 * CHẤM ĐÁP SỐ (grading_mode = numeric) — AI_GRADING_SPEC.md §3.1.
 *
 * Nguyên tắc: so TƯƠNG ĐƯƠNG TOÁN HỌC, không so chuỗi. `27 7/18`, `493/18`,
 * `27.388889` và `27,388889` là cùng một đáp án; học sinh viết kiểu nào cũng
 * phải được điểm.
 *
 * Đơn vị viết kèm (`45°`, `9 cm`) bị cắt bỏ trước khi so, vì đề hỏi số đo thì
 * kèm đơn vị là ĐÚNG, không phải sai.
 */
import { evaluateExpression, normalizeSymbols } from './expr';

/** Đơn vị/hậu tố cho phép viết kèm đáp số. Cắt xong mới đối chiếu. */
const TRAILING_UNIT =
  /\s*(°|đô|độ|do|degrees?|cm2|cm²|cm3|cm³|cm|dm2|dm²|dm|mm2|mm²|mm|m2|m²|m3|m³|m|km|kg|g|lít|lit|l|giây|phút|giờ|đơn\s*vị|dv|điểm|tuổi|cách|số|units?)\s*$/i;

/**
 * Đưa một đáp số do người gõ về dạng số. Trả `null` nếu không hiểu được.
 *
 * Chấp nhận (theo đúng thứ tự thử):
 *   "27 7/18" (hỗn số) · "493/18" · "27,388889" · "45°" · "64-8" (biểu thức)
 */
export function normalizeNumeric(input: string): number | null {
  if (typeof input !== 'string') return null;

  let s = input.trim();
  if (s === '') return null;

  // Cắt tối đa hai lớp hậu tố: "45 độ", "9 cm²".
  for (let i = 0; i < 2; i += 1) s = s.replace(TRAILING_UNIT, '').trim();
  if (s === '') return null;

  // Hỗn số phải bắt trước, vì "27 7/18" mà bỏ khoảng trắng sẽ thành "277/18".
  const mixed = s
    .replace(/[−–—]/g, '-')
    .match(/^([+-]?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const denominator = Number(mixed[4]);
    if (denominator === 0) return null;
    const magnitude = Number(mixed[2]) + Number(mixed[3]) / denominator;
    return mixed[1] === '-' ? -magnitude : magnitude;
  }

  const evaluated = evaluateExpression(normalizeSymbols(s));
  return evaluated.ok ? evaluated.value : null;
}

/**
 * So đáp án học sinh với đáp án chuẩn.
 *
 * `tolerance` lấy từ `answer_key.tolerance` của từng câu (mặc định 1e-6). Với
 * đáp số lớn, sai số tuyệt đối 1e-6 là quá gắt nên có thêm nhánh sai số tương
 * đối — `1000000.0000005` vẫn phải bằng `1000000`.
 */
export function checkNumeric(user: string, key: string, tolerance = 1e-6): boolean {
  const a = normalizeNumeric(user);
  const b = normalizeNumeric(key);
  if (a === null || b === null) return false;

  const diff = Math.abs(a - b);
  if (diff <= tolerance) return true;
  return diff <= tolerance * Math.abs(b);
}
