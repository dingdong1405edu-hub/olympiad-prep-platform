/**
 * BỘ SINH DÙNG CHUNG CHO KHOA HỌC TỰ NHIÊN, VẬT LÝ, HÓA HỌC, SINH HỌC, TIN HỌC
 * VÀ CÁC MẢNG TOÁN NÂNG CAO (khối 3–5, 6–7, 8–9, 10–12).
 *
 * Khác với `generators.ts` (mỗi bộ sinh phục vụ đúng một kỹ năng), bộ sinh ở đây
 * được TÁI SỬ DỤNG cho nhiều môn và nhiều khối; chúng phân biệt nhau bằng
 * `ctx.params` do taxonomy truyền vào (mode / family / dir / lvl / scale).
 *
 * Ba quy tắc bất di bất dịch, giống hệt file gốc:
 *  1. Đáp án và lời giải luôn được TÍNH RA từ tham số vừa sinh — không viết tay.
 *  2. Số liệu được chọn NGƯỢC từ đáp án đẹp ⇒ không bao giờ ra số lẻ xấu.
 *  3. Nhiễu là LỖI SAI CÓ THẬT (sai đơn vị, quên chia đôi, đảo ngược công thức,
 *     cộng gộp tỉ lệ, quên trừ bộ ba mở đầu / kết thúc...).
 *
 * File này KHÔNG import gì từ `src/` (tsx không đọc `paths` của tsconfig).
 */
import type { Draft, Gen, GenCtx } from './generators';
import {
  fAdd,
  fMul,
  fStr,
  fSub,
  fmt,
  frac,
  gcd,
  nd,
  pick,
  pnum,
  pstr,
  ri,
  roundDec,
  sc,
  shuffle,
  td,
} from './generators';

type Frac = ReturnType<typeof frac>;

// ===========================================================================
// TIỆN ÍCH RIÊNG CỦA NHÓM KHOA HỌC
// ===========================================================================

/** Ghép giá trị với đơn vị — đáp án Lý/Hóa bắt buộc phải mang đơn vị. */
function uv(v: number, unit: string): string {
  return `${fmt(v)} ${unit}`;
}

/**
 * Lọc nhiễu dạng "số + đơn vị". `pad` = [giá trị đúng, đơn vị] dùng để đệm thêm
 * khi các ứng viên trùng nhau, bảo đảm bộ khung luôn có đủ 3 nhiễu khác nhau.
 */
function ud(correct: string, cands: [number, string][], pad?: [number, string]): string[] {
  const out = td(
    correct,
    cands.filter(([v]) => Number.isFinite(v)).map(([v, unit]) => uv(roundDec(v, 4), unit)),
  );
  if (!pad) return out;
  for (const k of [10, 0.1, 100, 2, 0.5, 1000]) {
    if (out.length >= 3) break;
    const t = uv(roundDec(pad[0] * k, 4), pad[1]);
    if (t !== correct && !out.includes(t)) out.push(t);
  }
  return out;
}

const SUB_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
/** Chỉ số dưới: 2 → "₂" (viết công thức hóa học và cơ số logarit). */
function sub(n: number): string {
  return String(n)
    .split('')
    .map((c) => SUB_DIGITS[Number(c)])
    .join('');
}

/** Ghép đa thức từ danh sách [hệ số, phần biến]; bỏ hạng tử có hệ số 0. */
function polyStr(terms: [number, string][]): string {
  let out = '';
  for (const [c, v] of terms) {
    if (c === 0) continue;
    const a = Math.abs(c);
    const body = v === '' ? fmt(a) : `${a === 1 ? '' : fmt(a)}${v}`;
    if (out === '') out = c < 0 ? `−${body}` : body;
    else out += c < 0 ? ` − ${body}` : ` + ${body}`;
  }
  return out === '' ? '0' : out;
}

/** "ax" với a = 1 thì bỏ hệ số. */
function axStr(a: number): string {
  return a === 1 ? 'x' : `${a}x`;
}

/** Căn thức dạng k√m đã rút gọn. */
function radStr(k: number, m: number): string {
  if (m === 1) return String(k);
  if (k === 1) return `√${m}`;
  return `${k}√${m}`;
}

/** Đổi dấu một biểu thức dạng chuỗi: "√3/2" ↔ "−√3/2". */
function negText(t: string): string {
  if (t === '0') return '0';
  return t.startsWith('−') ? t.slice(1) : `−${t}`;
}

/** Bộ ba Pythagore nguyên thủy — dùng cho cả hình học lẫn lượng giác. */
const TRIPLES: [number, number, number][] = [
  [3, 4, 5],
  [5, 12, 13],
  [8, 15, 17],
  [7, 24, 25],
  [20, 21, 29],
  [9, 40, 41],
  [12, 35, 37],
];

// ===========================================================================
// PHẦN 1 — TOÁN NÂNG CAO
// ===========================================================================

