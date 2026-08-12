/**
 * BỘ SINH CÂU HỎI ĐẠI SỐ NHẬP MÔN.
 *
 *   EXPR — biểu thức đại số: thay số, thu gọn, phá ngoặc, lập biểu thức từ lời văn
 *   EQ   — phương trình bậc nhất một ẩn: ax + b = c, có ngoặc, chứa mẫu, bài toán lập PT
 *   INEQ — so sánh, bất đẳng thức kép, giá trị lớn nhất/nhỏ nhất
 *   SEQ  — dãy số: quy luật, số hạng thứ n, tổng, đếm số hạng
 *
 * Ba quy tắc bất di bất dịch, giống hệt `generators.ts`:
 *  1. Đáp án và lời giải luôn được TÍNH RA từ tham số vừa sinh — không viết tay.
 *  2. Số liệu chọn NGƯỢC từ nghiệm/đáp án đẹp ⇒ không bao giờ ra số lẻ xấu.
 *  3. Nhiễu là LỖI SAI CÓ THẬT (sai dấu khi chuyển vế, quên nhân phân phối,
 *     quên khử mẫu một hạng tử, quên +1 khi đếm số hạng, quên chia đôi khi tính tổng).
 *
 * LƯU Ý VỀ `ctx.slot`: bộ khung gán lvl = slot % 3, nên slot % 3 LUÔN bằng lvl.
 * Muốn đổi DẠNG đề trong cùng một mức độ phải dùng `Math.floor(slot / 3)`.
 *
 * File này KHÔNG import gì từ `src/` (tsx không đọc `paths` của tsconfig).
 */
import type { Draft, Gen, GenCtx } from './generators';
import { fNum, fStr, fmt, frac, gcd, lcm, nd, pick, ri, sc, td } from './generators';

type Frac = ReturnType<typeof frac>;

// ===========================================================================
// TIỆN ÍCH RIÊNG CỦA NHÓM ĐẠI SỐ
// ===========================================================================

/** Số hiển thị trong đề bài: dùng dấu trừ Unicode cho đúng kiểu sách giáo khoa. */
function ns(x: number): string {
  return fmt(x).replace('-', '−');
}

/** Số âm ghép vào biểu thức phải bọc ngoặc: 12 × (−3). */
function pn(x: number): string {
  return x < 0 ? `(${ns(x)})` : ns(x);
}

/** Phân số hiển thị (đã tối giản) với dấu trừ Unicode. */
function fs(f: Frac): string {
  return fStr(f).replace('-', '−');
}

/** Phân số âm khi ghép vào phép nhân phải bọc ngoặc: 6 × (−4/3). */
function pf(f: Frac): string {
  return f.n < 0 ? `(${fs(f)})` : fs(f);
}

/** Hạng tử "hệ số × phần biến": hệ số 1 thì bỏ số 1, phần biến rỗng thì chỉ in số. */
function ax(a: number, v = 'x'): string {
  const sign = a < 0 ? '−' : '';
  const m = Math.abs(a);
  if (v === '') return `${sign}${fmt(m)}`;
  return `${sign}${m === 1 ? '' : fmt(m)}${v}`;
}

/** Ghép đa thức từ danh sách [hệ số, phần biến]; bỏ hạng tử có hệ số 0. */
function poly(terms: [number, string][]): string {
  let out = '';
  for (const [c, v] of terms) {
    if (c === 0) continue;
    const body = ax(Math.abs(c), v);
    if (out === '') out = c < 0 ? `−${body}` : body;
    else out += c < 0 ? ` − ${body}` : ` + ${body}`;
  }
  return out === '' ? '0' : out;
}

/** Nhị thức bậc nhất ax + b dạng hiển thị. */
function lin(a: number, b: number, v = 'x'): string {
  return poly([
    [a, v],
    [b, ''],
  ]);
}

/** Lọc nhiễu SỐ rồi đổi sang dấu trừ Unicode để khớp với đề bài. */
function ndU(correct: number, cands: number[], allowFraction = false): string[] {
  return nd(correct, cands, allowFraction).map((t) => t.replace('-', '−'));
}

/** Phân số an toàn: mẫu 0 (do nhiễu tính ra) thì bỏ hẳn ứng viên đó. */
function sfrac(n: number, d: number): Frac | null {
  return d === 0 ? null : frac(n, d);
}

/** Lọc nhiễu dạng phân số. */
function fdU(correct: Frac, cands: (Frac | null)[]): string[] {
  return td(
    fs(correct),
    cands.filter((c): c is Frac => c !== null).map((c) => fs(c)),
  );
}

/** Liệt kê các số nguyên trong [lo; hi] thỏa mãn điều kiện — nguồn chân lý cho mọi bài đếm. */
function intsWhere(lo: number, hi: number, ok: (x: number) => boolean): number[] {
  const out: number[] = [];
  for (let x = lo; x <= hi; x++) if (ok(x)) out.push(x);
  return out;
}

function sum(list: number[]): number {
  return list.reduce((a, b) => a + b, 0);
}

// ===========================================================================
// CHƯƠNG EXPR — BIỂU THỨC ĐẠI SỐ
// ===========================================================================

/** EXPR01 — tính giá trị biểu thức tại giá trị cho trước của biến. */
function EXPR01(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const v = Math.floor(slot / 3);

  if (lvl === 0) {
    if (v % 2 === 0) {
      const a = ri(r, 2, 9);
      const b = ri(r, 3, 25);
      const x = ri(r, 2, 12);
      const val = a * x + b;
      return {
        stem: `Tính giá trị của biểu thức A = ${lin(a, b)} tại x = ${x}.`,
        correct: ns(val),
        numeric: val,
        distractors: ndU(val, [a * (x + b), a + x + b, a * x - b, (a + b) * x, val + a]),
        solution: `Thay x = ${x} vào biểu thức rồi tính theo thứ tự nhân trước, cộng sau: A = ${a} × ${x} + ${b} = ${a * x} + ${b} = ${val}. Nếu cộng ${x} với ${b} trước rồi mới nhân sẽ ra ${a * (x + b)} — đó là giá trị của biểu thức ${a}(x + ${b}), không phải của A.`,
        steps: [`Thay x = ${x}: A = ${a} × ${x} + ${b}`, `${a} × ${x} = ${a * x}`, `A = ${a * x} + ${b} = ${val}`],
        hint: 'Thay số vào rồi giữ đúng thứ tự phép tính: nhân trước, cộng sau.',
        tags: ['biểu thức đại số', 'thay số'],
      };
    }
    const a = ri(r, 2, 9);
    const b = ri(r, 20, 60);
    const x = ri(r, 2, 12);
    const val = b - a * x;
    return {
      stem: `Tính giá trị của biểu thức B = ${poly([
        [b, ''],
        [-a, 'x'],
      ])} tại x = ${x}.`,
      correct: ns(val),
      numeric: val,
      distractors: ndU(val, [a * x - b, b + a * x, b - a - x, (b - a) * x, val - a]),
      solution: `Thay x = ${x}: B = ${b} − ${a} × ${x} = ${b} − ${a * x} = ${ns(val)}. Phải nhân ${a} với ${x} trước rồi mới lấy ${b} trừ đi; đảo ngược phép trừ sẽ ra ${ns(a * x - b)} là sai dấu.`,
      steps: [`Thay x = ${x}: B = ${b} − ${a} × ${x}`, `${a} × ${x} = ${a * x}`, `B = ${b} − ${a * x} = ${ns(val)}`],
      hint: 'Nhân trước rồi mới trừ, và giữ nguyên thứ tự "số lớn trừ đi tích".',
      tags: ['biểu thức đại số', 'thay số'],
    };
  }

  if (lvl === 1) {
    if (v % 2 === 0) {
      const a = ri(r, 2, 9);
      const b = ri(r, 2, 9);
      const x = ri(r, 2, 10);
      const y = -ri(r, 2, 9);
      const val = a * x + b * y;
      return {
        stem: `Tính giá trị của biểu thức C = ${poly([
          [a, 'x'],
          [b, 'y'],
        ])} tại x = ${x} và y = ${ns(y)}.`,
        correct: ns(val),
        numeric: val,
        distractors: ndU(val, [a * x + b * Math.abs(y), a * x - b * y, a * y + b * x, (a + b) * (x + y), val + b]),
        solution: `Thay x = ${x}, y = ${ns(y)}: C = ${a} × ${x} + ${b} × (${ns(y)}) = ${a * x} + (${ns(b * y)}) = ${ns(val)}. Bẫy hay gặp là bỏ quên dấu âm của y và tính ${a * x} + ${b * Math.abs(y)} = ${a * x + b * Math.abs(y)}.`,
        steps: [
          `${a} × ${x} = ${a * x}`,
          `${b} × (${ns(y)}) = ${ns(b * y)}`,
          `C = ${a * x} + (${ns(b * y)}) = ${ns(val)}`,
        ],
        hint: 'Nhân một số dương với một số âm được số âm — giữ nguyên dấu âm khi cộng lại.',
        tags: ['biểu thức đại số', 'số âm'],
      };
    }
    const a = ri(r, 2, 6);
    const b = ri(r, 3, 20);
    const x = -ri(r, 2, 8);
    const val = a * x * x + b;
    return {
      stem: `Tính giá trị của biểu thức D = ${poly([
        [a, 'x²'],
        [b, ''],
      ])} tại x = ${ns(x)}.`,
      correct: ns(val),
      numeric: val,
      distractors: ndU(val, [-a * x * x + b, a * 2 * x + b, a * x * x - b, a * a * x * x + b, val + a]),
      solution: `Thay x = ${ns(x)}: trước hết x² = (${ns(x)})² = ${x * x} (bình phương của một số âm là số DƯƠNG). Do đó D = ${a} × ${x * x} + ${b} = ${a * x * x} + ${b} = ${val}. Nếu để nguyên dấu âm cho x² sẽ ra ${ns(-a * x * x + b)} — sai.`,
      steps: [`x² = (${ns(x)})² = ${x * x}`, `${a} × ${x * x} = ${a * x * x}`, `D = ${a * x * x} + ${b} = ${val}`],
      hint: 'Bình phương một số âm luôn cho kết quả dương: (−3)² = 9 chứ không phải −9.',
      tags: ['biểu thức đại số', 'lũy thừa', 'số âm'],
    };
  }

  // lvl 2 — nhiều bước, có bẫy dấu ở cả hạng tử bậc hai lẫn hạng tử tích
  if (v % 2 === 0) {
    const a = ri(r, 2, 5);
    const b = ri(r, 3, 9);
    const c = ri(r, 2, 20);
    const x = -ri(r, 2, 7);
    const val = a * x * x + b * x + c;
    return {
      stem: `Tính giá trị của biểu thức E = ${poly([
        [a, 'x²'],
        [b, 'x'],
        [c, ''],
      ])} tại x = ${ns(x)}.`,
      correct: ns(val),
      numeric: val,
      distractors: ndU(val, [
        -a * x * x + b * x + c,
        a * x * x - b * x + c,
        a * x * x + b * Math.abs(x) + c,
        a * x * x + b * x - c,
        val + c,
      ]),
      solution: `Thay x = ${ns(x)} vào từng hạng tử: x² = (${ns(x)})² = ${x * x} nên ${a}x² = ${a * x * x}; ${b}x = ${b} × (${ns(x)}) = ${ns(b * x)}; hạng tử tự do giữ nguyên ${c}. Cộng lại: E = ${a * x * x} + (${ns(b * x)}) + ${c} = ${ns(val)}. Hai lỗi hay gặp: cho x² mang dấu âm (ra ${ns(-a * x * x + b * x + c)}) và bỏ quên dấu âm ở hạng tử ${b}x (ra ${ns(a * x * x + b * Math.abs(x) + c)}).`,
      steps: [
        `x² = (${ns(x)})² = ${x * x} ⇒ ${a}x² = ${a * x * x}`,
        `${b}x = ${b} × (${ns(x)}) = ${ns(b * x)}`,
        `E = ${a * x * x} + (${ns(b * x)}) + ${c} = ${ns(val)}`,
      ],
      hint: 'Tính riêng từng hạng tử rồi mới cộng; chú ý x² dương còn bx âm khi x âm.',
      tags: ['biểu thức đại số', 'nhiều bước', 'số âm'],
    };
  }
  const a = ri(r, 2, 5);
  const b = ri(r, 2, 6);
  const c = ri(r, 2, 5);
  const x = ri(r, 2, 7);
  const y = -ri(r, 2, 6);
  const val = a * x * x + b * x * y - c * y * y;
  return {
    stem: `Tính giá trị của biểu thức F = ${poly([
      [a, 'x²'],
      [b, 'xy'],
      [-c, 'y²'],
    ])} tại x = ${x} và y = ${ns(y)}.`,
    correct: ns(val),
    numeric: val,
    distractors: ndU(val, [
      a * x * x + b * x * y + c * y * y,
      a * x * x - b * x * y - c * y * y,
      a * x * x + b * x * Math.abs(y) - c * y * y,
      a * x + b * x * y - c * y,
      val - c,
    ]),
    solution: `Tính từng hạng tử: ${a}x² = ${a} × ${x * x} = ${a * x * x}; ${b}xy = ${b} × ${x} × (${ns(y)}) = ${ns(b * x * y)}; ${c}y² = ${c} × ${y * y} = ${c * y * y} nên hạng tử ${poly([[-c, 'y²']])} đóng góp ${ns(-c * y * y)}. Vậy F = ${a * x * x} + (${ns(b * x * y)}) + (${ns(-c * y * y)}) = ${ns(val)}. Nhớ rằng y² = (${ns(y)})² = ${y * y} là số dương, nên trừ đi ${c * y * y}; đổi dấu chỗ này sẽ ra ${ns(a * x * x + b * x * y + c * y * y)}.`,
    steps: [
      `${a}x² = ${a} × ${x * x} = ${a * x * x}`,
      `${b}xy = ${b} × ${x} × (${ns(y)}) = ${ns(b * x * y)}`,
      `${c}y² = ${c} × ${y * y} = ${c * y * y} ⇒ hạng tử cuối bằng ${ns(-c * y * y)}`,
      `F = ${ns(val)}`,
    ],
    hint: 'Ba hạng tử tính riêng: x² và y² luôn dương, còn xy âm khi x, y trái dấu.',
    tags: ['biểu thức đại số', 'nhiều bước', 'hai biến'],
  };
}

