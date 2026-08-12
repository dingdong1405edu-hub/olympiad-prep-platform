/**
 * BỘ SINH CÂU HỎI CHO NHÓM "TOÁN CÓ LỜI VĂN":
 *   MOTION — chuyển động (s = v × t, gặp nhau, đuổi kịp, dòng nước)
 *   WORK   — năng suất, làm chung, vòi nước
 *   STAT   — bảng số liệu, trung bình cộng, xác suất
 *   LOGIC  — suy luận, nguyên lý Dirichlet, cân đo và chia phần
 *
 * Ba quy tắc bất di bất dịch, giống hệt `generators.ts`:
 *  1. Đáp án và lời giải luôn TÍNH RA từ tham số vừa sinh — không viết tay.
 *  2. Số liệu được CHỌN NGƯỢC TỪ ĐÁP ÁN ĐẸP (chọn vận tốc và thời gian trước,
 *     rồi mới suy ra quãng đường) ⇒ không bao giờ ra số lẻ xấu.
 *  3. Nhiễu là LỖI SAI CÓ THẬT: cộng vận tốc khi phải trừ, quên đổi phút ra giờ,
 *     lấy trung bình cộng hai vận tốc, cộng thẳng thời gian của hai người...
 *
 * File này KHÔNG import gì từ `src/` (tsx không đọc `paths` của tsconfig).
 */
import type { Draft, Gen, GenCtx, Rng } from './generators';
import { fStr, fmt, frac, gcd, lcm, nd, pick, ri, roundDec, shuffle, td } from './generators';

// ===========================================================================
// TIỆN ÍCH RIÊNG CỦA NHÓM TOÁN CÓ LỜI VĂN
// ===========================================================================

/** Ghép giá trị với đơn vị — đáp án bài toán thực tế bắt buộc mang đơn vị. */
function uv(v: number, unit: string): string {
  return `${fmt(roundDec(v, 3))} ${unit}`;
}

/**
 * Lọc nhiễu dạng "số + đơn vị": bỏ giá trị âm, bỏ trùng, bỏ giá trị bằng đáp án.
 * `padVal` dùng để đệm khi các ứng viên trùng nhau ⇒ luôn đủ 3 nhiễu khác nhau.
 */
