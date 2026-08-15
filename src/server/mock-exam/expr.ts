/**
 * BỘ TÍNH BIỂU THỨC TOÁN AN TOÀN.
 *
 * Dùng cho hai chỗ: chấm câu "tạo ra số 2 từ ba chữ số" (grading_mode =
 * expression) và chuẩn hóa đáp án dạng số khi học sinh gõ `64-8` thay vì `56`.
 *
 * VÌ SAO TỰ VIẾT THAY VÌ DÙNG math.js (spec §3.1 gợi ý):
 *  1. `eval()` của JS thì tuyệt đối không — đây là chuỗi do người dùng gõ.
 *  2. math.js kéo thêm ~600KB vào bundle cho đúng bảy phép toán mà đề cần.
 *  3. Ngữ pháp ở đây đóng kín: chỉ số, + − × ÷ ^ ( ) và căn bậc hai. Không có
 *     biến, không có hàm, không có tên định danh nào để mà chèn thứ lạ vào.
 * Đổi lại phải tự lo hai chuyện dưới đây, đã lo:
 *  - Độ sâu đệ quy: chặn ở độ dài chuỗi (MAX_LENGTH), không có input nào đủ dài
 *    để làm tràn ngăn xếp.
 *  - Kết quả vô nghĩa: chia 0, căn số âm → `Infinity`/`NaN`, bị chặn ở cuối.
 */

/** Chuỗi dài hơn ngần này không phải lời giải, là nghịch (spec §3.2). */
export const MAX_EXPRESSION_LENGTH = 200;

export type EvalResult = { ok: true; value: number } | { ok: false; error: string };

/** Đưa các ký hiệu toán học người Việt hay gõ về dạng máy hiểu. */
export function normalizeSymbols(input: string): string {
  return input
    .replace(/[×⋅·]/g, '*')
    .replace(/[÷:]/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/[,]/g, '.')
    .replace(/√/g, 'sqrt')
    .replace(/\*\*/g, '^')
    .replace(/\s+/g, '');
}

class Parser {
  private pos = 0;

  constructor(private readonly src: string) {}

  parse(): number {
    const value = this.parseSum();
    this.skipNothing();
    if (this.pos < this.src.length) {
      throw new Error(`Không hiểu ký tự "${this.src[this.pos]}" ở vị trí ${this.pos + 1}.`);
    }
    return value;
  }

  private skipNothing(): void {
    // Chuỗi đã bị bỏ hết khoảng trắng ở normalizeSymbols — giữ hàm này để chỗ
    // gọi đọc rõ ý "không cần bỏ qua gì nữa".
  }

  private peek(): string | undefined {
    return this.src[this.pos];
  }

  private eat(char: string): boolean {
    if (this.src[this.pos] === char) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  /** sum := product (('+' | '-') product)* */
  private parseSum(): number {
    let value = this.parseProduct();
    for (;;) {
      if (this.eat('+')) value += this.parseProduct();
      else if (this.eat('-')) value -= this.parseProduct();
      else return value;
    }
  }

  /** product := unary (('*' | '/') unary)* */
  private parseProduct(): number {
    let value = this.parseUnary();
    for (;;) {
      if (this.eat('*')) value *= this.parseUnary();
      else if (this.eat('/')) {
        const divisor = this.parseUnary();
        if (divisor === 0) throw new Error('Chia cho 0.');
        value /= divisor;
      } else return value;
    }
  }

  /** unary := ('-' | '+')* power */
  private parseUnary(): number {
    if (this.eat('-')) return -this.parseUnary();
    if (this.eat('+')) return this.parseUnary();
    return this.parsePower();
  }

  /**
   * power := atom ('^' unary)?
   *
   * Số mũ đi qua `parseUnary` để `2^-5` đọc được, và kết hợp phải sang trái
   * (`2^3^2` = 2^9) đúng quy ước toán học.
   */
  private parsePower(): number {
    const base = this.parseAtom();
    if (this.eat('^')) {
      const exponent = this.parseUnary();
      const result = Math.pow(base, exponent);
      if (Number.isNaN(result)) throw new Error('Lũy thừa không xác định.');
      return result;
    }
    return base;
  }

  /** atom := number | '(' sum ')' | 'sqrt' '(' sum ')' | 'sqrt' atom */
  private parseAtom(): number {
    if (this.eat('(')) {
      const value = this.parseSum();
      if (!this.eat(')')) throw new Error('Thiếu dấu ngoặc đóng.');
      return value;
    }

    if (this.src.startsWith('sqrt', this.pos)) {
      this.pos += 4;
      // Cho phép cả `sqrt(9)` lẫn `sqrt9` — học sinh viết căn không ngoặc rất thường.
      const inner = this.parseAtom();
      if (inner < 0) throw new Error('Căn bậc hai của số âm.');
      return Math.sqrt(inner);
    }

    const start = this.pos;
    while (this.pos < this.src.length && /[0-9]/.test(this.src[this.pos]!)) this.pos += 1;
    if (this.peek() === '.') {
      this.pos += 1;
      while (this.pos < this.src.length && /[0-9]/.test(this.src[this.pos]!)) this.pos += 1;
    }

    const text = this.src.slice(start, this.pos);
    if (text === '' || text === '.') {
      throw new Error(
        this.pos >= this.src.length
          ? 'Biểu thức bị cụt.'
          : `Không hiểu ký tự "${this.src[this.pos]}" ở vị trí ${this.pos + 1}.`,
      );
    }
    return Number(text);
  }
}

/**
 * Tính giá trị một biểu thức. KHÔNG ném lỗi — mọi thất bại trả về `ok: false`
 * kèm lý do đọc được, vì lý do này hiện thẳng lên màn hình học sinh.
 */
export function evaluateExpression(raw: string): EvalResult {
  const input = raw.trim();
  if (input === '') return { ok: false, error: 'Chưa nhập gì.' };
  if (input.length > MAX_EXPRESSION_LENGTH) {
    return { ok: false, error: `Biểu thức quá dài (tối đa ${MAX_EXPRESSION_LENGTH} ký tự).` };
  }

  const normalized = normalizeSymbols(input);
  if (!/^[0-9+\-*/^().sqrt]+$/.test(normalized)) {
    return { ok: false, error: 'Biểu thức chứa ký tự không hợp lệ.' };
  }

  try {
    const value = new Parser(normalized).parse();
    if (!Number.isFinite(value)) return { ok: false, error: 'Kết quả không xác định.' };
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Không đọc được biểu thức.' };
  }
}