/** EXPR02 — thu gọn biểu thức bằng cách cộng trừ các hạng tử đồng dạng. */
function EXPR02(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const v = Math.floor(slot / 3);

  if (lvl === 0) {
    const a = ri(r, 2, 9);
    const b = ri(r, 2, 9);
    const c = ri(r, 2, 15);
    if (v % 2 === 0) {
      const k = a + b;
      const correct = poly([
        [k, 'x'],
        [c, ''],
      ]);
      return {
        stem: `Thu gọn biểu thức A = ${a}x + ${b}x + ${c}.`,
        correct,
        distractors: td(correct, [
          poly([[k + c, 'x']]),
          poly([
            [a - b, 'x'],
            [c, ''],
          ]),
          poly([
            [a * b, 'x'],
            [c, ''],
          ]),
          poly([
            [k, 'x'],
            [-c, ''],
          ]),
        ]),
        solution: `Hai hạng tử ${a}x và ${b}x là ĐỒNG DẠNG (cùng phần biến x) nên cộng được hệ số với nhau: ${a}x + ${b}x = (${a} + ${b})x = ${k}x. Số ${c} không có chữ x nên không đồng dạng, phải để riêng. Kết quả: A = ${correct}. Gộp luôn ${c} vào thành ${k + c}x là sai vì ${c} không chứa biến.`,
        steps: [`${a}x + ${b}x = (${a} + ${b})x = ${k}x`, `Hạng tử ${c} giữ nguyên`, `A = ${correct}`],
        hint: 'Chỉ được cộng trừ các hạng tử có CÙNG phần biến; số không có chữ thì để riêng.',
        tags: ['thu gọn', 'hạng tử đồng dạng'],
      };
    }
    // Giữ hệ số cuối khác 0 để biểu thức thu gọn vẫn còn hạng tử chứa x
    const cx = a - b > 0 ? ri(r, 2, 9) : ri(r, b - a + 1, b - a + 8);
    const k = a - b + cx;
    const correct = poly([
      [k, 'x'],
      [c, ''],
    ]);
    return {
      stem: `Thu gọn biểu thức B = ${a}x − ${b}x + ${cx}x + ${c}.`,
      correct,
      distractors: td(correct, [
        poly([
          [a + b + cx, 'x'],
          [c, ''],
        ]),
        poly([[k + c, 'x']]),
        poly([
          [a - b - cx, 'x'],
          [c, ''],
        ]),
        poly([
          [k, 'x'],
          [-c, ''],
        ]),
      ]),
      solution: `Gom hệ số của các hạng tử chứa x, giữ nguyên dấu đứng trước mỗi hạng tử: (${a} − ${b} + ${cx})x = ${k}x. Hạng tử tự do ${c} không đồng dạng nên viết riêng. Vậy B = ${correct}. Bỏ quên dấu trừ trước ${b}x sẽ ra ${poly([
        [a + b + cx, 'x'],
        [c, ''],
      ])}.`,
      steps: [`Gom hệ số: ${a} − ${b} + ${cx} = ${k}`, `Các hạng tử chứa x thu về ${ax(k)}`, `B = ${correct}`],
      hint: 'Dấu đứng trước hạng tử nào thì thuộc về hạng tử đó — chép đúng dấu khi gom hệ số.',
      tags: ['thu gọn', 'hạng tử đồng dạng'],
    };
  }

  if (lvl === 1) {
    const a = ri(r, 4, 12);
    const c = ri(r, 2, a - 1);
    const b = ri(r, 2, 9);
    const d = ri(r, 2, 9);
    const kx = a - c;
    const ky = b + d;
    const correct = poly([
      [kx, 'x'],
      [ky, 'y'],
    ]);
    return {
      stem: `Thu gọn biểu thức M = ${a}x + ${b}y − ${c}x + ${d}y.`,
      correct,
      distractors: td(correct, [
        poly([
          [a + c, 'x'],
          [ky, 'y'],
        ]),
        poly([[kx + ky, 'x']]),
        poly([
          [kx, 'x'],
          [b - d, 'y'],
        ]),
        poly([
          [kx, 'y'],
          [ky, 'x'],
        ]),
      ]),
      solution: `Nhóm riêng các hạng tử chứa x và các hạng tử chứa y: (${a}x − ${c}x) + (${b}y + ${d}y) = (${a} − ${c})x + (${b} + ${d})y = ${correct}. Hạng tử chứa x và hạng tử chứa y KHÔNG đồng dạng nên không được cộng chung thành ${poly([[kx + ky, 'x']])}.`,
      steps: [
        `Nhóm theo biến: (${a}x − ${c}x) + (${b}y + ${d}y)`,
        `${a} − ${c} = ${kx} và ${b} + ${d} = ${ky}`,
        `M = ${correct}`,
      ],
      hint: 'Nhóm các hạng tử cùng chữ lại với nhau trước khi cộng hệ số.',
      tags: ['thu gọn', 'hai biến'],
    };
  }

  // lvl 2 — ba nhóm đồng dạng, có bẫy gộp nhầm x² với x
  if (v % 2 === 0) {
    const a = ri(r, 4, 12);
    const c = ri(r, 2, a - 1);
    const b = ri(r, 3, 10);
    const d = ri(r, 2, 9);
    const e = ri(r, 5, 20);
    const f = ri(r, 2, e - 1);
    const k2 = a - c;
    const k1 = b + d;
    const k0 = e - f;
    const correct = poly([
      [k2, 'x²'],
      [k1, 'x'],
      [k0, ''],
    ]);
    return {
      stem: `Thu gọn biểu thức P = ${a}x² + ${b}x − ${c}x² + ${d}x + ${e} − ${f}.`,
      correct,
      distractors: td(correct, [
        poly([
          [k2 + k1, 'x²'],
          [k0, ''],
        ]),
        poly([
          [a + c, 'x²'],
          [k1, 'x'],
          [k0, ''],
        ]),
        poly([
          [k2, 'x²'],
          [b - d, 'x'],
          [k0, ''],
        ]),
        poly([
          [k2, 'x²'],
          [k1, 'x'],
          [e + f, ''],
        ]),
      ]),
      solution: `Chia biểu thức thành ba nhóm đồng dạng. Nhóm x²: ${a}x² − ${c}x² = ${k2}x². Nhóm x: ${b}x + ${d}x = ${k1}x. Nhóm số: ${e} − ${f} = ${k0}. Vậy P = ${correct}. x² và x KHÔNG đồng dạng (khác số mũ) nên không được gộp thành ${poly([
        [k2 + k1, 'x²'],
        [k0, ''],
      ])}.`,
      steps: [
        `Nhóm x²: ${a}x² − ${c}x² = ${ax(k2, 'x²')}`,
        `Nhóm x: ${b}x + ${d}x = ${ax(k1)}`,
        `Nhóm số: ${e} − ${f} = ${k0}`,
        `P = ${correct}`,
      ],
      hint: 'Hai hạng tử đồng dạng phải giống nhau cả chữ lẫn số mũ.',
      tags: ['thu gọn', 'nhiều nhóm', 'lũy thừa'],
    };
  }
  const a = ri(r, 5, 12);
  const c = ri(r, 2, a - 1);
  const b = ri(r, 2, 9);
  const d = ri(r, 2, 9);
  const e = ri(r, 2, 9);
  const k2 = a - c;
  const kxy = b + d;
  const correct = poly([
    [k2, 'x²'],
    [kxy, 'xy'],
    [e, 'y²'],
  ]);
  return {
    stem: `Thu gọn biểu thức Q = ${a}x² + ${b}xy − ${c}x² + ${d}xy + ${e}y².`,
    correct,
    distractors: td(correct, [
      poly([[k2 + kxy + e, 'x²']]),
      poly([
        [a + c, 'x²'],
        [kxy, 'xy'],
        [e, 'y²'],
      ]),
      poly([
        [k2, 'x²'],
        [b - d, 'xy'],
        [e, 'y²'],
      ]),
      poly([
        [k2, 'x²'],
        [kxy + e, 'xy'],
      ]),
    ]),
    solution: `Có ba loại hạng tử khác nhau: x², xy và y². Chỉ gom được các hạng tử cùng loại: ${a}x² − ${c}x² = ${k2}x²; ${b}xy + ${d}xy = ${kxy}xy; hạng tử ${e}y² đứng một mình nên giữ nguyên. Kết quả Q = ${correct}. Gộp tất cả thành một hạng tử ${poly([[k2 + kxy + e, 'x²']])} là sai vì x², xy, y² có phần biến khác nhau.`,
    steps: [
      `Nhóm x²: ${a}x² − ${c}x² = ${ax(k2, 'x²')}`,
      `Nhóm xy: ${b}xy + ${d}xy = ${ax(kxy, 'xy')}`,
      `Hạng tử ${ax(e, 'y²')} giữ nguyên`,
      `Q = ${correct}`,
    ],
    hint: 'x², xy, y² là ba loại hạng tử khác nhau — không được cộng chung.',
    tags: ['thu gọn', 'hai biến', 'nhiều nhóm'],
  };
}

/** EXPR03 — nhân một số với một tổng, phá ngoặc. */
function EXPR03(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const v = Math.floor(slot / 3);

  if (lvl === 0) {
    if (v % 2 === 0) {
      const a = ri(r, 2, 9);
      const b = ri(r, 2, 12);
      const correct = poly([
        [a, 'x'],
        [a * b, ''],
      ]);
      return {
        stem: `Phá ngoặc và thu gọn biểu thức A = ${a}(x + ${b}).`,
        correct,
        distractors: td(correct, [
          poly([
            [a, 'x'],
            [b, ''],
          ]),
          poly([[a + b, 'x']]),
          poly([
            [a, 'x'],
            [-a * b, ''],
          ]),
          poly([
            [a * b, 'x'],
            [a, ''],
          ]),
        ]),
        solution: `Áp dụng quy tắc nhân một số với một tổng: a(b + c) = ab + ac. Ở đây ${a}(x + ${b}) = ${a} × x + ${a} × ${b} = ${correct}. Số ${a} phải nhân với CẢ HAI hạng tử trong ngoặc; quên nhân hạng tử thứ hai sẽ ra ${poly([
          [a, 'x'],
          [b, ''],
        ])}.`,
        steps: [`${a} × x = ${ax(a)}`, `${a} × ${b} = ${a * b}`, `A = ${correct}`],
        hint: 'Số ngoài ngoặc nhân với từng hạng tử bên trong ngoặc, không bỏ sót hạng tử nào.',
        tags: ['phá ngoặc', 'phân phối'],
      };
    }
    const a = ri(r, 12, 89);
    const b = ri(r, 15, 85);
    const c = 100 - b;
    const val = a * 100;
    return {
      stem: `Tính nhanh: ${a} × ${b} + ${a} × ${c}.`,
      correct: ns(val),
      numeric: val,
      distractors: ndU(val, [a * b + c, a + b * c, a * b, val - a, a * (b + c) - a]),
      solution: `Hai tích có chung thừa số ${a}, đặt ${a} làm nhân tử chung: ${a} × ${b} + ${a} × ${c} = ${a} × (${b} + ${c}) = ${a} × 100 = ${val}. Đây chính là quy tắc nhân một số với một tổng dùng theo chiều ngược lại; nếu chỉ nhân rồi cộng máy móc sẽ mất thời gian và dễ nhầm.`,
      steps: [`Đặt nhân tử chung: ${a} × (${b} + ${c})`, `${b} + ${c} = 100`, `${a} × 100 = ${val}`],
      hint: 'Thấy hai tích có chung một thừa số thì đặt thừa số đó ra ngoài ngoặc.',
      tags: ['tính nhanh', 'phân phối'],
    };
  }

  if (lvl === 1) {
    if (v % 2 === 0) {
      const a = ri(r, 2, 8);
      const p = ri(r, 2, 6);
      const q = ri(r, 2, 12);
      const b = ri(r, 2, 20);
      const correct = poly([
        [a * p, 'x'],
        [a * q - b, ''],
      ]);
      return {
        stem: `Phá ngoặc và thu gọn biểu thức B = ${a}(${p}x + ${q}) − ${b}.`,
        correct,
        distractors: td(correct, [
          poly([
            [a * p, 'x'],
            [q - b, ''],
          ]),
          poly([
            [a + p, 'x'],
            [a * q - b, ''],
          ]),
          poly([
            [a * p, 'x'],
            [a * q + b, ''],
          ]),
          poly([
            [a * p, 'x'],
            [a * (q - b), ''],
          ]),
        ]),
        solution: `Nhân ${a} với từng hạng tử trong ngoặc: ${a} × ${p}x = ${a * p}x và ${a} × ${q} = ${a * q}. Biểu thức thành ${a * p}x + ${a * q} − ${b}, thu gọn phần số: ${a * q} − ${b} = ${ns(a * q - b)}. Vậy B = ${correct}. Chú ý ${b} nằm NGOÀI ngoặc nên không được nhân với ${a}.`,
        steps: [`${a} × ${p}x = ${a * p}x`, `${a} × ${q} = ${a * q}`, `${a * q} − ${b} = ${ns(a * q - b)}`, `B = ${correct}`],
        hint: 'Chỉ nhân số ngoài ngoặc với các hạng tử BÊN TRONG ngoặc.',
        tags: ['phá ngoặc', 'thu gọn'],
      };
    }
    const a = ri(r, 2, 8);
    const b = ri(r, 2, 12);
    // c ≠ a để sau khi thu gọn vẫn còn hạng tử chứa x
    const c0 = ri(r, 2, 9);
    const c = c0 === a ? c0 + 1 : c0;
    const correct = poly([
      [c - a, 'x'],
      [a * b, ''],
    ]);
    return {
      stem: `Phá ngoặc và thu gọn biểu thức C = −${a}(x − ${b}) + ${c}x.`,
      correct,
      distractors: td(correct, [
        poly([
          [c - a, 'x'],
          [-a * b, ''],
        ]),
        poly([
          [c + a, 'x'],
          [a * b, ''],
        ]),
        poly([
          [c - a, 'x'],
          [b, ''],
        ]),
        poly([
          [a - c, 'x'],
          [a * b, ''],
        ]),
      ]),
      solution: `Trước ngoặc là dấu trừ kèm hệ số ${a} nên mỗi hạng tử trong ngoặc đều ĐỔI DẤU sau khi nhân: −${a}(x − ${b}) = −${a}x + ${a * b}. Cộng thêm ${c}x rồi gom hạng tử đồng dạng: (−${a} + ${c})x = ${ax(c - a)}. Vậy C = ${correct}. Lỗi kinh điển là giữ nguyên dấu trừ của ${b} và ra ${poly([
        [c - a, 'x'],
        [-a * b, ''],
      ])}.`,
      steps: [
        `−${a} × x = ${ax(-a)}`,
        `−${a} × (−${b}) = +${a * b}`,
        `Gom hạng tử chứa x: −${a}x + ${c}x = ${ax(c - a)}`,
        `C = ${correct}`,
      ],
      hint: 'Nhân với số âm thì mọi hạng tử trong ngoặc đều đổi dấu; trừ nhân trừ ra cộng.',
      tags: ['phá ngoặc', 'đổi dấu'],
    };
  }

  // lvl 2 — hai ngoặc, dấu trừ đứng trước ngoặc thứ hai
  const a = ri(r, 2, 7);
  const p = ri(r, 2, 6);
  const q = ri(r, 2, 10);
  const b = ri(r, 2, 6);
  const s0 = ri(r, 2, 6);
  const t0 = ri(r, 2, 10);
  // Tránh hệ số 0: biểu thức thu gọn phải còn đủ cả hạng tử chứa x lẫn hằng số
  const s = a * p === b * s0 ? s0 + 1 : s0;
  const t = a * q === b * t0 ? t0 + 1 : t0;
  const kx = a * p - b * s;
  const k0 = -a * q + b * t;
  const correct = poly([
    [kx, 'x'],
    [k0, ''],
  ]);
  return {
    stem: `Phá ngoặc và thu gọn biểu thức D = ${a}(${p}x − ${q}) − ${b}(${s}x − ${t}).`,
    correct,
    distractors: td(correct, [
      poly([
        [kx, 'x'],
        [-a * q - b * t, ''],
      ]),
      poly([
        [a * p + b * s, 'x'],
        [k0, ''],
      ]),
      poly([
        [kx, 'x'],
        [-a * q + t, ''],
      ]),
      poly([
        [kx, 'x'],
        [a * q - b * t, ''],
      ]),
    ]),
    solution: `Ngoặc thứ nhất: ${a}(${p}x − ${q}) = ${a * p}x − ${a * q}. Ngoặc thứ hai đứng sau dấu trừ nên nhân xong phải đổi dấu cả hai hạng tử: −${b}(${s}x − ${t}) = −${b * s}x + ${b * t}. Gom lại: (${a * p} − ${b * s})x = ${ax(kx)} và (−${a * q} + ${b * t}) = ${ns(k0)}. Vậy D = ${correct}. Lỗi phổ biến nhất là quên đổi dấu ${t}, dẫn tới hằng số ${ns(-a * q - b * t)}.`,
    steps: [
      `${a}(${p}x − ${q}) = ${a * p}x − ${a * q}`,
      `−${b}(${s}x − ${t}) = ${ns(-b * s)}x + ${b * t}`,
      `Hệ số của x: ${a * p} − ${b * s} = ${ns(kx)}`,
      `Hằng số: ${ns(-a * q)} + ${b * t} = ${ns(k0)}`,
      `D = ${correct}`,
    ],
    hint: 'Dấu trừ trước ngoặc đổi dấu TẤT CẢ các hạng tử bên trong sau khi nhân.',
    tags: ['phá ngoặc', 'đổi dấu', 'nhiều bước'],
  };
}

