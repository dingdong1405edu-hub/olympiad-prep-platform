/**
 * BỘ SINH TOÁN NÂNG CAO — KHỐI C (lớp 8–9) VÀ KHỐI D (lớp 10–12).
 *
 * Sáu bộ sinh: hệ phương trình bậc nhất hai ẩn, cấp số cộng, cấp số nhân,
 * logarit, lượng giác và đạo hàm.
 *
 * Ba quy tắc bất di bất dịch, giống mọi file generator khác:
 *  1. Đáp án và lời giải luôn được TÍNH RA từ tham số vừa sinh — không viết tay.
 *  2. Số liệu chọn NGƯỢC từ đáp án đẹp ⇒ nghiệm luôn nguyên, logarit luôn ra số
 *     nguyên, đạo hàm luôn có hệ số gọn.
 *  3. Nhiễu là LỖI SAI CÓ THẬT: lệch một đơn vị ở số hạng (n thay cho n−1),
 *     quên chia đôi khi tính tổng, đảo tử mẫu, hạ bậc mà quên nhân hệ số.
 *
 * File này KHÔNG import gì từ `src/` (tsx không đọc `paths` của tsconfig).
 */
import type { Draft, Gen, GenCtx } from './generators';
import { fmt, gcd, nd, pick, pstr, ri, td } from './generators';

// ===========================================================================
// TIỆN ÍCH RIÊNG
// ===========================================================================

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** Chỉ số dưới: 2 → "₂" (cơ số logarit, chỉ số dãy). */
function sub(n: number): string {
  return String(n)
    .split('')
    .map((c) => SUB[Number(c)])
    .join('');
}

/** Chỉ số trên: 3 → "³" (lũy thừa trong đa thức). */
function sup(n: number): string {
  return String(n)
    .split('')
    .map((c) => SUP[Number(c)])
    .join('');
}

/** Dấu trừ toán học U+2212, dùng khi ghép biểu thức để không lẫn với gạch nối. */
function neg(x: number): string {
  return x < 0 ? `−${fmt(Math.abs(x))}` : fmt(x);
}

/**
 * Ghép đa thức từ danh sách [hệ số, bậc]. Bỏ hạng tử hệ số 0, ẩn hệ số 1,
 * ẩn số mũ 1 — đúng cách viết trong sách giáo khoa.
 */
function poly(terms: [number, number][]): string {
  let out = '';
  for (const [c, e] of terms) {
    if (c === 0) continue;
    const a = Math.abs(c);
    let body: string;
    if (e === 0) body = fmt(a);
    else {
      const coef = a === 1 ? '' : fmt(a);
      body = e === 1 ? `${coef}x` : `${coef}x${sup(e)}`;
    }
    if (out === '') out = c < 0 ? `−${body}` : body;
    else out += c < 0 ? ` − ${body}` : ` + ${body}`;
  }
  return out === '' ? '0' : out;
}

/** Vế trái của phương trình bậc nhất hai ẩn: "3x − 2y". */
function lin(a: number, b: number): string {
  const left = a === 1 ? 'x' : a === -1 ? '−x' : `${neg(a)}x`;
  if (b === 0) return left;
  const body = Math.abs(b) === 1 ? 'y' : `${fmt(Math.abs(b))}y`;
  return `${left} ${b < 0 ? '−' : '+'} ${body}`;
}

/** Nghiệm hệ hiển thị thống nhất một kiểu để bốn phương án so sánh được. */
function pairStr(x: number, y: number): string {
  return `x = ${neg(x)}; y = ${neg(y)}`;
}

/** Lũy thừa nguyên — tránh sai số dấu phẩy động của Math.pow với số lớn. */
function ipow(base: number, exp: number): number {
  let out = 1;
  for (let i = 0; i < exp; i++) out *= base;
  return out;
}

/** Phân số tối giản dạng chuỗi, dùng cho giá trị lượng giác và hệ số góc. */
function fracStr(n: number, d: number): string {
  if (d === 0) return '∞';
  let nn = n;
  let dd = d;
  if (dd < 0) {
    nn = -nn;
    dd = -dd;
  }
  const g = gcd(Math.abs(nn), dd) || 1;
  nn /= g;
  dd /= g;
  return dd === 1 ? neg(nn) : `${nn < 0 ? '−' : ''}${Math.abs(nn)}/${dd}`;
}

// ===========================================================================
// 1. HỆ HAI PHƯƠNG TRÌNH BẬC NHẤT HAI ẨN (khối C)
// ===========================================================================

/**
 * Nghiệm nguyên được chọn TRƯỚC, hệ số sinh sau và vế phải tính ngược lại —
 * nhờ vậy hệ luôn có nghiệm duy nhất, nguyên, không bao giờ ra phân số xấu.
 */
