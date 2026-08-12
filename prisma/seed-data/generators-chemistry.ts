/**
 * BỘ SINH HÓA HỌC — khối D (lớp 10–12) và phần dung dịch của KHTN khối C.
 *
 * Bốn bộ sinh: mol, phần trăm khối lượng nguyên tố, tính theo phương trình
 * hóa học, nồng độ dung dịch.
 *
 * NGUYÊN TẮC RIÊNG CỦA MÔN HÓA — chỉ dùng dữ liệu CÓ THẬT:
 *  - Khối lượng mol lấy từ bảng tuần hoàn (làm tròn như sách giáo khoa).
 *  - Phương trình phản ứng được viết sẵn và ĐÃ CÂN BẰNG, không sinh ngẫu nhiên,
 *    vì một phương trình bịa ra sẽ dạy học sinh kiến thức sai.
 *  - Số liệu chọn ngược từ số mol tròn ⇒ khối lượng và thể tích luôn đẹp.
 *
 * Nhiễu là lỗi thật của phòng thí nghiệm: nhân thay vì chia khi tính mol,
 * lấy khối lượng dung môi thay cho khối lượng dung dịch, quên hệ số cân bằng.
 *
 * File này KHÔNG import gì từ `src/` (tsx không đọc `paths` của tsconfig).
 */
import type { Draft, Gen, GenCtx } from './generators';
import { fmt, pick, pstr, ri, roundDec, td } from './generators';

// ===========================================================================
// DỮ LIỆU HÓA HỌC CÓ THẬT
// ===========================================================================

const SUB = '₀₁₂₃₄₅₆₇₈₉';
function sub(n: number): string {
  return String(n)
    .split('')
    .map((c) => SUB[Number(c)])
    .join('');
}

/** Dấu phần trăm viết liền số theo chuẩn tiếng Việt; các đơn vị khác có dấu cách. */
function uv(v: number, unit: string): string {
  return unit === '%' ? `${fmt(roundDec(v, 4))}%` : `${fmt(roundDec(v, 4))} ${unit}`;
}