/** EXPR04 — lập biểu thức đại số từ tình huống lời văn. */
function EXPR04(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const v = Math.floor(slot / 3);

  if (lvl === 0) {
    const form = v % 3;
    if (form === 0) {
      const a = ri(r, 5, 20);
      const correct = ax(a);
      return {
        stem: `Mỗi chiếc bút bi có giá ${a} nghìn đồng. Gọi x là số bút bi đã mua. Hãy viết biểu thức tính số tiền (nghìn đồng) phải trả để mua x chiếc bút bi đó.`,
        correct,
        distractors: td(correct, [`x + ${a}`, `x : ${a}`, `${a} : x`, `${correct} + ${a}`]),
        solution: `Mua 1 chiếc hết ${a} nghìn đồng thì mua x chiếc hết ${a} × x = ${correct} nghìn đồng. Quan hệ ở đây là NHÂN (giá một chiếc nhân số chiếc), không phải cộng; viết x + ${a} nghĩa là cộng số bút với số tiền — hai đại lượng khác nhau, không cộng được.`,
        steps: [`Số tiền = giá một chiếc × số chiếc`, `= ${a} × x = ${correct}`],
        hint: 'Giá một sản phẩm nhân với số sản phẩm ra tổng số tiền.',
        tags: ['lập biểu thức', 'bài toán tiền'],
      };
    }
    if (form === 1) {
      const b = ri(r, 3, 15);
      const correct = `x − ${b}`;
      return {
        stem: `Lan có x viên kẹo, Lan cho em ${b} viên. Hãy viết biểu thức tính số kẹo Lan còn lại.`,
        correct,
        distractors: td(correct, [`x + ${b}`, `${b} − x`, ax(b), `x : ${b}`]),
        solution: `Số kẹo còn lại = số kẹo ban đầu − số kẹo đã cho = x − ${b}. Viết ${b} − x là sai thứ tự (số cho đi luôn nhỏ hơn số ban đầu), còn x + ${b} lại là trường hợp Lan được cho THÊM ${b} viên.`,
        steps: [`Số còn lại = số ban đầu − số đã cho`, `= x − ${b}`],
        hint: 'Cho đi thì bớt: lấy số ban đầu trừ đi số đã cho, đúng thứ tự.',
        tags: ['lập biểu thức', 'phép trừ'],
      };
    }
    const b = ri(r, 8, 25);
    const correct = `x + ${b}`;
    return {
      stem: `Lớp 6A có x học sinh nam và ${b} học sinh nữ. Hãy viết biểu thức tính tổng số học sinh của lớp 6A.`,
      correct,
      distractors: td(correct, [`x − ${b}`, ax(b), `${b} − x`, `x : ${b}`]),
      solution: `Tổng số học sinh bằng số nam cộng số nữ: x + ${b}. Đây là phép cộng vì hai nhóm hợp lại; viết ${b}x nghĩa là mỗi học sinh nam kèm ${b} bạn nữ — không đúng với đề bài.`,
      steps: [`Tổng = số nam + số nữ`, `= x + ${b}`],
      hint: 'Gộp hai nhóm lại với nhau thì dùng phép cộng.',
      tags: ['lập biểu thức', 'phép cộng'],
    };
  }

  if (lvl === 1) {
    const form = v % 3;
    if (form === 0) {
      const a = ri(r, 6, 15);
      const b = ri(r, 5, 30);
      const correct = poly([
        [a, 'x'],
        [b, ''],
      ]);
      return {
        stem: `Bạn Nam mua x quyển vở, mỗi quyển giá ${a} nghìn đồng và mua thêm một chiếc thước giá ${b} nghìn đồng. Hãy viết biểu thức tính tổng số tiền (nghìn đồng) bạn Nam phải trả.`,
        correct,
        distractors: td(correct, [
          poly([
            [b, 'x'],
            [a, ''],
          ]),
          poly([[a + b, 'x']]),
          poly([
            [a, 'x'],
            [-b, ''],
          ]),
          `${a}(x + ${b})`,
        ]),
        solution: `Tiền vở = ${a} × x = ${a}x (nghìn đồng), tiền thước là ${b} nghìn đồng và KHÔNG phụ thuộc x. Tổng số tiền: ${correct}. Viết ${a}(x + ${b}) là sai vì như vậy chiếc thước cũng bị nhân với giá vở.`,
        steps: [`Tiền vở: ${a} × x = ${ax(a)}`, `Tiền thước: ${b}`, `Tổng: ${correct}`],
        hint: 'Chi phí cố định chỉ cộng thêm một lần, không nhân với số lượng.',
        tags: ['lập biểu thức', 'bài toán tiền'],
      };
    }
    if (form === 1) {
      const b = ri(r, 2, 12);
      const correct = poly([
        [4, 'x'],
        [2 * b, ''],
      ]);
      return {
        stem: `Một mảnh vườn hình chữ nhật có chiều rộng x mét, chiều dài hơn chiều rộng ${b} mét. Hãy viết biểu thức tính chu vi (mét) của mảnh vườn đó.`,
        correct,
        distractors: td(correct, [
          poly([
            [2, 'x'],
            [b, ''],
          ]),
          poly([
            [2, 'x'],
            [2 * b, ''],
          ]),
          poly([
            [4, 'x'],
            [b, ''],
          ]),
          `x(x + ${b})`,
        ]),
        solution: `Chiều dài là x + ${b} mét. Chu vi hình chữ nhật = (chiều dài + chiều rộng) × 2 = (x + ${b} + x) × 2 = (2x + ${b}) × 2 = ${correct}. Hai lỗi hay gặp: quên nhân 2 (ra ${poly([
          [2, 'x'],
          [b, ''],
        ])}) và nhân 2 cho x nhưng quên nhân 2 cho ${b} (ra ${poly([
          [4, 'x'],
          [b, ''],
        ])}). Biểu thức x(x + ${b}) là DIỆN TÍCH chứ không phải chu vi.`,
        steps: [
          `Chiều dài = x + ${b}`,
          `Nửa chu vi = x + (x + ${b}) = ${poly([
            [2, 'x'],
            [b, ''],
          ])}`,
          `Chu vi = 2 × (${poly([
            [2, 'x'],
            [b, ''],
          ])}) = ${correct}`,
        ],
        hint: 'Chu vi hình chữ nhật bằng (dài + rộng) × 2 — nhân 2 cho cả hai hạng tử.',
        tags: ['lập biểu thức', 'hình học'],
      };
    }
    const a = ri(r, 3, 6);
    const b = ri(r, 2, 10);
    const correct = poly([
      [2 * a, 'x'],
      [b, ''],
    ]);
    return {
      stem: `Năm nay con x tuổi, tuổi mẹ gấp ${a} lần tuổi con, tuổi bố hơn tuổi mẹ ${b} tuổi. Hãy viết biểu thức tính tổng số tuổi của bố và mẹ.`,
      correct,
      distractors: td(correct, [
        poly([
          [a, 'x'],
          [b, ''],
        ]),
        poly([
          [2 * a, 'x'],
          [2 * b, ''],
        ]),
        poly([
          [2 * a, 'x'],
          [-b, ''],
        ]),
        poly([
          [a, 'x'],
          [2 * b, ''],
        ]),
      ]),
      solution: `Tuổi mẹ là ${a}x, tuổi bố là ${a}x + ${b}. Tổng số tuổi của bố và mẹ: ${a}x + (${a}x + ${b}) = ${correct}. Chỉ cộng ${b} MỘT lần vì chỉ tuổi bố mới hơn tuổi mẹ ${b} tuổi; cộng hai lần thành ${poly([
        [2 * a, 'x'],
        [2 * b, ''],
      ])} là sai.`,
      steps: [`Tuổi mẹ: ${ax(a)}`, `Tuổi bố: ${poly([
        [a, 'x'],
        [b, ''],
      ])}`, `Tổng: ${correct}`],
      hint: 'Viết từng đại lượng theo x trước, rồi mới cộng lại và thu gọn.',
      tags: ['lập biểu thức', 'bài toán tuổi'],
    };
  }

  // lvl 2 — biểu thức nhiều bước, có phần trăm hoặc phân số
  const form = v % 3;
  if (form === 0) {
    const p = pick(r, [10, 20, 25, 50]);
    const c = pick(r, [15000, 20000, 25000, 30000]);
    const keep = (100 - p) / 100;
    const correct = poly([
      [keep, 'x'],
      [c, ''],
    ]);
    return {
      stem: `Một món hàng có giá niêm yết x đồng, khi mua online được giảm ${p}% so với giá niêm yết nhưng phải trả thêm ${c} đồng phí giao hàng. Hãy viết biểu thức tính số tiền thực trả.`,
      correct,
      distractors: td(correct, [
        poly([
          [p / 100, 'x'],
          [c, ''],
        ]),
        poly([
          [(100 + p) / 100, 'x'],
          [c, ''],
        ]),
        poly([
          [keep, 'x'],
          [-c, ''],
        ]),
        `x − ${p} + ${c}`,
      ]),
      solution: `Giảm ${p}% nghĩa là chỉ còn phải trả ${100 - p}% giá niêm yết, tức ${fmt(keep)}x đồng. Cộng thêm phí giao hàng ${c} đồng, số tiền thực trả là ${correct}. Viết ${fmt(p / 100)}x là số tiền ĐƯỢC GIẢM chứ không phải số tiền phải trả; còn x − ${p} là trừ đi ${p} đồng chứ không phải ${p} phần trăm.`,
      steps: [
        `Còn lại ${100 - p}% giá niêm yết: ${fmt(keep)}x`,
        `Cộng phí giao hàng: ${c}`,
        `Số tiền thực trả: ${correct}`,
      ],
      hint: 'Giảm p% thì phần phải trả là (100 − p)% giá gốc; phí giao hàng cộng thêm sau.',
      tags: ['lập biểu thức', 'phần trăm'],
    };
  }
  if (form === 1) {
    const k = pick(r, [2, 3, 4, 5]);
    const b = ri(r, 5, 40);
    const numer = k - 1;
    const head = numer === 1 ? 'x' : `${numer}x`;
    const correct = `${head}/${k} − ${b}`;
    return {
      stem: `Một cửa hàng có x kg gạo. Buổi sáng cửa hàng bán được 1/${k} số gạo đó, buổi chiều bán thêm ${b} kg. Hãy viết biểu thức tính số gạo (kg) còn lại của cửa hàng.`,
      correct,
      distractors: td(correct, [`x/${k} − ${b}`, `${head}/${k} + ${b}`, `x − ${k} − ${b}`, `${b} − ${head}/${k}`]),
      solution: `Buổi sáng bán 1/${k} số gạo nên sau buổi sáng còn lại ${k} phần trừ 1 phần, tức ${numer}/${k} số gạo: ${head}/${k} kg. Buổi chiều bán thêm ${b} kg nên số gạo còn lại là ${correct}. Viết x/${k} − ${b} là nhầm phần CÒN LẠI với phần ĐÃ BÁN.`,
      steps: [
        `Số gạo bán buổi sáng: x/${k}`,
        `Sau buổi sáng còn: x − x/${k} = ${head}/${k}`,
        `Sau buổi chiều còn: ${correct}`,
      ],
      hint: 'Bán 1/k số gạo thì phần còn lại là (k − 1)/k số gạo.',
      tags: ['lập biểu thức', 'phân số'],
    };
  }
  const a = ri(r, 4, 15);
  const b = ri(r, 2, 10);
  const correct = poly([
    [2, 'x'],
    [a - b, ''],
  ]);
  return {
    stem: `Một lớp học có x học sinh nam, số học sinh nữ nhiều hơn số học sinh nam ${a} bạn. Sau đó có ${b} bạn nữ chuyển sang lớp khác. Hãy viết biểu thức tính tổng số học sinh của lớp lúc này.`,
    correct,
    distractors: td(correct, [
      poly([
        [2, 'x'],
        [a + b, ''],
      ]),
      poly([
        [2, 'x'],
        [a, ''],
      ]),
      poly([
        [1, 'x'],
        [a - b, ''],
      ]),
      poly([
        [2, 'x'],
        [b - a, ''],
      ]),
    ]),
    solution: `Số học sinh nữ lúc đầu là x + ${a}; sau khi ${b} bạn nữ chuyển đi còn x + ${a} − ${b} = ${poly([
      [1, 'x'],
      [a - b, ''],
    ])}. Tổng số học sinh của lớp: x + (x + ${a} − ${b}) = ${correct}. Chuyển ĐI thì phải trừ; cộng ${b} vào sẽ ra ${poly([
      [2, 'x'],
      [a + b, ''],
    ])} — sai dấu.`,
    steps: [
      `Số nữ lúc đầu: x + ${a}`,
      `Số nữ sau khi chuyển đi: ${lin(1, a - b)}`,
      `Tổng: x + (${lin(1, a - b)}) = ${correct}`,
    ],
    hint: 'Viết từng nhóm theo x, xử lý phần thay đổi rồi mới cộng tổng.',
    tags: ['lập biểu thức', 'nhiều bước'],
  };
}

// ===========================================================================
// CHƯƠNG EQ — PHƯƠNG TRÌNH BẬC NHẤT MỘT ẨN
// ===========================================================================

/** EQ01 — giải phương trình dạng ax + b = c (nghiệm dựng ngược từ trước). */
function EQ01(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const v = Math.floor(slot / 3);

  if (lvl === 0) {
    const a = ri(r, 2, 9);
    const x0 = ri(r, 2, 12);
    let b = ri(r, -18, 18);
    if (b === 0) b = 5;
    const c = a * x0 + b;
    return {
      stem: `Giải phương trình ${lin(a, b)} = ${ns(c)}.`,
      correct: ns(x0),
      numeric: x0,
      distractors: ndU(x0, [(c + b) / a, c - b, c / a - b, (b - c) / a, x0 + 1, x0 - 1]),
      solution: `Chuyển hạng tử tự do sang vế phải (đổi dấu): ${ax(a)} = ${ns(c)} ${b < 0 ? '+' : '−'} ${Math.abs(b)} = ${ns(c - b)}. Chia hai vế cho ${a}: x = ${ns(c - b)} : ${a} = ${ns(x0)}. Thử lại: ${a} × ${ns(x0)} ${b < 0 ? '−' : '+'} ${Math.abs(b)} = ${ns(c)} ✓. Lỗi hay gặp là quên đổi dấu ${ns(b)} khi chuyển vế.`,
      steps: [`${ax(a)} = ${ns(c)} ${b < 0 ? '+' : '−'} ${Math.abs(b)} = ${ns(c - b)}`, `x = ${ns(c - b)} : ${a} = ${ns(x0)}`],
      hint: 'Chuyển số hạng tự do sang vế kia thì đổi dấu, sau đó chia cho hệ số của x.',
      tags: ['phương trình bậc nhất', 'chuyển vế'],
    };
  }

  if (lvl === 1) {
    if (v % 2 === 0) {
      const a = -ri(r, 2, 9);
      const x0 = ri(r, -9, 12);
      let b = ri(r, -25, 25);
      if (b === 0) b = -6;
      const c = a * x0 + b;
      return {
        stem: `Giải phương trình ${lin(a, b)} = ${ns(c)}.`,
        correct: ns(x0),
        numeric: x0,
        distractors: ndU(x0, [-x0, (c - b) / Math.abs(a), (c + b) / a, c - b, x0 + 1, x0 - 1]),
        solution: `Chuyển ${ns(b)} sang vế phải: ${ax(a)} = ${ns(c)} ${b < 0 ? '+' : '−'} ${Math.abs(b)} = ${ns(c - b)}. Chia hai vế cho hệ số ÂM ${ns(a)}: x = ${ns(c - b)} : (${ns(a)}) = ${ns(x0)}. Chia cho số âm thì thương đổi dấu — quên điều này sẽ ra ${ns((c - b) / Math.abs(a))}. Thử lại: ${pn(a)} × ${pn(x0)} = ${ns(a * x0)}, cộng ${pn(b)} được ${ns(c)} ✓.`,
        steps: [
          `${ax(a)} = ${ns(c)} ${b < 0 ? '+' : '−'} ${Math.abs(b)} = ${ns(c - b)}`,
          `x = ${ns(c - b)} : (${ns(a)}) = ${ns(x0)}`,
        ],
        hint: 'Hệ số của x là số âm — khi chia hai vế cho nó, nhớ đổi dấu kết quả.',
        tags: ['phương trình bậc nhất', 'hệ số âm'],
      };
    }
    const a = ri(r, 3, 12);
    const x0 = ri(r, -8, 12);
    const b = ri(r, 20, 90);
    const c = b - a * x0;
    return {
      stem: `Giải phương trình ${ns(c)} = ${poly([
        [b, ''],
        [-a, 'x'],
      ])}.`,
      correct: ns(x0),
      numeric: x0,
      distractors: ndU(x0, [(c + b) / a, (b + c) / -a, b - c, -x0, x0 + 1, x0 - 1]),
      solution: `Ẩn đang nằm ở vế phải, ta chuyển về dạng quen thuộc: ${b} − ${a}x = ${ns(c)}, suy ra ${a}x = ${b} − ${pn(c)} = ${ns(b - c)}, do đó x = ${ns(b - c)} : ${a} = ${ns(x0)}. Đừng vội đổi dấu cả hai vế một cách máy móc; hãy chuyển hạng tử chứa x sang vế có dấu dương. Thử lại: ${b} − ${a} × ${pn(x0)} = ${ns(c)} ✓.`,
      steps: [`${b} − ${a}x = ${ns(c)}`, `${a}x = ${b} − ${pn(c)} = ${ns(b - c)}`, `x = ${ns(b - c)} : ${a} = ${ns(x0)}`],
      hint: 'Viết lại phương trình cho ẩn về một vế, hạng tử tự do về vế còn lại.',
      tags: ['phương trình bậc nhất', 'chuyển vế'],
    };
  }

  // lvl 2 — nghiệm là phân số tối giản: hệ số a phải là bội của mẫu q
  const q = pick(r, [2, 3, 4, 5]);
  let p = ri(r, 3, 3 * q);
  let guard = 0;
  while (gcd(p, q) !== 1 && guard++ < 10) p++;
  if (gcd(p, q) !== 1) p = q + 1;
  if (r() < 0.4) p = -p;
  const m = ri(r, 1, 4);
  const a = (v % 2 === 0 ? 1 : -1) * q * m;
  let b = ri(r, -15, 15);
  if (b === 0) b = 7;
  const ap = (a / q) * p;
  const c = ap + b;
  const root = frac(p, q);
  return {
    stem: `Giải phương trình ${lin(a, b)} = ${ns(c)} (viết nghiệm dưới dạng phân số tối giản).`,
    correct: fs(root),
    distractors: fdU(root, [
      sfrac(c + b, a),
      sfrac(c - b, 1),
      sfrac(a, c - b),
      sfrac(-p, q),
      sfrac(p + q, q),
      sfrac(p - q, q),
    ]),
    solution: `Chuyển hạng tử tự do sang vế phải: ${ax(a)} = ${ns(c)} ${b < 0 ? '+' : '−'} ${Math.abs(b)} = ${ns(c - b)}. Chia hai vế cho ${ns(a)}: x = ${ns(c - b)} : ${pn(a)} = ${fs(root)}. Kết quả không phải số nguyên là chuyện bình thường — chỉ cần rút gọn phân số cho ƯCLN(${Math.abs(c - b)}; ${Math.abs(a)}) = ${gcd(c - b, a)}. Thử lại: ${pn(a)} × ${pf(root)} = ${ns(ap)}, cộng ${pn(b)} được ${ns(c)} ✓. Dừng ở bước ${ns(c - b)} (quên chia cho hệ số) là lỗi hay gặp nhất.`,
    steps: [
      `${ax(a)} = ${ns(c)} ${b < 0 ? '+' : '−'} ${Math.abs(b)} = ${ns(c - b)}`,
      `x = ${ns(c - b)} : ${pn(a)}`,
      `Rút gọn: x = ${fs(root)}`,
    ],
    hint: 'Nghiệm có thể là phân số — chia xong nhớ rút gọn về tối giản.',
    tags: ['phương trình bậc nhất', 'nghiệm phân số'],
  };
}