function ud(correct: string, cands: number[], unit: string, padVal?: number): string[] {
  const out = td(
    correct,
    cands.filter((v) => Number.isFinite(v) && v > 0).map((v) => uv(v, unit)),
  );
  if (padVal === undefined) return out;
  for (const k of [2, 0.5, 10, 1.5, 0.25, 100]) {
    if (out.length >= 3) break;
    const t = uv(roundDec(padVal * k, 3), unit);
    if (t !== correct && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Đổi số giờ (có thể lẻ) sang chuỗi "2 giờ 30 phút" — chỉ dùng để MÔ TẢ trong đề. */
function hStr(hours: number): string {
  const total = Math.round(hours * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  if (hh === 0) return `${mm} phút`;
  if (mm === 0) return `${hh} giờ`;
  return `${hh} giờ ${mm} phút`;
}

/** Thời điểm trong ngày tính từ 0 giờ: 570 → "9 giờ 30 phút". */
function clock(totalMin: number): string {
  const m = Math.round(totalMin);
  const hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return mm === 0 ? `${hh} giờ` : `${hh} giờ ${mm} phút`;
}

/** Chia `total` thành `parts` phần nguyên, mỗi phần ít nhất `min`. */
function splitCount(r: Rng, total: number, parts: number, min: number): number[] {
  const out = new Array<number>(parts).fill(min);
  let left = total - min * parts;
  while (left > 0) {
    out[Math.floor(r() * parts)]++;
    left--;
  }
  return out;
}

/** Dạng đề trong cùng một mức độ: lvl = slot % 3 nên phải chia cho 3 trước. */
function formOf(slot: number, n: number): number {
  return Math.floor(slot / 3) % n;
}

/** Cặp vận tốc đi – về có vận tốc trung bình (trung bình điều hòa) NGUYÊN. */
const HARMONIC_PAIRS: [number, number][] = [
  [30, 60],
  [40, 60],
  [20, 30],
  [12, 24],
  [10, 15],
  [45, 90],
  [36, 45],
  [24, 40],
  [15, 30],
  [20, 80],
];

/**
 * Bộ dữ liệu bài "đi vận tốc v1 thì muộn, đi v2 thì sớm": chọn sao cho
 * tổng số phút muộn + sớm là số tròn ⇒ đề bài đẹp, đáp án là quãng đường s.
 */
const LATE_EARLY: [number, number, number][] = [
  [10, 15, 30],
  [12, 15, 30],
  [10, 12, 20],
  [15, 20, 40],
  [20, 30, 60],
  [30, 40, 60],
  [12, 20, 30],
  [40, 50, 30],
];

// ===========================================================================
// CHƯƠNG MOTION — TOÁN CHUYỂN ĐỘNG
// ===========================================================================

/** MOTION01 — quan hệ s = v × t (và hai công thức suy ra). */
function MOTION01(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    const form = formOf(slot, 3);
    const v = pick(r, [8, 12, 15, 20, 24, 30, 36, 40, 45, 50, 60]);
    const t = ri(r, 2, 5);
    const s = v * t;

    if (form === 0) {
      return {
        stem: `Một ô tô chạy đều với vận tốc ${v} km/giờ trong ${t} giờ. Tính quãng đường ô tô đi được (đơn vị: km).`,
        correct: uv(s, 'km'),
        numeric: s,
        distractors: ud(uv(s, 'km'), [v + t, s / 2, v * (t + 1), s + t, v * (t - 1)], 'km', s),
        solution: `Công thức quãng đường: s = v × t. Thay số: s = ${v} × ${t} = ${s} (km). Đây là bài một bước, lỗi hay gặp nhất là nhầm sang phép cộng và trả lời ${v + t} km — một con số vô lí vì vận tốc và thời gian là hai đại lượng khác nhau, không cộng được với nhau.`,
        steps: [`Công thức: s = v × t`, `s = ${v} × ${t}`, `s = ${s} (km)`],
        hint: 'Quãng đường bằng vận tốc nhân với thời gian, hai đại lượng phải cùng hệ đơn vị km và giờ.',
        tags: ['chuyển động', 's = v × t'],
      };
    }
    if (form === 1) {
      return {
        stem: `Một người đi xe máy được quãng đường ${s} km trong ${t} giờ. Tính vận tốc của người đó (đơn vị: km/giờ).`,
        correct: uv(v, 'km/giờ'),
        numeric: v,
        distractors: ud(uv(v, 'km/giờ'), [s * t, s - t, s / (t + 1), v * 2, s / (t - 1)], 'km/giờ', v),
        solution: `Từ s = v × t suy ra v = s : t. Thay số: v = ${s} : ${t} = ${v} (km/giờ). Nhớ rằng muốn tìm vận tốc thì LẤY QUÃNG ĐƯỜNG CHIA CHO THỜI GIAN; nhân hai số lại sẽ ra ${s * t} km/giờ, nhanh hơn cả máy bay nên chắc chắn sai.`,
        steps: [`Từ s = v × t ⇒ v = s : t`, `v = ${s} : ${t}`, `v = ${v} (km/giờ)`],
        hint: 'Vận tốc là quãng đường đi được trong MỘT đơn vị thời gian, nên lấy quãng đường chia cho thời gian.',
        tags: ['chuyển động', 's = v × t'],
      };
    }
    return {
      stem: `Một tàu hỏa chạy đều với vận tốc ${v} km/giờ. Hỏi tàu đi hết quãng đường ${s} km trong bao nhiêu giờ? (đơn vị: giờ)`,
      correct: uv(t, 'giờ'),
      numeric: t,
      distractors: ud(uv(t, 'giờ'), [s * v, s - v, v / s, t + 1, s / (v * 2)], 'giờ', t),
      solution: `Từ s = v × t suy ra t = s : v. Thay số: t = ${s} : ${v} = ${t} (giờ). Kiểm tra lại bằng phép nhân: ${v} × ${t} = ${s} km, đúng bằng quãng đường đề cho.`,
      steps: [`Từ s = v × t ⇒ t = s : v`, `t = ${s} : ${v}`, `t = ${t} (giờ)`],
      hint: 'Muốn tìm thời gian thì lấy quãng đường chia cho vận tốc, rồi thử lại bằng phép nhân.',
      tags: ['chuyển động', 's = v × t'],
    };
  }

  if (lvl === 1) {
    const form = formOf(slot, 3);

    if (form === 0) {
      // Thời gian cho bằng giờ + phút ⇒ bắt buộc đổi phút ra phân số giờ
      const v = 4 * ri(r, 3, 15);
      const k = pick(r, [5, 6, 7, 9, 10, 11]); // số phần tư giờ, không chia hết cho 4
      const tmin = 15 * k;
      const hh = Math.floor(tmin / 60);
      const mm = tmin % 60;
      const s = (v * tmin) / 60;
      const wrongDec = v * (hh + mm / 100);
      return {
        stem: `Một ca nô chạy đều với vận tốc ${v} km/giờ trong ${hh} giờ ${mm} phút. Tính quãng đường ca nô đi được (đơn vị: km).`,
        correct: uv(s, 'km'),
        numeric: s,
        distractors: ud(uv(s, 'km'), [wrongDec, v * hh, v * (hh + 1), (v * tmin) / 100, s / 2], 'km', s),
        solution: `Bước 1 — đổi thời gian về giờ: ${mm} phút = ${mm} : 60 = ${fmt(mm / 60)} giờ, nên ${hh} giờ ${mm} phút = ${fmt(tmin / 60)} giờ. Bước 2 — áp dụng s = v × t: s = ${v} × ${fmt(tmin / 60)} = ${s} (km). Bẫy lớn nhất là viết ${hh} giờ ${mm} phút thành ${fmt(hh + mm / 100)} giờ rồi nhân, kết quả sai thành ${fmt(roundDec(wrongDec, 3))} km.`,
        steps: [
          `Đổi ${mm} phút = ${fmt(mm / 60)} giờ`,
          `Thời gian t = ${fmt(tmin / 60)} giờ`,
          `s = ${v} × ${fmt(tmin / 60)} = ${s} (km)`,
        ],
        hint: 'Đổi phút ra giờ bằng cách chia cho 60 (không phải chia cho 100) trước khi nhân với vận tốc.',
        tags: ['chuyển động', 'đổi đơn vị thời gian', 'nhiều bước'],
      };
    }

    if (form === 1) {
      // Hai chặng khác vận tốc — bẫy: lấy trung bình cộng vận tốc
      const v1 = pick(r, [30, 36, 40, 45, 50, 54, 60]);
      const v2 = pick(r, [20, 24, 25, 32, 35, 42]);
      const t1 = ri(r, 2, 4);
      const t2 = t1 === 2 ? 3 : t1 - 1;
      const s = v1 * t1 + v2 * t2;
      const wrongAvg = ((v1 + v2) / 2) * (t1 + t2);
      return {
        stem: `Một ô tô đi ${t1} giờ đầu với vận tốc ${v1} km/giờ, sau đó đi tiếp ${t2} giờ với vận tốc ${v2} km/giờ. Tính tổng quãng đường ô tô đã đi (đơn vị: km).`,
        correct: uv(s, 'km'),
        numeric: s,
        distractors: ud(
          uv(s, 'km'),
          [wrongAvg, v1 * t2 + v2 * t1, (v1 + v2) * (t1 + t2), v1 * t1, v2 * t2],
          'km',
          s,
        ),
        solution: `Tính riêng từng chặng rồi cộng lại. Chặng 1: ${v1} × ${t1} = ${v1 * t1} km. Chặng 2: ${v2} × ${t2} = ${v2 * t2} km. Tổng quãng đường: ${v1 * t1} + ${v2 * t2} = ${s} km. KHÔNG được lấy trung bình cộng hai vận tốc rồi nhân với tổng thời gian: cách đó cho ${fmt(roundDec(wrongAvg, 3))} km và chỉ đúng khi hai chặng đi hết thời gian bằng nhau, ở đây ${t1} giờ ≠ ${t2} giờ.`,
        steps: [
          `Chặng 1: ${v1} × ${t1} = ${v1 * t1} (km)`,
          `Chặng 2: ${v2} × ${t2} = ${v2 * t2} (km)`,
          `Tổng: ${v1 * t1} + ${v2 * t2} = ${s} (km)`,
        ],
        hint: 'Mỗi chặng có vận tốc riêng thì tính quãng đường riêng cho từng chặng rồi mới cộng.',
        tags: ['chuyển động', 'hai chặng', 'nhiều bước'],
      };
    }

    // form 2 — có thời gian nghỉ dọc đường, phải trừ ra trước khi chia
    const v = pick(r, [30, 36, 40, 45, 48, 50, 54, 60]);
    const tRun = ri(r, 2, 4);
    const m = pick(r, [15, 30, 45]);
    const s = v * tRun;
    const tTotal = tRun + m / 60;
    return {
      stem: `Một ô tô đi từ A đến B dài ${s} km. Tính cả ${m} phút nghỉ dọc đường thì ô tô đi hết ${hStr(tTotal)}. Tính vận tốc của ô tô khi chạy trên đường (đơn vị: km/giờ).`,
      correct: uv(v, 'km/giờ'),
      numeric: v,
      distractors: ud(
        uv(v, 'km/giờ'),
        [s / tTotal, s / (tTotal - m / 100), s / (tRun - m / 60), s / Math.round(tTotal), v * 2],
        'km/giờ',
        v,
      ),
      solution: `Thời gian ô tô THỰC SỰ chạy = tổng thời gian − thời gian nghỉ = ${fmt(tTotal)} giờ − ${fmt(m / 60)} giờ = ${tRun} giờ. Vận tốc: v = ${s} : ${tRun} = ${v} (km/giờ). Nếu quên trừ thời gian nghỉ sẽ ra ${fmt(roundDec(s / tTotal, 3))} km/giờ — nhỏ hơn đáp án đúng vì đã tính cả lúc xe đứng yên.`,
      steps: [
        `Đổi ${m} phút = ${fmt(m / 60)} giờ`,
        `Thời gian chạy = ${fmt(tTotal)} − ${fmt(m / 60)} = ${tRun} (giờ)`,
        `v = ${s} : ${tRun} = ${v} (km/giờ)`,
      ],
      hint: 'Thời gian nghỉ không phải thời gian đi — phải trừ ra trước khi chia quãng đường.',
      tags: ['chuyển động', 'thời gian nghỉ', 'nhiều bước'],
    };
  }

  // lvl 2 — nhiều bước, có bẫy hoặc suy luận ngược
  const form = formOf(slot, 3);

  if (form === 0) {
    const [v1, v2] = pick(r, HARMONIC_PAIRS);
    const vtb = (2 * v1 * v2) / (v1 + v2);
    const s = lcm(v1, v2);
    const t1 = s / v1;
    const t2 = s / v2;
    return {
      stem: `Một người đi từ A đến B với vận tốc ${v1} km/giờ, lúc về đi đúng đường cũ với vận tốc ${v2} km/giờ. Tính vận tốc trung bình của người đó trên cả quãng đường đi và về (đơn vị: km/giờ).`,
      correct: uv(vtb, 'km/giờ'),
      numeric: vtb,
      distractors: ud(
        uv(vtb, 'km/giờ'),
        [(v1 + v2) / 2, v1 + v2, Math.abs(v2 - v1), Math.sqrt(v1 * v2), vtb + 5],
        'km/giờ',
        vtb,
      ),
      solution: `Vận tốc trung bình = TỔNG QUÃNG ĐƯỜNG chia cho TỔNG THỜI GIAN, không phải trung bình cộng hai vận tốc. Giả sử AB = ${s} km (chọn số chia hết cho cả ${v1} và ${v2} cho gọn). Thời gian đi: ${s} : ${v1} = ${t1} giờ. Thời gian về: ${s} : ${v2} = ${t2} giờ. Vận tốc trung bình = (${s} + ${s}) : (${t1} + ${t2}) = ${2 * s} : ${t1 + t2} = ${vtb} km/giờ. Lấy trung bình cộng (${v1} + ${v2}) : 2 = ${fmt((v1 + v2) / 2)} km/giờ là SAI vì thời gian đi và thời gian về khác nhau.`,
      steps: [
        `Chọn AB = ${s} km`,
        `Thời gian đi: ${s} : ${v1} = ${t1} giờ; thời gian về: ${s} : ${v2} = ${t2} giờ`,
        `v trung bình = ${2 * s} : ${t1 + t2} = ${vtb} (km/giờ)`,
      ],
      hint: 'Vận tốc trung bình = tổng quãng đường : tổng thời gian; đừng lấy trung bình cộng hai vận tốc.',
      tags: ['chuyển động', 'vận tốc trung bình', 'bẫy'],
    };
  }

  if (form === 1) {
    const startH = ri(r, 6, 9);
    const v = pick(r, [30, 36, 40, 45, 48, 50, 60]);
    const tRun = ri(r, 2, 4);
    const m = pick(r, [20, 30, 40, 45]);
    const s = v * tRun;
    const endMin = startH * 60 + tRun * 60 + m;
    return {
      stem: `Một ô tô khởi hành từ A lúc ${startH} giờ, chạy đều với vận tốc ${v} km/giờ, dọc đường nghỉ ${m} phút và đến B lúc ${clock(endMin)}. Tính quãng đường AB (đơn vị: km).`,
      correct: uv(s, 'km'),
      numeric: s,
      distractors: ud(
        uv(s, 'km'),
        [v * (tRun + m / 60), v * (tRun + m / 100), v * (tRun + 1), v * (tRun - m / 60), s / 2],
        'km',
        s,
      ),
      solution: `Bước 1 — tổng thời gian từ lúc đi đến lúc đến: ${clock(endMin)} − ${startH} giờ = ${hStr(tRun + m / 60)}. Bước 2 — trừ thời gian nghỉ: ${hStr(tRun + m / 60)} − ${m} phút = ${tRun} giờ chạy. Bước 3 — quãng đường: s = ${v} × ${tRun} = ${s} (km). Quên trừ ${m} phút nghỉ sẽ ra ${fmt(roundDec(v * (tRun + m / 60), 3))} km.`,
      steps: [
        `Tổng thời gian = ${hStr(tRun + m / 60)}`,
        `Thời gian chạy = ${hStr(tRun + m / 60)} − ${m} phút = ${tRun} giờ`,
        `s = ${v} × ${tRun} = ${s} (km)`,
      ],
      hint: 'Lấy giờ đến trừ giờ khởi hành, rồi trừ tiếp thời gian nghỉ mới ra thời gian xe chạy.',
      tags: ['chuyển động', 'thời gian nghỉ', 'nhiều bước'],
    };
  }

  // form 2 — đi chậm thì muộn, đi nhanh thì sớm ⇒ tìm quãng đường
  const [v1, v2, total] = pick(r, LATE_EARLY);
  const late = 5 * ri(r, 2, Math.floor(total / 5) - 2);
  const early = total - late;
  const s = ((late + early) * v1 * v2) / (60 * (v2 - v1));
  const wrongSum = ((late + early) * v1 * v2) / (60 * (v2 + v1));
  const wrongDiffTime = (Math.abs(late - early) * v1 * v2) / (60 * (v2 - v1));
  return {
    stem: `Một người dự định đi từ A đến B cho kịp giờ hẹn. Nếu đi với vận tốc ${v1} km/giờ thì đến muộn ${late} phút, còn nếu đi với vận tốc ${v2} km/giờ thì đến sớm ${early} phút. Tính quãng đường AB (đơn vị: km).`,
    correct: uv(s, 'km'),
    numeric: s,
    distractors: ud(uv(s, 'km'), [wrongSum, wrongDiffTime, s / 2, s * 2, ((late + early) * (v2 - v1)) / 60], 'km', s),
    solution: `Gọi quãng đường AB là s (km). Thời gian đi với vận tốc ${v1} km/giờ là s : ${v1}, với vận tốc ${v2} km/giờ là s : ${v2}. Đi chậm thì muộn ${late} phút, đi nhanh thì sớm ${early} phút nên hai thời gian đó CHÊNH NHAU ${late} + ${early} = ${late + early} phút = ${fmt(roundDec((late + early) / 60, 4))} giờ. Ta có s : ${v1} − s : ${v2} = ${fmt(roundDec((late + early) / 60, 4))}, tức s × (1/${v1} − 1/${v2}) = s × ${fmt(roundDec(1 / v1 - 1 / v2, 5))} = ${fmt(roundDec((late + early) / 60, 4))}. Suy ra s = ${s} km. Hai lỗi hay gặp: cộng hai vận tốc ở mẫu (ra ${fmt(roundDec(wrongSum, 2))} km) và lấy hiệu ${late} − ${early} thay vì tổng thời gian chênh lệch.`,
    steps: [
      `Chênh lệch thời gian = ${late} + ${early} = ${late + early} phút = ${fmt(roundDec((late + early) / 60, 4))} giờ`,
      `s : ${v1} − s : ${v2} = ${fmt(roundDec((late + early) / 60, 4))}`,
      `s = ${late + early} × ${v1} × ${v2} : (60 × ${v2 - v1}) = ${s} (km)`,
    ],
    hint: 'Một lần đến muộn, một lần đến sớm thì hai thời gian chênh nhau bằng TỔNG số phút muộn và sớm.',
    tags: ['chuyển động', 'suy luận ngược', 'nhiều bước'],
  };
}

/** MOTION02 — hai vật chuyển động ngược chiều, bài toán gặp nhau. */
function MOTION02(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    const form = formOf(slot, 3);
    const v1 = pick(r, [30, 35, 40, 45, 50, 55, 60]);
    const v2 = pick(r, [25, 28, 32, 36, 42, 48]);
    const t = ri(r, 2, 4);
    const s = (v1 + v2) * t;
    const sum = v1 + v2;
    const diff = Math.abs(v1 - v2);

    if (form === 0) {
      return {
        stem: `Hai thành phố A và B cách nhau ${s} km. Cùng một lúc, một ô tô đi từ A về phía B với vận tốc ${v1} km/giờ và một xe máy đi từ B về phía A với vận tốc ${v2} km/giờ. Hỏi sau mấy giờ hai xe gặp nhau? (đơn vị: giờ)`,
        correct: uv(t, 'giờ'),
        numeric: t,
        distractors: ud(uv(t, 'giờ'), [s / diff, s / v1, s / v2, s / (sum / 2), t + 1], 'giờ', t),
        solution: `Hai xe đi NGƯỢC CHIỀU để gặp nhau nên mỗi giờ khoảng cách giữa chúng giảm đi ${v1} + ${v2} = ${sum} km. Thời gian gặp nhau = quãng đường : tổng vận tốc = ${s} : ${sum} = ${t} (giờ). Lấy hiệu vận tốc ${diff} km/giờ là lỗi của bài đuổi kịp (cùng chiều), ở đây sẽ cho kết quả sai ${fmt(roundDec(s / diff, 2))} giờ.`,
        steps: [`Tổng vận tốc: ${v1} + ${v2} = ${sum} (km/giờ)`, `t = ${s} : ${sum} = ${t} (giờ)`],
        hint: 'Đi ngược chiều thì khoảng cách giảm bằng TỔNG hai vận tốc trong mỗi giờ.',
        tags: ['chuyển động', 'ngược chiều', 'gặp nhau'],
      };
    }
    if (form === 1) {
      return {
        stem: `Cùng một lúc, một ô tô đi từ A với vận tốc ${v1} km/giờ và một xe máy đi từ B với vận tốc ${v2} km/giờ, hai xe đi ngược chiều nhau trên cùng một con đường. Sau ${t} giờ thì hai xe gặp nhau. Tính quãng đường AB (đơn vị: km).`,
        correct: uv(s, 'km'),
        numeric: s,
        distractors: ud(uv(s, 'km'), [diff * t, sum, v1 * t, sum * (t + 1), (sum / 2) * t], 'km', s),
        solution: `Trong ${t} giờ, ô tô đi được ${v1} × ${t} = ${v1 * t} km, xe máy đi được ${v2} × ${t} = ${v2 * t} km. Hai xe đi ngược chiều nên tổng hai quãng đường đó chính là AB: ${v1 * t} + ${v2 * t} = ${s} km. Cách nhanh: AB = (${v1} + ${v2}) × ${t} = ${sum} × ${t} = ${s} km. Dùng HIỆU vận tốc sẽ ra ${fmt(diff * t)} km — đó là lời giải của bài đuổi kịp.`,
        steps: [
          `Ô tô đi: ${v1} × ${t} = ${v1 * t} (km)`,
          `Xe máy đi: ${v2} × ${t} = ${v2 * t} (km)`,
          `AB = ${v1 * t} + ${v2 * t} = ${s} (km)`,
        ],
        hint: 'Quãng đường AB bằng tổng quãng đường hai xe đi được cho tới lúc gặp nhau.',
        tags: ['chuyển động', 'ngược chiều', 'gặp nhau'],
      };
    }
    return {
      stem: `Quãng đường AB dài ${s} km. Cùng một lúc, một người đi từ A với vận tốc ${v1} km/giờ và một người đi từ B ngược chiều lại. Hai người gặp nhau sau ${t} giờ. Tính vận tốc của người đi từ B (đơn vị: km/giờ).`,
      correct: uv(v2, 'km/giờ'),
      numeric: v2,
      distractors: ud(uv(v2, 'km/giờ'), [sum, sum + v1, (s - v1) / t, s / t / 2, v2 * 2], 'km/giờ', v2),
      solution: `Bước 1 — tổng vận tốc hai người: ${s} : ${t} = ${sum} (km/giờ). Bước 2 — vận tốc người đi từ B: ${sum} − ${v1} = ${v2} (km/giờ). Dừng lại ở bước 1 và trả lời ${sum} km/giờ là lỗi phổ biến nhất: đó mới là TỔNG vận tốc của cả hai người.`,
      steps: [
        `Tổng vận tốc = ${s} : ${t} = ${sum} (km/giờ)`,
        `Vận tốc người đi từ B = ${sum} − ${v1} = ${v2} (km/giờ)`,
      ],
      hint: 'Tìm tổng vận tốc trước (quãng đường chia thời gian), sau đó trừ đi vận tốc đã biết.',
      tags: ['chuyển động', 'ngược chiều', 'nhiều bước'],
    };
  }

  if (lvl === 1) {
    const form = formOf(slot, 3);

    if (form === 0) {
      const v1 = pick(r, [30, 36, 40, 45, 50, 54]);
      const v2 = pick(r, [24, 28, 32, 35, 42, 48]);
      const t = ri(r, 2, 4);
      const s = (v1 + v2) * t;
      const d1 = v1 * t;
      return {
        stem: `Hai bến xe A và B cách nhau ${s} km. Cùng một lúc, xe thứ nhất đi từ A với vận tốc ${v1} km/giờ, xe thứ hai đi từ B ngược chiều lại với vận tốc ${v2} km/giờ. Hỏi chỗ hai xe gặp nhau cách A bao nhiêu ki-lô-mét? (đơn vị: km)`,
        correct: uv(d1, 'km'),
        numeric: d1,
        distractors: ud(uv(d1, 'km'), [v2 * t, s / 2, v1, (v1 * s) / Math.abs(v1 - v2), d1 / 2], 'km', d1),
        solution: `Bước 1 — thời gian gặp nhau: t = ${s} : (${v1} + ${v2}) = ${s} : ${v1 + v2} = ${t} (giờ). Bước 2 — chỗ gặp nhau cách A đúng bằng quãng đường xe đi từ A đã đi: ${v1} × ${t} = ${d1} (km). Hai bẫy hay gặp: nghĩ rằng hai xe luôn gặp nhau ở chính giữa (ra ${fmt(s / 2)} km) và lấy nhầm quãng đường của xe kia (${fmt(v2 * t)} km).`,
        steps: [
          `t = ${s} : ${v1 + v2} = ${t} (giờ)`,
          `Khoảng cách từ A đến chỗ gặp = ${v1} × ${t} = ${d1} (km)`,
          `Kiểm tra: ${d1} + ${v2 * t} = ${s} (km)`,
        ],
        hint: 'Tính thời gian gặp nhau trước, rồi nhân với vận tốc của xe xuất phát từ A.',
        tags: ['chuyển động', 'ngược chiều', 'nhiều bước'],
      };
    }

    if (form === 1) {
      const startH = ri(r, 6, 9);
      const v1 = 2 * ri(r, 16, 30);
      const v2 = 2 * ri(r, 6, 15);
      const k = pick(r, [3, 5, 7]); // t = k/2 giờ, luôn lẻ nửa giờ
      const t = k / 2;
      const s = (v1 + v2) * t;
      const meet = startH * 60 + t * 60;
      const wrongDiff = startH * 60 + (s / Math.abs(v1 - v2)) * 60;
      const wrongMin = startH * 60 + Math.floor(t) * 60 + (t % 1) * 100;
      return {
        stem: `Lúc ${startH} giờ, một ô tô đi từ A và một xe máy đi từ B ngược chiều nhau, biết AB dài ${s} km. Vận tốc ô tô là ${v1} km/giờ, vận tốc xe máy là ${v2} km/giờ. Hỏi hai xe gặp nhau lúc mấy giờ?`,
        correct: clock(meet),
        distractors: td(clock(meet), [
          clock(wrongDiff),
          clock(wrongMin),
          clock(startH * 60 + Math.floor(t) * 60),
          clock(startH * 60 + Math.ceil(t) * 60),
          hStr(t),
        ]),
        solution: `Bước 1 — tổng vận tốc: ${v1} + ${v2} = ${v1 + v2} (km/giờ). Bước 2 — thời gian đi đến lúc gặp nhau: ${s} : ${v1 + v2} = ${fmt(t)} giờ = ${hStr(t)}. Bước 3 — thời điểm gặp nhau: ${startH} giờ + ${hStr(t)} = ${clock(meet)}. Chú ý ${fmt(t)} giờ nghĩa là ${hStr(t)} chứ không phải ${Math.floor(t)} giờ ${(t % 1) * 100} phút.`,
        steps: [
          `Tổng vận tốc = ${v1 + v2} (km/giờ)`,
          `Thời gian gặp nhau = ${s} : ${v1 + v2} = ${hStr(t)}`,
          `Thời điểm gặp = ${startH} giờ + ${hStr(t)} = ${clock(meet)}`,
        ],
        hint: 'Tính thời gian đi rồi CỘNG vào giờ khởi hành; nhớ đổi phần lẻ của giờ ra phút bằng cách nhân 60.',
        tags: ['chuyển động', 'ngược chiều', 'thời điểm'],
      };
    }

    // form 2 — vận tốc xe thứ hai cho gián tiếp
    const v1 = pick(r, [24, 28, 30, 32, 36, 40]);
    const d = pick(r, [4, 6, 8, 10, 12]);
    const v2 = v1 + d;
    const t = ri(r, 2, 4);
    const s = (v1 + v2) * t;
    return {
      stem: `Hai người khởi hành cùng lúc từ hai địa điểm A và B cách nhau ${s} km, đi ngược chiều nhau. Người đi từ A có vận tốc ${v1} km/giờ, người đi từ B có vận tốc lớn hơn người đi từ A là ${d} km/giờ. Hỏi sau bao lâu hai người gặp nhau? (đơn vị: giờ)`,
      correct: uv(t, 'giờ'),
      numeric: t,
      distractors: ud(uv(t, 'giờ'), [s / (2 * v1), s / (v1 + d), s / d, s / v1, t + 1], 'giờ', t),
      solution: `Bước 1 — vận tốc người đi từ B: ${v1} + ${d} = ${v2} (km/giờ). Bước 2 — tổng vận tốc: ${v1} + ${v2} = ${v1 + v2} (km/giờ). Bước 3 — thời gian gặp nhau: ${s} : ${v1 + v2} = ${t} (giờ). Nếu bỏ quên phần "lớn hơn ${d} km/giờ" mà coi hai vận tốc bằng nhau thì ra ${fmt(roundDec(s / (2 * v1), 2))} giờ.`,
      steps: [
        `Vận tốc người đi từ B = ${v1} + ${d} = ${v2} (km/giờ)`,
        `Tổng vận tốc = ${v1 + v2} (km/giờ)`,
        `t = ${s} : ${v1 + v2} = ${t} (giờ)`,
      ],
      hint: 'Tìm vận tốc còn thiếu từ dữ kiện "lớn hơn ... km/giờ" trước khi cộng hai vận tốc.',
      tags: ['chuyển động', 'ngược chiều', 'nhiều bước'],
    };
  }

  // lvl 2
  const form = formOf(slot, 3);

  if (form === 0) {
    // Xe thứ hai khởi hành muộn hơn ⇒ phải trừ phần đường xe thứ nhất đi trước
    const v1 = 4 * ri(r, 6, 12); // bội của 4 để quãng đường đi trước luôn nguyên
    const v2 = pick(r, [30, 36, 40, 45, 48]);
    const m = pick(r, [30, 45]);
    const startH = ri(r, 6, 8);
    const head = (v1 * m) / 60;
    const t2 = ri(r, 2, 4);
    const s = head + (v1 + v2) * t2;
    return {
      stem: `Quãng đường AB dài ${s} km. Lúc ${startH} giờ, một ô tô đi từ A về phía B với vận tốc ${v1} km/giờ. Đúng ${m} phút sau, một xe máy đi từ B về phía A với vận tốc ${v2} km/giờ. Hỏi kể từ lúc xe máy khởi hành, sau bao lâu hai xe gặp nhau? (đơn vị: giờ)`,
      correct: uv(t2, 'giờ'),
      numeric: t2,
      distractors: ud(
        uv(t2, 'giờ'),
        [s / (v1 + v2), (s - (v1 * m) / 100) / (v1 + v2), (s - head) / Math.abs(v1 - v2), t2 + m / 60, (s - head) / v2],
        'giờ',
        t2,
      ),
      solution: `Bước 1 — ô tô chạy trước ${m} phút = ${fmt(m / 60)} giờ, đi được ${v1} × ${fmt(m / 60)} = ${head} km. Bước 2 — khoảng cách còn lại khi xe máy bắt đầu chạy: ${s} − ${head} = ${s - head} km. Bước 3 — từ lúc đó hai xe đi ngược chiều nhau nên thời gian gặp nhau = ${s - head} : (${v1} + ${v2}) = ${s - head} : ${v1 + v2} = ${t2} (giờ). Quên phần chạy trước của ô tô sẽ ra ${fmt(roundDec(s / (v1 + v2), 2))} giờ.`,
      steps: [
        `Ô tô đi trước: ${v1} × ${fmt(m / 60)} = ${head} (km)`,
        `Khoảng cách còn lại: ${s} − ${head} = ${s - head} (km)`,
        `t = ${s - head} : ${v1 + v2} = ${t2} (giờ)`,
      ],
      hint: 'Trừ phần đường xe khởi hành sớm đã đi được, phần còn lại mới chia cho tổng vận tốc.',
      tags: ['chuyển động', 'ngược chiều', 'khởi hành lệch giờ'],
    };
  }

  if (form === 1) {
    // Tổng – hiệu vận tốc
    const v2 = 2 * ri(r, 10, 20);
    const d = 2 * ri(r, 2, 8);
    const v1 = v2 + d;
    const t = ri(r, 2, 4);
    const s = (v1 + v2) * t;
    const sum = v1 + v2;
    return {
      stem: `Hai xe khởi hành cùng lúc từ A và B cách nhau ${s} km, đi ngược chiều nhau và gặp nhau sau ${t} giờ. Biết vận tốc xe đi từ A lớn hơn vận tốc xe đi từ B là ${d} km/giờ. Tính vận tốc xe đi từ A (đơn vị: km/giờ).`,
      correct: uv(v1, 'km/giờ'),
      numeric: v1,
      distractors: ud(uv(v1, 'km/giờ'), [sum, v2, sum / 2, sum + d, (sum - d) / 2 + d / 2], 'km/giờ', v1),
      solution: `Bước 1 — tổng vận tốc hai xe: ${s} : ${t} = ${sum} (km/giờ). Bước 2 — bài toán tổng – hiệu với tổng ${sum} và hiệu ${d}: vận tốc xe đi từ A = (${sum} + ${d}) : 2 = ${v1} (km/giờ), vận tốc xe đi từ B = (${sum} − ${d}) : 2 = ${v2} (km/giờ). Bẫy lớn nhất là QUÊN CHIA ĐÔI và trả lời ${sum + d} hoặc trả lời luôn tổng ${sum} km/giờ. Thử lại: ${v1} + ${v2} = ${sum} và ${v1} − ${v2} = ${d}, đúng.`,
      steps: [
        `Tổng vận tốc = ${s} : ${t} = ${sum} (km/giờ)`,
        `Số lớn = (tổng + hiệu) : 2 = (${sum} + ${d}) : 2 = ${v1}`,
        `Thử lại: ${v1} + ${v2} = ${sum}; ${v1} − ${v2} = ${d}`,
      ],
      hint: 'Tìm tổng vận tốc trước, sau đó dùng công thức số lớn = (tổng + hiệu) : 2.',
      tags: ['chuyển động', 'tổng hiệu', 'nhiều bước'],
    };
  }

  // form 2 — biết hiệu quãng đường hai xe đi được đến lúc gặp nhau
  const v2 = pick(r, [24, 28, 30, 32, 36]);
  const d = pick(r, [4, 6, 8, 10]);
  const v1 = v2 + d;
  const t = ri(r, 2, 4);
  const s = (v1 + v2) * t;
  const dS = d * t;
  return {
    stem: `Hai xe khởi hành cùng lúc từ A và B cách nhau ${s} km, đi ngược chiều nhau và gặp nhau sau ${t} giờ. Đến lúc gặp nhau, xe đi từ A đã đi được nhiều hơn xe đi từ B là ${dS} km. Tính vận tốc xe đi từ A (đơn vị: km/giờ).`,
    correct: uv(v1, 'km/giờ'),
    numeric: v1,
    distractors: ud(uv(v1, 'km/giờ'), [(s + dS) / t, v2, s / (2 * t), dS / t, s / t], 'km/giờ', v1),
    solution: `Bước 1 — quãng đường xe đi từ A: hai quãng đường có tổng ${s} km và hiệu ${dS} km nên quãng đường xe từ A = (${s} + ${dS}) : 2 = ${(s + dS) / 2} km. Bước 2 — vận tốc xe đi từ A = ${(s + dS) / 2} : ${t} = ${v1} (km/giờ). Kiểm tra: xe từ B đi ${(s - dS) / 2} km trong ${t} giờ nên có vận tốc ${v2} km/giờ, và ${v1} + ${v2} = ${s / t} = ${s} : ${t}, đúng. Quên chia đôi ở bước 1 sẽ cho ${fmt(roundDec((s + dS) / t, 2))} km/giờ.`,
    steps: [
      `Quãng đường xe từ A = (${s} + ${dS}) : 2 = ${(s + dS) / 2} (km)`,
      `Vận tốc xe từ A = ${(s + dS) / 2} : ${t} = ${v1} (km/giờ)`,
      `Kiểm tra: ${v1} + ${v2} = ${v1 + v2} = ${s} : ${t}`,
    ],
    hint: 'Tổng hai quãng đường là AB, hiệu đã cho — dùng bài toán tổng hiệu rồi mới chia cho thời gian.',
    tags: ['chuyển động', 'tổng hiệu', 'suy luận ngược'],
  };
}

/** MOTION03 — hai vật chuyển động cùng chiều, bài toán đuổi kịp. */
function MOTION03(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    const form = formOf(slot, 3);
    const dv = pick(r, [5, 6, 8, 10, 12, 15, 20]);
    const v2 = pick(r, [10, 12, 15, 18, 20, 24, 30]);
    const v1 = v2 + dv;
    const t = ri(r, 2, 4);
    const d = dv * t;

    if (form === 0) {
      return {
        stem: `Một người đi xe đạp với vận tốc ${v2} km/giờ. Cùng lúc đó, ở phía sau người ấy ${d} km có một người đi xe máy với vận tốc ${v1} km/giờ đuổi theo (hai người đi cùng chiều). Hỏi sau bao lâu xe máy đuổi kịp xe đạp? (đơn vị: giờ)`,
        correct: uv(t, 'giờ'),
        numeric: t,
        distractors: ud(uv(t, 'giờ'), [d / (v1 + v2), d / v1, d / v2, t + 1, d / (dv * 2)], 'giờ', t),
        solution: `Hai xe đi CÙNG CHIỀU nên mỗi giờ xe máy chỉ rút ngắn khoảng cách được ${v1} − ${v2} = ${dv} km (hiệu vận tốc). Thời gian đuổi kịp = khoảng cách : hiệu vận tốc = ${d} : ${dv} = ${t} (giờ). Cộng hai vận tốc là lỗi của bài ngược chiều, sẽ ra ${fmt(roundDec(d / (v1 + v2), 2))} giờ — nhỏ hơn thực tế rất nhiều.`,
        steps: [`Hiệu vận tốc: ${v1} − ${v2} = ${dv} (km/giờ)`, `t = ${d} : ${dv} = ${t} (giờ)`],
        hint: 'Đuổi kịp (cùng chiều) thì dùng HIỆU vận tốc, không dùng tổng.',
        tags: ['chuyển động', 'cùng chiều', 'đuổi kịp'],
      };
    }
    if (form === 1) {
      return {
        stem: `Một ô tô có vận tốc ${v1} km/giờ đuổi theo một xe máy có vận tốc ${v2} km/giờ đi cùng chiều ở phía trước. Sau ${t} giờ thì ô tô đuổi kịp xe máy. Hỏi lúc đầu ô tô cách xe máy bao nhiêu ki-lô-mét? (đơn vị: km)`,
        correct: uv(d, 'km'),
        numeric: d,
        distractors: ud(uv(d, 'km'), [(v1 + v2) * t, v1 * t, dv, dv * (t + 1), v2 * t], 'km', d),
        solution: `Mỗi giờ ô tô đến gần xe máy thêm ${v1} − ${v2} = ${dv} km. Sau ${t} giờ ô tô rút ngắn được ${dv} × ${t} = ${d} km, đó chính là khoảng cách ban đầu. Kiểm tra: ô tô đi ${v1 * t} km, xe máy đi ${v2 * t} km, chênh nhau đúng ${d} km.`,
        steps: [`Hiệu vận tốc = ${dv} (km/giờ)`, `Khoảng cách ban đầu = ${dv} × ${t} = ${d} (km)`],
        hint: 'Khoảng cách ban đầu bằng hiệu vận tốc nhân với thời gian đuổi kịp.',
        tags: ['chuyển động', 'cùng chiều', 'đuổi kịp'],
      };
    }
    return {
      stem: `Một người đi bộ với vận tốc ${v2} km/giờ, đi trước một người đi xe đạp ${d} km. Người đi xe đạp đuổi theo và sau ${t} giờ thì đuổi kịp. Tính vận tốc của người đi xe đạp (đơn vị: km/giờ).`,
      correct: uv(v1, 'km/giờ'),
      numeric: v1,
      distractors: ud(uv(v1, 'km/giờ'), [d / t, (d + v2) / t, v2 + d, d / t + 2 * v2, v1 + dv], 'km/giờ', v1),
      solution: `Bước 1 — hiệu vận tốc: ${d} : ${t} = ${dv} (km/giờ). Bước 2 — vận tốc người đi xe đạp = vận tốc người đi bộ + hiệu vận tốc = ${v2} + ${dv} = ${v1} (km/giờ). Dừng ở bước 1 và trả lời ${dv} km/giờ là lỗi hay gặp: đó mới là phần vận tốc HƠN, chưa phải vận tốc thật.`,
      steps: [`Hiệu vận tốc = ${d} : ${t} = ${dv} (km/giờ)`, `Vận tốc xe đạp = ${v2} + ${dv} = ${v1} (km/giờ)`],
      hint: 'Khoảng cách chia thời gian mới ra HIỆU vận tốc, phải cộng thêm vận tốc người đi trước.',
      tags: ['chuyển động', 'cùng chiều', 'nhiều bước'],
    };
  }

  if (lvl === 1) {
    const form = formOf(slot, 3);

    if (form === 0) {
      const v2 = pick(r, [10, 12, 15, 18, 20]);
      const dv = pick(r, [10, 12, 15, 20, 24]);
      const v1 = v2 + dv;
      const h1 = ri(r, 5, 7);
      const gap = ri(r, 2, 3);
      const h2 = h1 + gap;
      const d = v2 * gap;
      const t = d / dv;
      const meet = h2 * 60 + t * 60;
      return {
        stem: `Lúc ${h1} giờ, một người đi xe đạp rời làng với vận tốc ${v2} km/giờ. Đến ${h2} giờ, một người đi xe máy cũng xuất phát từ làng đó, đi cùng đường và cùng chiều với vận tốc ${v1} km/giờ. Hỏi xe máy đuổi kịp xe đạp lúc mấy giờ?`,
        correct: clock(meet),
        distractors: td(clock(meet), [
          clock(h2 * 60 + (d / (v1 + v2)) * 60),
          clock(h1 * 60 + t * 60),
          clock(h2 * 60 + t * 60 + 60),
          hStr(t),
          clock(h2 * 60 + (d / v1) * 60),
        ]),
        solution: `Bước 1 — xe đạp đi trước ${h2} − ${h1} = ${gap} giờ nên đã đi được ${v2} × ${gap} = ${d} km. Bước 2 — hiệu vận tốc: ${v1} − ${v2} = ${dv} (km/giờ). Bước 3 — thời gian đuổi kịp: ${d} : ${dv} = ${hStr(t)}. Bước 4 — cộng vào lúc xe máy xuất phát: ${h2} giờ + ${hStr(t)} = ${clock(meet)}. Nhớ cộng vào giờ xuất phát của XE MÁY (${h2} giờ) chứ không phải giờ của xe đạp.`,
        steps: [
          `Xe đạp đi trước ${gap} giờ được ${d} km`,
          `Hiệu vận tốc = ${dv} (km/giờ)`,
          `Thời gian đuổi kịp = ${d} : ${dv} = ${hStr(t)}`,
          `Đuổi kịp lúc ${h2} giờ + ${hStr(t)} = ${clock(meet)}`,
        ],
        hint: 'Tính quãng đường người đi trước đã đi được, rồi chia cho hiệu vận tốc.',
        tags: ['chuyển động', 'cùng chiều', 'thời điểm'],
      };
    }

    if (form === 1) {
      const v2 = pick(r, [12, 15, 18, 20, 24]);
      const dv = pick(r, [8, 10, 12, 15, 20]);
      const v1 = v2 + dv;
      const t = ri(r, 2, 4);
      const d = dv * t;
      const place = v1 * t;
      return {
        stem: `Một xe khách đi với vận tốc ${v2} km/giờ. Một ô tô ở phía sau cách xe khách ${d} km đuổi theo với vận tốc ${v1} km/giờ (hai xe đi cùng chiều). Hỏi kể từ lúc bắt đầu đuổi, ô tô phải đi bao nhiêu ki-lô-mét thì đuổi kịp xe khách? (đơn vị: km)`,
        correct: uv(place, 'km'),
        numeric: place,
        distractors: ud(uv(place, 'km'), [v2 * t, d, place - d, (v1 + v2) * t, place / 2], 'km', place),
        solution: `Bước 1 — thời gian đuổi kịp: ${d} : (${v1} − ${v2}) = ${d} : ${dv} = ${t} (giờ). Bước 2 — quãng đường ô tô đi: ${v1} × ${t} = ${place} (km). Kiểm tra: xe khách đi được ${v2 * t} km, cộng khoảng cách ban đầu ${d} km cũng bằng ${place} km. Lấy nhầm quãng đường của xe khách sẽ ra ${fmt(v2 * t)} km.`,
        steps: [
          `t = ${d} : ${dv} = ${t} (giờ)`,
          `Quãng đường ô tô = ${v1} × ${t} = ${place} (km)`,
          `Kiểm tra: ${v2 * t} + ${d} = ${place} (km)`,
        ],
        hint: 'Tìm thời gian đuổi kịp trước, sau đó nhân với vận tốc của xe đuổi theo.',
        tags: ['chuyển động', 'cùng chiều', 'nhiều bước'],
      };
    }

    // form 2 — khoảng cách sinh ra từ số PHÚT xuất phát trước
    // [số phút xuất phát trước, vận tốc người đi trước, vận tốc người đuổi theo]
    // — chọn sẵn để thời gian đuổi kịp luôn là số giờ đẹp
    const combos: [number, number, number][] = [
      [30, 10, 20],
      [30, 20, 30],
      [45, 20, 35],
      [20, 15, 20],
      [30, 12, 20],
      [15, 20, 40],
      [30, 16, 24],
      [45, 16, 28],
      [20, 18, 30],
    ];
    const [m, v2, v1] = pick(r, combos);
    const dv = v1 - v2;
    const d = (v2 * m) / 60;
    const t = d / dv;
    return {
      stem: `Một người đi bộ khởi hành với vận tốc ${v2} km/giờ. Sau đó ${m} phút, một người đi xe đạp xuất phát từ cùng chỗ đó, đi cùng chiều với vận tốc ${v1} km/giờ. Hỏi sau bao lâu (kể từ lúc xe đạp xuất phát) thì xe đạp đuổi kịp người đi bộ? (đơn vị: giờ)`,
      correct: uv(t, 'giờ'),
      numeric: t,
      distractors: ud(
        uv(t, 'giờ'),
        [d / (v1 + v2), (v2 * m) / 100 / dv, m / 60, d / v1, ((v2 * m) / 60) * dv],
        'giờ',
        t,
      ),
      solution: `Bước 1 — đổi ${m} phút = ${fmt(m / 60)} giờ; người đi bộ đã đi trước được ${v2} × ${fmt(m / 60)} = ${fmt(d)} km. Bước 2 — hiệu vận tốc: ${v1} − ${v2} = ${dv} (km/giờ). Bước 3 — thời gian đuổi kịp: ${fmt(d)} : ${dv} = ${fmt(t)} giờ = ${hStr(t)}. Quên đổi phút ra giờ (chia 60) là lỗi phổ biến nhất ở dạng này.`,
      steps: [
        `${m} phút = ${fmt(m / 60)} giờ`,
        `Khoảng cách ban đầu = ${v2} × ${fmt(m / 60)} = ${fmt(d)} (km)`,
        `t = ${fmt(d)} : ${dv} = ${fmt(t)} giờ (${hStr(t)})`,
      ],
      hint: 'Đổi số phút ra giờ rồi nhân với vận tốc để có khoảng cách ban đầu.',
      tags: ['chuyển động', 'cùng chiều', 'đổi đơn vị thời gian'],
    };
  }

  // lvl 2
  const form = formOf(slot, 3);

  if (form === 0) {
    const v2 = pick(r, [30, 32, 36, 40]);
    const dv = pick(r, [8, 10, 12, 15]);
    const v1 = v2 + dv;
    const t = ri(r, 2, 4);
    const x = dv * ri(r, 1, 2);
    const d = dv * t + x;
    return {
      stem: `Một ô tô và một xe máy đi cùng chiều trên một con đường, ban đầu ô tô ở phía sau và cách xe máy ${d} km. Vận tốc ô tô là ${v1} km/giờ, vận tốc xe máy là ${v2} km/giờ. Hỏi sau bao lâu thì ô tô chỉ còn cách xe máy ${x} km? (đơn vị: giờ)`,
      correct: uv(t, 'giờ'),
      numeric: t,
      distractors: ud(uv(t, 'giờ'), [d / dv, (d + x) / dv, (d - x) / (v1 + v2), x / dv, d / (v1 + v2)], 'giờ', t),
      solution: `Mỗi giờ ô tô rút ngắn khoảng cách được ${v1} − ${v2} = ${dv} km. Ô tô cần rút ngắn ${d} − ${x} = ${d - x} km (chứ không phải toàn bộ ${d} km, vì đề chỉ yêu cầu còn cách ${x} km). Thời gian: ${d - x} : ${dv} = ${t} (giờ). Nếu lấy cả ${d} km chia cho ${dv} sẽ ra ${fmt(roundDec(d / dv, 2))} giờ — đó là lúc ô tô ĐUỔI KỊP hẳn.`,
      steps: [
        `Hiệu vận tốc = ${v1} − ${v2} = ${dv} (km/giờ)`,
        `Phần khoảng cách cần rút ngắn = ${d} − ${x} = ${d - x} (km)`,
        `t = ${d - x} : ${dv} = ${t} (giờ)`,
      ],
      hint: 'Chỉ cần rút ngắn phần khoảng cách chênh lệch, không phải toàn bộ khoảng cách ban đầu.',
      tags: ['chuyển động', 'cùng chiều', 'bẫy'],
    };
  }

  if (form === 1) {
    const dv = 2 * ri(r, 3, 10);
    const v2 = 2 * ri(r, 8, 18);
    const v1 = v2 + dv;
    const t = ri(r, 2, 4);
    const d = dv * t;
    const sum = v1 + v2;
    return {
      stem: `Hai xe đi cùng chiều, xe đi sau cách xe đi trước ${d} km và đuổi kịp sau ${t} giờ. Biết tổng vận tốc của hai xe là ${sum} km/giờ. Tính vận tốc của xe đi sau (đơn vị: km/giờ).`,
      correct: uv(v1, 'km/giờ'),
      numeric: v1,
      distractors: ud(uv(v1, 'km/giờ'), [sum / 2, v2, sum - d / t, d / t, sum / 2 + d / t], 'km/giờ', v1),
      solution: `Bước 1 — hiệu vận tốc: ${d} : ${t} = ${dv} (km/giờ). Bước 2 — biết tổng ${sum} và hiệu ${dv}, xe đi sau (nhanh hơn) có vận tốc (${sum} + ${dv}) : 2 = ${v1} (km/giờ); xe đi trước có vận tốc (${sum} − ${dv}) : 2 = ${v2} (km/giờ). Thử lại: ${v1} − ${v2} = ${dv} và ${v1} + ${v2} = ${sum}, đúng. Lấy ngay ${sum} : 2 = ${fmt(sum / 2)} km/giờ là quên mất phần hiệu.`,
      steps: [
        `Hiệu vận tốc = ${d} : ${t} = ${dv} (km/giờ)`,
        `Vận tốc xe đi sau = (${sum} + ${dv}) : 2 = ${v1} (km/giờ)`,
        `Thử lại: ${v1} − ${v2} = ${dv}`,
      ],
      hint: 'Khoảng cách chia thời gian ra hiệu vận tốc, kết hợp với tổng đã cho thành bài tổng – hiệu.',
      tags: ['chuyển động', 'cùng chiều', 'tổng hiệu'],
    };
  }

  // form 2 — so sánh thời gian đi của hai xe từ cùng một điểm
  const v2 = 6 * ri(r, 2, 5); // bội của 6 ⇒ vận tốc xe máy luôn là số nguyên
  const h0 = ri(r, 5, 7);
  const gap = ri(r, 2, 3);
  const h1 = h0 + gap;
  const hMeet = h1 + ri(r, 2, 3);
  const tA = hMeet - h0;
  const tB = hMeet - h1;
  const v1 = (v2 * tA) / tB;
  return {
    stem: `Lúc ${h0} giờ, một xe đạp khởi hành từ M với vận tốc ${v2} km/giờ. Lúc ${h1} giờ, một xe máy cũng khởi hành từ M đuổi theo trên cùng con đường, và đến ${hMeet} giờ thì đuổi kịp xe đạp. Tính vận tốc của xe máy (đơn vị: km/giờ).`,
    correct: uv(v1, 'km/giờ'),
    numeric: v1,
    distractors: ud(uv(v1, 'km/giờ'), [(v2 * tB) / tA, v2 + tA, v2 * gap, (v2 * tA) / gap, v1 + v2], 'km/giờ', v1),
    solution: `Đến lúc gặp nhau, hai xe đi được QUÃNG ĐƯỜNG BẰNG NHAU (cùng xuất phát từ M). Xe đạp đi từ ${h0} giờ đến ${hMeet} giờ, tức ${tA} giờ, được ${v2} × ${tA} = ${v2 * tA} km. Xe máy chỉ đi trong ${hMeet} − ${h1} = ${tB} giờ, nên vận tốc xe máy = ${v2 * tA} : ${tB} = ${v1} (km/giờ). Lỗi hay gặp là lấy nhầm thời gian: chia cho ${tA} giờ thay vì ${tB} giờ.`,
    steps: [
      `Thời gian xe đạp đi: ${hMeet} − ${h0} = ${tA} (giờ)`,
      `Quãng đường chung: ${v2} × ${tA} = ${v2 * tA} (km)`,
      `Thời gian xe máy đi: ${hMeet} − ${h1} = ${tB} (giờ)`,
      `Vận tốc xe máy = ${v2 * tA} : ${tB} = ${v1} (km/giờ)`,
    ],
    hint: 'Hai xe xuất phát cùng một chỗ nên lúc đuổi kịp quãng đường của chúng bằng nhau.',
    tags: ['chuyển động', 'cùng chiều', 'suy luận ngược'],
  };
}

/** MOTION04 — chuyển động trên dòng nước: xuôi dòng và ngược dòng. */
function MOTION04(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    const form = formOf(slot, 3);
    const vt = pick(r, [12, 15, 18, 20, 24, 25, 30, 36]);
    const vd = pick(r, [2, 3, 4, 5, 6]);
    const vx = vt + vd;
    const vn = vt - vd;

    if (form === 0) {
      return {
        stem: `Một ca nô có vận tốc riêng (vận tốc khi nước lặng) là ${vt} km/giờ, vận tốc dòng nước là ${vd} km/giờ. Tính vận tốc của ca nô khi xuôi dòng (đơn vị: km/giờ).`,
        correct: uv(vx, 'km/giờ'),
        numeric: vx,
        distractors: ud(uv(vx, 'km/giờ'), [vn, vt, vt * vd, vt + 2 * vd, vd], 'km/giờ', vx),
        solution: `Khi xuôi dòng, dòng nước đẩy ca nô đi nhanh hơn nên vận tốc xuôi dòng = vận tốc riêng + vận tốc dòng nước = ${vt} + ${vd} = ${vx} (km/giờ). Lấy phép trừ là công thức của chiều NGƯỢC dòng, cho kết quả ${vn} km/giờ.`,
        steps: [`v xuôi = v riêng + v dòng`, `v xuôi = ${vt} + ${vd} = ${vx} (km/giờ)`],
        hint: 'Xuôi dòng thì nước đẩy đi nên cộng thêm vận tốc dòng nước.',
        tags: ['dòng nước', 'xuôi dòng'],
      };
    }
    if (form === 1) {
      return {
        stem: `Một chiếc thuyền có vận tốc riêng ${vt} km/giờ đi trên khúc sông có vận tốc dòng nước ${vd} km/giờ. Tính vận tốc của thuyền khi ngược dòng (đơn vị: km/giờ).`,
        correct: uv(vn, 'km/giờ'),
        numeric: vn,
        distractors: ud(uv(vn, 'km/giờ'), [vx, vt, vt - 2 * vd, vd, vt / vd], 'km/giờ', vn),
        solution: `Khi ngược dòng, dòng nước cản lại nên vận tốc ngược dòng = vận tốc riêng − vận tốc dòng nước = ${vt} − ${vd} = ${vn} (km/giờ). Cộng hai vận tốc là công thức của chiều XUÔI dòng, cho ${vx} km/giờ.`,
        steps: [`v ngược = v riêng − v dòng`, `v ngược = ${vt} − ${vd} = ${vn} (km/giờ)`],
        hint: 'Ngược dòng thì nước cản lại nên phải trừ đi vận tốc dòng nước.',
        tags: ['dòng nước', 'ngược dòng'],
      };
    }
    return {
      stem: `Một ca nô xuôi dòng với vận tốc ${vx} km/giờ, biết vận tốc dòng nước là ${vd} km/giờ. Tính vận tốc riêng của ca nô (đơn vị: km/giờ).`,
      correct: uv(vt, 'km/giờ'),
      numeric: vt,
      distractors: ud(uv(vt, 'km/giờ'), [vx + vd, vx - 2 * vd, vx / vd, vd, vx * vd], 'km/giờ', vt),
      solution: `Vì v xuôi = v riêng + v dòng nên v riêng = v xuôi − v dòng = ${vx} − ${vd} = ${vt} (km/giờ). Thử lại: ${vt} + ${vd} = ${vx} km/giờ, đúng bằng vận tốc xuôi dòng đề cho. Cộng thêm ${vd} lần nữa (ra ${vx + vd}) là làm ngược công thức.`,
      steps: [`v riêng = v xuôi − v dòng`, `v riêng = ${vx} − ${vd} = ${vt} (km/giờ)`],
      hint: 'Từ công thức v xuôi = v riêng + v dòng, chuyển vế để tìm vận tốc riêng.',
      tags: ['dòng nước', 'suy luận ngược'],
    };
  }

  if (lvl === 1) {
    const form = formOf(slot, 3);

    if (form === 0) {
      const vt = 2 * ri(r, 6, 18);
      const vd = pick(r, [2, 3, 4, 5, 6]);
      const vx = vt + vd;
      const vn = vt - vd;
      return {
        stem: `Một ca nô đi xuôi dòng với vận tốc ${vx} km/giờ và đi ngược dòng với vận tốc ${vn} km/giờ. Tính vận tốc của dòng nước (đơn vị: km/giờ).`,
        correct: uv(vd, 'km/giờ'),
        numeric: vd,
        distractors: ud(uv(vd, 'km/giờ'), [vx - vn, (vx + vn) / 2, vx + vn, (vx - vn) / 4, vd * 2], 'km/giờ', vd),
        solution: `Ta có v xuôi = v riêng + v dòng và v ngược = v riêng − v dòng. Trừ hai đẳng thức: v xuôi − v ngược = 2 × v dòng, nên v dòng = (${vx} − ${vn}) : 2 = ${vx - vn} : 2 = ${vd} (km/giờ). Bẫy lớn nhất là QUÊN CHIA ĐÔI và trả lời ${vx - vn} km/giờ. Cộng hai vận tốc rồi chia đôi lại ra vận tốc riêng ${(vx + vn) / 2} km/giờ.`,
        steps: [
          `v xuôi − v ngược = 2 × v dòng`,
          `2 × v dòng = ${vx} − ${vn} = ${vx - vn}`,
          `v dòng = ${vx - vn} : 2 = ${vd} (km/giờ)`,
        ],
        hint: 'Hiệu của vận tốc xuôi và ngược bằng HAI LẦN vận tốc dòng nước.',
        tags: ['dòng nước', 'bẫy', 'nhiều bước'],
      };
    }

    if (form === 1) {
      const vt = pick(r, [15, 18, 20, 24, 25, 30]);
      const vd = pick(r, [2, 3, 4, 5]);
      const vx = vt + vd;
      const t = ri(r, 2, 4);
      const s = vx * t;
      return {
        stem: `Một ca nô có vận tốc riêng ${vt} km/giờ, đi xuôi dòng trên khúc sông có vận tốc dòng nước ${vd} km/giờ. Hỏi ca nô đi hết quãng sông dài ${s} km trong bao lâu? (đơn vị: giờ)`,
        correct: uv(t, 'giờ'),
        numeric: t,
        distractors: ud(uv(t, 'giờ'), [s / (vt - vd), s / vt, s / vd, t + 1, s / (vx * 2)], 'giờ', t),
        solution: `Bước 1 — vận tốc xuôi dòng: ${vt} + ${vd} = ${vx} (km/giờ). Bước 2 — thời gian: ${s} : ${vx} = ${t} (giờ). Hai lỗi hay gặp: dùng nhầm vận tốc ngược dòng ${vt - vd} km/giờ (ra ${fmt(roundDec(s / (vt - vd), 2))} giờ) hoặc bỏ quên dòng nước và chia cho ${vt} km/giờ.`,
        steps: [`v xuôi = ${vt} + ${vd} = ${vx} (km/giờ)`, `t = ${s} : ${vx} = ${t} (giờ)`],
        hint: 'Tính vận tốc xuôi dòng trước rồi mới lấy quãng đường chia cho nó.',
        tags: ['dòng nước', 'xuôi dòng', 'nhiều bước'],
      };
    }

    // form 2 — từ quãng đường và thời gian ngược dòng, tìm vận tốc riêng
    const vd = pick(r, [2, 3, 4, 5]);
    const vt = vd * pick(r, [4, 5, 6, 7]);
    const vn = vt - vd;
    const t = ri(r, 2, 4);
    const s = vn * t;
    return {
      stem: `Một thuyền máy đi ngược dòng từ bến A đến bến B dài ${s} km hết ${t} giờ. Biết vận tốc dòng nước là ${vd} km/giờ. Tính vận tốc riêng của thuyền (đơn vị: km/giờ).`,
      correct: uv(vt, 'km/giờ'),
      numeric: vt,
      distractors: ud(uv(vt, 'km/giờ'), [s / t, s / t - vd, s / t + 2 * vd, s / (t * vd), vt + vd], 'km/giờ', vt),
      solution: `Bước 1 — vận tốc ngược dòng: ${s} : ${t} = ${vn} (km/giờ). Bước 2 — vì v ngược = v riêng − v dòng nên v riêng = ${vn} + ${vd} = ${vt} (km/giờ). Dừng ở bước 1 (trả lời ${vn} km/giờ) là quên rằng dòng nước đã "ăn bớt" ${vd} km/giờ; trừ thêm lần nữa thì càng sai.`,
      steps: [
        `v ngược = ${s} : ${t} = ${vn} (km/giờ)`,
        `v riêng = ${vn} + ${vd} = ${vt} (km/giờ)`,
      ],
      hint: 'Quãng đường chia thời gian ra vận tốc NGƯỢC DÒNG, còn phải cộng lại vận tốc dòng nước.',
      tags: ['dòng nước', 'ngược dòng', 'nhiều bước'],
    };
  }

  // lvl 2 — dữ kiện cho bằng hai thời gian xuôi và ngược
  const form = formOf(slot, 2);
  const combos: [number, number, number][] = [
    [2, 3, 3],
    [3, 4, 2],
    [2, 4, 4],
    [3, 5, 3],
    [4, 6, 2],
    [2, 3, 6],
    [3, 4, 4],
  ];
  const [t1, t2, vd] = pick(r, combos);
  const vx = (2 * vd * t2) / (t2 - t1);
  const vn = vx - 2 * vd;
  const vt = vx - vd;
  const s = vx * t1;

  if (form === 0) {
    return {
      stem: `Một ca nô đi xuôi dòng từ A đến B hết ${t1} giờ, đi ngược dòng từ B về A hết ${t2} giờ. Biết vận tốc dòng nước là ${vd} km/giờ. Tính quãng đường AB (đơn vị: km).`,
      correct: uv(s, 'km'),
      numeric: s,
      distractors: ud(
        uv(s, 'km'),
        [(2 * vd * t1 * t2) / (t1 + t2), (vd * t1 * t2) / (t2 - t1), vd * (t1 + t2), s / 2, vd * t1 * t2],
        'km',
        s,
      ),
      solution: `Gọi AB = s (km). Vận tốc xuôi dòng là s : ${t1}, vận tốc ngược dòng là s : ${t2}. Hiệu của chúng bằng 2 lần vận tốc dòng nước: s : ${t1} − s : ${t2} = 2 × ${vd} = ${2 * vd}. Quy đồng: s × (${t2} − ${t1}) : (${t1} × ${t2}) = ${2 * vd}, suy ra s = ${2 * vd} × ${t1 * t2} : ${t2 - t1} = ${s} (km). Kiểm tra: v xuôi = ${s} : ${t1} = ${vx} km/giờ, v ngược = ${s} : ${t2} = ${vn} km/giờ, hiệu đúng bằng ${2 * vd} km/giờ. Quên nhân 2 với vận tốc dòng nước sẽ ra ${fmt(roundDec((vd * t1 * t2) / (t2 - t1), 2))} km.`,
      steps: [
        `v xuôi − v ngược = 2 × ${vd} = ${2 * vd} (km/giờ)`,
        `s : ${t1} − s : ${t2} = ${2 * vd}`,
        `s = ${2 * vd} × ${t1} × ${t2} : (${t2} − ${t1}) = ${s} (km)`,
      ],
      hint: 'Hiệu vận tốc xuôi và ngược luôn bằng hai lần vận tốc dòng nước.',
      tags: ['dòng nước', 'suy luận ngược', 'nhiều bước'],
    };
  }

  const tBe = s / vd;
  return {
    stem: `Một ca nô đi xuôi dòng từ A đến B hết ${t1} giờ, đi ngược dòng từ B về A hết ${t2} giờ. Biết vận tốc dòng nước là ${vd} km/giờ. Hỏi một khóm bèo trôi tự do theo dòng nước từ A đến B mất bao lâu? (đơn vị: giờ)`,
    correct: uv(tBe, 'giờ'),
    numeric: tBe,
    distractors: ud(uv(tBe, 'giờ'), [t1 + t2, s / vt, t2 - t1, s / vx, tBe / 2], 'giờ', tBe),
    solution: `Bước 1 — tìm quãng đường AB: hiệu vận tốc xuôi và ngược bằng 2 lần vận tốc dòng nước, tức s : ${t1} − s : ${t2} = ${2 * vd}, suy ra s = ${s} km. Bước 2 — khóm bèo trôi tự do nên đi đúng bằng vận tốc dòng nước: thời gian = ${s} : ${vd} = ${tBe} (giờ). Lưu ý khóm bèo KHÔNG có vận tốc riêng, nên không được dùng ${vt} km/giờ.`,
    steps: [
      `s = ${2 * vd} × ${t1} × ${t2} : (${t2} − ${t1}) = ${s} (km)`,
      `Khóm bèo trôi với vận tốc dòng nước ${vd} km/giờ`,
      `t = ${s} : ${vd} = ${tBe} (giờ)`,
    ],
    hint: 'Vật trôi tự do (bèo, bè) chỉ chuyển động bằng đúng vận tốc dòng nước.',
    tags: ['dòng nước', 'suy luận ngược', 'nhiều bước'],
  };
}

