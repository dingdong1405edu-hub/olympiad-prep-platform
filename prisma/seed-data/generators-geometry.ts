/**
 * BỘ SINH CÂU HỎI HÌNH HỌC: hình học phẳng cơ bản (điểm – đường thẳng – góc),
 * tam giác, chu vi – diện tích – thể tích.
 *
 * Ba quy tắc bất di bất dịch, giống hệt `generators.ts`:
 *  1. Đáp án và lời giải luôn được TÍNH RA từ tham số vừa sinh — không viết tay.
 *  2. Số liệu chọn NGƯỢC từ đáp án đẹp ⇒ không bao giờ ra số lẻ xấu.
 *  3. Nhiễu là LỖI SAI CÓ THẬT (quên chia 2, quên đổi đơn vị, nhầm góc kề bù với
 *     góc phụ nhau, dùng n² thay cho n(n−1), lấy nhầm cạnh huyền làm chiều cao...).
 *
 * KHÔNG có hình vẽ kèm theo ⇒ mọi đề bài phải mô tả bằng lời đủ chặt để chỉ có
 * MỘT cách hiểu duy nhất (nêu rõ điểm nằm trên tia nào, thứ tự các điểm...).
 *
 * File này KHÔNG import gì từ `src/` (tsx không đọc `paths` của tsconfig).
 */
import type { Draft, Gen, GenCtx } from './generators';
import { fmt, nd, pick, ri, roundDec, sc, td } from './generators';

// ===========================================================================
// TIỆN ÍCH RIÊNG CỦA NHÓM HÌNH HỌC
// ===========================================================================

/** Ghép giá trị với đơn vị — đáp án hình học bắt buộc mang đơn vị đo. */
function uv(v: number, unit: string): string {
  return `${fmt(v)} ${unit}`;
}

/**
 * Lọc nhiễu dạng "số + đơn vị"; `pad` là [giá trị đúng, đơn vị] dùng để đệm khi
 * các ứng viên trùng nhau, bảo đảm luôn còn ít nhất 3 nhiễu khác nhau.
 */