/** EQ02 — phương trình có ngoặc, ẩn ở hai vế. `params.scale` thu nhỏ thang số cho khối nhỏ. */
function EQ02(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const v = Math.floor(slot / 3);
  const S = sc(ctx);
  const big = Math.max(4, Math.round(9 * S));

  if (lvl === 0) {
    const a = ri(r, 4, big + 3);
    const c = ri(r, 2, a - 1);
    let x0 = ri(r, -6, 12);
    if (x0 === 0) x0 = 4;
    const b = ri(r, -12, 20);
    const d = (a - c) * x0 + b;
    return {
      stem: `Giải phương trình ${lin(a, b)} = ${lin(c, d)}.`,
      correct: ns(x0),
      numeric: x0,
      distractors: ndU(x0, [(d - b) / (a + c), -x0, d - b, (d + b) / (a - c), x0 + 1, x0 - 1]),
      solution: `Chuyển các hạng tử chứa x về vế trái, các số về vế phải (mỗi lần chuyển vế đều đổi dấu): ${a}x − ${c}x = ${ns(d)} ${b < 0 ? '+' : '−'} ${Math.abs(b)}, tức ${ax(a - c)} = ${ns(d - b)}. Suy ra x = ${ns(d - b)} : ${a - c} = ${ns(x0)}. Hệ số của x là ${a} − ${c} = ${a - c} (TRỪ chứ không cộng); cộng nhầm thành ${a + c} sẽ ra kết quả khác. Thử lại hai vế đều bằng ${ns(a * x0 + b)} ✓.`,
      steps: [
        `Chuyển vế: ${a}x − ${c}x = ${ns(d)} ${b < 0 ? '+' : '−'} ${Math.abs(b)}`,
        `${ax(a - c)} = ${ns(d - b)}`,
        `x = ${ns(d - b)} : ${a - c} = ${ns(x0)}`,
      ],
      hint: 'Gom x về một vế, số về vế kia; hạng tử nào đổi vế thì đổi dấu.',
      tags: ['phương trình bậc nhất', 'ẩn hai vế'],
    };
  }

  if (lvl === 1) {
    const a = ri(r, 3, big);
    const c = ri(r, 2, Math.max(2, a - 1));
    const aa = a === c ? a + 1 : a;
    let x0 = ri(r, -7, 12);
    if (x0 === 0) x0 = 3;
    const m = ri(r, -9, 12);
    const d = (aa - c) * x0 + aa * m;
    return {
      stem: `Giải phương trình ${aa}(${lin(1, m)}) = ${lin(c, d)}.`,
      correct: ns(x0),
      numeric: x0,
      distractors: ndU(x0, [(d - m) / (aa - c), (d + aa * m) / (aa - c), (d - aa * m) / (aa + c), -x0, x0 + 1, x0 - 1]),
      solution: `Bước 1 — phá ngoặc, nhân ${aa} với CẢ HAI hạng tử: ${aa}(${lin(1, m)}) = ${aa}x ${m < 0 ? '−' : '+'} ${Math.abs(aa * m)}. Bước 2 — chuyển x về trái, số về phải: ${aa}x − ${c}x = ${ns(d)} ${aa * m < 0 ? '+' : '−'} ${Math.abs(aa * m)}, tức ${ax(aa - c)} = ${ns(d - aa * m)}. Bước 3 — chia: x = ${ns(d - aa * m)} : ${aa - c} = ${ns(x0)}. Quên nhân ${aa} với ${ns(m)} là lỗi phổ biến nhất, khi đó ra ${ns((d - m) / (aa - c))}.`,
      steps: [
        `Phá ngoặc: ${aa}x ${m < 0 ? '−' : '+'} ${Math.abs(aa * m)} = ${lin(c, d)}`,
        `Chuyển vế: ${ax(aa - c)} = ${ns(d - aa * m)}`,
        `x = ${ns(d - aa * m)} : ${aa - c} = ${ns(x0)}`,
      ],
      hint: 'Phá ngoặc trước (nhân đủ hai hạng tử), sau đó mới gom ẩn về một vế.',
      tags: ['phương trình bậc nhất', 'phá ngoặc', 'ẩn hai vế'],
    };
  }

  // lvl 2 — hai ngoặc, dấu trừ trước ngoặc thứ hai, nghiệm là phân số
  const a = ri(r, 4, Math.max(6, big));
  const b = ri(r, 2, a - 2);
  const A = a - b;
  let p = ri(r, A + 1, 4 * A);
  let guard = 0;
  while (gcd(p, A) !== 1 && guard++ < 12) p++;
  if (gcd(p, A) !== 1) p = A + 1;
  if (r() < 0.35) p = -p;
  const m = ri(r, 1, 9);
  const n = ri(r, 1, 9);
  const C = -a * m - b * n;
  const k = p + C;
  const root = frac(p, A);
  return {
    stem: `Giải phương trình ${a}(x − ${m}) − ${b}(x + ${n}) = ${ns(k)} (viết nghiệm dưới dạng phân số tối giản nếu cần).`,
    correct: fs(root),
    distractors: fdU(root, [
      sfrac(k + a * m - b * n, A),
      sfrac(k - C, a + b),
      sfrac(k + a * m + n, A),
      sfrac(k + C, A),
      sfrac(p + A, A),
      sfrac(p - A, A),
    ]),
    solution: `Bước 1 — phá ngoặc: ${a}(x − ${m}) = ${a}x − ${a * m}; trước ngoặc thứ hai là dấu trừ nên −${b}(x + ${n}) = −${b}x − ${b * n}. Bước 2 — thu gọn vế trái: (${a} − ${b})x − ${a * m} − ${b * n} = ${poly([
      [A, 'x'],
      [C, ''],
    ])}. Bước 3 — chuyển hằng số sang phải: ${ax(A)} = ${ns(k)} + ${Math.abs(C)} = ${ns(p)}. Bước 4 — chia hai vế cho ${A}: x = ${ns(p)} : ${A} = ${fs(root)}. Bẫy lớn nhất: đổi dấu ${b * n} thành +${b * n} (khi đó ra ${fs(frac(k + a * m - b * n, A))}); bẫy thứ hai là quên nhân ${b} với ${n}.`,
    steps: [
      `Phá ngoặc: ${a}x − ${a * m} − ${b}x − ${b * n} = ${ns(k)}`,
      `Thu gọn: ${ax(A)} − ${a * m + b * n} = ${ns(k)}`,
      `${ax(A)} = ${ns(k)} + ${a * m + b * n} = ${ns(p)}`,
      `x = ${ns(p)} : ${A} = ${fs(root)}`,
    ],
    hint: 'Dấu trừ trước ngoặc đổi dấu cả hai hạng tử bên trong, kể cả hạng tử đang mang dấu cộng.',
    tags: ['phương trình bậc nhất', 'phá ngoặc', 'nghiệm phân số'],
  };
}

/** EQ03 — phương trình chứa mẫu số, khử mẫu bằng cách nhân với BCNN. */
function EQ03(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const v = Math.floor(slot / 3);

  if (lvl === 0) {
    if (v % 2 === 0) {
      const a = ri(r, 2, 9);
      const q = ri(r, 2, 15);
      const x0 = a * q;
      let b = ri(r, -12, 20);
      if (b === 0) b = 6;
      const c = q + b;
      return {
        stem: `Giải phương trình x/${a} ${b < 0 ? '−' : '+'} ${Math.abs(b)} = ${ns(c)}.`,
        correct: ns(x0),
        numeric: x0,
        distractors: ndU(x0, [q, c * a - b, (c + b) * a, c * a, x0 + a, x0 - a]),
        solution: `Chuyển ${ns(b)} sang vế phải: x/${a} = ${ns(c)} ${b < 0 ? '+' : '−'} ${Math.abs(b)} = ${q}. Nhân hai vế với ${a} để khử mẫu: x = ${q} × ${a} = ${x0}. Dừng lại ở ${q} là quên nhân với mẫu số; nhân ${a} vào ${ns(c)} ngay từ đầu mà chưa trừ ${ns(b)} sẽ ra ${ns(c * a - b)}. Thử lại: ${x0} : ${a} = ${q}, cộng ${ns(b)} được ${ns(c)} ✓.`,
        steps: [`x/${a} = ${ns(c)} ${b < 0 ? '+' : '−'} ${Math.abs(b)} = ${q}`, `x = ${q} × ${a} = ${x0}`],
        hint: 'Tách phần số ra trước, sau đó nhân hai vế với mẫu để tìm x.',
        tags: ['phương trình chứa mẫu', 'khử mẫu'],
      };
    }
    const a = ri(r, 2, 9);
    const c = ri(r, 2, 12);
    const b = ri(r, -15, 20);
    const x0 = a * c - b;
    return {
      stem: `Giải phương trình (${lin(1, b)})/${a} = ${c}.`,
      correct: ns(x0),
      numeric: x0,
      distractors: ndU(x0, [c - b, a * c + b, a * (c + b), a * c, x0 + a, x0 - a]),
      solution: `Nhân hai vế với ${a} để khử mẫu: ${lin(1, b)} = ${c} × ${a} = ${a * c}. Sau đó chuyển ${ns(b)} sang vế phải (đổi dấu): x = ${a * c} ${b < 0 ? '+' : '−'} ${Math.abs(b)} = ${ns(x0)}. Quên nhân ${a} sẽ ra ${ns(c - b)}; nhân ${a} cho cả ${ns(b)} một lần nữa sẽ ra ${ns(a * (c + b))}. Thử lại: (${ns(x0)} ${b < 0 ? '−' : '+'} ${Math.abs(b)}) : ${a} = ${c} ✓.`,
      steps: [`Nhân hai vế với ${a}: ${lin(1, b)} = ${a * c}`, `x = ${a * c} ${b < 0 ? '+' : '−'} ${Math.abs(b)} = ${ns(x0)}`],
      hint: 'Cả tử là một khối — nhân hai vế với mẫu trước, rồi mới chuyển vế.',
      tags: ['phương trình chứa mẫu', 'khử mẫu'],
    };
  }

  if (lvl === 1) {
    if (v % 2 === 0) {
      const a = ri(r, 2, 6);
      let b = ri(r, 2, 9);
      if (b === a) b = a + 1;
      const L = lcm(a, b);
      const t = ri(r, 1, 6);
      const x0 = L * t;
      const c = x0 / a + x0 / b;
      return {
        stem: `Giải phương trình x/${a} + x/${b} = ${c}.`,
        correct: ns(x0),
        numeric: x0,
        distractors: ndU(x0, [c * (a + b), c * a, c * b, L * c, x0 + L, x0 - L]),
        solution: `Quy đồng hai vế với BCNN(${a}; ${b}) = ${L}: nhân cả hai vế với ${L} được ${L / a}x + ${L / b}x = ${c} × ${L} = ${c * L}, tức ${ax(L / a + L / b)} = ${c * L}. Suy ra x = ${c * L} : ${L / a + L / b} = ${x0}. Cộng thẳng hai mẫu thành x/${a + b} = ${c} rồi lấy x = ${c * (a + b)} là sai — mẫu số không cộng như vậy. Thử lại: ${x0}/${a} + ${x0}/${b} = ${x0 / a} + ${x0 / b} = ${c} ✓.`,
        steps: [
          `BCNN(${a}; ${b}) = ${L}`,
          `Nhân hai vế với ${L}: ${L / a}x + ${L / b}x = ${c * L}`,
          `${ax(L / a + L / b)} = ${c * L}`,
          `x = ${c * L} : ${L / a + L / b} = ${x0}`,
        ],
        hint: 'Nhân hai vế với BCNN của các mẫu để mất hết mẫu số, rồi thu gọn.',
        tags: ['phương trình chứa mẫu', 'quy đồng'],
      };
    }
    const p = ri(r, 2, 7);
    const b = ri(r, 2, 8);
    const x0 = ri(r, -6, 14);
    const c = ri(r, 2, 12);
    const m = b * c - p * x0;
    return {
      stem: `Giải phương trình (${poly([
        [p, 'x'],
        [m, ''],
      ])})/${b} = ${c}.`,
      correct: ns(x0),
      numeric: x0,
      distractors: ndU(x0, [(c - m) / p, b * c - m, (b * c + m) / p, (c * b) / p, x0 + 1, x0 - 1]),
      solution: `Nhân hai vế với mẫu ${b}: ${poly([
        [p, 'x'],
        [m, ''],
      ])} = ${c} × ${b} = ${b * c}. Chuyển ${ns(m)} sang vế phải: ${ax(p)} = ${b * c} ${m < 0 ? '+' : '−'} ${Math.abs(m)} = ${ns(p * x0)}. Chia cho ${p}: x = ${ns(p * x0)} : ${p} = ${ns(x0)}. Quên nhân ${b} sẽ ra ${ns((c - m) / p)}; quên chia cho hệ số ${p} sẽ dừng ở ${ns(p * x0)}.`,
      steps: [
        `Nhân hai vế với ${b}: ${poly([
          [p, 'x'],
          [m, ''],
        ])} = ${b * c}`,
        `${ax(p)} = ${ns(b * c - m)}`,
        `x = ${ns(b * c - m)} : ${p} = ${ns(x0)}`,
      ],
      hint: 'Khử mẫu trước, sau đó giải phương trình bậc nhất quen thuộc.',
      tags: ['phương trình chứa mẫu', 'khử mẫu'],
    };
  }

  // lvl 2 — hai phân thức khác mẫu (mẫu này là bội của mẫu kia) ⇒ khử mẫu bằng BCNN
  const [a, b] = pick(r, [
    [2, 4],
    [3, 6],
    [2, 6],
    [3, 9],
    [4, 8],
    [5, 10],
    [2, 8],
    [4, 12],
  ] as [number, number][]);
  const L = b;
  const u = b / a;
  const minus = v % 2 === 0;
  const A = minus ? u - 1 : u + 1;
  const x0 = ri(r, -6, 14);
  const m = ri(r, -9, 9);
  const n0 = ri(r, -6, 12);
  const base = A * x0 + u * m;
  const raw = minus ? base + n0 : base - n0;
  const delta = (((-raw % L) + L) % L);
  const n = minus ? n0 + delta : n0 - delta;
  const N = minus ? base + n : base - n;
  const k = N / L;
  const wrongSign = minus ? (L * k - u * m + n) / A : (L * k - u * m - n) / A;
  const wrongK = (k - u * m - (minus ? n : -n)) / A;
  return {
    stem: `Giải phương trình (${lin(1, m)})/${a} ${minus ? '−' : '+'} (${lin(1, -n)})/${b} = ${ns(k)}.`,
    correct: ns(x0),
    numeric: x0,
    distractors: ndU(x0, [wrongK, wrongSign, (L * k - u * m + (minus ? n : -n)) / u, x0 + 1, x0 - 1, -x0]),
    solution: `Mẫu ${b} chia hết cho mẫu ${a} nên BCNN của hai mẫu là ${L}. Nhân MỌI hạng tử của cả hai vế với ${L}: ${u}(${lin(1, m)}) ${minus ? '−' : '+'} (${lin(1, -n)}) = ${ns(k)} × ${L} = ${ns(L * k)}. Phá ngoặc rồi thu gọn vế trái: ${poly([
      [A, 'x'],
      [u * m + (minus ? n : -n), ''],
    ])} = ${ns(L * k)}, suy ra ${ax(A)} = ${ns(A * x0)} và x = ${ns(A * x0)} : ${A} = ${ns(x0)}. Hai bẫy chết người: (1) quên nhân ${L} vào vế phải, chỉ khử mẫu bên trái — khi đó ra ${ns(wrongK)}; (2) quên đổi dấu hạng tử ${ns(-n)} khi nhân với dấu ${minus ? 'trừ' : 'cộng'} phía trước, khi đó ra ${ns(wrongSign)}.`,
    steps: [
      `BCNN của ${a} và ${b} là ${L}`,
      `Nhân cả hai vế với ${L}: ${u}(${lin(1, m)}) ${minus ? '−' : '+'} (${lin(1, -n)}) = ${ns(L * k)}`,
      `Phá ngoặc rồi thu gọn: ${ax(A)} = ${ns(A * x0)}`,
      `x = ${ns(A * x0)} : ${A} = ${ns(x0)}`,
    ],
    hint: 'Nhân BCNN cho TẤT CẢ các hạng tử, kể cả số hạng ở vế phải không có mẫu.',
    tags: ['phương trình chứa mẫu', 'quy đồng', 'nhiều bước'],
  };
}