// ===========================================================================
// CHƯƠNG WORK — TOÁN NĂNG SUẤT VÀ CÔNG VIỆC
// ===========================================================================

/** Cặp (a; b) giờ làm riêng sao cho thời gian làm chung a×b : (a+b) là số NGUYÊN. */
const WORK_PAIRS: [number, number][] = [
  [3, 6],
  [4, 12],
  [6, 12],
  [10, 15],
  [12, 24],
  [20, 30],
  [6, 30],
  [8, 24],
  [5, 20],
  [9, 18],
  [15, 30],
  [14, 35],
];

/** Bộ ba (a; b; c) giờ làm riêng sao cho thời gian ba người làm chung đẹp. */
const WORK_TRIPLES: [number, number, number][] = [
  [4, 6, 12],
  [3, 4, 12],
  [6, 8, 24],
  [2, 3, 6],
  [10, 15, 30],
  [8, 12, 24],
  [12, 18, 36],
  [9, 12, 18],
];

/** Cặp (vòi chảy vào a giờ; vòi tháo ra b giờ) cho thời gian đầy bể a×b : (b−a) nguyên. */
const DRAIN_PAIRS: [number, number][] = [
  [3, 6],
  [4, 12],
  [6, 12],
  [4, 6],
  [6, 10],
  [8, 12],
  [9, 18],
  [10, 15],
  [12, 20],
  [2, 3],
  [3, 4],
  [6, 8],
];