function ud(correct: string, cands: [number, string][], pad?: [number, string]): string[] {
  const out = td(
    correct,
    cands.filter(([v]) => Number.isFinite(v) && v > 0).map(([v, unit]) => uv(roundDec(v, 4), unit)),
  );
  if (!pad) return out;
  for (const k of [2, 0.5, 10, 0.1, 100, 4]) {
    if (out.length >= 3) break;
    const t = uv(roundDec(pad[0] * k, 4), pad[1]);
    if (t !== correct && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Số đo góc kèm kí hiệu độ: 60 → "60°". */
function deg(v: number): string {
  return `${fmt(v)}°`;
}

/** Lọc nhiễu dạng số đo góc; đệm bằng các sai lệch quen thuộc nếu thiếu. */
function dd(correct: number, cands: number[]): string[] {
  const out = td(
    deg(correct),
    cands.filter((v) => Number.isFinite(v) && v > 0 && v < 360).map(deg),
  );
  for (const delta of [10, -10, 5, -5, 20, -20]) {
    if (out.length >= 3) break;
    const v = correct + delta;
    if (v <= 0 || v >= 360) continue;
    const t = deg(v);
    if (t !== deg(correct) && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Tên điểm liên tiếp: 4 → "A, B, C, D". */
function ptNames(n: number): string {
  return 'ABCDEFGHIJKLMN'.slice(0, n).split('').join(', ');
}

/** Số đoạn thẳng (hoặc số góc) tạo bởi n điểm phân biệt / n tia chung gốc. */
function pairCount(n: number): number {
  return (n * (n - 1)) / 2;
}

// ===========================================================================
// CHƯƠNG GEO — HÌNH HỌC PHẲNG CƠ BẢN
// ===========================================================================

/** GEO01 — đếm đoạn thẳng, tia, góc: công thức n(n−1)/2 và bẫy n² hoặc n(n−1). */
function GEO01(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    if (slot % 2 === 0) {
      const n = ri(r, 4, 8);
      const val = pairCount(n);
      return {
        stem: `Trên đường thẳng d lấy ${n} điểm phân biệt ${ptNames(n)}. Hỏi có tất cả bao nhiêu đoạn thẳng mà hai đầu mút là hai trong ${n} điểm đó?`,
        correct: fmt(val),
        numeric: val,
        distractors: nd(val, [n * (n - 1), (n * n) / 2, n, n * n, val - 1]),
        solution: `Mỗi đoạn thẳng được xác định bởi MỘT CẶP điểm, mà cặp {A; B} và cặp {B; A} chỉ cho cùng một đoạn thẳng. Do đó số đoạn thẳng bằng ${n} × (${n} − 1) : 2 = ${n * (n - 1)} : 2 = ${val}. Nếu quên chia 2 sẽ ra ${n * (n - 1)} — đó là số TIA gốc tại các điểm đã cho tính theo cặp có thứ tự, không phải số đoạn thẳng.`,
        steps: [
          `Mỗi điểm nối được với ${n} − 1 = ${n - 1} điểm còn lại`,
          `Tổng số lượt nối: ${n} × ${n - 1} = ${n * (n - 1)}`,
          `Mỗi đoạn thẳng bị đếm 2 lần nên chia 2: ${val} đoạn thẳng`,
        ],
        hint: 'Số đoạn thẳng tạo bởi n điểm phân biệt là n(n − 1) : 2 — nhớ chia 2 vì mỗi đoạn được đếm hai lần.',
        tags: ['đếm hình', 'đoạn thẳng'],
      };
    }
    const n = ri(r, 3, 7);
    const val = 2 * n;
    return {
      stem: `Trên đường thẳng xy lấy ${n} điểm phân biệt. Mỗi điểm chia đường thẳng thành hai tia đối nhau có gốc là điểm đó. Hỏi có tất cả bao nhiêu tia gốc là một trong ${n} điểm đã lấy?`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [n, pairCount(n), n * n, val + 2, 4 * n]),
      solution: `Mỗi điểm trên đường thẳng sinh ra ĐÚNG HAI tia đối nhau. Có ${n} điểm nên số tia là ${n} × 2 = ${val}. Trả lời ${n} là do chỉ đếm mỗi điểm một tia; trả lời ${pairCount(n)} là nhầm sang công thức đếm đoạn thẳng.`,
      steps: [`Mỗi điểm cho 2 tia đối nhau`, `${n} điểm × 2 = ${val} tia`],
      hint: 'Một điểm nằm trên đường thẳng luôn chia đường thẳng đó thành hai tia đối nhau.',
      tags: ['đếm hình', 'tia'],
    };
  }

  if (lvl === 1) {
    if (slot % 2 === 0) {
      const n = ri(r, 5, 9);
      const val = pairCount(n);
      return {
        stem: `Cho ${n} tia chung gốc O, trong đó không có hai tia nào trùng nhau. Hỏi có tất cả bao nhiêu góc được tạo thành (mỗi góc có hai cạnh là hai trong ${n} tia đó)?`,
        correct: fmt(val),
        numeric: val,
        distractors: nd(val, [n * (n - 1), n, (n * n) / 2, n * n, val + n]),
        solution: `Mỗi góc được xác định bởi một CẶP tia phân biệt chung gốc O. Số cặp là ${n} × (${n} − 1) : 2 = ${n * (n - 1)} : 2 = ${val} góc. Công thức giống hệt bài đếm đoạn thẳng vì cùng là "đếm số cặp". Quên chia 2 sẽ ra ${n * (n - 1)}.`,
        steps: [
          `Mỗi tia ghép được với ${n - 1} tia còn lại`,
          `${n} × ${n - 1} = ${n * (n - 1)} lượt ghép`,
          `Mỗi góc bị đếm 2 lần: ${n * (n - 1)} : 2 = ${val} góc`,
        ],
        hint: 'Đếm góc tạo bởi n tia chung gốc cũng dùng công thức n(n − 1) : 2.',
        tags: ['đếm hình', 'góc'],
      };
    }
    const k = ri(r, 3, 7);
    const n = k + 2;
    const val = pairCount(n);
    return {
      stem: `Cho đoạn thẳng AB. Lấy thêm ${k} điểm phân biệt nằm giữa A và B. Hỏi trên hình có tất cả bao nhiêu đoạn thẳng (hai đầu mút là hai trong các điểm đã có)?`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [pairCount(k), pairCount(k + 1), n * (n - 1), k + 1, val - 1]),
      solution: `Trên hình có tất cả ${k} + 2 = ${n} điểm (gồm A, B và ${k} điểm lấy thêm). Số đoạn thẳng bằng ${n} × ${n - 1} : 2 = ${val}. Lỗi hay gặp là quên tính hai đầu mút A và B, chỉ lấy ${k} điểm rồi ra ${pairCount(k)} đoạn.`,
      steps: [
        `Tổng số điểm: ${k} + 2 = ${n}`,
        `Số đoạn thẳng = ${n} × ${n - 1} : 2`,
        `= ${n * (n - 1)} : 2 = ${val}`,
      ],
      hint: 'Đừng quên A và B cũng là hai điểm của hình.',
      tags: ['đếm hình', 'đoạn thẳng'],
    };
  }

  // lvl 2 — suy luận ngược hoặc so sánh hai tình huống
  if (slot % 2 === 0) {
    const n = ri(r, 6, 12);
    const S = pairCount(n);
    return {
      stem: `Trên đường thẳng d lấy một số điểm phân biệt thì đếm được tất cả ${S} đoạn thẳng. Hỏi đã lấy bao nhiêu điểm?`,
      correct: fmt(n),
      numeric: n,
      distractors: nd(n, [n + 1, n - 1, S / 2, 2 * S, S - n]),
      solution: `Gọi số điểm là n, ta có n(n − 1) : 2 = ${S}, tức n(n − 1) = ${2 * S}. Thử các số tự nhiên liên tiếp: ${n} × ${n - 1} = ${2 * S} nên n = ${n}. Kiểm tra lại: ${n} × ${n - 1} : 2 = ${S} ✓. Lỗi hay gặp là giải n² = ${2 * S} rồi lấy căn, ra số không nguyên.`,
      steps: [
        `Gọi số điểm là n: n(n − 1) : 2 = ${S}`,
        `n(n − 1) = ${S} × 2 = ${2 * S}`,
        `Tìm hai số tự nhiên liên tiếp có tích ${2 * S}: ${n} và ${n - 1}`,
        `Vậy n = ${n}`,
      ],
      hint: 'Nhân đôi số đoạn thẳng rồi tìm tích của hai số tự nhiên liên tiếp.',
      tags: ['đếm hình', 'suy luận ngược'],
    };
  }
  const n = ri(r, 4, 8);
  const k = ri(r, 2, 4);
  const before = pairCount(n);
  const after = pairCount(n + k);
  const val = after - before;
  return {
    stem: `Trên đường thẳng d đã có ${n} điểm phân biệt. Người ta lấy thêm ${k} điểm phân biệt nữa cũng nằm trên d (khác các điểm cũ). Hỏi số đoạn thẳng tăng thêm bao nhiêu?`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [pairCount(k), after, n * k, before, k]),
    solution: `Trước khi thêm: ${n} × ${n - 1} : 2 = ${before} đoạn thẳng. Sau khi thêm có ${n + k} điểm: ${n + k} × ${n + k - 1} : 2 = ${after} đoạn thẳng. Số đoạn tăng thêm là ${after} − ${before} = ${val}. Chỉ đếm các đoạn nối giữa ${k} điểm mới với nhau (${pairCount(k)} đoạn) là thiếu, vì còn ${n * k} đoạn nối điểm mới với điểm cũ.`,
    steps: [
      `Ban đầu: ${n} × ${n - 1} : 2 = ${before} đoạn`,
      `Sau khi thêm có ${n + k} điểm: ${n + k} × ${n + k - 1} : 2 = ${after} đoạn`,
      `Tăng thêm: ${after} − ${before} = ${val} đoạn`,
    ],
    hint: 'Tính số đoạn thẳng ở hai thời điểm rồi trừ, đừng quên các đoạn nối điểm mới với điểm cũ.',
    tags: ['đếm hình', 'nhiều bước'],
  };
}

/** GEO02 — trung điểm và độ dài đoạn thẳng; bẫy: nhân đôi thay vì chia đôi. */
function GEO02(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    if (slot % 2 === 0) {
      const half = ri(r, 3, 12);
      const d = 2 * half;
      return {
        stem: `Điểm M là trung điểm của đoạn thẳng AB, biết AB = ${d} cm. Tính độ dài đoạn thẳng MA.`,
        correct: uv(half, 'cm'),
        numeric: half,
        distractors: ud(
          uv(half, 'cm'),
          [
            [2 * d, 'cm'],
            [d, 'cm'],
            [d - 2, 'cm'],
            [half + 1, 'cm'],
          ],
          [half, 'cm'],
        ),
        solution: `M là trung điểm của AB nên M nằm giữa A, B và MA = MB = AB : 2 = ${d} : 2 = ${half} cm. Lỗi hay gặp là NHÂN đôi thay vì chia đôi (ra ${2 * d} cm), hoặc lấy luôn ${d} cm là độ dài cả đoạn AB.`,
        steps: [`M là trung điểm ⇒ MA = MB = AB : 2`, `MA = ${d} : 2 = ${half} cm`],
        hint: 'Trung điểm chia đoạn thẳng thành hai phần BẰNG NHAU, mỗi phần bằng nửa đoạn thẳng.',
        tags: ['trung điểm', 'độ dài đoạn thẳng'],
      };
    }
    const a = ri(r, 3, 14);
    const d = 2 * a;
    return {
      stem: `Điểm I là trung điểm của đoạn thẳng CD, biết IC = ${a} cm. Tính độ dài đoạn thẳng CD.`,
      correct: uv(d, 'cm'),
      numeric: d,
      distractors: ud(
        uv(d, 'cm'),
        [
          [a / 2, 'cm'],
          [a, 'cm'],
          [3 * a, 'cm'],
          [a + 2, 'cm'],
        ],
        [d, 'cm'],
      ),
      solution: `I là trung điểm của CD nên IC = ID = ${a} cm, do đó CD = IC + ID = ${a} + ${a} = ${d} cm. Ở đây phải NHÂN 2 chứ không chia 2: chia 2 sẽ ra ${fmt(a / 2)} cm — đó là lỗi làm ngược chiều bài toán.`,
      steps: [`I là trung điểm ⇒ IC = ID = ${a} cm`, `CD = ${a} + ${a} = ${d} cm`],
      hint: 'Biết nửa đoạn thẳng thì muốn tìm cả đoạn phải nhân đôi.',
      tags: ['trung điểm', 'độ dài đoạn thẳng'],
    };
  }

  if (lvl === 1) {
    const a = ri(r, 2, 7);
    const b = a + 2 * ri(r, 2, 6);
    if (slot % 2 === 0) {
      const val = b - a;
      return {
        stem: `Trên tia Ox lấy hai điểm A và B sao cho OA = ${a} cm, OB = ${b} cm. Tính độ dài đoạn thẳng AB.`,
        correct: uv(val, 'cm'),
        numeric: val,
        distractors: ud(
          uv(val, 'cm'),
          [
            [a + b, 'cm'],
            [b, 'cm'],
            [(a + b) / 2, 'cm'],
            [val / 2, 'cm'],
          ],
          [val, 'cm'],
        ),
        solution: `A và B cùng nằm trên tia Ox, mà OA = ${a} cm < OB = ${b} cm nên điểm A nằm GIỮA O và B. Do đó OA + AB = OB, suy ra AB = OB − OA = ${b} − ${a} = ${val} cm. Cộng hai độ dài (ra ${a + b} cm) chỉ đúng khi A, B nằm trên HAI TIA ĐỐI NHAU, không phải trường hợp này.`,
        steps: [
          `Vì OA = ${a} < OB = ${b} nên A nằm giữa O và B`,
          `OA + AB = OB`,
          `AB = ${b} − ${a} = ${val} cm`,
        ],
        hint: 'Hai điểm cùng nằm trên một tia: điểm gần gốc hơn thì nằm giữa, khi đó lấy hiệu hai khoảng cách.',
        tags: ['độ dài đoạn thẳng', 'điểm nằm giữa'],
      };
    }
    const val = (b - a) / 2;
    return {
      stem: `Trên tia Ox lấy hai điểm A và B sao cho OA = ${a} cm, OB = ${b} cm. Gọi M là trung điểm của đoạn thẳng AB. Tính độ dài đoạn thẳng MA.`,
      correct: uv(val, 'cm'),
      numeric: val,
      distractors: ud(
        uv(val, 'cm'),
        [
          [b - a, 'cm'],
          [(a + b) / 2, 'cm'],
          [a + b, 'cm'],
          [val + 1, 'cm'],
        ],
        [val, 'cm'],
      ),
      solution: `Vì OA = ${a} cm < OB = ${b} cm nên A nằm giữa O và B, do đó AB = OB − OA = ${b} − ${a} = ${b - a} cm. M là trung điểm của AB nên MA = AB : 2 = ${b - a} : 2 = ${fmt(val)} cm. Quên bước chia đôi sẽ dừng lại ở ${b - a} cm.`,
      steps: [
        `AB = OB − OA = ${b} − ${a} = ${b - a} cm`,
        `M là trung điểm AB ⇒ MA = AB : 2`,
        `MA = ${b - a} : 2 = ${fmt(val)} cm`,
      ],
      hint: 'Tính độ dài AB trước, sau đó mới chia đôi để có MA.',
      tags: ['trung điểm', 'nhiều bước'],
    };
  }

  // lvl 2 — hai điểm trên cùng tia hoặc trên hai tia đối nhau, tính khoảng cách tới gốc O
  const a = ri(r, 2, 9) * 2;
  const b = a + 2 * ri(r, 2, 7);
  if (slot % 2 === 0) {
    const val = (a + b) / 2;
    return {
      stem: `Trên tia Ox lấy hai điểm A và B sao cho OA = ${a} cm, OB = ${b} cm. Gọi M là trung điểm của đoạn thẳng AB. Tính độ dài đoạn thẳng OM.`,
      correct: uv(val, 'cm'),
      numeric: val,
      distractors: ud(
        uv(val, 'cm'),
        [
          [(b - a) / 2, 'cm'],
          [b - a, 'cm'],
          [a + b, 'cm'],
          [b / 2, 'cm'],
        ],
        [val, 'cm'],
      ),
      solution: `Bước 1: vì OA = ${a} cm < OB = ${b} cm nên A nằm giữa O và B, do đó AB = ${b} − ${a} = ${b - a} cm. Bước 2: M là trung điểm AB nên AM = ${b - a} : 2 = ${fmt((b - a) / 2)} cm. Bước 3: A nằm giữa O và M nên OM = OA + AM = ${a} + ${fmt((b - a) / 2)} = ${fmt(val)} cm (đúng bằng trung bình cộng ${a} và ${b}). Đáp án ${fmt((b - a) / 2)} cm là do dừng lại ở AM mà quên cộng OA.`,
      steps: [
        `AB = ${b} − ${a} = ${b - a} cm`,
        `AM = AB : 2 = ${fmt((b - a) / 2)} cm`,
        `OM = OA + AM = ${a} + ${fmt((b - a) / 2)} = ${fmt(val)} cm`,
      ],
      hint: 'Đi từng chặng: tính AB, rồi AM, cuối cùng cộng với OA để ra OM.',
      tags: ['trung điểm', 'nhiều bước', 'suy luận'],
    };
  }
  const val = Math.abs(b - a) / 2;
  return {
    stem: `Trên tia Ox lấy điểm A sao cho OA = ${a} cm; trên tia Oy là tia đối của tia Ox lấy điểm B sao cho OB = ${b} cm. Gọi M là trung điểm của đoạn thẳng AB. Tính độ dài đoạn thẳng OM.`,
    correct: uv(val, 'cm'),
    numeric: val,
    distractors: ud(
      uv(val, 'cm'),
      [
        [(a + b) / 2, 'cm'],
        [a + b, 'cm'],
        [b - a, 'cm'],
        [b / 2, 'cm'],
      ],
      [val, 'cm'],
    ),
    solution: `Bước 1: hai tia Ox và Oy đối nhau nên O nằm GIỮA A và B, do đó AB = OA + OB = ${a} + ${b} = ${a + b} cm. Bước 2: M là trung điểm AB nên MB = AB : 2 = ${fmt((a + b) / 2)} cm. Bước 3: vì MB = ${fmt((a + b) / 2)} cm < OB = ${b} cm nên M nằm giữa O và B, suy ra OM = OB − MB = ${b} − ${fmt((a + b) / 2)} = ${fmt(val)} cm (đúng bằng nửa hiệu ${b} − ${a}). Bẫy lớn nhất là trả lời ${fmt((a + b) / 2)} cm — đó là nửa đoạn AB, chỉ bằng OM khi O là trung điểm của AB, tức khi OA = OB.`,
    steps: [
      `Ox và Oy đối nhau ⇒ O nằm giữa A và B: AB = ${a} + ${b} = ${a + b} cm`,
      `MA = MB = ${a + b} : 2 = ${fmt((a + b) / 2)} cm`,
      `OM = OB − MB = ${b} − ${fmt((a + b) / 2)} = ${fmt(val)} cm`,
    ],
    hint: 'Hai tia đối nhau thì gốc O nằm giữa; O chỉ là trung điểm của AB khi OA = OB.',
    tags: ['trung điểm', 'tia đối', 'nhiều bước'],
  };
}

/** GEO03 — số đo góc, hai góc kề bù (tổng 180°), hai góc đối đỉnh (bằng nhau). */
function GEO03(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    const a = ri(r, 3, 16) * 5;
    if (slot % 3 === 0) {
      const val = 180 - a;
      return {
        stem: `Hai góc xOy và yOz là hai góc kề bù. Biết góc xOy = ${a}°. Tính số đo góc yOz.`,
        correct: deg(val),
        numeric: val,
        distractors: dd(val, [90 - a, 360 - a, a, 180 + a, val + 10]),
        solution: `Hai góc kề bù có tổng số đo bằng 180°. Do đó góc yOz = 180° − góc xOy = 180° − ${a}° = ${val}°. Lấy 90° − ${a}° = ${fmt(90 - a)}° là nhầm sang hai góc PHỤ NHAU (tổng 90°), còn 360° − ${a}° là nhầm sang góc quanh một điểm.`,
        steps: [`Hai góc kề bù có tổng bằng 180°`, `góc yOz = 180° − ${a}° = ${val}°`],
        hint: 'Kề bù: tổng bằng 180°. Phụ nhau: tổng bằng 90°. Đừng nhầm hai khái niệm này.',
        tags: ['góc kề bù'],
      };
    }
    if (slot % 3 === 1) {
      const val = a;
      return {
        stem: `Hai đường thẳng xx' và yy' cắt nhau tại O. Biết góc xOy = ${a}°. Tính số đo góc x'Oy' (góc đối đỉnh với góc xOy).`,
        correct: deg(val),
        numeric: val,
        distractors: dd(val, [180 - a, 90 - a, 360 - a, 180 + a]),
        solution: `Hai góc đối đỉnh thì BẰNG NHAU, nên góc x'Oy' = góc xOy = ${a}°. Đáp án ${fmt(180 - a)}° là số đo góc xOy' — góc KỀ BÙ với góc xOy, không phải góc đối đỉnh.`,
        steps: [`góc x'Oy' và góc xOy là hai góc đối đỉnh`, `Hai góc đối đỉnh bằng nhau ⇒ góc x'Oy' = ${val}°`],
        hint: 'Hai góc đối đỉnh có hai cạnh của góc này là tia đối của hai cạnh góc kia, và chúng bằng nhau.',
        tags: ['góc đối đỉnh'],
      };
    }
    const b = ri(r, 2, 12) * 5;
    const val = a + b;
    return {
      stem: `Tia Oy nằm giữa hai tia Ox và Oz. Biết góc xOy = ${a}° và góc yOz = ${b}°. Tính số đo góc xOz.`,
      correct: deg(val),
      numeric: val,
      distractors: dd(val, [Math.abs(a - b), 180 - a - b, (a + b) / 2, 180 - Math.abs(a - b)]),
      solution: `Tia Oy nằm giữa hai tia Ox và Oz nên góc xOy + góc yOz = góc xOz. Thay số: ${a}° + ${b}° = ${val}°. Trừ hai góc (ra ${fmt(Math.abs(a - b))}°) chỉ dùng khi biết góc lớn và một góc con, không phải bài này.`,
      steps: [`Oy nằm giữa Ox và Oz ⇒ góc xOy + góc yOz = góc xOz`, `${a}° + ${b}° = ${val}°`],
      hint: 'Tia nằm giữa thì hai góc nhỏ CỘNG lại bằng góc lớn.',
      tags: ['cộng góc'],
    };
  }

  if (lvl === 1) {
    if (slot % 2 === 0) {
      const d = ri(r, 2, 14) * 10;
      const big = (180 + d) / 2;
      const small = (180 - d) / 2;
      return {
        stem: `Hai góc xOy và yOz kề bù. Biết góc xOy lớn hơn góc yOz là ${d}°. Tính số đo góc xOy.`,
        correct: deg(big),
        numeric: big,
        distractors: dd(big, [small, 180 - d, d, 90]),
        solution: `Hai góc kề bù nên góc xOy + góc yOz = 180°, đồng thời góc xOy − góc yOz = ${d}°. Đây là bài tìm hai số biết tổng và hiệu: góc xOy = (180° + ${d}°) : 2 = ${fmt(180 + d)}° : 2 = ${fmt(big)}°, góc yOz = (180° − ${d}°) : 2 = ${fmt(small)}°. Thử lại: ${fmt(big)}° + ${fmt(small)}° = 180° và ${fmt(big)}° − ${fmt(small)}° = ${d}° ✓. Lỗi hay gặp là quên chia 2 sau khi cộng tổng với hiệu.`,
        steps: [
          `Tổng hai góc = 180°, hiệu hai góc = ${d}°`,
          `Góc lớn = (180° + ${d}°) : 2 = ${fmt(big)}°`,
          `Góc nhỏ = (180° − ${d}°) : 2 = ${fmt(small)}°`,
        ],
        hint: 'Biết tổng và hiệu: số lớn = (tổng + hiệu) : 2.',
        tags: ['góc kề bù', 'tổng hiệu'],
      };
    }
    const k = pick(r, [2, 3, 4, 5]);
    const small = 180 / (k + 1);
    const big = small * k;
    return {
      stem: `Hai góc xOy và yOz kề bù. Biết góc xOy gấp ${k} lần góc yOz. Tính số đo góc yOz.`,
      correct: deg(small),
      numeric: small,
      distractors: dd(small, [big, 180 / k, 180 - k, small * 2]),
      solution: `Hai góc kề bù nên góc xOy + góc yOz = 180°. Coi góc yOz là 1 phần thì góc xOy là ${k} phần, tổng cộng ${k} + 1 = ${k + 1} phần ứng với 180°. Giá trị một phần: 180° : ${k + 1} = ${fmt(small)}°, đó chính là góc yOz; còn góc xOy = ${k} × ${fmt(small)}° = ${fmt(big)}°. Chia 180° cho ${k} (ra ${fmt(180 / k)}°) là sai vì đã bỏ quên phần của chính góc yOz.`,
      steps: [
        `góc xOy + góc yOz = 180°`,
        `Tổng số phần: ${k} + 1 = ${k + 1} phần`,
        `góc yOz = 180° : ${k + 1} = ${fmt(small)}°`,
        `Thử lại: ${fmt(small)}° + ${fmt(big)}° = 180° ✓`,
      ],
      hint: 'Bài toán tổng – tỉ: chia tổng cho SỐ PHẦN, nhớ cộng cả phần của số bé.',
      tags: ['góc kề bù', 'tổng tỉ'],
    };
  }

  // lvl 2 — kết hợp đối đỉnh với kề bù, hoặc suy luận ngược từ tổng hai góc
  if (slot % 2 === 0) {
    const d = ri(r, 2, 12) * 10;
    const aoc = (180 + d) / 2;
    const aod = (180 - d) / 2;
    return {
      stem: `Hai đường thẳng AB và CD cắt nhau tại O. Biết góc AOC lớn hơn góc AOD là ${d}°. Tính số đo góc BOD.`,
      correct: deg(aoc),
      numeric: aoc,
      distractors: dd(aoc, [aod, d, 180 - d, 90]),
      solution: `Hai góc AOC và AOD kề bù (vì OC và OD là hai tia đối nhau) nên tổng bằng 180°, lại có hiệu bằng ${d}°. Suy ra góc AOC = (180° + ${d}°) : 2 = ${fmt(aoc)}° và góc AOD = ${fmt(aod)}°. Mặt khác góc BOD ĐỐI ĐỈNH với góc AOC nên góc BOD = góc AOC = ${fmt(aoc)}°. Bẫy: nhiều bạn lấy góc BOD = góc AOD = ${fmt(aod)}° vì thấy hai góc "trông giống nhau", nhưng BOD đối đỉnh với AOC chứ không phải với AOD.`,
      steps: [
        `góc AOC + góc AOD = 180° (kề bù); hiệu = ${d}°`,
        `góc AOC = (180° + ${d}°) : 2 = ${fmt(aoc)}°`,
        `góc BOD đối đỉnh với góc AOC ⇒ góc BOD = ${fmt(aoc)}°`,
      ],
      hint: 'Xác định cặp đối đỉnh cho đúng: BOD đối đỉnh với AOC, còn BOC đối đỉnh với AOD.',
      tags: ['góc đối đỉnh', 'góc kề bù', 'nhiều bước'],
    };
  }
  const each = ri(r, 3, 16) * 5;
  const S = 2 * each;
  const val = 180 - each;
  return {
    stem: `Hai đường thẳng cắt nhau tại O tạo thành bốn góc. Biết tổng số đo của hai góc đối đỉnh trong số đó bằng ${S}°. Tính số đo mỗi góc còn lại (hai góc kia cũng đối đỉnh với nhau).`,
    correct: deg(val),
    numeric: val,
    distractors: dd(val, [each, S, 180 - S, 90]),
    solution: `Hai góc đối đỉnh BẰNG NHAU, mà tổng của chúng là ${S}° nên mỗi góc bằng ${S}° : 2 = ${each}°. Mỗi góc còn lại kề bù với góc ${each}° nên có số đo 180° − ${each}° = ${val}°. Kiểm tra: tổng bốn góc quanh điểm O là ${each}° × 2 + ${val}° × 2 = 360° ✓. Trả lời ${each}° là do quên bước cuối — đó mới là số đo của hai góc ĐÃ BIẾT.`,
    steps: [
      `Hai góc đối đỉnh bằng nhau ⇒ mỗi góc = ${S}° : 2 = ${each}°`,
      `Góc còn lại kề bù với nó: 180° − ${each}° = ${val}°`,
      `Thử lại tổng bốn góc: 2 × ${each}° + 2 × ${val}° = 360° ✓`,
    ],
    hint: 'Tổng bốn góc tạo bởi hai đường thẳng cắt nhau luôn bằng 360°.',
    tags: ['góc đối đỉnh', 'nhiều bước'],
  };
}