function gSystemEq(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const span = lvl === 0 ? 6 : lvl === 1 ? 9 : 12;
  const x0 = ri(r, -span, span);
  const y0 = ri(r, -span, span);

  const nz = (lo: number, hi: number): number => {
    const v = ri(r, lo, hi);
    return v === 0 ? hi : v;
  };

  let a1 = nz(1, 5);
  let b1 = nz(-5, 5);
  let a2 = nz(-5, 5);
  let b2 = nz(1, 5);
  // Định thức khác 0 ⇒ nghiệm duy nhất. Nếu hai phương trình song song thì
  // đề vô nghiệm hoặc vô số nghiệm — không phải dạng bài này.
  let guard = 0;
  while (a1 * b2 - a2 * b1 === 0 && guard < 20) {
    b2 = nz(1, 6);
    a2 = nz(-6, 6);
    guard++;
  }
  if (a1 * b2 - a2 * b1 === 0) {
    a1 = 2;
    b1 = 1;
    a2 = 1;
    b2 = -1;
  }

  const c1 = a1 * x0 + b1 * y0;
  const c2 = a2 * x0 + b2 * y0;
  const system = `${lin(a1, b1)} = ${neg(c1)} và ${lin(a2, b2)} = ${neg(c2)}`;
  const det = a1 * b2 - a2 * b1;

  // Biến thể 3: hỏi một đại lượng dẫn xuất để câu không chỉ là "đọc nghiệm".
  if (slot % 3 === 2) {
    const val = x0 + y0;
    return {
      stem: `Cho hệ phương trình ${system}. Tính tổng x + y.`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [x0 - y0, y0 - x0, x0 * y0, val + 1, val - 1, 2 * x0]),
      solution: `Nhân chéo để khử y: nhân phương trình thứ nhất với ${neg(b2)} và phương trình thứ hai với ${neg(-b1)} rồi cộng lại, được ${neg(det)}·x = ${neg(c1 * b2 - c2 * b1)} nên x = ${neg(x0)}. Thay vào phương trình thứ nhất: ${neg(b1)}·y = ${neg(c1 - a1 * x0)} nên y = ${neg(y0)}. Vậy x + y = ${neg(x0)} + ${neg(y0)} = ${fmt(val)}. Bẫy hay gặp là tính hiệu x − y (ra ${fmt(x0 - y0)}) vì đọc nhầm dấu.`,
      steps: [
        `Khử y: ${neg(det)}x = ${neg(c1 * b2 - c2 * b1)} ⇒ x = ${neg(x0)}`,
        `Thay x vào: y = ${neg(y0)}`,
        `x + y = ${fmt(val)}`,
      ],
      hint: 'Giải hệ ra nghiệm trước, đừng cộng hai vế phải của hệ với nhau.',
      tags: ['hệ phương trình', 'nhiều bước'],
    };
  }

  const correct = pairStr(x0, y0);
  return {
    stem: `Giải hệ phương trình: ${system}.`,
    correct,
    distractors: td(correct, [
      pairStr(y0, x0),
      pairStr(x0, -y0),
      pairStr(-x0, y0),
      pairStr(x0 + 1, y0 - 1),
      pairStr(x0 - 1, y0 + 1),
      pairStr(x0 + 2, y0),
      pairStr(x0, y0 + 2),
    ]),
    solution: `Dùng phương pháp cộng đại số. Nhân phương trình thứ nhất với ${neg(b2)}, phương trình thứ hai với ${neg(-b1)} rồi cộng vế theo vế để khử y: ${neg(det)}·x = ${neg(c1 * b2 - c2 * b1)}, suy ra x = ${neg(x0)}. Thay x = ${neg(x0)} vào ${lin(a1, b1)} = ${neg(c1)} được ${neg(b1)}·y = ${neg(c1 - a1 * x0)}, suy ra y = ${neg(y0)}. Thử lại vào phương trình thứ hai: ${neg(a2 * x0)} + ${neg(b2 * y0)} = ${neg(c2)} — đúng. Sai lầm phổ biến là ghi nghiệm đảo thứ tự thành ${pairStr(y0, x0)}.`,
    steps: [
      `Khử y ⇒ ${neg(det)}x = ${neg(c1 * b2 - c2 * b1)}`,
      `x = ${neg(x0)}`,
      `Thay vào phương trình đầu ⇒ y = ${neg(y0)}`,
      `Thử lại cả hai phương trình đều đúng`,
    ],
    hint: 'Nhân hai phương trình cho hệ số thích hợp để hệ số của y đối nhau, rồi cộng vế theo vế.',
    tags: ['hệ phương trình', 'cộng đại số'],
  };
}

// ===========================================================================
// 2. CẤP SỐ CỘNG (khối D)
// ===========================================================================

function gArithSeq(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const u1 = ri(r, -12, 20);
  const d = pick(r, [-7, -5, -4, -3, 3, 4, 5, 6, 7]);
  const n = lvl === 0 ? ri(r, 8, 15) : lvl === 1 ? ri(r, 16, 25) : ri(r, 26, 40);
  const un = u1 + (n - 1) * d;

  if (slot % 3 === 0) {
    return {
      stem: `Cho cấp số cộng (u${sub(1)}) với u${sub(1)} = ${neg(u1)} và công sai d = ${neg(d)}. Tính u${sub(n)}.`,
      correct: fmt(un),
      numeric: un,
      distractors: nd(un, [u1 + n * d, u1 + (n - 2) * d, u1 * d * n, un + d, un - d, u1 * n]),
      solution: `Số hạng tổng quát của cấp số cộng là uₙ = u${sub(1)} + (n − 1)d. Thay số: u${sub(n)} = ${neg(u1)} + (${n} − 1)·${neg(d)} = ${neg(u1)} + ${n - 1}·${neg(d)} = ${neg(u1)} + ${neg((n - 1) * d)} = ${fmt(un)}. Lỗi kinh điển là nhân với n thay vì n − 1, cho kết quả ${fmt(u1 + n * d)} — lệch đúng một công sai.`,
      steps: [`uₙ = u${sub(1)} + (n − 1)d`, `u${sub(n)} = ${neg(u1)} + ${n - 1}·${neg(d)}`, `u${sub(n)} = ${fmt(un)}`],
      hint: 'Từ u₁ đến uₙ chỉ có n − 1 bước nhảy, không phải n bước.',
      tags: ['cấp số cộng', 'số hạng tổng quát'],
    };
  }

  if (slot % 3 === 1) {
    const sn = (n * (2 * u1 + (n - 1) * d)) / 2;
    return {
      stem: `Cho cấp số cộng (u${sub(1)}) với u${sub(1)} = ${neg(u1)} và công sai d = ${neg(d)}. Tính tổng ${n} số hạng đầu S${sub(n)}.`,
      correct: fmt(sn),
      numeric: sn,
      distractors: nd(sn, [n * (2 * u1 + (n - 1) * d), n * (u1 + un), sn - un, sn + un, n * u1, sn / 2], true),
      solution: `Tổng n số hạng đầu: Sₙ = n(u${sub(1)} + uₙ) : 2. Trước hết u${sub(n)} = ${neg(u1)} + ${n - 1}·${neg(d)} = ${fmt(un)}. Do đó S${sub(n)} = ${n}·(${neg(u1)} + ${fmt(un)}) : 2 = ${n}·${fmt(u1 + un)} : 2 = ${fmt(n * (u1 + un))} : 2 = ${fmt(sn)}. Quên chia đôi là lỗi phổ biến nhất, kết quả sẽ gấp đôi thành ${fmt(n * (u1 + un))}.`,
      steps: [
        `uₙ = ${neg(u1)} + ${n - 1}·${neg(d)} = ${fmt(un)}`,
        `Sₙ = n(u${sub(1)} + uₙ) : 2`,
        `S${sub(n)} = ${n}·${fmt(u1 + un)} : 2 = ${fmt(sn)}`,
      ],
      hint: 'Tổng bằng số số hạng nhân trung bình cộng của số hạng đầu và số hạng cuối.',
      tags: ['cấp số cộng', 'tổng', 'nhiều bước'],
    };
  }

  // Biến thể 3: cho hai số hạng, tìm công sai — buộc học sinh dùng ngược công thức.
  const k = ri(r, 5, 12);
  const uk = u1 + (k - 1) * d;
  return {
    stem: `Một cấp số cộng có u${sub(1)} = ${neg(u1)} và u${sub(k)} = ${neg(uk)}. Tính công sai d.`,
    correct: fmt(d),
    numeric: d,
    distractors: nd(d, [(uk - u1) / k, (uk - u1) / (k + 1), uk - u1, -d, d + 1, d - 1], true),
    solution: `Từ u${sub(k)} = u${sub(1)} + (k − 1)d suy ra d = (u${sub(k)} − u${sub(1)}) : (k − 1) = (${neg(uk)} − ${neg(u1)}) : (${k} − 1) = ${neg(uk - u1)} : ${k - 1} = ${fmt(d)}. Chia cho k thay vì k − 1 là bẫy chính, cho ${fmt((uk - u1) / k)}.`,
    steps: [`u${sub(k)} = u${sub(1)} + (k − 1)d`, `d = ${neg(uk - u1)} : ${k - 1}`, `d = ${fmt(d)}`],
    hint: 'Hiệu hai số hạng chia cho SỐ BƯỚC giữa chúng, tức k − 1.',
    tags: ['cấp số cộng', 'suy luận ngược'],
  };
}