function ud(correct: string, cands: [number, string][], pad: [number, string]): string[] {
  const out = td(
    correct,
    cands.filter(([v]) => Number.isFinite(v) && Math.abs(v) < 1e12).map(([v, u]) => uv(v, u)),
  );
  for (const k of [2, 0.5, 10, 0.1, 22.4, 100]) {
    if (out.length >= 3) break;
    const t = uv(roundDec(pad[0] * k, 4), pad[1]);
    if (t !== correct && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Hợp chất quen thuộc với khối lượng mol tính từ bảng tuần hoàn. */
interface Compound {
  /** Công thức đã gắn chỉ số dưới, dùng để hiển thị. */
  f: string;
  name: string;
  /** Khối lượng mol (g/mol), làm tròn theo sách giáo khoa. */
  M: number;
  /** Thành phần: [ký hiệu nguyên tố, nguyên tử khối, số nguyên tử]. */
  parts: [string, number, number][];
}

const COMPOUNDS: Compound[] = [
  { f: `H${sub(2)}O`, name: 'nước', M: 18, parts: [['H', 1, 2], ['O', 16, 1]] },
  { f: `CO${sub(2)}`, name: 'khí cacbonic', M: 44, parts: [['C', 12, 1], ['O', 16, 2]] },
  { f: 'NaCl', name: 'muối ăn', M: 58.5, parts: [['Na', 23, 1], ['Cl', 35.5, 1]] },
  { f: `CaCO${sub(3)}`, name: 'canxi cacbonat', M: 100, parts: [['Ca', 40, 1], ['C', 12, 1], ['O', 16, 3]] },
  { f: `H${sub(2)}SO${sub(4)}`, name: 'axit sunfuric', M: 98, parts: [['H', 1, 2], ['S', 32, 1], ['O', 16, 4]] },
  { f: 'NaOH', name: 'natri hiđroxit', M: 40, parts: [['Na', 23, 1], ['O', 16, 1], ['H', 1, 1]] },
  { f: `CuSO${sub(4)}`, name: 'đồng(II) sunfat', M: 160, parts: [['Cu', 64, 1], ['S', 32, 1], ['O', 16, 4]] },
  { f: `Fe${sub(2)}O${sub(3)}`, name: 'sắt(III) oxit', M: 160, parts: [['Fe', 56, 2], ['O', 16, 3]] },
  { f: `CaO`, name: 'canxi oxit (vôi sống)', M: 56, parts: [['Ca', 40, 1], ['O', 16, 1]] },
  { f: `Al${sub(2)}O${sub(3)}`, name: 'nhôm oxit', M: 102, parts: [['Al', 27, 2], ['O', 16, 3]] },
  { f: `KNO${sub(3)}`, name: 'kali nitrat', M: 101, parts: [['K', 39, 1], ['N', 14, 1], ['O', 16, 3]] },
  { f: `MgO`, name: 'magie oxit', M: 40, parts: [['Mg', 24, 1], ['O', 16, 1]] },
];

/** Khí ở điều kiện tiêu chuẩn — chỉ những chất thật sự là chất khí. */
const GASES: Compound[] = [
  { f: `O${sub(2)}`, name: 'khí oxi', M: 32, parts: [['O', 16, 2]] },
  { f: `H${sub(2)}`, name: 'khí hiđro', M: 2, parts: [['H', 1, 2]] },
  { f: `CO${sub(2)}`, name: 'khí cacbonic', M: 44, parts: [['C', 12, 1], ['O', 16, 2]] },
  { f: `N${sub(2)}`, name: 'khí nitơ', M: 28, parts: [['N', 14, 2]] },
  { f: `CH${sub(4)}`, name: 'khí metan', M: 16, parts: [['C', 12, 1], ['H', 1, 4]] },
];

/**
 * Phương trình phản ứng CÓ THẬT, đã cân bằng, kèm hệ số và khối lượng mol.
 * Không sinh ngẫu nhiên phương trình — dạy sai phản ứng còn tệ hơn không dạy.
 */
interface Reaction {
  eq: string;
  /** Chất tham gia được cho dữ kiện: tên, hệ số, khối lượng mol. */
  from: { f: string; coef: number; M: number };
  /** Sản phẩm cần tính: tên, hệ số, khối lượng mol, có phải chất khí không. */
  to: { f: string; coef: number; M: number; gas: boolean };
}

const REACTIONS: Reaction[] = [
  {
    eq: `CaCO${sub(3)} --t°--> CaO + CO${sub(2)}↑`,
    from: { f: `CaCO${sub(3)}`, coef: 1, M: 100 },
    to: { f: 'CaO', coef: 1, M: 56, gas: false },
  },
  {
    eq: `CaCO${sub(3)} --t°--> CaO + CO${sub(2)}↑`,
    from: { f: `CaCO${sub(3)}`, coef: 1, M: 100 },
    to: { f: `CO${sub(2)}`, coef: 1, M: 44, gas: true },
  },
  {
    eq: `Zn + 2HCl --> ZnCl${sub(2)} + H${sub(2)}↑`,
    from: { f: 'Zn', coef: 1, M: 65 },
    to: { f: `H${sub(2)}`, coef: 1, M: 2, gas: true },
  },
  {
    eq: `2Al + 6HCl --> 2AlCl${sub(3)} + 3H${sub(2)}↑`,
    from: { f: 'Al', coef: 2, M: 27 },
    to: { f: `H${sub(2)}`, coef: 3, M: 2, gas: true },
  },
  {
    eq: `4Al + 3O${sub(2)} --t°--> 2Al${sub(2)}O${sub(3)}`,
    from: { f: 'Al', coef: 4, M: 27 },
    to: { f: `Al${sub(2)}O${sub(3)}`, coef: 2, M: 102, gas: false },
  },
  {
    eq: `2Mg + O${sub(2)} --t°--> 2MgO`,
    from: { f: 'Mg', coef: 2, M: 24 },
    to: { f: 'MgO', coef: 2, M: 40, gas: false },
  },
  {
    eq: `Fe + 2HCl --> FeCl${sub(2)} + H${sub(2)}↑`,
    from: { f: 'Fe', coef: 1, M: 56 },
    to: { f: `H${sub(2)}`, coef: 1, M: 2, gas: true },
  },
  {
    eq: `CH${sub(4)} + 2O${sub(2)} --t°--> CO${sub(2)} + 2H${sub(2)}O`,
    from: { f: `CH${sub(4)}`, coef: 1, M: 16 },
    to: { f: `CO${sub(2)}`, coef: 1, M: 44, gas: true },
  },
];

const AVOGADRO_TEXT = '6,022·10²³';

// ===========================================================================
// 1. MOL — KHỐI LƯỢNG — SỐ PHÂN TỬ
// ===========================================================================

function gMole(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const mode = pstr(ctx, 'mode', 'n');
  const c = pick(r, COMPOUNDS);
  // Số mol chọn trước để khối lượng luôn là số đẹp.
  const n = pick(r, lvl === 0 ? [0.5, 1, 2, 3] : [0.1, 0.25, 0.5, 1.5, 2.5, 4, 5]);
  const m = roundDec(c.M * n, 4);

  if (mode === 'm') {
    return {
      stem: `Tính khối lượng của ${fmt(n)} mol ${c.f} (${c.name}). Biết M(${c.f}) = ${fmt(c.M)} g/mol. Đơn vị: gam.`,
      correct: uv(m, 'g'),
      numeric: m,
      distractors: ud(
        uv(m, 'g'),
        [
          [roundDec(n / c.M, 5), 'g'],
          [roundDec(c.M / n, 4), 'g'],
          [roundDec(c.M + n, 4), 'g'],
          [roundDec(n * 22.4, 4), 'g'],
        ],
        [m, 'g'],
      ),
      solution: `Công thức m = n·M. Thay số: m = ${fmt(n)} × ${fmt(c.M)} = ${fmt(m)} g. Cách nhớ: một mol ${c.f} nặng ${fmt(c.M)} g, vậy ${fmt(n)} mol nặng gấp ${fmt(n)} lần con số đó. Chia thay vì nhân (ra ${fmt(roundDec(n / c.M, 5))} g) là lỗi hay gặp — kiểm tra bằng cảm quan: ${fmt(n)} mol thì khối lượng phải ${n >= 1 ? 'lớn hơn' : 'nhỏ hơn'} ${fmt(c.M)} g.`,
      steps: [`m = n·M`, `m = ${fmt(n)} × ${fmt(c.M)}`, `m = ${fmt(m)} g`],
      hint: 'Từ mol sang gam thì NHÂN với khối lượng mol.',
      tags: ['mol', 'khối lượng mol'],
    };
  }

  if (mode === 'N') {
    const N = roundDec(n * 6.022, 4);
    const correct = `${fmt(N)}·10²³ phân tử`;
    return {
      stem: `Tính số phân tử có trong ${fmt(n)} mol ${c.f}. Biết số Avogadro N_A = ${AVOGADRO_TEXT} phân tử/mol.`,
      correct,
      distractors: td(correct, [
        `${fmt(roundDec(6.022 / n, 4))}·10²³ phân tử`,
        `${fmt(roundDec(n * 6.022, 4))}·10²² phân tử`,
        `${fmt(roundDec(n + 6.022, 4))}·10²³ phân tử`,
        `${fmt(roundDec(n * c.M, 4))}·10²³ phân tử`,
        `${fmt(roundDec(n * 6.022 * 2, 4))}·10²³ phân tử`,
      ]),
      solution: `Số phân tử N = n × N_A = ${fmt(n)} × ${AVOGADRO_TEXT} = ${fmt(N)}·10²³ phân tử. Số Avogadro cho biết MỘT mol chất nào cũng chứa đúng ${AVOGADRO_TEXT} hạt, nên chỉ cần nhân với số mol. Chia cho số mol là hiểu ngược ý nghĩa của hằng số này.`,
      steps: [`N = n × N_A`, `N = ${fmt(n)} × ${AVOGADRO_TEXT}`, `N = ${fmt(N)}·10²³ phân tử`],
      hint: 'Một mol chất nào cũng chứa 6,022·10²³ hạt — nhân số mol với hằng số đó.',
      tags: ['mol', 'số Avogadro'],
    };
  }

  // --- mode = 'n': tính số mol ---
  if (lvl === 2) {
    // Chất khí ở đktc: đường vào thứ hai của khái niệm mol.
    const g = pick(r, GASES);
    const nG = pick(r, [0.25, 0.5, 1, 1.5, 2, 2.5]);
    const V = roundDec(nG * 22.4, 4);
    return {
      stem: `Tính số mol của ${fmt(V)} lít ${g.f} (${g.name}) ở điều kiện tiêu chuẩn. Đơn vị: mol.`,
      correct: uv(nG, 'mol'),
      numeric: nG,
      distractors: ud(
        uv(nG, 'mol'),
        [
          [roundDec(V * 22.4, 4), 'mol'],
          [roundDec(V / g.M, 4), 'mol'],
          [roundDec(22.4 / V, 4), 'mol'],
          [roundDec(V / 24, 4), 'mol'],
        ],
        [nG, 'mol'],
      ),
      solution: `Ở điều kiện tiêu chuẩn, một mol chất khí bất kỳ đều chiếm 22,4 lít. Do đó n = V : 22,4 = ${fmt(V)} : 22,4 = ${fmt(nG)} mol. Lưu ý: với chất khí thì dùng thể tích mol 22,4 L/mol, KHÔNG dùng khối lượng mol ${fmt(g.M)} g/mol — chia nhầm cho ${fmt(g.M)} sẽ ra ${fmt(roundDec(V / g.M, 4))} mol.`,
      steps: [`n = V : 22,4 (đktc)`, `n = ${fmt(V)} : 22,4`, `n = ${fmt(nG)} mol`],
      hint: 'Chất khí ở đktc: chia thể tích cho 22,4 lít.',
      tags: ['mol', 'thể tích mol chất khí'],
    };
  }

  return {
    stem: `Tính số mol có trong ${fmt(m)} gam ${c.f} (${c.name}). Biết M(${c.f}) = ${fmt(c.M)} g/mol. Đơn vị: mol.`,
    correct: uv(n, 'mol'),
    numeric: n,
    distractors: ud(
      uv(n, 'mol'),
      [
        [roundDec(m * c.M, 4), 'mol'],
        [roundDec(c.M / m, 4), 'mol'],
        [roundDec(m / 22.4, 4), 'mol'],
        [roundDec(n * 2, 4), 'mol'],
        [roundDec(n / 2, 4), 'mol'],
      ],
      [n, 'mol'],
    ),
    solution: `Công thức n = m : M. Thay số: n = ${fmt(m)} : ${fmt(c.M)} = ${fmt(n)} mol. Ý nghĩa: mỗi mol ${c.f} nặng ${fmt(c.M)} g, hỏi ${fmt(m)} g thì chứa bao nhiêu "gói" như vậy. Nhân thay vì chia (ra ${fmt(roundDec(m * c.M, 4))}) cho con số vô lý — số mol của vài chục gam chất luôn nhỏ, cỡ đơn vị.`,
    steps: [`n = m : M`, `n = ${fmt(m)} : ${fmt(c.M)}`, `n = ${fmt(n)} mol`],
    hint: 'Từ gam sang mol thì CHIA cho khối lượng mol.',
    tags: ['mol', 'khối lượng mol'],
  };
}

// ===========================================================================
// 2. PHẦN TRĂM KHỐI LƯỢNG NGUYÊN TỐ
// ===========================================================================

function gMassPercent(ctx: GenCtx): Draft {
  const { r, slot } = ctx;
  const c = pick(
    r,
    COMPOUNDS.filter((x) => x.parts.length >= 2),
  );
  const idx = ri(r, 0, c.parts.length - 1);
  const [sym, A, cnt] = c.parts[idx];
  const massEl = A * cnt;
  const pct = roundDec((massEl / c.M) * 100, 2);
  const breakdown = c.parts.map(([s, a, k]) => `${s}: ${fmt(a)}×${k} = ${fmt(a * k)}`).join('; ');

  if (slot % 3 === 2) {
    // Bài ngược: từ phần trăm suy ra khối lượng nguyên tố trong một mẫu chất.
    const sample = pick(r, [20, 25, 40, 50, 80, 100, 200]);
    const massInSample = roundDec((sample * massEl) / c.M, 3);
    return {
      stem: `Trong ${sample} gam ${c.f} (${c.name}) có bao nhiêu gam nguyên tố ${sym}? Biết M(${c.f}) = ${fmt(c.M)} g/mol và nguyên tử khối ${sym} = ${fmt(A)}. Đơn vị: gam.`,
      correct: uv(massInSample, 'g'),
      numeric: massInSample,
      distractors: ud(
        uv(massInSample, 'g'),
        [
          [roundDec((sample * A) / c.M, 3), 'g'],
          [roundDec((sample * c.M) / massEl, 3), 'g'],
          [pct, 'g'],
          [roundDec(sample - massInSample, 3), 'g'],
        ],
        [massInSample, 'g'],
      ),
      solution: `Bước 1 — tính phần khối lượng của ${sym} trong một mol ${c.f}: ${fmt(A)} × ${cnt} = ${fmt(massEl)} g trên tổng ${fmt(c.M)} g, tức ${fmt(pct)}%. Bước 2 — áp tỉ lệ đó cho mẫu ${sample} g: m(${sym}) = ${sample} × ${fmt(massEl)} : ${fmt(c.M)} = ${fmt(massInSample)} g. Quên nhân với số nguyên tử ${cnt} là lỗi phổ biến nhất${cnt > 1 ? `, cho ${fmt(roundDec((sample * A) / c.M, 3))} g` : ''}.`,
      steps: [
        `m(${sym}) trong 1 mol = ${fmt(A)}×${cnt} = ${fmt(massEl)} g`,
        `Tỉ lệ = ${fmt(massEl)} : ${fmt(c.M)}`,
        `m(${sym}) = ${sample} × ${fmt(massEl)} : ${fmt(c.M)} = ${fmt(massInSample)} g`,
      ],
      hint: 'Nhân nguyên tử khối với SỐ NGUYÊN TỬ trong công thức trước khi lập tỉ lệ.',
      tags: ['thành phần phần trăm', 'nhiều bước'],
    };
  }

  return {
    stem: `Tính phần trăm khối lượng của nguyên tố ${sym} trong hợp chất ${c.f} (${c.name}). Biết M(${c.f}) = ${fmt(c.M)} g/mol, nguyên tử khối ${sym} = ${fmt(A)}. Đơn vị: %.`,
    correct: uv(pct, '%'),
    numeric: pct,
    distractors: ud(
      uv(pct, '%'),
      [
        [roundDec((A / c.M) * 100, 2), '%'],
        [roundDec(100 - pct, 2), '%'],
        [roundDec((c.M / massEl) * 100, 2), '%'],
        [roundDec(massEl, 2), '%'],
      ],
      [pct, '%'],
    ),
    solution: `Công thức: %${sym} = (khối lượng ${sym} trong 1 mol hợp chất : M hợp chất) × 100%. Phân tích khối lượng mol ${fmt(c.M)} = ${breakdown}. Phần của ${sym}: ${fmt(A)} × ${cnt} = ${fmt(massEl)} g. Vậy %${sym} = ${fmt(massEl)} : ${fmt(c.M)} × 100% = ${fmt(pct)}%. ${cnt > 1 ? `Quên nhân với chỉ số ${cnt} sẽ cho ${fmt(roundDec((A / c.M) * 100, 2))}% — sai đúng ${cnt} lần.` : 'Đảo ngược phân số (lấy M chia cho phần nguyên tố) sẽ cho kết quả lớn hơn 100%, điều không thể xảy ra với một thành phần.'}`,
    steps: [
      `M(${c.f}) = ${fmt(c.M)} g/mol`,
      `m(${sym}) = ${fmt(A)}×${cnt} = ${fmt(massEl)} g`,
      `%${sym} = ${fmt(massEl)} : ${fmt(c.M)} × 100% = ${fmt(pct)}%`,
    ],
    hint: 'Tử số là khối lượng nguyên tố (đã nhân chỉ số), mẫu số là khối lượng mol cả hợp chất.',
    tags: ['thành phần phần trăm', 'hợp chất'],
  };
}

// ===========================================================================
// 3. TÍNH THEO PHƯƠNG TRÌNH HÓA HỌC
// ===========================================================================

function gStoich(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const mode = pstr(ctx, 'mode', 'mass');
  const rx = pick(
    r,
    mode === 'vol' ? REACTIONS.filter((x) => x.to.gas) : REACTIONS,
  );
  const nFrom = pick(r, lvl === 0 ? [0.5, 1, 2] : [0.25, 0.5, 1.5, 2, 3, 4]);
  const mFrom = roundDec(nFrom * rx.from.M, 4);
  const nTo = roundDec((nFrom * rx.to.coef) / rx.from.coef, 6);

  if (mode === 'vol') {
    const V = roundDec(nTo * 22.4, 4);
    const wrongRatio = roundDec(nFrom * 22.4, 4);
    return {
      stem: `Cho ${fmt(mFrom)} gam ${rx.from.f} phản ứng hoàn toàn theo phương trình: ${rx.eq}. Tính thể tích khí ${rx.to.f} thu được ở điều kiện tiêu chuẩn (đơn vị lít). Biết M(${rx.from.f}) = ${fmt(rx.from.M)} g/mol.`,
      correct: uv(V, 'lít'),
      numeric: V,
      distractors: ud(
        uv(V, 'lít'),
        [
          [wrongRatio, 'lít'],
          [roundDec(nTo * 24, 4), 'lít'],
          [roundDec(nTo / 22.4, 5), 'lít'],
          [roundDec(nTo * rx.to.M, 4), 'lít'],
        ],
        [V, 'lít'],
      ),
      solution: `Bước 1 — số mol chất đầu: n(${rx.from.f}) = ${fmt(mFrom)} : ${fmt(rx.from.M)} = ${fmt(nFrom)} mol. Bước 2 — dùng TỈ LỆ HỆ SỐ trong phương trình đã cân bằng: cứ ${rx.from.coef} mol ${rx.from.f} sinh ra ${rx.to.coef} mol ${rx.to.f}, nên n(${rx.to.f}) = ${fmt(nFrom)} × ${rx.to.coef} : ${rx.from.coef} = ${fmt(nTo)} mol. Bước 3 — thể tích khí ở đktc: V = n × 22,4 = ${fmt(nTo)} × 22,4 = ${fmt(V)} lít.${rx.from.coef !== rx.to.coef ? ` Bỏ qua hệ số cân bằng (coi 1 mol ra 1 mol) sẽ cho ${fmt(wrongRatio)} lít — đây là lỗi nặng nhất của dạng bài này.` : ' Nhân nhầm với khối lượng mol thay vì 22,4 là lỗi hay gặp.'}`,
      steps: [
        `n(${rx.from.f}) = ${fmt(mFrom)} : ${fmt(rx.from.M)} = ${fmt(nFrom)} mol`,
        `Tỉ lệ ${rx.from.coef} : ${rx.to.coef} ⇒ n(${rx.to.f}) = ${fmt(nTo)} mol`,
        `V = ${fmt(nTo)} × 22,4 = ${fmt(V)} lít`,
      ],
      hint: 'Ba bước cố định: đổi ra mol → nhân tỉ lệ hệ số → đổi về đại lượng đề hỏi.',
      tags: ['phương trình hóa học', 'thể tích khí', 'nhiều bước'],
    };
  }

  const mTo = roundDec(nTo * rx.to.M, 4);
  const wrongNoCoef = roundDec(nFrom * rx.to.M, 4);
  return {
    stem: `Cho ${fmt(mFrom)} gam ${rx.from.f} phản ứng hoàn toàn theo phương trình: ${rx.eq}. Tính khối lượng ${rx.to.f} thu được (đơn vị gam). Biết M(${rx.from.f}) = ${fmt(rx.from.M)} g/mol, M(${rx.to.f}) = ${fmt(rx.to.M)} g/mol.`,
    correct: uv(mTo, 'g'),
    numeric: mTo,
    distractors: ud(
      uv(mTo, 'g'),
      [
        [wrongNoCoef, 'g'],
        [mFrom, 'g'],
        [roundDec(nTo / rx.to.M, 5), 'g'],
        [roundDec((nFrom * rx.from.coef * rx.to.M) / rx.to.coef, 4), 'g'],
      ],
      [mTo, 'g'],
    ),
    solution: `Bước 1 — đổi khối lượng chất đầu ra mol: n(${rx.from.f}) = ${fmt(mFrom)} : ${fmt(rx.from.M)} = ${fmt(nFrom)} mol. Bước 2 — theo phương trình ĐÃ CÂN BẰNG, tỉ lệ mol là ${rx.from.coef} : ${rx.to.coef}, nên n(${rx.to.f}) = ${fmt(nFrom)} × ${rx.to.coef} : ${rx.from.coef} = ${fmt(nTo)} mol. Bước 3 — đổi ngược về khối lượng: m = n × M = ${fmt(nTo)} × ${fmt(rx.to.M)} = ${fmt(mTo)} g.${rx.from.coef !== rx.to.coef ? ` Quên hệ số cân bằng cho ${fmt(wrongNoCoef)} g.` : ' Lấy luôn khối lượng chất đầu làm đáp án là hiểu sai định luật bảo toàn khối lượng — chỉ TỔNG khối lượng mới bảo toàn, từng chất thì không.'}`,
    steps: [
      `n(${rx.from.f}) = ${fmt(mFrom)} : ${fmt(rx.from.M)} = ${fmt(nFrom)} mol`,
      `Tỉ lệ ${rx.from.coef} : ${rx.to.coef} ⇒ n(${rx.to.f}) = ${fmt(nTo)} mol`,
      `m = ${fmt(nTo)} × ${fmt(rx.to.M)} = ${fmt(mTo)} g`,
    ],
    hint: 'Luôn đi qua số mol; hệ số trước công thức chính là tỉ lệ mol.',
    tags: ['phương trình hóa học', 'khối lượng sản phẩm', 'nhiều bước'],
  };
}

// ===========================================================================
// 4. NỒNG ĐỘ DUNG DỊCH
// ===========================================================================

function gConcentration(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const mode = pstr(ctx, 'mode', 'C');
  const solute = pick(r, ['NaCl', 'đường', `CuSO${sub(4)}`, 'NaOH', `KNO${sub(3)}`]);
  // Chọn nồng độ và khối lượng dung dịch trước ⇒ khối lượng chất tan luôn đẹp.
  const pct = pick(r, [5, 8, 10, 12, 15, 16, 20, 25]);
  const mdd = pick(r, lvl === 0 ? [200, 400, 500] : [150, 250, 300, 600, 800, 1000]);
  const mct = roundDec((pct * mdd) / 100, 3);
  const mdm = roundDec(mdd - mct, 3);

  if (mode === 'mct') {
    if (slot % 3 === 2) {
      // Cho khối lượng DUNG MÔI thay vì dung dịch — bẫy kinh điển.
      return {
        stem: `Hòa tan một lượng ${solute} vào ${fmt(mdm)} gam nước thu được dung dịch có nồng độ ${pct}%. Tính khối lượng ${solute} đã dùng (đơn vị gam).`,
        correct: uv(mct, 'g'),
        numeric: mct,
        distractors: ud(
          uv(mct, 'g'),
          [
            [roundDec((pct * mdm) / 100, 3), 'g'],
            [roundDec(mdm / pct, 3), 'g'],
            [roundDec(mdd, 3), 'g'],
            [roundDec((pct * (mdm + mct * 2)) / 100, 3), 'g'],
          ],
          [mct, 'g'],
        ),
        solution: `Chú ý: ${fmt(mdm)} gam là khối lượng NƯỚC (dung môi), không phải dung dịch. Khối lượng dung dịch = khối lượng chất tan + khối lượng nước = m + ${fmt(mdm)}. Từ C% = m : (m + ${fmt(mdm)}) × 100% = ${pct}% suy ra 100m = ${pct}(m + ${fmt(mdm)}), tức ${100 - pct}m = ${fmt(roundDec(pct * mdm, 3))}, nên m = ${fmt(mct)} g. Kiểm tra: dung dịch nặng ${fmt(mct)} + ${fmt(mdm)} = ${fmt(mdd)} g và ${fmt(mct)} : ${fmt(mdd)} = ${pct}%. Áp thẳng ${pct}% lên khối lượng nước sẽ cho ${fmt(roundDec((pct * mdm) / 100, 3))} g — đó là lỗi phổ biến nhất của dạng bài này.`,
        steps: [
          `m(dung dịch) = m(chất tan) + ${fmt(mdm)}`,
          `${pct}% = m : (m + ${fmt(mdm)}) × 100%`,
          `${100 - pct}m = ${fmt(roundDec(pct * mdm, 3))} ⇒ m = ${fmt(mct)} g`,
        ],
        hint: 'Nước là DUNG MÔI. Khối lượng dung dịch bằng chất tan cộng dung môi.',
        tags: ['nồng độ phần trăm', 'suy luận ngược', 'nhiều bước'],
      };
    }
    return {
      stem: `Cần bao nhiêu gam ${solute} để pha ${mdd} gam dung dịch ${solute} nồng độ ${pct}%? Đơn vị: gam.`,
      correct: uv(mct, 'g'),
      numeric: mct,
      distractors: ud(
        uv(mct, 'g'),
        [
          [roundDec(mdd / pct, 3), 'g'],
          [roundDec(mdd * pct, 3), 'g'],
          [roundDec(mdd - pct, 3), 'g'],
          [mdm, 'g'],
        ],
        [mct, 'g'],
      ),
      solution: `Từ công thức C% = m(chất tan) : m(dung dịch) × 100% rút ra m(chất tan) = C% × m(dung dịch) : 100 = ${pct} × ${mdd} : 100 = ${fmt(mct)} g. Phần nước cần dùng là ${mdd} − ${fmt(mct)} = ${fmt(mdm)} g. Chia thay vì nhân (ra ${fmt(roundDec(mdd / pct, 3))} g) là lỗi hay gặp — nhớ rằng khối lượng chất tan luôn NHỎ HƠN khối lượng dung dịch.`,
      steps: [`C% = m(ct) : m(dd) × 100%`, `m(ct) = ${pct} × ${mdd} : 100`, `m(ct) = ${fmt(mct)} g`],
      hint: 'Lấy phần trăm nhân khối lượng dung dịch rồi chia 100.',
      tags: ['nồng độ phần trăm', 'chất tan'],
    };
  }

  // --- mode = 'C': tính nồng độ phần trăm ---
  if (slot % 3 === 2) {
    return {
      stem: `Hòa tan hoàn toàn ${fmt(mct)} gam ${solute} vào ${fmt(mdm)} gam nước. Tính nồng độ phần trăm của dung dịch thu được (đơn vị %).`,
      correct: uv(pct, '%'),
      numeric: pct,
      distractors: ud(
        uv(pct, '%'),
        [
          [roundDec((mct / mdm) * 100, 2), '%'],
          [roundDec((mdm / mdd) * 100, 2), '%'],
          [roundDec(mct / mdd, 4), '%'],
          [roundDec(100 - pct, 2), '%'],
        ],
        [pct, '%'],
      ),
      solution: `Bước 1 — khối lượng dung dịch bằng chất tan cộng dung môi: m(dd) = ${fmt(mct)} + ${fmt(mdm)} = ${fmt(mdd)} g. Bước 2 — nồng độ phần trăm: C% = ${fmt(mct)} : ${fmt(mdd)} × 100% = ${fmt(pct)}%. Lấy khối lượng nước làm mẫu số (ra ${fmt(roundDec((mct / mdm) * 100, 2))}%) là lỗi phổ biến nhất — mẫu số phải là DUNG DỊCH, tức cả nước lẫn chất tan.`,
      steps: [
        `m(dd) = ${fmt(mct)} + ${fmt(mdm)} = ${fmt(mdd)} g`,
        `C% = ${fmt(mct)} : ${fmt(mdd)} × 100%`,
        `C% = ${fmt(pct)}%`,
      ],
      hint: 'Cộng chất tan với nước để ra khối lượng dung dịch trước khi chia.',
      tags: ['nồng độ phần trăm', 'nhiều bước'],
    };
  }

  return {
    stem: `Một dung dịch chứa ${fmt(mct)} gam ${solute} trong tổng khối lượng dung dịch ${mdd} gam. Tính nồng độ phần trăm của dung dịch (đơn vị %).`,
    correct: uv(pct, '%'),
    numeric: pct,
    distractors: ud(
      uv(pct, '%'),
      [
        [roundDec((mdd / mct) * 100, 2), '%'],
        [roundDec((mct / mdm) * 100, 2), '%'],
        [roundDec(mct / mdd, 4), '%'],
        [roundDec(mdd - mct, 2), '%'],
      ],
      [pct, '%'],
    ),
    solution: `Nồng độ phần trăm cho biết trong 100 gam dung dịch có bao nhiêu gam chất tan: C% = m(chất tan) : m(dung dịch) × 100% = ${fmt(mct)} : ${fmt(mdd)} × 100% = ${fmt(pct)}%. Quên nhân 100 sẽ ra ${fmt(roundDec(mct / mdd, 4))} — đó là tỉ số, chưa phải phần trăm.`,
    steps: [`C% = m(ct) : m(dd) × 100%`, `C% = ${fmt(mct)} : ${fmt(mdd)} × 100%`, `C% = ${fmt(pct)}%`],
    hint: 'Chia chất tan cho DUNG DỊCH rồi nhân 100.',
    tags: ['nồng độ phần trăm', 'dung dịch'],
  };
}

export const CHEMISTRY_GENERATORS: Record<string, Gen> = {
  gMole,
  gMassPercent,
  gStoich,
  gConcentration,
};