/** EQ04 — giải bài toán bằng cách lập phương trình (ngữ cảnh Việt Nam). */
function EQ04(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const v = Math.floor(slot / 3);

  if (lvl === 0) {
    const nu = ri(r, 12, 25);
    const D = ri(r, 2, 9);
    const nam = nu + D;
    const S = nam + nu;
    return {
      stem: `Lớp 6A có ${S} học sinh, trong đó số học sinh nam nhiều hơn số học sinh nữ ${D} bạn. Hỏi lớp 6A có bao nhiêu học sinh nam?`,
      correct: ns(nam),
      numeric: nam,
      distractors: ndU(nam, [nu, S - D, S / 2, nam + D, nam - 1]),
      solution: `Gọi số học sinh nam là x (bạn), x nguyên dương. Số học sinh nữ là x − ${D}. Theo đề: x + (x − ${D}) = ${S} ⇒ 2x = ${S} + ${D} = ${S + D} ⇒ x = ${nam}. Vậy lớp có ${nam} học sinh nam và ${nu} học sinh nữ (thử lại: ${nam} + ${nu} = ${S} và ${nam} − ${nu} = ${D} ✓). Lỗi hay gặp là quên chia đôi, trả lời ${S - D}.`,
      steps: [
        `Gọi số học sinh nam là x`,
        `Số học sinh nữ: x − ${D}`,
        `x + (x − ${D}) = ${S} ⇒ 2x = ${S + D}`,
        `x = ${nam} (học sinh nam)`,
      ],
      hint: 'Bài toán tổng – hiệu: số lớn = (tổng + hiệu) : 2.',
      tags: ['lập phương trình', 'tổng hiệu'],
    };
  }

  if (lvl === 1) {
    if (v % 2 === 0) {
      const con = ri(r, 6, 14);
      const k = ri(r, 3, 5);
      const T = con * (k + 1);
      return {
        stem: `Tổng số tuổi của hai bố con hiện nay là ${T} tuổi. Biết tuổi bố gấp ${k} lần tuổi con. Hỏi hiện nay con bao nhiêu tuổi?`,
        correct: ns(con),
        numeric: con,
        distractors: ndU(con, [con * k, T / k, T - k, con + 1, con - 1]),
        solution: `Gọi tuổi con hiện nay là x (tuổi), x > 0. Tuổi bố là ${k}x. Theo đề: x + ${k}x = ${T} ⇒ ${k + 1}x = ${T} ⇒ x = ${T} : ${k + 1} = ${con}. Vậy con ${con} tuổi, bố ${con * k} tuổi (thử lại: ${con} + ${con * k} = ${T} ✓). Chia ${T} cho ${k} thay vì cho ${k + 1} là lỗi phổ biến — phải cộng thêm 1 phần của con.`,
        steps: [`Gọi tuổi con là x`, `Tuổi bố: ${k}x`, `x + ${k}x = ${T} ⇒ ${k + 1}x = ${T}`, `x = ${con} tuổi`],
        hint: 'Coi tuổi con là 1 phần thì tổng gồm 1 + k phần bằng nhau.',
        tags: ['lập phương trình', 'bài toán tuổi'],
      };
    }
    const n1 = ri(r, 3, 8);
    const n2 = ri(r, 2, 6);
    const pb = pick(r, [3000, 4000, 5000, 6000]);
    const pv = pick(r, [7000, 8000, 9000, 10000, 12000]);
    const M = n1 * pv + n2 * pb;
    return {
      stem: `Bạn An mua ${n1} quyển vở và ${n2} chiếc bút bi hết tất cả ${M} đồng. Biết mỗi chiếc bút bi giá ${pb} đồng. Hỏi giá một quyển vở là bao nhiêu đồng?`,
      correct: ns(pv),
      numeric: pv,
      distractors: ndU(pv, [M / n1, (M - pb) / n1, M / (n1 + n2), (M - n2 * pb) / n2, pv + 1000]),
      solution: `Gọi giá một quyển vở là x (đồng), x > 0. Tiền mua vở: ${n1}x; tiền mua bút: ${n2} × ${pb} = ${n2 * pb} đồng. Theo đề: ${n1}x + ${n2 * pb} = ${M} ⇒ ${n1}x = ${M} − ${n2 * pb} = ${n1 * pv} ⇒ x = ${n1 * pv} : ${n1} = ${pv} đồng. Thử lại: ${n1} × ${pv} + ${n2} × ${pb} = ${M} ✓. Quên trừ tiền bút mà chia luôn ${M} cho ${n1} sẽ ra ${ns(M / n1)} — sai.`,
      steps: [
        `Gọi giá một quyển vở là x`,
        `Tiền bút: ${n2} × ${pb} = ${n2 * pb}`,
        `${n1}x + ${n2 * pb} = ${M} ⇒ ${n1}x = ${n1 * pv}`,
        `x = ${pv} đồng`,
      ],
      hint: 'Trừ đi phần tiền đã biết trước, phần còn lại mới chia cho số lượng.',
      tags: ['lập phương trình', 'bài toán tiền'],
    };
  }

  // lvl 2 — suy luận ngược, dữ kiện đặt ở thời điểm khác
  if (v % 2 === 0) {
    const con = ri(r, 4, 12);
    const nYear = ri(r, 2, 8);
    const k = ri(r, 3, 4);
    const d = (k - 1) * (con + nYear);
    return {
      stem: `Hiện nay bố hơn con ${d} tuổi. Sau ${nYear} năm nữa, tuổi bố gấp ${k} lần tuổi con. Hỏi hiện nay con bao nhiêu tuổi?`,
      correct: ns(con),
      numeric: con,
      distractors: ndU(con, [d / (k - 1), d - nYear, d, d / k, con + nYear + 1]),
      solution: `Gọi tuổi con hiện nay là x (tuổi), x > 0. Hiện nay tuổi bố là x + ${d}. Sau ${nYear} năm, con ${'x'} + ${nYear} tuổi, bố x + ${d + nYear} tuổi. Theo đề: x + ${d + nYear} = ${k}(x + ${nYear}) ⇒ x + ${d + nYear} = ${k}x + ${k * nYear} ⇒ ${k - 1}x = ${d + nYear} − ${k * nYear} = ${d - (k - 1) * nYear} ⇒ x = ${con}. Vậy con ${con} tuổi, bố ${con + d} tuổi. Kiểm tra sau ${nYear} năm: bố ${con + d + nYear} tuổi, con ${con + nYear} tuổi, đúng gấp ${k} lần ✓. Lưu ý hiệu số tuổi KHÔNG đổi theo thời gian; dừng ở ${ns(d / (k - 1))} là quên trừ ${nYear} năm.`,
      steps: [
        `Gọi tuổi con hiện nay là x, tuổi bố là x + ${d}`,
        `Sau ${nYear} năm: x + ${d + nYear} = ${k}(x + ${nYear})`,
        `${k - 1}x = ${d - (k - 1) * nYear}`,
        `x = ${con} tuổi`,
      ],
      hint: 'Hiệu số tuổi của hai người không bao giờ thay đổi — cộng đều số năm cho cả hai.',
      tags: ['lập phương trình', 'bài toán tuổi', 'nhiều bước'],
    };
  }
  const [v1, v2] = pick(r, [
    [60, 40],
    [50, 30],
    [45, 30],
    [40, 30],
    [60, 45],
    [36, 24],
  ] as [number, number][]);
  const L = lcm(v1, v2);
  const s = L * ri(r, 1, 4);
  const t = s / v2 - s / v1;
  return {
    stem: `Một ô tô đi từ A đến B với vận tốc ${v1} km/h. Lúc từ B trở về A, xe chỉ đi với vận tốc ${v2} km/h nên thời gian về nhiều hơn thời gian đi ${fmt(t)} giờ. Tính quãng đường AB (km).`,
    correct: ns(s),
    numeric: s,
    distractors: ndU(s, [v1 * t, v2 * t, (v1 + v2) * t, (v1 - v2) * t, s / 2]),
    solution: `Gọi quãng đường AB là x (km), x > 0. Thời gian đi: x/${v1} giờ; thời gian về: x/${v2} giờ. Vì thời gian về nhiều hơn ${fmt(t)} giờ nên x/${v2} − x/${v1} = ${fmt(t)}. Quy đồng với BCNN(${v1}; ${v2}) = ${L}: ${L / v2}x − ${L / v1}x = ${fmt(t)} × ${L} ⇒ ${ax(L / v2 - L / v1)} = ${fmt(t * L)} ⇒ x = ${s} km. Thử lại: ${s} : ${v1} = ${fmt(s / v1)} giờ, ${s} : ${v2} = ${fmt(s / v2)} giờ, chênh nhau đúng ${fmt(t)} giờ ✓. Lấy ${v1} × ${fmt(t)} = ${ns(v1 * t)} là sai vì ${fmt(t)} giờ là phần thời gian CHÊNH LỆCH chứ không phải thời gian đi hết quãng đường.`,
    steps: [
      `Gọi quãng đường AB là x km`,
      `Thời gian đi x/${v1}, thời gian về x/${v2}`,
      `x/${v2} − x/${v1} = ${fmt(t)}`,
      `x = ${s} km`,
    ],
    hint: 'Lập phương trình theo thời gian: thời gian = quãng đường : vận tốc.',
    tags: ['lập phương trình', 'chuyển động', 'nhiều bước'],
  };
}

// ===========================================================================
// CHƯƠNG INEQ — SO SÁNH VÀ BẤT ĐẲNG THỨC
// ===========================================================================

interface CmpItem {
  label: string;
  val: Frac;
}
interface CmpPair {
  a: CmpItem;
  b: CmpItem;
  why: string;
}

/** Một cặp giá trị để so sánh; `i` quyết định DẠNG so sánh nên 4 cặp luôn khác nhau. */
function makeCmpPair(ctx: GenCtx, i: number): CmpPair {
  const { r, lvl } = ctx;

  if (lvl === 0) {
    const dens = [3, 4, 5, 6, 7, 8, 9, 11][i % 8];
    if (i % 2 === 0) {
      // Cùng mẫu: tử lớn hơn thì phân số lớn hơn
      const n1 = ri(r, 1, dens - 1);
      const step = ri(r, 1, dens - 2);
      const n2 = ((n1 - 1 + step) % (dens - 1)) + 1;
      return {
        a: { label: `${n1}/${dens}`, val: frac(n1, dens) },
        b: { label: `${n2}/${dens}`, val: frac(n2, dens) },
        why: `hai phân số cùng mẫu ${dens}, phân số nào có tử lớn hơn thì lớn hơn; ở đây ${n1} ${n1 > n2 ? '>' : '<'} ${n2} nên ${n1}/${dens} ${n1 > n2 ? '>' : '<'} ${n2}/${dens}`,
      };
    }
    // Tử nhỏ hơn cả hai mẫu ⇒ luôn là phân số nhỏ hơn 1, đúng tầm lớp 6
    const t = ri(r, 2, dens - 1);
    const d2 = dens + ri(r, 1, 4);
    return {
      a: { label: `${t}/${dens}`, val: frac(t, dens) },
      b: { label: `${t}/${d2}`, val: frac(t, d2) },
      why: `hai phân số cùng tử ${t}, chia cho càng nhiều phần thì mỗi phần càng nhỏ nên mẫu lớn hơn cho phân số NHỎ hơn; vì ${dens} < ${d2} nên ${t}/${dens} > ${t}/${d2}`,
    };
  }

  if (lvl === 1) {
    if (i === 0) {
      const a = ri(r, 5, 40);
      const b = a + ri(r, 1, 20);
      return {
        a: { label: `${ns(-a)}`, val: frac(-a, 1) },
        b: { label: `${ns(-b)}`, val: frac(-b, 1) },
        why: `trong hai số nguyên âm, số nào có giá trị tuyệt đối lớn hơn thì NHỎ hơn; |${ns(-a)}| = ${a} < ${b} = |${ns(-b)}| nên ${ns(-a)} > ${ns(-b)}`,
      };
    }
    if (i === 1) {
      const a = ri(r, 3, 45);
      return {
        a: { label: `${ns(-a)}`, val: frac(-a, 1) },
        b: { label: '0', val: frac(0, 1) },
        why: `mọi số nguyên âm đều nhỏ hơn 0 nên ${ns(-a)} < 0`,
      };
    }
    if (i === 2) {
      const a = ri(r, 4, 30);
      const b = a + ri(r, 1, 15);
      return {
        a: { label: `|${ns(-a)}|`, val: frac(a, 1) },
        b: { label: `${b}`, val: frac(b, 1) },
        why: `giá trị tuyệt đối bỏ dấu âm: |${ns(-a)}| = ${a}, mà ${a} < ${b} nên |${ns(-a)}| < ${b}`,
      };
    }
    const a = ri(r, 5, 30);
    const b = a + ri(r, 2, 20);
    return {
      a: { label: `${a} − ${b}`, val: frac(a - b, 1) },
      b: { label: `${b} − ${a}`, val: frac(b - a, 1) },
      why: `${a} − ${b} = ${ns(a - b)} là số âm còn ${b} − ${a} = ${b - a} là số dương, số âm luôn nhỏ hơn số dương`,
    };
  }

  // lvl 2 — so sánh cần quy đồng hoặc tính giá trị biểu thức
  if (i === 0) {
    const b = ri(r, 3, 9);
    const d = b + ri(r, 1, 4);
    const n1 = ri(r, 1, b - 1);
    let n2 = ri(r, 1, d - 1);
    if (n1 * d === n2 * b) n2 = (n2 % (d - 1)) + 1;
    return {
      a: { label: `${n1}/${b}`, val: frac(n1, b) },
      b: { label: `${n2}/${d}`, val: frac(n2, d) },
      why: `nhân chéo: ${n1} × ${d} = ${n1 * d} và ${n2} × ${b} = ${n2 * b}, vì ${n1 * d} ${n1 * d > n2 * b ? '>' : '<'} ${n2 * b} nên ${n1}/${b} ${n1 * d > n2 * b ? '>' : '<'} ${n2}/${d}`,
    };
  }
  if (i === 1) {
    const p = ri(r, 2, 5);
    const q = p + ri(r, 1, 4);
    const s = frac(p + q, p * q);
    const d = ri(r, 3, 9);
    let n = ri(r, 1, d - 1);
    if (fNum(frac(n, d)) === fNum(s)) n = (n % (d - 1)) + 1;
    return {
      a: { label: `1/${p} + 1/${q}`, val: s },
      b: { label: `${n}/${d}`, val: frac(n, d) },
      why: `1/${p} + 1/${q} = ${p + q}/${p * q} = ${fStr(s)}; so với ${n}/${d} bằng cách nhân chéo (${s.n} × ${d} = ${s.n * d} và ${n} × ${s.d} = ${n * s.d}) ta được ${fStr(s)} ${s.n * d > n * s.d ? '>' : '<'} ${n}/${d}`,
    };
  }
  if (i === 2) {
    const b = ri(r, 3, 9);
    const d = b + ri(r, 1, 5);
    const n1 = ri(r, 1, b - 1);
    let n2 = ri(r, 1, d - 1);
    if (n1 * d === n2 * b) n2 = (n2 % (d - 1)) + 1;
    return {
      a: { label: `−${n1}/${b}`, val: frac(-n1, b) },
      b: { label: `−${n2}/${d}`, val: frac(-n2, d) },
      why: `so sánh hai phân số ÂM thì làm ngược lại: ${n1}/${b} ${n1 * d > n2 * b ? '>' : '<'} ${n2}/${d} (nhân chéo ${n1 * d} và ${n2 * b}) nên −${n1}/${b} ${n1 * d > n2 * b ? '<' : '>'} −${n2}/${d}`,
    };
  }
  const dec = pick(r, [
    [25, 100],
    [4, 10],
    [5, 10],
    [6, 10],
    [75, 100],
    [8, 10],
  ] as [number, number][]);
  const decLabel = fmt(dec[0] / dec[1]);
  const decVal = frac(dec[0], dec[1]);
  const b2 = pick(r, [3, 4, 5, 6, 8]);
  let n3 = ri(r, 1, b2 - 1);
  if (fNum(frac(n3, b2)) === fNum(decVal)) n3 = (n3 % (b2 - 1)) + 1;
  const gt3 = n3 * decVal.d > decVal.n * b2;
  return {
    a: { label: `${n3}/${b2}`, val: frac(n3, b2) },
    b: { label: decLabel, val: decVal },
    why: `đổi số thập phân về phân số: ${decLabel} = ${fStr(decVal)}; rồi nhân chéo với ${n3}/${b2}: ${n3} × ${decVal.d} = ${n3 * decVal.d} và ${decVal.n} × ${b2} = ${decVal.n * b2}, vì ${n3 * decVal.d} ${gt3 ? '>' : '<'} ${decVal.n * b2} nên ${n3}/${b2} ${gt3 ? '>' : '<'} ${decLabel}`,
  };
}

/** INEQ01 — so sánh hai biểu thức số: chọn khẳng định ĐÚNG trong 4 khẳng định. */
function INEQ01(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const pairs: CmpPair[] = [];
  for (let i = 0; i < 4; i++) {
    let p = makeCmpPair(ctx, i);
    let guard = 0;
    while (fNum(p.a.val) === fNum(p.b.val) && guard++ < 25) p = makeCmpPair(ctx, i);
    if (fNum(p.a.val) === fNum(p.b.val)) {
      p = {
        a: { label: `${i + 1}/2`, val: frac(i + 1, 2) },
        b: { label: `${i + 2}/2`, val: frac(i + 2, 2) },
        why: `hai phân số cùng mẫu 2, tử ${i + 1} < ${i + 2} nên ${i + 1}/2 < ${i + 2}/2`,
      };
    }
    pairs.push(p);
  }

  const tIdx = ri(r, 0, 3);
  const say = (p: CmpPair, truth: boolean): string => {
    const gt = fNum(p.a.val) > fNum(p.b.val);
    return `${p.a.label} ${truth === gt ? '>' : '<'} ${p.b.label}`;
  };
  const correct = say(pairs[tIdx], true);
  const distractors = td(
    correct,
    pairs.filter((_, i) => i !== tIdx).map((p) => say(p, false)),
  );
  const lines = pairs.map((p, i) => `«${say(p, i === tIdx)}»: ${p.why} ⇒ khẳng định ${i === tIdx ? 'ĐÚNG' : 'SAI'}.`);
  const topic =
    lvl === 0 ? 'so sánh phân số cùng mẫu hoặc cùng tử' : lvl === 1 ? 'so sánh số nguyên âm và giá trị tuyệt đối' : 'so sánh biểu thức bằng cách quy đồng hoặc nhân chéo';

  return {
    stem: `Trong các khẳng định sau, khẳng định nào ĐÚNG?`,
    correct,
    distractors,
    solution: `Xét lần lượt từng khẳng định (${topic}). ${lines.join(' ')} Vậy chỉ có «${correct}» là đúng.`,
    steps: lines,
    hint: 'Đưa hai vế về cùng dạng (cùng mẫu, cùng đơn vị hoặc cùng số thập phân) rồi mới so sánh.',
    tags: ['so sánh', 'bất đẳng thức'],
  };
}

