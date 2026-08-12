/**
 * BỘ SINH VẬT LÝ VÀ KHOA HỌC TỰ NHIÊN.
 *
 * Bốn bộ sinh dùng chung cho KHTN khối A/C và Vật lý khối D:
 *   gAverage    — trung bình cộng của kết quả đo (xử lý số liệu thí nghiệm)
 *   gKinematics — chuyển động thẳng biến đổi đều
 *   gNewton     — định luật II Newton
 *   gOhm        — định luật Ohm và công suất điện
 *
 * ĐẶC THÙ CỦA MÔN LÝ: đáp án LUÔN mang đơn vị. Phần lớn nhiễu ở đây là lỗi
 * ĐỔI ĐƠN VỊ (km/h ↔ m/s, mA ↔ A) và lỗi ĐẢO CÔNG THỨC — hai nguyên nhân
 * chiếm đa số bài sai thực tế, chứ không phải lỗi tính toán số học.
 *
 * Số liệu luôn chọn ngược từ đáp án đẹp: gia tốc, lực, điện trở đều ra số
 * tròn để học sinh tự kiểm tra được kết quả.
 *
 * File này KHÔNG import gì từ `src/` (tsx không đọc `paths` của tsconfig).
 */
import type { Draft, Gen, GenCtx } from './generators';
import { fmt, pick, pnum, pstr, ri, roundDec, td } from './generators';

// ===========================================================================
// TIỆN ÍCH
// ===========================================================================

/** Ghép giá trị với đơn vị — mọi đáp án môn Lý bắt buộc đi kèm đơn vị. */
function uv(v: number, unit: string): string {
  return `${fmt(roundDec(v, 4))} ${unit}`;
}

/**
 * Lọc nhiễu dạng "số + đơn vị", đệm thêm bằng các hệ số quy đổi quen thuộc
 * (×10, ×3,6, ×0,5...) nếu generator chưa cấp đủ ba phương án khác nhau.
 */
function ud(correct: string, cands: [number, string][], pad: [number, string]): string[] {
  const out = td(
    correct,
    cands.filter(([v]) => Number.isFinite(v) && Math.abs(v) < 1e9).map(([v, u]) => uv(v, u)),
  );
  for (const k of [3.6, 10, 0.5, 2, 100, 0.1]) {
    if (out.length >= 3) break;
    const t = uv(roundDec(pad[0] * k, 4), pad[1]);
    if (t !== correct && !out.includes(t)) out.push(t);
  }
  return out;
}

const NAMES = ['An', 'Bình', 'Chi', 'Dũng', 'Hà', 'Khoa', 'Lan', 'Minh', 'Ngọc', 'Phúc'];

// ===========================================================================
// 1. TRUNG BÌNH CỘNG KẾT QUẢ ĐO
// ===========================================================================

/**
 * Bài xử lý số liệu thí nghiệm. Tổng luôn chia hết cho số lần đo để giá trị
 * trung bình ra số đẹp — đúng cách sách giáo khoa chọn số liệu mẫu.
 */