/** GEO04 — tia phân giác: chia góc thành hai phần bằng nhau. */
function GEO04(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    if (slot % 2 === 0) {
      const half = ri(r, 3, 17) * 5;
      const full = 2 * half;
      return {
        stem: `Tia Oz là tia phân giác của góc xOy, biết góc xOy = ${full}°. Tính số đo góc xOz.`,
        correct: deg(half),
        numeric: half,
        distractors: dd(half, [full, 180 - full, 90 - half, half * 3]),
        solution: `Tia phân giác chia góc thành hai góc bằng nhau: góc xOz = góc zOy = góc xOy : 2 = ${full}° : 2 = ${half}°. Giữ nguyên ${full}° là quên chia đôi, còn 180° − ${full}° = ${fmt(180 - full)}° là nhầm sang góc kề bù.`,
        steps: [`Oz là phân giác ⇒ góc xOz = góc zOy = góc xOy : 2`, `góc xOz = ${full}° : 2 = ${half}°`],
        hint: 'Tia phân giác chia góc làm hai phần bằng nhau, mỗi phần bằng nửa góc ban đầu.',
        tags: ['tia phân giác'],
      };
    }
    const half = ri(r, 4, 17) * 5;
    const full = 2 * half;
    return {
      stem: `Tia Ot là tia phân giác của góc mOn, biết góc mOt = ${half}°. Tính số đo góc mOn.`,
      correct: deg(full),
      numeric: full,
      distractors: dd(full, [half, half / 2, 180 - half, half * 3]),
      solution: `Ot là phân giác của góc mOn nên góc mOt = góc tOn = ${half}°, do đó góc mOn = ${half}° + ${half}° = ${full}°. Ở dạng này phải NHÂN 2 chứ không chia 2 — chia đôi sẽ ra ${fmt(half / 2)}°, tức làm ngược chiều bài toán.`,
      steps: [`góc mOt = góc tOn = ${half}°`, `góc mOn = 2 × ${half}° = ${full}°`],
      hint: 'Biết một nửa góc thì nhân đôi để có cả góc.',
      tags: ['tia phân giác'],
    };
  }

  if (lvl === 1) {
    if (slot % 2 === 0) {
      const a = ri(r, 2, 15) * 10;
      const rest = 180 - a;
      const val = rest / 2;
      return {
        stem: `Hai góc xOy và yOz kề bù, biết góc xOy = ${a}°. Tia Ot là tia phân giác của góc yOz. Tính số đo góc yOt.`,
        correct: deg(val),
        numeric: val,
        distractors: dd(val, [rest, a / 2, 180 - a / 2, 90 - a / 2]),
        solution: `Bước 1: hai góc kề bù nên góc yOz = 180° − ${a}° = ${rest}°. Bước 2: Ot là phân giác của góc yOz nên góc yOt = ${rest}° : 2 = ${fmt(val)}°. Dừng lại ở ${rest}° là quên chia đôi; lấy ${a}° : 2 = ${fmt(a / 2)}° là chia nhầm góc xOy.`,
        steps: [
          `góc yOz = 180° − ${a}° = ${rest}°`,
          `Ot là phân giác góc yOz ⇒ góc yOt = ${rest}° : 2 = ${fmt(val)}°`,
        ],
        hint: 'Tìm góc yOz bằng tính chất kề bù trước, rồi mới chia đôi.',
        tags: ['tia phân giác', 'góc kề bù', 'nhiều bước'],
      };
    }
    const a = ri(r, 3, 10) * 10;
    const b = ri(r, 3, 10) * 10;
    const total = a + b;
    const val = total / 2 - a;
    if (val <= 0) return GEO04({ ...ctx, slot: slot + 1 });
    return {
      stem: `Tia Oy nằm giữa hai tia Ox và Oz. Biết góc xOy = ${a}° và góc yOz = ${b}°. Tia Om là tia phân giác của góc xOz. Tính số đo góc yOm.`,
      correct: deg(val),
      numeric: val,
      distractors: dd(val, [total / 2, Math.abs(b - a), total, b / 2, a / 2]),
      solution: `Bước 1: Oy nằm giữa Ox và Oz nên góc xOz = ${a}° + ${b}° = ${total}°. Bước 2: Om là phân giác của góc xOz nên góc xOm = ${total}° : 2 = ${fmt(total / 2)}°. Bước 3: vì góc xOm = ${fmt(total / 2)}° > góc xOy = ${a}° nên tia Oy nằm giữa Ox và Om, suy ra góc yOm = góc xOm − góc xOy = ${fmt(total / 2)}° − ${a}° = ${fmt(val)}°. Trả lời ${fmt(total / 2)}° là quên trừ đi góc xOy.`,
      steps: [
        `góc xOz = ${a}° + ${b}° = ${total}°`,
        `góc xOm = ${total}° : 2 = ${fmt(total / 2)}°`,
        `góc yOm = ${fmt(total / 2)}° − ${a}° = ${fmt(val)}°`,
      ],
      hint: 'Vẽ đủ ba tia theo thứ tự rồi lấy hiệu hai góc chung cạnh Ox.',
      tags: ['tia phân giác', 'cộng góc', 'nhiều bước'],
    };
  }

  // lvl 2 — hai tia phân giác của hai góc kề bù luôn vuông góc; hoặc phân giác lồng nhau
  if (slot % 2 === 0) {
    const a = ri(r, 2, 15) * 10;
    const val = 90;
    return {
      stem: `Hai góc xOy và yOz kề bù, biết góc xOy = ${a}°. Tia Om là tia phân giác của góc xOy, tia On là tia phân giác của góc yOz. Tính số đo góc mOn.`,
      correct: deg(val),
      numeric: val,
      distractors: dd(val, [a / 2, (180 - a) / 2, 180 - a, a]),
      solution: `Om là phân giác góc xOy nên góc yOm = ${a}° : 2 = ${fmt(a / 2)}°. Hai góc kề bù nên góc yOz = 180° − ${a}° = ${fmt(180 - a)}°, On là phân giác của nó nên góc yOn = ${fmt((180 - a) / 2)}°. Tia Oy nằm giữa Om và On, do đó góc mOn = ${fmt(a / 2)}° + ${fmt((180 - a) / 2)}° = (${a}° + ${fmt(180 - a)}°) : 2 = 180° : 2 = ${val}°. Kết quả LUÔN bằng 90° dù góc xOy bằng bao nhiêu: hai tia phân giác của hai góc kề bù thì vuông góc với nhau.`,
      steps: [
        `góc yOm = ${a}° : 2 = ${fmt(a / 2)}°`,
        `góc yOz = 180° − ${a}° = ${fmt(180 - a)}° ⇒ góc yOn = ${fmt((180 - a) / 2)}°`,
        `góc mOn = ${fmt(a / 2)}° + ${fmt((180 - a) / 2)}° = 180° : 2 = ${val}°`,
      ],
      hint: 'Cộng hai nửa góc lại chính là nửa tổng hai góc kề bù.',
      tags: ['tia phân giác', 'góc kề bù', 'suy luận'],
    };
  }
  const full = ri(r, 2, 8) * 20;
  const val = (3 * full) / 4;
  return {
    stem: `Cho góc xOy = ${full}°. Tia Oz là tia phân giác của góc xOy, tia Ot là tia phân giác của góc xOz. Tính số đo góc tOy.`,
    correct: deg(val),
    numeric: val,
    distractors: dd(val, [full / 2, full / 4, full, 180 - val]),
    solution: `Bước 1: Oz là phân giác góc xOy nên góc xOz = ${full}° : 2 = ${fmt(full / 2)}°. Bước 2: Ot là phân giác góc xOz nên góc xOt = ${fmt(full / 2)}° : 2 = ${fmt(full / 4)}°. Bước 3: tia Ot nằm giữa Ox và Oy nên góc tOy = góc xOy − góc xOt = ${full}° − ${fmt(full / 4)}° = ${fmt(val)}°. Đáp án ${fmt(full / 4)}° chính là góc xOt — nhiều bạn dừng ở bước 2 mà quên câu hỏi đang hỏi góc tOy.`,
    steps: [
      `góc xOz = ${full}° : 2 = ${fmt(full / 2)}°`,
      `góc xOt = ${fmt(full / 2)}° : 2 = ${fmt(full / 4)}°`,
      `góc tOy = ${full}° − ${fmt(full / 4)}° = ${fmt(val)}°`,
    ],
    hint: 'Chia đôi hai lần liên tiếp được một phần tư góc ban đầu; đọc kỹ đề xem hỏi góc nào.',
    tags: ['tia phân giác', 'nhiều bước'],
  };
}

