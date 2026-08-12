/**
 * BỘ SINH CÂU HỎI KHOA HỌC TỰ NHIÊN — VẬT LÍ · HÓA HỌC · SINH HỌC.
 *
 *   VẬT LÍ  — tốc độ, khối lượng riêng, nhiệt độ, công – công suất, định luật Ohm,
 *             chuyển động biến đổi đều, định luật II Newton, xử lí số liệu đo.
 *   HÓA HỌC — mol và khối lượng mol, nồng độ phần trăm, phần trăm khối lượng
 *             nguyên tố, tính theo phương trình hóa học.
 *   SINH HỌC— quy luật phân li của Menđen (tỉ lệ kiểu hình F2, đếm số cá thể).
 *
 * Ba quy tắc bất di bất dịch, giống hệt `generators.ts`:
 *  1. Đáp án và lời giải luôn được TÍNH RA từ tham số vừa sinh — không viết tay.
 *  2. Số liệu chọn NGƯỢC từ đáp án đẹp ⇒ không bao giờ ra số lẻ xấu.
 *  3. Nhiễu là LỖI SAI CÓ THẬT: sai đơn vị (quên đổi phút → giây, g → kg, mA → A,
 *     W → kW), đảo ngược công thức (nhân thay vì chia), quên hệ số (10 của trọng
 *     lượng, 1/2 của a·t², 22,4 của thể tích khí, tỉ lệ mol trong phương trình).
 *
 * QUY ƯỚC ĐƠN VỊ: mọi đáp án và mọi phương án nhiễu của nhóm Lí – Hóa đều PHẢI
 * mang đơn vị, vì bẫy lớn nhất của các bài này chính là sai đơn vị.
 *
 * LƯU Ý VỀ `ctx.slot`: bộ khung gán lvl = slot % 3, nên slot % 3 LUÔN bằng lvl.
 * Muốn đổi DẠNG đề trong cùng một mức độ phải dùng `Math.floor(slot / 3)`.
 *
 * File này KHÔNG import gì từ `src/` (tsx không đọc `paths` của tsconfig).
 */
import type { Draft, Gen, GenCtx } from './generators';
import { fmt, pick, pnum, pstr, ri, roundDec, td } from './generators';

// ===========================================================================
// TIỆN ÍCH RIÊNG CỦA NHÓM KHOA HỌC TỰ NHIÊN
// ===========================================================================

/** Ghép giá trị với đơn vị — đáp án Lí/Hóa/Sinh bắt buộc phải mang đơn vị. */
function uv(v: number, unit: string): string {
  return `${fmt(v)} ${unit}`;
}

/**
 * Lọc nhiễu dạng "số + đơn vị": bỏ giá trị trùng đáp án, bỏ giá trị trùng nhau,
 * bỏ giá trị vô nghĩa (âm hoặc không hữu hạn khi đại lượng không thể âm).
 * `pad` = [giá trị đúng, đơn vị] dùng để đệm thêm nhiễu lệch bậc 10 khi các ứng
 * viên bị trùng, bảo đảm bộ khung luôn nhận đủ 3 nhiễu khác nhau.
 */