function gAverage(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const level = pnum(ctx, 'lvl', lvl + 1);
  const n = level <= 1 ? pick(r, [3, 4]) : pick(r, [4, 5, 6]);

  const setups: { unit: string; what: string; base: number; step: number; dec: number }[] = [
    { unit: 'cm', what: 'chiều dài của một chiếc bút', base: 140, step: 1, dec: 1 },
    { unit: 'g', what: 'khối lượng của một viên bi', base: 250, step: 1, dec: 0 },
    { unit: 'ml', what: 'thể tích nước trong ống đong', base: 480, step: 1, dec: 0 },
    { unit: 's', what: 'thời gian con lắc thực hiện 10 dao động', base: 200, step: 1, dec: 1 },
    { unit: '°C', what: 'nhiệt độ của cốc nước', base: 360, step: 1, dec: 1 },
  ];
  const setup = pick(r, setups);
  const scale = setup.dec === 1 ? 10 : 1;

  // Chọn TRUNG BÌNH trước, rồi rải các lần đo quanh nó sao cho tổng lệch bằng 0.
  const mean = (setup.base + ri(r, -30, 60)) / scale;
  const offs: number[] = [];
  let acc = 0;
  for (let i = 0; i < n - 1; i++) {
    const o = ri(r, -4, 4);
    offs.push(o);
    acc += o;
  }
  offs.push(-acc);
  const values = offs.map((o) => roundDec(mean + o / scale, 2));
  const sum = roundDec(values.reduce((a, b) => a + b, 0), 4);
  const list = values.map((v) => fmt(v)).join('; ');

  if (slot % 4 === 3) {
    // Biến thể: loại kết quả bất thường trước khi lấy trung bình — kỹ năng
    // quan trọng của thực hành đo đạc, không chỉ là phép chia.
    const bad = roundDec(mean * 3 + ri(r, 1, 9), 2);
    const listBad = [...values.map((v) => fmt(v)), fmt(bad)].join('; ');
    const wrongMean = roundDec((sum + bad) / (n + 1), 3);
    return {
      stem: `Đo ${setup.what} ${n + 1} lần thu được: ${listBad} (${setup.unit}). Một kết quả bị sai do đọc nhầm thang đo. Sau khi loại kết quả bất thường đó, giá trị trung bình của phép đo là bao nhiêu (đơn vị ${setup.unit})?`,
      correct: uv(mean, setup.unit),
      numeric: roundDec(mean, 4),
      distractors: ud(
        uv(mean, setup.unit),
        [
          [wrongMean, setup.unit],
          [sum, setup.unit],
          [roundDec(sum / (n + 1), 3), setup.unit],
          [bad, setup.unit],
        ],
        [mean, setup.unit],
      ),
      solution: `Kết quả ${fmt(bad)} ${setup.unit} lệch hẳn khỏi nhóm còn lại nên phải LOẠI trước khi tính. Với ${n} kết quả hợp lệ: tổng bằng ${fmt(sum)} ${setup.unit}, chia cho ${n} lần đo được ${fmt(mean)} ${setup.unit}. Nếu giữ cả kết quả sai và chia cho ${n + 1} sẽ ra ${fmt(wrongMean)} ${setup.unit} — sai số bị kéo lệch hẳn chỉ vì một lần đọc nhầm.`,
      steps: [
        `Loại kết quả bất thường ${fmt(bad)} ${setup.unit}`,
        `Tổng ${n} kết quả còn lại = ${fmt(sum)} ${setup.unit}`,
        `Trung bình = ${fmt(sum)} : ${n} = ${fmt(mean)} ${setup.unit}`,
      ],
      hint: 'Loại kết quả lệch hẳn khỏi nhóm rồi mới chia cho SỐ LẦN ĐO CÒN LẠI.',
      tags: ['đo lường', 'xử lý số liệu', 'nhiều bước'],
    };
  }

  const who = pick(r, NAMES);
  return {
    stem: `Bạn ${who} đo ${setup.what} ${n} lần, kết quả lần lượt là: ${list} (${setup.unit}). Tính giá trị trung bình của phép đo (đơn vị ${setup.unit}).`,
    correct: uv(mean, setup.unit),
    numeric: roundDec(mean, 4),
    distractors: ud(
      uv(mean, setup.unit),
      [
        [sum, setup.unit],
        [roundDec(sum / (n - 1), 3), setup.unit],
        [roundDec((Math.max(...values) + Math.min(...values)) / 2 + 0.5, 3), setup.unit],
        [Math.max(...values), setup.unit],
        [roundDec(sum / (n + 1), 3), setup.unit],
      ],
      [mean, setup.unit],
    ),
    solution: `Giá trị trung bình của phép đo bằng tổng các kết quả chia cho số lần đo. Tổng: ${values.map((v) => fmt(v)).join(' + ')} = ${fmt(sum)} ${setup.unit}. Chia cho ${n} lần đo: ${fmt(sum)} : ${n} = ${fmt(mean)} ${setup.unit}. Hai lỗi hay gặp: quên chia (ghi luôn tổng ${fmt(sum)}) và chia cho ${n - 1} thay vì ${n}.`,
    steps: [`Tổng = ${fmt(sum)} ${setup.unit}`, `Số lần đo = ${n}`, `Trung bình = ${fmt(sum)} : ${n} = ${fmt(mean)} ${setup.unit}`],
    hint: 'Cộng hết các kết quả rồi chia cho đúng số lần đo.',
    tags: ['đo lường', 'trung bình cộng'],
  };
}