// ===========================================================================
// 3. CẤP SỐ NHÂN (khối D)
// ===========================================================================

function gGeoSeq(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const q = pick(r, lvl === 0 ? [2, 3] : lvl === 1 ? [2, 3, -2] : [2, 3, -2, -3, 4]);
  const maxN = Math.abs(q) === 2 ? 10 : Math.abs(q) === 3 ? 7 : 6;
  const n = ri(r, 4, maxN);
  const u1 = ri(r, 1, 9) * pick(r, [1, 1, 1, -1]);
  const un = u1 * ipow(q, n - 1);

  if (slot % 3 === 0) {
    return {
      stem: `Cho cấp số nhân (u${sub(1)}) với u${sub(1)} = ${neg(u1)} và công bội q = ${neg(q)}. Tính u${sub(n)}.`,
      correct: fmt(un),
      numeric: un,
      distractors: nd(un, [u1 * ipow(q, n), u1 * ipow(q, n - 2), u1 * q * (n - 1), un * q, u1 + (n - 1) * q]),
      solution: `Số hạng tổng quát của cấp số nhân: uₙ = u${sub(1)}·q^(n−1). Thay số: u${sub(n)} = ${neg(u1)}·${neg(q)}${sup(n - 1)} = ${neg(u1)}·${fmt(ipow(q, n - 1))} = ${fmt(un)}. Hai lỗi hay gặp: dùng số mũ n thay vì n − 1 (ra ${fmt(u1 * ipow(q, n))}), hoặc nhầm sang công thức cấp số cộng u${sub(1)} + (n − 1)q (ra ${fmt(u1 + (n - 1) * q)}).`,
      steps: [`uₙ = u${sub(1)}·q^(n−1)`, `u${sub(n)} = ${neg(u1)}·${neg(q)}${sup(n - 1)}`, `u${sub(n)} = ${fmt(un)}`],
      hint: 'Số mũ của công bội là n − 1, vì u₁ chưa nhân lần nào.',
      tags: ['cấp số nhân', 'số hạng tổng quát'],
    };
  }

  if (slot % 3 === 1) {
    const sn = (u1 * (ipow(q, n) - 1)) / (q - 1);
    return {
      stem: `Cho cấp số nhân (u${sub(1)}) với u${sub(1)} = ${neg(u1)} và công bội q = ${neg(q)}. Tính tổng ${n} số hạng đầu S${sub(n)}.`,
      correct: fmt(sn),
      numeric: sn,
      distractors: nd(
        sn,
        [
          (u1 * (ipow(q, n - 1) - 1)) / (q - 1),
          (u1 * (ipow(q, n) - 1)) / q,
          u1 * ipow(q, n),
          sn - un,
          sn + un,
          (n * (u1 + un)) / 2,
        ],
        true,
      ),
      solution: `Tổng n số hạng đầu của cấp số nhân với q ≠ 1: Sₙ = u${sub(1)}·(qⁿ − 1) : (q − 1). Thay số: q${sup(n)} = ${fmt(ipow(q, n))}, nên S${sub(n)} = ${neg(u1)}·(${fmt(ipow(q, n))} − 1) : (${neg(q)} − 1) = ${neg(u1)}·${fmt(ipow(q, n) - 1)} : ${fmt(q - 1)} = ${fmt(sn)}. Chia cho q thay vì q − 1 là sai lầm phổ biến.`,
      steps: [
        `Sₙ = u${sub(1)}(qⁿ − 1) : (q − 1)`,
        `q${sup(n)} = ${fmt(ipow(q, n))}`,
        `S${sub(n)} = ${neg(u1)}·${fmt(ipow(q, n) - 1)} : ${fmt(q - 1)} = ${fmt(sn)}`,
      ],
      hint: 'Mẫu số là q − 1, không phải q.',
      tags: ['cấp số nhân', 'tổng', 'nhiều bước'],
    };
  }

  // Biến thể 3: cho hai số hạng cách nhau đúng 2 bậc, tìm công bội.
  const qq = pick(r, [2, 3, 4, 5]);
  const a1 = ri(r, 1, 7);
  const a3 = a1 * qq * qq;
  return {
    stem: `Một cấp số nhân có các số hạng dương với u${sub(1)} = ${a1} và u${sub(3)} = ${a3}. Tính công bội q.`,
    correct: fmt(qq),
    numeric: qq,
    distractors: nd(qq, [a3 / a1, (a3 - a1) / 2, qq * qq, qq + 1, a3 / (a1 * 3), qq - 1], true),
    solution: `Từ u${sub(3)} = u${sub(1)}·q² suy ra q² = u${sub(3)} : u${sub(1)} = ${a3} : ${a1} = ${qq * qq}. Do các số hạng đều dương nên q = √${qq * qq} = ${qq}. Quên khai căn sẽ trả lời ${a3 / a1} — đó mới là q², không phải q.`,
    steps: [`u${sub(3)} = u${sub(1)}q²`, `q² = ${a3} : ${a1} = ${qq * qq}`, `q = ${qq}`],
    hint: 'Từ u₁ đến u₃ nhân công bội hai lần, nên tỉ số u₃ : u₁ bằng q² chứ không phải q.',
    tags: ['cấp số nhân', 'suy luận ngược'],
  };
}