/** INEQ02 — tìm số nguyên thỏa mãn bất đẳng thức kép. */
function INEQ02(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const v = Math.floor(slot / 3);

  if (lvl === 0) {
    const a = ri(r, 3, 15);
    const b = ri(r, 4, 20);
    if (v % 2 === 0) {
      const list = intsWhere(-200, 200, (x) => -a < x && x <= b);
      const cnt = list.length;
      return {
        stem: `Có bao nhiêu số nguyên x thỏa mãn ${ns(-a)} < x ≤ ${b}?`,
        correct: ns(cnt),
        numeric: cnt,
        distractors: ndU(cnt, [cnt - 1, cnt + 1, b - a, cnt - 2, b + a - 1]),
        solution: `Vì dấu bên trái là "<" nên KHÔNG lấy ${ns(-a)}, số nguyên nhỏ nhất thỏa mãn là ${ns(-a + 1)}. Dấu bên phải là "≤" nên CÓ lấy ${b}. Các số nguyên thỏa mãn là ${ns(-a + 1)}; ${ns(-a + 2)}; …; ${b}. Số lượng = ${b} − (${ns(-a + 1)}) + 1 = ${cnt}. Quên cộng 1 khi đếm sẽ ra ${cnt - 1}; lấy nhầm cả ${ns(-a)} sẽ ra ${cnt + 1}. Nhớ rằng dãy này có cả số 0.`,
        steps: [
          `Dấu "<" ⇒ bỏ ${ns(-a)}, số nhỏ nhất là ${ns(-a + 1)}`,
          `Dấu "≤" ⇒ lấy cả ${b}`,
          `Số lượng = ${b} − (${ns(-a + 1)}) + 1 = ${cnt}`,
        ],
        hint: 'Xác định số nhỏ nhất và lớn nhất thỏa mãn, rồi dùng công thức (lớn − nhỏ) + 1.',
        tags: ['bất đẳng thức kép', 'đếm số nguyên'],
      };
    }
    const list = intsWhere(-200, 200, (x) => -a <= x && x < b);
    const cnt = list.length;
    const maxX = list[list.length - 1];
    return {
      stem: `Tìm số nguyên x LỚN NHẤT thỏa mãn ${ns(-a)} ≤ x < ${b}.`,
      correct: ns(maxX),
      numeric: maxX,
      distractors: ndU(maxX, [b, cnt, maxX - 1, -a, b + 1]),
      solution: `Điều kiện bên phải là x < ${b} — dấu CHẶT nên x không được bằng ${b}. Số nguyên lớn nhất còn nhỏ hơn ${b} là ${ns(maxX)}. (Toàn bộ các số thỏa mãn là ${ns(-a)}; …; ${ns(maxX)}, gồm ${cnt} số.) Trả lời ${b} là bẫy kinh điển do đọc nhầm "<" thành "≤".`,
      steps: [`x < ${b} nên x ≠ ${b}`, `Số nguyên lớn nhất nhỏ hơn ${b} là ${ns(maxX)}`],
      hint: 'Dấu "<" không lấy đầu mút, dấu "≤" mới lấy.',
      tags: ['bất đẳng thức kép', 'dấu chặt'],
    };
  }

  if (lvl === 1) {
    const k = ri(r, 2, 4);
    const q = ri(r, 1, 9);
    const lo = ri(r, -6, 2);
    const hi = lo + ri(r, 4, 12);
    // Hai đầu mút chọn sao cho khi chia cho k vẫn ra số nguyên ⇒ lời giải không có số thập phân
    const P = k * lo - q;
    const Ssup = k * hi - q;
    const list = intsWhere(-300, 300, (x) => P < k * x - q && k * x - q <= Ssup);
    const cnt = list.length;
    return {
      stem: `Có bao nhiêu số nguyên x thỏa mãn ${ns(P)} < ${k}x − ${q} ≤ ${ns(Ssup)}?`,
      correct: ns(cnt),
      numeric: cnt,
      distractors: ndU(cnt, [cnt - 1, cnt + 1, Ssup - P, Math.floor((Ssup - P) / k), cnt + 2]),
      solution: `Cộng ${q} vào cả ba vế: ${ns(P + q)} < ${k}x ≤ ${ns(Ssup + q)}. Chia cả ba vế cho ${k} (số dương nên giữ nguyên chiều): ${ns(lo)} < x ≤ ${ns(hi)}. Dấu bên trái là "<" nên KHÔNG lấy ${ns(lo)}, số nguyên nhỏ nhất là ${ns(lo + 1)}; dấu bên phải là "≤" nên lấy cả ${ns(hi)}. Các số nguyên thỏa mãn là ${list
        .slice(0, 3)
        .map(ns)
        .join('; ')}${cnt > 3 ? `; …; ${ns(list[cnt - 1])}` : ''}, tất cả có ${ns(hi)} − ${pn(lo + 1)} + 1 = ${cnt} số. Quên cộng 1 khi đếm sẽ ra ${cnt - 1}; lấy nhầm cả ${ns(lo)} sẽ ra ${cnt + 1}.`,
      steps: [
        `Cộng ${q} vào ba vế: ${ns(P + q)} < ${k}x ≤ ${ns(Ssup + q)}`,
        `Chia ba vế cho ${k}: ${ns(lo)} < x ≤ ${ns(hi)}`,
        `x nguyên: từ ${ns(list[0])} đến ${ns(list[cnt - 1])} ⇒ ${cnt} số`,
      ],
      hint: 'Biến đổi bất đẳng thức kép bằng cách cộng/chia cho CẢ BA vế cùng lúc.',
      tags: ['bất đẳng thức kép', 'đếm số nguyên'],
    };
  }

  // lvl 2 — tính tổng các số nguyên thỏa mãn (bẫy: các số đối nhau triệt tiêu)
  const a = ri(r, 4, 20);
  const b = ri(r, 3, 18);
  if (v % 2 === 0) {
    const list = intsWhere(-300, 300, (x) => -a <= x && x < b);
    const total = sum(list);
    const cnt = list.length;
    return {
      stem: `Tính tổng tất cả các số nguyên x thỏa mãn ${ns(-a)} ≤ x < ${b}.`,
      correct: ns(total),
      numeric: total,
      distractors: ndU(total, [total + b, total - -a, cnt, total + 1, sum(list.map(Math.abs))]),
      solution: `Bên trái dấu "≤" nên lấy cả ${ns(-a)}; bên phải dấu "<" nên KHÔNG lấy ${b}, số lớn nhất là ${ns(b - 1)}. Dãy số nguyên cần tính tổng: ${ns(-a)}; ${ns(-a + 1)}; …; ${ns(b - 1)}, gồm ${cnt} số. Tổng = (số đầu + số cuối) × số số hạng : 2 = (${ns(-a)} + ${ns(b - 1)}) × ${cnt} : 2 = ${ns(total)}. Mẹo nhanh: các cặp số đối nhau như ${ns(-Math.min(a, b - 1))} và ${Math.min(a, b - 1)} triệt tiêu lẫn nhau. Lấy nhầm cả ${b} sẽ ra ${ns(total + b)}.`,
      steps: [
        `Các số thỏa mãn: từ ${ns(-a)} đến ${ns(b - 1)}`,
        `Số số hạng = ${ns(b - 1)} − (${ns(-a)}) + 1 = ${cnt}`,
        `Tổng = (${ns(-a)} + ${ns(b - 1)}) × ${cnt} : 2 = ${ns(total)}`,
      ],
      hint: 'Liệt kê hai đầu mút cho đúng dấu chặt, rồi dùng công thức tổng dãy cách đều.',
      tags: ['bất đẳng thức kép', 'tổng dãy số'],
    };
  }
  const k = ri(r, 2, 3);
  const lo = ri(r, -8, -2);
  const hi = lo + ri(r, 5, 12);
  // Hai đầu mút là bội của k ⇒ chia xong vẫn là số nguyên, bẫy nằm ở dấu chặt bên phải
  const P = k * lo;
  const Q = k * hi;
  const list = intsWhere(-400, 400, (x) => P <= k * x && k * x < Q);
  const cnt = list.length;
  const total = sum(list);
  return {
    stem: `Tính tổng tất cả các số nguyên x thỏa mãn ${ns(P)} ≤ ${k}x < ${ns(Q)}.`,
    correct: ns(total),
    numeric: total,
    distractors: ndU(total, [total + list[cnt - 1] + 1, cnt, total * k, total - list[0], sum(list.map(Math.abs))]),
    solution: `Chia cả ba vế cho ${k} (số dương, giữ nguyên chiều bất đẳng thức): ${ns(lo)} ≤ x < ${ns(hi)}. Vì x nguyên nên x nhận các giá trị ${ns(list[0])}; ${ns(list[1])}; …; ${ns(list[cnt - 1])} — tất cả ${cnt} số. Tổng = (${ns(list[0])} + ${ns(list[cnt - 1])}) × ${cnt} : 2 = ${ns(total)}. Bẫy: chia xong lấy luôn cả đầu mút phải ${ns(hi)} dù dấu là "<".`,
    steps: [
      `Chia ba vế cho ${k}: ${ns(lo)} ≤ x < ${ns(hi)}`,
      `x nguyên: từ ${ns(list[0])} đến ${ns(list[cnt - 1])}, có ${cnt} số`,
      `Tổng = (${ns(list[0])} + ${ns(list[cnt - 1])}) × ${cnt} : 2 = ${ns(total)}`,
    ],
    hint: 'Chia cho hệ số dương thì chiều bất đẳng thức không đổi; giữ nguyên dấu chặt ở hai đầu.',
    tags: ['bất đẳng thức kép', 'tổng dãy số', 'nhiều bước'],
  };
}

/** INEQ03 — giá trị lớn nhất, nhỏ nhất của biểu thức đơn giản. */
function INEQ03(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const v = Math.floor(slot / 3);

  if (lvl === 0) {
    const a = ri(r, 2, 12);
    const b = ri(r, 3, 30);
    if (v % 2 === 0) {
      return {
        stem: `Cho biểu thức A = (x − ${a})² + ${b}. Tìm giá trị nhỏ nhất của A.`,
        correct: ns(b),
        numeric: b,
        distractors: ndU(b, [b + a * a, b - a * a, a * a, b + a, a]),
        solution: `Với mọi giá trị của x ta luôn có (x − ${a})² ≥ 0, do đó A = (x − ${a})² + ${b} ≥ ${b}. Dấu bằng xảy ra khi (x − ${a})² = 0, tức x = ${a}. Vậy giá trị nhỏ nhất của A bằng ${b}, đạt được tại x = ${a}. Đáp án KHÔNG phải ${a} — đó là giá trị của x làm A nhỏ nhất, không phải giá trị nhỏ nhất của A.`,
        steps: [`(x − ${a})² ≥ 0 với mọi x`, `A = (x − ${a})² + ${b} ≥ ${b}`, `Dấu "=" khi x = ${a} ⇒ A nhỏ nhất bằng ${b}`],
        hint: 'Bình phương luôn không âm nên tổng đạt nhỏ nhất khi bình phương bằng 0.',
        tags: ['giá trị nhỏ nhất', 'bình phương'],
      };
    }
    const c = ri(r, 20, 60);
    return {
      stem: `Cho biểu thức B = ${c} − (x − ${a})². Tìm giá trị lớn nhất của B.`,
      correct: ns(c),
      numeric: c,
      distractors: ndU(c, [c - a * a, c + a * a, a * a, a, c - a]),
      solution: `Vì (x − ${a})² ≥ 0 với mọi x nên −(x − ${a})² ≤ 0, do đó B = ${c} − (x − ${a})² ≤ ${c}. Dấu bằng xảy ra khi x = ${a}. Vậy giá trị lớn nhất của B bằng ${c} tại x = ${a}. Chú ý dấu trừ trước bình phương biến bài toán từ "nhỏ nhất" thành "lớn nhất".`,
      steps: [`(x − ${a})² ≥ 0 ⇒ −(x − ${a})² ≤ 0`, `B ≤ ${c}`, `Dấu "=" khi x = ${a} ⇒ B lớn nhất bằng ${c}`],
      hint: 'Trừ đi một số không âm thì kết quả lớn nhất khi số đó bằng 0.',
      tags: ['giá trị lớn nhất', 'bình phương'],
    };
  }

  if (lvl === 1) {
    const a = ri(r, 2, 12);
    const k = ri(r, 2, 6);
    if (v % 2 === 0) {
      const b = ri(r, 4, 30);
      return {
        stem: `Cho biểu thức C = ${k}(x − ${a})² + ${b}. Tìm giá trị nhỏ nhất của C.`,
        correct: ns(b),
        numeric: b,
        distractors: ndU(b, [k * b, b + k * a * a, b + a * a, b + k, b - k]),
        solution: `Vì (x − ${a})² ≥ 0 nên ${k}(x − ${a})² ≥ 0 (nhân với số dương ${k} không đổi chiều). Do đó C = ${k}(x − ${a})² + ${b} ≥ ${b}, dấu bằng khi x = ${a}. Giá trị nhỏ nhất của C là ${b}. Hệ số ${k} KHÔNG nhân vào ${b} — nhân nhầm sẽ ra ${k * b}.`,
        steps: [`${k}(x − ${a})² ≥ 0 với mọi x`, `C ≥ ${b}`, `Dấu "=" khi x = ${a} ⇒ C nhỏ nhất bằng ${b}`],
        hint: 'Nhân bình phương với số dương vẫn không âm; hằng số cộng thêm chính là giá trị nhỏ nhất.',
        tags: ['giá trị nhỏ nhất', 'hệ số'],
      };
    }
    const c = ri(r, 25, 70);
    return {
      stem: `Cho biểu thức D = ${c} − ${k}|x − ${a}|. Biết D đạt giá trị lớn nhất, hỏi khi đó x bằng bao nhiêu?`,
      correct: ns(a),
      numeric: a,
      distractors: ndU(a, [c, c - a, a * k, -a, c - k * a]),
      solution: `Giá trị tuyệt đối luôn không âm: |x − ${a}| ≥ 0 nên ${k}|x − ${a}| ≥ 0 và D = ${c} − ${k}|x − ${a}| ≤ ${c}. D lớn nhất bằng ${c} khi và chỉ khi |x − ${a}| = 0, tức x − ${a} = 0 hay x = ${a}. Đề hỏi GIÁ TRỊ CỦA X chứ không hỏi giá trị lớn nhất (${c}) — đọc kỹ câu hỏi.`,
      steps: [`|x − ${a}| ≥ 0 ⇒ D ≤ ${c}`, `D lớn nhất khi |x − ${a}| = 0`, `x = ${a}`],
      hint: 'Giá trị tuyệt đối bằng 0 khi biểu thức bên trong bằng 0.',
      tags: ['giá trị lớn nhất', 'giá trị tuyệt đối'],
    };
  }

  // lvl 2 — phải hoàn thành bình phương mới thấy được giá trị cực trị
  const a = ri(r, 2, 9);
  if (v % 2 === 0) {
    const c = ri(r, a * a + 2, a * a + 40);
    const val = c - a * a;
    return {
      stem: `Cho biểu thức E = ${poly([
        [1, 'x²'],
        [-2 * a, 'x'],
        [c, ''],
      ])}. Tìm giá trị nhỏ nhất của E.`,
      correct: ns(val),
      numeric: val,
      distractors: ndU(val, [c, c + a * a, a * a, c - 2 * a, c - a]),
      solution: `Hoàn thành bình phương: E = x² − ${2 * a}x + ${c} = (x² − ${2 * a}x + ${a * a}) + (${c} − ${a * a}) = (x − ${a})² + ${val}. Vì (x − ${a})² ≥ 0 nên E ≥ ${val}, dấu bằng khi x = ${a}. Vậy giá trị nhỏ nhất của E bằng ${val}. Nếu vội trả lời ${c} là quên bù trừ ${a * a} khi thêm bớt để tạo bình phương.`,
      steps: [
        `Thêm bớt ${a * a}: E = (x² − ${2 * a}x + ${a * a}) + ${c} − ${a * a}`,
        `E = (x − ${a})² + ${val}`,
        `(x − ${a})² ≥ 0 ⇒ E nhỏ nhất bằng ${val} tại x = ${a}`,
      ],
      hint: 'x² − 2ax + a² = (x − a)² — thêm a² thì phải bớt a² để biểu thức không đổi.',
      tags: ['giá trị nhỏ nhất', 'hằng đẳng thức', 'nhiều bước'],
    };
  }
  const c = ri(r, 10, 50);
  const val = c + a * a;
  return {
    stem: `Cho biểu thức F = ${poly([
      [c, ''],
      [-1, 'x²'],
      [-2 * a, 'x'],
    ])}. Tìm giá trị lớn nhất của F.`,
    correct: ns(val),
    numeric: val,
    distractors: ndU(val, [c, c - a * a, a * a, c + 2 * a, c + a]),
    solution: `Nhóm hai hạng tử chứa x rồi hoàn thành bình phương: F = ${c} − (x² + ${2 * a}x) = ${c} − (x² + ${2 * a}x + ${a * a}) + ${a * a} = ${val} − (x + ${a})². Vì (x + ${a})² ≥ 0 nên F ≤ ${val}, dấu bằng khi x = ${ns(-a)}. Vậy giá trị lớn nhất của F bằng ${val}. Chú ý khi đưa ${a * a} vào trong ngoặc có dấu trừ thì phải cộng bù ${a * a} ra ngoài — quên bước này sẽ ra ${c}.`,
    steps: [
      `F = ${c} − (x² + ${2 * a}x)`,
      `Thêm bớt ${a * a}: F = ${c} + ${a * a} − (x + ${a})²`,
      `(x + ${a})² ≥ 0 ⇒ F lớn nhất bằng ${val} tại x = ${ns(-a)}`,
    ],
    hint: 'Đưa dấu trừ ra ngoài rồi hoàn thành bình phương, nhớ bù lại phần đã thêm.',
    tags: ['giá trị lớn nhất', 'hằng đẳng thức', 'nhiều bước'],
  };
}