/** Bốn phép tính với số tự nhiên. `params.max` quy định thang số của khối lớp. */
function gArith(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const max = Math.max(60, Math.round(pnum(ctx, 'max', 1000) * sc(ctx)));

  if (lvl === 0) {
    const op = ['+', '−', '×', ':'][slot % 4];
    if (op === '+') {
      const a = ri(r, Math.floor(max / 4), max);
      const b = ri(r, Math.floor(max / 5), max);
      const val = a + b;
      return {
        stem: `Tính: ${a} + ${b}.`,
        correct: fmt(val),
        numeric: val,
        distractors: nd(val, [val - 10, val + 10, Math.abs(a - b), val - 1, val + 100]),
        solution: `Đặt tính thẳng cột rồi cộng từ hàng đơn vị: ${a} + ${b} = ${val}. Lỗi hay gặp là quên số nhớ khi tổng hai chữ số vượt quá 9, khi đó kết quả thiếu 10 đơn vị (ra ${val - 10}).`,
        steps: [`Đặt tính thẳng cột đơn vị`, `${a} + ${b} = ${val}`],
        hint: 'Cộng từ phải sang trái, tổng hai chữ số ≥ 10 thì nhớ 1 sang hàng liền trước.',
        tags: ['số tự nhiên', 'phép cộng'],
      };
    }
    if (op === '−') {
      const b = ri(r, Math.floor(max / 6), Math.floor(max / 2));
      const a = b + ri(r, Math.floor(max / 6), Math.floor(max / 2));
      const val = a - b;
      return {
        stem: `Tính: ${a} − ${b}.`,
        correct: fmt(val),
        numeric: val,
        distractors: nd(val, [a + b, val + 10, val - 10, val + 1, b - a]),
        solution: `Đặt tính rồi trừ từ hàng đơn vị: ${a} − ${b} = ${val}. Khi chữ số bị trừ nhỏ hơn chữ số trừ thì phải mượn 1 ở hàng trước; quên trả lại chỗ đã mượn sẽ ra ${val + 10}.`,
        steps: [`Đặt tính thẳng cột đơn vị`, `${a} − ${b} = ${val}`],
        hint: 'Trừ có nhớ: mượn 1 ở hàng trước thì hàng đó bị giảm đi 1 đơn vị.',
        tags: ['số tự nhiên', 'phép trừ'],
      };
    }
    if (op === '×') {
      const a = ri(r, 3, 9);
      const b = ri(r, 11, Math.max(24, Math.floor(max / 3)));
      const val = a * b;
      return {
        stem: `Tính: ${a} × ${b}.`,
        correct: fmt(val),
        numeric: val,
        distractors: nd(val, [a + b, val - a, val + b, val + 10, a * (b + 1)]),
        solution: `Nhân ${b} với ${a}: ${a} × ${b} = ${val}. Có thể tách cho dễ nhẩm: ${a} × ${b} = ${a} × ${Math.floor(b / 10) * 10} + ${a} × ${b % 10} = ${a * Math.floor(b / 10) * 10} + ${a * (b % 10)} = ${val}.`,
        steps: [
          `Tách ${b} = ${Math.floor(b / 10) * 10} + ${b % 10}`,
          `${a} × ${Math.floor(b / 10) * 10} = ${a * Math.floor(b / 10) * 10}`,
          `${a} × ${b % 10} = ${a * (b % 10)}`,
          `Cộng lại: ${val}`,
        ],
        hint: 'Tách thừa số thành hàng chục và hàng đơn vị rồi nhân từng phần.',
        tags: ['số tự nhiên', 'phép nhân'],
      };
    }
    const b = ri(r, 3, 9);
    const q = ri(r, 6, Math.max(12, Math.floor(max / b)));
    const a = b * q;
    return {
      stem: `Tính: ${a} : ${b}.`,
      correct: fmt(q),
      numeric: q,
      distractors: nd(q, [q + 1, q - 1, a - b, q * 10, a * b]),
      solution: `Chia ${a} cho ${b}: vì ${b} × ${q} = ${a} nên ${a} : ${b} = ${q}. Phép chia này hết (số dư bằng 0).`,
      steps: [`Thử: ${b} × ${q} = ${a}`, `Vậy ${a} : ${b} = ${q}`],
      hint: 'Phép chia là phép ngược của phép nhân: tìm số nhân với số chia ra số bị chia.',
      tags: ['số tự nhiên', 'phép chia'],
    };
  }

  if (lvl === 1) {
    const form = slot % 3;
    if (form === 0) {
      const a = ri(r, 10, max);
      const b = ri(r, 3, 12);
      const c = ri(r, 3, 12);
      const val = a + b * c;
      return {
        stem: `Tính: ${a} + ${b} × ${c}.`,
        correct: fmt(val),
        numeric: val,
        distractors: nd(val, [(a + b) * c, a + b + c, a * b + c, val - b, val + c]),
        solution: `Trong biểu thức không có ngoặc, phải nhân trước rồi mới cộng: ${b} × ${c} = ${b * c}, sau đó ${a} + ${b * c} = ${val}. Nếu cộng trước sẽ thành (${a} + ${b}) × ${c} = ${(a + b) * c} — sai thứ tự phép tính.`,
        steps: [`${b} × ${c} = ${b * c}`, `${a} + ${b * c} = ${val}`],
        hint: 'Không có ngoặc thì nhân chia trước, cộng trừ sau.',
        tags: ['thứ tự phép tính'],
      };
    }
    if (form === 1) {
      const d = ri(r, 2, 9);
      const q = ri(r, 3, 20);
      const c = d * q;
      const a = ri(r, 3, 12);
      const b = ri(r, 5, Math.max(12, Math.floor(max / 12)));
      const val = a * b - q;
      return {
        stem: `Tính: ${a} × ${b} − ${c} : ${d}.`,
        correct: fmt(val),
        numeric: val,
        distractors: nd(val, [a * b - c, a * b + q, a + b - q, a * b - d, (a * b - c) / d]),
        solution: `Nhân và chia làm trước, từ trái sang phải: ${a} × ${b} = ${a * b} và ${c} : ${d} = ${q}. Sau đó trừ: ${a * b} − ${q} = ${val}. Bẫy hay gặp là lấy ${a * b} − ${c} rồi mới chia cho ${d}.`,
        steps: [`${a} × ${b} = ${a * b}`, `${c} : ${d} = ${q}`, `${a * b} − ${q} = ${val}`],
        hint: 'Phép chia chỉ tác dụng lên số đứng ngay trước nó, không tác dụng lên cả biểu thức.',
        tags: ['thứ tự phép tính'],
      };
    }
    const a = ri(r, 12, Math.max(30, Math.floor(max / 4)));
    const b = ri(r, 8, Math.max(20, Math.floor(max / 5)));
    const c = ri(r, 3, 9);
    const val = (a + b) * c;
    return {
      stem: `Tính: (${a} + ${b}) × ${c}.`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [a + b * c, a * c + b, a + b + c, val + c, val - c]),
      solution: `Có ngoặc thì tính trong ngoặc trước: ${a} + ${b} = ${a + b}. Sau đó nhân: ${a + b} × ${c} = ${val}. Nếu bỏ quên ngoặc sẽ ra ${a + b * c}.`,
      steps: [`Trong ngoặc: ${a} + ${b} = ${a + b}`, `${a + b} × ${c} = ${val}`],
      hint: 'Biểu thức có ngoặc thì luôn tính trong ngoặc trước tiên.',
      tags: ['thứ tự phép tính', 'dấu ngoặc'],
    };
  }

  // lvl 2 — tìm số chưa biết: phải suy luận ngược từ kết quả về dữ kiện
  if (slot % 2 === 0) {
    const a = ri(r, 5, 40);
    const b = ri(r, 3, 9);
    const x = ri(r, 5, Math.max(20, Math.floor(max / 4)));
    const p = (x + a) * b;
    return {
      stem: `Tìm số tự nhiên x, biết (x + ${a}) × ${b} = ${p}.`,
      correct: fmt(x),
      numeric: x,
      distractors: nd(x, [p / b, p / b + a, p - a, p - a * b, x + 1]),
      solution: `Coi (x + ${a}) là một thừa số chưa biết: x + ${a} = ${p} : ${b} = ${x + a}. Từ đó x = ${x + a} − ${a} = ${x}. Lỗi hay gặp là dừng lại ở bước chia và trả lời ${p / b}, tức là quên trừ đi ${a}.`,
      steps: [`x + ${a} = ${p} : ${b} = ${x + a}`, `x = ${x + a} − ${a} = ${x}`],
      hint: 'Gỡ ngược từng phép tính: phép nhân gỡ bằng phép chia, phép cộng gỡ bằng phép trừ.',
      tags: ['tìm x', 'suy luận ngược'],
    };
  }
  const a = ri(r, 3, 9);
  const k = ri(r, 4, Math.max(12, Math.floor(max / 20)));
  const b = ri(r, 3, 30);
  const x = a * k;
  const c = k + b;
  return {
    stem: `Tìm số tự nhiên x, biết x : ${a} + ${b} = ${c}.`,
    correct: fmt(x),
    numeric: x,
    distractors: nd(x, [(c + b) * a, c * a - b, c - b, c * a, x + a]),
    solution: `Trừ hai vế cho ${b}: x : ${a} = ${c} − ${b} = ${k}. Nhân hai vế với ${a}: x = ${k} × ${a} = ${x}. Bẫy ở đây là nhân ${c} với ${a} ngay từ đầu (ra ${c * a}) mà quên trừ ${b} trước.`,
    steps: [`x : ${a} = ${c} − ${b} = ${k}`, `x = ${k} × ${a} = ${x}`],
    hint: 'Gỡ phép cộng ngoài cùng trước, sau đó mới gỡ phép chia.',
    tags: ['tìm x', 'suy luận ngược'],
  };
}