function ud(correct: string, cands: [number, string][], pad?: [number, string]): string[] {
  const out = td(
    correct,
    cands
      .filter(([v]) => Number.isFinite(v))
      .map(([v, unit]) => uv(roundDec(v, 4), unit)),
  );
  if (!pad) return out;
  for (const k of [10, 0.1, 2, 0.5, 100, 0.01, 1000, 4]) {
    if (out.length >= 4) break;
    const t = uv(roundDec(pad[0] * k, 4), pad[1]);
    if (t !== correct && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Dạng đề trong cùng một mức độ (lvl = slot % 3 nên phải chia 3 mới đổi dạng). */
function formOf(ctx: GenCtx): number {
  return Math.floor(ctx.slot / 3);
}

const SUB_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
/** Chỉ số dưới trong công thức hóa học: 2 → "₂". */
function sub(n: number): string {
  return String(n)
    .split('')
    .map((c) => SUB_DIGITS[Number(c)])
    .join('');
}

/** Gia tốc trọng trường quy ước trong sách giáo khoa phổ thông. */
const G = 10;

// ===========================================================================
// PHẦN 1 — VẬT LÍ / KHOA HỌC TỰ NHIÊN
// ===========================================================================

// ---------------------------------------------------------------------------
// gSpeed — tốc độ, thời gian, quãng đường (v = s : t)
// ---------------------------------------------------------------------------

const VEHICLES = ['ô tô', 'xe khách', 'xe tải nhỏ', 'tàu hỏa'];
const SLOW_VEHICLES = ['xe đạp', 'xe máy', 'người chạy bộ'];

/**
 * `params.mode`:
 *   'v' — tính tốc độ, 't' — tính thời gian, 's' — tính quãng đường.
 * `params.lvl` (mặc định 1): 2 = khối lớn, ưu tiên thang m/s và số liệu lớn hơn.
 */
function gSpeed(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const mode = pstr(ctx, 'mode', 'v');
  const glvl = pnum(ctx, 'lvl', 1);
  const form = formOf(ctx);

  // ======================= TÍNH TỐC ĐỘ =======================
  if (mode === 'v') {
    if (lvl === 0) {
      if (glvl >= 2) {
        const v = ri(r, 4, 15);
        const t = pick(r, [10, 20, 25, 30, 40, 50]);
        const s = v * t;
        const correct = uv(v, 'm/s');
        return {
          stem: `Một vận động viên chạy đều được ${s} m trong ${t} giây. Tính tốc độ của vận động viên đó.`,
          correct,
          numeric: v,
          distractors: ud(
            correct,
            [
              [s * t, 'm/s'],
              [t / s, 'm/s'],
              [v * 3.6, 'm/s'],
              [v / 3.6, 'm/s'],
              [s - t, 'm/s'],
            ],
            [v, 'm/s'],
          ),
          solution: `Công thức tính tốc độ: v = s : t. Thay số: v = ${s} m : ${t} s = ${fmt(v)} m/s. Quãng đường tính bằng mét, thời gian tính bằng giây nên tốc độ có đơn vị m/s. Muốn đổi sang km/h thì nhân với 3,6: ${fmt(v)} m/s = ${fmt(v * 3.6)} km/h. Lỗi hay gặp là nhân quãng đường với thời gian (ra ${fmt(s * t)}) thay vì chia.`,
          steps: [`Công thức: v = s : t`, `v = ${s} : ${t} = ${fmt(v)} m/s`],
          hint: 'Tốc độ bằng quãng đường chia cho thời gian; mét chia giây cho ra m/s.',
          tags: ['tốc độ', 'vật lí'],
        };
      }
      const v = pick(r, [30, 40, 45, 50, 60, 75, 80]);
      const t = ri(r, 2, 5);
      const s = v * t;
      const who = pick(r, VEHICLES);
      const correct = uv(v, 'km/h');
      return {
        stem: `Một ${who} đi được quãng đường ${s} km trong ${t} giờ. Tính tốc độ của ${who} đó.`,
        correct,
        numeric: v,
        distractors: ud(
          correct,
          [
            [s * t, 'km/h'],
            [s / (t * 60), 'km/h'],
            [v / 3.6, 'km/h'],
            [v * 3.6, 'km/h'],
            [s - t, 'km/h'],
          ],
          [v, 'km/h'],
        ),
        solution: `Công thức tính tốc độ: v = s : t. Thay số: v = ${s} km : ${t} h = ${fmt(v)} km/h. Quãng đường tính bằng ki-lô-mét, thời gian tính bằng giờ nên tốc độ có đơn vị km/h. Hai lỗi hay gặp: nhân thay vì chia (ra ${fmt(s * t)} km/h) và đổi thời gian sang phút rồi mới chia (ra ${fmt(roundDec(s / (t * 60), 4))} km/h).`,
        steps: [`Công thức: v = s : t`, `v = ${s} : ${t} = ${fmt(v)} km/h`],
        hint: 'Chia quãng đường cho thời gian; km chia giờ cho ra km/h.',
        tags: ['tốc độ', 'vật lí'],
      };
    }

    if (lvl === 1) {
      if (form % 2 === 0) {
        // Đổi phút → giây rồi mới chia: hai bước.
        const v = pick(r, [4, 5, 6, 8, 10]);
        const tmin = pick(r, [2, 3, 4, 5]);
        const s = v * 60 * tmin;
        const correct = uv(v, 'm/s');
        return {
          stem: `Một người chạy đều hết quãng đường ${s} m trong ${tmin} phút. Tính tốc độ của người đó theo đơn vị m/s.`,
          correct,
          numeric: v,
          distractors: ud(
            correct,
            [
              [s / tmin, 'm/s'],
              [v * 3.6, 'm/s'],
              [v / 3.6, 'm/s'],
              [s / (tmin * 100), 'm/s'],
              [(s * tmin) / 60, 'm/s'],
            ],
            [v, 'm/s'],
          ),
          solution: `Bước 1 — đổi thời gian về giây: ${tmin} phút = ${tmin} × 60 = ${60 * tmin} s. Bước 2 — áp dụng v = s : t = ${s} m : ${60 * tmin} s = ${fmt(v)} m/s. Lỗi phổ biến nhất là quên đổi phút ra giây, khi đó ra ${fmt(roundDec(s / tmin, 4))} — con số lớn gấp 60 lần thực tế. Đổi sang km/h: ${fmt(v)} × 3,6 = ${fmt(v * 3.6)} km/h.`,
          steps: [
            `Đổi thời gian: ${tmin} phút = ${60 * tmin} giây`,
            `v = s : t = ${s} : ${60 * tmin}`,
            `v = ${fmt(v)} m/s`,
          ],
          hint: 'Muốn có đơn vị m/s thì thời gian phải quy về giây trước khi chia.',
          tags: ['tốc độ', 'đổi đơn vị', 'nhiều bước'],
        };
      }
      // Tính tốc độ rồi đổi m/s → km/h.
      const vms = pick(r, [5, 10, 12, 15, 20]);
      const t = pick(r, [20, 30, 40, 50, 60]);
      const s = vms * t;
      const vkmh = vms * 3.6;
      const correct = uv(vkmh, 'km/h');
      return {
        stem: `Một xe máy đi được ${s} m trong ${t} giây. Tính tốc độ của xe theo đơn vị km/h.`,
        correct,
        numeric: vkmh,
        distractors: ud(
          correct,
          [
            [vms, 'km/h'],
            [vms / 3.6, 'km/h'],
            [s / (t * 3.6), 'km/h'],
            [vms * 36, 'km/h'],
            [s * t, 'km/h'],
          ],
          [vkmh, 'km/h'],
        ),
        solution: `Bước 1 — tính tốc độ theo m/s: v = s : t = ${s} m : ${t} s = ${fmt(vms)} m/s. Bước 2 — đổi sang km/h bằng cách NHÂN 3,6: ${fmt(vms)} × 3,6 = ${fmt(vkmh)} km/h (vì 1 m/s = 3,6 km/h). Lỗi hay gặp là giữ nguyên ${fmt(vms)} rồi ghi đơn vị km/h, hoặc chia cho 3,6 (ra ${fmt(roundDec(vms / 3.6, 4))} km/h) — chia là chiều đổi ngược lại.`,
        steps: [
          `v = ${s} : ${t} = ${fmt(vms)} m/s`,
          `1 m/s = 3,6 km/h`,
          `v = ${fmt(vms)} × 3,6 = ${fmt(vkmh)} km/h`,
        ],
        hint: 'Đổi m/s sang km/h thì nhân 3,6; đổi km/h sang m/s thì chia 3,6.',
        tags: ['tốc độ', 'đổi đơn vị', 'nhiều bước'],
      };
    }

    // lvl 2 — tốc độ trung bình của cả hành trình (bẫy: lấy trung bình cộng hai tốc độ)
    const t1 = ri(r, 1, 3);
    let t2 = ri(r, 1, 3);
    if (t2 === t1) t2 = t1 + 1;
    const vtb = pick(r, [40, 45, 50, 55, 60, 65]);
    const u = vtb - 25 >= 10 * t2 ? 10 : 5;
    const v1 = vtb - t2 * u;
    const v2 = vtb + t1 * u;
    const s1 = v1 * t1;
    const s2 = v2 * t2;
    const T = t1 + t2;
    const S = s1 + s2;
    const correct = uv(vtb, 'km/h');
    return {
      stem: `Một ô tô đi ${t1} giờ đầu với tốc độ ${v1} km/h, sau đó đi tiếp ${t2} giờ với tốc độ ${v2} km/h. Tính tốc độ trung bình của ô tô trên cả quãng đường.`,
      correct,
      numeric: vtb,
      distractors: ud(
        correct,
        [
          [(v1 + v2) / 2, 'km/h'],
          [v1 + v2, 'km/h'],
          [S, 'km/h'],
          [S / T / 2, 'km/h'],
          [(v1 * t2 + v2 * t1) / T, 'km/h'],
        ],
        [vtb, 'km/h'],
      ),
      solution: `Tốc độ trung bình được tính trên TOÀN hành trình: v_tb = tổng quãng đường : tổng thời gian. Quãng đường chặng 1: s₁ = ${v1} × ${t1} = ${s1} km. Quãng đường chặng 2: s₂ = ${v2} × ${t2} = ${s2} km. Tổng quãng đường S = ${s1} + ${s2} = ${S} km, tổng thời gian t = ${t1} + ${t2} = ${T} giờ. Vậy v_tb = ${S} : ${T} = ${fmt(vtb)} km/h. Bẫy kinh điển: lấy trung bình cộng hai tốc độ (${v1} + ${v2}) : 2 = ${fmt((v1 + v2) / 2)} km/h — chỉ đúng khi hai chặng có THỜI GIAN bằng nhau, ở đây ${t1} giờ ≠ ${t2} giờ nên sai.`,
      steps: [
        `s₁ = v₁ × t₁ = ${v1} × ${t1} = ${s1} km`,
        `s₂ = v₂ × t₂ = ${v2} × ${t2} = ${s2} km`,
        `v_tb = (s₁ + s₂) : (t₁ + t₂) = ${S} : ${T} = ${fmt(vtb)} km/h`,
      ],
      hint: 'Tốc độ trung bình không phải trung bình cộng của các tốc độ: hãy lấy tổng quãng đường chia tổng thời gian.',
      tags: ['tốc độ trung bình', 'nhiều bước', 'bẫy'],
    };
  }

  // ======================= TÍNH THỜI GIAN =======================
  if (mode === 't') {
    if (lvl === 0) {
      const v = pick(r, [30, 40, 45, 50, 60, 80]);
      const t = ri(r, 2, 6);
      const s = v * t;
      const who = pick(r, VEHICLES);
      const correct = uv(t, 'giờ');
      return {
        stem: `Một ${who} chạy với tốc độ ${v} km/h. Hỏi ${who} đó đi hết quãng đường ${s} km trong bao lâu?`,
        correct,
        numeric: t,
        distractors: ud(
          correct,
          [
            [s * v, 'giờ'],
            [v / s, 'giờ'],
            [s - v, 'giờ'],
            [t * 60, 'giờ'],
            [t / 60, 'giờ'],
          ],
          [t, 'giờ'],
        ),
        solution: `Từ công thức v = s : t suy ra t = s : v. Thay số: t = ${s} km : ${v} km/h = ${fmt(t)} giờ. Km chia cho km/h cho ra đơn vị giờ. Lỗi hay gặp là nhân quãng đường với tốc độ (ra ${fmt(s * v)}) — kết quả này vô lí vì càng đi nhanh thì thời gian phải càng NGẮN.`,
        steps: [`Từ v = s : t suy ra t = s : v`, `t = ${s} : ${v} = ${fmt(t)} giờ`],
        hint: 'Thời gian bằng quãng đường chia cho tốc độ.',
        tags: ['thời gian', 'vật lí'],
      };
    }

    if (lvl === 1) {
      // Kết quả không tròn giờ ⇒ phải đổi ra phút.
      const v = pick(r, [12, 15, 18, 20, 24, 30, 36]);
      const tmin = pick(r, [15, 20, 30, 40, 45, 50]);
      const s = (v * tmin) / 60;
      if (!Number.isInteger(s)) {
        // Bảo đảm quãng đường là số nguyên: lùi về cặp số chắc chắn chia hết.
        const v2 = 12;
        const tm2 = 30;
        const s2 = (v2 * tm2) / 60;
        const correct2 = uv(tm2, 'phút');
        return {
          stem: `Một người đi xe đạp với tốc độ ${v2} km/h trên quãng đường ${s2} km. Hỏi người đó đi hết bao nhiêu phút?`,
          correct: correct2,
          numeric: tm2,
          distractors: ud(
            correct2,
            [
              [s2 / v2, 'phút'],
              [s2 * v2, 'phút'],
              [tm2 * 60, 'phút'],
              [v2 / s2, 'phút'],
              [tm2 / 60, 'phút'],
            ],
            [tm2, 'phút'],
          ),
          solution: `Bước 1 — tính thời gian theo giờ: t = s : v = ${s2} : ${v2} = ${fmt(s2 / v2)} giờ. Bước 2 — đổi ra phút: ${fmt(s2 / v2)} × 60 = ${fmt(tm2)} phút. Lỗi hay gặp là trả lời ${fmt(s2 / v2)} rồi ghi đơn vị phút, tức là quên nhân 60.`,
          steps: [
            `t = s : v = ${s2} : ${v2} = ${fmt(s2 / v2)} giờ`,
            `${fmt(s2 / v2)} giờ = ${fmt(s2 / v2)} × 60 = ${fmt(tm2)} phút`,
          ],
          hint: 'Tính ra giờ trước rồi nhân 60 để đổi sang phút.',
          tags: ['thời gian', 'đổi đơn vị', 'nhiều bước'],
        };
      }
      const th = tmin / 60;
      const correct = uv(tmin, 'phút');
      return {
        stem: `Một người đi xe đạp với tốc độ ${v} km/h trên quãng đường ${fmt(s)} km. Hỏi người đó đi hết bao nhiêu phút?`,
        correct,
        numeric: tmin,
        distractors: ud(
          correct,
          [
            [th, 'phút'],
            [s * v, 'phút'],
            [tmin * 60, 'phút'],
            [v / s, 'phút'],
            [tmin / 60, 'phút'],
          ],
          [tmin, 'phút'],
        ),
        solution: `Bước 1 — tính thời gian theo giờ: t = s : v = ${fmt(s)} : ${v} = ${fmt(th)} giờ. Bước 2 — đổi ra phút bằng cách nhân 60: ${fmt(th)} × 60 = ${fmt(tmin)} phút. Lỗi phổ biến là dừng lại ở ${fmt(th)} rồi ghi đơn vị phút; cũng có bạn nhân s với v (ra ${fmt(s * v)}) là sai công thức.`,
        steps: [
          `t = s : v = ${fmt(s)} : ${v} = ${fmt(th)} giờ`,
          `${fmt(th)} giờ × 60 = ${fmt(tmin)} phút`,
        ],
        hint: 'Đổi kết quả từ giờ sang phút bằng cách nhân với 60.',
        tags: ['thời gian', 'đổi đơn vị', 'nhiều bước'],
      };
    }

    // lvl 2 — hành trình gồm hai chặng và một lần nghỉ
    const v1 = pick(r, [30, 40, 60]);
    const v2 = pick(r, [20, 45, 50]);
    const t1min = pick(r, [30, 45, 90]);
    const t2min = pick(r, [20, 40, 60]);
    const rest = pick(r, [10, 15, 20, 25]);
    const s1 = (v1 * t1min) / 60;
    const s2 = (v2 * t2min) / 60;
    const total = t1min + t2min + rest;
    const correct = uv(total, 'phút');
    return {
      stem: `Một ô tô đi chặng đầu dài ${fmt(s1)} km với tốc độ ${v1} km/h, nghỉ ${rest} phút, rồi đi tiếp chặng sau dài ${fmt(s2)} km với tốc độ ${v2} km/h. Tính tổng thời gian của cả chuyến đi (kể cả thời gian nghỉ).`,
      correct,
      numeric: total,
      distractors: ud(
        correct,
        [
          [t1min + t2min, 'phút'],
          [((s1 + s2) / (v1 + v2)) * 60, 'phút'],
          [((s1 + s2) / v1) * 60 + rest, 'phút'],
          [total / 60, 'phút'],
          [t1min + t2min - rest, 'phút'],
        ],
        [total, 'phút'],
      ),
      solution: `Chặng 1: t₁ = s₁ : v₁ = ${fmt(s1)} : ${v1} = ${fmt(t1min / 60)} giờ = ${t1min} phút. Chặng 2: t₂ = s₂ : v₂ = ${fmt(s2)} : ${v2} = ${fmt(t2min / 60)} giờ = ${t2min} phút. Tổng thời gian = ${t1min} + ${t2min} + ${rest} (nghỉ) = ${total} phút. Hai lỗi hay mắc: quên cộng thời gian nghỉ (ra ${t1min + t2min} phút) và cộng hai tốc độ rồi chia tổng quãng đường (ra ${fmt(roundDec(((s1 + s2) / (v1 + v2)) * 60, 2))} phút) — không được cộng tốc độ như vậy.`,
      steps: [
        `t₁ = ${fmt(s1)} : ${v1} = ${fmt(t1min / 60)} giờ = ${t1min} phút`,
        `t₂ = ${fmt(s2)} : ${v2} = ${fmt(t2min / 60)} giờ = ${t2min} phút`,
        `Tổng = ${t1min} + ${t2min} + ${rest} = ${total} phút`,
      ],
      hint: 'Tính thời gian từng chặng, đổi tất cả về phút rồi mới cộng, đừng bỏ quên thời gian nghỉ.',
      tags: ['thời gian', 'nhiều bước', 'bẫy'],
    };
  }

  // ======================= TÍNH QUÃNG ĐƯỜNG =======================
  if (lvl === 0) {
    const v = pick(r, [30, 40, 45, 50, 60, 75]);
    const t = ri(r, 2, 6);
    const s = v * t;
    const who = pick(r, VEHICLES);
    const correct = uv(s, 'km');
    return {
      stem: `Một ${who} chuyển động đều với tốc độ ${v} km/h trong ${t} giờ. Tính quãng đường ${who} đó đi được.`,
      correct,
      numeric: s,
      distractors: ud(
        correct,
        [
          [v / t, 'km'],
          [v + t, 'km'],
          [s * 1000, 'km'],
          [s / 60, 'km'],
          [v * t * 60, 'km'],
        ],
        [s, 'km'],
      ),
      solution: `Từ v = s : t suy ra s = v × t. Thay số: s = ${v} km/h × ${t} h = ${fmt(s)} km. Đơn vị km/h nhân với giờ cho ra km. Lỗi hay gặp là chia tốc độ cho thời gian (ra ${fmt(roundDec(v / t, 4))} km) hoặc đổi nhầm ra mét mà vẫn ghi đơn vị km.`,
      steps: [`Từ v = s : t suy ra s = v × t`, `s = ${v} × ${t} = ${fmt(s)} km`],
      hint: 'Quãng đường bằng tốc độ nhân thời gian.',
      tags: ['quãng đường', 'vật lí'],
    };
  }

  if (lvl === 1) {
    if (form % 2 === 0) {
      // Thời gian cho bằng phút ⇒ phải đổi ra giờ trước khi nhân.
      const v = pick(r, [12, 18, 24, 30, 36, 48, 60]);
      const tmin = pick(r, [10, 15, 20, 30, 45]);
      const s = (v * tmin) / 60;
      const correct = uv(s, 'km');
      return {
        stem: `Một người đi xe máy với tốc độ ${v} km/h trong ${tmin} phút. Tính quãng đường người đó đi được.`,
        correct,
        numeric: s,
        distractors: ud(
          correct,
          [
            [v * tmin, 'km'],
            [v / tmin, 'km'],
            [s * 60, 'km'],
            [v * tmin * 60, 'km'],
            [s / 60, 'km'],
          ],
          [s, 'km'],
        ),
        solution: `Bước 1 — đổi thời gian ra giờ: ${tmin} phút = ${tmin} : 60 = ${fmt(tmin / 60)} giờ. Bước 2 — áp dụng s = v × t = ${v} × ${fmt(tmin / 60)} = ${fmt(s)} km. Lỗi lớn nhất là nhân thẳng ${v} × ${tmin} = ${fmt(v * tmin)} km: tốc độ đang tính theo GIỜ nên thời gian cũng phải tính theo giờ.`,
        steps: [
          `${tmin} phút = ${fmt(tmin / 60)} giờ`,
          `s = v × t = ${v} × ${fmt(tmin / 60)}`,
          `s = ${fmt(s)} km`,
        ],
        hint: 'Tốc độ đo bằng km/h thì thời gian phải đổi về giờ trước khi nhân.',
        tags: ['quãng đường', 'đổi đơn vị', 'nhiều bước'],
      };
    }
    // Tốc độ cho bằng m/s, thời gian bằng phút, hỏi quãng đường bằng km.
    const vms = pick(r, [5, 10, 12, 15, 20]);
    const tmin = pick(r, [2, 3, 5, 10]);
    const sm = vms * tmin * 60;
    const skm = sm / 1000;
    const correct = uv(skm, 'km');
    return {
      stem: `Một vận động viên chạy đều với tốc độ ${vms} m/s trong ${tmin} phút. Tính quãng đường chạy được theo đơn vị km.`,
      correct,
      numeric: skm,
      distractors: ud(
        correct,
        [
          [sm, 'km'],
          [vms * tmin, 'km'],
          [skm * 60, 'km'],
          [skm / 1000, 'km'],
          [vms * tmin * 3.6, 'km'],
        ],
        [skm, 'km'],
      ),
      solution: `Bước 1 — đổi thời gian ra giây: ${tmin} phút = ${tmin} × 60 = ${tmin * 60} s. Bước 2 — tính quãng đường theo mét: s = v × t = ${vms} m/s × ${tmin * 60} s = ${fmt(sm)} m. Bước 3 — đổi ra ki-lô-mét: ${fmt(sm)} m = ${fmt(sm)} : 1000 = ${fmt(skm)} km. Hai lỗi hay mắc: quên đổi mét sang km (trả lời ${fmt(sm)} km) và nhân thẳng ${vms} × ${tmin} = ${fmt(vms * tmin)} khi thời gian vẫn còn là phút.`,
      steps: [
        `${tmin} phút = ${tmin * 60} giây`,
        `s = ${vms} × ${tmin * 60} = ${fmt(sm)} m`,
        `${fmt(sm)} m = ${fmt(skm)} km`,
      ],
      hint: 'Tốc độ m/s thì thời gian phải tính bằng giây, kết quả ra mét rồi mới đổi sang km.',
      tags: ['quãng đường', 'đổi đơn vị', 'nhiều bước'],
    };
  }

  // lvl 2 — tổng quãng đường của hành trình hai chặng
  const t1 = ri(r, 1, 3);
  let t2 = ri(r, 1, 3);
  if (t2 === t1) t2 = t1 + 1;
  const v1 = pick(r, [30, 40, 45, 50]);
  const v2 = pick(r, [55, 60, 65, 70]);
  const s1 = v1 * t1;
  const s2 = v2 * t2;
  const S = s1 + s2;
  const T = t1 + t2;
  const correct = uv(S, 'km');
  return {
    stem: `Một ô tô đi ${t1} giờ với tốc độ ${v1} km/h rồi đi tiếp ${t2} giờ với tốc độ ${v2} km/h. Tính tổng quãng đường ô tô đi được.`,
    correct,
    numeric: S,
    distractors: ud(
      correct,
      [
        [((v1 + v2) / 2) * T, 'km'],
        [(v1 + v2) * T, 'km'],
        [v1 * t2 + v2 * t1, 'km'],
        [v1 + v2, 'km'],
        [S / T, 'km'],
      ],
      [S, 'km'],
    ),
    solution: `Tính quãng đường từng chặng rồi cộng lại. Chặng 1: s₁ = ${v1} × ${t1} = ${s1} km. Chặng 2: s₂ = ${v2} × ${t2} = ${s2} km. Tổng quãng đường: S = ${s1} + ${s2} = ${S} km. (Kiểm tra lại bằng tốc độ trung bình: ${S} : ${T} = ${fmt(roundDec(S / T, 2))} km/h.) Bẫy hay gặp: lấy trung bình cộng hai tốc độ rồi nhân tổng thời gian, ra ${fmt(roundDec(((v1 + v2) / 2) * T, 2))} km — chỉ đúng khi hai chặng có thời gian bằng nhau.`,
    steps: [
      `s₁ = ${v1} × ${t1} = ${s1} km`,
      `s₂ = ${v2} × ${t2} = ${s2} km`,
      `S = ${s1} + ${s2} = ${S} km`,
    ],
    hint: 'Tính riêng quãng đường của từng chặng rồi mới cộng, đừng gộp tốc độ.',
    tags: ['quãng đường', 'nhiều bước', 'bẫy'],
  };
}

// ---------------------------------------------------------------------------
// gDensity — khối lượng riêng D = m : V
// ---------------------------------------------------------------------------

interface Substance {
  name: string;
  /** Khối lượng riêng theo g/cm³. */
  D: number;
}

const SUBSTANCES: Substance[] = [
  { name: 'nhôm', D: 2.7 },
  { name: 'sắt', D: 7.8 },
  { name: 'đồng', D: 8.9 },
  { name: 'kẽm', D: 7.1 },
  { name: 'bạc', D: 10.5 },
  { name: 'chì', D: 11.3 },
];

const LIQUIDS: Substance[] = [
  { name: 'nước', D: 1 },
  { name: 'dầu hỏa', D: 0.8 },
  { name: 'xăng', D: 0.7 },
];

/**
 * `params.mode`: 'D' — tính khối lượng riêng, 'm' — tính khối lượng,
 * 'V' — tính thể tích. `params.lvl` = 2 ⇒ mức 2 chuyển sang dạng nhận biết chất.
 */
function gDensity(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const mode = pstr(ctx, 'mode', 'D');
  const glvl = pnum(ctx, 'lvl', 1);
  const form = formOf(ctx);

  // ======================= TÍNH KHỐI LƯỢNG RIÊNG =======================
  if (mode === 'D') {
    if (lvl === 0) {
      const sub0 = pick(r, SUBSTANCES);
      const V = pick(r, [10, 20, 50, 100, 200]);
      const m = sub0.D * V;
      const correct = uv(sub0.D, 'g/cm³');
      return {
        stem: `Một khối kim loại có thể tích ${V} cm³ và khối lượng ${fmt(m)} g. Tính khối lượng riêng của kim loại đó.`,
        correct,
        numeric: sub0.D,
        distractors: ud(
          correct,
          [
            [V / m, 'g/cm³'],
            [m * V, 'g/cm³'],
            [sub0.D * 1000, 'g/cm³'],
            [m - V, 'g/cm³'],
            [sub0.D / 1000, 'g/cm³'],
          ],
          [sub0.D, 'g/cm³'],
        ),
        solution: `Công thức khối lượng riêng: D = m : V. Thay số: D = ${fmt(m)} g : ${V} cm³ = ${fmt(sub0.D)} g/cm³ (đúng bằng khối lượng riêng của ${sub0.name}). Gam chia xăng-ti-mét khối cho ra g/cm³. Lỗi hay gặp là chia ngược V : m (ra ${fmt(roundDec(V / m, 4))}) hoặc ghi kết quả theo kg/m³ mà vẫn để đơn vị g/cm³ — nhớ 1 g/cm³ = 1000 kg/m³.`,
        steps: [`Công thức: D = m : V`, `D = ${fmt(m)} : ${V} = ${fmt(sub0.D)} g/cm³`],
        hint: 'Khối lượng riêng bằng khối lượng chia cho thể tích.',
        tags: ['khối lượng riêng', 'vật lí'],
      };
    }

    if (lvl === 1) {
      // Khối lượng cho bằng kg, thể tích bằng dm³ ⇒ đáp án theo kg/m³.
      const sub1 = pick(r, SUBSTANCES);
      const Vdm = pick(r, [2, 4, 5, 10]);
      const mkg = sub1.D * Vdm;
      const Dkgm3 = sub1.D * 1000;
      const correct = uv(Dkgm3, 'kg/m³');
      return {
        stem: `Một thanh kim loại có thể tích ${Vdm} dm³ và khối lượng ${fmt(mkg)} kg. Tính khối lượng riêng của kim loại theo đơn vị kg/m³.`,
        correct,
        numeric: Dkgm3,
        distractors: ud(
          correct,
          [
            [mkg / Vdm, 'kg/m³'],
            [mkg * Vdm, 'kg/m³'],
            [Dkgm3 * 1000, 'kg/m³'],
            [Vdm / mkg, 'kg/m³'],
            [Dkgm3 / 1000, 'kg/m³'],
          ],
          [Dkgm3, 'kg/m³'],
        ),
        solution: `Bước 1 — đổi thể tích về m³: 1 dm³ = 0,001 m³ nên ${Vdm} dm³ = ${fmt(Vdm / 1000)} m³. Bước 2 — áp dụng D = m : V = ${fmt(mkg)} kg : ${fmt(Vdm / 1000)} m³ = ${fmt(Dkgm3)} kg/m³. Kiểm tra chéo: ${fmt(Dkgm3)} kg/m³ = ${fmt(sub1.D)} g/cm³, đúng bằng khối lượng riêng của ${sub1.name}. Lỗi phổ biến là quên đổi dm³ sang m³, ra ${fmt(roundDec(mkg / Vdm, 4))} kg/m³ — nhỏ hơn đúng 1000 lần.`,
        steps: [
          `${Vdm} dm³ = ${fmt(Vdm / 1000)} m³`,
          `D = m : V = ${fmt(mkg)} : ${fmt(Vdm / 1000)}`,
          `D = ${fmt(Dkgm3)} kg/m³`,
        ],
        hint: 'Muốn ra kg/m³ thì khối lượng phải tính bằng kg và thể tích bằng m³ (1 dm³ = 0,001 m³).',
        tags: ['khối lượng riêng', 'đổi đơn vị', 'nhiều bước'],
      };
    }

    // lvl 2
    if (glvl >= 2 || form % 2 === 1) {
      // Tính D rồi tra bảng để nhận biết chất.
      const idx = ri(r, 0, SUBSTANCES.length - 1);
      const target = SUBSTANCES[idx];
      const V = pick(r, [10, 20, 50, 100]);
      const m = target.D * V;
      const table = SUBSTANCES.map((s) => `${s.name} ${fmt(s.D)} g/cm³`).join('; ');
      const correct = `${target.name} (D = ${fmt(target.D)} g/cm³)`;
      const others = SUBSTANCES.filter((s) => s.name !== target.name).map(
        (s) => `${s.name} (D = ${fmt(s.D)} g/cm³)`,
      );
      return {
        stem: `Một vật đặc có khối lượng ${fmt(m)} g và thể tích ${V} cm³. Biết khối lượng riêng của một số kim loại: ${table}. Vật đó được làm bằng kim loại nào?`,
        correct,
        distractors: td(correct, others),
        solution: `Bước 1 — tính khối lượng riêng của vật: D = m : V = ${fmt(m)} g : ${V} cm³ = ${fmt(target.D)} g/cm³. Bước 2 — đối chiếu với bảng: giá trị ${fmt(target.D)} g/cm³ ứng với ${target.name}. Vậy vật làm bằng ${target.name}. Lỗi hay gặp là chia ngược V : m (ra ${fmt(roundDec(V / m, 4))}) rồi không tìm thấy chất nào khớp, hoặc quên rằng bảng đang cho theo g/cm³ nên đem so sánh với số liệu tính bằng kg/m³.`,
        steps: [
          `D = m : V = ${fmt(m)} : ${V} = ${fmt(target.D)} g/cm³`,
          `Tra bảng: ${fmt(target.D)} g/cm³ → ${target.name}`,
        ],
        hint: 'Tính khối lượng riêng trước, sau đó so sánh con số vừa tính với bảng đã cho (chú ý cùng đơn vị g/cm³).',
        tags: ['khối lượng riêng', 'nhận biết chất', 'nhiều bước'],
      };
    }

    // lvl 2 (khối nhỏ) — phải tính thể tích khối hộp trước
    const sub2 = pick(r, SUBSTANCES);
    const a = pick(r, [2, 4, 5]);
    const b = pick(r, [3, 5, 10]);
    const c = pick(r, [2, 4, 10]);
    const V = a * b * c;
    const m = sub2.D * V;
    const correct = uv(sub2.D, 'g/cm³');
    return {
      stem: `Một khối kim loại hình hộp chữ nhật có các kích thước ${a} cm × ${b} cm × ${c} cm, khối lượng ${fmt(m)} g. Tính khối lượng riêng của kim loại đó.`,
      correct,
      numeric: sub2.D,
      distractors: ud(
        correct,
        [
          [m / (a + b + c), 'g/cm³'],
          [m / (a * b), 'g/cm³'],
          [V / m, 'g/cm³'],
          [sub2.D * 1000, 'g/cm³'],
          [m * V, 'g/cm³'],
        ],
        [sub2.D, 'g/cm³'],
      ),
      solution: `Bước 1 — tính thể tích khối hộp: V = a × b × c = ${a} × ${b} × ${c} = ${V} cm³. Bước 2 — tính khối lượng riêng: D = m : V = ${fmt(m)} : ${V} = ${fmt(sub2.D)} g/cm³, tức là ${sub2.name}. Lỗi hay gặp là cộng ba kích thước thay vì nhân (ra ${fmt(roundDec(m / (a + b + c), 4))} g/cm³) hoặc chỉ nhân hai kích thước (nhầm diện tích với thể tích).`,
      steps: [
        `V = ${a} × ${b} × ${c} = ${V} cm³`,
        `D = m : V = ${fmt(m)} : ${V} = ${fmt(sub2.D)} g/cm³`,
      ],
      hint: 'Thể tích hình hộp chữ nhật bằng tích ba kích thước, sau đó mới lấy khối lượng chia thể tích.',
      tags: ['khối lượng riêng', 'thể tích', 'nhiều bước'],
    };
  }

  // ======================= TÍNH KHỐI LƯỢNG =======================
  if (mode === 'm') {
    if (lvl === 0) {
      const sub0 = pick(r, SUBSTANCES);
      const V = pick(r, [10, 20, 50, 100]);
      const m = sub0.D * V;
      const correct = uv(m, 'g');
      return {
        stem: `Một vật bằng ${sub0.name} có thể tích ${V} cm³. Biết khối lượng riêng của ${sub0.name} là ${fmt(sub0.D)} g/cm³. Tính khối lượng của vật.`,
        correct,
        numeric: m,
        distractors: ud(
          correct,
          [
            [V / sub0.D, 'g'],
            [sub0.D / V, 'g'],
            [sub0.D + V, 'g'],
            [m / 1000, 'g'],
            [m * 1000, 'g'],
          ],
          [m, 'g'],
        ),
        solution: `Từ D = m : V suy ra m = D × V. Thay số: m = ${fmt(sub0.D)} g/cm³ × ${V} cm³ = ${fmt(m)} g. Đơn vị g/cm³ nhân cm³ cho ra gam. Lỗi hay gặp là chia V cho D (ra ${fmt(roundDec(V / sub0.D, 4))} g) — đó là công thức tính thể tích chứ không phải khối lượng.`,
        steps: [`Từ D = m : V suy ra m = D × V`, `m = ${fmt(sub0.D)} × ${V} = ${fmt(m)} g`],
        hint: 'Khối lượng bằng khối lượng riêng nhân thể tích.',
        tags: ['khối lượng riêng', 'khối lượng'],
      };
    }

    if (lvl === 1) {
      const liq = pick(r, LIQUIDS);
      const Vl = pick(r, [5, 10, 20, 25, 50]);
      const mg = liq.D * Vl * 1000;
      const mkg = mg / 1000;
      const correct = uv(mkg, 'kg');
      return {
        stem: `Một can chứa ${Vl} lít ${liq.name}. Biết khối lượng riêng của ${liq.name} là ${fmt(liq.D)} g/cm³. Tính khối lượng ${liq.name} trong can theo đơn vị kg.`,
        correct,
        numeric: mkg,
        distractors: ud(
          correct,
          [
            [liq.D * Vl * 1000, 'kg'],
            [Vl / liq.D, 'kg'],
            [mkg * 10, 'kg'],
            [mkg / 1000, 'kg'],
            [liq.D + Vl, 'kg'],
          ],
          [mkg, 'kg'],
        ),
        solution: `Bước 1 — đổi thể tích: 1 lít = 1 dm³ = 1000 cm³ nên ${Vl} lít = ${fmt(Vl * 1000)} cm³. Bước 2 — tính khối lượng: m = D × V = ${fmt(liq.D)} g/cm³ × ${fmt(Vl * 1000)} cm³ = ${fmt(mg)} g. Bước 3 — đổi ra kg: ${fmt(mg)} g = ${fmt(mkg)} kg. Lỗi hay gặp là dừng ở ${fmt(mg)} rồi ghi đơn vị kg, tức là quên chia 1000. Cách nhẩm nhanh: D = ${fmt(liq.D)} g/cm³ = ${fmt(liq.D)} kg/lít nên m = ${fmt(liq.D)} × ${Vl} = ${fmt(mkg)} kg.`,
        steps: [
          `${Vl} lít = ${fmt(Vl * 1000)} cm³`,
          `m = D × V = ${fmt(liq.D)} × ${fmt(Vl * 1000)} = ${fmt(mg)} g`,
          `${fmt(mg)} g = ${fmt(mkg)} kg`,
        ],
        hint: '1 lít = 1000 cm³; tính ra gam trước rồi chia 1000 để có ki-lô-gam.',
        tags: ['khối lượng riêng', 'đổi đơn vị', 'nhiều bước'],
      };
    }

    // lvl 2 — tính thể tích khối hộp rồi ra khối lượng, đáp án theo kg
    const sub2 = pick(r, SUBSTANCES);
    const a = pick(r, [5, 10, 20]);
    const b = pick(r, [4, 10, 25]);
    const c = pick(r, [10, 20, 50]);
    const V = a * b * c;
    const mg = sub2.D * V;
    const mkg = mg / 1000;
    const correct = uv(mkg, 'kg');
    return {
      stem: `Một khối ${sub2.name} hình hộp chữ nhật có kích thước ${a} cm × ${b} cm × ${c} cm. Biết khối lượng riêng của ${sub2.name} là ${fmt(sub2.D)} g/cm³. Tính khối lượng của khối ${sub2.name} đó theo đơn vị kg.`,
      correct,
      numeric: mkg,
      distractors: ud(
        correct,
        [
          [mg, 'kg'],
          [sub2.D * (a + b + c), 'kg'],
          [mkg / 1000, 'kg'],
          [sub2.D * a * b, 'kg'],
          [mkg * 10, 'kg'],
        ],
        [mkg, 'kg'],
      ),
      solution: `Bước 1 — thể tích: V = ${a} × ${b} × ${c} = ${fmt(V)} cm³. Bước 2 — khối lượng theo gam: m = D × V = ${fmt(sub2.D)} × ${fmt(V)} = ${fmt(mg)} g. Bước 3 — đổi sang ki-lô-gam: ${fmt(mg)} g = ${fmt(mg)} : 1000 = ${fmt(mkg)} kg. Bẫy của bài này là quên bước đổi đơn vị cuối cùng và trả lời ${fmt(mg)} kg — nặng gấp 1000 lần thực tế.`,
      steps: [
        `V = ${a} × ${b} × ${c} = ${fmt(V)} cm³`,
        `m = ${fmt(sub2.D)} × ${fmt(V)} = ${fmt(mg)} g`,
        `m = ${fmt(mkg)} kg`,
      ],
      hint: 'Nhân ba kích thước ra thể tích, nhân với khối lượng riêng ra gam, cuối cùng chia 1000 ra kg.',
      tags: ['khối lượng riêng', 'nhiều bước', 'đổi đơn vị'],
    };
  }

  // ======================= TÍNH THỂ TÍCH =======================
  if (lvl === 0) {
    const sub0 = pick(r, SUBSTANCES);
    const V = pick(r, [10, 20, 50, 100, 200]);
    const m = sub0.D * V;
    const correct = uv(V, 'cm³');
    return {
      stem: `Một vật bằng ${sub0.name} có khối lượng ${fmt(m)} g. Biết khối lượng riêng của ${sub0.name} là ${fmt(sub0.D)} g/cm³. Tính thể tích của vật.`,
      correct,
      numeric: V,
      distractors: ud(
        correct,
        [
          [m * sub0.D, 'cm³'],
          [sub0.D / m, 'cm³'],
          [V * 1000, 'cm³'],
          [V / 1000, 'cm³'],
          [m - sub0.D, 'cm³'],
        ],
        [V, 'cm³'],
      ),
      solution: `Từ D = m : V suy ra V = m : D. Thay số: V = ${fmt(m)} g : ${fmt(sub0.D)} g/cm³ = ${fmt(V)} cm³. Lỗi hay gặp là nhân m với D (ra ${fmt(m * sub0.D)}) — kết quả này vô lí vì chất càng nặng (D càng lớn) thì cùng một khối lượng phải chiếm thể tích càng NHỎ.`,
      steps: [`Từ D = m : V suy ra V = m : D`, `V = ${fmt(m)} : ${fmt(sub0.D)} = ${fmt(V)} cm³`],
      hint: 'Thể tích bằng khối lượng chia cho khối lượng riêng.',
      tags: ['khối lượng riêng', 'thể tích'],
    };
  }

  if (lvl === 1) {
    const sub1 = pick(r, SUBSTANCES);
    const V = pick(r, [100, 200, 500, 1000]);
    const mg = sub1.D * V;
    const mkg = mg / 1000;
    const correct = uv(V, 'cm³');
    return {
      stem: `Một vật bằng ${sub1.name} có khối lượng ${fmt(mkg)} kg. Biết khối lượng riêng của ${sub1.name} là ${fmt(sub1.D)} g/cm³. Tính thể tích của vật theo đơn vị cm³.`,
      correct,
      numeric: V,
      distractors: ud(
        correct,
        [
          [mkg / sub1.D, 'cm³'],
          [mg * sub1.D, 'cm³'],
          [V * 1000, 'cm³'],
          [V / 1000, 'cm³'],
          [sub1.D / mkg, 'cm³'],
        ],
        [V, 'cm³'],
      ),
      solution: `Bước 1 — đổi khối lượng về gam cho khớp với đơn vị của D: ${fmt(mkg)} kg = ${fmt(mkg)} × 1000 = ${fmt(mg)} g. Bước 2 — tính thể tích: V = m : D = ${fmt(mg)} : ${fmt(sub1.D)} = ${fmt(V)} cm³. Lỗi phổ biến là chia thẳng ${fmt(mkg)} : ${fmt(sub1.D)} = ${fmt(roundDec(mkg / sub1.D, 4))} khi khối lượng vẫn còn tính bằng kg — kết quả nhỏ hơn đúng 1000 lần.`,
      steps: [
        `${fmt(mkg)} kg = ${fmt(mg)} g`,
        `V = m : D = ${fmt(mg)} : ${fmt(sub1.D)}`,
        `V = ${fmt(V)} cm³`,
      ],
      hint: 'Khối lượng riêng cho theo g/cm³ thì khối lượng phải đổi về gam trước khi chia.',
      tags: ['khối lượng riêng', 'đổi đơn vị', 'nhiều bước'],
    };
  }

  // lvl 2 — vật có phần rỗng: so sánh thể tích đo được với thể tích phần đặc
  const sub2 = pick(r, SUBSTANCES);
  const Vsolid = pick(r, [20, 40, 50, 100]);
  const Vhollow = pick(r, [5, 10, 20, 25]);
  const Vtotal = Vsolid + Vhollow;
  const m = sub2.D * Vsolid;
  const correct = uv(Vhollow, 'cm³');
  return {
    stem: `Một quả cầu bằng ${sub2.name} có khối lượng ${fmt(m)} g. Thả vào bình chia độ thì thấy quả cầu chiếm thể tích ${Vtotal} cm³. Biết khối lượng riêng của ${sub2.name} là ${fmt(sub2.D)} g/cm³. Tính thể tích phần rỗng bên trong quả cầu.`,
    correct,
    numeric: Vhollow,
    distractors: ud(
      correct,
      [
        [Vtotal, 'cm³'],
        [Vsolid, 'cm³'],
        [Vtotal + Vsolid, 'cm³'],
        [m / sub2.D - Vtotal, 'cm³'],
        [Vhollow * 1000, 'cm³'],
      ],
      [Vhollow, 'cm³'],
    ),
    solution: `Bước 1 — tính thể tích phần ${sub2.name} đặc (phần thực sự có khối lượng): V_đặc = m : D = ${fmt(m)} : ${fmt(sub2.D)} = ${fmt(Vsolid)} cm³. Bước 2 — thể tích quả cầu chiếm chỗ trong bình là ${Vtotal} cm³, gồm phần đặc và phần rỗng, nên V_rỗng = ${Vtotal} − ${fmt(Vsolid)} = ${fmt(Vhollow)} cm³. Bẫy của bài: lấy thẳng ${Vtotal} cm³ để chia cho D, hoặc nhầm thể tích phần đặc chính là đáp số.`,
    steps: [
      `V_đặc = m : D = ${fmt(m)} : ${fmt(sub2.D)} = ${fmt(Vsolid)} cm³`,
      `V_rỗng = V_toàn phần − V_đặc = ${Vtotal} − ${fmt(Vsolid)}`,
      `V_rỗng = ${fmt(Vhollow)} cm³`,
    ],
    hint: 'Khối lượng chỉ do phần kim loại đặc tạo ra; phần rỗng bằng thể tích chiếm chỗ trừ đi thể tích phần đặc.',
    tags: ['khối lượng riêng', 'suy luận ngược', 'nhiều bước'],
  };
}

// ---------------------------------------------------------------------------
// gTempConv — đổi thang nhiệt độ Celsius ↔ Fahrenheit (°F = °C × 9/5 + 32)
// ---------------------------------------------------------------------------

/** Đổi °C sang °F. Chọn °C là bội của 5 thì °F luôn ra số nguyên. */
function c2f(c: number): number {
  return (c * 9) / 5 + 32;
}

/** `params.lvl` = 2 ⇒ dùng bối cảnh phòng thí nghiệm với thang nhiệt độ rộng hơn. */
function gTempConv(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const glvl = pnum(ctx, 'lvl', 1);
  const form = formOf(ctx);

  // Chọn °C là bội của 5 ⇒ °F luôn nguyên (mỗi 5 °C ứng với đúng 9 °F).
  const coolPool = [0, 5, 10, 15, 20, 25, 30, 35, 40];
  const hotPool = [45, 50, 60, 70, 80, 90, 100, 120, 150];
  const pool = glvl >= 2 ? coolPool.concat(hotPool) : coolPool;

  if (lvl === 0) {
    const c = pick(r, pool);
    const f = c2f(c);
    const correct = uv(f, '°F');
    return {
      stem: `Nhiệt độ của một vật là ${c} °C. Hãy đổi nhiệt độ đó sang thang Fahrenheit (°F).`,
      correct,
      numeric: f,
      distractors: ud(
        correct,
        [
          [(c * 9) / 5, '°F'],
          [c + 32, '°F'],
          [((c + 32) * 9) / 5, '°F'],
          [(c * 5) / 9 + 32, '°F'],
          [c - 32, '°F'],
        ],
        [f, '°F'],
      ),
      solution: `Công thức đổi: °F = °C × 9/5 + 32. Thay số: ${c} × 9/5 = ${fmt((c * 9) / 5)}, cộng thêm 32 được ${fmt((c * 9) / 5)} + 32 = ${fmt(f)} °F. Hai lỗi hay gặp: quên cộng 32 (ra ${fmt((c * 9) / 5)} °F) và chỉ cộng 32 mà quên nhân 9/5 (ra ${fmt(c + 32)} °F). Nhớ mốc quen thuộc: 0 °C = 32 °F, 100 °C = 212 °F.`,
      steps: [`°F = °C × 9/5 + 32`, `${c} × 9/5 = ${fmt((c * 9) / 5)}`, `${fmt((c * 9) / 5)} + 32 = ${fmt(f)} °F`],
      hint: 'Nhân với 9/5 (tức 1,8) trước, sau đó mới cộng 32.',
      tags: ['nhiệt độ', 'đổi thang đo'],
    };
  }

  if (lvl === 1) {
    const c = pick(r, pool);
    const f = c2f(c);
    const correct = uv(c, '°C');
    return {
      stem: `Nhiệt kế của một lò sấy chỉ ${fmt(f)} °F. Hãy đổi nhiệt độ đó sang thang Celsius (°C).`,
      correct,
      numeric: c,
      distractors: ud(
        correct,
        [
          [(f * 5) / 9, '°C'],
          [f - 32, '°C'],
          [((f - 32) * 9) / 5, '°C'],
          [(f + 32) * (5 / 9), '°C'],
          [f / 1.8, '°C'],
        ],
        [c, '°C'],
      ),
      solution: `Từ °F = °C × 9/5 + 32 rút ngược ra: °C = (°F − 32) × 5/9. Bước 1 — trừ 32: ${fmt(f)} − 32 = ${fmt(f - 32)}. Bước 2 — nhân 5/9: ${fmt(f - 32)} × 5/9 = ${fmt(c)} °C. Lỗi phổ biến nhất là quên trừ 32 trước khi nhân 5/9 (ra ${fmt(roundDec((f * 5) / 9, 4))} °C); lỗi thứ hai là nhân 9/5 thay vì 5/9 (ra ${fmt(((f - 32) * 9) / 5)} °C).`,
      steps: [`°C = (°F − 32) × 5/9`, `${fmt(f)} − 32 = ${fmt(f - 32)}`, `${fmt(f - 32)} × 5/9 = ${fmt(c)} °C`],
      hint: 'Làm ngược lại công thức: trừ 32 trước rồi mới nhân 5/9.',
      tags: ['nhiệt độ', 'đổi thang đo', 'suy luận ngược'],
    };
  }

  // lvl 2 — ba dạng suy luận
  const variant = (form + ri(r, 0, 2)) % 3;

  if (variant === 0) {
    // Độ tăng nhiệt độ: ΔF = ΔC × 9/5, KHÔNG cộng 32.
    const c1 = pick(r, [10, 15, 20, 25, 30]);
    const dc = pick(r, [10, 15, 20, 25, 30, 40]);
    const c2 = c1 + dc;
    const df = (dc * 9) / 5;
    const correct = uv(df, '°F');
    return {
      stem: `Nhiệt độ của một cốc nước tăng từ ${c1} °C lên ${c2} °C. Hỏi theo thang Fahrenheit thì nhiệt độ đã tăng thêm bao nhiêu độ?`,
      correct,
      numeric: df,
      distractors: ud(
        correct,
        [
          [dc, '°F'],
          [df + 32, '°F'],
          [c2f(c2), '°F'],
          [dc + 32, '°F'],
          [(dc * 5) / 9, '°F'],
        ],
        [df, '°F'],
      ),
      solution: `Cách 1 — đổi từng mốc: ${c1} °C = ${fmt(c2f(c1))} °F và ${c2} °C = ${fmt(c2f(c2))} °F, nên độ tăng là ${fmt(c2f(c2))} − ${fmt(c2f(c1))} = ${fmt(df)} °F. Cách 2 — nhanh hơn: với ĐỘ CHÊNH nhiệt độ ta chỉ nhân 9/5 mà KHÔNG cộng 32, vì 32 bị triệt tiêu khi trừ hai giá trị: ΔF = ${dc} × 9/5 = ${fmt(df)} °F. Bẫy lớn nhất của bài là vẫn cộng thêm 32 (ra ${fmt(df + 32)} °F); bẫy thứ hai là tưởng độ chênh ở hai thang bằng nhau (trả lời ${dc} °F).`,
      steps: [
        `${c1} °C = ${fmt(c2f(c1))} °F`,
        `${c2} °C = ${fmt(c2f(c2))} °F`,
        `ΔF = ${fmt(c2f(c2))} − ${fmt(c2f(c1))} = ${fmt(df)} °F (= ${dc} × 9/5)`,
      ],
      hint: 'Với độ CHÊNH lệch nhiệt độ thì chỉ nhân 9/5, hằng số 32 tự triệt tiêu khi trừ.',
      tags: ['nhiệt độ', 'đổi thang đo', 'bẫy'],
    };
  }

  if (variant === 1) {
    // So sánh hai vật đo bằng hai thang khác nhau.
    const ca = pick(r, [30, 35, 40, 45, 50]);
    const diff = pick(r, [5, 10, 15, 20]);
    const cb = ca - diff;
    const fb = c2f(cb);
    const correct = uv(diff, '°C');
    return {
      stem: `Vật A có nhiệt độ ${ca} °C, vật B có nhiệt độ ${fmt(fb)} °F. Vật A nóng hơn vật B bao nhiêu độ C?`,
      correct,
      numeric: diff,
      distractors: ud(
        correct,
        [
          [ca - fb, '°C'],
          [fb - ca, '°C'],
          [(diff * 9) / 5, '°C'],
          [fb - 32 - ca, '°C'],
          [c2f(ca) - fb, '°C'],
        ],
        [diff, '°C'],
      ),
      solution: `Muốn so sánh thì hai nhiệt độ phải cùng một thang đo. Đổi vật B về °C: °C = (°F − 32) × 5/9 = (${fmt(fb)} − 32) × 5/9 = ${fmt(cb)} °C. So sánh: ${ca} °C − ${fmt(cb)} °C = ${fmt(diff)} °C, vậy vật A nóng hơn ${fmt(diff)} °C. Bẫy: trừ thẳng ${ca} − ${fmt(fb)} = ${fmt(ca - fb)} khi hai số đang ở hai thang khác nhau — hoàn toàn vô nghĩa.`,
      steps: [
        `Vật B: (${fmt(fb)} − 32) × 5/9 = ${fmt(cb)} °C`,
        `Chênh lệch: ${ca} − ${fmt(cb)} = ${fmt(diff)} °C`,
      ],
      hint: 'Đưa cả hai nhiệt độ về cùng một thang đo rồi mới trừ.',
      tags: ['nhiệt độ', 'so sánh', 'nhiều bước'],
    };
  }

  // variant 2 — tìm nhiệt độ thỏa mãn quan hệ giữa hai thang
  if (ri(r, 0, 1) === 0) {
    const correct = uv(-40, '°C');
    return {
      stem: `Tìm nhiệt độ mà tại đó số chỉ trên thang Celsius và số chỉ trên thang Fahrenheit BẰNG NHAU.`,
      correct,
      numeric: -40,
      distractors: ud(
        correct,
        [
          [0, '°C'],
          [32, '°C'],
          [-32, '°C'],
          [40, '°C'],
          [-17.78, '°C'],
        ],
        [-40, '°C'],
      ),
      solution: `Gọi nhiệt độ cần tìm là x (số chỉ giống nhau ở cả hai thang). Theo công thức: x = x × 9/5 + 32. Chuyển vế: x − 1,8x = 32 ⇒ −0,8x = 32 ⇒ x = 32 : (−0,8) = −40. Thử lại: −40 × 9/5 + 32 = −72 + 32 = −40 ✓. Vậy −40 °C = −40 °F. Lỗi hay gặp là trả lời 0 °C hoặc 32 °C do nhớ máy móc mốc 0 °C = 32 °F.`,
      steps: [`Đặt x = số chỉ chung`, `x = 1,8x + 32`, `−0,8x = 32 ⇒ x = −40`, `Thử lại: −40 × 1,8 + 32 = −40 ✓`],
      hint: 'Đặt số chỉ chung là x rồi giải phương trình x = 1,8x + 32.',
      tags: ['nhiệt độ', 'suy luận ngược', 'phương trình'],
    };
  }
  const correct = uv(160, '°C');
  return {
    stem: `Tìm nhiệt độ mà tại đó số chỉ trên thang Fahrenheit GẤP ĐÔI số chỉ trên thang Celsius.`,
    correct,
    numeric: 160,
    distractors: ud(
      correct,
      [
        [320, '°C'],
        [80, '°C'],
        [64, '°C'],
        [40, '°C'],
        [-40, '°C'],
      ],
      [160, '°C'],
    ),
    solution: `Gọi nhiệt độ cần tìm là x °C, khi đó số chỉ Fahrenheit là 2x. Theo công thức: 2x = x × 9/5 + 32 ⇒ 2x − 1,8x = 32 ⇒ 0,2x = 32 ⇒ x = 160. Thử lại: 160 °C = 160 × 1,8 + 32 = 288 + 32 = 320 °F, đúng gấp đôi 160 ✓. Bẫy: trả lời 320 °C vì nhầm giữa giá trị x và giá trị 2x của thang Fahrenheit.`,
    steps: [`Đặt nhiệt độ là x °C ⇒ số chỉ °F là 2x`, `2x = 1,8x + 32`, `0,2x = 32 ⇒ x = 160`, `Thử lại: 160 °C = 320 °F ✓`],
    hint: 'Đặt ẩn là số đo Celsius, viết số đo Fahrenheit theo ẩn đó rồi giải phương trình.',
    tags: ['nhiệt độ', 'suy luận ngược', 'phương trình'],
  };
}

// ---------------------------------------------------------------------------
// gWorkPower — công cơ học A = F · s và công suất P = A : t
// ---------------------------------------------------------------------------

/** `params.mode`: 'A' — tính công, 'P' — tính công suất. */
function gWorkPower(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const mode = pstr(ctx, 'mode', 'A');
  const form = formOf(ctx);

  // ======================= TÍNH CÔNG =======================
  if (mode === 'A') {
    if (lvl === 0) {
      const F = pick(r, [50, 80, 120, 150, 200, 250, 300, 400]);
      const s = pick(r, [2, 4, 5, 8, 10, 15, 20]);
      const A = F * s;
      const correct = uv(A, 'J');
      return {
        stem: `Một người dùng lực kéo ${F} N để kéo một thùng hàng đi được quãng đường ${s} m theo phương của lực. Tính công của lực kéo.`,
        correct,
        numeric: A,
        distractors: ud(
          correct,
          [
            [F + s, 'J'],
            [F / s, 'J'],
            [A / 2, 'J'],
            [A, 'kJ'],
            [A * 10, 'J'],
          ],
          [A, 'J'],
        ),
        solution: `Công cơ học: A = F × s (lực cùng phương với chuyển động). Thay số: A = ${F} N × ${s} m = ${fmt(A)} J. Niutơn nhân mét cho ra jun (1 J = 1 N·m). Lỗi hay gặp: cộng lực với quãng đường (ra ${fmt(F + s)}) hoặc ghi nhầm đơn vị kJ trong khi ${fmt(A)} J chỉ bằng ${fmt(A / 1000)} kJ.`,
        steps: [`Công thức: A = F × s`, `A = ${F} × ${s} = ${fmt(A)} J`],
        hint: 'Công bằng lực nhân quãng đường dịch chuyển theo phương của lực; đơn vị là jun (J).',
        tags: ['công cơ học', 'vật lí'],
      };
    }

    if (lvl === 1) {
      // Nâng vật lên cao: phải tính trọng lượng P = 10·m trước.
      const m = pick(r, [5, 8, 10, 12, 15, 20, 25, 50]);
      const h = pick(r, [2, 3, 4, 5, 6, 10]);
      const F = G * m;
      const A = F * h;
      const correct = uv(A, 'J');
      return {
        stem: `Một người nâng đều một vật có khối lượng ${m} kg lên độ cao ${h} m. Tính công mà người đó thực hiện (lấy trọng lượng của vật P = 10·m).`,
        correct,
        numeric: A,
        distractors: ud(
          correct,
          [
            [m * h, 'J'],
            [A * 10, 'J'],
            [m + h, 'J'],
            [A, 'kJ'],
            [(m * h) / G, 'J'],
          ],
          [A, 'J'],
        ),
        solution: `Bước 1 — muốn nâng đều vật thì lực nâng phải bằng trọng lượng: P = 10 × m = 10 × ${m} = ${fmt(F)} N. Bước 2 — công của lực nâng: A = F × h = ${fmt(F)} N × ${h} m = ${fmt(A)} J. Lỗi kinh điển là lấy thẳng khối lượng nhân độ cao (${m} × ${h} = ${fmt(m * h)}) — quên nhân hệ số 10 để đổi khối lượng (kg) thành trọng lượng (N).`,
        steps: [
          `Trọng lượng: P = 10 × ${m} = ${fmt(F)} N`,
          `A = P × h = ${fmt(F)} × ${h}`,
          `A = ${fmt(A)} J`,
        ],
        hint: 'Khối lượng tính bằng kg phải đổi ra trọng lượng bằng cách nhân 10 trước khi tính công.',
        tags: ['công cơ học', 'trọng lượng', 'nhiều bước'],
      };
    }

    // lvl 2 — hai dạng: ròng rọc động (bẫy khái niệm) và công từ công suất
    if (form % 2 === 0) {
      const m = pick(r, [20, 30, 40, 50, 60]);
      const h = pick(r, [2, 3, 4, 5]);
      const A = G * m * h;
      const correct = uv(A, 'J');
      return {
        stem: `Dùng một ròng rọc động để kéo vật có khối lượng ${m} kg lên cao ${h} m. Bỏ qua ma sát và khối lượng ròng rọc. Tính công phải thực hiện để kéo vật lên.`,
        correct,
        numeric: A,
        distractors: ud(
          correct,
          [
            [A / 2, 'J'],
            [A * 2, 'J'],
            [m * h, 'J'],
            [(G * m * h) / 4, 'J'],
            [A, 'kJ'],
          ],
          [A, 'J'],
        ),
        solution: `Ròng rọc động cho ta lợi 2 lần về LỰC nhưng lại thiệt 2 lần về ĐƯỜNG ĐI: lực kéo chỉ còn F = P : 2 = ${fmt((G * m) / 2)} N, nhưng phải kéo dây một đoạn s = 2h = ${fmt(2 * h)} m. Công thực hiện: A = F × s = ${fmt((G * m) / 2)} × ${fmt(2 * h)} = ${fmt(A)} J — đúng bằng công nâng trực tiếp A = P × h = ${fmt(G * m)} × ${h} = ${fmt(A)} J. Đó chính là ĐỊNH LUẬT VỀ CÔNG: không một máy cơ đơn giản nào cho ta lợi về công. Bẫy: tưởng lợi 2 lần về lực thì công giảm một nửa (ra ${fmt(A / 2)} J).`,
        steps: [
          `Trọng lượng: P = 10 × ${m} = ${fmt(G * m)} N`,
          `Ròng rọc động: F = P : 2 = ${fmt((G * m) / 2)} N nhưng s = 2h = ${fmt(2 * h)} m`,
          `A = F × s = ${fmt((G * m) / 2)} × ${fmt(2 * h)} = ${fmt(A)} J`,
        ],
        hint: 'Định luật về công: lợi bao nhiêu lần về lực thì thiệt bấy nhiêu lần về đường đi, công không đổi.',
        tags: ['công cơ học', 'định luật về công', 'bẫy'],
      };
    }
    const Pkw = pick(r, [1.5, 2, 2.5, 3, 4, 5]);
    const tmin = pick(r, [2, 3, 5, 10, 15]);
    const AkJ = Pkw * tmin * 60;
    const correct = uv(AkJ, 'kJ');
    return {
      stem: `Một động cơ có công suất ${fmt(Pkw)} kW hoạt động liên tục trong ${tmin} phút. Tính công mà động cơ thực hiện (theo đơn vị kJ).`,
      correct,
      numeric: AkJ,
      distractors: ud(
        correct,
        [
          [Pkw * tmin, 'kJ'],
          [AkJ * 1000, 'kJ'],
          [AkJ / 60, 'kJ'],
          [Pkw * 1000 * tmin, 'kJ'],
          [AkJ / 1000, 'kJ'],
        ],
        [AkJ, 'kJ'],
      ),
      solution: `Từ P = A : t suy ra A = P × t, nhưng phải quy về đơn vị chuẩn. Bước 1 — đổi công suất: ${fmt(Pkw)} kW = ${fmt(Pkw * 1000)} W. Bước 2 — đổi thời gian: ${tmin} phút = ${tmin * 60} s. Bước 3 — tính công: A = ${fmt(Pkw * 1000)} × ${tmin * 60} = ${fmt(AkJ * 1000)} J = ${fmt(AkJ)} kJ. Bẫy đơn vị: nhân thẳng ${fmt(Pkw)} × ${tmin} = ${fmt(Pkw * tmin)} khi chưa đổi phút ra giây — kết quả thiếu đúng 60 lần.`,
      steps: [
        `${fmt(Pkw)} kW = ${fmt(Pkw * 1000)} W`,
        `${tmin} phút = ${tmin * 60} s`,
        `A = P × t = ${fmt(Pkw * 1000)} × ${tmin * 60} = ${fmt(AkJ * 1000)} J = ${fmt(AkJ)} kJ`,
      ],
      hint: 'Đổi kW ra W và phút ra giây trước khi nhân, sau đó mới đổi kết quả sang kJ.',
      tags: ['công cơ học', 'công suất', 'đổi đơn vị', 'nhiều bước'],
    };
  }

  // ======================= TÍNH CÔNG SUẤT =======================
  if (lvl === 0) {
    const P = pick(r, [50, 75, 100, 120, 150, 200, 250]);
    const t = pick(r, [4, 5, 8, 10, 20, 25]);
    const A = P * t;
    const correct = uv(P, 'W');
    return {
      stem: `Một máy thực hiện được công ${fmt(A)} J trong thời gian ${t} giây. Tính công suất của máy.`,
      correct,
      numeric: P,
      distractors: ud(
        correct,
        [
          [A * t, 'W'],
          [t / A, 'W'],
          [P / 1000, 'W'],
          [P * 60, 'W'],
          [A - t, 'W'],
        ],
        [P, 'W'],
      ),
      solution: `Công suất là công thực hiện trong một đơn vị thời gian: P = A : t. Thay số: P = ${fmt(A)} J : ${t} s = ${fmt(P)} W. Jun chia giây cho ra oát (1 W = 1 J/s). Lỗi hay gặp là nhân công với thời gian (ra ${fmt(A * t)}) — như vậy máy chạy càng lâu công suất càng lớn, hoàn toàn vô lí.`,
      steps: [`Công thức: P = A : t`, `P = ${fmt(A)} : ${t} = ${fmt(P)} W`],
      hint: 'Công suất bằng công chia cho thời gian, đơn vị oát (W).',
      tags: ['công suất', 'vật lí'],
    };
  }

  if (lvl === 1) {
    // Máy bơm nâng nước: A = 10·m·h rồi P = A : t
    const m = pick(r, [100, 150, 200, 300, 400, 500]);
    const h = pick(r, [4, 5, 6, 8, 10]);
    const t = pick(r, [20, 25, 40, 50, 100]);
    const A = G * m * h;
    const P = A / t;
    const correct = uv(P, 'W');
    return {
      stem: `Một máy bơm đưa ${m} kg nước lên bể chứa cao ${h} m trong ${t} giây. Tính công suất của máy bơm (lấy trọng lượng P = 10·m).`,
      correct,
      numeric: P,
      distractors: ud(
        correct,
        [
          [(m * h) / t, 'W'],
          [A, 'W'],
          [A * t, 'W'],
          [P / 1000, 'W'],
          [(G * m) / t, 'W'],
        ],
        [P, 'W'],
      ),
      solution: `Bước 1 — trọng lượng nước: ${G} × ${m} = ${fmt(G * m)} N. Bước 2 — công của máy bơm: A = ${fmt(G * m)} N × ${h} m = ${fmt(A)} J. Bước 3 — công suất: P = A : t = ${fmt(A)} : ${t} = ${fmt(P)} W. Lỗi hay gặp: quên nhân 10 để đổi kg sang niutơn (ra ${fmt(roundDec((m * h) / t, 4))} W) hoặc quên chia cho thời gian và trả lời luôn công ${fmt(A)}.`,
      steps: [
        `P_trọng lượng = 10 × ${m} = ${fmt(G * m)} N`,
        `A = ${fmt(G * m)} × ${h} = ${fmt(A)} J`,
        `P = A : t = ${fmt(A)} : ${t} = ${fmt(P)} W`,
      ],
      hint: 'Tính công nâng nước trước (nhớ đổi kg ra niutơn), sau đó chia cho thời gian.',
      tags: ['công suất', 'nhiều bước'],
    };
  }

  // lvl 2 — công suất qua lực kéo và tốc độ: P = F · v (bẫy quên đổi km/h ra m/s)
  const vkmh = pick(r, [36, 54, 72, 90]);
  const vms = vkmh / 3.6;
  const F = pick(r, [500, 800, 1000, 1200, 1500, 2000]);
  const P = F * vms;
  const Pkw = P / 1000;
  const correct = uv(Pkw, 'kW');
  return {
    stem: `Một ô tô chuyển động đều với tốc độ ${vkmh} km/h nhờ lực kéo của động cơ có độ lớn ${fmt(F)} N. Tính công suất của động cơ theo đơn vị kW.`,
    correct,
    numeric: Pkw,
    distractors: ud(
      correct,
      [
        [F * vkmh, 'kW'],
        [P, 'kW'],
        [(F * vkmh) / 1000, 'kW'],
        [Pkw / 1000, 'kW'],
        [F / vms, 'kW'],
      ],
      [Pkw, 'kW'],
    ),
    solution: `Trong thời gian t, xe đi được s = v·t nên công A = F·v·t, suy ra công suất P = A : t = F × v. Bước 1 — đổi tốc độ về m/s: ${vkmh} km/h = ${vkmh} : 3,6 = ${fmt(vms)} m/s. Bước 2 — tính công suất: P = ${fmt(F)} N × ${fmt(vms)} m/s = ${fmt(P)} W. Bước 3 — đổi ra kW: ${fmt(P)} W = ${fmt(Pkw)} kW. Bẫy đơn vị: nhân thẳng ${fmt(F)} × ${vkmh} = ${fmt(F * vkmh)} khi tốc độ vẫn tính bằng km/h.`,
    steps: [
      `${vkmh} km/h = ${fmt(vms)} m/s`,
      `P = F × v = ${fmt(F)} × ${fmt(vms)} = ${fmt(P)} W`,
      `P = ${fmt(Pkw)} kW`,
    ],
    hint: 'Công suất của lực kéo khi chuyển động đều bằng F × v, với v tính bằng m/s.',
    tags: ['công suất', 'đổi đơn vị', 'nhiều bước'],
  };
}

// >>>CHUNK2<<<

export const NATURAL_GENERATORS: Record<string, Gen> = {
  gSpeed,
  gDensity,
  gTempConv,
  gWorkPower,
};