// ===========================================================================
// CHƯƠNG SEQ — DÃY SỐ VÀ QUY LUẬT
// ===========================================================================

/** SEQ01 — tìm quy luật và số hạng tiếp theo của dãy. */
function SEQ01(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const v = Math.floor(slot / 3);

  if (lvl === 0) {
    const d = ri(r, 2, 9);
    if (v % 2 === 0) {
      const u1 = ri(r, 2, 25);
      const terms = [0, 1, 2, 3, 4].map((i) => u1 + i * d);
      const last = terms[4];
      const next = last + d;
      return {
        stem: `Dãy số sau được viết theo quy luật: ${terms.join('; ')}; … Số hạng tiếp theo của dãy là số nào?`,
        correct: ns(next),
        numeric: next,
        distractors: ndU(next, [last + d + 1, last + d - 1, last * 2, last + u1, next + d]),
        solution: `Lấy số sau trừ số liền trước: ${terms[1]} − ${terms[0]} = ${d}; ${terms[2]} − ${terms[1]} = ${d}; … Hiệu luôn bằng ${d} nên đây là dãy số cách đều với khoảng cách ${d}. Số hạng tiếp theo = ${last} + ${d} = ${next}.`,
        steps: [`Hiệu hai số liên tiếp: ${d}`, `Số hạng tiếp theo = ${last} + ${d} = ${next}`],
        hint: 'Tính hiệu của vài cặp số liên tiếp; nếu hiệu không đổi thì cộng thêm hiệu đó.',
        tags: ['quy luật dãy số', 'dãy cách đều'],
      };
    }
    const u1 = ri(r, 60, 120);
    const terms = [0, 1, 2, 3, 4].map((i) => u1 - i * d);
    const last = terms[4];
    const next = last - d;
    return {
      stem: `Dãy số sau được viết theo quy luật: ${terms.join('; ')}; … Số hạng tiếp theo của dãy là số nào?`,
      correct: ns(next),
      numeric: next,
      distractors: ndU(next, [last + d, last - d - 1, last - d + 1, last - 2 * d, u1 - 5 * d - d]),
      solution: `Dãy này GIẢM dần: ${terms[0]} − ${terms[1]} = ${d}, ${terms[1]} − ${terms[2]} = ${d}, … nên mỗi số hạng kém số liền trước đúng ${d} đơn vị. Số hạng tiếp theo = ${last} − ${d} = ${next}. Cộng thêm ${d} (ra ${last + d}) là đọc nhầm chiều của dãy.`,
      steps: [`Dãy giảm đều, khoảng cách ${d}`, `Số hạng tiếp theo = ${last} − ${d} = ${next}`],
      hint: 'Dãy giảm thì số hạng sau bằng số hạng trước TRỪ đi khoảng cách.',
      tags: ['quy luật dãy số', 'dãy cách đều'],
    };
  }

  if (lvl === 1) {
    if (v % 2 === 0) {
      const u1 = ri(r, 1, 5);
      const q = ri(r, 2, 3);
      const terms = [0, 1, 2, 3, 4].map((i) => u1 * Math.pow(q, i));
      const last = terms[4];
      const prev = terms[3];
      const next = last * q;
      return {
        stem: `Dãy số sau được viết theo quy luật: ${terms.join('; ')}; … Số hạng tiếp theo của dãy là số nào?`,
        correct: ns(next),
        numeric: next,
        distractors: ndU(next, [last + (last - prev), last + q, last * q + q, last + last, next + q]),
        solution: `Ở đây hiệu hai số liên tiếp KHÔNG cố định (${terms[1]} − ${terms[0]} = ${terms[1] - terms[0]} nhưng ${terms[4]} − ${terms[3]} = ${last - prev}), nhưng thương thì không đổi: ${terms[1]} : ${terms[0]} = ${q}, ${terms[2]} : ${terms[1]} = ${q}, … Quy luật là mỗi số hạng gấp ${q} lần số hạng liền trước. Số tiếp theo = ${last} × ${q} = ${next}. Dùng hiệu ${last - prev} để cộng tiếp sẽ ra ${last + (last - prev)} — sai quy luật.`,
        steps: [`Thương hai số liên tiếp luôn bằng ${q}`, `Số hạng tiếp theo = ${last} × ${q} = ${next}`],
        hint: 'Hiệu không đều thì thử chia số sau cho số trước xem thương có cố định không.',
        tags: ['quy luật dãy số', 'nhân theo tỉ số'],
      };
    }
    const s = ri(r, 1, 9);
    const k = ri(r, 2, 5);
    const e = ri(r, 1, 4);
    const terms = [s];
    for (let i = 0; i < 4; i++) terms.push(terms[i] + k + i * e);
    const last = terms[4];
    const nextDiff = k + 4 * e;
    const next = last + nextDiff;
    return {
      stem: `Dãy số sau được viết theo quy luật: ${terms.join('; ')}; … Số hạng tiếp theo của dãy là số nào?`,
      correct: ns(next),
      numeric: next,
      distractors: ndU(next, [last + (k + 3 * e), last + k, last + e, last * 2, next + e]),
      solution: `Xét hiệu các số liên tiếp: ${terms[1] - terms[0]}; ${terms[2] - terms[1]}; ${terms[3] - terms[2]}; ${terms[4] - terms[3]} — dãy hiệu này lại tăng đều thêm ${e} mỗi lần. Vậy hiệu tiếp theo là ${k + 3 * e} + ${e} = ${nextDiff}, và số hạng cần tìm = ${last} + ${nextDiff} = ${next}. Dùng lại hiệu cũ ${k + 3 * e} sẽ ra ${last + (k + 3 * e)} — sai.`,
      steps: [
        `Dãy hiệu: ${terms[1] - terms[0]}; ${terms[2] - terms[1]}; ${terms[3] - terms[2]}; ${terms[4] - terms[3]}`,
        `Dãy hiệu tăng đều ${e} ⇒ hiệu tiếp theo = ${nextDiff}`,
        `Số hạng tiếp theo = ${last} + ${nextDiff} = ${next}`,
      ],
      hint: 'Nếu dãy hiệu chưa đều, hãy xét tiếp hiệu của dãy hiệu đó.',
      tags: ['quy luật dãy số', 'hiệu cấp hai'],
    };
  }

  // lvl 2 — quy luật phức tạp hơn: Fibonacci, tích n(n + c), hoặc nhân rồi cộng
  const form = v % 3;
  if (form === 0) {
    const a0 = ri(r, 1, 4);
    const a1 = a0 + ri(r, 1, 5);
    const terms = [a0, a1];
    for (let i = 2; i < 6; i++) terms.push(terms[i - 1] + terms[i - 2]);
    const next = terms[5] + terms[4];
    return {
      stem: `Dãy số sau được viết theo quy luật: ${terms.join('; ')}; … Số hạng tiếp theo của dãy là số nào?`,
      correct: ns(next),
      numeric: next,
      distractors: ndU(next, [terms[5] + (terms[5] - terms[4]), terms[5] * 2, terms[5] + terms[3], next + 1, terms[5] + a0]),
      solution: `Kiểm tra: ${terms[0]} + ${terms[1]} = ${terms[2]}; ${terms[1]} + ${terms[2]} = ${terms[3]}; ${terms[2]} + ${terms[3]} = ${terms[4]}; ${terms[3]} + ${terms[4]} = ${terms[5]}. Quy luật: mỗi số hạng (từ số thứ ba) bằng TỔNG hai số hạng đứng ngay trước nó. Vậy số tiếp theo = ${terms[4]} + ${terms[5]} = ${next}.`,
      steps: [
        `${terms[2]} = ${terms[0]} + ${terms[1]}`,
        `${terms[5]} = ${terms[3]} + ${terms[4]}`,
        `Số hạng tiếp theo = ${terms[4]} + ${terms[5]} = ${next}`,
      ],
      hint: 'Thử cộng hai số hạng liền trước xem có ra số hạng đứng sau không.',
      tags: ['quy luật dãy số', 'suy luận'],
    };
  }
  if (form === 1) {
    const c = ri(r, 0, 3);
    const terms = [1, 2, 3, 4, 5].map((n) => n * (n + c));
    const next = 6 * (6 + c);
    const last = terms[4];
    const prev = terms[3];
    return {
      stem: `Dãy số sau được viết theo quy luật: ${terms.join('; ')}; … Số hạng tiếp theo của dãy là số nào?`,
      correct: ns(next),
      numeric: next,
      distractors: ndU(next, [last + (last - prev), last * 2, last + 10, next - 2, last + (last - prev) + 1]),
      solution: `Viết lại các số hạng theo vị trí n: ${terms
        .map((t, i) => `${i + 1} × ${i + 1 + c} = ${t}`)
        .join('; ')}. Quy luật: số hạng thứ n bằng n × (n + ${c}). Vậy số hạng thứ 6 = 6 × ${6 + c} = ${next}. Dùng hiệu của hai số hạng cuối (${last - prev}) để cộng tiếp sẽ ra ${last + (last - prev)} — sai vì dãy này KHÔNG cách đều.`,
      steps: [`Số hạng thứ n = n × (n + ${c})`, `Kiểm tra: 5 × ${5 + c} = ${last} ✓`, `Số hạng thứ 6 = 6 × ${6 + c} = ${next}`],
      hint: 'Thử phân tích mỗi số hạng thành tích của vị trí n với một số liên quan tới n.',
      tags: ['quy luật dãy số', 'số hạng tổng quát'],
    };
  }
  const c = ri(r, 1, 3);
  const u1 = ri(r, 1, 4);
  const terms = [u1];
  for (let i = 0; i < 4; i++) terms.push(2 * terms[i] + c);
  const last = terms[4];
  const prev = terms[3];
  const next = 2 * last + c;
  return {
    stem: `Dãy số sau được viết theo quy luật: ${terms.join('; ')}; … Số hạng tiếp theo của dãy là số nào?`,
    correct: ns(next),
    numeric: next,
    distractors: ndU(next, [last * 2, last + c, last + (last - prev), next + c, last + prev]),
    solution: `Thử quy luật "nhân 2 rồi cộng thêm": ${terms[0]} × 2 + ${c} = ${terms[1]}; ${terms[1]} × 2 + ${c} = ${terms[2]}; ${terms[2]} × 2 + ${c} = ${terms[3]}; ${terms[3]} × 2 + ${c} = ${terms[4]}. Đúng với mọi cặp, vậy số hạng tiếp theo = ${last} × 2 + ${c} = ${next}. Chỉ nhân 2 mà quên cộng ${c} sẽ ra ${last * 2}.`,
    steps: [`Quy luật: số sau = số trước × 2 + ${c}`, `Kiểm tra: ${terms[3]} × 2 + ${c} = ${terms[4]} ✓`, `Số tiếp theo = ${last} × 2 + ${c} = ${next}`],
    hint: 'Khi vừa nhân vừa cộng, hãy thử công thức "số trước × k + m" trên mọi cặp.',
    tags: ['quy luật dãy số', 'suy luận'],
  };
}

/** SEQ02 — số hạng thứ n của dãy số cách đều. */
function SEQ02(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const v = Math.floor(slot / 3);

  if (lvl === 0) {
    const u1 = ri(r, 1, 20);
    const d = ri(r, 2, 9);
    const n = ri(r, 8, 25);
    const un = u1 + (n - 1) * d;
    return {
      stem: `Cho dãy số cách đều ${u1}; ${u1 + d}; ${u1 + 2 * d}; ${u1 + 3 * d}; … Số hạng thứ ${n} của dãy bằng bao nhiêu?`,
      correct: ns(un),
      numeric: un,
      distractors: ndU(un, [u1 + n * d, u1 + (n - 2) * d, n * d, u1 * n, un + d]),
      solution: `Khoảng cách của dãy: d = ${u1 + d} − ${u1} = ${d}. Công thức số hạng thứ n của dãy cách đều: uₙ = u₁ + (n − 1) × d. Thay số: u_${n} = ${u1} + (${n} − 1) × ${d} = ${u1} + ${(n - 1) * d} = ${un}. Lỗi kinh điển là quên trừ 1, tính ${u1} + ${n} × ${d} = ${u1 + n * d} — thừa đúng một khoảng cách.`,
      steps: [`Khoảng cách d = ${d}`, `u_${n} = ${u1} + (${n} − 1) × ${d}`, `= ${u1} + ${(n - 1) * d} = ${un}`],
      hint: 'Từ số hạng đầu tới số hạng thứ n chỉ có (n − 1) khoảng cách chứ không phải n.',
      tags: ['dãy cách đều', 'số hạng thứ n'],
    };
  }

  if (lvl === 1) {
    if (v % 2 === 0) {
      const u1 = ri(r, 2, 15);
      const d = ri(r, 3, 9);
      const n = ri(r, 12, 40);
      const V = u1 + (n - 1) * d;
      return {
        stem: `Cho dãy số ${u1}; ${u1 + d}; ${u1 + 2 * d}; ${u1 + 3 * d}; … (hai số hạng liên tiếp hơn kém nhau ${d} đơn vị). Số ${V} là số hạng thứ mấy của dãy?`,
        correct: ns(n),
        numeric: n,
        distractors: ndU(n, [n - 1, n + 1, V - u1, Math.floor(V / d), n - 2]),
        solution: `Từ công thức uₙ = u₁ + (n − 1)d ta có ${V} = ${u1} + (n − 1) × ${d}. Suy ra (n − 1) × ${d} = ${V} − ${u1} = ${V - u1}, nên n − 1 = ${V - u1} : ${d} = ${n - 1} và n = ${n - 1} + 1 = ${n}. Quên bước cộng 1 cuối cùng sẽ trả lời ${n - 1} — đây là lỗi phổ biến nhất của dạng bài này.`,
        steps: [
          `${V} = ${u1} + (n − 1) × ${d}`,
          `(n − 1) × ${d} = ${V - u1} ⇒ n − 1 = ${n - 1}`,
          `n = ${n - 1} + 1 = ${n}`,
        ],
        hint: 'Tìm được (n − 1) rồi thì phải cộng thêm 1 mới ra vị trí n.',
        tags: ['dãy cách đều', 'tìm vị trí'],
      };
    }
    const d = ri(r, 3, 9);
    const n = ri(r, 10, 30);
    // Số hạng đầu đủ lớn để mọi số hạng của dãy giảm vẫn là số tự nhiên
    const u1 = (n - 1) * d + ri(r, 5, 60);
    const un = u1 - (n - 1) * d;
    return {
      stem: `Cho dãy số giảm đều ${u1}; ${u1 - d}; ${u1 - 2 * d}; ${u1 - 3 * d}; … Số hạng thứ ${n} của dãy bằng bao nhiêu?`,
      correct: ns(un),
      numeric: un,
      distractors: ndU(un, [u1 - n * d, u1 + (n - 1) * d, u1 - (n - 2) * d, un - d, u1 - n * d - d]),
      solution: `Dãy giảm đều nên khoảng cách là ${d} và mỗi bước ta TRỪ đi ${d}: uₙ = u₁ − (n − 1) × d = ${u1} − (${n} − 1) × ${d} = ${u1} − ${(n - 1) * d} = ${un}. Nếu cộng thay vì trừ sẽ ra ${u1 + (n - 1) * d}; nếu trừ ${n} lần thay vì ${n - 1} lần sẽ ra ${u1 - n * d}.`,
      steps: [`Dãy giảm, khoảng cách ${d}`, `u_${n} = ${u1} − (${n} − 1) × ${d}`, `= ${u1} − ${(n - 1) * d} = ${un}`],
      hint: 'Dãy giảm dùng công thức u₁ − (n − 1)d.',
      tags: ['dãy cách đều', 'số hạng thứ n'],
    };
  }

  // lvl 2 — chưa biết u₁ và d, phải suy ra từ hai số hạng đã cho
  if (v % 2 === 0) {
    const u1 = ri(r, 2, 20);
    const d = ri(r, 2, 9);
    const i = ri(r, 2, 5);
    const j = i + ri(r, 3, 6);
    const n = j + ri(r, 4, 15);
    const A = u1 + (i - 1) * d;
    const B = u1 + (j - 1) * d;
    const un = u1 + (n - 1) * d;
    return {
      stem: `Một dãy số cách đều có số hạng thứ ${i} bằng ${A} và số hạng thứ ${j} bằng ${B}. Hỏi số hạng thứ ${n} của dãy bằng bao nhiêu?`,
      correct: ns(un),
      numeric: un,
      distractors: ndU(un, [A + n * d, u1 + n * d, un + d, un - d, A + (n - i) * (B - A)]),
      solution: `Từ số hạng thứ ${i} đến số hạng thứ ${j} có ${j} − ${i} = ${j - i} khoảng cách, mà giá trị tăng thêm ${B} − ${A} = ${B - A}. Vậy d = ${B - A} : ${j - i} = ${d}. Số hạng đầu: u₁ = ${A} − (${i} − 1) × ${d} = ${u1}. Số hạng thứ ${n}: u_${n} = ${u1} + (${n} − 1) × ${d} = ${un}. Cũng có thể đi tắt: u_${n} = ${A} + (${n} − ${i}) × ${d} = ${un}. Chia ${B - A} cho ${j - i + 1} (đếm nhầm số khoảng cách) là lỗi hay gặp.`,
      steps: [
        `Số khoảng cách giữa hai số hạng: ${j} − ${i} = ${j - i}`,
        `d = (${B} − ${A}) : ${j - i} = ${d}`,
        `u₁ = ${A} − (${i} − 1) × ${d} = ${u1}`,
        `u_${n} = ${u1} + (${n} − 1) × ${d} = ${un}`,
      ],
      hint: 'Giữa số hạng thứ i và thứ j có (j − i) khoảng cách, không phải (j − i + 1).',
      tags: ['dãy cách đều', 'nhiều bước'],
    };
  }
  const u1 = ri(r, 2, 15);
  const d = ri(r, 2, 8);
  const cnt = ri(r, 12, 40);
  const uk = u1 + (cnt - 1) * d;
  const p = ri(r, 3, cnt - 1);
  const up = u1 + (p - 1) * d;
  return {
    stem: `Một dãy số cách đều có số hạng đầu là ${u1}, số hạng cuối là ${uk} và có tất cả ${cnt} số hạng. Hỏi số hạng thứ ${p} của dãy bằng bao nhiêu?`,
    correct: ns(up),
    numeric: up,
    distractors: ndU(up, [u1 + p * d, u1 + (p - 1) * Math.floor((uk - u1) / cnt), up + d, up - d, u1 + (p - 1) * (d + 1)]),
    solution: `Dãy có ${cnt} số hạng nên giữa số hạng đầu và số hạng cuối có ${cnt} − 1 = ${cnt - 1} khoảng cách. Do đó d = (${uk} − ${u1}) : ${cnt - 1} = ${uk - u1} : ${cnt - 1} = ${d}. Số hạng thứ ${p}: u_${p} = ${u1} + (${p} − 1) × ${d} = ${u1} + ${(p - 1) * d} = ${up}. Chia cho ${cnt} thay vì ${cnt - 1} là bẫy quen thuộc: số khoảng cách luôn ít hơn số số hạng đúng 1 đơn vị.`,
    steps: [
      `Số khoảng cách = ${cnt} − 1 = ${cnt - 1}`,
      `d = (${uk} − ${u1}) : ${cnt - 1} = ${d}`,
      `u_${p} = ${u1} + (${p} − 1) × ${d} = ${up}`,
    ],
    hint: 'Số khoảng cách = số số hạng − 1; tìm d trước rồi mới tính số hạng cần tìm.',
    tags: ['dãy cách đều', 'nhiều bước'],
  };
}