// ===========================================================================
// CHƯƠNG TRI — TAM GIÁC
// ===========================================================================

/** TRI01 — tổng ba góc trong một tam giác bằng 180°. */
function TRI01(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    if (slot % 2 === 0) {
      const a = ri(r, 4, 18) * 5;
      const b = ri(r, 4, Math.floor((170 - a) / 5)) * 5;
      const val = 180 - a - b;
      return {
        stem: `Tam giác ABC có góc A = ${a}° và góc B = ${b}°. Tính số đo góc C.`,
        correct: deg(val),
        numeric: val,
        distractors: dd(val, [a + b, 360 - a - b, 90 - a - b, 180 - a, 180 - b]),
        solution: `Tổng ba góc trong một tam giác luôn bằng 180°, nên góc C = 180° − góc A − góc B = 180° − ${a}° − ${b}° = ${val}°. Kiểm tra lại: ${a}° + ${b}° + ${val}° = 180° ✓. Trả lời ${fmt(a + b)}° là do cộng hai góc đã cho mà quên trừ khỏi 180°.`,
        steps: [`góc A + góc B + góc C = 180°`, `góc C = 180° − ${a}° − ${b}° = ${val}°`],
        hint: 'Tổng ba góc trong một tam giác bằng 180°.',
        tags: ['tổng ba góc', 'tam giác'],
      };
    }
    const b = ri(r, 2, 16) * 5;
    const val = 90 - b;
    return {
      stem: `Tam giác ABC vuông tại A có góc B = ${b}°. Tính số đo góc C.`,
      correct: deg(val),
      numeric: val,
      distractors: dd(val, [180 - b, 90 + b, b, 180 - 2 * b]),
      solution: `Tam giác vuông tại A nghĩa là góc A = 90°. Tổng ba góc bằng 180° nên góc B + góc C = 180° − 90° = 90°, suy ra góc C = 90° − ${b}° = ${val}°. Hai góc nhọn của tam giác vuông luôn PHỤ NHAU. Lấy 180° − ${b}° = ${fmt(180 - b)}° là quên trừ đi góc vuông.`,
      steps: [`góc A = 90°`, `góc B + góc C = 180° − 90° = 90°`, `góc C = 90° − ${b}° = ${val}°`],
      hint: 'Trong tam giác vuông, hai góc nhọn có tổng bằng 90°.',
      tags: ['tổng ba góc', 'tam giác vuông'],
    };
  }

  if (lvl === 1) {
    if (slot % 2 === 0) {
      const a = ri(r, 2, 17) * 10;
      const val = (180 - a) / 2;
      return {
        stem: `Tam giác ABC cân tại A có góc ở đỉnh A = ${a}°. Tính số đo góc B.`,
        correct: deg(val),
        numeric: val,
        distractors: dd(val, [180 - a, a / 2, 90 - a, 180 - 2 * a]),
        solution: `Tam giác cân tại A có hai góc ở đáy bằng nhau: góc B = góc C. Tổng ba góc bằng 180° nên góc B + góc C = 180° − ${a}° = ${fmt(180 - a)}°, suy ra góc B = ${fmt(180 - a)}° : 2 = ${fmt(val)}°. Dừng ở ${fmt(180 - a)}° là quên chia đôi cho HAI góc đáy.`,
        steps: [
          `Tam giác cân tại A ⇒ góc B = góc C`,
          `góc B + góc C = 180° − ${a}° = ${fmt(180 - a)}°`,
          `góc B = ${fmt(180 - a)}° : 2 = ${fmt(val)}°`,
        ],
        hint: 'Tam giác cân có hai góc ở đáy bằng nhau, hãy chia đôi phần còn lại của 180°.',
        tags: ['tổng ba góc', 'tam giác cân'],
      };
    }
    const b = ri(r, 3, 17) * 5;
    const val = 180 - 2 * b;
    return {
      stem: `Tam giác ABC cân tại A có góc ở đáy B = ${b}°. Tính số đo góc A.`,
      correct: deg(val),
      numeric: val,
      distractors: dd(val, [180 - b, 2 * b, 90 - b, b]),
      solution: `Tam giác cân tại A nên góc C = góc B = ${b}°. Tổng ba góc bằng 180° nên góc A = 180° − ${b}° − ${b}° = 180° − ${fmt(2 * b)}° = ${val}°. Chỉ trừ MỘT lần ${b}° (ra ${fmt(180 - b)}°) là quên rằng góc C cũng bằng ${b}°.`,
      steps: [`góc C = góc B = ${b}°`, `góc A = 180° − 2 × ${b}° = ${val}°`],
      hint: 'Góc ở đáy còn lại cũng bằng góc đã cho, phải trừ đi hai lần.',
      tags: ['tổng ba góc', 'tam giác cân'],
    };
  }

  // lvl 2 — ba góc tỉ lệ, hoặc biết tổng và hiệu hai góc
  if (slot % 2 === 0) {
    const ratio = pick(r, [
      [1, 2, 3],
      [2, 3, 4],
      [1, 3, 5],
      [2, 3, 5],
      [3, 4, 5],
      [1, 1, 4],
      [1, 2, 2],
    ]);
    const sum = ratio[0] + ratio[1] + ratio[2];
    const unit = 180 / sum;
    const val = unit * ratio[2];
    return {
      stem: `Tam giác ABC có số đo ba góc A, B, C lần lượt tỉ lệ với ${ratio[0]}; ${ratio[1]}; ${ratio[2]}. Tính số đo góc C.`,
      correct: deg(val),
      numeric: val,
      distractors: dd(val, [unit, unit * ratio[0], unit * ratio[1], 180 / ratio[2]]),
      solution: `Đặt góc A = ${ratio[0]}k, góc B = ${ratio[1]}k, góc C = ${ratio[2]}k. Tổng ba góc bằng 180° nên (${ratio[0]} + ${ratio[1]} + ${ratio[2]})k = ${sum}k = 180°, suy ra k = 180° : ${sum} = ${fmt(unit)}°. Vậy góc C = ${ratio[2]} × ${fmt(unit)}° = ${fmt(val)}°; kiểm tra ${fmt(unit * ratio[0])}° + ${fmt(unit * ratio[1])}° + ${fmt(val)}° = 180° ✓. Lỗi hay gặp là dừng lại ở giá trị một phần ${fmt(unit)}° mà quên nhân với ${ratio[2]}.`,
      steps: [
        `Đặt góc A = ${ratio[0]}k, góc B = ${ratio[1]}k, góc C = ${ratio[2]}k`,
        `${sum}k = 180° ⇒ k = ${fmt(unit)}°`,
        `góc C = ${ratio[2]} × ${fmt(unit)}° = ${fmt(val)}°`,
      ],
      hint: 'Tổng số phần bằng nhau ứng với 180°, tìm giá trị một phần rồi nhân lại.',
      tags: ['tổng ba góc', 'tổng tỉ', 'nhiều bước'],
    };
  }
  const a = ri(r, 2, 12) * 10;
  const d = ri(r, 1, Math.max(1, Math.floor((170 - a) / 10))) * 10;
  const val = (180 - a + d) / 2;
  const c3 = (180 - a - d) / 2;
  return {
    stem: `Tam giác ABC có góc A = ${a}°, biết góc B lớn hơn góc C là ${d}°. Tính số đo góc B.`,
    correct: deg(val),
    numeric: val,
    distractors: dd(val, [c3, 180 - a, (180 - a) / 2, d]),
    solution: `Tổng ba góc bằng 180° nên góc B + góc C = 180° − ${a}° = ${fmt(180 - a)}°. Kết hợp với góc B − góc C = ${d}°, đây là bài tìm hai số biết tổng và hiệu: góc B = (${fmt(180 - a)}° + ${d}°) : 2 = ${fmt(val)}° và góc C = (${fmt(180 - a)}° − ${d}°) : 2 = ${fmt(c3)}°. Thử lại: ${a}° + ${fmt(val)}° + ${fmt(c3)}° = 180° ✓. Quên chia 2 hoặc lấy nhầm góc C (${fmt(c3)}°) là hai lỗi thường gặp.`,
    steps: [
      `góc B + góc C = 180° − ${a}° = ${fmt(180 - a)}°`,
      `góc B = (${fmt(180 - a)}° + ${d}°) : 2 = ${fmt(val)}°`,
      `góc C = ${fmt(val)}° − ${d}° = ${fmt(c3)}°`,
    ],
    hint: 'Tính tổng hai góc còn lại trước, rồi dùng công thức tổng – hiệu.',
    tags: ['tổng ba góc', 'tổng hiệu', 'nhiều bước'],
  };
}