// ---------------------------------------------------------------------------
// Đổi đơn vị đo — dùng chung cho Toán tiểu học, Khoa học và Tin học
// ---------------------------------------------------------------------------

interface UnitStep {
  name: string;
  f: number;
}

const UNIT_FAMILIES: Record<string, { label: string; units: UnitStep[]; note: string }> = {
  len: {
    label: 'độ dài',
    units: [
      { name: 'mm', f: 1 },
      { name: 'cm', f: 10 },
      { name: 'dm', f: 100 },
      { name: 'm', f: 1000 },
      { name: 'km', f: 1000000 },
    ],
    note: '1 cm = 10 mm; 1 dm = 10 cm; 1 m = 10 dm; 1 km = 1000 m',
  },
  mass: {
    label: 'khối lượng',
    units: [
      { name: 'g', f: 1 },
      { name: 'kg', f: 1000 },
      { name: 'tạ', f: 100000 },
      { name: 'tấn', f: 1000000 },
    ],
    note: '1 kg = 1000 g; 1 tạ = 100 kg; 1 tấn = 10 tạ',
  },
  time: {
    label: 'thời gian',
    units: [
      { name: 'giây', f: 1 },
      { name: 'phút', f: 60 },
      { name: 'giờ', f: 3600 },
      { name: 'ngày', f: 86400 },
    ],
    note: '1 phút = 60 giây; 1 giờ = 60 phút; 1 ngày = 24 giờ',
  },
  area: {
    label: 'diện tích',
    units: [
      { name: 'cm²', f: 1 },
      { name: 'dm²', f: 100 },
      { name: 'm²', f: 10000 },
      { name: 'ha', f: 100000000 },
    ],
    note: '1 dm² = 100 cm²; 1 m² = 100 dm²; 1 ha = 10 000 m²',
  },
  volume: {
    label: 'thể tích',
    units: [
      { name: 'cm³', f: 1 },
      { name: 'dm³', f: 1000 },
      { name: 'm³', f: 1000000 },
    ],
    note: '1 dm³ = 1000 cm³; 1 m³ = 1000 dm³; ngoài ra 1 dm³ = 1 lít',
  },
  capacity: {
    label: 'dung tích',
    units: [
      { name: 'ml', f: 1 },
      { name: 'l', f: 1000 },
      { name: 'm³', f: 1000000 },
    ],
    note: '1 l = 1000 ml; 1 m³ = 1000 l',
  },
  data: {
    label: 'dung lượng dữ liệu',
    units: [
      { name: 'byte', f: 1 },
      { name: 'KB', f: 1024 },
      { name: 'MB', f: 1048576 },
      { name: 'GB', f: 1073741824 },
      { name: 'TB', f: 1099511627776 },
    ],
    note: '1 KB = 1024 byte; 1 MB = 1024 KB; 1 GB = 1024 MB; 1 TB = 1024 GB',
  },
};

