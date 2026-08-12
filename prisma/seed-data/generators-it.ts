/**
 * BỘ SINH TIN HỌC — dùng chung cho cả bốn khối A, B, C, D.
 *
 * Bốn bộ sinh: hệ đếm, phép toán logic, đếm số lần lặp, đếm số phép so sánh
 * của thuật toán.
 *
 * ĐỘ KHÓ TĂNG THEO `params.lvl` (1 → 4 tương ứng khối A → D) chứ không theo
 * `ctx.lvl` như các môn khác: cùng một kỹ năng "đổi hệ đếm" nhưng học sinh
 * lớp 3 làm với số 4 bit còn lớp 12 làm với số 8 bit và cả hệ thập lục phân.
 *
 * Mã giả viết bằng TIẾNG VIỆT có cấu trúc, không dùng cú pháp của một ngôn
 * ngữ lập trình cụ thể — đúng chuẩn đề thi Tin học phổ thông và tránh việc
 * học sinh phải biết Python hay Pascal mới làm được bài.
 *
 * File này KHÔNG import gì từ `src/` (tsx không đọc `paths` của tsconfig).
 */
import type { Draft, Gen, GenCtx } from './generators';
import { fmt, nd, pick, pnum, ri, td } from './generators';

// ===========================================================================
// TIỆN ÍCH
// ===========================================================================

/** Mức độ theo khối lớp: 1 = khối A (lớp 3–5) … 4 = khối D (lớp 10–12). */
function band(ctx: GenCtx): number {
  return Math.min(4, Math.max(1, Math.round(pnum(ctx, 'lvl', 2))));
}

/** Đổi số nguyên dương sang chuỗi nhị phân, có thể đệm 0 cho đủ số bit. */
function toBin(n: number, pad = 0): string {
  const s = n.toString(2);
  return s.length >= pad ? s : '0'.repeat(pad - s.length) + s;
}