// ===========================================================================
// 2. CHUYỂN ĐỘNG THẲNG BIẾN ĐỔI ĐỀU
// ===========================================================================

function gKinematics(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const mode = pstr(ctx, 'mode', 'v');
  const v0 = pick(r, [0, 2, 4, 5, 6, 8, 10]);
  const a = pick(r, [0.5, 1, 1.5, 2, 2.5, 3, 4]);
  const t = ri(r, 4, lvl === 0 ? 10 : 20);
  const v = roundDec(v0 + a * t, 3);
  const s = roundDec(v0 * t + (a * t * t) / 2, 3);

  if (mode === 's') {
    if (slot % 3 === 2) {
      // Dùng công thức không có thời gian: v² − v₀² = 2as.
      const s2 = roundDec((v * v - v0 * v0) / (2 * a), 3);
      return {
        stem: `Một ô tô đang chạy với vận tốc ${fmt(v0)} m/s thì tăng tốc đều với gia tốc ${fmt(a)} m/s². Khi vận tốc đạt ${fmt(v)} m/s thì ô tô đã đi được quãng đường bao nhiêu (đơn vị m)?`,
        correct: uv(s2, 'm'),
        numeric: s2,
        distractors: ud(
          uv(s2, 'm'),
          [
            [roundDec((v * v - v0 * v0) / a, 3), 'm'],
            [roundDec((v - v0) / a, 3), 'm'],
            [roundDec((v * v) / (2 * a), 3), 'm'],
            [roundDec(v * t, 3), 'm'],
          ],
          [s2, 'm'],
        ),
        solution: `Bài không cho thời gian nên dùng hệ thức độc lập: v² − v₀² = 2as. Thay số: ${fmt(v)}² − ${fmt(v0)}² = ${fmt(roundDec(v * v, 3))} − ${fmt(roundDec(v0 * v0, 3))} = ${fmt(roundDec(v * v - v0 * v0, 3))}. Suy ra s = ${fmt(roundDec(v * v - v0 * v0, 3))} : (2·${fmt(a)}) = ${fmt(s2)} m. Quên số 2 ở mẫu là lỗi phổ biến nhất, kết quả sẽ gấp đôi thành ${fmt(roundDec((v * v - v0 * v0) / a, 3))} m.`,
        steps: [
          `v² − v₀² = 2as`,
          `${fmt(roundDec(v * v, 3))} − ${fmt(roundDec(v0 * v0, 3))} = 2·${fmt(a)}·s`,
          `s = ${fmt(s2)} m`,
        ],
        hint: 'Không có thời gian thì dùng v² − v₀² = 2as; nhớ số 2 ở vế phải.',
        tags: ['động học', 'hệ thức độc lập thời gian'],
      };
    }
    return {
      stem: `Một vật chuyển động thẳng nhanh dần đều với vận tốc ban đầu ${fmt(v0)} m/s và gia tốc ${fmt(a)} m/s². Tính quãng đường vật đi được sau ${t} s (đơn vị m).`,
      correct: uv(s, 'm'),
      numeric: s,
      distractors: ud(
        uv(s, 'm'),
        [
          [roundDec(v0 * t + a * t * t, 3), 'm'],
          [roundDec(v * t, 3), 'm'],
          [roundDec(v0 * t, 3), 'm'],
          [roundDec((a * t * t) / 2, 3), 'm'],
        ],
        [s, 'm'],
      ),
      solution: `Công thức quãng đường của chuyển động thẳng biến đổi đều: s = v₀t + at² : 2. Thay số: s = ${fmt(v0)}·${t} + ${fmt(a)}·${t}² : 2 = ${fmt(roundDec(v0 * t, 3))} + ${fmt(roundDec(a * t * t, 3))} : 2 = ${fmt(roundDec(v0 * t, 3))} + ${fmt(roundDec((a * t * t) / 2, 3))} = ${fmt(s)} m. Quên chia đôi số hạng gia tốc sẽ ra ${fmt(roundDec(v0 * t + a * t * t, 3))} m; lấy vận tốc cuối nhân thời gian (${fmt(roundDec(v * t, 3))} m) cũng sai vì vận tốc không cố định suốt hành trình.`,
      steps: [
        `s = v₀t + at² : 2`,
        `s = ${fmt(v0)}·${t} + ${fmt(a)}·${t * t} : 2`,
        `s = ${fmt(s)} m`,
      ],
      hint: 'Số hạng chứa gia tốc phải chia cho 2; đừng nhân vận tốc cuối với thời gian.',
      tags: ['động học', 'quãng đường'],
    };
  }

  if (slot % 3 === 2) {
    // Đổi đơn vị km/h — nguồn sai lầm số một của phần động học.
    const vKmh = roundDec(v * 3.6, 3);
    return {
      stem: `Một xe máy khởi hành từ trạng thái nghỉ, chuyển động nhanh dần đều với gia tốc ${fmt(a)} m/s². Tính vận tốc của xe sau ${t} s, tính theo km/h.`,
      correct: uv(roundDec(a * t * 3.6, 3), 'km/h'),
      numeric: roundDec(a * t * 3.6, 3),
      distractors: ud(
        uv(roundDec(a * t * 3.6, 3), 'km/h'),
        [
          [roundDec(a * t, 3), 'km/h'],
          [roundDec(a * t * 3.6 * 3.6, 3), 'km/h'],
          [roundDec((a * t) / 3.6, 3), 'km/h'],
          [roundDec(((a * t * t) / 2) * 3.6, 3), 'km/h'],
        ],
        [roundDec(a * t * 3.6, 3), 'km/h'],
      ),
      solution: `Bước 1 — tính vận tốc theo hệ SI: v = v₀ + at = 0 + ${fmt(a)}·${t} = ${fmt(roundDec(a * t, 3))} m/s. Bước 2 — đổi sang km/h bằng cách NHÂN 3,6: ${fmt(roundDec(a * t, 3))} × 3,6 = ${fmt(roundDec(a * t * 3.6, 3))} km/h. Quên đổi đơn vị (trả lời ${fmt(roundDec(a * t, 3))}) hoặc chia 3,6 thay vì nhân là hai lỗi chiếm phần lớn bài sai ở phần này. Mẹo kiểm tra: cùng một chuyển động, con số theo km/h luôn LỚN HƠN con số theo m/s.`,
      steps: [`v = v₀ + at = ${fmt(roundDec(a * t, 3))} m/s`, `1 m/s = 3,6 km/h`, `v = ${fmt(roundDec(a * t * 3.6, 3))} km/h`],
      hint: 'Từ m/s sang km/h thì nhân 3,6 — số phải to lên chứ không nhỏ đi.',
      tags: ['động học', 'đổi đơn vị', 'nhiều bước'],
    };
  }

  return {
    stem: `Một vật chuyển động thẳng biến đổi đều với vận tốc ban đầu ${fmt(v0)} m/s và gia tốc ${fmt(a)} m/s². Tính vận tốc của vật sau ${t} s (đơn vị m/s).`,
    correct: uv(v, 'm/s'),
    numeric: v,
    distractors: ud(
      uv(v, 'm/s'),
      [
        [roundDec(a * t, 3), 'm/s'],
        [roundDec(v0 * t + a, 3), 'm/s'],
        [roundDec(v0 + a, 3), 'm/s'],
        [roundDec(s, 3), 'm/s'],
      ],
      [v, 'm/s'],
    ),
    solution: `Công thức vận tốc của chuyển động thẳng biến đổi đều: v = v₀ + at. Thay số: v = ${fmt(v0)} + ${fmt(a)}·${t} = ${fmt(v0)} + ${fmt(roundDec(a * t, 3))} = ${fmt(v)} m/s. Bỏ quên vận tốc đầu sẽ ra ${fmt(roundDec(a * t, 3))} m/s — chỉ đúng khi vật xuất phát từ trạng thái nghỉ.`,
    steps: [`v = v₀ + at`, `v = ${fmt(v0)} + ${fmt(a)}·${t}`, `v = ${fmt(v)} m/s`],
    hint: 'Đừng bỏ sót vận tốc ban đầu v₀ khi cộng.',
    tags: ['động học', 'vận tốc'],
  };
}