/** Đổi đơn vị đo. `params.family` chọn bảng đơn vị, `params.lvl` chọn nhánh khối lớp. */
function gUnitConv(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const raw = pstr(ctx, 'family', 'len');
  const key = raw === 'vol' ? 'volume' : raw === 'cap' ? 'capacity' : raw;
  const fam = UNIT_FAMILIES[key] ?? UNIT_FAMILIES.len;
  const glvl = pnum(ctx, 'lvl', 1);
  // Tin học: khối nhỏ học byte–KB–MB, khối lớn học MB–GB–TB
  const units = key === 'data' ? (glvl >= 2 ? fam.units.slice(2) : fam.units.slice(0, 3)) : fam.units;

  const gap = lvl === 1 ? Math.min(2, units.length - 1) : 1;
  const hi = ri(r, gap, units.length - 1);
  const big = units[hi];
  const small = units[hi - gap];
  const ratio = big.f / small.f;

  if (lvl === 0) {
    const v = ri(r, 2, 60);
    const val = v * ratio;
    return {
      stem: `Đổi đơn vị đo ${fam.label}: ${v} ${big.name} = ? ${small.name}`,
      correct: uv(val, small.name),
      numeric: val,
      distractors: ud(
        uv(val, small.name),
        [
          [val * 10, small.name],
          [v * 10, small.name],
          [val / 10, small.name],
          [v + ratio, small.name],
          [v * 100, small.name],
        ],
        [val, small.name],
      ),
      solution: `1 ${big.name} = ${fmt(ratio)} ${small.name}, mà đổi từ đơn vị LỚN sang đơn vị NHỎ thì phải NHÂN. Do đó ${v} ${big.name} = ${v} × ${fmt(ratio)} = ${fmt(val)} ${small.name}. Ghi nhớ: ${fam.note}.`,
      steps: [`1 ${big.name} = ${fmt(ratio)} ${small.name}`, `${v} × ${fmt(ratio)} = ${fmt(val)} ${small.name}`],
      hint: 'Đổi từ đơn vị lớn sang đơn vị nhỏ thì nhân, ngược lại thì chia.',
      tags: ['đổi đơn vị', fam.label],
    };
  }

  if (lvl === 1) {
    if (slot % 2 === 0) {
      const v = ri(r, 2, 40);
      const val = v * ratio;
      return {
        stem: `Đổi đơn vị đo ${fam.label} (cách nhau hai bậc): ${v} ${big.name} = ? ${small.name}`,
        correct: uv(val, small.name),
        numeric: val,
        distractors: ud(
          uv(val, small.name),
          [
            [(v * ratio) / Math.sqrt(ratio), small.name],
            [val * 10, small.name],
            [val / 10, small.name],
            [v * 100, small.name],
            [v + ratio, small.name],
          ],
          [val, small.name],
        ),
        solution: `Từ ${big.name} xuống ${small.name} phải đi qua hai bậc: 1 ${big.name} = ${fmt(ratio)} ${small.name}. Vậy ${v} ${big.name} = ${v} × ${fmt(ratio)} = ${fmt(val)} ${small.name}. Lỗi phổ biến là chỉ nhân một bậc (ra ${fmt((v * ratio) / Math.sqrt(ratio))} ${small.name}). Ghi nhớ: ${fam.note}.`,
        steps: [
          `Đếm số bậc từ ${big.name} xuống ${small.name}: 2 bậc`,
          `1 ${big.name} = ${fmt(ratio)} ${small.name}`,
          `${v} × ${fmt(ratio)} = ${fmt(val)} ${small.name}`,
        ],
        hint: 'Cách nhau hai bậc thì hệ số đổi bằng tích của hai hệ số liền kề.',
        tags: ['đổi đơn vị', fam.label],
      };
    }
    const m = ri(r, 2, 40);
    const v = m * ratio;
    return {
      stem: `Đổi đơn vị đo ${fam.label}: ${fmt(v)} ${small.name} = ? ${big.name}`,
      correct: uv(m, big.name),
      numeric: m,
      distractors: ud(
        uv(m, big.name),
        [
          [v * ratio, big.name],
          [m * 10, big.name],
          [m / 10, big.name],
          [v / 10, big.name],
          [v - ratio, big.name],
        ],
        [m, big.name],
      ),
      solution: `Đổi từ đơn vị NHỎ lên đơn vị LỚN thì phải CHIA cho hệ số. Ở đây 1 ${big.name} = ${fmt(ratio)} ${small.name}, nên ${fmt(v)} ${small.name} = ${fmt(v)} : ${fmt(ratio)} = ${fmt(m)} ${big.name}. Nhân nhầm sẽ ra con số lớn vô lí là ${fmt(v * ratio)}. Ghi nhớ: ${fam.note}.`,
      steps: [`1 ${big.name} = ${fmt(ratio)} ${small.name}`, `${fmt(v)} : ${fmt(ratio)} = ${fmt(m)} ${big.name}`],
      hint: 'Đơn vị nhỏ đổi lên đơn vị lớn thì số đo phải giảm đi, tức là chia.',
      tags: ['đổi đơn vị', fam.label],
    };
  }

  // lvl 2 — bài hợp: có hai đơn vị trong cùng một dữ kiện
  const a = ri(r, 2, 12);
  const b = ri(r, 1, Math.max(2, Math.min(ratio - 1, 900)));
  if (slot % 2 === 0) {
    const val = a * ratio + b;
    return {
      stem: `Đổi và tính: ${a} ${big.name} ${fmt(b)} ${small.name} bằng bao nhiêu ${small.name}?`,
      correct: uv(val, small.name),
      numeric: val,
      distractors: ud(
        uv(val, small.name),
        [
          [a + b, small.name],
          [a * ratio, small.name],
          [(a + b) * ratio, small.name],
          [a * ratio + b * ratio, small.name],
          [a * ratio - b, small.name],
        ],
        [val, small.name],
      ),
      solution: `Đưa cả hai phần về ${small.name} rồi cộng: ${a} ${big.name} = ${a} × ${fmt(ratio)} = ${fmt(a * ratio)} ${small.name}; cộng thêm ${fmt(b)} ${small.name} được ${fmt(a * ratio)} + ${fmt(b)} = ${fmt(val)} ${small.name}. Cộng thẳng ${a} + ${fmt(b)} = ${fmt(a + b)} là sai vì hai số đang ở hai đơn vị khác nhau.`,
      steps: [
        `${a} ${big.name} = ${fmt(a * ratio)} ${small.name}`,
        `${fmt(a * ratio)} + ${fmt(b)} = ${fmt(val)} ${small.name}`,
      ],
      hint: 'Chỉ được cộng hai số đo khi chúng đã cùng một đơn vị.',
      tags: ['đổi đơn vị', fam.label, 'nhiều bước'],
    };
  }
  const val = a * ratio - b;
  return {
    stem: `Một vật có số đo ${a} ${big.name}, người ta lấy bớt đi ${fmt(b)} ${small.name}. Phần còn lại bằng bao nhiêu ${small.name}?`,
    correct: uv(val, small.name),
    numeric: val,
    distractors: ud(
      uv(val, small.name),
      [
        [a - b, small.name],
        [a * ratio, small.name],
        [(a - b) * ratio, small.name],
        [a * ratio + b, small.name],
        [b - a * ratio, small.name],
      ],
      [val, small.name],
    ),
    solution: `Đổi số đo ban đầu về ${small.name}: ${a} ${big.name} = ${a} × ${fmt(ratio)} = ${fmt(a * ratio)} ${small.name}. Phần còn lại: ${fmt(a * ratio)} − ${fmt(b)} = ${fmt(val)} ${small.name}. Trừ thẳng ${a} − ${fmt(b)} là sai vì chưa quy về cùng đơn vị.`,
    steps: [
      `${a} ${big.name} = ${fmt(a * ratio)} ${small.name}`,
      `${fmt(a * ratio)} − ${fmt(b)} = ${fmt(val)} ${small.name}`,
    ],
    hint: 'Quy về cùng đơn vị trước, chỉ khi đó mới được thực hiện phép trừ.',
    tags: ['đổi đơn vị', fam.label, 'nhiều bước'],
  };
}

// ---------------------------------------------------------------------------
// Hằng đẳng thức
// ---------------------------------------------------------------------------