// ===========================================================================
// 4. LOGARIT (khối D)
// ===========================================================================

/** Cơ số hiển thị: log₂, log₃, log₅, riêng cơ số 10 viết là "log". */
function logName(base: number): string {
  return base === 10 ? 'log' : `log${sub(base)}`;
}

function gLog(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const mode = pstr(ctx, 'mode', 'val');
  const base = pick(r, lvl === 0 ? [2, 3, 10] : [2, 3, 5, 10]);
  const L = logName(base);

  if (mode === 'eq') {
    const k = ri(r, 2, base === 2 ? 7 : base === 3 ? 5 : 4);
    const pw = ipow(base, k);

    if (slot % 3 === 0) {
      return {
        stem: `Giải phương trình ${L} x = ${k}.`,
        correct: `x = ${fmt(pw)}`,
        numeric: pw,
        distractors: td(`x = ${fmt(pw)}`, [
          `x = ${fmt(base * k)}`,
          `x = ${fmt(ipow(k, base))}`,
          `x = ${fmt(base + k)}`,
          `x = ${fmt(ipow(base, k - 1))}`,
          `x = ${fmt(ipow(base, k + 1))}`,
        ]),
        solution: `Theo định nghĩa logarit, ${L} x = ${k} ⇔ x = ${base}${sup(k)} = ${fmt(pw)} (điều kiện x > 0 được thỏa mãn). Lỗi hay gặp là nhân cơ số với kết quả, cho ${fmt(base * k)}, hoặc lấy lũy thừa ngược thành ${fmt(ipow(k, base))}.`,
        steps: [`${L} x = ${k} ⇔ x = ${base}${sup(k)}`, `x = ${fmt(pw)}`],
        hint: 'Logarit hỏi "cơ số mũ mấy thì ra x" — nên x chính là cơ số lũy thừa kết quả.',
        tags: ['logarit', 'phương trình mũ - lôgarit'],
      };
    }

    if (slot % 3 === 1) {
      const a = pick(r, [2, 3, 4, 5]);
      const b = ri(r, 1, 9) * a; // để (pw − b) chia hết cho a ⇒ nghiệm nguyên
      const x = (pw - b) / a;
      if (x > 0 && Number.isInteger(x)) {
        return {
          stem: `Giải phương trình ${L} (${a}x + ${b}) = ${k}.`,
          correct: `x = ${fmt(x)}`,
          numeric: x,
          distractors: td(`x = ${fmt(x)}`, [
            `x = ${fmt(pw / a)}`,
            `x = ${fmt(pw - b)}`,
            `x = ${fmt((pw + b) / a)}`,
            `x = ${fmt((base * k - b) / a)}`,
            `x = ${fmt(x + 1)}`,
          ]),
          solution: `Điều kiện ${a}x + ${b} > 0. Theo định nghĩa: ${a}x + ${b} = ${base}${sup(k)} = ${fmt(pw)}. Suy ra ${a}x = ${fmt(pw)} − ${b} = ${fmt(pw - b)} nên x = ${fmt(pw - b)} : ${a} = ${fmt(x)}. Thay lại: ${a}·${fmt(x)} + ${b} = ${fmt(pw)} và ${L} ${fmt(pw)} = ${k} — đúng. Bẫy là chia ${fmt(pw)} cho ${a} trước khi trừ ${b}.`,
          steps: [`${a}x + ${b} = ${base}${sup(k)} = ${fmt(pw)}`, `${a}x = ${fmt(pw - b)}`, `x = ${fmt(x)}`],
          hint: 'Đưa về dạng lũy thừa trước, sau đó mới giải phương trình bậc nhất — trừ trước, chia sau.',
          tags: ['logarit', 'phương trình', 'nhiều bước'],
        };
      }
    }

    const m = ri(r, 1, 40);
    const x2 = pw + m;
    return {
      stem: `Giải phương trình ${L} (x − ${m}) = ${k}.`,
      correct: `x = ${fmt(x2)}`,
      numeric: x2,
      distractors: td(`x = ${fmt(x2)}`, [
        `x = ${fmt(pw - m)}`,
        `x = ${fmt(pw)}`,
        `x = ${fmt(base * k + m)}`,
        `x = ${fmt(ipow(base, k + 1) + m)}`,
        `x = ${fmt(x2 + 1)}`,
      ]),
      solution: `Điều kiện x − ${m} > 0. Theo định nghĩa: x − ${m} = ${base}${sup(k)} = ${fmt(pw)}, suy ra x = ${fmt(pw)} + ${m} = ${fmt(x2)}. Điều kiện x > ${m} thỏa mãn. Đổi dấu khi chuyển vế là lỗi hay gặp, cho ${fmt(pw - m)}.`,
      steps: [`x − ${m} = ${base}${sup(k)} = ${fmt(pw)}`, `x = ${fmt(pw)} + ${m} = ${fmt(x2)}`],
      hint: 'Chuyển vế thì đổi dấu: −m ở vế trái thành +m ở vế phải.',
      tags: ['logarit', 'phương trình'],
    };
  }

  // --- mode = 'val': tính giá trị biểu thức logarit ---
  if (slot % 3 === 0) {
    const k = ri(r, 2, base === 2 ? 9 : base === 3 ? 5 : 4);
    const pw = ipow(base, k);
    return {
      stem: `Tính giá trị của ${L} ${fmt(pw)}.`,
      correct: fmt(k),
      numeric: k,
      distractors: nd(k, [pw / base, k + 1, k - 1, pw, base * k, pw / k]),
      solution: `Viết ${fmt(pw)} thành lũy thừa của ${base}: ${fmt(pw)} = ${base}${sup(k)}. Theo định nghĩa ${L} ${base}${sup(k)} = ${k}. Logarit trả về SỐ MŨ chứ không phải giá trị lũy thừa, nên đáp án là ${k} chứ không phải ${fmt(pw)}.`,
      steps: [`${fmt(pw)} = ${base}${sup(k)}`, `${L} ${base}${sup(k)} = ${k}`],
      hint: 'Phân tích số trong logarit thành lũy thừa của cơ số, rồi lấy số mũ.',
      tags: ['logarit', 'định nghĩa'],
    };
  }

  if (slot % 3 === 1) {
    // Hai số hạng phải KHÁC nhau, nếu không đề thành "log a + log a" —
    // đúng về toán nhưng không kiểm tra được quy tắc logarit của tích.
    const i = ri(r, 1, 4);
    const j = i === 4 ? ri(r, 1, 3) : i + ri(r, 1, 4 - i);
    const a = ipow(base, i);
    const b = ipow(base, j);
    const val = i + j;
    return {
      stem: `Tính giá trị của biểu thức ${L} ${fmt(a)} + ${L} ${fmt(b)}.`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [i * j, a + b, a * b, val + 1, ipow(base, val), Math.abs(i - j)]),
      solution: `Áp dụng quy tắc logarit của tích: ${L} a + ${L} b = ${L}(ab) = ${L} ${fmt(a * b)}. Mà ${fmt(a * b)} = ${base}${sup(val)} nên giá trị bằng ${val}. Cách khác: ${L} ${fmt(a)} = ${i} và ${L} ${fmt(b)} = ${j}, tổng bằng ${i} + ${j} = ${val}. Lỗi kinh điển là NHÂN hai logarit thành ${fmt(i * j)} — quy tắc chỉ đổi tích trong logarit thành tổng, không phải ngược lại.`,
      steps: [`${L} ${fmt(a)} = ${i}; ${L} ${fmt(b)} = ${j}`, `Tổng = ${i} + ${j} = ${val}`],
      hint: 'Logarit của tích bằng tổng các logarit — tính riêng từng logarit rồi cộng.',
      tags: ['logarit', 'quy tắc tính'],
    };
  }

  const i2 = ri(r, 3, base === 2 ? 9 : 6);
  const j2 = ri(r, 1, i2 - 1);
  const a2 = ipow(base, i2);
  const b2 = ipow(base, j2);
  const val2 = i2 - j2;
  return {
    stem: `Tính giá trị của biểu thức ${L} ${fmt(a2)} − ${L} ${fmt(b2)}.`,
    correct: fmt(val2),
    numeric: val2,
    distractors: nd(val2, [i2 / j2, a2 - b2, a2 / b2, i2 + j2, val2 + 1, ipow(base, val2)]),
    solution: `Quy tắc logarit của thương: ${L} a − ${L} b = ${L}(a : b) = ${L} ${fmt(a2 / b2)} = ${val2}, vì ${fmt(a2 / b2)} = ${base}${sup(val2)}. Kiểm tra bằng cách tính riêng: ${L} ${fmt(a2)} = ${i2}, ${L} ${fmt(b2)} = ${j2}, hiệu bằng ${val2}. Lấy THƯƠNG hai logarit (${fmt(i2 / j2)}) là hiểu ngược quy tắc.`,
    steps: [`${L} ${fmt(a2)} = ${i2}; ${L} ${fmt(b2)} = ${j2}`, `Hiệu = ${i2} − ${j2} = ${val2}`],
    hint: 'Hiệu hai logarit cùng cơ số bằng logarit của thương.',
    tags: ['logarit', 'quy tắc tính'],
  };
}

