/**
 * BỘ SINH CÂU HỎI: chu vi – diện tích – thể tích (chương AREA của Toán khối 6–7).
 *
 * Hai lỗi sai kinh điển của chương này được cài sẵn làm phương án nhiễu ở MỌI câu:
 *   1. Quên chia 2 (tam giác, hình thang).
 *   2. Đổi đơn vị diện tích theo tỉ lệ của độ dài (chia 100 thay vì 10 000).
 * Ngoài ra còn bẫy nhầm chu vi với diện tích.
 *
 * File này KHÔNG import gì từ `src/` (tsx không đọc `paths` của tsconfig).
 */
import type { Draft, Gen, GenCtx } from './generators';
import { fmt, ri, roundDec, sc, td } from './generators';

/** Ghép giá trị với đơn vị — đáp án đo lường bắt buộc mang đơn vị. */
function uv(v: number, unit: string): string {
  return `${fmt(roundDec(v, 4))} ${unit}`;
}

/** Lọc nhiễu dạng "số + đơn vị", đệm thêm nếu chưa đủ 3 phương án khác nhau. */
function ud(correct: string, cands: [number, string][], pad: [number, string]): string[] {
  const out = td(
    correct,
    cands
      .filter(([v]) => Number.isFinite(v) && v > 0)
      .map(([v, unit]) => uv(v, unit)),
  );
  for (const k of [2, 0.5, 10, 0.1, 4, 0.25]) {
    if (out.length >= 3) break;
    const t = uv(roundDec(pad[0] * k, 4), pad[1]);
    if (t !== correct && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Cạnh nguyên, đã áp hệ số thu nhỏ khi bộ sinh dùng lại cho khối lớp nhỏ hơn. */
function side(ctx: GenCtx, lo: number, hi: number): number {
  return Math.max(2, Math.round(ri(ctx.r, lo, hi) * sc(ctx)));
}

// ---------------------------------------------------------------------------

function AREA01(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    if (slot % 2 === 0) {
      const a = side(ctx, 8, 25);
      const b = side(ctx, 3, 7);
      const val = a * b;
      const chuVi = 2 * (a + b);
      return {
        stem: `Một hình chữ nhật có chiều dài ${a} cm và chiều rộng ${b} cm. Tính diện tích hình chữ nhật đó.`,
        correct: uv(val, 'cm²'),
        numeric: val,
        distractors: ud(
          uv(val, 'cm²'),
          [
            [chuVi, 'cm²'],
            [a + b, 'cm²'],
            [val / 2, 'cm²'],
            [2 * val, 'cm²'],
          ],
          [val, 'cm²'],
        ),
        solution: `Diện tích hình chữ nhật bằng chiều dài nhân chiều rộng: S = ${a} × ${b} = ${val} (cm²). Đáp án ${fmt(chuVi)} cm² là CHU VI, tính bằng 2 × (${a} + ${b}) — nhầm chu vi với diện tích là lỗi phổ biến nhất ở chương này. Nhớ rằng chu vi đo bằng cm, diện tích đo bằng cm².`,
        steps: [`S = a × b`, `S = ${a} × ${b} = ${val} cm²`],
        hint: 'Diện tích hình chữ nhật bằng chiều dài nhân chiều rộng.',
        tags: ['diện tích', 'hình chữ nhật'],
      };
    }
    const c = side(ctx, 5, 20);
    const val = 4 * c;
    return {
      stem: `Một hình vuông có cạnh ${c} cm. Tính chu vi hình vuông đó.`,
      correct: uv(val, 'cm'),
      numeric: val,
      distractors: ud(
        uv(val, 'cm'),
        [
          [c * c, 'cm'],
          [2 * c, 'cm'],
          [3 * c, 'cm'],
          [c * c * 2, 'cm'],
        ],
        [val, 'cm'],
      ),
      solution: `Chu vi hình vuông bằng cạnh nhân 4: P = 4 × ${c} = ${val} (cm). Đáp án ${fmt(c * c)} cm là DIỆN TÍCH (cạnh nhân cạnh), không phải chu vi. Lấy 2 × ${c} = ${fmt(2 * c)} cm là chỉ tính hai cạnh, quên rằng hình vuông có bốn cạnh bằng nhau.`,
      steps: [`P = 4 × a`, `P = 4 × ${c} = ${val} cm`],
      hint: 'Chu vi hình vuông bằng cạnh nhân 4.',
      tags: ['chu vi', 'hình vuông'],
    };
  }

  if (lvl === 1) {
    if (slot % 2 === 0) {
      const b = side(ctx, 4, 12);
      const k = ri(r, 2, 4);
      const a = b * k;
      const val = a * b;
      return {
        stem: `Một mảnh vườn hình chữ nhật có chiều rộng ${b} m, chiều dài gấp ${k} lần chiều rộng. Tính diện tích mảnh vườn.`,
        correct: uv(val, 'm²'),
        numeric: val,
        distractors: ud(
          uv(val, 'm²'),
          [
            [2 * (a + b), 'm²'],
            [b * b, 'm²'],
            [a + b, 'm²'],
            [2 * val, 'm²'],
          ],
          [val, 'm²'],
        ),
        solution: `Chiều dài = ${k} × ${b} = ${a} (m). Diện tích = chiều dài × chiều rộng = ${a} × ${b} = ${val} (m²). Nếu bỏ qua bước tìm chiều dài mà lấy luôn ${b} × ${b} sẽ ra ${fmt(b * b)} m² — đó là diện tích hình vuông cạnh ${b} m, không phải mảnh vườn này.`,
        steps: [`Chiều dài = ${k} × ${b} = ${a} m`, `S = ${a} × ${b} = ${val} m²`],
        hint: 'Tìm chiều dài trước, rồi mới nhân với chiều rộng.',
        tags: ['diện tích', 'hình chữ nhật', 'hai bước'],
      };
    }
    const b = side(ctx, 3, 9);
    const a = side(ctx, 10, 20);
    const cm2 = a * b;
    const val = roundDec(cm2 / 10000, 5);
    return {
      stem: `Một tấm bìa hình chữ nhật có chiều dài ${a} cm và chiều rộng ${b} cm. Diện tích tấm bìa bằng bao nhiêu mét vuông?`,
      correct: uv(val, 'm²'),
      numeric: val,
      distractors: ud(
        uv(val, 'm²'),
        [
          [roundDec(cm2 / 100, 5), 'm²'],
          [cm2, 'm²'],
          [roundDec(cm2 / 1000, 5), 'm²'],
          [roundDec((2 * (a + b)) / 10000, 5), 'm²'],
        ],
        [val, 'm²'],
      ),
      solution: `Diện tích = ${a} × ${b} = ${cm2} (cm²). Vì 1 m = 100 cm nên 1 m² = 100 × 100 = 10 000 cm². Do đó ${cm2} cm² = ${cm2} : 10 000 = ${fmt(val)} (m²). Chia cho 100 (ra ${fmt(roundDec(cm2 / 100, 5))} m²) là lỗi kinh điển: 100 là tỉ lệ đổi ĐỘ DÀI, còn diện tích phải dùng bình phương của tỉ lệ đó.`,
      steps: [
        `S = ${a} × ${b} = ${cm2} cm²`,
        `1 m² = 10 000 cm²`,
        `S = ${cm2} : 10 000 = ${fmt(val)} m²`,
      ],
      hint: 'Đổi đơn vị diện tích dùng bình phương của tỉ lệ đổi độ dài.',
      tags: ['diện tích', 'đổi đơn vị'],
    };
  }

  // lvl 2 — suy ngược từ chu vi, hoặc suy ngược từ diện tích
  if (slot % 2 === 0) {
    const b = side(ctx, 4, 12);
    const d = ri(r, 2, 10);
    const a = b + d;
    const chuVi = 2 * (a + b);
    const val = a * b;
    const nua = chuVi / 2;
    return {
      stem: `Một hình chữ nhật có chu vi ${chuVi} cm, chiều dài hơn chiều rộng ${d} cm. Tính diện tích hình chữ nhật đó.`,
      correct: uv(val, 'cm²'),
      numeric: val,
      distractors: ud(
        uv(val, 'cm²'),
        [
          [chuVi, 'cm²'],
          [(chuVi + d) / 2, 'cm²'],
          [a * a, 'cm²'],
          [b * b, 'cm²'],
        ],
        [val, 'cm²'],
      ),
      solution: `Nửa chu vi bằng tổng chiều dài và chiều rộng: ${chuVi} : 2 = ${fmt(nua)} (cm). Biết tổng ${fmt(nua)} cm và hiệu ${d} cm, ta có chiều dài = (${fmt(nua)} + ${d}) : 2 = ${a} (cm), chiều rộng = ${a} − ${d} = ${b} (cm). Diện tích = ${a} × ${b} = ${val} (cm²). Lỗi hay gặp là dùng thẳng CHU VI thay cho nửa chu vi khi áp công thức tổng – hiệu.`,
      steps: [
        `Nửa chu vi = ${chuVi} : 2 = ${fmt(nua)} cm`,
        `Chiều dài = (${fmt(nua)} + ${d}) : 2 = ${a} cm`,
        `Chiều rộng = ${a} − ${d} = ${b} cm`,
        `S = ${a} × ${b} = ${val} cm²`,
      ],
      hint: 'Chia đôi chu vi để có TỔNG hai cạnh, rồi dùng bài toán tổng – hiệu.',
      tags: ['diện tích', 'tổng hiệu', 'nhiều bước'],
    };
  }
  const b = side(ctx, 5, 14);
  const k = ri(r, 2, 3);
  const a = b * k;
  const dt = a * b;
  const val = 2 * (a + b);
  return {
    stem: `Một nền nhà hình chữ nhật có diện tích ${dt} m², chiều dài gấp ${k} lần chiều rộng. Tính chu vi nền nhà.`,
    correct: uv(val, 'm'),
    numeric: val,
    distractors: ud(
      uv(val, 'm'),
      [
        [a + b, 'm'],
        [dt, 'm'],
        [2 * a + b, 'm'],
        [4 * b, 'm'],
      ],
      [val, 'm'],
    ),
    solution: `Gọi chiều rộng là b thì chiều dài là ${k}b, nên diện tích = ${k}b × b = ${k}b² = ${dt}. Suy ra b² = ${dt} : ${k} = ${fmt(b * b)}, do đó b = ${b} (m) và chiều dài = ${k} × ${b} = ${a} (m). Chu vi = 2 × (${a} + ${b}) = ${val} (m). Dừng lại ở ${fmt(a + b)} m là quên nhân 2 — đó mới chỉ là nửa chu vi.`,
    steps: [
      `${k}b² = ${dt} ⇒ b² = ${fmt(b * b)}`,
      `b = ${b} m, chiều dài = ${a} m`,
      `P = 2 × (${a} + ${b}) = ${val} m`,
    ],
    hint: 'Đặt chiều rộng làm ẩn, viết diện tích theo ẩn đó rồi giải ngược.',
    tags: ['chu vi', 'suy luận ngược', 'nhiều bước'],
  };
}

function AREA02(ctx: GenCtx): Draft {
  const { lvl, slot } = ctx;

  if (lvl === 0) {
    if (slot % 2 === 0) {
      const a = side(ctx, 4, 13) * 2; // đáy chẵn ⇒ diện tích ra số nguyên
      const h = side(ctx, 4, 15);
      const val = (a * h) / 2;
      return {
        stem: `Một tam giác có độ dài đáy ${a} cm và chiều cao tương ứng ${h} cm. Tính diện tích tam giác đó.`,
        correct: uv(val, 'cm²'),
        numeric: val,
        distractors: ud(
          uv(val, 'cm²'),
          [
            [a * h, 'cm²'],
            [a + h, 'cm²'],
            [(a + h) / 2, 'cm²'],
            [2 * a * h, 'cm²'],
          ],
          [val, 'cm²'],
        ),
        solution: `Diện tích tam giác = (đáy × chiều cao) : 2 = (${a} × ${h}) : 2 = ${fmt(a * h)} : 2 = ${val} (cm²). Đáp án ${fmt(a * h)} cm² chính là kết quả khi QUÊN CHIA 2 — lỗi số một ở chương này.`,
        steps: [`S = (a × h) : 2`, `S = (${a} × ${h}) : 2 = ${val} cm²`],
        hint: 'Diện tích tam giác phải chia cho 2.',
        tags: ['diện tích', 'tam giác'],
      };
    }
    const a = side(ctx, 6, 18);
    const h = side(ctx, 4, 12);
    const val = a * h;
    return {
      stem: `Một hình bình hành có cạnh đáy ${a} cm và chiều cao tương ứng ${h} cm. Tính diện tích hình bình hành đó.`,
      correct: uv(val, 'cm²'),
      numeric: val,
      distractors: ud(
        uv(val, 'cm²'),
        [
          [val / 2, 'cm²'],
          [2 * (a + h), 'cm²'],
          [a + h, 'cm²'],
          [2 * val, 'cm²'],
        ],
        [val, 'cm²'],
      ),
      solution: `Diện tích hình bình hành = cạnh đáy × chiều cao = ${a} × ${h} = ${val} (cm²). Khác với tam giác, hình bình hành KHÔNG chia 2. Nếu chia 2 sẽ ra ${fmt(val / 2)} cm² — đó là diện tích tam giác có cùng đáy và cùng chiều cao.`,
      steps: [`S = a × h`, `S = ${a} × ${h} = ${val} cm²`],
      hint: 'Hình bình hành không chia 2, khác với tam giác.',
      tags: ['diện tích', 'hình bình hành'],
    };
  }

  if (lvl === 1) {
    if (slot % 2 === 0) {
      const a = side(ctx, 8, 20);
      const b = side(ctx, 4, 7);
      const h = side(ctx, 3, 10) * 2;
      const val = ((a + b) * h) / 2;
      return {
        stem: `Một hình thang có đáy lớn ${a} cm, đáy bé ${b} cm và chiều cao ${h} cm. Tính diện tích hình thang đó.`,
        correct: uv(val, 'cm²'),
        numeric: val,
        distractors: ud(
          uv(val, 'cm²'),
          [
            [(a + b) * h, 'cm²'],
            [((a - b) * h) / 2, 'cm²'],
            [a * h, 'cm²'],
            [(a * b) / 2, 'cm²'],
          ],
          [val, 'cm²'],
        ),
        solution: `Diện tích hình thang = (đáy lớn + đáy bé) × chiều cao : 2 = (${a} + ${b}) × ${h} : 2 = ${fmt(a + b)} × ${h} : 2 = ${fmt((a + b) * h)} : 2 = ${val} (cm²). Quên chia 2 sẽ ra ${fmt((a + b) * h)} cm²; lấy HIỆU hai đáy thay vì tổng sẽ ra ${fmt(((a - b) * h) / 2)} cm².`,
        steps: [
          `S = (a + b) × h : 2`,
          `= (${a} + ${b}) × ${h} : 2`,
          `= ${fmt((a + b) * h)} : 2 = ${val} cm²`,
        ],
        hint: 'Cộng hai đáy trước, nhân chiều cao, rồi mới chia 2.',
        tags: ['diện tích', 'hình thang'],
      };
    }
    const h = side(ctx, 4, 14);
    const val = side(ctx, 4, 13) * 2;
    const dt = (val * h) / 2;
    return {
      stem: `Một tam giác có diện tích ${dt} cm² và chiều cao ${h} cm. Tính độ dài cạnh đáy tương ứng.`,
      correct: uv(val, 'cm'),
      numeric: val,
      distractors: ud(
        uv(val, 'cm'),
        [
          [dt / h, 'cm'],
          [dt - h, 'cm'],
          [(4 * dt) / h, 'cm'],
          [dt / (2 * h), 'cm'],
        ],
        [val, 'cm'],
      ),
      solution: `Từ công thức S = (a × h) : 2 suy ra a = 2 × S : h = 2 × ${dt} : ${h} = ${fmt(2 * dt)} : ${h} = ${val} (cm). Quên NHÂN 2 khi rút ẩn sẽ ra ${fmt(dt / h)} cm — đúng bằng một nửa đáp án đúng.`,
      steps: [`S = (a × h) : 2 ⇒ a = 2S : h`, `a = 2 × ${dt} : ${h} = ${val} cm`],
      hint: 'Rút ẩn từ công thức: đáy bằng hai lần diện tích chia cho chiều cao.',
      tags: ['diện tích', 'tam giác', 'suy luận ngược'],
    };
  }

  // lvl 2 — đổi đơn vị hoặc ghép hai công thức
  if (slot % 2 === 0) {
    const a = side(ctx, 12, 24);
    const b = side(ctx, 6, 11);
    const h = side(ctx, 5, 10) * 2;
    const dt = ((a + b) * h) / 2;
    const val = roundDec(dt / 10000, 5);
    return {
      stem: `Một thửa ruộng hình thang có đáy lớn ${a} m, đáy bé ${b} m và chiều cao ${h} m. Diện tích thửa ruộng bằng bao nhiêu héc-ta? (Biết 1 ha = 10 000 m².)`,
      correct: uv(val, 'ha'),
      numeric: val,
      distractors: ud(
        uv(val, 'ha'),
        [
          [roundDec(dt / 100, 5), 'ha'],
          [roundDec(((a + b) * h) / 10000, 5), 'ha'],
          [dt, 'ha'],
          [roundDec(dt / 1000, 5), 'ha'],
        ],
        [val, 'ha'],
      ),
      solution: `Diện tích = (${a} + ${b}) × ${h} : 2 = ${fmt((a + b) * h)} : 2 = ${dt} (m²). Đổi sang héc-ta: ${dt} : 10 000 = ${fmt(val)} (ha). Hai bẫy: quên chia 2 khi tính hình thang sẽ ra ${fmt(roundDec(((a + b) * h) / 10000, 5))} ha, còn chia nhầm cho 100 sẽ ra ${fmt(roundDec(dt / 100, 5))} ha.`,
      steps: [
        `S = (${a} + ${b}) × ${h} : 2 = ${dt} m²`,
        `1 ha = 10 000 m²`,
        `S = ${dt} : 10 000 = ${fmt(val)} ha`,
      ],
      hint: 'Tính xong diện tích theo m² rồi mới đổi sang héc-ta.',
      tags: ['diện tích', 'hình thang', 'đổi đơn vị', 'nhiều bước'],
    };
  }
  const a = side(ctx, 8, 16);
  const h1 = side(ctx, 5, 12);
  const dt = a * h1;
  const a2 = side(ctx, 3, 8) * 2;
  const val = roundDec((2 * dt) / a2, 3);
  return {
    stem: `Một hình bình hành có cạnh đáy ${a} cm và chiều cao ${h1} cm. Một tam giác có diện tích đúng bằng diện tích hình bình hành đó và có cạnh đáy ${a2} cm. Tính chiều cao của tam giác.`,
    correct: uv(val, 'cm'),
    numeric: val,
    distractors: ud(
      uv(val, 'cm'),
      [
        [roundDec(dt / a2, 3), 'cm'],
        [h1, 'cm'],
        [roundDec(dt / (2 * a2), 3), 'cm'],
        [a2, 'cm'],
      ],
      [val, 'cm'],
    ),
    solution: `Diện tích hình bình hành = ${a} × ${h1} = ${dt} (cm²). Tam giác có cùng diện tích nên (${a2} × h) : 2 = ${dt}, suy ra h = 2 × ${dt} : ${a2} = ${fmt(2 * dt)} : ${a2} = ${fmt(val)} (cm). Quên nhân 2 khi rút ẩn từ công thức tam giác sẽ ra ${fmt(roundDec(dt / a2, 3))} cm.`,
    steps: [
      `S hình bình hành = ${a} × ${h1} = ${dt} cm²`,
      `(${a2} × h) : 2 = ${dt}`,
      `h = 2 × ${dt} : ${a2} = ${fmt(val)} cm`,
    ],
    hint: 'Tính diện tích chung trước, rồi rút chiều cao từ công thức tam giác.',
    tags: ['diện tích', 'ghép công thức', 'nhiều bước'],
  };
}

function AREA03(ctx: GenCtx): Draft {
  const { lvl, slot } = ctx;

  if (lvl === 0) {
    const a = side(ctx, 3, 12);
    const b = side(ctx, 2, 9);
    const c = side(ctx, 2, 8);
    const val = a * b * c;
    return {
      stem: `Một hình hộp chữ nhật có chiều dài ${a} cm, chiều rộng ${b} cm và chiều cao ${c} cm. Tính thể tích hình hộp đó.`,
      correct: uv(val, 'cm³'),
      numeric: val,
      distractors: ud(
        uv(val, 'cm³'),
        [
          [2 * (a * b + b * c + a * c), 'cm³'],
          [a + b + c, 'cm³'],
          [a * b, 'cm³'],
          [4 * (a + b + c), 'cm³'],
        ],
        [val, 'cm³'],
      ),
      solution: `Thể tích hình hộp chữ nhật = dài × rộng × cao = ${a} × ${b} × ${c} = ${val} (cm³). Đáp án ${fmt(2 * (a * b + b * c + a * c))} cm³ là DIỆN TÍCH TOÀN PHẦN, không phải thể tích. Chú ý đơn vị: thể tích dùng cm³, diện tích dùng cm².`,
      steps: [`V = a × b × c`, `V = ${a} × ${b} × ${c} = ${val} cm³`],
      hint: 'Thể tích bằng tích của ba kích thước.',
      tags: ['thể tích', 'hình hộp chữ nhật'],
    };
  }

  if (lvl === 1) {
    const a = side(ctx, 4, 14);
    const b = side(ctx, 3, 10);
    const c = side(ctx, 3, 9);
    const sxq = 2 * (a + b) * c;
    const stp = sxq + 2 * a * b;
    if (slot % 2 === 0) {
      return {
        stem: `Một cái thùng dạng hình hộp chữ nhật có chiều dài ${a} dm, chiều rộng ${b} dm và chiều cao ${c} dm. Tính diện tích xung quanh của thùng.`,
        correct: uv(sxq, 'dm²'),
        numeric: sxq,
        distractors: ud(
          uv(sxq, 'dm²'),
          [
            [stp, 'dm²'],
            [(a + b) * c, 'dm²'],
            [a * b * c, 'dm²'],
            [2 * a * b, 'dm²'],
          ],
          [sxq, 'dm²'],
        ),
        solution: `Diện tích xung quanh = chu vi đáy × chiều cao = 2 × (${a} + ${b}) × ${c} = ${fmt(2 * (a + b))} × ${c} = ${sxq} (dm²). Quên nhân 2 khi tính chu vi đáy sẽ ra ${fmt((a + b) * c)} dm²; cộng thêm hai mặt đáy sẽ thành diện tích TOÀN PHẦN ${fmt(stp)} dm².`,
        steps: [
          `Chu vi đáy = 2 × (${a} + ${b}) = ${fmt(2 * (a + b))} dm`,
          `Sxq = ${fmt(2 * (a + b))} × ${c} = ${sxq} dm²`,
        ],
        hint: 'Diện tích xung quanh bằng chu vi đáy nhân chiều cao.',
        tags: ['diện tích xung quanh', 'hình hộp chữ nhật'],
      };
    }
    return {
      stem: `Một cái hộp dạng hình hộp chữ nhật có chiều dài ${a} dm, chiều rộng ${b} dm và chiều cao ${c} dm. Tính diện tích toàn phần của hộp.`,
      correct: uv(stp, 'dm²'),
      numeric: stp,
      distractors: ud(
        uv(stp, 'dm²'),
        [
          [sxq, 'dm²'],
          [sxq + a * b, 'dm²'],
          [a * b * c, 'dm²'],
          [2 * (a * b + b * c), 'dm²'],
        ],
        [stp, 'dm²'],
      ),
      solution: `Diện tích xung quanh = 2 × (${a} + ${b}) × ${c} = ${sxq} (dm²). Hai mặt đáy có diện tích 2 × ${a} × ${b} = ${fmt(2 * a * b)} (dm²). Diện tích toàn phần = ${sxq} + ${fmt(2 * a * b)} = ${stp} (dm²). Chỉ cộng MỘT mặt đáy sẽ ra ${fmt(sxq + a * b)} dm² — hình hộp có hai mặt đáy.`,
      steps: [
        `Sxq = 2 × (${a} + ${b}) × ${c} = ${sxq} dm²`,
        `Hai đáy = 2 × ${a} × ${b} = ${fmt(2 * a * b)} dm²`,
        `Stp = ${sxq} + ${fmt(2 * a * b)} = ${stp} dm²`,
      ],
      hint: 'Toàn phần bằng xung quanh cộng diện tích HAI mặt đáy.',
      tags: ['diện tích toàn phần', 'hình hộp chữ nhật'],
    };
  }

  // lvl 2 — đổi đơn vị thể tích sang lít, hoặc suy ngược một kích thước
  if (slot % 2 === 0) {
    const a = side(ctx, 4, 12);
    const b = side(ctx, 3, 9);
    const c = side(ctx, 2, 8);
    const dm3 = a * b * c;
    const val = dm3; // 1 dm³ = 1 lít
    return {
      stem: `Một bể nước dạng hình hộp chữ nhật có chiều dài ${a} dm, chiều rộng ${b} dm và chiều cao ${c} dm. Bể chứa đầy nước thì được bao nhiêu lít? (Biết 1 dm³ = 1 lít.)`,
      correct: uv(val, 'lít'),
      numeric: val,
      distractors: ud(
        uv(val, 'lít'),
        [
          [dm3 * 1000, 'lít'],
          [roundDec(dm3 / 1000, 4), 'lít'],
          [2 * (a + b) * c, 'lít'],
          [a * b, 'lít'],
        ],
        [val, 'lít'],
      ),
      solution: `Thể tích bể = ${a} × ${b} × ${c} = ${dm3} (dm³). Vì 1 dm³ = 1 lít nên bể chứa được ${val} lít. Nhân thêm 1000 (ra ${fmt(dm3 * 1000)} lít) là nhầm với tỉ lệ đổi từ m³ sang lít.`,
      steps: [
        `V = ${a} × ${b} × ${c} = ${dm3} dm³`,
        `1 dm³ = 1 lít`,
        `Bể chứa ${val} lít`,
      ],
      hint: 'Tính thể tích theo dm³ rồi đổi trực tiếp sang lít.',
      tags: ['thể tích', 'đổi đơn vị', 'lít'],
    };
  }
  const a = side(ctx, 4, 12);
  const b = side(ctx, 3, 9);
  const val = side(ctx, 2, 8);
  const v = a * b * val;
  return {
    stem: `Một hình hộp chữ nhật có thể tích ${v} cm³, chiều dài ${a} cm và chiều rộng ${b} cm. Tính chiều cao của hình hộp.`,
    correct: uv(val, 'cm'),
    numeric: val,
    distractors: ud(
      uv(val, 'cm'),
      [
        [roundDec(v / (a + b), 3), 'cm'],
        [roundDec(v / a, 3), 'cm'],
        [roundDec(v / b, 3), 'cm'],
        [a * b, 'cm'],
      ],
      [val, 'cm'],
    ),
    solution: `Từ V = dài × rộng × cao suy ra cao = V : (dài × rộng) = ${v} : (${a} × ${b}) = ${v} : ${fmt(a * b)} = ${val} (cm). Chia cho TỔNG hai kích thước thay vì tích (ra ${fmt(roundDec(v / (a + b), 3))} cm) là lỗi thường gặp.`,
    steps: [
      `Diện tích đáy = ${a} × ${b} = ${fmt(a * b)} cm²`,
      `Chiều cao = ${v} : ${fmt(a * b)} = ${val} cm`,
    ],
    hint: 'Chiều cao bằng thể tích chia cho diện tích đáy.',
    tags: ['thể tích', 'suy luận ngược'],
  };
}

function AREA04(ctx: GenCtx): Draft {
  const { lvl, slot } = ctx;

  if (lvl === 0) {
    const a = side(ctx, 10, 24);
    const b = side(ctx, 6, 14);
    const c = Math.max(2, Math.min(b - 1, side(ctx, 3, 8)));
    const val = a * b - c * c;
    return {
      stem: `Một tấm tôn hình chữ nhật có chiều dài ${a} dm và chiều rộng ${b} dm. Người ta cắt bỏ một hình vuông cạnh ${c} dm ở góc tấm tôn. Tính diện tích phần tôn còn lại.`,
      correct: uv(val, 'dm²'),
      numeric: val,
      distractors: ud(
        uv(val, 'dm²'),
        [
          [a * b, 'dm²'],
          [a * b + c * c, 'dm²'],
          [a * b - c, 'dm²'],
          [a * b - 4 * c, 'dm²'],
        ],
        [val, 'dm²'],
      ),
      solution: `Diện tích tấm tôn ban đầu = ${a} × ${b} = ${fmt(a * b)} (dm²). Diện tích hình vuông cắt bỏ = ${c} × ${c} = ${fmt(c * c)} (dm²). Phần còn lại = ${fmt(a * b)} − ${fmt(c * c)} = ${val} (dm²). Trừ đi ${c} thay vì ${fmt(c * c)} (ra ${fmt(a * b - c)} dm²) là nhầm CẠNH với DIỆN TÍCH của hình vuông.`,
      steps: [
        `S ban đầu = ${a} × ${b} = ${fmt(a * b)} dm²`,
        `S phần cắt = ${c} × ${c} = ${fmt(c * c)} dm²`,
        `S còn lại = ${fmt(a * b)} − ${fmt(c * c)} = ${val} dm²`,
      ],
      hint: 'Lấy diện tích hình lớn trừ đi diện tích phần bị cắt.',
      tags: ['ghép hình', 'diện tích'],
    };
  }

  if (lvl === 1) {
    const a = side(ctx, 12, 25);
    const b = side(ctx, 8, 16);
    const d = ri(ctx.r, 1, 3);
    const val = a * b - (a - 2 * d) * (b - 2 * d);
    return {
      stem: `Một mảnh vườn hình chữ nhật có chiều dài ${a} m và chiều rộng ${b} m. Người ta làm một lối đi rộng ${d} m chạy vòng quanh phía trong sát mép vườn. Tính diện tích lối đi.`,
      correct: uv(val, 'm²'),
      numeric: val,
      distractors: ud(
        uv(val, 'm²'),
        [
          [a * b - (a - d) * (b - d), 'm²'],
          [(a - 2 * d) * (b - 2 * d), 'm²'],
          [2 * (a + b) * d, 'm²'],
          [a * b, 'm²'],
        ],
        [val, 'm²'],
      ),
      solution: `Diện tích cả mảnh vườn = ${a} × ${b} = ${fmt(a * b)} (m²). Phần đất bên trong lối đi là hình chữ nhật có chiều dài ${a} − 2 × ${d} = ${fmt(a - 2 * d)} (m) và chiều rộng ${b} − 2 × ${d} = ${fmt(b - 2 * d)} (m), diện tích ${fmt((a - 2 * d) * (b - 2 * d))} m². Diện tích lối đi = ${fmt(a * b)} − ${fmt((a - 2 * d) * (b - 2 * d))} = ${val} (m²). Chỉ trừ MỘT lần ${d} m mỗi chiều (ra ${fmt(a * b - (a - d) * (b - d))} m²) là quên rằng lối đi chạy ở CẢ HAI phía đối diện.`,
      steps: [
        `S vườn = ${a} × ${b} = ${fmt(a * b)} m²`,
        `Phần trong: (${a} − 2×${d}) × (${b} − 2×${d}) = ${fmt((a - 2 * d) * (b - 2 * d))} m²`,
        `S lối đi = ${fmt(a * b)} − ${fmt((a - 2 * d) * (b - 2 * d))} = ${val} m²`,
      ],
      hint: 'Lối đi chạy vòng quanh nên mỗi chiều bị trừ hai lần bề rộng lối đi.',
      tags: ['ghép hình', 'lối đi', 'nhiều bước'],
    };
  }

  // lvl 2 — ghép hình cộng thêm đổi đơn vị hoặc bài toán lát gạch
  if (slot % 2 === 0) {
    const a = side(ctx, 8, 16);
    const b = side(ctx, 6, 12);
    const r1 = side(ctx, 2, 5);
    const conLai = a * b - 2 * ((r1 * r1) / 2) * 2;
    const val = a * b - 2 * r1 * r1;
    return {
      stem: `Một tấm bìa hình chữ nhật có chiều dài ${a} cm và chiều rộng ${b} cm. Người ta cắt bỏ ở hai góc đối diện, mỗi góc là một tam giác vuông có hai cạnh góc vuông đều bằng ${r1} cm, rồi lại cắt bỏ thêm một hình vuông cạnh ${r1} cm. Tính diện tích phần bìa còn lại.`,
      correct: uv(val, 'cm²'),
      numeric: val,
      distractors: ud(
        uv(val, 'cm²'),
        [
          [conLai, 'cm²'],
          [a * b - r1 * r1, 'cm²'],
          [a * b - 3 * r1 * r1, 'cm²'],
          [a * b, 'cm²'],
        ],
        [val, 'cm²'],
      ),
      solution: `Diện tích tấm bìa = ${a} × ${b} = ${fmt(a * b)} (cm²). Mỗi tam giác vuông có diện tích (${r1} × ${r1}) : 2 = ${fmt((r1 * r1) / 2)} (cm²), hai tam giác là ${fmt(r1 * r1)} cm². Hình vuông cắt thêm có diện tích ${r1} × ${r1} = ${fmt(r1 * r1)} (cm²). Tổng phần cắt bỏ = ${fmt(r1 * r1)} + ${fmt(r1 * r1)} = ${fmt(2 * r1 * r1)} (cm²). Phần còn lại = ${fmt(a * b)} − ${fmt(2 * r1 * r1)} = ${val} (cm²). Quên chia 2 khi tính tam giác là lỗi hay gặp nhất ở dạng ghép hình này.`,
      steps: [
        `S bìa = ${a} × ${b} = ${fmt(a * b)} cm²`,
        `Hai tam giác = 2 × (${r1} × ${r1} : 2) = ${fmt(r1 * r1)} cm²`,
        `Hình vuông = ${fmt(r1 * r1)} cm²`,
        `Còn lại = ${fmt(a * b)} − ${fmt(2 * r1 * r1)} = ${val} cm²`,
      ],
      hint: 'Tính diện tích từng phần bị cắt rồi cộng lại, nhớ tam giác phải chia 2.',
      tags: ['ghép hình', 'nhiều bước'],
    };
  }
  const a = side(ctx, 4, 9);
  const b = side(ctx, 3, 7);
  const gach = ri(ctx.r, 2, 5) * 10; // cạnh viên gạch, cm
  const dienTichPhong = a * b * 10000; // m² sang cm²
  const val = dienTichPhong / (gach * gach);
  return {
    stem: `Một căn phòng hình chữ nhật có chiều dài ${a} m và chiều rộng ${b} m. Người ta lát kín nền phòng bằng những viên gạch hình vuông cạnh ${gach} cm. Hỏi cần bao nhiêu viên gạch?`,
    correct: `${fmt(val)} viên`,
    numeric: val,
    distractors: td(`${fmt(val)} viên`, [
      `${fmt(roundDec((a * b * 100) / (gach * gach), 2))} viên`,
      `${fmt(roundDec(dienTichPhong / gach, 2))} viên`,
      `${fmt(a * b)} viên`,
      `${fmt(roundDec(val / 2, 2))} viên`,
      `${fmt(val * 2)} viên`,
    ]),
    solution: `Diện tích nền phòng = ${a} × ${b} = ${fmt(a * b)} (m²) = ${fmt(dienTichPhong)} (cm²), vì 1 m² = 10 000 cm². Diện tích một viên gạch = ${gach} × ${gach} = ${fmt(gach * gach)} (cm²). Số viên gạch = ${fmt(dienTichPhong)} : ${fmt(gach * gach)} = ${fmt(val)} (viên). Đổi m² sang cm² bằng cách nhân 100 thay vì 10 000 sẽ ra ${fmt(roundDec((a * b * 100) / (gach * gach), 2))} viên — sai gấp 100 lần.`,
    steps: [
      `S phòng = ${a} × ${b} = ${fmt(a * b)} m² = ${fmt(dienTichPhong)} cm²`,
      `S một viên = ${gach} × ${gach} = ${fmt(gach * gach)} cm²`,
      `Số viên = ${fmt(dienTichPhong)} : ${fmt(gach * gach)} = ${fmt(val)} viên`,
    ],
    hint: 'Đưa hai diện tích về cùng đơn vị trước khi chia.',
    tags: ['lát gạch', 'đổi đơn vị', 'nhiều bước'],
  };
}

export const AREA_GENERATORS: Record<string, Gen> = {
  AREA01,
  AREA02,
  AREA03,
  AREA04,
};