/** `mode='sq'`: bình phương một tổng/hiệu. `mode='diff'`: hiệu hai bình phương. */
function gPolyExpand(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const mode = pstr(ctx, 'mode', 'sq');

  if (mode === 'diff') {
    if (lvl === 0) {
      const b = ri(r, 2, 12);
      const val = polyStr([
        [1, 'x²'],
        [-b * b, ''],
      ]);
      return {
        stem: `Khai triển: (x − ${b})(x + ${b}).`,
        correct: val,
        distractors: td(val, [
          polyStr([
            [1, 'x²'],
            [b * b, ''],
          ]),
          polyStr([
            [1, 'x²'],
            [-2 * b, 'x'],
            [-b * b, ''],
          ]),
          polyStr([
            [1, 'x²'],
            [-b, ''],
          ]),
          polyStr([
            [1, 'x²'],
            [2 * b, 'x'],
            [b * b, ''],
          ]),
        ]),
        solution: `Áp dụng hằng đẳng thức (A − B)(A + B) = A² − B² với A = x, B = ${b}: (x − ${b})(x + ${b}) = x² − ${b}² = ${val}. Hai hạng tử chứa x triệt tiêu nhau (−${b}x + ${b}x = 0) nên kết quả KHÔNG còn hạng tử bậc nhất.`,
        steps: [`Nhận dạng A = x, B = ${b}`, `A² − B² = x² − ${b * b}`, `Kết quả: ${val}`],
        hint: 'Tích của một tổng và một hiệu cùng cặp số bằng hiệu hai bình phương.',
        tags: ['hằng đẳng thức', 'hiệu hai bình phương'],
      };
    }
    if (lvl === 1) {
      const a = ri(r, 2, 6);
      const b = ri(r, 2, 11);
      const val = polyStr([
        [a * a, 'x²'],
        [-b * b, ''],
      ]);
      return {
        stem: `Khai triển: (${a}x − ${b})(${a}x + ${b}).`,
        correct: val,
        distractors: td(val, [
          polyStr([
            [a, 'x²'],
            [-b, ''],
          ]),
          polyStr([
            [a * a, 'x²'],
            [b * b, ''],
          ]),
          polyStr([
            [a * a, 'x²'],
            [-2 * a * b, 'x'],
            [-b * b, ''],
          ]),
          polyStr([
            [2 * a, 'x²'],
            [-2 * b, ''],
          ]),
        ]),
        solution: `Với A = ${a}x và B = ${b}: (A − B)(A + B) = A² − B² = (${a}x)² − ${b}² = ${a * a}x² − ${b * b} = ${val}. Chú ý (${a}x)² = ${a * a}x² chứ không phải ${a}x².`,
        steps: [`A = ${a}x, B = ${b}`, `A² = ${a * a}x², B² = ${b * b}`, `A² − B² = ${val}`],
        hint: 'Bình phương cả hệ số lẫn phần biến: (ax)² = a²x².',
        tags: ['hằng đẳng thức', 'hiệu hai bình phương'],
      };
    }
    if (slot % 2 === 0) {
      const base = pick(r, [30, 40, 50, 60, 70, 80, 90, 100, 200]);
      const k = ri(r, 1, 9);
      const val = base * base - k * k;
      return {
        stem: `Tính nhanh: ${base + k} × ${base - k}.`,
        correct: fmt(val),
        numeric: val,
        distractors: nd(val, [base * base, base * base + k * k, base * base - k, base * base - 2 * k, val + 10]),
        solution: `Viết hai thừa số về dạng tổng và hiệu quanh ${base}: ${base + k} × ${base - k} = (${base} + ${k})(${base} − ${k}) = ${base}² − ${k}² = ${base * base} − ${k * k} = ${val}. Quên trừ ${k * k} sẽ ra ${base * base}.`,
        steps: [
          `${base + k} = ${base} + ${k}; ${base - k} = ${base} − ${k}`,
          `Áp dụng A² − B²: ${base * base} − ${k * k}`,
          `Kết quả: ${val}`,
        ],
        hint: 'Hai số cách đều một số tròn chục/tròn trăm thì dùng ngay hiệu hai bình phương.',
        tags: ['hằng đẳng thức', 'tính nhanh'],
      };
    }
    const a = ri(r, 2, 7);
    const b = ri(r, 2, 12);
    const val = `(${axStr(a)} − ${b})(${axStr(a)} + ${b})`;
    return {
      stem: `Phân tích thành nhân tử: ${polyStr([
        [a * a, 'x²'],
        [-b * b, ''],
      ])}.`,
      correct: val,
      distractors: td(val, [
        `(${axStr(a)} − ${b})²`,
        `(${axStr(a)} + ${b})²`,
        `(${axStr(a * a)} − ${b * b})(${axStr(a * a)} + ${b * b})`,
        `${axStr(a)}(${axStr(a)} − ${b * b})`,
      ]),
      solution: `Nhận ra ${a * a}x² = (${a}x)² và ${b * b} = ${b}². Áp dụng A² − B² = (A − B)(A + B) với A = ${a}x, B = ${b} ta được ${val}. Sai lầm thường gặp là viết thành (${a}x − ${b})² — đó là bình phương của một hiệu, khai triển ra còn hạng tử −${2 * a * b}x.`,
      steps: [`${a * a}x² = (${a}x)²`, `${b * b} = ${b}²`, `A² − B² = ${val}`],
      hint: 'Đưa từng hạng tử về dạng bình phương rồi mới áp dụng công thức.',
      tags: ['hằng đẳng thức', 'phân tích nhân tử'],
    };
  }

  // mode 'sq'
  if (lvl === 0) {
    const b = ri(r, 3, 9);
    const s = slot % 2 === 0 ? 1 : -1;
    const val = polyStr([
      [1, 'x²'],
      [s * 2 * b, 'x'],
      [b * b, ''],
    ]);
    return {
      stem: `Khai triển: (x ${s > 0 ? '+' : '−'} ${b})².`,
      correct: val,
      distractors: td(val, [
        polyStr([
          [1, 'x²'],
          [b * b, ''],
        ]),
        polyStr([
          [1, 'x²'],
          [s * b, 'x'],
          [b * b, ''],
        ]),
        polyStr([
          [1, 'x²'],
          [-s * 2 * b, 'x'],
          [b * b, ''],
        ]),
        polyStr([
          [1, 'x²'],
          [s * 2 * b, 'x'],
          [2 * b, ''],
        ]),
      ]),
      solution: `Dùng (A ${s > 0 ? '+' : '−'} B)² = A² ${s > 0 ? '+' : '−'} 2AB + B² với A = x, B = ${b}: A² = x², 2AB = 2 × x × ${b} = ${2 * b}x, B² = ${b * b}. Vậy kết quả là ${val}. Lỗi kinh điển là viết (x ${s > 0 ? '+' : '−'} ${b})² = x² + ${b * b}, tức bỏ mất hạng tử ${2 * b}x.`,
      steps: [`A = x, B = ${b}`, `2AB = ${2 * b}x`, `B² = ${b * b}`, `Kết quả: ${val}`],
      hint: 'Bình phương của một tổng luôn có ba hạng tử, đừng bỏ quên 2AB.',
      tags: ['hằng đẳng thức', 'bình phương một tổng'],
    };
  }
  if (lvl === 1) {
    const a = ri(r, 2, 6);
    const b = ri(r, 2, 9);
    const s = slot % 2 === 0 ? 1 : -1;
    const val = polyStr([
      [a * a, 'x²'],
      [s * 2 * a * b, 'x'],
      [b * b, ''],
    ]);
    return {
      stem: `Khai triển: (${a}x ${s > 0 ? '+' : '−'} ${b})².`,
      correct: val,
      distractors: td(val, [
        polyStr([
          [a, 'x²'],
          [s * 2 * a * b, 'x'],
          [b * b, ''],
        ]),
        polyStr([
          [a * a, 'x²'],
          [s * a * b, 'x'],
          [b * b, ''],
        ]),
        polyStr([
          [a * a, 'x²'],
          [b * b, ''],
        ]),
        polyStr([
          [a * a, 'x²'],
          [-s * 2 * a * b, 'x'],
          [b * b, ''],
        ]),
      ]),
      solution: `Với A = ${a}x, B = ${b}: A² = ${a * a}x², 2AB = 2 × ${a} × ${b} = ${2 * a * b} nên hạng tử giữa là ${s > 0 ? '' : '−'}${2 * a * b}x, B² = ${b * b}. Kết quả ${val}. Chú ý (${a}x)² = ${a * a}x²; nếu chỉ bình phương phần biến sẽ ra ${a}x².`,
      steps: [`A = ${a}x → A² = ${a * a}x²`, `2AB = ${2 * a * b}x`, `B² = ${b * b}`, `Kết quả: ${val}`],
      hint: 'Nhớ bình phương cả hệ số của x, và hạng tử giữa là 2AB.',
      tags: ['hằng đẳng thức', 'bình phương một tổng'],
    };
  }
  if (slot % 2 === 0) {
    const base = pick(r, [20, 30, 40, 50, 60, 70, 80, 90, 100]);
    const k = ri(r, 1, 4);
    const s = r() < 0.5 ? 1 : -1;
    const n = base + s * k;
    const val = n * n;
    return {
      stem: `Tính nhanh giá trị của ${n}² bằng hằng đẳng thức.`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [
        base * base + k * k,
        base * base + s * 2 * k,
        base * base + s * base * k + k * k,
        base * base,
        val + 100,
      ]),
      solution: `Viết ${n} = ${base} ${s > 0 ? '+' : '−'} ${k}. Khi đó ${n}² = ${base}² ${s > 0 ? '+' : '−'} 2 × ${base} × ${k} + ${k}² = ${base * base} ${s > 0 ? '+' : '−'} ${2 * base * k} + ${k * k} = ${val}. Nếu quên hạng tử 2AB sẽ ra ${base * base + k * k}.`,
      steps: [
        `${n} = ${base} ${s > 0 ? '+' : '−'} ${k}`,
        `2AB = 2 × ${base} × ${k} = ${2 * base * k}`,
        `${base * base} ${s > 0 ? '+' : '−'} ${2 * base * k} + ${k * k} = ${val}`,
      ],
      hint: 'Tách số về dạng tròn chục cộng/trừ một số nhỏ rồi dùng (A ± B)².',
      tags: ['hằng đẳng thức', 'tính nhanh'],
    };
  }
  const a = ri(r, 2, 6);
  const b = ri(r, 2, 9);
  const val = polyStr([[4 * a * b, 'x']]);
  return {
    stem: `Rút gọn biểu thức: (${axStr(a)} + ${b})² − (${axStr(a)} − ${b})².`,
    correct: val,
    distractors: td(val, [
      '0',
      polyStr([[2 * a * b, 'x']]),
      polyStr([[4 * b * b, '']]),
      polyStr([
        [2 * a * a, 'x²'],
        [2 * b * b, ''],
      ]),
    ]),
    solution: `Khai triển từng bình phương: (${axStr(a)} + ${b})² = ${a * a}x² + ${2 * a * b}x + ${b * b}; (${axStr(a)} − ${b})² = ${a * a}x² − ${2 * a * b}x + ${b * b}. Trừ hai kết quả, ${a * a}x² và ${b * b} triệt tiêu, chỉ còn ${2 * a * b}x − (−${2 * a * b}x) = ${4 * a * b}x. Vậy biểu thức bằng ${val}, không phải 0.`,
    steps: [
      `(${axStr(a)} + ${b})² = ${a * a}x² + ${2 * a * b}x + ${b * b}`,
      `(${axStr(a)} − ${b})² = ${a * a}x² − ${2 * a * b}x + ${b * b}`,
      `Hiệu: ${2 * a * b}x + ${2 * a * b}x = ${val}`,
    ],
    hint: 'Khai triển cả hai rồi trừ; chỉ hạng tử 2AB không triệt tiêu.',
    tags: ['hằng đẳng thức', 'rút gọn'],
  };
}