/** Đổi sang thập lục phân, viết hoa như quy ước trong sách giáo khoa. */
function toHex(n: number): string {
  return n.toString(16).toUpperCase();
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
/** Chỉ số trên: 5 → "⁵" (viết trọng số 2⁵ đúng kiểu sách giáo khoa). */
function sup(n: number): string {
  return String(n)
    .split('')
    .map((c) => SUP[Number(c)])
    .join('');
}

/** Đảo một bit bất kỳ của chuỗi nhị phân — nhiễu "đọc nhầm một chữ số". */
function flipBit(bits: string, idx: number): string {
  const arr = bits.split('');
  arr[idx] = arr[idx] === '0' ? '1' : '0';
  return arr.join('');
}

// ===========================================================================
// 1. HỆ ĐẾM
// ===========================================================================

function gBinConv(ctx: GenCtx): Draft {
  const { r, slot } = ctx;
  const lvl = band(ctx);
  const dir = typeof ctx.params.dir === 'string' ? ctx.params.dir : 'b2d';
  const bits = lvl <= 1 ? 4 : lvl === 2 ? 5 : lvl === 3 ? 6 : 8;
  const max = Math.pow(2, bits) - 1;
  const value = ri(r, lvl <= 1 ? 5 : 20, max);
  const binary = toBin(value, bits);

  if (dir === 'd2h') {
    const hex = toHex(value);
    const correct = `${hex}₁₆`;
    return {
      stem: `Đổi số ${value} trong hệ thập phân sang hệ thập lục phân (hệ 16).`,
      correct,
      distractors: td(correct, [
        // Quên đổi số dư 10–15 thành A–F nên ghép thẳng các chữ số thập phân.
        `${Math.floor(value / 16)}${value % 16}₁₆`,
        // Nhầm sang hệ bát phân (chia cho 8) — lỗi hay gặp khi học nhiều hệ đếm.
        `${value.toString(8)}₁₆`,
        `${toHex(value + 1)}₁₆`,
        `${toHex(value - 1)}₁₆`,
        `${toHex(value * 2)}₁₆`,
        `${toBin(value)}₁₆`,
      ]),
      solution: `Chia liên tiếp cho 16 rồi lấy các số dư viết NGƯỢC từ dưới lên: ${(() => {
        const lines: string[] = [];
        let v = value;
        while (v > 0) {
          lines.push(`${v} : 16 = ${Math.floor(v / 16)} dư ${v % 16} (${toHex(v % 16)})`);
          v = Math.floor(v / 16);
        }
        return lines.join('; ');
      })()}. Đọc các số dư từ dưới lên được ${hex}₁₆. Kiểm tra ngược: ${hex
        .split('')
        .map((c, i) => `${parseInt(c, 16)}×16${sup(hex.length - 1 - i)}`)
        .join(' + ')} = ${value}. Nhớ rằng các số dư 10–15 phải viết thành A–F, viết thẳng số 10 sẽ gây nhầm lẫn.`,
      steps: [`Chia liên tiếp ${value} cho 16`, `Lấy số dư đọc ngược từ dưới lên`, `${value}₁₀ = ${hex}₁₆`],
      hint: 'Chia liên tiếp cho 16, số dư 10–15 viết thành A–F, rồi đọc ngược.',
      tags: ['hệ đếm', 'thập lục phân'],
    };
  }

  if (dir === 'd2b') {
    const correct = `${binary}₂`;
    const wrong = toBin(value).split('').reverse().join('');
    return {
      stem: `Đổi số ${value} trong hệ thập phân sang hệ nhị phân (biểu diễn bằng ${bits} bit).`,
      correct,
      distractors: td(correct, [
        `${toBin(value + 1, bits)}₂`,
        `${wrong.padStart(bits, '0')}₂`,
        `${toBin(value - 1, bits)}₂`,
        `${toBin(Math.floor(value / 2), bits)}₂`,
        `${flipBit(binary, bits - 1)}₂`,
        `${flipBit(binary, 0)}₂`,
      ]),
      solution: `Cách 1 — chia liên tiếp cho 2 rồi đọc số dư NGƯỢC từ dưới lên: ${(() => {
        const lines: string[] = [];
        let v = value;
        while (v > 0) {
          lines.push(`${v} : 2 = ${Math.floor(v / 2)} dư ${v % 2}`);
          v = Math.floor(v / 2);
        }
        return lines.join('; ');
      })()} ⇒ ${binary}₂. Cách 2 — phân tích thành tổng các lũy thừa của 2: ${value} = ${binary
        .split('')
        .map((b, i) => (b === '1' ? Math.pow(2, bits - 1 - i) : 0))
        .filter((x) => x > 0)
        .join(' + ')}. Lỗi kinh điển là đọc số dư XUÔI từ trên xuống, cho kết quả đảo ngược ${wrong.padStart(bits, '0')}₂.`,
      steps: [`Chia liên tiếp ${value} cho 2`, `Đọc các số dư từ dưới lên`, `${value}₁₀ = ${binary}₂`],
      hint: 'Chia liên tiếp cho 2 và đọc số dư từ DƯỚI LÊN, không phải từ trên xuống.',
      tags: ['hệ đếm', 'nhị phân'],
    };
  }

  // --- dir = 'b2d': nhị phân sang thập phân ---
  const expand = binary
    .split('')
    .map((b, i) => ({ b, w: Math.pow(2, bits - 1 - i) }))
    .filter((x) => x.b === '1');
  // Chỉ ghi tổng ở cuối khi có từ hai hạng tử trở lên, tránh dòng "32 = 32".
  const terms = expand.map((x) => `1×2${sup(Math.log2(x.w))}`).join(' + ');
  const detail = expand.length > 1 ? `${terms} = ${expand.map((x) => x.w).join(' + ')} = ${value}` : `${terms} = ${value}`;
  const sumWrong = binary.split('').reduce((a, b) => a + Number(b), 0);
  const reversed = parseInt(binary.split('').reverse().join(''), 2);

  if (slot % 4 === 3 && lvl >= 3) {
    // So sánh hai số nhị phân: buộc phải đổi cả hai rồi mới kết luận.
    const other = ri(r, 1, max);
    const otherBin = toBin(other, bits);
    if (other !== value) {
      const bigger = value > other ? binary : otherBin;
      const correct = `${bigger}₂`;
      return {
        stem: `Trong hai số nhị phân ${binary}₂ và ${otherBin}₂, số nào có giá trị LỚN HƠN?`,
        correct,
        distractors: td(correct, [
          `${value > other ? otherBin : binary}₂`,
          'Hai số bằng nhau',
          'Không so sánh được vì khác hệ đếm',
          `${toBin(Math.max(value, other) + 1, bits)}₂`,
        ]),
        solution: `Đổi cả hai về hệ thập phân rồi so sánh. ${binary}₂ = ${value} và ${otherBin}₂ = ${other}. Vì ${Math.max(value, other)} > ${Math.min(value, other)} nên số lớn hơn là ${bigger}₂. Mẹo nhanh: với cùng số bit, so sánh từ TRÁI sang phải, bit đầu tiên khác nhau quyết định tất cả — số nào có bit 1 ở vị trí đó thì lớn hơn. Đếm số chữ số 1 để so sánh là sai, vì vị trí của bit quan trọng hơn số lượng.`,
        steps: [`${binary}₂ = ${value}`, `${otherBin}₂ = ${other}`, `Số lớn hơn: ${bigger}₂`],
        hint: 'Cùng số bit thì so từ trái sang, bit khác nhau đầu tiên quyết định.',
        tags: ['hệ đếm', 'so sánh nhị phân'],
      };
    }
  }

  return {
    stem: `Đổi số nhị phân ${binary}₂ sang hệ thập phân.`,
    correct: fmt(value),
    numeric: value,
    distractors: nd(value, [reversed, sumWrong, value + 1, value - 1, value * 2, Math.floor(value / 2)]),
    solution: `Mỗi chữ số nhị phân có trọng số là một lũy thừa của 2, tính từ PHẢI sang trái bắt đầu từ 2⁰. Khai triển: ${detail} = ${value}. Vậy ${binary}₂ = ${value}₁₀. Hai lỗi hay gặp: cộng thẳng các chữ số (ra ${sumWrong}) và đọc chuỗi bit theo chiều ngược lại (ra ${reversed}).`,
    steps: [`Gán trọng số 2⁰, 2¹, 2², … từ phải sang trái`, detail, `${binary}₂ = ${value}₁₀`],
    hint: 'Nhân từng bit với trọng số 2 lũy thừa vị trí, đếm vị trí từ phải sang.',
    tags: ['hệ đếm', 'nhị phân'],
  };
}

// ===========================================================================
// 2. PHÉP TOÁN LOGIC
// ===========================================================================

function gLogicEval(ctx: GenCtx): Draft {
  const { r, slot } = ctx;
  const lvl = band(ctx);
  const vn = (b: boolean): string => (b ? 'ĐÚNG' : 'SAI');

  if (lvl <= 1) {
    // Biểu thức một phép toán, phát biểu bằng ngôn ngữ đời thường.
    const a = r() < 0.5;
    const b = r() < 0.5;
    const op = pick(r, ['VÀ', 'HOẶC'] as const);
    const val = op === 'VÀ' ? a && b : a || b;
    return {
      stem: `Cho hai mệnh đề: P = ${vn(a)} và Q = ${vn(b)}. Giá trị của biểu thức "P ${op} Q" là gì?`,
      correct: vn(val),
      distractors: td(vn(val), [vn(!val), 'Không xác định', 'Vừa đúng vừa sai']),
      solution: `Phép ${op} cho kết quả ${
        op === 'VÀ'
          ? 'ĐÚNG khi và chỉ khi CẢ HAI mệnh đề đều đúng'
          : 'ĐÚNG khi có ÍT NHẤT MỘT mệnh đề đúng'
      }. Ở đây P = ${vn(a)}, Q = ${vn(b)}, nên "P ${op} Q" = ${vn(val)}. Cách nhớ: VÀ giống như hai điều kiện phải thỏa đồng thời (vừa đủ tuổi VÀ vừa đủ điểm mới trúng tuyển); HOẶC chỉ cần một điều kiện là đủ.`,
      steps: [`P = ${vn(a)}, Q = ${vn(b)}`, `Phép ${op}`, `Kết quả: ${vn(val)}`],
      hint: op === 'VÀ' ? 'Phép VÀ chỉ đúng khi cả hai đều đúng.' : 'Phép HOẶC đúng khi có ít nhất một vế đúng.',
      tags: ['logic', 'phép toán cơ bản'],
    };
  }

  const a = r() < 0.5;
  const b = r() < 0.5;
  const c = r() < 0.5;

  if (slot % 3 === 2) {
    // Đếm số dòng ĐÚNG trong bảng chân trị — kiểm tra hiểu toàn cục.
    const form = pick(r, ['and-or', 'or-and', 'imp'] as const);
    let count = 0;
    const rows: string[] = [];
    for (const x of [true, false]) {
      for (const y of [true, false]) {
        for (const z of [true, false]) {
          const v =
            form === 'and-or' ? (x && y) || z : form === 'or-and' ? (x || y) && z : !x || (y && z);
          if (v) count++;
          rows.push(`${vn(x)[0]}${vn(y)[0]}${vn(z)[0]}→${v ? 'Đ' : 'S'}`);
        }
      }
    }
    const expr =
      form === 'and-or' ? '(P VÀ Q) HOẶC R' : form === 'or-and' ? '(P HOẶC Q) VÀ R' : '(KHÔNG P) HOẶC (Q VÀ R)';
    return {
      stem: `Lập bảng chân trị cho biểu thức ${expr} với ba biến logic P, Q, R. Bảng có bao nhiêu dòng cho kết quả ĐÚNG?`,
      correct: `${count} dòng`,
      distractors: td(`${count} dòng`, [
        `${8 - count} dòng`,
        `${count + 1} dòng`,
        `${Math.max(0, count - 1)} dòng`,
        '4 dòng',
        '8 dòng',
      ]),
      solution: `Ba biến logic cho 2³ = 8 tổ hợp giá trị. Lập bảng đầy đủ (viết tắt Đ/S theo thứ tự P, Q, R): ${rows.join('; ')}. Đếm được ${count} dòng cho kết quả ĐÚNG trong tổng số 8 dòng. Sai lầm hay gặp là bỏ sót tổ hợp: phải đủ 8 dòng, không phải 4 — mỗi biến thêm vào làm số dòng NHÂN ĐÔI.`,
      steps: [`3 biến ⇒ 2³ = 8 dòng`, `Tính giá trị từng dòng`, `Có ${count} dòng ĐÚNG`],
      hint: 'n biến logic cho 2ⁿ dòng; liệt kê đủ rồi mới đếm.',
      tags: ['logic', 'bảng chân trị'],
    };
  }

  if (lvl >= 3 && slot % 3 === 1) {
    // Có phủ định và thứ tự ưu tiên — nguồn sai lầm chính ở mức nâng cao.
    const val = (!a && b) || c;
    const wrongPriority = !(a && b) || c;
    return {
      stem: `Cho P = ${vn(a)}, Q = ${vn(b)}, R = ${vn(c)}. Tính giá trị của biểu thức ((KHÔNG P) VÀ Q) HOẶC R.`,
      correct: vn(val),
      distractors: td(vn(val), [vn(!val), 'Không xác định', `${vn(wrongPriority)} vì phủ định áp cho cả ngoặc`]),
      solution: `Tính theo thứ tự ưu tiên KHÔNG → VÀ → HOẶC, ngoặc tính trước. Bước 1: KHÔNG P = KHÔNG ${vn(a)} = ${vn(!a)}. Bước 2: (KHÔNG P) VÀ Q = ${vn(!a)} VÀ ${vn(b)} = ${vn(!a && b)}. Bước 3: kết quả HOẶC R = ${vn(!a && b)} HOẶC ${vn(c)} = ${vn(val)}. Lỗi thường gặp là cho phủ định áp lên cả cụm (P VÀ Q), khi đó kết quả sẽ là ${vn(wrongPriority)} — dấu ngoặc quyết định phạm vi của phép KHÔNG.`,
      steps: [`KHÔNG P = ${vn(!a)}`, `(KHÔNG P) VÀ Q = ${vn(!a && b)}`, `… HOẶC R = ${vn(val)}`],
      hint: 'Thứ tự ưu tiên: KHÔNG trước, rồi VÀ, cuối cùng mới HOẶC.',
      tags: ['logic', 'thứ tự ưu tiên'],
    };
  }

  const val = (a && b) || c;
  const wrong = a && (b || c);
  return {
    stem: `Cho ba mệnh đề P = ${vn(a)}, Q = ${vn(b)}, R = ${vn(c)}. Tính giá trị của biểu thức (P VÀ Q) HOẶC R.`,
    correct: vn(val),
    distractors: td(vn(val), [vn(!val), 'Không xác định', `${vn(wrong)} vì tính HOẶC trước`]),
    solution: `Ngoặc tính trước: P VÀ Q = ${vn(a)} VÀ ${vn(b)} = ${vn(a && b)} (phép VÀ chỉ đúng khi cả hai vế đều đúng). Sau đó lấy kết quả HOẶC R: ${vn(a && b)} HOẶC ${vn(c)} = ${vn(val)} (phép HOẶC đúng khi ít nhất một vế đúng). Nếu bỏ ngoặc và tính HOẶC trước, biểu thức thành P VÀ (Q HOẶC R) = ${vn(wrong)} — khác kết quả đúng, cho thấy dấu ngoặc không hề thừa.`,
    steps: [`P VÀ Q = ${vn(a && b)}`, `(P VÀ Q) HOẶC R = ${vn(val)}`],
    hint: 'Tính trong ngoặc trước; VÀ cần cả hai đúng, HOẶC chỉ cần một.',
    tags: ['logic', 'biểu thức phức hợp'],
  };
}

// ===========================================================================
// 3. ĐẾM SỐ LẦN LẶP
// ===========================================================================

function gLoopCount(ctx: GenCtx): Draft {
  const { r, slot } = ctx;
  const lvl = band(ctx);

  if (lvl <= 1) {
    const from = ri(r, 1, 5);
    const to = from + ri(r, 4, 15);
    const count = to - from + 1;
    return {
      stem: `Cho đoạn mã giả sau:\n\n  cho i từ ${from} đến ${to}:\n      in ra i\n\nLệnh "in ra i" được thực hiện bao nhiêu lần?`,
      correct: `${count} lần`,
      numeric: count,
      distractors: td(`${count} lần`, [
        `${to - from} lần`,
        `${to} lần`,
        `${count + 1} lần`,
        `${from} lần`,
        `${count * 2} lần`,
      ]),
      solution: `Vòng lặp chạy với i lần lượt nhận các giá trị ${from}, ${from + 1}, …, ${to}. Số giá trị đếm được bằng ${to} − ${from} + 1 = ${count}. Đây chính là bài toán "trồng cây có cả hai đầu": phải CỘNG 1 vì cả giá trị đầu lẫn giá trị cuối đều được chạy. Quên cộng 1 (trả lời ${to - from}) là lỗi phổ biến nhất khi đếm vòng lặp.`,
      steps: [`i nhận giá trị từ ${from} đến ${to}`, `Số lần = ${to} − ${from} + 1`, `= ${count} lần`],
      hint: 'Đếm cả hai đầu: lấy hiệu rồi CỘNG 1.',
      tags: ['vòng lặp', 'đếm số lần lặp'],
    };
  }

  if (lvl === 2 || (lvl >= 3 && slot % 3 === 0)) {
    // Vòng lặp có bước nhảy khác 1.
    const from = ri(r, 1, 6);
    const step = pick(r, [2, 3, 4, 5]);
    const times = ri(r, 5, 14);
    const to = from + step * (times - 1) + ri(r, 0, step - 1);
    const count = Math.floor((to - from) / step) + 1;
    return {
      stem: `Cho đoạn mã giả sau:\n\n  cho i từ ${from} đến ${to} bước ${step}:\n      tổng ← tổng + i\n\nLệnh "tổng ← tổng + i" được thực hiện bao nhiêu lần?`,
      correct: `${count} lần`,
      numeric: count,
      distractors: td(`${count} lần`, [
        `${to - from + 1} lần`,
        `${Math.floor((to - from) / step)} lần`,
        `${Math.floor(to / step)} lần`,
        `${count + 1} lần`,
        `${count - 1} lần`,
      ]),
      solution: `Biến i nhận các giá trị ${from}, ${from + step}, ${from + 2 * step}, … cách nhau ${step} đơn vị và không vượt quá ${to}. Giá trị lớn nhất đạt được là ${from + (count - 1) * step}. Số lần lặp = (giá trị cuối − giá trị đầu) : bước + 1 = (${from + (count - 1) * step} − ${from}) : ${step} + 1 = ${count}. Quên bước nhảy mà đếm như bước 1 sẽ ra ${to - from + 1} lần — sai gấp khoảng ${step} lần.`,
      steps: [
        `i = ${from}, ${from + step}, …, ${from + (count - 1) * step}`,
        `Số lần = (${from + (count - 1) * step} − ${from}) : ${step} + 1`,
        `= ${count} lần`,
      ],
      hint: 'Chia khoảng cách cho BƯỚC NHẢY rồi cộng 1.',
      tags: ['vòng lặp', 'bước nhảy'],
    };
  }

  if (slot % 3 === 1) {
    // Vòng lặp lồng nhau — tích số lần, không phải tổng.
    const n = ri(r, 3, 9);
    const m = ri(r, 3, 9);
    const count = n * m;
    return {
      stem: `Cho đoạn mã giả sau:\n\n  cho i từ 1 đến ${n}:\n      cho j từ 1 đến ${m}:\n          đếm ← đếm + 1\n\nSau khi chạy xong, biến "đếm" có giá trị bằng bao nhiêu?`,
      correct: fmt(count),
      numeric: count,
      distractors: nd(count, [n + m, n, m, count + 1, (n * m) / 2, n * n]),
      solution: `Với MỖI giá trị của i (có ${n} giá trị), vòng lặp trong chạy trọn ${m} lần. Do đó tổng số lần thực hiện lệnh "đếm ← đếm + 1" là ${n} × ${m} = ${count}. Vòng lặp lồng nhau thì NHÂN số lần chứ không cộng — trả lời ${n + m} là lỗi phổ biến nhất. Hình dung như bảng ${n} hàng × ${m} cột: mỗi ô được ghé thăm đúng một lần.`,
      steps: [`Vòng ngoài: ${n} lần`, `Mỗi lần vòng ngoài, vòng trong chạy ${m} lần`, `Tổng = ${n} × ${m} = ${count}`],
      hint: 'Vòng lặp lồng nhau thì nhân số lần lặp của các vòng.',
      tags: ['vòng lặp', 'vòng lặp lồng nhau'],
    };
  }

  // Vòng while chia đôi — chuẩn bị cho khái niệm logarit và tìm kiếm nhị phân.
  const k = ri(r, 4, lvl >= 4 ? 10 : 7);
  const start = Math.pow(2, k);
  return {
    stem: `Cho đoạn mã giả sau:\n\n  n ← ${start}\n  đếm ← 0\n  trong khi n > 1:\n      n ← n : 2\n      đếm ← đếm + 1\n\nSau khi chạy xong, biến "đếm" có giá trị bằng bao nhiêu?`,
    correct: fmt(k),
    numeric: k,
    distractors: nd(k, [start / 2, k + 1, k - 1, start, Math.floor(start / k)]),
    solution: `Mỗi vòng lặp chia n cho 2, dãy giá trị của n là ${Array.from({ length: k + 1 }, (_, i) => start / Math.pow(2, i)).join(' → ')}. Vòng lặp dừng khi n = 1, tức đã chia ${k} lần. Nói cách khác, số lần lặp chính là số mũ trong ${start} = 2${sup(k)}, hay log₂${start} = ${k}. Đây là lý do các thuật toán chia đôi (tìm kiếm nhị phân) chạy rất nhanh: dữ liệu tăng gấp đôi thì số bước chỉ tăng thêm 1.`,
    steps: [`n: ${start} → … → 1`, `${start} = 2${sup(k)}`, `Số lần lặp = ${k}`],
    hint: 'Đếm xem phải chia đôi bao nhiêu lần thì về 1 — đó là log cơ số 2.',
    tags: ['vòng lặp', 'thuật toán chia đôi'],
  };
}

// ===========================================================================
// 4. ĐẾM SỐ PHÉP SO SÁNH CỦA THUẬT TOÁN
// ===========================================================================

function gAlgoSteps(ctx: GenCtx): Draft {
  const { r, slot } = ctx;
  const lvl = band(ctx);
  const n = lvl <= 1 ? ri(r, 5, 12) : lvl === 2 ? ri(r, 8, 20) : ri(r, 10, 40);

  if (lvl <= 1 || slot % 3 === 0) {
    // Tìm giá trị lớn nhất: n − 1 phép so sánh, bài toán nền tảng.
    const count = n - 1;
    return {
      stem: `Thuật toán tìm số lớn nhất trong dãy ${n} số hoạt động như sau: lấy số đầu tiên làm giá trị lớn nhất tạm thời, rồi lần lượt so sánh với từng số còn lại. Thuật toán thực hiện bao nhiêu phép so sánh?`,
      correct: `${count} phép so sánh`,
      numeric: count,
      distractors: td(`${count} phép so sánh`, [
        `${n} phép so sánh`,
        `${n + 1} phép so sánh`,
        `${(n * (n - 1)) / 2} phép so sánh`,
        `${count - 1} phép so sánh`,
        `${n * n} phép so sánh`,
      ]),
      solution: `Số đầu tiên được lấy làm mốc mà KHÔNG cần so sánh với ai. Mỗi số trong ${n} − 1 = ${count} số còn lại được đem so sánh đúng một lần với giá trị lớn nhất tạm thời. Vậy tổng cộng ${count} phép so sánh. Trả lời ${n} là quên rằng phần tử đầu tiên chỉ đóng vai trò khởi tạo. Nhận xét: số phép so sánh tăng TUYẾN TÍNH theo n, nên dãy dài gấp đôi thì thời gian chạy cũng chỉ tăng gấp đôi.`,
      steps: [`Lấy số đầu làm mốc (0 phép so sánh)`, `So sánh ${count} số còn lại`, `Tổng = ${count} phép so sánh`],
      hint: 'Phần tử đầu tiên chỉ để khởi tạo, không tính là một phép so sánh.',
      tags: ['thuật toán', 'độ phức tạp'],
    };
  }

  if (slot % 3 === 1) {
    // Tìm kiếm tuần tự trường hợp xấu nhất.
    const count = n;
    return {
      stem: `Thuật toán tìm kiếm tuần tự duyệt lần lượt từng phần tử của một dãy ${n} số để tìm giá trị x. Trong TRƯỜNG HỢP XẤU NHẤT (x không có trong dãy), thuật toán thực hiện bao nhiêu phép so sánh?`,
      correct: `${count} phép so sánh`,
      numeric: count,
      distractors: td(`${count} phép so sánh`, [
        `${n - 1} phép so sánh`,
        `${Math.ceil(n / 2)} phép so sánh`,
        `1 phép so sánh`,
        `${(n * (n - 1)) / 2} phép so sánh`,
        `${Math.ceil(Math.log2(n))} phép so sánh`,
      ]),
      solution: `Trường hợp xấu nhất là khi phải duyệt hết dãy mà vẫn không tìm thấy: mỗi phần tử trong ${n} phần tử đều được so sánh với x đúng một lần, tổng cộng ${n} phép so sánh. Phân biệt ba trường hợp: tốt nhất 1 phép (x nằm ngay đầu dãy), trung bình khoảng ${Math.ceil(n / 2)} phép, xấu nhất ${n} phép. Nếu dãy đã được SẮP XẾP thì dùng tìm kiếm nhị phân chỉ cần khoảng ${Math.ceil(Math.log2(n))} phép so sánh — nhanh hơn hẳn.`,
      steps: [`Xấu nhất: duyệt hết dãy`, `Mỗi phần tử so sánh 1 lần`, `Tổng = ${n} phép so sánh`],
      hint: 'Xấu nhất nghĩa là phải xét hết mọi phần tử mới kết luận.',
      tags: ['thuật toán', 'tìm kiếm tuần tự'],
    };
  }

  // Sắp xếp nổi bọt: n(n−1)/2 phép so sánh.
  const count = (n * (n - 1)) / 2;
  return {
    stem: `Thuật toán sắp xếp nổi bọt trên dãy ${n} số so sánh mỗi cặp phần tử đúng một lần. Tổng số phép so sánh mà thuật toán thực hiện là bao nhiêu?`,
    correct: `${count} phép so sánh`,
    numeric: count,
    distractors: td(`${count} phép so sánh`, [
      `${n * n} phép so sánh`,
      `${n - 1} phép so sánh`,
      `${n * (n - 1)} phép so sánh`,
      `${n} phép so sánh`,
      `${count + n} phép so sánh`,
    ]),
    solution: `Lượt đầu so sánh ${n - 1} cặp, lượt hai so sánh ${n - 2} cặp, … lượt cuối so sánh 1 cặp. Tổng cộng: ${n - 1} + ${n - 2} + … + 1 = ${n}×${n - 1} : 2 = ${count} phép so sánh. Đây cũng chính là số cách chọn 2 phần tử từ ${n} phần tử. Quên chia 2 (trả lời ${n * (n - 1)}) là lỗi phổ biến nhất — mỗi cặp chỉ được đếm MỘT lần, không phải hai. Nhận xét quan trọng: số phép so sánh tăng theo BÌNH PHƯƠNG của n, nên dãy dài gấp đôi thì thời gian chạy tăng khoảng bốn lần.`,
    steps: [
      `Lượt 1: ${n - 1} phép; lượt 2: ${n - 2} phép; …; lượt cuối: 1 phép`,
      `Tổng = 1 + 2 + … + ${n - 1}`,
      `= ${n}×${n - 1} : 2 = ${count} phép so sánh`,
    ],
    hint: 'Tổng 1 + 2 + … + (n−1) bằng n(n−1) chia 2.',
    tags: ['thuật toán', 'sắp xếp nổi bọt', 'độ phức tạp'],
  };
}

export const IT_GENERATORS: Record<string, Gen> = {
  gBinConv,
  gLogicEval,
  gLoopCount,
  gAlgoSteps,
};