// ===========================================================================
// 5. LƯỢNG GIÁC (khối D)
// ===========================================================================

/** Bảng giá trị lượng giác của góc đặc biệt — viết dạng căn thức đúng chuẩn. */
const TRIG_TABLE: { deg: number; sin: string; cos: string; tan: string }[] = [
  { deg: 0, sin: '0', cos: '1', tan: '0' },
  { deg: 30, sin: '1/2', cos: '√3/2', tan: '√3/3' },
  { deg: 45, sin: '√2/2', cos: '√2/2', tan: '1' },
  { deg: 60, sin: '√3/2', cos: '1/2', tan: '√3' },
  { deg: 90, sin: '1', cos: '0', tan: 'không xác định' },
  { deg: 120, sin: '√3/2', cos: '−1/2', tan: '−√3' },
  { deg: 135, sin: '√2/2', cos: '−√2/2', tan: '−1' },
  { deg: 150, sin: '1/2', cos: '−√3/2', tan: '−√3/3' },
  { deg: 180, sin: '0', cos: '−1', tan: '0' },
];

/** Bộ ba Pythagore — cho phép ra sin, cos hữu tỉ mà vẫn thỏa sin² + cos² = 1. */
const TRIPLES: [number, number, number][] = [
  [3, 4, 5],
  [5, 12, 13],
  [8, 15, 17],
  [7, 24, 25],
  [20, 21, 29],
  [9, 40, 41],
];