// ---------------------------------------------------------------------------
// Căn bậc hai
// ---------------------------------------------------------------------------

/** `mode='val'`: tính giá trị căn. `mode='simplify'`: đưa thừa số ra ngoài dấu căn. */
function gSqrt(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const mode = pstr(ctx, 'mode', 'val');

  if (mode === 'simplify') {
    const frees = [2, 3, 5, 6, 7, 10, 11];
    if (lvl === 0) {
      const k = ri(r, 2, 7);
      const m = pick(r, frees);
      const n = k * k * m;
      const val = radStr(k, m);
      return {
        stem: `Rút gọn: √${n}.`,
        correct: val,
        distractors: td(val, [radStr(m, k), radStr(k * k, m), radStr(k, k), fmt(k * m)]),
        solution: `Phân tích ${n} = ${k * k} × ${m} = ${k}² × ${m}. Vì ${k}² là số chính phương nên đưa ${k} ra ngoài dấu căn: √${n} = ${k}√${m}. Số ${m} không còn thừa số chính phương nào nên dừng lại.`,
        steps: [`${n} = ${k}² × ${m}`, `√${n} = √(${k}²) × √${m}`, `= ${val}`],
        hint: 'Tách số dưới căn thành (số chính phương) × (phần còn lại) rồi lấy căn phần chính phương.',
        tags: ['căn bậc hai', 'rút gọn'],
      };
    }
    if (lvl === 1) {
      const m = pick(r, frees);
      const k1 = ri(r, 2, 5);
      const k2 = k1 + ri(r, 1, 4);
      const a = k1 * k1 * m;
      const b = k2 * k2 * m;
      const val = radStr(k1 + k2, m);
      return {
        stem: `Rút gọn: √${a} + √${b}.`,
        correct: val,
        distractors: td(val, [
          `√${a + b}`,
          radStr(k1 * k2, m),
          radStr(k1 + k2, 2 * m),
          fmt(k1 + k2),
        ]),
        solution: `Đưa từng căn về dạng đơn giản: √${a} = ${radStr(k1, m)} và √${b} = ${radStr(k2, m)}. Hai căn thức đồng dạng (cùng √${m}) nên cộng được phần hệ số: ${k1} + ${k2} = ${k1 + k2}, kết quả ${val}. Cộng thẳng trong căn thành √${a + b} là SAI vì √a + √b ≠ √(a+b).`,
        steps: [`√${a} = ${radStr(k1, m)}`, `√${b} = ${radStr(k2, m)}`, `${k1}√${m} + ${k2}√${m} = ${val}`],
        hint: 'Chỉ cộng được hai căn thức khi phần trong căn đã giống hệt nhau.',
        tags: ['căn bậc hai', 'căn thức đồng dạng'],
      };
    }
    if (slot % 2 === 0) {
      const m = pick(r, frees);
      const k1 = ri(r, 4, 8);
      const k2 = ri(r, 1, 3);
      const k3 = ri(r, 2, 5);
      const a = k1 * k1 * m;
      const b = k2 * k2 * m;
      const c = k3 * k3 * m;
      const kk = k1 - k2 + k3;
      const val = radStr(kk, m);
      return {
        stem: `Rút gọn: √${a} − √${b} + √${c}.`,
        correct: val,
        distractors: td(val, [
          `√${a - b + c}`,
          radStr(k1 + k2 + k3, m),
          radStr(k1 - k2 - k3, m),
          fmt(kk),
        ]),
        solution: `Rút gọn từng căn: √${a} = ${radStr(k1, m)}, √${b} = ${radStr(k2, m)}, √${c} = ${radStr(k3, m)}. Cả ba đều đồng dạng với √${m} nên gộp hệ số: ${k1} − ${k2} + ${k3} = ${kk}. Kết quả ${val}. Cộng trừ thẳng trong dấu căn (ra √${a - b + c}) là sai.`,
        steps: [
          `√${a} = ${radStr(k1, m)}; √${b} = ${radStr(k2, m)}; √${c} = ${radStr(k3, m)}`,
          `Gộp hệ số: ${k1} − ${k2} + ${k3} = ${kk}`,
          `Kết quả: ${val}`,
        ],
        hint: 'Rút gọn từng căn về cùng một căn thức rồi mới cộng trừ hệ số.',
        tags: ['căn bậc hai', 'rút gọn', 'nhiều bước'],
      };
    }
    const m = pick(r, frees);
    const k1 = ri(r, 2, 6);
    const k2 = ri(r, 2, 6);
    const val = k1 * k2 * m;
    return {
      stem: `Tính: ${radStr(k1, m)} × ${radStr(k2, m)}.`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [k1 * k2, k1 * k2 * m * m, (k1 + k2) * m, k1 * k2 + m, val + m]),
      solution: `Nhân hệ số với hệ số, căn với căn: ${k1} × ${k2} = ${k1 * k2} và √${m} × √${m} = ${m}. Vậy tích bằng ${k1 * k2} × ${m} = ${val}. Nhớ rằng √${m} × √${m} = ${m} chứ không phải √${m * m}… rồi lại để nguyên dấu căn.`,
      steps: [`Hệ số: ${k1} × ${k2} = ${k1 * k2}`, `√${m} × √${m} = ${m}`, `Tích: ${k1 * k2} × ${m} = ${val}`],
      hint: 'Bình phương của một căn bậc hai chính là số dưới dấu căn.',
      tags: ['căn bậc hai', 'nhân căn thức'],
    };
  }

  // mode 'val'
  if (lvl === 0) {
    const n = ri(r, 4, 30);
    const sq = n * n;
    return {
      stem: `Tính: √${sq}.`,
      correct: fmt(n),
      numeric: n,
      distractors: nd(n, [sq / 2, n + 1, n - 1, sq, n * 2]),
      solution: `Tìm số không âm có bình phương bằng ${sq}: vì ${n}² = ${sq} nên √${sq} = ${n}. Lưu ý căn bậc hai số học luôn không âm, và √${sq} ≠ ${sq} : 2 = ${sq / 2}.`,
      steps: [`Nhận ra ${sq} = ${n}²`, `√${sq} = ${n}`],
      hint: 'Căn bậc hai của một số chính phương là chính cơ số của bình phương đó.',
      tags: ['căn bậc hai', 'số chính phương'],
    };
  }
  if (lvl === 1) {
    const p = ri(r, 2, 6);
    const q = ri(r, 2, 6);
    const m = ri(r, 3, 12);
    const n = ri(r, 3, 12);
    const val = p * m + q * n;
    return {
      stem: `Tính: ${p}√${m * m} + ${q}√${n * n}.`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [p * m * q * n, p + m + q + n, p * m - q * n, (p + q) * (m + n), val + 1]),
      solution: `√${m * m} = ${m} và √${n * n} = ${n}. Thay vào: ${p} × ${m} + ${q} × ${n} = ${p * m} + ${q * n} = ${val}. Phải nhân hệ số với giá trị căn TRƯỚC khi cộng.`,
      steps: [`√${m * m} = ${m}; √${n * n} = ${n}`, `${p} × ${m} = ${p * m}; ${q} × ${n} = ${q * n}`, `Tổng: ${val}`],
      hint: 'Tính giá trị từng căn trước, rồi nhân hệ số, cuối cùng mới cộng.',
      tags: ['căn bậc hai', 'giá trị biểu thức'],
    };
  }
  if (slot % 2 === 0) {
    const k = ri(r, 5, 25);
    const val = k * k;
    return {
      stem: `Tìm số x ≥ 0, biết √x = ${k}.`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [k * 2, k, Math.round(Math.sqrt(k) * 100) / 100, k * k * k, k * k + k]),
      solution: `Bình phương hai vế của √x = ${k} ta được x = ${k}² = ${val} (điều kiện x ≥ 0 luôn thỏa mãn). Nhân đôi thay vì bình phương sẽ ra ${k * 2} — đây là lỗi rất hay gặp.`,
      steps: [`√x = ${k}`, `Bình phương hai vế: x = ${k}² = ${val}`],
      hint: 'Muốn khử dấu căn thì bình phương hai vế, không phải nhân đôi.',
      tags: ['căn bậc hai', 'suy luận ngược'],
    };
  }
  const [a, b, c] = pick(r, TRIPLES);
  const k = ri(r, 1, 3);
  const A = a * k;
  const B = b * k;
  const C = c * k;
  return {
    stem: `Tính: √(${A}² + ${B}²).`,
    correct: fmt(C),
    numeric: C,
    distractors: nd(C, [A + B, A * A + B * B, Math.abs(B - A), C + 1, (A + B) / 2]),
    solution: `Tính trong căn trước: ${A}² + ${B}² = ${A * A} + ${B * B} = ${A * A + B * B}. Sau đó √${A * A + B * B} = ${C} vì ${C}² = ${C * C}. Lỗi kinh điển là viết √(a² + b²) = a + b, tức ra ${A + B} — hoàn toàn sai.`,
    steps: [`${A}² = ${A * A}; ${B}² = ${B * B}`, `Tổng: ${A * A + B * B}`, `√${A * A + B * B} = ${C}`],
    hint: 'Căn của một tổng KHÔNG bằng tổng các căn — phải cộng trong căn trước.',
    tags: ['căn bậc hai', 'nhiều bước'],
  };
}