/** SEQ03 — tính tổng dãy số cách đều. */
function SEQ03(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const v = Math.floor(slot / 3);

  if (lvl === 0) {
    if (v % 2 === 0) {
      const n = ri(r, 20, 70);
      const S = (n * (n + 1)) / 2;
      return {
        stem: `Tính tổng S = 1 + 2 + 3 + … + ${n}.`,
        correct: ns(S),
        numeric: S,
        distractors: ndU(S, [n * (n + 1), (n * (n - 1)) / 2, S - n, S + n, n * n]),
        solution: `Dãy 1; 2; 3; …; ${n} là dãy cách đều với khoảng cách 1 và có ${n} số hạng. Tổng = (số đầu + số cuối) × số số hạng : 2 = (1 + ${n}) × ${n} : 2 = ${n + 1} × ${n} : 2 = ${S}. Quên chia 2 sẽ ra ${n * (n + 1)} — gấp đôi kết quả đúng.`,
        steps: [`Số số hạng: ${n}`, `Tổng = (1 + ${n}) × ${n} : 2`, `= ${n * (n + 1)} : 2 = ${S}`],
        hint: 'Ghép số đầu với số cuối thành từng cặp bằng nhau: tổng = (đầu + cuối) × số số hạng : 2.',
        tags: ['tổng dãy cách đều'],
      };
    }
    const m = ri(r, 12, 40);
    const last = 2 * m;
    const S = ((2 + last) * m) / 2;
    return {
      stem: `Tính tổng S = 2 + 4 + 6 + … + ${last}.`,
      correct: ns(S),
      numeric: S,
      distractors: ndU(S, [(2 + last) * m, ((2 + last) * (m - 1)) / 2, S - last, S + last, last * m]),
      solution: `Đây là dãy các số chẵn liên tiếp, khoảng cách 2. Số số hạng = (${last} − 2) : 2 + 1 = ${m}. Tổng = (2 + ${last}) × ${m} : 2 = ${(2 + last) * m} : 2 = ${S}. Hai lỗi thường gặp: quên cộng 1 khi đếm số số hạng (ra ${((2 + last) * (m - 1)) / 2}) và quên chia 2 (ra ${(2 + last) * m}).`,
      steps: [
        `Số số hạng = (${last} − 2) : 2 + 1 = ${m}`,
        `Tổng = (2 + ${last}) × ${m} : 2`,
        `= ${S}`,
      ],
      hint: 'Đếm số số hạng trước bằng công thức (cuối − đầu) : khoảng cách + 1.',
      tags: ['tổng dãy cách đều', 'số chẵn'],
    };
  }

  if (lvl === 1) {
    const u1 = ri(r, 2, 15);
    const d = ri(r, 3, 9);
    const cnt = ri(r, 8, 24);
    const un = u1 + (cnt - 1) * d;
    const S = ((u1 + un) * cnt) / 2;
    return {
      stem: `Tính tổng S = ${u1} + ${u1 + d} + ${u1 + 2 * d} + … + ${un} (các số hạng liên tiếp hơn kém nhau ${d} đơn vị).`,
      correct: ns(S),
      numeric: S,
      distractors: ndU(S, [(u1 + un) * cnt, ((u1 + un) * (cnt - 1)) / 2, ((un - u1) * cnt) / 2, u1 * cnt, S - un]),
      solution: `Bước 1 — đếm số số hạng: (${un} − ${u1}) : ${d} + 1 = ${un - u1} : ${d} + 1 = ${cnt}. Bước 2 — áp dụng công thức tổng: S = (số đầu + số cuối) × số số hạng : 2 = (${u1} + ${un}) × ${cnt} : 2 = ${u1 + un} × ${cnt} : 2 = ${S}. Quên cộng 1 ở bước đếm sẽ ra ${((u1 + un) * (cnt - 1)) / 2}; quên chia 2 sẽ ra ${(u1 + un) * cnt}.`,
      steps: [
        `Số số hạng = (${un} − ${u1}) : ${d} + 1 = ${cnt}`,
        `S = (${u1} + ${un}) × ${cnt} : 2`,
        `= ${S}`,
      ],
      hint: 'Luôn đếm số số hạng trước, sau đó mới nhân với tổng của số đầu và số cuối rồi chia 2.',
      tags: ['tổng dãy cách đều'],
    };
  }

  // lvl 2 — phải tự tìm số hạng đầu và số hạng cuối trước khi tính tổng
  const d = ri(r, 3, 9);
  const A = ri(r, 20, 120);
  const B = A + ri(r, 150, 400);
  if (v % 2 === 0) {
    const list = intsWhere(A, B, (x) => x % d === 0);
    const cnt = list.length;
    const first = list[0];
    const last = list[cnt - 1];
    const S = sum(list);
    return {
      stem: `Tính tổng tất cả các số tự nhiên chia hết cho ${d} nằm trong khoảng từ ${A} đến ${B}.`,
      correct: ns(S),
      numeric: S,
      distractors: ndU(S, [(first + last) * cnt, ((first + last) * (cnt - 1)) / 2, S - last, S + last, cnt]),
      solution: `Số nhỏ nhất trong khoảng chia hết cho ${d} là ${first}, số lớn nhất là ${last}. Các số này lập thành dãy cách đều khoảng cách ${d}. Số số hạng = (${last} − ${first}) : ${d} + 1 = ${cnt}. Tổng = (${first} + ${last}) × ${cnt} : 2 = ${S}. Lưu ý phải tìm ĐÚNG số đầu và số cuối chia hết cho ${d} (không phải ${A} và ${B}), rồi mới áp dụng công thức.`,
      steps: [
        `Số đầu tiên chia hết cho ${d}: ${first}`,
        `Số cuối cùng chia hết cho ${d}: ${last}`,
        `Số số hạng = (${last} − ${first}) : ${d} + 1 = ${cnt}`,
        `Tổng = (${first} + ${last}) × ${cnt} : 2 = ${S}`,
      ],
      hint: 'Tìm số đầu tiên và số cuối cùng thỏa mãn điều kiện, rồi coi chúng là dãy cách đều.',
      tags: ['tổng dãy cách đều', 'nhiều bước'],
    };
  }
  const rem = ri(r, 1, d - 1);
  const list = intsWhere(A, B, (x) => x % d === rem);
  const cnt = list.length;
  const first = list[0];
  const last = list[cnt - 1];
  const S = sum(list);
  return {
    stem: `Tính tổng tất cả các số tự nhiên từ ${A} đến ${B} mà khi chia cho ${d} thì dư ${rem}.`,
    correct: ns(S),
    numeric: S,
    distractors: ndU(S, [(first + last) * cnt, ((first + last) * (cnt - 1)) / 2, S - first, cnt, S + last]),
    solution: `Các số chia cho ${d} dư ${rem} cách nhau đúng ${d} đơn vị. Số nhỏ nhất từ ${A} trở đi thỏa mãn là ${first} (vì ${first} = ${Math.floor(first / d)} × ${d} + ${rem}), số lớn nhất không vượt quá ${B} là ${last}. Số số hạng = (${last} − ${first}) : ${d} + 1 = ${cnt}. Tổng = (${first} + ${last}) × ${cnt} : 2 = ${S}. Quên chia 2 sẽ ra ${(first + last) * cnt}.`,
    steps: [
      `Số đầu tiên chia ${d} dư ${rem}: ${first}`,
      `Số cuối cùng: ${last}`,
      `Số số hạng = (${last} − ${first}) : ${d} + 1 = ${cnt}`,
      `Tổng = (${first} + ${last}) × ${cnt} : 2 = ${S}`,
    ],
    hint: 'Các số cùng số dư khi chia cho d tạo thành dãy cách đều khoảng cách d.',
    tags: ['tổng dãy cách đều', 'phép chia có dư', 'nhiều bước'],
  };
}

/** SEQ04 — đếm số số hạng của một dãy cách đều. */
function SEQ04(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const v = Math.floor(slot / 3);

  if (lvl === 0) {
    const u1 = ri(r, 1, 30);
    const d = ri(r, 2, 9);
    const cnt = ri(r, 10, 40);
    const un = u1 + (cnt - 1) * d;
    return {
      stem: `Dãy số ${u1}; ${u1 + d}; ${u1 + 2 * d}; ${u1 + 3 * d}; …; ${un} có bao nhiêu số hạng?`,
      correct: ns(cnt),
      numeric: cnt,
      distractors: ndU(cnt, [cnt - 1, cnt + 1, Math.floor(un / d), un - u1, cnt - 2]),
      solution: `Khoảng cách của dãy: ${u1 + d} − ${u1} = ${d}. Số số hạng = (số cuối − số đầu) : khoảng cách + 1 = (${un} − ${u1}) : ${d} + 1 = ${un - u1} : ${d} + 1 = ${cnt - 1} + 1 = ${cnt}. Quên cộng 1 sẽ ra ${cnt - 1} — đây chính là số KHOẢNG CÁCH chứ không phải số số hạng.`,
      steps: [
        `Khoảng cách d = ${d}`,
        `(${un} − ${u1}) : ${d} = ${cnt - 1}`,
        `Số số hạng = ${cnt - 1} + 1 = ${cnt}`,
      ],
      hint: 'Số số hạng luôn nhiều hơn số khoảng cách đúng 1 đơn vị.',
      tags: ['đếm số hạng', 'dãy cách đều'],
    };
  }

  if (lvl === 1) {
    const d = ri(r, 3, 9);
    const A = ri(r, 15, 120);
    const B = A + ri(r, 150, 500);
    const list = intsWhere(A, B, (x) => x % d === 0);
    const cnt = list.length;
    const first = list[0];
    const last = list[cnt - 1];
    return {
      stem: `Có bao nhiêu số tự nhiên chia hết cho ${d} trong các số từ ${A} đến ${B}?`,
      correct: ns(cnt),
      numeric: cnt,
      distractors: ndU(cnt, [cnt - 1, cnt + 1, Math.floor((B - A) / d), Math.floor(B / d), cnt + 2]),
      solution: `Số nhỏ nhất không nhỏ hơn ${A} và chia hết cho ${d} là ${first}; số lớn nhất không vượt quá ${B} và chia hết cho ${d} là ${last}. Các số này cách đều nhau ${d} đơn vị nên số lượng = (${last} − ${first}) : ${d} + 1 = ${(last - first) / d} + 1 = ${cnt}. Lấy thẳng (${B} − ${A}) : ${d} = ${Math.floor((B - A) / d)} là sai vì hai đầu mút chưa chắc chia hết cho ${d}.`,
      steps: [
        `Số đầu tiên chia hết cho ${d}: ${first}`,
        `Số cuối cùng chia hết cho ${d}: ${last}`,
        `Số lượng = (${last} − ${first}) : ${d} + 1 = ${cnt}`,
      ],
      hint: 'Xác định bội đầu tiên và bội cuối cùng nằm trong khoảng, rồi mới đếm.',
      tags: ['đếm số hạng', 'bội số'],
    };
  }

  // lvl 2 — đếm theo số dư, hoặc đếm số hạng của dãy cho bởi hai đầu mút lẻ
  const d = ri(r, 3, 9);
  const rem = ri(r, 1, d - 1);
  const A = ri(r, 20, 150);
  const B = A + ri(r, 200, 600);
  if (v % 2 === 0) {
    const list = intsWhere(A, B, (x) => x % d === rem);
    const cnt = list.length;
    const first = list[0];
    const last = list[cnt - 1];
    const divisible = intsWhere(A, B, (x) => x % d === 0).length;
    return {
      stem: `Có bao nhiêu số tự nhiên từ ${A} đến ${B} mà khi chia cho ${d} thì dư ${rem}?`,
      correct: ns(cnt),
      numeric: cnt,
      distractors: ndU(cnt, [cnt - 1, cnt + 1, divisible === cnt ? cnt + 2 : divisible, Math.floor((B - A) / d), cnt - 2]),
      solution: `Các số chia cho ${d} dư ${rem} có dạng ${d}k + ${rem}, hai số liên tiếp cách nhau ${d} đơn vị. Số nhỏ nhất trong khoảng là ${first}, số lớn nhất là ${last}. Số lượng = (${last} − ${first}) : ${d} + 1 = ${(last - first) / d} + 1 = ${cnt}. Nhớ kiểm tra kỹ hai đầu mút: ${A} chia ${d} dư ${A % d} và ${B} chia ${d} dư ${B % d}, nên số đầu và số cuối của dãy phải chọn lại như trên.`,
      steps: [
        `Số chia ${d} dư ${rem} có dạng ${d}k + ${rem}`,
        `Số nhỏ nhất ≥ ${A}: ${first}; số lớn nhất ≤ ${B}: ${last}`,
        `Số lượng = (${last} − ${first}) : ${d} + 1 = ${cnt}`,
      ],
      hint: 'Các số cùng số dư tạo thành dãy cách đều khoảng cách d — vẫn dùng công thức đếm cũ.',
      tags: ['đếm số hạng', 'phép chia có dư', 'nhiều bước'],
    };
  }
  const step = ri(r, 4, 12);
  const u1 = ri(r, 3, 40);
  const cnt = ri(r, 25, 90);
  const un = u1 + (cnt - 1) * step;
  const half = Math.floor(cnt / 2);
  const mid = u1 + (half - 1) * step;
  return {
    stem: `Cho dãy số ${u1}; ${u1 + step}; ${u1 + 2 * step}; …; ${un}. Hỏi dãy đó có bao nhiêu số hạng và số hạng thứ ${half} bằng bao nhiêu? (Trả lời theo dạng "số số hạng; số hạng thứ ${half}".)`,
    correct: `${cnt}; ${mid}`,
    distractors: td(`${cnt}; ${mid}`, [
      `${cnt - 1}; ${mid}`,
      `${cnt}; ${u1 + half * step}`,
      `${cnt + 1}; ${mid}`,
      `${cnt - 1}; ${u1 + half * step}`,
    ]),
    solution: `Khoảng cách của dãy là ${step}. Số số hạng = (${un} − ${u1}) : ${step} + 1 = ${un - u1} : ${step} + 1 = ${cnt - 1} + 1 = ${cnt}. Số hạng thứ ${half} = ${u1} + (${half} − 1) × ${step} = ${u1} + ${(half - 1) * step} = ${mid}. Hai chỗ dễ sai nằm cạnh nhau: khi ĐẾM thì cộng thêm 1, nhưng khi tính số hạng thứ n thì TRỪ đi 1 trong công thức u₁ + (n − 1)d.`,
    steps: [
      `Khoảng cách d = ${step}`,
      `Số số hạng = (${un} − ${u1}) : ${step} + 1 = ${cnt}`,
      `Số hạng thứ ${half} = ${u1} + (${half} − 1) × ${step} = ${mid}`,
    ],
    hint: 'Đếm số hạng thì "+1", còn tính số hạng thứ n thì "(n − 1) × d".',
    tags: ['đếm số hạng', 'dãy cách đều', 'nhiều bước'],
  };
}

// ===========================================================================
// REGISTRY — đúng 15 bộ sinh của nhóm đại số
// ===========================================================================

export const ALGEBRA_GENERATORS: Record<string, Gen> = {
  EXPR01,
  EXPR02,
  EXPR03,
  EXPR04,
  EQ01,
  EQ02,
  EQ03,
  EQ04,
  INEQ01,
  INEQ02,
  INEQ03,
  SEQ01,
  SEQ02,
  SEQ03,
  SEQ04,
};