/** Các ước của `n` nằm trong [lo; hi] — dùng để chọn số liệu chia hết. */
function divisorsIn(n: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let x = lo; x <= hi; x++) if (n % x === 0) out.push(x);
  return out;
}

/** WORK01 — năng suất và thời gian hoàn thành công việc. */
function WORK01(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    const form = formOf(slot, 3);

    if (form === 0) {
      const a = pick(r, [6, 8, 10, 12, 15, 18, 20, 24]);
      const f = frac(1, a);
      return {
        stem: `Một tổ công nhân làm xong một công việc trong ${a} ngày (mỗi ngày làm được như nhau). Hỏi mỗi ngày tổ đó làm được bao nhiêu phần công việc?`,
        correct: fStr(f),
        distractors: td(fStr(f), [String(a), fStr(frac(1, a - 1)), fStr(frac(2, a)), fStr(frac(1, a + 1)), `${a}/1`]),
        solution: `Coi cả công việc là 1 đơn vị. Làm xong trong ${a} ngày với năng suất đều nhau nghĩa là mỗi ngày làm được 1 : ${a} = ${fStr(f)} (công việc). Kiểm tra: ${fStr(f)} × ${a} = 1, tức sau ${a} ngày thì xong. Trả lời "${a}" là nhầm giữa SỐ NGÀY và PHẦN CÔNG VIỆC mỗi ngày.`,
        steps: [`Coi cả công việc là 1`, `Năng suất một ngày = 1 : ${a} = ${fStr(f)} (công việc)`],
        hint: 'Coi cả công việc là 1 rồi chia đều cho số ngày làm.',
        tags: ['năng suất', 'phần công việc'],
      };
    }
    if (form === 1) {
      const q = pick(r, [15, 20, 24, 25, 30, 40, 45]);
      const t = ri(r, 6, 20);
      const N = q * t;
      return {
        stem: `Một máy in in được ${q} trang trong 1 phút. Hỏi máy đó in ${N} trang hết bao nhiêu phút? (đơn vị: phút)`,
        correct: uv(t, 'phút'),
        numeric: t,
        distractors: ud(uv(t, 'phút'), [N * q, N - q, N / (q * 2), t + 5, q / t], 'phút', t),
        solution: `Năng suất của máy là ${q} trang mỗi phút. Thời gian = tổng số trang : năng suất = ${N} : ${q} = ${t} (phút). Thử lại: ${q} × ${t} = ${N} trang, đúng. Nhân hai số lại (${N} × ${q}) là làm ngược phép tính.`,
        steps: [`Thời gian = số trang : năng suất`, `t = ${N} : ${q} = ${t} (phút)`],
        hint: 'Lấy tổng khối lượng công việc chia cho năng suất trong một đơn vị thời gian.',
        tags: ['năng suất', 'thời gian'],
      };
    }
    const a = pick(r, [6, 8, 9, 10, 12, 15, 18]);
    const k = ri(r, 2, a - 2);
    const f = frac(k, a);
    return {
      stem: `Một người làm xong một công việc trong ${a} giờ. Hỏi trong ${k} giờ người đó làm được bao nhiêu phần công việc?`,
      correct: fStr(f),
      distractors: td(fStr(f), [
        fStr(frac(a, k)),
        fStr(frac(1, a)),
        fStr(frac(k, a - k)),
        fStr(frac(a - k, a)),
        String(k),
      ]),
      solution: `Mỗi giờ người đó làm được 1 : ${a} = ${fStr(frac(1, a))} (công việc). Trong ${k} giờ làm được ${fStr(frac(1, a))} × ${k} = ${fStr(f)} (công việc). Viết ngược thành ${fStr(frac(a, k))} là lỗi đảo tử và mẫu; ${fStr(frac(a - k, a))} lại là phần công việc CÒN LẠI chưa làm.`,
      steps: [
        `Năng suất một giờ = ${fStr(frac(1, a))} công việc`,
        `Trong ${k} giờ: ${fStr(frac(1, a))} × ${k} = ${fStr(f)} (công việc)`,
      ],
      hint: 'Nhân năng suất một giờ với số giờ đã làm.',
      tags: ['năng suất', 'phần công việc'],
    };
  }

  if (lvl === 1) {
    const form = formOf(slot, 3);

    if (form === 0) {
      const n1 = pick(r, [6, 8, 10, 12, 15]);
      const d1 = pick(r, [6, 8, 10, 12]);
      const W = n1 * d1;
      const cands = divisorsIn(W, 3, 30).filter((x) => x !== n1 && W / x >= 2 && W / x <= 30);
      const n2 = cands.length > 0 ? pick(r, cands) : n1 * 2;
      const d2 = W / n2;
      const wrongDirect = (d1 * n2) / n1;
      return {
        stem: `Một công việc nếu có ${n1} người cùng làm thì xong trong ${d1} ngày. Hỏi nếu có ${n2} người cùng làm (năng suất mỗi người như nhau) thì xong trong bao nhiêu ngày? (đơn vị: ngày)`,
        correct: uv(d2, 'ngày'),
        numeric: d2,
        distractors: ud(uv(d2, 'ngày'), [wrongDirect, d1, Math.abs(d1 - (n2 - n1)), W, d2 + 1], 'ngày', d2),
        solution: `Tổng khối lượng công việc quy ra "ngày công": ${n1} × ${d1} = ${W} (ngày công). Với ${n2} người, số ngày cần = ${W} : ${n2} = ${d2} (ngày). Đây là hai đại lượng TỈ LỆ NGHỊCH: càng đông người thì càng ít ngày. Nếu nhầm thành tỉ lệ thuận (lấy ${d1} × ${n2} : ${n1}) sẽ ra ${fmt(roundDec(wrongDirect, 2))} ngày — vô lí vì ${n2 > n1 ? 'thêm người mà lại lâu hơn' : 'bớt người mà lại nhanh hơn'}.`,
        steps: [
          `Tổng công việc = ${n1} × ${d1} = ${W} (ngày công)`,
          `Số ngày = ${W} : ${n2} = ${d2} (ngày)`,
        ],
        hint: 'Số người và số ngày tỉ lệ nghịch — hãy quy về tổng số "ngày công" trước.',
        tags: ['năng suất', 'tỉ lệ nghịch'],
      };
    }

    if (form === 1) {
      const [p, q] = pick(r, [
        [1, 2],
        [2, 3],
        [3, 5],
        [3, 4],
        [2, 5],
        [4, 5],
      ] as [number, number][]);
      const D = p * ri(r, 2, 5);
      const total = (D * q) / p;
      return {
        stem: `Một đội công nhân làm được ${p}/${q} công việc trong ${D} ngày. Hỏi với năng suất như thế, đội đó làm xong TOÀN BỘ công việc trong bao nhiêu ngày? (đơn vị: ngày)`,
        correct: uv(total, 'ngày'),
        numeric: total,
        distractors: ud(uv(total, 'ngày'), [(D * p) / q, D * q, D + q, total - D, D], 'ngày', total),
        solution: `Bước 1 — số ngày làm được 1/${q} công việc: ${D} : ${p} = ${fmt(D / p)} (ngày). Bước 2 — cả công việc gồm ${q} phần như thế nên cần ${fmt(D / p)} × ${q} = ${total} (ngày). Viết gọn: ${D} × ${q} : ${p} = ${total} ngày. Lỗi hay gặp là đảo ngược phân số và tính ${D} × ${p} : ${q} = ${fmt(roundDec((D * p) / q, 2))} ngày — kết quả nhỏ hơn ${D} ngày, vô lí vì làm cả công việc phải lâu hơn làm một phần.`,
        steps: [
          `1/${q} công việc cần ${D} : ${p} = ${fmt(D / p)} (ngày)`,
          `Cả công việc cần ${fmt(D / p)} × ${q} = ${total} (ngày)`,
        ],
        hint: 'Tìm số ngày làm được MỘT PHẦN nhỏ trước, rồi nhân lên cho đủ cả công việc.',
        tags: ['năng suất', 'phân số công việc', 'nhiều bước'],
      };
    }

    const p1 = pick(r, [20, 25, 30, 40, 50]);
    const d1 = pick(r, [6, 8, 10, 12]);
    const T = p1 * d1;
    const cands = divisorsIn(T, p1 + 5, 2 * p1).filter((x) => T / x >= 2);
    const p2 = cands.length > 0 ? pick(r, cands) : 2 * p1;
    const d2 = T / p2;
    return {
      stem: `Một xưởng dự định mỗi ngày làm ${p1} sản phẩm thì hoàn thành kế hoạch trong ${d1} ngày. Thực tế mỗi ngày xưởng làm được ${p2} sản phẩm. Hỏi xưởng hoàn thành kế hoạch trong bao nhiêu ngày? (đơn vị: ngày)`,
      correct: uv(d2, 'ngày'),
      numeric: d2,
      distractors: ud(uv(d2, 'ngày'), [(d1 * p2) / p1, d1 - 1, T / (p2 - p1), d1, d2 + 1], 'ngày', d2),
      solution: `Bước 1 — tổng số sản phẩm theo kế hoạch: ${p1} × ${d1} = ${T} (sản phẩm). Bước 2 — với năng suất thực tế ${p2} sản phẩm mỗi ngày: ${T} : ${p2} = ${d2} (ngày). Vậy xưởng hoàn thành sớm hơn dự định ${d1 - d2} ngày. Chú ý tổng số sản phẩm KHÔNG đổi, chỉ có năng suất thay đổi.`,
      steps: [
        `Tổng sản phẩm = ${p1} × ${d1} = ${T}`,
        `Số ngày thực tế = ${T} : ${p2} = ${d2} (ngày)`,
      ],
      hint: 'Khối lượng công việc không đổi: tính tổng sản phẩm trước rồi chia cho năng suất mới.',
      tags: ['năng suất', 'kế hoạch', 'nhiều bước'],
    };
  }

  // lvl 2
  const form = formOf(slot, 3);

  if (form === 0) {
    const p = pick(r, [20, 30, 40, 50]);
    const d = pick(r, [10, 12, 15, 20]);
    const k0 = ri(r, 3, Math.floor(d / 2));
    // Giữ (d − k) chẵn ⇒ luôn có phương án năng suất gấp đôi cho số ngày nguyên
    const k = (d - k0) % 2 === 0 ? k0 : k0 + 1;
    const remain = (d - k) * p;
    const cands = divisorsIn(remain, p + 5, 2 * p).filter((x) => remain / x >= 2 && remain / x < d - k);
    const p2 = cands.length > 0 ? pick(r, cands) : 2 * p;
    const days2 = remain / p2;
    const early = d - (k + days2);
    return {
      stem: `Một tổ sản xuất dự định mỗi ngày làm ${p} sản phẩm và hoàn thành kế hoạch trong ${d} ngày. Trong ${k} ngày đầu tổ làm đúng dự định, sau đó mỗi ngày tổ làm được ${p2} sản phẩm. Hỏi tổ hoàn thành kế hoạch sớm hơn dự định bao nhiêu ngày? (đơn vị: ngày)`,
      correct: uv(early, 'ngày'),
      numeric: early,
      distractors: ud(uv(early, 'ngày'), [days2, k + days2, d - days2, early + k, d - k], 'ngày', early),
      solution: `Bước 1 — tổng sản phẩm phải làm: ${p} × ${d} = ${p * d}. Bước 2 — ${k} ngày đầu làm được ${p} × ${k} = ${p * k}, còn lại ${p * d} − ${p * k} = ${remain} sản phẩm. Bước 3 — phần còn lại với năng suất ${p2} sản phẩm/ngày cần ${remain} : ${p2} = ${days2} (ngày). Bước 4 — tổng thời gian thực tế: ${k} + ${days2} = ${k + days2} (ngày), sớm hơn dự định ${d} − ${k + days2} = ${early} (ngày). Đề hỏi SỐ NGÀY SỚM HƠN chứ không hỏi tổng số ngày (${k + days2} ngày) — đọc kỹ câu hỏi.`,
      steps: [
        `Tổng sản phẩm = ${p} × ${d} = ${p * d}`,
        `Còn lại sau ${k} ngày: ${remain} sản phẩm`,
        `Thời gian làm nốt: ${remain} : ${p2} = ${days2} (ngày)`,
        `Sớm hơn: ${d} − (${k} + ${days2}) = ${early} (ngày)`,
      ],
      hint: 'Tính tổng sản phẩm, trừ phần đã làm, chia cho năng suất mới rồi so với kế hoạch.',
      tags: ['năng suất', 'tăng năng suất', 'nhiều bước'],
    };
  }

  if (form === 1) {
    const n1 = pick(r, [10, 12, 15, 16, 18]);
    const d = pick(r, [10, 12, 15, 16]);
    const k0 = ri(r, 3, Math.floor(d / 2));
    // Giữ (d − k) chẵn ⇒ luôn có phương án "gấp đôi số người" cho số ngày nguyên
    const k = (d - k0) % 2 === 0 ? k0 : k0 + 1;
    const rest = n1 * (d - k);
    const cands = divisorsIn(rest, 2, d - k - 1).filter((x) => rest / x > n1 && rest / x <= 3 * n1);
    const rd = cands.length > 0 ? pick(r, cands) : (d - k) / 2;
    const n2 = rest / rd;
    const extra = n2 - n1;
    const early = d - (k + rd);
    return {
      stem: `Một công việc được giao cho ${n1} người, dự định hoàn thành trong ${d} ngày. Sau ${k} ngày làm việc, người ta bổ sung thêm ${extra} người (năng suất mỗi người như nhau). Hỏi công việc được hoàn thành sớm hơn dự định bao nhiêu ngày? (đơn vị: ngày)`,
      correct: uv(early, 'ngày'),
      numeric: early,
      distractors: ud(uv(early, 'ngày'), [rd, k + rd, d - rd, extra, early + 1], 'ngày', early),
      solution: `Quy công việc ra "ngày công": tổng cộng ${n1} × ${d} = ${n1 * d} ngày công. Sau ${k} ngày đã làm ${n1} × ${k} = ${n1 * k} ngày công, còn ${rest} ngày công. Từ lúc này có ${n1} + ${extra} = ${n2} người nên chỉ cần ${rest} : ${n2} = ${rd} (ngày). Tổng thời gian thực tế ${k} + ${rd} = ${k + rd} ngày, sớm hơn dự định ${d} − ${k + rd} = ${early} (ngày). Lưu ý phần công việc đã làm trong ${k} ngày đầu vẫn tính theo ${n1} người.`,
      steps: [
        `Tổng công việc = ${n1} × ${d} = ${n1 * d} (ngày công)`,
        `Còn lại sau ${k} ngày = ${rest} (ngày công)`,
        `Số người mới = ${n2}; thời gian còn lại = ${rest} : ${n2} = ${rd} (ngày)`,
        `Sớm hơn ${d} − ${k + rd} = ${early} (ngày)`,
      ],
      hint: 'Quy tất cả về "ngày công", phần đã làm tính theo số người cũ, phần còn lại theo số người mới.',
      tags: ['năng suất', 'tỉ lệ nghịch', 'nhiều bước'],
    };
  }

  const a = pick(r, [10, 12, 14, 16, 18, 20]);
  const k = 2 * ri(r, 2, Math.floor(a / 2) - 1);
  const restH = (a - k) / 2;
  const fRest = frac(a - k, a);
  return {
    stem: `Một người dự định làm xong một công việc trong ${a} giờ. Sau khi làm được ${k} giờ theo đúng dự định, người đó tăng năng suất lên GẤP ĐÔI. Hỏi người đó cần làm thêm bao nhiêu giờ nữa thì xong công việc? (đơn vị: giờ)`,
    correct: uv(restH, 'giờ'),
    numeric: restH,
    distractors: ud(uv(restH, 'giờ'), [a - k, (a - k) * 2, a / 2, k / 2, restH + 1], 'giờ', restH),
    solution: `Bước 1 — năng suất ban đầu: mỗi giờ làm ${fStr(frac(1, a))} công việc; sau ${k} giờ đã làm được ${fStr(frac(k, a))} công việc, còn lại ${fStr(fRest)} công việc. Bước 2 — năng suất mới gấp đôi: ${fStr(frac(2, a))} công việc mỗi giờ. Bước 3 — thời gian còn lại = ${fStr(fRest)} : ${fStr(frac(2, a))} = ${fmt(restH)} (giờ). Cách nhẩm nhanh: phần việc còn lại vốn cần ${a - k} giờ, làm nhanh gấp đôi nên chỉ mất một nửa, tức ${fmt(restH)} giờ. Quên chia đôi sẽ ra ${a - k} giờ.`,
    steps: [
      `Sau ${k} giờ còn lại ${fStr(fRest)} công việc`,
      `Phần đó theo năng suất cũ cần ${a} − ${k} = ${a - k} (giờ)`,
      `Năng suất gấp đôi ⇒ thời gian giảm một nửa: ${a - k} : 2 = ${fmt(restH)} (giờ)`,
    ],
    hint: 'Năng suất gấp đôi thì thời gian làm cùng khối lượng công việc giảm một nửa.',
    tags: ['năng suất', 'tỉ lệ nghịch', 'nhiều bước'],
  };
}