// ===========================================================================
// 3. ĐỊNH LUẬT II NEWTON
// ===========================================================================

function gNewton(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const mode = pstr(ctx, 'mode', 'F');
  const m = pick(r, [0.5, 1, 2, 2.5, 4, 5, 8, 10, 20, 50]);
  const a = pick(r, [0.5, 1, 1.5, 2, 3, 4, 5]);
  const F = roundDec(m * a, 3);

  if (mode === 'a') {
    if (slot % 3 === 2 && lvl > 0) {
      // Hai lực ngược chiều: học sinh phải lấy HỢP LỰC trước khi chia.
      const f1 = roundDec(F + ri(r, 2, 20), 3);
      const f2 = roundDec(f1 - F, 3);
      return {
        stem: `Một vật khối lượng ${fmt(m)} kg chịu tác dụng đồng thời của lực kéo ${fmt(f1)} N và lực cản ${fmt(f2)} N ngược chiều nhau. Tính gia tốc của vật (đơn vị m/s²).`,
        correct: uv(a, 'm/s²'),
        numeric: a,
        distractors: ud(
          uv(a, 'm/s²'),
          [
            [roundDec(f1 / m, 3), 'm/s²'],
            [roundDec((f1 + f2) / m, 3), 'm/s²'],
            [roundDec(F * m, 3), 'm/s²'],
            [roundDec(m / F, 3), 'm/s²'],
          ],
          [a, 'm/s²'],
        ),
        solution: `Bước 1 — hợp lực của hai lực NGƯỢC CHIỀU bằng hiệu độ lớn: F = ${fmt(f1)} − ${fmt(f2)} = ${fmt(F)} N, hướng theo lực kéo. Bước 2 — định luật II Newton: a = F : m = ${fmt(F)} : ${fmt(m)} = ${fmt(a)} m/s². Cộng hai lực (ra ${fmt(roundDec((f1 + f2) / m, 3))} m/s²) là sai vì chúng triệt tiêu nhau, không cộng dồn; bỏ quên lực cản sẽ ra ${fmt(roundDec(f1 / m, 3))} m/s².`,
        steps: [`F hợp lực = ${fmt(f1)} − ${fmt(f2)} = ${fmt(F)} N`, `a = F : m`, `a = ${fmt(F)} : ${fmt(m)} = ${fmt(a)} m/s²`],
        hint: 'Lực ngược chiều thì TRỪ độ lớn để ra hợp lực, sau đó mới chia cho khối lượng.',
        tags: ['định luật Newton', 'hợp lực', 'nhiều bước'],
      };
    }
    return {
      stem: `Một vật khối lượng ${fmt(m)} kg chịu tác dụng của một lực không đổi ${fmt(F)} N theo phương chuyển động. Tính gia tốc của vật (đơn vị m/s²).`,
      correct: uv(a, 'm/s²'),
      numeric: a,
      distractors: ud(
        uv(a, 'm/s²'),
        [
          [roundDec(m / F, 3), 'm/s²'],
          [roundDec(F * m, 3), 'm/s²'],
          [roundDec(F - m, 3), 'm/s²'],
          [roundDec(F / (m * 10), 3), 'm/s²'],
        ],
        [a, 'm/s²'],
      ),
      solution: `Định luật II Newton: F = ma, suy ra a = F : m = ${fmt(F)} : ${fmt(m)} = ${fmt(a)} m/s². Đảo ngược phép chia thành m : F cho ${fmt(roundDec(m / F, 3))} — kiểm tra bằng ĐƠN VỊ sẽ phát hiện ngay: N : kg = m/s², còn kg : N thì không ra đơn vị gia tốc.`,
      steps: [`F = ma ⇒ a = F : m`, `a = ${fmt(F)} : ${fmt(m)}`, `a = ${fmt(a)} m/s²`],
      hint: 'Cùng một lực, vật càng nặng thì gia tốc càng nhỏ — nên khối lượng nằm ở MẪU.',
      tags: ['định luật Newton', 'gia tốc'],
    };
  }

  if (slot % 3 === 2) {
    // Lực từ độ biến thiên vận tốc: nối động học với động lực học.
    const t = ri(r, 2, 12);
    const dv = roundDec(a * t, 3);
    return {
      stem: `Một vật khối lượng ${fmt(m)} kg đang đứng yên, sau ${t} s chịu lực kéo không đổi thì đạt vận tốc ${fmt(dv)} m/s. Tính độ lớn của lực kéo (bỏ qua ma sát, đơn vị N).`,
      correct: uv(F, 'N'),
      numeric: F,
      distractors: ud(
        uv(F, 'N'),
        [
          [roundDec(m * dv, 3), 'N'],
          [roundDec(dv / m, 3), 'N'],
          [roundDec(m * a * t, 3), 'N'],
          [roundDec(m * 10, 3), 'N'],
        ],
        [F, 'N'],
      ),
      solution: `Bước 1 — tìm gia tốc từ dữ kiện động học: a = (v − v₀) : t = (${fmt(dv)} − 0) : ${t} = ${fmt(a)} m/s². Bước 2 — định luật II Newton: F = ma = ${fmt(m)}·${fmt(a)} = ${fmt(F)} N. Lỗi hay gặp là nhân thẳng khối lượng với vận tốc (ra ${fmt(roundDec(m * dv, 3))}) — tích đó là ĐỘNG LƯỢNG, đơn vị kg·m/s, không phải lực.`,
      steps: [`a = ${fmt(dv)} : ${t} = ${fmt(a)} m/s²`, `F = ma = ${fmt(m)}·${fmt(a)}`, `F = ${fmt(F)} N`],
      hint: 'Tìm gia tốc từ độ biến thiên vận tốc trước, rồi mới nhân với khối lượng.',
      tags: ['định luật Newton', 'động học', 'nhiều bước'],
    };
  }

  return {
    stem: `Một vật khối lượng ${fmt(m)} kg chuyển động với gia tốc ${fmt(a)} m/s². Tính độ lớn hợp lực tác dụng lên vật (đơn vị N).`,
    correct: uv(F, 'N'),
    numeric: F,
    distractors: ud(
      uv(F, 'N'),
      [
        [roundDec(m / a, 3), 'N'],
        [roundDec(m + a, 3), 'N'],
        [roundDec(m * 10, 3), 'N'],
        [roundDec(a / m, 3), 'N'],
      ],
      [F, 'N'],
    ),
    solution: `Định luật II Newton: F = ma = ${fmt(m)}·${fmt(a)} = ${fmt(F)} N. Chú ý phân biệt với TRỌNG LỰC P = mg = ${fmt(m)}·10 = ${fmt(roundDec(m * 10, 3))} N — đó là lực hút của Trái Đất, chỉ bằng hợp lực khi vật rơi tự do.`,
    steps: [`F = ma`, `F = ${fmt(m)}·${fmt(a)}`, `F = ${fmt(F)} N`],
    hint: 'Hợp lực bằng khối lượng nhân gia tốc — đừng dùng g = 10 m/s² nếu đề đã cho gia tốc.',
    tags: ['định luật Newton', 'lực'],
  };
}