/** TRI02 — góc ngoài của tam giác bằng tổng hai góc trong không kề với nó. */
function TRI02(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    const a = ri(r, 4, 16) * 5;
    const b = ri(r, 4, Math.floor((170 - a) / 5)) * 5;
    const c = 180 - a - b;
    if (slot % 2 === 0) {
      const val = a + b;
      return {
        stem: `Tam giác ABC có góc A = ${a}° và góc B = ${b}°. Tính số đo góc ngoài của tam giác tại đỉnh C.`,
        correct: deg(val),
        numeric: val,
        distractors: dd(val, [c, 180 - a, 180 - b, (a + b) / 2]),
        solution: `Góc ngoài tại một đỉnh bằng TỔNG hai góc trong không kề với nó, nên góc ngoài tại C = góc A + góc B = ${a}° + ${b}° = ${val}°. Có thể kiểm tra bằng cách khác: góc C = 180° − ${a}° − ${b}° = ${c}°, mà góc ngoài tại C kề bù với góc C nên bằng 180° − ${c}° = ${val}° ✓. Đáp án ${c}° là số đo góc TRONG tại C, không phải góc ngoài.`,
        steps: [
          `Góc ngoài tại C = góc A + góc B`,
          `= ${a}° + ${b}° = ${val}°`,
          `Kiểm tra: góc C = ${c}°, góc ngoài kề bù ⇒ 180° − ${c}° = ${val}°`,
        ],
        hint: 'Góc ngoài của tam giác bằng tổng hai góc trong không kề với nó.',
        tags: ['góc ngoài', 'tam giác'],
      };
    }
    const e = a + b;
    return {
      stem: `Tam giác ABC có góc ngoài tại đỉnh C bằng ${e}°. Tính số đo góc ACB (góc trong tại đỉnh C).`,
      correct: deg(c),
      numeric: c,
      distractors: dd(c, [e, 90 - c, 360 - e, e / 2]),
      solution: `Góc ngoài tại C và góc trong ACB là hai góc KỀ BÙ nên có tổng bằng 180°. Do đó góc ACB = 180° − ${e}° = ${c}°. Kiểm tra: góc ngoài ${e}° đúng bằng tổng hai góc trong còn lại. Giữ nguyên ${e}° là chưa làm gì cả, còn 360° − ${e}° = ${fmt(360 - e)}° là nhầm với góc quanh một điểm.`,
      steps: [`Góc ngoài tại C kề bù với góc ACB`, `góc ACB = 180° − ${e}° = ${c}°`],
      hint: 'Góc ngoài và góc trong tại cùng một đỉnh là hai góc kề bù.',
      tags: ['góc ngoài', 'góc kề bù'],
    };
  }

  if (lvl === 1) {
    if (slot % 2 === 0) {
      const a = ri(r, 4, 16) * 5;
      const b = ri(r, 4, Math.floor((170 - a) / 5)) * 5;
      const e = a + b;
      return {
        stem: `Tam giác ABC có góc ngoài tại đỉnh C bằng ${e}° và góc A = ${a}°. Tính số đo góc B.`,
        correct: deg(b),
        numeric: b,
        distractors: dd(b, [180 - e - a, e + a, 180 - e, e / 2]),
        solution: `Góc ngoài tại C bằng tổng hai góc trong không kề: ${e}° = góc A + góc B. Suy ra góc B = ${e}° − ${a}° = ${b}°. Kiểm tra: góc C = 180° − ${e}° = ${fmt(180 - e)}°, tổng ba góc ${a}° + ${b}° + ${fmt(180 - e)}° = 180° ✓. Lấy 180° − ${e}° − ${a}° = ${fmt(180 - e - a)}° là nhầm góc ngoài thành góc trong.`,
        steps: [`góc ngoài tại C = góc A + góc B`, `${e}° = ${a}° + góc B`, `góc B = ${e}° − ${a}° = ${b}°`],
        hint: 'Viết đẳng thức góc ngoài = tổng hai góc trong rồi chuyển vế.',
        tags: ['góc ngoài', 'suy luận ngược'],
      };
    }
    const a = ri(r, 2, 16) * 10;
    const base = (180 - a) / 2;
    const val = 180 - base;
    return {
      stem: `Tam giác ABC cân tại A có góc A = ${a}°. Tính số đo góc ngoài của tam giác tại đỉnh B.`,
      correct: deg(val),
      numeric: val,
      distractors: dd(val, [base, 180 - a, a + base, a / 2]),
      solution: `Bước 1: tam giác cân tại A nên góc B = góc C = (180° − ${a}°) : 2 = ${fmt(base)}°. Bước 2: góc ngoài tại B kề bù với góc B nên bằng 180° − ${fmt(base)}° = ${fmt(val)}°. Cách kiểm tra nhanh: góc ngoài tại B = góc A + góc C = ${a}° + ${fmt(base)}° = ${fmt(val)}° ✓. Đáp án ${fmt(base)}° chính là góc TRONG tại B.`,
      steps: [
        `góc B = góc C = (180° − ${a}°) : 2 = ${fmt(base)}°`,
        `Góc ngoài tại B = 180° − ${fmt(base)}° = ${fmt(val)}°`,
        `Đối chiếu: góc A + góc C = ${a}° + ${fmt(base)}° = ${fmt(val)}° ✓`,
      ],
      hint: 'Tính góc ở đáy trước, sau đó lấy 180° trừ đi để có góc ngoài.',
      tags: ['góc ngoài', 'tam giác cân', 'nhiều bước'],
    };
  }

  // lvl 2 — hai góc ngoài, hoặc quan hệ bội giữa góc ngoài và góc trong
  if (slot % 2 === 0) {
    const a = ri(r, 3, 14) * 5;
    const b = ri(r, 4, Math.floor((175 - a) / 5)) * 5;
    const c = 180 - a - b;
    const e1 = 180 - b;
    const e2 = 180 - c;
    return {
      stem: `Tam giác ABC có góc ngoài tại đỉnh B bằng ${e1}° và góc ngoài tại đỉnh C bằng ${e2}°. Tính số đo góc A.`,
      correct: deg(a),
      numeric: a,
      distractors: dd(a, [360 - e1 - e2, e1 + e2 - 90, 180 - e1, (e1 + e2) / 2]),
      solution: `Cách 1: góc B = 180° − ${e1}° = ${b}° và góc C = 180° − ${e2}° = ${c}° (mỗi góc ngoài kề bù với góc trong tại đỉnh đó). Khi đó góc A = 180° − ${b}° − ${c}° = ${a}°. Cách 2: tổng ba góc ngoài của tam giác luôn bằng 360°, nên góc ngoài tại A = 360° − ${e1}° − ${e2}° = ${fmt(360 - e1 - e2)}°, do đó góc A = 180° − ${fmt(360 - e1 - e2)}° = ${a}°. Bẫy là lấy thẳng 360° − ${e1}° − ${e2}° = ${fmt(360 - e1 - e2)}° rồi trả lời ngay — đó mới là góc NGOÀI tại A.`,
      steps: [
        `góc B = 180° − ${e1}° = ${b}°`,
        `góc C = 180° − ${e2}° = ${c}°`,
        `góc A = 180° − ${b}° − ${c}° = ${a}°`,
      ],
      hint: 'Đổi từng góc ngoài về góc trong bằng tính chất kề bù rồi mới dùng tổng ba góc.',
      tags: ['góc ngoài', 'nhiều bước'],
    };
  }
  const k = pick(r, [2, 3, 5]);
  const val = 180 / (k + 1);
  return {
    stem: `Tam giác ABC có góc ngoài tại đỉnh A gấp ${k} lần góc A. Tính số đo góc A.`,
    correct: deg(val),
    numeric: val,
    distractors: dd(val, [180 / k, val * k, 180 - 180 / k, 90 / k]),
    solution: `Góc ngoài tại A kề bù với góc A nên góc ngoài = 180° − góc A. Theo đề: 180° − góc A = ${k} × góc A, suy ra 180° = ${k + 1} × góc A, do đó góc A = 180° : ${k + 1} = ${fmt(val)}°. Thử lại: góc ngoài = 180° − ${fmt(val)}° = ${fmt(180 - val)}° = ${k} × ${fmt(val)}° ✓. Chia 180° cho ${k} (ra ${fmt(180 / k)}°) là quên cộng phần của chính góc A.`,
    steps: [
      `Góc ngoài tại A = 180° − góc A`,
      `180° − góc A = ${k} × góc A ⇒ ${k + 1} × góc A = 180°`,
      `góc A = 180° : ${k + 1} = ${fmt(val)}°`,
    ],
    hint: 'Đặt góc A là 1 phần thì góc ngoài là ' + k + ' phần, tổng ' + (k + 1) + ' phần ứng với 180°.',
    tags: ['góc ngoài', 'suy luận ngược'],
  };
}