function gTrig(ctx: GenCtx): Draft {
  const { r, slot } = ctx;
  const mode = pstr(ctx, 'mode', 'special');

  if (mode === 'special') {
    const row = pick(
      r,
      TRIG_TABLE.filter((x) => x.deg !== 90 || slot % 3 !== 2),
    );
    const fn = pick(r, ['sin', 'cos', 'tan'] as const);
    const value = fn === 'sin' ? row.sin : fn === 'cos' ? row.cos : row.tan;
    if (value === 'không xác định') {
      const correct = 'Không xác định';
      return {
        stem: `Giá trị của tan 90° là bao nhiêu?`,
        correct,
        distractors: td(correct, ['0', '1', '√3', 'Bằng 0 vì cos 90° = 0']),
        solution: `tan α = sin α : cos α. Tại α = 90° ta có cos 90° = 0 nên phép chia không thực hiện được: tan 90° KHÔNG XÁC ĐỊNH. Nhiều bạn trả lời 0 vì thấy cos 90° = 0, nhưng số 0 nằm ở MẪU chứ không phải tử.`,
        steps: ['tan α = sin α : cos α', 'cos 90° = 0 ⇒ mẫu bằng 0', 'tan 90° không xác định'],
        hint: 'Xem cos của góc đó có bằng 0 không — mẫu bằng 0 thì không xác định.',
        tags: ['lượng giác', 'góc đặc biệt'],
      };
    }

    // Nhiễu lấy từ chính bảng: đổi hàm, đổi góc bù, sai dấu — đều là lỗi thật.
    // "−0" không phải một giá trị, nên phép đổi dấu bỏ qua số 0.
    const flip = (t: string): string => (t === '0' ? '0' : t.startsWith('−') ? t.slice(1) : `−${t}`);
    const otherFn = fn === 'sin' ? row.cos : row.sin;
    const supp = TRIG_TABLE.find((x) => x.deg === 180 - row.deg);
    const cands = [
      otherFn,
      row.tan,
      flip(value),
      supp ? (fn === 'sin' ? supp.sin : fn === 'cos' ? supp.cos : supp.tan) : '1/2',
      '√2/2',
      '√3/2',
      '1/2',
      '1',
      '0',
    ].filter((x) => x !== 'không xác định');

    return {
      stem: `Tính giá trị của ${fn} ${row.deg}°.`,
      correct: value,
      distractors: td(value, cands),
      solution: `${fn} ${row.deg}° = ${value}. Ghi nhớ bảng giá trị lượng giác của góc đặc biệt: tại ${row.deg}° ta có sin = ${row.sin}, cos = ${row.cos}, tan = ${row.tan}. ${
        row.deg === 180
          ? 'Chú ý 180° là góc BẸT: sin 180° = 0 còn cos 180° = −1, đây là hai giá trị hay bị nhớ nhầm cho nhau.'
          : row.deg > 90
            ? `Vì ${row.deg}° là góc TÙ nên sin vẫn dương còn cos và tan mang dấu âm; độ lớn lấy đúng bằng giá trị của góc bù ${180 - row.deg}°. Quên dấu âm là lỗi thường gặp nhất ở phần này.`
            : 'Cách nhớ: sin tăng dần 0, 1/2, √2/2, √3/2, 1 khi góc tăng từ 0° đến 90°; cos đi ngược lại.'
      }`,
      steps: [`Tra bảng góc đặc biệt tại ${row.deg}°`, `${fn} ${row.deg}° = ${value}`],
      hint:
        row.deg > 90 && row.deg < 180
          ? 'Góc tù: sin dương, còn cos và tan âm. Lấy giá trị của góc bù rồi thêm dấu.'
          : 'Nhớ dãy sin: 0, 1/2, √2/2, √3/2, 1 ứng với 0°, 30°, 45°, 60°, 90°.',
      tags: ['lượng giác', 'góc đặc biệt'],
    };
  }

  // --- mode = 'identity': dùng hệ thức sin² + cos² = 1 ---
  const [a, b, c] = pick(r, TRIPLES);
  if (slot % 3 === 0) {
    const correct = fracStr(b, c);
    return {
      stem: `Cho góc nhọn α thỏa mãn sin α = ${a}/${c}. Tính cos α.`,
      correct,
      distractors: td(correct, [
        fracStr(a, c),
        fracStr(c, b),
        fracStr(a, b),
        fracStr(c - a, c),
        `−${fracStr(b, c)}`,
        fracStr(b, a),
      ]),
      solution: `Hệ thức cơ bản: sin²α + cos²α = 1 nên cos²α = 1 − (${a}/${c})² = 1 − ${a * a}/${c * c} = ${c * c - a * a}/${c * c} = ${b * b}/${c * c}. Vì α là góc NHỌN nên cos α > 0, do đó cos α = ${b}/${c}. Hai lỗi hay gặp: lấy 1 − sin α = ${fracStr(c - a, c)} (trừ khi chưa bình phương), hoặc quên rằng góc nhọn có cos dương và chọn ${`−${fracStr(b, c)}`}.`,
      steps: [
        `cos²α = 1 − sin²α = 1 − ${a * a}/${c * c}`,
        `cos²α = ${b * b}/${c * c}`,
        `α nhọn ⇒ cos α = ${b}/${c}`,
      ],
      hint: 'Bình phương trước rồi mới trừ; góc nhọn thì cos luôn dương.',
      tags: ['lượng giác', 'hệ thức cơ bản'],
    };
  }

  if (slot % 3 === 1) {
    const correct = fracStr(a, b);
    return {
      stem: `Cho góc nhọn α thỏa mãn sin α = ${a}/${c}. Tính tan α.`,
      correct,
      distractors: td(correct, [
        fracStr(b, a),
        fracStr(a, c),
        fracStr(b, c),
        fracStr(c, a),
        fracStr(a * b, c * c),
        `−${fracStr(a, b)}`,
      ]),
      solution: `Bước 1 — tìm cos: cos²α = 1 − (${a}/${c})² = ${b * b}/${c * c}, α nhọn nên cos α = ${b}/${c}. Bước 2 — theo định nghĩa tan α = sin α : cos α = (${a}/${c}) : (${b}/${c}) = ${a}/${b}. Chia phân số là nhân với nghịch đảo, mẫu ${c} triệt tiêu. Đảo tử mẫu thành ${fracStr(b, a)} chính là cot α chứ không phải tan α.`,
      steps: [`cos α = ${b}/${c}`, `tan α = (${a}/${c}) : (${b}/${c})`, `tan α = ${a}/${b}`],
      hint: 'Tính cos trước, rồi lấy tan = sin : cos.',
      tags: ['lượng giác', 'hệ thức cơ bản', 'nhiều bước'],
    };
  }

  const k = ri(r, 2, 9);
  const m = ri(r, 1, 12);
  const val = k + m;
  return {
    stem: `Cho góc α bất kỳ. Tính giá trị của biểu thức P = ${k}·(sin²α + cos²α) + ${m}.`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [k * 2 + m, k, m, k * m, val + 1, val - 1]),
    solution: `Hệ thức lượng giác cơ bản khẳng định sin²α + cos²α = 1 với MỌI góc α, nên biểu thức trong ngoặc luôn bằng 1 dù α là góc nào. Do đó P = ${k}·1 + ${m} = ${k} + ${m} = ${val} — giá trị không phụ thuộc vào α. Nhiều bạn nhầm sin²α + cos²α = 2 (vì thấy hai số hạng cộng nhau) rồi trả lời ${k * 2 + m}.`,
    steps: ['sin²α + cos²α = 1 với mọi α', `P = ${k}·1 + ${m}`, `P = ${val}`],
    hint: 'Nhớ hằng đẳng thức lượng giác quan trọng nhất: sin²α + cos²α = 1.',
    tags: ['lượng giác', 'hệ thức cơ bản'],
  };
}