// ---------------------------------------------------------------------------
// Định lý Pythagore
// ---------------------------------------------------------------------------

/** `mode='hyp'`: tính cạnh huyền. `mode='leg'`: tính cạnh góc vuông còn lại. */
function gPythagoras(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const mode = pstr(ctx, 'mode', 'hyp');
  const [t1, t2, t3] = pick(r, TRIPLES);
  const k = lvl === 0 ? 1 : ri(r, 2, 4);
  const a = t1 * k;
  const b = t2 * k;
  const c = t3 * k;

  if (mode === 'leg') {
    if (lvl <= 1) {
      return {
        stem: `Tam giác ABC vuông tại A có cạnh huyền BC = ${c} cm và cạnh góc vuông AB = ${a} cm. Tính độ dài cạnh AC (đơn vị cm).`,
        correct: uv(b, 'cm'),
        numeric: b,
        distractors: ud(
          uv(b, 'cm'),
          [
            [c - a, 'cm'],
            [c * c - a * a, 'cm'],
            [c + a, 'cm'],
            [b + 1, 'cm'],
          ],
          [b, 'cm'],
        ),
        solution: `Theo định lý Pythagore: BC² = AB² + AC², suy ra AC² = BC² − AB² = ${c}² − ${a}² = ${c * c} − ${a * a} = ${c * c - a * a}. Vậy AC = √${c * c - a * a} = ${b} cm. Trừ thẳng ${c} − ${a} = ${c - a} là sai vì định lý áp dụng cho BÌNH PHƯƠNG các cạnh.`,
        steps: [`AC² = BC² − AB²`, `AC² = ${c * c} − ${a * a} = ${c * c - a * a}`, `AC = ${b} cm`],
        hint: 'Cạnh góc vuông = căn bậc hai của (cạnh huyền bình phương trừ cạnh góc vuông kia bình phương).',
        tags: ['pythagore', 'tam giác vuông'],
      };
    }
    if (slot % 2 === 0) {
      return {
        stem: `Một chiếc thang dài ${c} m dựng dựa vào tường, chân thang cách chân tường ${a} m. Hỏi ngọn thang chạm tường ở độ cao bao nhiêu mét?`,
        correct: uv(b, 'm'),
        numeric: b,
        distractors: ud(
          uv(b, 'm'),
          [
            [c - a, 'm'],
            [c + a, 'm'],
            [c * c - a * a, 'm'],
            [roundDec(Math.sqrt(c * c + a * a), 2), 'm'],
          ],
          [b, 'm'],
        ),
        solution: `Thang, tường và mặt đất tạo thành tam giác vuông với thang là cạnh huyền (${c} m), khoảng cách chân thang tới tường là một cạnh góc vuông (${a} m). Chiều cao h thỏa mãn h² = ${c}² − ${a}² = ${c * c} − ${a * a} = ${c * c - a * a}, nên h = ${b} m. Đáp án ${c - a} m là do trừ thẳng độ dài mà không bình phương.`,
        steps: [`Cạnh huyền = ${c} m; cạnh góc vuông = ${a} m`, `h² = ${c * c} − ${a * a} = ${c * c - a * a}`, `h = ${b} m`],
        hint: 'Cái thang luôn là cạnh huyền vì nó đối diện góc vuông giữa tường và mặt đất.',
        tags: ['pythagore', 'bài toán thực tế'],
      };
    }
    const area = (a * b) / 2;
    return {
      stem: `Tam giác MNP vuông tại M có cạnh huyền NP = ${c} cm và cạnh MN = ${a} cm. Tính diện tích tam giác MNP (đơn vị cm²).`,
      correct: uv(area, 'cm²'),
      numeric: area,
      distractors: ud(
        uv(area, 'cm²'),
        [
          [a * b, 'cm²'],
          [(a * c) / 2, 'cm²'],
          [((c - a) * a) / 2, 'cm²'],
          [a + b + c, 'cm²'],
        ],
        [area, 'cm²'],
      ),
      solution: `Bước 1 — tìm cạnh góc vuông còn lại: MP² = NP² − MN² = ${c * c} − ${a * a} = ${c * c - a * a} nên MP = ${b} cm. Bước 2 — diện tích tam giác vuông bằng nửa tích hai cạnh góc vuông: S = ${a} × ${b} : 2 = ${area} cm². Hai lỗi hay gặp: quên chia 2 (ra ${a * b}) hoặc lấy cạnh huyền làm chiều cao (ra ${(a * c) / 2}).`,
      steps: [`MP² = ${c * c} − ${a * a} = ${c * c - a * a} → MP = ${b} cm`, `S = ${a} × ${b} : 2 = ${area} cm²`],
      hint: 'Diện tích tam giác vuông dùng HAI CẠNH GÓC VUÔNG, không dùng cạnh huyền.',
      tags: ['pythagore', 'diện tích', 'nhiều bước'],
    };
  }

  // mode 'hyp'
  if (lvl <= 1) {
    return {
      stem: `Tam giác ABC vuông tại A có AB = ${a} cm và AC = ${b} cm. Tính độ dài cạnh huyền BC (đơn vị cm).`,
      correct: uv(c, 'cm'),
      numeric: c,
      distractors: ud(
        uv(c, 'cm'),
        [
          [a + b, 'cm'],
          [a * a + b * b, 'cm'],
          [Math.abs(b - a), 'cm'],
          [c + 1, 'cm'],
        ],
        [c, 'cm'],
      ),
      solution: `Định lý Pythagore: BC² = AB² + AC² = ${a}² + ${b}² = ${a * a} + ${b * b} = ${a * a + b * b}. Do đó BC = √${a * a + b * b} = ${c} cm. Cộng thẳng hai cạnh (${a} + ${b} = ${a + b}) là sai; quên khai căn sẽ ra ${a * a + b * b}.`,
      steps: [`BC² = ${a}² + ${b}² = ${a * a + b * b}`, `BC = √${a * a + b * b} = ${c} cm`],
      hint: 'Bình phương cạnh huyền bằng tổng bình phương hai cạnh góc vuông.',
      tags: ['pythagore', 'tam giác vuông'],
    };
  }
  if (slot % 2 === 0) {
    const p = a + b + c;
    return {
      stem: `Tam giác ABC vuông tại A có AB = ${a} cm, AC = ${b} cm. Tính chu vi tam giác ABC (đơn vị cm).`,
      correct: uv(p, 'cm'),
      numeric: p,
      distractors: ud(
        uv(p, 'cm'),
        [
          [a + b, 'cm'],
          [a + b + a * a + b * b, 'cm'],
          [(a * b) / 2, 'cm'],
          [p - 1, 'cm'],
        ],
        [p, 'cm'],
      ),
      solution: `Bước 1 — tính cạnh huyền: BC² = ${a}² + ${b}² = ${a * a + b * b} nên BC = ${c} cm. Bước 2 — chu vi bằng tổng ba cạnh: ${a} + ${b} + ${c} = ${p} cm. Nếu quên cạnh huyền chỉ cộng hai cạnh góc vuông sẽ ra ${a + b} cm.`,
      steps: [`BC = √(${a * a} + ${b * b}) = ${c} cm`, `Chu vi = ${a} + ${b} + ${c} = ${p} cm`],
      hint: 'Tính cạnh huyền trước rồi mới cộng đủ ba cạnh.',
      tags: ['pythagore', 'chu vi', 'nhiều bước'],
    };
  }
  const area = (a * b) / 2;
  return {
    stem: `Một tam giác vuông có một cạnh góc vuông bằng ${a} cm và diện tích bằng ${area} cm². Tính độ dài cạnh huyền của tam giác đó (đơn vị cm).`,
    correct: uv(c, 'cm'),
    numeric: c,
    distractors: ud(
      uv(c, 'cm'),
      [
        [a + b, 'cm'],
        [(2 * area) / a, 'cm'],
        [a * a + b * b, 'cm'],
        [c - 1, 'cm'],
      ],
      [c, 'cm'],
    ),
    solution: `Bước 1 — tìm cạnh góc vuông còn lại từ diện tích: S = (cạnh 1 × cạnh 2) : 2 nên cạnh 2 = 2S : ${a} = ${2 * area} : ${a} = ${b} cm. Bước 2 — Pythagore: cạnh huyền² = ${a}² + ${b}² = ${a * a + b * b}, suy ra cạnh huyền = ${c} cm. Bẫy là quên nhân 2 khi rút cạnh còn lại từ công thức diện tích.`,
    steps: [`Cạnh còn lại = 2 × ${area} : ${a} = ${b} cm`, `Cạnh huyền² = ${a * a} + ${b * b} = ${a * a + b * b}`, `Cạnh huyền = ${c} cm`],
    hint: 'Từ diện tích rút ra cạnh góc vuông thứ hai trước, sau đó mới dùng Pythagore.',
    tags: ['pythagore', 'suy luận ngược', 'nhiều bước'],
  };
}

// >>>CHUNK2<<<

export const SCIENCE_GENERATORS: Record<string, Gen> = {
  gArith,
  gUnitConv,
  gPolyExpand,
  gSqrt,
  gPythagoras,
};