/** TRI03 — bất đẳng thức tam giác: tổng hai cạnh bất kì LỚN HƠN cạnh còn lại (dấu chặt). */
function TRI03(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    if (slot % 2 === 0) {
      const x = ri(r, 3, 9);
      const y = x + ri(r, 1, 5);
      const z = y + ri(r, 1, x - 1);
      const good = `${x} cm; ${y} cm; ${z} cm`;
      const bad1 = `${x} cm; ${y} cm; ${x + y} cm`;
      const bad2 = `${x} cm; ${y} cm; ${x + y + 2} cm`;
      const bad3 = `${x} cm; ${x} cm; ${2 * x + 3} cm`;
      const bad4 = `${y} cm; ${z} cm; ${y + z + 1} cm`;
      return {
        stem: `Bộ ba độ dài nào sau đây có thể là độ dài ba cạnh của một tam giác?`,
        correct: good,
        distractors: td(good, [bad1, bad2, bad3, bad4]),
        solution: `Điều kiện tồn tại tam giác: tổng hai cạnh bất kì phải LỚN HƠN cạnh còn lại (dấu > chặt, không được lấy dấu =). Với bộ ${good}: ${x} + ${y} = ${x + y} > ${z} ✓, ${x} + ${z} = ${x + z} > ${y} ✓, ${y} + ${z} = ${y + z} > ${x} ✓ nên dựng được tam giác. Bộ ${bad1} có ${x} + ${y} = ${x + y} đúng bằng cạnh còn lại — ba điểm khi đó THẲNG HÀNG, không tạo thành tam giác. Các bộ còn lại đều có một cạnh dài hơn tổng hai cạnh kia.`,
        steps: [
          `Chỉ cần kiểm tra: tổng hai cạnh NHỎ có lớn hơn cạnh lớn nhất không`,
          `${x} + ${y} = ${x + y} > ${z} ⇒ bộ ${good} thỏa mãn`,
          `Trường hợp tổng hai cạnh nhỏ = cạnh lớn (như ${bad1}) bị loại vì ba điểm thẳng hàng`,
        ],
        hint: 'Chỉ cần so sánh tổng hai cạnh ngắn nhất với cạnh dài nhất, và dấu phải là > chặt.',
        tags: ['bất đẳng thức tam giác'],
      };
    }
    const a = ri(r, 4, 12);
    const b = a + ri(r, 1, 6);
    const lo = b - a;
    const hi = a + b;
    const val = ri(r, lo + 1, hi - 1);
    return {
      stem: `Một tam giác có hai cạnh dài ${a} cm và ${b} cm. Độ dài nào sau đây có thể là độ dài cạnh thứ ba?`,
      correct: uv(val, 'cm'),
      distractors: ud(uv(val, 'cm'), [
        [hi, 'cm'],
        [lo, 'cm'],
        [hi + 2, 'cm'],
        [lo === 0 ? 0.5 : lo - 1, 'cm'],
      ]),
      solution: `Gọi cạnh thứ ba là x. Bất đẳng thức tam giác cho ${b} − ${a} < x < ${b} + ${a}, tức ${lo} < x < ${hi} (hai dấu đều CHẶT). Trong các phương án chỉ có ${val} cm nằm trong khoảng đó. Giá trị ${hi} cm bị loại vì khi đó ${a} + ${b} = x, ba đỉnh thẳng hàng; ${lo} cm cũng bị loại vì ${a} + x = ${b} vừa đúng bằng cạnh kia.`,
      steps: [
        `Điều kiện: hiệu hai cạnh < cạnh thứ ba < tổng hai cạnh`,
        `${b} − ${a} < x < ${b} + ${a} ⇒ ${lo} < x < ${hi}`,
        `Chọn giá trị nằm trong khoảng: ${val} cm`,
      ],
      hint: 'Cạnh thứ ba phải lớn hơn hiệu và nhỏ hơn tổng hai cạnh kia, không được bằng.',
      tags: ['bất đẳng thức tam giác'],
    };
  }

  if (lvl === 1) {
    const a = ri(r, 3, 12);
    const b = a + ri(r, 2, 8);
    const lo = b - a;
    const hi = a + b;
    if (slot % 2 === 0) {
      const good = `${lo} cm < x < ${hi} cm`;
      return {
        stem: `Một tam giác có hai cạnh bằng ${a} cm và ${b} cm, cạnh thứ ba có độ dài x. Khẳng định nào sau đây đúng?`,
        correct: good,
        distractors: td(good, [
          `${lo} cm ≤ x ≤ ${hi} cm`,
          `${a} cm < x < ${b} cm`,
          `x > ${hi} cm`,
          `${hi} cm < x < ${a * b} cm`,
        ]),
        solution: `Áp dụng bất đẳng thức tam giác cho cạnh x: x < ${a} + ${b} = ${hi} và x > ${b} − ${a} = ${lo} (vì ${a} + x > ${b}). Vậy ${lo} cm < x < ${hi} cm. Hai dấu phải là dấu CHẶT: nếu x = ${hi} cm hoặc x = ${lo} cm thì ba đỉnh thẳng hàng, không có tam giác — đó chính là lí do khẳng định dùng dấu ≤ bị loại.`,
        steps: [
          `x < ${a} + ${b} = ${hi}`,
          `x > ${b} − ${a} = ${lo}`,
          `Kết luận: ${lo} < x < ${hi} (dấu chặt)`,
        ],
        hint: 'Khoảng giá trị của cạnh thứ ba nằm giữa HIỆU và TỔNG hai cạnh kia, hai đầu mút đều bị loại.',
        tags: ['bất đẳng thức tam giác', 'khoảng giá trị'],
      };
    }
    const val = hi - 1;
    return {
      stem: `Một tam giác có hai cạnh bằng ${a} cm và ${b} cm, cạnh thứ ba có độ dài là một số nguyên xăng-ti-mét. Hỏi cạnh thứ ba dài nhất có thể bằng bao nhiêu?`,
      correct: uv(val, 'cm'),
      numeric: val,
      distractors: ud(
        uv(val, 'cm'),
        [
          [hi, 'cm'],
          [b, 'cm'],
          [hi + 1, 'cm'],
          [lo + 1, 'cm'],
        ],
        [val, 'cm'],
      ),
      solution: `Cạnh thứ ba x phải thỏa mãn x < ${a} + ${b} = ${hi} cm. Vì x là số nguyên nên giá trị lớn nhất là ${hi} − 1 = ${val} cm. Chọn ${hi} cm là sai: khi đó ${a} + ${b} = x, ba đỉnh thẳng hàng nên KHÔNG có tam giác. Kiểm tra ${val} cm: ${a} + ${b} = ${hi} > ${val} ✓ và ${a} + ${val} = ${a + val} > ${b} ✓.`,
      steps: [
        `x < ${a} + ${b} = ${hi}`,
        `x nguyên lớn nhất ⇒ x = ${hi} − 1 = ${val}`,
        `Thử lại: ${a} + ${b} = ${hi} > ${val} ✓`,
      ],
      hint: 'Vì dấu bất đẳng thức là chặt nên số nguyên lớn nhất phải nhỏ hơn tổng một đơn vị.',
      tags: ['bất đẳng thức tam giác', 'số nguyên'],
    };
  }

  // lvl 2 — đếm số giá trị nguyên, hoặc tam giác cân với hai độ dài cho trước
  if (slot % 2 === 0) {
    const a = ri(r, 4, 11);
    const b = a + ri(r, 2, 9);
    const lo = b - a;
    const hi = a + b;
    const val = 2 * a - 1;
    return {
      stem: `Một tam giác có hai cạnh bằng ${a} cm và ${b} cm, cạnh thứ ba có độ dài là một số nguyên xăng-ti-mét. Hỏi có bao nhiêu giá trị có thể của cạnh thứ ba?`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [val + 2, hi - lo, val + 1, hi, a + b - 1]),
      solution: `Cạnh thứ ba x thỏa mãn ${lo} < x < ${hi}, x nguyên nên x nhận các giá trị từ ${lo + 1} đến ${hi - 1}. Số giá trị = ${hi - 1} − ${lo + 1} + 1 = ${val}. Có thể nhớ nhanh: kết quả luôn bằng 2 × (cạnh nhỏ) − 1 = 2 × ${a} − 1 = ${val}. Nếu lấy cả hai đầu mút ${lo} và ${hi} sẽ đếm thừa 2 giá trị (ra ${val + 2}) — đó là lỗi quên dấu chặt.`,
      steps: [
        `${lo} < x < ${hi}, x nguyên`,
        `x nhận giá trị từ ${lo + 1} đến ${hi - 1}`,
        `Số giá trị = ${hi - 1} − ${lo + 1} + 1 = ${val}`,
      ],
      hint: 'Đếm số nguyên trong khoảng mở: lấy hai đầu mút bên trong rồi dùng công thức (cuối − đầu + 1).',
      tags: ['bất đẳng thức tam giác', 'đếm', 'nhiều bước'],
    };
  }
  const p = ri(r, 2, 7);
  const q = 2 * p + ri(r, 1, 5);
  const val = 2 * q + p;
  return {
    stem: `Một tam giác cân có hai cạnh dài ${p} cm và ${q} cm. Tính chu vi của tam giác đó.`,
    correct: uv(val, 'cm'),
    numeric: val,
    distractors: ud(
      uv(val, 'cm'),
      [
        [2 * p + q, 'cm'],
        [p + q, 'cm'],
        [3 * q, 'cm'],
        [3 * p, 'cm'],
      ],
      [val, 'cm'],
    ),
    solution: `Tam giác cân có hai cạnh bằng nhau, nên cạnh còn lại bằng ${p} cm hoặc ${q} cm — phải thử cả hai. Nếu hai cạnh bên đều bằng ${p} cm thì ba cạnh là ${p}; ${p}; ${q}, nhưng ${p} + ${p} = ${2 * p} < ${q} nên KHÔNG tồn tại tam giác. Vậy hai cạnh bên phải bằng ${q} cm, ba cạnh là ${q}; ${q}; ${p} (kiểm tra ${q} + ${p} = ${q + p} > ${q} ✓). Chu vi = ${q} + ${q} + ${p} = ${val} cm. Đáp án ${fmt(2 * p + q)} cm ứng với trường hợp bị loại vì vi phạm bất đẳng thức tam giác.`,
    steps: [
      `Trường hợp cạnh bên = ${p}: ${p} + ${p} = ${2 * p} < ${q} ⇒ loại`,
      `Trường hợp cạnh bên = ${q}: ${q} + ${p} = ${q + p} > ${q} ⇒ nhận`,
      `Chu vi = ${q} + ${q} + ${p} = ${val} cm`,
    ],
    hint: 'Xét cả hai khả năng cho cạnh bên rồi dùng bất đẳng thức tam giác để loại trường hợp không hợp lệ.',
    tags: ['bất đẳng thức tam giác', 'tam giác cân', 'nhiều bước'],
  };
}