// ===========================================================================
// 6. ĐẠO HÀM (khối D)
// ===========================================================================

function gDeriv(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const mode = pstr(ctx, 'mode', 'poly');

  const nzc = (lo: number, hi: number): number => {
    const v = ri(r, lo, hi);
    return v === 0 ? hi : v;
  };

  if (mode === 'tangent') {
    const a = nzc(1, 5);
    const b = nzc(-8, 8);
    const c = ri(r, -9, 9);
    const x0 = ri(r, -4, 5);
    const k = 2 * a * x0 + b;
    const y0 = a * x0 * x0 + b * x0 + c;

    if (slot % 3 === 2) {
      // Viết phương trình tiếp tuyến: buộc dùng cả hệ số góc lẫn tọa độ tiếp điểm.
      const m = y0 - k * x0;
      const line = `y = ${poly([[k, 1], [m, 0]])}`;
      return {
        stem: `Cho hàm số y = ${poly([[a, 2], [b, 1], [c, 0]])}. Viết phương trình tiếp tuyến của đồ thị tại điểm có hoành độ x${sub(0)} = ${neg(x0)}.`,
        correct: line,
        distractors: td(line, [
          `y = ${poly([[k, 1], [y0, 0]])}`,
          `y = ${poly([[y0, 1], [m, 0]])}`,
          `y = ${poly([[k, 1], [-m, 0]])}`,
          `y = ${poly([[2 * a, 1], [b, 0]])}`,
          `y = ${poly([[k, 1], [m + 1, 0]])}`,
        ]),
        solution: `Bước 1 — đạo hàm: y' = ${poly([[2 * a, 1], [b, 0]])}. Bước 2 — hệ số góc tại x${sub(0)} = ${neg(x0)}: k = y'(${neg(x0)}) = ${2 * a}·${neg(x0)} + ${neg(b)} = ${fmt(k)}. Bước 3 — tung độ tiếp điểm: y${sub(0)} = ${fmt(y0)}. Bước 4 — thay vào công thức y = k(x − x${sub(0)}) + y${sub(0)} = ${fmt(k)}(x − ${neg(x0)}) + ${fmt(y0)} = ${line}. Sai lầm phổ biến là lấy thẳng y = kx + y${sub(0)}, tức quên trừ x${sub(0)} trong ngoặc.`,
        steps: [
          `y' = ${poly([[2 * a, 1], [b, 0]])}`,
          `k = y'(${neg(x0)}) = ${fmt(k)}`,
          `y${sub(0)} = ${fmt(y0)}`,
          `y = ${fmt(k)}(x − ${neg(x0)}) + ${fmt(y0)} = ${line}`,
        ],
        hint: 'Công thức tiếp tuyến là y = f′(x₀)(x − x₀) + f(x₀) — nhớ dấu trừ trong ngoặc.',
        tags: ['đạo hàm', 'tiếp tuyến', 'nhiều bước'],
      };
    }

    return {
      stem: `Cho hàm số y = ${poly([[a, 2], [b, 1], [c, 0]])}. Tính hệ số góc của tiếp tuyến với đồ thị tại điểm có hoành độ x${sub(0)} = ${neg(x0)}.`,
      correct: fmt(k),
      numeric: k,
      distractors: nd(k, [y0, a * x0 * 2, 2 * a * x0, a * x0 + b, k + b, 2 * a * x0 + b + c]),
      solution: `Hệ số góc của tiếp tuyến bằng đạo hàm tại tiếp điểm. Đạo hàm: y' = ${poly([[2 * a, 1], [b, 0]])} (hạ bậc x² thành 2x, hằng số ${neg(c)} có đạo hàm bằng 0). Thay x = ${neg(x0)}: k = ${2 * a}·${neg(x0)} + ${neg(b)} = ${fmt(2 * a * x0)} + ${neg(b)} = ${fmt(k)}. Thay nhầm vào hàm số gốc sẽ ra ${fmt(y0)} — đó là TUNG ĐỘ tiếp điểm chứ không phải hệ số góc.`,
      steps: [`y' = ${poly([[2 * a, 1], [b, 0]])}`, `k = y'(${neg(x0)}) = ${fmt(k)}`],
      hint: 'Hệ số góc = giá trị của ĐẠO HÀM tại x₀, không phải giá trị của hàm số.',
      tags: ['đạo hàm', 'tiếp tuyến'],
    };
  }

  // --- mode = 'poly': đạo hàm của hàm đa thức ---
  if (lvl === 0) {
    const a = nzc(1, 9);
    const b = nzc(-9, 9);
    const c = ri(r, -12, 12);
    const correct = poly([[2 * a, 1], [b, 0]]);
    return {
      stem: `Tính đạo hàm của hàm số f(x) = ${poly([[a, 2], [b, 1], [c, 0]])}.`,
      correct: `f′(x) = ${correct}`,
      distractors: td(`f′(x) = ${correct}`, [
        `f′(x) = ${poly([[a, 1], [b, 0]])}`,
        `f′(x) = ${poly([[2 * a, 1], [b + c, 0]])}`,
        `f′(x) = ${poly([[2 * a, 1]])}`,
        `f′(x) = ${poly([[a, 2], [b, 1]])}`,
        `f′(x) = ${poly([[2 * a, 2], [b, 1]])}`,
      ]),
      solution: `Áp dụng quy tắc (xⁿ)′ = n·xⁿ⁻¹ cho từng hạng tử: (${poly([[a, 2]])})′ = ${fmt(2 * a)}x; (${poly([[b, 1]])})′ = ${neg(b)}; đạo hàm của hằng số ${neg(c)} bằng 0. Cộng lại: f′(x) = ${correct}. Hai lỗi hay gặp: hạ bậc mà quên nhân hệ số (ra ${poly([[a, 1], [b, 0]])}), hoặc giữ nguyên hằng số ${neg(c)} trong kết quả.`,
      steps: [`(ax²)′ = 2ax ⇒ ${fmt(2 * a)}x`, `(bx)′ = ${neg(b)}`, `(hằng số)′ = 0`, `f′(x) = ${correct}`],
      hint: 'Đạo hàm của hằng số bằng 0; với xⁿ thì nhân hệ số với n rồi giảm số mũ đi 1.',
      tags: ['đạo hàm', 'đa thức'],
    };
  }

  if (lvl === 1) {
    const a = nzc(1, 6);
    const b = nzc(-8, 8);
    const c = nzc(-9, 9);
    const d = ri(r, -10, 10);
    const correct = poly([[3 * a, 2], [2 * b, 1], [c, 0]]);
    return {
      stem: `Tính đạo hàm của hàm số f(x) = ${poly([[a, 3], [b, 2], [c, 1], [d, 0]])}.`,
      correct: `f′(x) = ${correct}`,
      distractors: td(`f′(x) = ${correct}`, [
        `f′(x) = ${poly([[a, 2], [b, 1], [c, 0]])}`,
        `f′(x) = ${poly([[3 * a, 2], [2 * b, 1], [c + d, 0]])}`,
        `f′(x) = ${poly([[3 * a, 2], [b, 1], [c, 0]])}`,
        `f′(x) = ${poly([[2 * a, 2], [2 * b, 1], [c, 0]])}`,
        `f′(x) = ${poly([[3 * a, 3], [2 * b, 2], [c, 1]])}`,
      ]),
      solution: `Đạo hàm từng hạng tử theo quy tắc (xⁿ)′ = n·xⁿ⁻¹: (${poly([[a, 3]])})′ = ${fmt(3 * a)}x²; (${poly([[b, 2]])})′ = ${fmt(2 * b)}x; (${poly([[c, 1]])})′ = ${neg(c)}; (${neg(d)})′ = 0. Vậy f′(x) = ${correct}. Chỉ hạ bậc mà quên nhân hệ số sẽ cho ${poly([[a, 2], [b, 1], [c, 0]])} — sai ở cả hai hạng tử đầu.`,
      steps: [
        `(${poly([[a, 3]])})′ = ${fmt(3 * a)}x²`,
        `(${poly([[b, 2]])})′ = ${fmt(2 * b)}x`,
        `(${poly([[c, 1]])})′ = ${neg(c)}, (hằng số)′ = 0`,
        `f′(x) = ${correct}`,
      ],
      hint: 'Nhân hệ số với số mũ CŨ rồi mới giảm số mũ đi 1.',
      tags: ['đạo hàm', 'đa thức bậc ba'],
    };
  }

  // lvl 2: bậc bốn + tính giá trị đạo hàm tại một điểm ⇒ hai bước.
  const a = nzc(1, 4);
  const b = nzc(-6, 6);
  const c = nzc(-8, 8);
  const d = ri(r, -9, 9);
  const x0 = ri(r, -3, 3);
  const der = 4 * a * ipow(x0, 3) + 3 * b * ipow(x0, 2) + 2 * c * x0;
  const derPoly = poly([[4 * a, 3], [3 * b, 2], [2 * c, 1]]);
  const fx = a * ipow(x0, 4) + b * ipow(x0, 3) + c * ipow(x0, 2) + d * x0;

  if (slot % 2 === 0) {
    return {
      stem: `Cho hàm số f(x) = ${poly([[a, 4], [b, 3], [c, 2], [d, 0]])}. Tính f′(${neg(x0)}).`,
      correct: fmt(der),
      numeric: der,
      distractors: nd(der, [fx, der + d, a * ipow(x0, 3) + b * ipow(x0, 2) + c * x0, der - 2 * c * x0, der * 2, der + 1]),
      solution: `Bước 1 — đạo hàm: f′(x) = ${derPoly} (hằng số ${neg(d)} biến mất). Bước 2 — thay x = ${neg(x0)}: f′(${neg(x0)}) = ${fmt(4 * a)}·${fmt(ipow(x0, 3))} + ${fmt(3 * b)}·${fmt(ipow(x0, 2))} + ${fmt(2 * c)}·${neg(x0)} = ${fmt(4 * a * ipow(x0, 3))} + ${fmt(3 * b * ipow(x0, 2))} + ${fmt(2 * c * x0)} = ${fmt(der)}. Thay vào hàm số gốc thay vì đạo hàm là bẫy chính, cho ${fmt(fx)}.`,
      steps: [`f′(x) = ${derPoly}`, `Thay x = ${neg(x0)}`, `f′(${neg(x0)}) = ${fmt(der)}`],
      hint: 'Đạo hàm trước rồi mới thay số — đừng thay số vào hàm gốc.',
      tags: ['đạo hàm', 'giá trị đạo hàm', 'nhiều bước'],
    };
  }

  return {
    stem: `Tính đạo hàm của hàm số f(x) = ${poly([[a, 4], [b, 3], [c, 2], [d, 0]])}.`,
    correct: `f′(x) = ${derPoly}`,
    distractors: td(`f′(x) = ${derPoly}`, [
      `f′(x) = ${poly([[a, 3], [b, 2], [c, 1]])}`,
      `f′(x) = ${poly([[4 * a, 3], [3 * b, 2], [2 * c, 1], [d, 0]])}`,
      `f′(x) = ${poly([[4 * a, 3], [b, 2], [c, 1]])}`,
      `f′(x) = ${poly([[3 * a, 3], [2 * b, 2], [c, 1]])}`,
      `f′(x) = ${poly([[4 * a, 4], [3 * b, 3], [2 * c, 2]])}`,
    ]),
    solution: `Đạo hàm từng hạng tử: (${poly([[a, 4]])})′ = ${fmt(4 * a)}x³; (${poly([[b, 3]])})′ = ${fmt(3 * b)}x²; (${poly([[c, 2]])})′ = ${fmt(2 * c)}x; đạo hàm hằng số ${neg(d)} bằng 0. Vậy f′(x) = ${derPoly}. Giữ lại hằng số trong đáp án là lỗi hay gặp — hằng số không đổi theo x nên tốc độ biến thiên của nó bằng 0.`,
    steps: [
      `(${poly([[a, 4]])})′ = ${fmt(4 * a)}x³`,
      `(${poly([[b, 3]])})′ = ${fmt(3 * b)}x²`,
      `(${poly([[c, 2]])})′ = ${fmt(2 * c)}x, (hằng số)′ = 0`,
      `f′(x) = ${derPoly}`,
    ],
    hint: 'Đạo hàm của số hạng tự do luôn bằng 0.',
    tags: ['đạo hàm', 'đa thức bậc bốn'],
  };
}

export const ADVANCED_MATH_GENERATORS: Record<string, Gen> = {
  gSystemEq,
  gArithSeq,
  gGeoSeq,
  gLog,
  gTrig,
  gDeriv,
};