/** WORK02 — hai người cùng làm chung một công việc. */
function WORK02(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    const form = formOf(slot, 3);
    const [a, b] = pick(r, WORK_PAIRS);
    const t = (a * b) / (a + b);

    if (form === 0) {
      return {
        stem: `Người thứ nhất làm một mình xong một công việc trong ${a} giờ, người thứ hai làm một mình xong công việc đó trong ${b} giờ. Hỏi hai người cùng làm chung thì sau bao lâu xong công việc? (đơn vị: giờ)`,
        correct: uv(t, 'giờ'),
        numeric: t,
        distractors: ud(uv(t, 'giờ'), [a + b, (a + b) / 2, b - a, a * b, t + 1], 'giờ', t),
        solution: `Mỗi giờ người thứ nhất làm được ${fStr(frac(1, a))} công việc, người thứ hai làm được ${fStr(frac(1, b))} công việc. Làm chung, mỗi giờ cả hai làm được ${fStr(frac(1, a))} + ${fStr(frac(1, b))} = ${fStr(frac(a + b, a * b))} công việc. Thời gian làm chung = 1 : ${fStr(frac(a + b, a * b))} = ${fmt(t)} (giờ). SAI LẦM NẶNG NHẤT là cộng thẳng thời gian: ${a} + ${b} = ${a + b} giờ — vô lí, vì làm chung phải NHANH HƠN cả người giỏi nhất (${Math.min(a, b)} giờ). Lấy trung bình cộng ${fmt((a + b) / 2)} giờ cũng sai vì lí do đó.`,
        steps: [
          `Năng suất người 1: ${fStr(frac(1, a))} công việc/giờ`,
          `Năng suất người 2: ${fStr(frac(1, b))} công việc/giờ`,
          `Năng suất chung: ${fStr(frac(a + b, a * b))} công việc/giờ`,
          `Thời gian = 1 : ${fStr(frac(a + b, a * b))} = ${fmt(t)} (giờ)`,
        ],
        hint: 'Cộng NĂNG SUẤT (phần công việc mỗi giờ) chứ không bao giờ được cộng thời gian.',
        tags: ['làm chung', 'năng suất', 'bẫy'],
      };
    }
    if (form === 1) {
      const f = frac(a + b, a * b);
      return {
        stem: `Người thứ nhất làm một mình xong một công việc trong ${a} giờ, người thứ hai làm một mình xong công việc đó trong ${b} giờ. Hỏi trong 1 giờ, cả hai người cùng làm được bao nhiêu phần công việc?`,
        correct: fStr(f),
        distractors: td(fStr(f), [
          fStr(frac(1, a + b)),
          fStr(frac(2, a + b)),
          fStr(frac(1, a * b)),
          fStr(frac(b - a, a * b)),
          String(a + b),
        ]),
        solution: `Trong 1 giờ: người thứ nhất làm ${fStr(frac(1, a))} công việc, người thứ hai làm ${fStr(frac(1, b))} công việc. Quy đồng mẫu chung ${a * b}: ${b}/${a * b} + ${a}/${a * b} = ${a + b}/${a * b} = ${fStr(f)} (công việc). Lỗi hay gặp là cộng MẪU SỐ thành ${fStr(frac(1, a + b))} — quy đồng sai hoàn toàn.`,
        steps: [
          `Năng suất riêng: ${fStr(frac(1, a))} và ${fStr(frac(1, b))} (công việc mỗi giờ)`,
          `Quy đồng mẫu ${a * b}: ${b}/${a * b} + ${a}/${a * b} = ${a + b}/${a * b}`,
          `Rút gọn: ${fStr(f)} (công việc mỗi giờ)`,
        ],
        hint: 'Muốn cộng hai phân số phải quy đồng mẫu số, không được cộng mẫu với mẫu.',
        tags: ['làm chung', 'phân số công việc'],
      };
    }
    return {
      stem: `Hai người cùng làm chung thì xong một công việc trong ${fmt(t)} giờ. Nếu người thứ nhất làm một mình thì mất ${a} giờ. Hỏi người thứ hai làm một mình thì xong công việc đó trong bao lâu? (đơn vị: giờ)`,
      correct: uv(b, 'giờ'),
      numeric: b,
      distractors: ud(uv(b, 'giờ'), [a - t, a + t, t * 2, a * t, b + 1], 'giờ', b),
      solution: `Mỗi giờ hai người làm chung được 1 : ${fmt(t)} = ${fStr(frac(a + b, a * b))} công việc, riêng người thứ nhất làm được ${fStr(frac(1, a))} công việc. Vậy mỗi giờ người thứ hai làm được ${fStr(frac(a + b, a * b))} − ${fStr(frac(1, a))} = ${fStr(frac(1, b))} (công việc), nên người thứ hai làm một mình mất 1 : ${fStr(frac(1, b))} = ${b} (giờ). Trừ thẳng thời gian (${a} − ${fmt(t)} = ${fmt(a - t)} giờ) là sai vì thời gian không cộng trừ được như năng suất.`,
      steps: [
        `Năng suất chung = 1 : ${fmt(t)} = ${fStr(frac(a + b, a * b))} (công việc/giờ)`,
        `Năng suất người thứ hai = ${fStr(frac(a + b, a * b))} − ${fStr(frac(1, a))} = ${fStr(frac(1, b))}`,
        `Thời gian = 1 : ${fStr(frac(1, b))} = ${b} (giờ)`,
      ],
      hint: 'Lấy năng suất chung TRỪ năng suất người đã biết, rồi mới nghịch đảo ra thời gian.',
      tags: ['làm chung', 'suy luận ngược'],
    };
  }

  if (lvl === 1) {
    const form = formOf(slot, 3);

    if (form === 0) {
      const [a, b, c] = pick(r, WORK_TRIPLES);
      const rate = 1 / a + 1 / b + 1 / c;
      const t = roundDec(1 / rate, 4);
      const fr = frac(b * c + a * c + a * b, a * b * c);
      return {
        stem: `Ba người cùng làm chung một công việc. Nếu làm một mình, người thứ nhất mất ${a} giờ, người thứ hai mất ${b} giờ, người thứ ba mất ${c} giờ. Hỏi cả ba người cùng làm thì sau bao lâu xong công việc? (đơn vị: giờ)`,
        correct: uv(t, 'giờ'),
        numeric: t,
        distractors: ud(uv(t, 'giờ'), [a + b + c, (a + b + c) / 3, (a * b) / (a + b), c - t, t + 1], 'giờ', t),
        solution: `Mỗi giờ ba người lần lượt làm được ${fStr(frac(1, a))}, ${fStr(frac(1, b))} và ${fStr(frac(1, c))} công việc. Cùng làm, mỗi giờ cả ba làm được ${fStr(frac(1, a))} + ${fStr(frac(1, b))} + ${fStr(frac(1, c))} = ${fStr(fr)} (công việc). Thời gian = 1 : ${fStr(fr)} = ${fmt(t)} (giờ). Kết quả phải NHỎ HƠN ${Math.min(a, b, c)} giờ (thời gian của người nhanh nhất); cộng thời gian thành ${a + b + c} giờ hay lấy trung bình ${fmt(roundDec((a + b + c) / 3, 2))} giờ đều vô lí.`,
        steps: [
          `Năng suất từng người: ${fStr(frac(1, a))}; ${fStr(frac(1, b))}; ${fStr(frac(1, c))}`,
          `Năng suất chung = ${fStr(fr)} (công việc/giờ)`,
          `t = 1 : ${fStr(fr)} = ${fmt(t)} (giờ)`,
        ],
        hint: 'Cộng ba năng suất lại rồi lấy 1 chia cho tổng đó.',
        tags: ['làm chung', 'ba người', 'nhiều bước'],
      };
    }

    if (form === 1) {
      const [a, b] = pick(r, WORK_PAIRS);
      const t = (a * b) / (a + b);
      const k = ri(r, 1, Math.max(1, Math.floor(t) - 1));
      const done = frac(k * (a + b), a * b);
      return {
        stem: `Người thứ nhất làm một mình xong một công việc trong ${a} giờ, người thứ hai mất ${b} giờ. Hai người cùng làm chung trong ${k} giờ. Hỏi họ đã làm được bao nhiêu phần công việc?`,
        correct: fStr(done),
        distractors: td(fStr(done), [
          fStr(frac(k, a + b)),
          fStr(frac(a * b - k * (a + b), a * b)),
          fStr(frac(k, a)),
          fStr(frac(a + b, a * b)),
          fStr(frac(2 * k, a + b)),
        ]),
        solution: `Mỗi giờ hai người làm chung được ${fStr(frac(1, a))} + ${fStr(frac(1, b))} = ${fStr(frac(a + b, a * b))} (công việc). Trong ${k} giờ họ làm được ${fStr(frac(a + b, a * b))} × ${k} = ${fStr(done)} (công việc). Phân số ${fStr(frac(a * b - k * (a + b), a * b))} là phần công việc CÒN LẠI chứ không phải phần đã làm — đọc kỹ đề.`,
        steps: [
          `Năng suất chung = ${fStr(frac(a + b, a * b))} (công việc/giờ)`,
          `Sau ${k} giờ: ${fStr(frac(a + b, a * b))} × ${k} = ${fStr(done)} (công việc)`,
        ],
        hint: 'Nhân năng suất chung với số giờ đã làm chung.',
        tags: ['làm chung', 'phân số công việc'],
      };
    }

    const [a, b] = pick(r, WORK_PAIRS);
    const t = (a * b) / (a + b);
    const k = ri(r, 1, Math.max(1, Math.floor(t) - 1));
    const left = frac(a * b - k * (a + b), a * b);
    return {
      stem: `Hai người cùng làm chung một công việc: người thứ nhất làm một mình mất ${a} giờ, người thứ hai mất ${b} giờ. Sau khi cùng làm được ${k} giờ, hỏi còn lại bao nhiêu phần công việc chưa hoàn thành?`,
      correct: fStr(left),
      distractors: td(fStr(left), [
        fStr(frac(k * (a + b), a * b)),
        fStr(frac(1, a + b)),
        fStr(frac(a * b - k, a * b)),
        fStr(frac(a + b, a * b)),
        fStr(frac(k, a)),
      ]),
      solution: `Mỗi giờ cả hai làm được ${fStr(frac(a + b, a * b))} công việc, nên sau ${k} giờ họ làm được ${fStr(frac(k * (a + b), a * b))} công việc. Phần còn lại: 1 − ${fStr(frac(k * (a + b), a * b))} = ${fStr(left)} (công việc). Nếu quên bước lấy 1 trừ đi thì sẽ trả lời nhầm ${fStr(frac(k * (a + b), a * b))} — đó là phần ĐÃ LÀM.`,
      steps: [
        `Năng suất chung = ${fStr(frac(a + b, a * b))} (công việc/giờ)`,
        `Đã làm sau ${k} giờ: ${fStr(frac(k * (a + b), a * b))}`,
        `Còn lại: 1 − ${fStr(frac(k * (a + b), a * b))} = ${fStr(left)}`,
      ],
      hint: 'Cả công việc là 1; lấy 1 trừ đi phần đã làm mới ra phần còn lại.',
      tags: ['làm chung', 'phân số công việc', 'nhiều bước'],
    };
  }

  // lvl 2
  const form = formOf(slot, 3);

  if (form === 0) {
    const [a, b] = pick(r, WORK_PAIRS);
    const t = (a * b) / (a + b);
    const opts: number[] = [];
    for (let k = 1; k < t; k++) {
      const val = b * (1 - k / a - k / b);
      if (val > 0.4 && Math.abs(val * 60 - Math.round(val * 60)) < 1e-9) opts.push(k);
    }
    const k = opts.length > 0 ? pick(r, opts) : 1;
    const rest = roundDec(b * (1 - k / a - k / b), 4);
    const leftF = frac(a * b - k * (a + b), a * b);
    return {
      stem: `Người thứ nhất làm một mình xong một công việc trong ${a} giờ, người thứ hai mất ${b} giờ. Hai người cùng làm được ${k} giờ thì người thứ nhất phải nghỉ, người thứ hai làm nốt phần còn lại. Hỏi người thứ hai phải làm thêm bao nhiêu giờ nữa? (đơn vị: giờ)`,
      correct: uv(rest, 'giờ'),
      numeric: rest,
      distractors: ud(uv(rest, 'giờ'), [b - k, b - t, a - k, rest + k, b], 'giờ', rest),
      solution: `Bước 1 — năng suất chung: ${fStr(frac(1, a))} + ${fStr(frac(1, b))} = ${fStr(frac(a + b, a * b))} (công việc mỗi giờ). Bước 2 — sau ${k} giờ làm chung, phần còn lại là 1 − ${fStr(frac(k * (a + b), a * b))} = ${fStr(leftF)} (công việc). Bước 3 — người thứ hai có năng suất ${fStr(frac(1, b))} công việc mỗi giờ nên cần ${fStr(leftF)} : ${fStr(frac(1, b))} = ${fStr(leftF)} × ${b} = ${fmt(rest)} (giờ), tức ${hStr(rest)}. Lấy ${b} − ${k} = ${b - k} giờ là sai, vì trong ${k} giờ đầu người thứ hai không làm một mình mà có người phụ.`,
      steps: [
        `Năng suất chung = ${fStr(frac(a + b, a * b))} (công việc/giờ)`,
        `Còn lại sau ${k} giờ: ${fStr(leftF)} (công việc)`,
        `Thời gian người thứ hai làm nốt = ${fStr(leftF)} × ${b} = ${fmt(rest)} giờ (${hStr(rest)})`,
      ],
      hint: 'Tìm phần công việc còn lại rồi chia cho năng suất riêng của người làm nốt.',
      tags: ['làm chung', 'làm nốt', 'nhiều bước'],
    };
  }

  if (form === 1) {
    const [a, b] = pick(r, WORK_PAIRS);
    const t = (a * b) / (a + b);
    const opts: number[] = [];
    for (let k = 1; k < a; k++) {
      const val = (1 - k / a) * t;
      if (val > 0.4 && Math.abs(val * 60 - Math.round(val * 60)) < 1e-9) opts.push(k);
    }
    const k = opts.length > 0 ? pick(r, opts) : 1;
    const rest = roundDec((1 - k / a) * t, 4);
    const leftF = frac(a - k, a);
    return {
      stem: `Người thứ nhất làm một mình xong một công việc trong ${a} giờ, người thứ hai mất ${b} giờ. Người thứ nhất làm một mình ${k} giờ rồi người thứ hai cùng vào làm với người thứ nhất cho đến khi xong. Hỏi hai người còn phải làm chung bao nhiêu giờ nữa? (đơn vị: giờ)`,
      correct: uv(rest, 'giờ'),
      numeric: rest,
      distractors: ud(uv(rest, 'giờ'), [t, t - k, a - k, b - k, rest + k], 'giờ', rest),
      solution: `Bước 1 — sau ${k} giờ làm một mình, người thứ nhất làm được ${fStr(frac(k, a))} công việc, còn lại ${fStr(leftF)} công việc. Bước 2 — năng suất khi làm chung: ${fStr(frac(1, a))} + ${fStr(frac(1, b))} = ${fStr(frac(a + b, a * b))} (công việc mỗi giờ), tức cả hai làm xong TOÀN BỘ công việc trong ${fmt(t)} giờ. Bước 3 — thời gian làm chung phần còn lại = ${fStr(leftF)} × ${fmt(t)} = ${fmt(rest)} (giờ), tức ${hStr(rest)}. Trả lời ${fmt(t)} giờ là quên rằng công việc đã được làm trước một phần.`,
      steps: [
        `Sau ${k} giờ còn lại ${fStr(leftF)} công việc`,
        `Làm chung cả công việc mất ${fmt(t)} giờ`,
        `Thời gian còn lại = ${fStr(leftF)} × ${fmt(t)} = ${fmt(rest)} giờ (${hStr(rest)})`,
      ],
      hint: 'Tính phần công việc còn lại, rồi nhân với thời gian hai người làm chung cả công việc.',
      tags: ['làm chung', 'nhiều bước'],
    };
  }

  const t2 = pick(r, [2, 3, 4, 6]);
  // Số lần nhanh hơn phải là ước của t2 ⇒ thời gian của người thứ nhất cũng nguyên
  const kTimes = pick(r, divisorsIn(t2, 2, t2));
  const bAlone = t2 * (kTimes + 1);
  const aAlone = bAlone / kTimes;
  return {
    stem: `Hai người cùng làm chung thì xong một công việc trong ${t2} giờ. Biết rằng nếu làm một mình thì người thứ nhất làm nhanh gấp ${kTimes} lần người thứ hai. Hỏi người thứ hai làm một mình thì xong công việc trong bao lâu? (đơn vị: giờ)`,
    correct: uv(bAlone, 'giờ'),
    numeric: bAlone,
    distractors: ud(uv(bAlone, 'giờ'), [t2 * kTimes, aAlone, t2 * 2, t2 + kTimes, bAlone + t2], 'giờ', bAlone),
    solution: `Gọi thời gian người thứ hai làm một mình là b giờ. Người thứ nhất nhanh gấp ${kTimes} lần nên chỉ mất b : ${kTimes} giờ, tức mỗi giờ làm được ${kTimes} : b công việc, còn người thứ hai làm được 1 : b công việc. Làm chung mỗi giờ được (${kTimes} + 1) : b = ${kTimes + 1} : b công việc, mà làm chung xong trong ${t2} giờ nên ${kTimes + 1} : b = 1 : ${t2}. Suy ra b = ${t2} × ${kTimes + 1} = ${bAlone} (giờ). Kiểm tra: người thứ nhất mất ${aAlone} giờ, năng suất chung = ${fStr(frac(1, aAlone))} + ${fStr(frac(1, bAlone))} = ${fStr(frac(1, t2))}, đúng. Nhân nhầm thành ${t2} × ${kTimes} = ${t2 * kTimes} giờ là lỗi quên cộng 1 phần của chính người thứ hai.`,
    steps: [
      `Gọi thời gian người thứ hai là b giờ ⇒ người thứ nhất mất b : ${kTimes} giờ`,
      `Năng suất chung = (${kTimes} + 1) : b = 1 : ${t2}`,
      `b = ${t2} × ${kTimes + 1} = ${bAlone} (giờ)`,
    ],
    hint: 'Nếu người thứ hai mất b giờ thì mỗi giờ hai người làm được (số lần + 1) : b công việc.',
    tags: ['làm chung', 'suy luận ngược', 'tỉ lệ'],
  };
}