// ===========================================================================
// 4. ĐỊNH LUẬT OHM VÀ CÔNG SUẤT ĐIỆN
// ===========================================================================

function gOhm(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const mode = pstr(ctx, 'mode', 'U');
  const I = pick(r, [0.2, 0.25, 0.5, 1, 1.5, 2, 2.5, 3]);
  const R = pick(r, [4, 5, 6, 8, 10, 12, 15, 20, 24, 30, 40, 50]);
  const U = roundDec(I * R, 3);
  const P = roundDec(U * I, 3);

  if (mode === 'P') {
    if (slot % 3 === 2) {
      // Điện năng tiêu thụ theo thời gian — nối công suất với hóa đơn điện.
      const hours = ri(r, 2, 8);
      const days = ri(r, 10, 30);
      const watt = pick(r, [40, 60, 75, 100, 150, 200, 500, 800]);
      const kwh = roundDec((watt * hours * days) / 1000, 3);
      return {
        stem: `Một bóng đèn có công suất ${watt} W được thắp sáng trung bình ${hours} giờ mỗi ngày trong ${days} ngày. Tính điện năng tiêu thụ của bóng đèn (đơn vị kWh).`,
        correct: uv(kwh, 'kWh'),
        numeric: kwh,
        distractors: ud(
          uv(kwh, 'kWh'),
          [
            [roundDec(watt * hours * days, 3), 'kWh'],
            [roundDec((watt * hours) / 1000, 3), 'kWh'],
            [roundDec((watt * days) / 1000, 3), 'kWh'],
            [roundDec((watt * hours * days) / 3600, 3), 'kWh'],
          ],
          [kwh, 'kWh'],
        ),
        solution: `Điện năng A = P·t. Tổng thời gian sử dụng: ${hours} × ${days} = ${hours * days} giờ. Do đó A = ${watt} W × ${hours * days} h = ${fmt(watt * hours * days)} Wh. Đổi sang kWh bằng cách CHIA 1000: ${fmt(watt * hours * days)} : 1000 = ${fmt(kwh)} kWh. Quên đổi đơn vị (giữ nguyên ${fmt(watt * hours * days)}) là lỗi phổ biến nhất — con số theo kWh phải nhỏ hơn con số theo Wh đúng 1000 lần.`,
        steps: [
          `Tổng thời gian = ${hours} × ${days} = ${hours * days} h`,
          `A = ${watt} × ${hours * days} = ${fmt(watt * hours * days)} Wh`,
          `A = ${fmt(kwh)} kWh`,
        ],
        hint: '1 kWh = 1000 Wh — đổi ở bước cuối, và nhớ nhân đủ số ngày.',
        tags: ['điện học', 'điện năng', 'nhiều bước'],
      };
    }
    return {
      stem: `Một đoạn mạch có hiệu điện thế ${fmt(U)} V và cường độ dòng điện chạy qua là ${fmt(I)} A. Tính công suất tiêu thụ của đoạn mạch (đơn vị W).`,
      correct: uv(P, 'W'),
      numeric: P,
      distractors: ud(
        uv(P, 'W'),
        [
          [roundDec(U / I, 3), 'W'],
          [roundDec(U + I, 3), 'W'],
          [roundDec(I * I * R * R, 3), 'W'],
          [roundDec(U * U, 3), 'W'],
        ],
        [P, 'W'],
      ),
      solution: `Công suất tiêu thụ của đoạn mạch: P = U·I = ${fmt(U)}·${fmt(I)} = ${fmt(P)} W. Có thể kiểm tra bằng công thức tương đương P = I²R = ${fmt(I)}²·${R} = ${fmt(roundDec(I * I * R, 3))} W — trùng khớp. Lấy thương U : I (ra ${fmt(roundDec(U / I, 3))}) là nhầm sang công thức tính ĐIỆN TRỞ.`,
      steps: [`P = U·I`, `P = ${fmt(U)}·${fmt(I)}`, `P = ${fmt(P)} W`],
      hint: 'Công suất là tích của hiệu điện thế và cường độ dòng điện.',
      tags: ['điện học', 'công suất'],
    };
  }

  if (slot % 3 === 2 && lvl > 0) {
    // Hai điện trở nối tiếp — kiểm tra hiểu bản chất chứ không chỉ thế số.
    const R2 = pick(r, [5, 10, 15, 20, 25]);
    const Rt = R + R2;
    const U2 = roundDec(I * Rt, 3);
    return {
      stem: `Hai điện trở R₁ = ${R} Ω và R₂ = ${R2} Ω mắc NỐI TIẾP vào một nguồn điện. Cường độ dòng điện chạy trong mạch là ${fmt(I)} A. Tính hiệu điện thế của nguồn (đơn vị V).`,
      correct: uv(U2, 'V'),
      numeric: U2,
      distractors: ud(
        uv(U2, 'V'),
        [
          [roundDec(I * R, 3), 'V'],
          [roundDec(I * ((R * R2) / Rt), 3), 'V'],
          [roundDec(I / Rt, 3), 'V'],
          [roundDec(Rt / I, 3), 'V'],
        ],
        [U2, 'V'],
      ),
      solution: `Bước 1 — điện trở tương đương của đoạn mạch nối tiếp bằng TỔNG: R = R₁ + R₂ = ${R} + ${R2} = ${Rt} Ω. Bước 2 — định luật Ohm: U = I·R = ${fmt(I)}·${Rt} = ${fmt(U2)} V. Dùng nhầm công thức mắc SONG SONG (R₁R₂ : (R₁+R₂) = ${fmt(roundDec((R * R2) / Rt, 3))} Ω) sẽ cho ${fmt(roundDec(I * ((R * R2) / Rt), 3))} V; chỉ tính với R₁ sẽ ra ${fmt(roundDec(I * R, 3))} V.`,
      steps: [`R = R₁ + R₂ = ${Rt} Ω`, `U = I·R = ${fmt(I)}·${Rt}`, `U = ${fmt(U2)} V`],
      hint: 'Nối tiếp thì cộng điện trở; song song mới dùng công thức tích trên tổng.',
      tags: ['điện học', 'định luật Ohm', 'mạch nối tiếp', 'nhiều bước'],
    };
  }

  if (slot % 3 === 1) {
    // Đổi mA sang A — lỗi đơn vị đặc trưng của phần điện.
    const mA = roundDec(I * 1000, 1);
    return {
      stem: `Một điện trở ${R} Ω có dòng điện cường độ ${fmt(mA)} mA chạy qua. Tính hiệu điện thế giữa hai đầu điện trở (đơn vị V).`,
      correct: uv(U, 'V'),
      numeric: U,
      distractors: ud(
        uv(U, 'V'),
        [
          [roundDec(mA * R, 3), 'V'],
          [roundDec(mA / R, 3), 'V'],
          [roundDec(R / I, 3), 'V'],
          [roundDec(U / 1000, 4), 'V'],
        ],
        [U, 'V'],
      ),
      solution: `Bước 1 — đổi cường độ dòng điện về ampe: ${fmt(mA)} mA = ${fmt(mA)} : 1000 = ${fmt(I)} A. Bước 2 — định luật Ohm: U = I·R = ${fmt(I)}·${R} = ${fmt(U)} V. Nếu thế thẳng ${fmt(mA)} vào công thức mà quên đổi đơn vị, kết quả sẽ lớn gấp 1000 lần (${fmt(roundDec(mA * R, 3))} V) — con số vô lý với một điện trở nhỏ như vậy.`,
      steps: [`${fmt(mA)} mA = ${fmt(I)} A`, `U = I·R = ${fmt(I)}·${R}`, `U = ${fmt(U)} V`],
      hint: 'Đổi mA về A (chia 1000) trước khi thay vào định luật Ohm.',
      tags: ['điện học', 'định luật Ohm', 'đổi đơn vị'],
    };
  }

  return {
    stem: `Đặt vào hai đầu một điện trở ${R} Ω một dòng điện có cường độ ${fmt(I)} A. Tính hiệu điện thế giữa hai đầu điện trở (đơn vị V).`,
    correct: uv(U, 'V'),
    numeric: U,
    distractors: ud(
      uv(U, 'V'),
      [
        [roundDec(R / I, 3), 'V'],
        [roundDec(I / R, 3), 'V'],
        [roundDec(R + I, 3), 'V'],
        [roundDec(U * I, 3), 'V'],
      ],
      [U, 'V'],
    ),
    solution: `Định luật Ohm cho đoạn mạch: I = U : R, suy ra U = I·R = ${fmt(I)}·${R} = ${fmt(U)} V. Nhớ theo tam giác U − I − R: U nằm ở đỉnh nên U là TÍCH của hai đại lượng còn lại; I và R nằm ở đáy nên mỗi cái là thương của U cho cái kia. Lấy R : I (ra ${fmt(roundDec(R / I, 3))}) là đảo ngược công thức.`,
    steps: [`I = U : R ⇒ U = I·R`, `U = ${fmt(I)}·${R}`, `U = ${fmt(U)} V`],
    hint: 'U = I·R — hiệu điện thế là tích, không phải thương.',
    tags: ['điện học', 'định luật Ohm'],
  };
}

export const PHYSICS_GENERATORS: Record<string, Gen> = {
  gAverage,
  gKinematics,
  gNewton,
  gOhm,
};