/** TRI04 — cạnh lớn hơn đối diện góc lớn hơn (và ngược lại). */
function TRI04(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  // Trong tam giác ABC: cạnh BC đối diện góc A, CA đối diện góc B, AB đối diện góc C
  const SIDE: Record<string, string> = { A: 'BC', B: 'CA', C: 'AB' };

  if (lvl === 0) {
    if (slot % 2 === 0) {
      const s1 = ri(r, 4, 9);
      const s2 = s1 + ri(r, 1, 4);
      const s3 = s2 + ri(r, 1, 4);
      // Gán độ dài: BC = s3 (lớn nhất) ⇒ góc A lớn nhất
      const val = 'góc A';
      return {
        stem: `Tam giác ABC có AB = ${s1} cm, CA = ${s2} cm, BC = ${s3} cm. Trong ba góc của tam giác, góc nào có số đo lớn nhất?`,
        correct: val,
        distractors: td(val, ['góc C', 'góc B', 'ba góc bằng nhau', 'góc A và góc B bằng nhau và cùng lớn nhất']),
        solution: `Trong một tam giác, cạnh lớn hơn thì đối diện với góc lớn hơn. Cạnh lớn nhất là BC = ${s3} cm, mà BC đối diện với góc A, nên góc A là góc lớn nhất. Sắp xếp đầy đủ: AB = ${s1} < CA = ${s2} < BC = ${s3} nên góc C < góc B < góc A. Lỗi hay gặp là chọn góc C vì thấy chữ "C" xuất hiện trong tên cạnh BC — phải nhớ BC đối diện đỉnh A.`,
        steps: [
          `Sắp xếp ba cạnh: AB = ${s1} < CA = ${s2} < BC = ${s3}`,
          `Cạnh lớn nhất BC đối diện góc A`,
          `Vậy góc A lớn nhất`,
        ],
        hint: 'Cạnh BC đối diện đỉnh A, cạnh CA đối diện đỉnh B, cạnh AB đối diện đỉnh C.',
        tags: ['quan hệ góc cạnh'],
      };
    }
    const gA = ri(r, 4, 12) * 5;
    const gB = gA + ri(r, 1, 6) * 5;
    const gC = 180 - gA - gB;
    if (gC <= 0 || gC === gA || gC === gB) return TRI04({ ...ctx, slot: slot + 2 });
    const angles = [
      { name: 'A', v: gA },
      { name: 'B', v: gB },
      { name: 'C', v: gC },
    ].sort((p, q) => q.v - p.v);
    const val = SIDE[angles[0].name];
    return {
      stem: `Tam giác ABC có góc A = ${gA}°, góc B = ${gB}°, góc C = ${gC}°. Cạnh nào của tam giác có độ dài lớn nhất?`,
      correct: val,
      distractors: td(val, [SIDE[angles[2].name], SIDE[angles[1].name], 'ba cạnh bằng nhau']),
      solution: `Góc lớn hơn thì đối diện với cạnh lớn hơn. Góc lớn nhất là góc ${angles[0].name} = ${angles[0].v}°, mà cạnh đối diện góc ${angles[0].name} là ${val}, nên ${val} là cạnh lớn nhất. Thứ tự đầy đủ: góc ${angles[2].name} = ${angles[2].v}° < góc ${angles[1].name} = ${angles[1].v}° < góc ${angles[0].name} = ${angles[0].v}° nên ${SIDE[angles[2].name]} < ${SIDE[angles[1].name]} < ${val}. Chọn ${SIDE[angles[2].name]} là nhầm sang cạnh đối diện góc NHỎ nhất.`,
      steps: [
        `Góc lớn nhất: góc ${angles[0].name} = ${angles[0].v}°`,
        `Cạnh đối diện góc ${angles[0].name} là ${val}`,
        `Vậy ${val} là cạnh lớn nhất`,
      ],
      hint: 'Tìm góc lớn nhất trước, cạnh lớn nhất là cạnh đối diện góc đó.',
      tags: ['quan hệ góc cạnh'],
    };
  }

  if (lvl === 1) {
    if (slot % 2 === 0) {
      const gA = ri(r, 4, 11) * 5;
      const gB = gA + ri(r, 1, 5) * 5;
      const gC = 180 - gA - gB;
      if (gC <= 0 || gC === gA || gC === gB) return TRI04({ ...ctx, slot: slot + 2 });
      const angles = [
        { name: 'A', v: gA },
        { name: 'B', v: gB },
        { name: 'C', v: gC },
      ].sort((p, q) => p.v - q.v);
      const val = SIDE[angles[0].name];
      return {
        stem: `Tam giác ABC có góc A = ${gA}° và góc B = ${gB}°. Cạnh nào của tam giác có độ dài nhỏ nhất?`,
        correct: val,
        distractors: td(val, [SIDE[angles[2].name], SIDE[angles[1].name], 'ba cạnh bằng nhau']),
        solution: `Bước 1 — tính góc còn lại: góc C = 180° − ${gA}° − ${gB}° = ${gC}°. Bước 2 — so sánh ba góc: góc ${angles[0].name} = ${angles[0].v}° < góc ${angles[1].name} = ${angles[1].v}° < góc ${angles[2].name} = ${angles[2].v}°. Góc nhỏ nhất là góc ${angles[0].name}, cạnh đối diện nó là ${val} nên ${val} là cạnh nhỏ nhất. Nhiều bạn quên tính góc C rồi so sánh nhầm trong hai góc đã cho.`,
        steps: [
          `góc C = 180° − ${gA}° − ${gB}° = ${gC}°`,
          `Góc nhỏ nhất: góc ${angles[0].name} = ${angles[0].v}°`,
          `Cạnh nhỏ nhất là cạnh đối diện: ${val}`,
        ],
        hint: 'Phải tính đủ ba góc rồi mới so sánh, cạnh nhỏ nhất đối diện góc nhỏ nhất.',
        tags: ['quan hệ góc cạnh', 'tổng ba góc', 'nhiều bước'],
      };
    }
    const gB = ri(r, 5, 12) * 5;
    const gC = 90 - gB;
    const val = 'BC';
    return {
      stem: `Tam giác ABC vuông tại A có góc B = ${gB}°. Hãy cho biết cạnh nào của tam giác có độ dài lớn nhất.`,
      correct: val,
      distractors: td(val, ['AB', 'CA', 'AB và CA bằng nhau và cùng lớn nhất']),
      solution: `Tam giác vuông tại A nên góc A = 90°, còn góc C = 90° − ${gB}° = ${gC}°. Ba góc là 90°, ${gB}° và ${gC}°, trong đó góc A = 90° lớn nhất. Cạnh đối diện góc A là BC (cạnh huyền) nên BC là cạnh lớn nhất. Kết luận này luôn đúng: trong tam giác vuông, cạnh huyền luôn là cạnh lớn nhất.`,
      steps: [
        `góc A = 90°, góc C = 90° − ${gB}° = ${gC}°`,
        `Góc lớn nhất là góc A = 90°`,
        `Cạnh đối diện góc A là BC ⇒ BC lớn nhất`,
      ],
      hint: 'Trong tam giác vuông, cạnh huyền đối diện góc vuông nên luôn dài nhất.',
      tags: ['quan hệ góc cạnh', 'tam giác vuông'],
    };
  }

  // lvl 2 — sắp xếp toàn bộ ba cạnh hoặc ba góc
  if (slot % 2 === 0) {
    const gA = ri(r, 4, 11) * 5;
    const gB = gA + ri(r, 1, 5) * 5;
    const gC = 180 - gA - gB;
    if (gC <= 0 || gC === gA || gC === gB) return TRI04({ ...ctx, slot: slot + 2 });
    const angles = [
      { name: 'A', v: gA },
      { name: 'B', v: gB },
      { name: 'C', v: gC },
    ].sort((p, q) => p.v - q.v);
    const s = angles.map((x) => SIDE[x.name]);
    const val = `${s[0]} < ${s[1]} < ${s[2]}`;
    return {
      stem: `Tam giác ABC có góc A = ${gA}° và góc B = ${gB}°. Hãy sắp xếp độ dài ba cạnh của tam giác theo thứ tự TĂNG DẦN.`,
      correct: val,
      distractors: td(val, [
        `${s[2]} < ${s[1]} < ${s[0]}`,
        `${s[1]} < ${s[0]} < ${s[2]}`,
        `${s[0]} < ${s[2]} < ${s[1]}`,
        `${s[2]} < ${s[0]} < ${s[1]}`,
      ]),
      solution: `Bước 1 — tính góc C = 180° − ${gA}° − ${gB}° = ${gC}°. Bước 2 — sắp xếp ba góc tăng dần: góc ${angles[0].name} = ${angles[0].v}° < góc ${angles[1].name} = ${angles[1].v}° < góc ${angles[2].name} = ${angles[2].v}°. Bước 3 — mỗi cạnh đối diện góc nào thì "thừa hưởng" đúng thứ tự của góc đó: cạnh đối diện góc ${angles[0].name} là ${s[0]}, đối diện góc ${angles[1].name} là ${s[1]}, đối diện góc ${angles[2].name} là ${s[2]}. Vậy ${val}. Bẫy phổ biến là ghi thứ tự NGƯỢC (${s[2]} < ${s[1]} < ${s[0]}) do nhầm "góc lớn ứng với cạnh nhỏ".`,
      steps: [
        `góc C = 180° − ${gA}° − ${gB}° = ${gC}°`,
        `Góc: ${angles[0].name}(${angles[0].v}°) < ${angles[1].name}(${angles[1].v}°) < ${angles[2].name}(${angles[2].v}°)`,
        `Cạnh đối diện tương ứng: ${val}`,
      ],
      hint: 'Sắp xếp ba góc trước, rồi thay mỗi góc bằng cạnh đối diện nó.',
      tags: ['quan hệ góc cạnh', 'sắp xếp', 'nhiều bước'],
    };
  }
  const s1 = ri(r, 5, 10);
  const s2 = s1 + ri(r, 1, 4);
  const s3 = s2 + ri(r, 1, 4);
  // BC = s3 đối diện góc A; CA = s2 đối diện góc B; AB = s1 đối diện góc C
  const val = 'góc C < góc B < góc A';
  return {
    stem: `Tam giác ABC có AB = ${s1} cm, CA = ${s2} cm, BC = ${s3} cm. Hãy sắp xếp số đo ba góc của tam giác theo thứ tự TĂNG DẦN.`,
    correct: val,
    distractors: td(val, [
      'góc A < góc B < góc C',
      'góc B < góc C < góc A',
      'góc A < góc C < góc B',
      'góc C < góc A < góc B',
    ]),
    solution: `Kiểm tra bất đẳng thức tam giác: ${s1} + ${s2} = ${s1 + s2} > ${s3} nên tam giác tồn tại. Sắp xếp ba cạnh tăng dần: AB = ${s1} < CA = ${s2} < BC = ${s3}. Cạnh AB đối diện góc C, cạnh CA đối diện góc B, cạnh BC đối diện góc A; cạnh nhỏ hơn đối diện góc nhỏ hơn nên ${val}. Nếu ghi theo đúng thứ tự chữ cái A, B, C mà không xét cạnh đối diện thì sẽ ra kết quả sai hoàn toàn.`,
    steps: [
      `AB = ${s1} < CA = ${s2} < BC = ${s3}`,
      `AB đối diện góc C, CA đối diện góc B, BC đối diện góc A`,
      `Vậy ${val}`,
    ],
    hint: 'Ghi rõ từng cạnh đối diện góc nào rồi mới chuyển thứ tự cạnh thành thứ tự góc.',
    tags: ['quan hệ góc cạnh', 'sắp xếp'],
  };
}

export const GEOMETRY_GENERATORS: Record<string, Gen> = {
  GEO01,
  GEO02,
  GEO03,
  GEO04,
  TRI01,
  TRI02,
  TRI03,
  TRI04,
};