/** WORK03 — bài toán vòi nước chảy vào bể. */
function WORK03(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    const form = formOf(slot, 3);

    if (form === 0) {
      const a = pick(r, [4, 5, 6, 8, 9, 10, 12]);
      const f = frac(1, a);
      return {
        stem: `Một vòi nước chảy một mình thì sau ${a} giờ đầy bể. Hỏi trong 1 giờ vòi đó chảy được bao nhiêu phần bể?`,
        correct: fStr(f),
        distractors: td(fStr(f), [String(a), fStr(frac(1, a + 1)), fStr(frac(2, a)), fStr(frac(1, a - 1)), `${a}/1`]),
        solution: `Coi cả bể là 1 đơn vị. Vòi chảy đều trong ${a} giờ thì đầy bể nên mỗi giờ chảy được 1 : ${a} = ${fStr(f)} (bể). Kiểm tra: ${fStr(f)} × ${a} = 1 (đầy bể). Trả lời "${a}" là nhầm số giờ với phần bể.`,
        steps: [`Coi cả bể là 1`, `Mỗi giờ chảy 1 : ${a} = ${fStr(f)} (bể)`],
        hint: 'Coi cả bể là 1 rồi chia đều cho số giờ chảy đầy.',
        tags: ['vòi nước', 'phần bể'],
      };
    }
    if (form === 1) {
      const q = pick(r, [10, 12, 15, 20, 25, 30]);
      const m = pick(r, [20, 24, 30, 36, 40, 45]);
      const V = q * m;
      return {
        stem: `Một bể chứa được ${V} lít nước. Người ta mở một vòi chảy vào bể, mỗi phút chảy được ${q} lít. Hỏi sau bao nhiêu phút thì bể đầy? (đơn vị: phút)`,
        correct: uv(m, 'phút'),
        numeric: m,
        distractors: ud(uv(m, 'phút'), [V * q, V - q, V / (q * 60), m / 60, m + 10], 'phút', m),
        solution: `Thời gian = dung tích bể : lượng nước chảy mỗi phút = ${V} : ${q} = ${m} (phút). Thử lại: ${q} × ${m} = ${V} lít, đúng bằng dung tích bể. Nếu đề hỏi theo giờ thì còn phải đổi ${m} phút = ${fmt(roundDec(m / 60, 4))} giờ.`,
        steps: [`t = ${V} : ${q}`, `t = ${m} (phút)`],
        hint: 'Lấy dung tích của bể chia cho lượng nước chảy vào trong một phút.',
        tags: ['vòi nước', 'dung tích'],
      };
    }
    const a = pick(r, [6, 8, 9, 10, 12, 15]);
    const k = ri(r, 2, a - 2);
    const f = frac(k, a);
    return {
      stem: `Một vòi nước chảy một mình thì sau ${a} giờ đầy bể (bể đang cạn). Hỏi sau ${k} giờ, vòi đó chảy được bao nhiêu phần bể?`,
      correct: fStr(f),
      distractors: td(fStr(f), [
        fStr(frac(a, k)),
        fStr(frac(a - k, a)),
        fStr(frac(1, a)),
        fStr(frac(k, a - k)),
        String(k),
      ]),
      solution: `Mỗi giờ vòi chảy được ${fStr(frac(1, a))} bể, nên sau ${k} giờ chảy được ${fStr(frac(1, a))} × ${k} = ${fStr(f)} (bể). Phân số ${fStr(frac(a - k, a))} là phần bể CÒN THIẾU, đừng nhầm với phần đã chảy.`,
      steps: [`Mỗi giờ chảy ${fStr(frac(1, a))} bể`, `Sau ${k} giờ: ${fStr(frac(1, a))} × ${k} = ${fStr(f)} (bể)`],
      hint: 'Nhân phần bể chảy được trong một giờ với số giờ đã chảy.',
      tags: ['vòi nước', 'phần bể'],
    };
  }

  if (lvl === 1) {
    const form = formOf(slot, 3);

    if (form === 0) {
      const [a, b] = pick(r, WORK_PAIRS);
      const t = (a * b) / (a + b);
      return {
        stem: `Một bể cạn có hai vòi nước. Nếu chảy một mình, vòi thứ nhất chảy đầy bể trong ${a} giờ, vòi thứ hai trong ${b} giờ. Hỏi mở cả hai vòi cùng lúc thì sau bao lâu bể đầy? (đơn vị: giờ)`,
        correct: uv(t, 'giờ'),
        numeric: t,
        distractors: ud(uv(t, 'giờ'), [a + b, (a + b) / 2, b - a, a * b, t + 1], 'giờ', t),
        solution: `Trong 1 giờ vòi thứ nhất chảy ${fStr(frac(1, a))} bể, vòi thứ hai chảy ${fStr(frac(1, b))} bể, cả hai chảy được ${fStr(frac(a + b, a * b))} bể. Thời gian đầy bể = 1 : ${fStr(frac(a + b, a * b))} = ${fmt(t)} (giờ). Cộng thẳng thời gian hai vòi (${a} + ${b} = ${a + b} giờ) là sai hoàn toàn: mở thêm vòi thì bể phải đầy NHANH HƠN ${Math.min(a, b)} giờ chứ không chậm đi.`,
        steps: [
          `Vòi 1: ${fStr(frac(1, a))} bể/giờ; vòi 2: ${fStr(frac(1, b))} bể/giờ`,
          `Hai vòi: ${fStr(frac(a + b, a * b))} bể/giờ`,
          `t = 1 : ${fStr(frac(a + b, a * b))} = ${fmt(t)} (giờ)`,
        ],
        hint: 'Cộng lượng nước hai vòi chảy trong một giờ, tuyệt đối không cộng thời gian.',
        tags: ['vòi nước', 'hai vòi', 'bẫy'],
      };
    }

    if (form === 1) {
      const [a, b] = pick(r, DRAIN_PAIRS);
      const t = (a * b) / (b - a);
      return {
        stem: `Một bể cạn có một vòi chảy vào và một vòi tháo ra ở đáy. Nếu chỉ mở vòi chảy vào thì sau ${a} giờ bể đầy; nếu bể đầy và chỉ mở vòi tháo thì sau ${b} giờ bể cạn hết. Hỏi nếu mở đồng thời cả hai vòi khi bể đang cạn thì sau bao lâu bể đầy? (đơn vị: giờ)`,
        correct: uv(t, 'giờ'),
        numeric: t,
        distractors: ud(uv(t, 'giờ'), [(a * b) / (a + b), a + b, b - a, a, t + 1], 'giờ', t),
        solution: `Mỗi giờ vòi chảy vào thêm ${fStr(frac(1, a))} bể, vòi tháo bớt đi ${fStr(frac(1, b))} bể. Vì hai vòi tác dụng NGƯỢC NHAU nên mỗi giờ lượng nước trong bể chỉ tăng ${fStr(frac(1, a))} − ${fStr(frac(1, b))} = ${fStr(frac(b - a, a * b))} (bể). Thời gian đầy bể = 1 : ${fStr(frac(b - a, a * b))} = ${t} (giờ). Cộng hai năng suất (ra ${fmt(roundDec((a * b) / (a + b), 2))} giờ) là quên rằng vòi tháo làm MẤT nước.`,
        steps: [
          `Vòi vào: +${fStr(frac(1, a))} bể/giờ; vòi tháo: −${fStr(frac(1, b))} bể/giờ`,
          `Mỗi giờ bể tăng ${fStr(frac(b - a, a * b))} bể`,
          `t = 1 : ${fStr(frac(b - a, a * b))} = ${t} (giờ)`,
        ],
        hint: 'Vòi tháo mang dấu trừ: lấy năng suất vòi chảy vào TRỪ năng suất vòi tháo ra.',
        tags: ['vòi nước', 'vòi tháo', 'bẫy'],
      };
    }

    const q1 = pick(r, [8, 10, 12, 15, 20]);
    const q2 = pick(r, [5, 6, 9, 14, 25]);
    const m = pick(r, [12, 15, 20, 24, 30]);
    const V = (q1 + q2) * m;
    return {
      stem: `Một bể chứa ${V} lít nước. Vòi thứ nhất mỗi phút chảy được ${q1} lít, vòi thứ hai mỗi phút chảy được ${q2} lít. Mở cả hai vòi cùng lúc vào bể đang cạn thì sau bao nhiêu phút bể đầy? (đơn vị: phút)`,
      correct: uv(m, 'phút'),
      numeric: m,
      distractors: ud(uv(m, 'phút'), [V / q1, V / q2, V / Math.abs(q1 - q2), m * 2, V / (q1 * q2)], 'phút', m),
      solution: `Mỗi phút cả hai vòi chảy được ${q1} + ${q2} = ${q1 + q2} (lít). Thời gian đầy bể = ${V} : ${q1 + q2} = ${m} (phút). Dùng một vòi thôi sẽ lâu hơn: ${fmt(roundDec(V / q1, 2))} phút hoặc ${fmt(roundDec(V / q2, 2))} phút — đó là hai phương án nhiễu hay bị chọn nhầm.`,
      steps: [`Năng suất hai vòi = ${q1} + ${q2} = ${q1 + q2} (lít/phút)`, `t = ${V} : ${q1 + q2} = ${m} (phút)`],
      hint: 'Cộng lượng nước hai vòi chảy trong một phút rồi chia dung tích bể cho tổng đó.',
      tags: ['vòi nước', 'hai vòi'],
    };
  }

  // lvl 2
  const form = formOf(slot, 3);

  if (form === 0) {
    const [a, b] = pick(r, WORK_PAIRS);
    const t = (a * b) / (a + b);
    const opts: number[] = [];
    for (let k = 1; k < t; k++) {
      const val = b * (1 - k / a - k / b);
      if (val > 0.4 && Math.abs(val * 60 - Math.round(val * 60)) < 1e-9) opts.push(k);
    }
    const k = opts.length > 0 ? pick(r, opts) : 1;
    const rest = roundDec(b * (1 - k / a - k / b), 4);
    const leftF = frac(a * b - k * (a + b), a * b);
    return {
      stem: `Một bể cạn có hai vòi: vòi thứ nhất chảy một mình đầy bể trong ${a} giờ, vòi thứ hai trong ${b} giờ. Người ta mở cả hai vòi trong ${k} giờ rồi khóa vòi thứ nhất, chỉ để vòi thứ hai chảy tiếp. Hỏi vòi thứ hai phải chảy thêm bao lâu nữa thì bể đầy? (đơn vị: giờ)`,
      correct: uv(rest, 'giờ'),
      numeric: rest,
      distractors: ud(uv(rest, 'giờ'), [b - k, b - t, a - k, rest + k, b], 'giờ', rest),
      solution: `Bước 1 — hai vòi cùng chảy được ${fStr(frac(1, a))} + ${fStr(frac(1, b))} = ${fStr(frac(a + b, a * b))} bể mỗi giờ. Bước 2 — sau ${k} giờ, trong bể có ${fStr(frac(k * (a + b), a * b))} bể nước, còn thiếu ${fStr(leftF)} bể. Bước 3 — một mình vòi thứ hai chảy ${fStr(frac(1, b))} bể mỗi giờ nên cần ${fStr(leftF)} × ${b} = ${fmt(rest)} (giờ), tức ${hStr(rest)}. Lấy ${b} − ${k} = ${b - k} giờ là sai vì trong ${k} giờ đầu vòi thứ hai không chảy một mình.`,
      steps: [
        `Hai vòi: ${fStr(frac(a + b, a * b))} bể/giờ`,
        `Sau ${k} giờ còn thiếu ${fStr(leftF)} bể`,
        `Thời gian còn lại = ${fStr(leftF)} × ${b} = ${fmt(rest)} giờ (${hStr(rest)})`,
      ],
      hint: 'Tính phần bể còn thiếu rồi chia cho năng suất riêng của vòi còn mở.',
      tags: ['vòi nước', 'nhiều bước'],
    };
  }

  if (form === 1) {
    const [a, b] = pick(r, WORK_PAIRS);
    const t = (a * b) / (a + b);
    const p = pick(r, [2, 3, 4, 5]);
    const rest = roundDec(t * (1 - 1 / p), 4);
    return {
      stem: `Một bể đã có sẵn 1/${p} bể nước. Người ta mở đồng thời hai vòi chảy vào bể: vòi thứ nhất chảy một mình đầy bể trong ${a} giờ, vòi thứ hai trong ${b} giờ. Hỏi sau bao lâu thì bể đầy? (đơn vị: giờ)`,
      correct: uv(rest, 'giờ'),
      numeric: rest,
      distractors: ud(uv(rest, 'giờ'), [t, t / p, a + b, t + t / p, a / p], 'giờ', rest),
      solution: `Bước 1 — phần bể còn thiếu: 1 − ${fStr(frac(1, p))} = ${fStr(frac(p - 1, p))} (bể). Bước 2 — hai vòi cùng chảy được ${fStr(frac(a + b, a * b))} bể mỗi giờ, tức đầy CẢ bể trong ${fmt(t)} giờ. Bước 3 — thời gian cần thiết = ${fStr(frac(p - 1, p))} × ${fmt(t)} = ${fmt(rest)} (giờ), tức ${hStr(rest)}. Quên phần nước có sẵn sẽ ra ${fmt(t)} giờ — dài hơn thực tế.`,
      steps: [
        `Phần còn thiếu = 1 − ${fStr(frac(1, p))} = ${fStr(frac(p - 1, p))} (bể)`,
        `Hai vòi đầy cả bể trong ${fmt(t)} giờ`,
        `t = ${fStr(frac(p - 1, p))} × ${fmt(t)} = ${fmt(rest)} giờ (${hStr(rest)})`,
      ],
      hint: 'Bể đã có sẵn nước nên chỉ cần chảy thêm phần còn thiếu.',
      tags: ['vòi nước', 'nhiều bước'],
    };
  }

  const [a, b] = pick(r, DRAIN_PAIRS);
  const T = (a * b) / (b - a);
  return {
    stem: `Một bể cạn có một vòi chảy vào và một vòi tháo ở đáy. Nếu chỉ mở vòi chảy vào thì sau ${a} giờ bể đầy. Nhưng do quên khóa vòi tháo nên phải mất ${T} giờ bể mới đầy. Hỏi nếu bể đầy nước và chỉ mở vòi tháo thì sau bao lâu bể cạn hết? (đơn vị: giờ)`,
    correct: uv(b, 'giờ'),
    numeric: b,
    distractors: ud(uv(b, 'giờ'), [T - a, T + a, (a * T) / (T + a), T * 2, a * 2], 'giờ', b),
    solution: `Mỗi giờ vòi chảy vào được ${fStr(frac(1, a))} bể. Thực tế mỗi giờ bể chỉ đầy thêm 1 : ${T} = ${fStr(frac(1, T))} bể, phần chênh lệch chính là lượng nước vòi tháo lấy đi: ${fStr(frac(1, a))} − ${fStr(frac(1, T))} = ${fStr(frac(T - a, a * T))} = ${fStr(frac(1, b))} (bể mỗi giờ). Vậy một mình vòi tháo làm cạn bể trong 1 : ${fStr(frac(1, b))} = ${b} (giờ). Trừ thẳng thời gian (${T} − ${a} = ${T - a} giờ) là sai vì thời gian không trừ trực tiếp được.`,
    steps: [
      `Năng suất vòi vào = ${fStr(frac(1, a))} bể/giờ`,
      `Năng suất thực tế = ${fStr(frac(1, T))} bể/giờ`,
      `Năng suất vòi tháo = ${fStr(frac(1, a))} − ${fStr(frac(1, T))} = ${fStr(frac(1, b))} bể/giờ`,
      `Thời gian cạn bể = ${b} (giờ)`,
    ],
    hint: 'Hiệu giữa năng suất vòi chảy vào và năng suất thực tế chính là năng suất vòi tháo.',
    tags: ['vòi nước', 'suy luận ngược', 'nhiều bước'],
  };
}

// >>>PLACEHOLDER<<<

export const WORD_GENERATORS: Record<string, Gen> = {
  MOTION01,
  MOTION02,
  MOTION03,
  MOTION04,
  WORK01,
  WORK02,
  WORK03,
};
