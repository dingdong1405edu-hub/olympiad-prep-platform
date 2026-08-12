/**
 * BỘ SINH SINH HỌC — khối D (lớp 10–12).
 *
 * Bốn bộ sinh: quy luật phân li của Mendel, cấu trúc ADN, di truyền quần thể
 * (Hardy – Weinberg), mã di truyền và protein.
 *
 * ĐẶC THÙ CỦA MÔN SINH: đáp số thường là SỐ NGUYÊN đếm được (số nuclêôtit,
 * số axit amin, số cá thể) nên mọi tham số phải chọn sao cho phép chia luôn
 * hết — một đáp án lẻ ở đây là dấu hiệu đề sai, không phải đề khó.
 *
 * Nhiễu là những lỗi có thật trong bài kiểm tra:
 *  - đảo tỉ lệ 3:1 thành 1:3, dùng 1:2:1 (kiểu gen) cho câu hỏi kiểu hình;
 *  - quên rằng A = T và G = X nên nhân đôi hoặc chia đôi sai;
 *  - quên trừ bộ ba kết thúc và axit amin mở đầu khi tính chuỗi polipeptit;
 *  - cộng thẳng tần số alen thay vì dùng công thức p² + 2pq + q² = 1.
 *
 * File này KHÔNG import gì từ `src/` (tsx không đọc `paths` của tsconfig).
 */
import type { Draft, Gen, GenCtx } from './generators';
import { fmt, nd, pick, pstr, ri, roundDec, td } from './generators';

// ===========================================================================
// TIỆN ÍCH
// ===========================================================================

function uv(v: number, unit: string): string {
  return `${fmt(roundDec(v, 4))} ${unit}`;
}

/**
 * Đáp án môn Sinh phần lớn là SỐ ĐẾM (nuclêôtit, axit amin, cá thể) nên nhiễu
 * bằng 0 hoặc âm là vô nghĩa — học sinh loại ngay mà không cần suy nghĩ, làm
 * câu hỏi mất giá trị phân loại. Vì vậy chỉ giữ các giá trị dương.
 */
function ud(correct: string, cands: [number, string][], pad: [number, string]): string[] {
  const out = td(
    correct,
    cands.filter(([v]) => Number.isFinite(v) && v > 0 && v < 1e12).map(([v, u]) => uv(v, u)),
  );
  for (const k of [2, 0.5, 3, 1.5, 10, 0.1]) {
    if (out.length >= 3) break;
    const t = uv(roundDec(pad[0] * k, 4), pad[1]);
    if (t !== correct && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Cặp tính trạng có thật trong sách giáo khoa, gắn với đối tượng nghiên cứu. */
interface Trait {
  species: string;
  gene: string;
  dom: string;
  rec: string;
}

const TRAITS: Trait[] = [
  { species: 'đậu Hà Lan', gene: 'A', dom: 'hạt vàng', rec: 'hạt xanh' },
  { species: 'đậu Hà Lan', gene: 'B', dom: 'hạt trơn', rec: 'hạt nhăn' },
  { species: 'đậu Hà Lan', gene: 'D', dom: 'thân cao', rec: 'thân thấp' },
  { species: 'đậu Hà Lan', gene: 'E', dom: 'hoa đỏ', rec: 'hoa trắng' },
  { species: 'cà chua', gene: 'A', dom: 'quả đỏ', rec: 'quả vàng' },
  { species: 'ruồi giấm', gene: 'B', dom: 'cánh dài', rec: 'cánh cụt' },
  { species: 'ngô', gene: 'D', dom: 'thân cao', rec: 'thân thấp' },
];

// ===========================================================================
// 1. QUY LUẬT PHÂN LI CỦA MENDEL
// ===========================================================================

function gMendel(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const mode = pstr(ctx, 'mode', 'f2');
  const t = pick(r, TRAITS);
  const g = t.gene;

  if (mode === 'count') {
    // Tổng số cá thể luôn chia hết cho 4 ⇒ số cá thể mỗi nhóm là số nguyên.
    const total = pick(r, [400, 800, 1200, 1600, 2000, 2400, 3200]);
    const dominant = (total / 4) * 3;
    const recessive = total / 4;
    const homoDom = total / 4;

    if (slot % 3 === 2) {
      return {
        stem: `Cho hai cây ${t.species} dị hợp ${g}${g.toLowerCase()} tự thụ phấn, đời con thu được ${total} cây. Theo lý thuyết, số cây có kiểu gen ĐỒNG HỢP TRỘI (${g}${g}) ở đời con là bao nhiêu?`,
        correct: uv(homoDom, 'cây'),
        numeric: homoDom,
        distractors: ud(
          uv(homoDom, 'cây'),
          [
            [dominant, 'cây'],
            [total / 2, 'cây'],
            [total, 'cây'],
            [roundDec(total / 3, 0), 'cây'],
          ],
          [homoDom, 'cây'],
        ),
        solution: `Phép lai ${g}${g.toLowerCase()} × ${g}${g.toLowerCase()} cho tỉ lệ KIỂU GEN là 1 ${g}${g} : 2 ${g}${g.toLowerCase()} : 1 ${g.toLowerCase()}${g.toLowerCase()}. Đồng hợp trội ${g}${g} chiếm 1/4 tổng số, nên có ${total} × 1/4 = ${homoDom} cây. Chú ý phân biệt với KIỂU HÌNH trội (${t.dom}) chiếm 3/4 = ${dominant} cây — câu hỏi này hỏi kiểu gen, không hỏi kiểu hình.`,
        steps: [
          `${g}${g.toLowerCase()} × ${g}${g.toLowerCase()} ⇒ 1 ${g}${g} : 2 ${g}${g.toLowerCase()} : 1 ${g.toLowerCase()}${g.toLowerCase()}`,
          `${g}${g} chiếm 1/4`,
          `Số cây = ${total} × 1/4 = ${homoDom} cây`,
        ],
        hint: 'Tỉ lệ kiểu gen là 1 : 2 : 1, khác với tỉ lệ kiểu hình 3 : 1.',
        tags: ['di truyền Mendel', 'kiểu gen'],
      };
    }

    const askRecessive = slot % 3 === 1;
    const want = askRecessive ? recessive : dominant;
    return {
      stem: `Cho hai cây ${t.species} dị hợp ${g}${g.toLowerCase()} (${t.dom}) tự thụ phấn, đời con thu được ${total} cây. Theo lý thuyết, số cây có kiểu hình ${askRecessive ? t.rec : t.dom} là bao nhiêu?`,
      correct: uv(want, 'cây'),
      numeric: want,
      distractors: ud(
        uv(want, 'cây'),
        [
          [askRecessive ? dominant : recessive, 'cây'],
          [total / 2, 'cây'],
          [roundDec(total / 3, 0), 'cây'],
          [total, 'cây'],
        ],
        [want, 'cây'],
      ),
      solution: `Phép lai ${g}${g.toLowerCase()} × ${g}${g.toLowerCase()} cho đời con tỉ lệ kiểu hình 3 ${t.dom} : 1 ${t.rec}, tức ${t.dom} chiếm 3/4 và ${t.rec} chiếm 1/4. Với ${total} cây: số cây ${askRecessive ? t.rec : t.dom} = ${total} × ${askRecessive ? '1/4' : '3/4'} = ${want} cây. Đảo ngược hai tỉ lệ (trả lời ${askRecessive ? dominant : recessive}) là lỗi phổ biến nhất — nhớ rằng tính trạng LẶN chỉ biểu hiện khi có đủ hai alen lặn nên luôn là nhóm ít hơn.`,
      steps: [
        `${g}${g.toLowerCase()} × ${g}${g.toLowerCase()} ⇒ 3 ${t.dom} : 1 ${t.rec}`,
        `${askRecessive ? t.rec : t.dom} chiếm ${askRecessive ? '1/4' : '3/4'}`,
        `Số cây = ${total} × ${askRecessive ? '1/4' : '3/4'} = ${want} cây`,
      ],
      hint: 'Kiểu hình lặn chiếm 1/4, kiểu hình trội chiếm 3/4 — nhóm lặn luôn nhỏ hơn.',
      tags: ['di truyền Mendel', 'tỉ lệ phân li'],
    };
  }

  // --- mode = 'f2': tỉ lệ kiểu hình đời F2 ---
  // Lai hai cặp tính trạng — chỉ dựng được khi loài đó có sẵn cặp tính trạng
  // thứ hai trong bảng; nếu không, rơi xuống các biến thể một cặp bên dưới.
  const pairMates = TRAITS.filter((x) => x.gene !== g && x.species === t.species);
  if (lvl === 2 && slot % 3 === 2 && pairMates.length > 0) {
    const t2 = pick(r, pairMates);
    const correct = '9 : 3 : 3 : 1';
    return {
      stem: `Cho cây ${t.species} thuần chủng ${t.dom}, ${t2.dom} lai với cây thuần chủng ${t.rec}, ${t2.rec}. Hai cặp gen phân li độc lập. Cho F₁ tự thụ phấn, tỉ lệ kiểu hình ở F₂ là bao nhiêu?`,
      correct,
      distractors: td(correct, ['3 : 1', '1 : 2 : 1', '9 : 3 : 1 : 3', '1 : 1 : 1 : 1', '3 : 3 : 1 : 1']),
      solution: `F₁ dị hợp cả hai cặp gen (${g}${g.toLowerCase()}${t2.gene}${t2.gene.toLowerCase()}). Vì hai cặp gen phân li ĐỘC LẬP nên tỉ lệ F₂ bằng tích của hai tỉ lệ riêng: (3 trội : 1 lặn) × (3 trội : 1 lặn) = 9 (trội, trội) : 3 (trội, lặn) : 3 (lặn, trội) : 1 (lặn, lặn). Tổng 9 + 3 + 3 + 1 = 16 phần, khớp với 16 tổ hợp giao tử của phép lai. Trả lời 3 : 1 là quên rằng đề xét HAI cặp tính trạng cùng lúc.`,
      steps: [
        `F₁ dị hợp hai cặp: ${g}${g.toLowerCase()}${t2.gene}${t2.gene.toLowerCase()}`,
        `Phân li độc lập ⇒ nhân hai tỉ lệ (3:1) × (3:1)`,
        `F₂ = 9 : 3 : 3 : 1`,
      ],
      hint: 'Hai cặp tính trạng phân li độc lập thì NHÂN hai tỉ lệ 3 : 1 với nhau.',
      tags: ['di truyền Mendel', 'phân li độc lập'],
    };
  }

  if (slot % 3 === 1) {
    const correct = `1 ${g}${g} : 2 ${g}${g.toLowerCase()} : 1 ${g.toLowerCase()}${g.toLowerCase()}`;
    return {
      stem: `Cho cây ${t.species} thuần chủng ${t.dom} (${g}${g}) lai với cây thuần chủng ${t.rec} (${g.toLowerCase()}${g.toLowerCase()}). Cho F₁ tự thụ phấn. Tỉ lệ KIỂU GEN ở F₂ là bao nhiêu?`,
      correct,
      distractors: td(correct, [
        `3 ${g}${g} : 1 ${g.toLowerCase()}${g.toLowerCase()}`,
        `1 ${g}${g} : 1 ${g.toLowerCase()}${g.toLowerCase()}`,
        `2 ${g}${g} : 1 ${g}${g.toLowerCase()} : 1 ${g.toLowerCase()}${g.toLowerCase()}`,
        `1 ${g}${g} : 3 ${g}${g.toLowerCase()}`,
        `1 ${g}${g} : 2 ${g.toLowerCase()}${g.toLowerCase()} : 1 ${g}${g.toLowerCase()}`,
      ]),
      solution: `P: ${g}${g} × ${g.toLowerCase()}${g.toLowerCase()} cho F₁ đồng loạt ${g}${g.toLowerCase()}. F₁ tự thụ: ${g}${g.toLowerCase()} × ${g}${g.toLowerCase()}. Mỗi cây F₁ cho hai loại giao tử ${g} và ${g.toLowerCase()} với tỉ lệ ngang nhau, kẻ khung Punnett 2×2 được bốn tổ hợp: ${g}${g}, ${g}${g.toLowerCase()}, ${g}${g.toLowerCase()}, ${g.toLowerCase()}${g.toLowerCase()} — tức ${correct}. Đây là tỉ lệ KIỂU GEN; tỉ lệ KIỂU HÌNH tương ứng là 3 ${t.dom} : 1 ${t.rec} vì ${g}${g} và ${g}${g.toLowerCase()} biểu hiện giống nhau.`,
      steps: [
        `P: ${g}${g} × ${g.toLowerCase()}${g.toLowerCase()} ⇒ F₁: 100% ${g}${g.toLowerCase()}`,
        `F₁ × F₁: giao tử ${g} và ${g.toLowerCase()} tỉ lệ 1 : 1`,
        `Khung Punnett ⇒ ${correct}`,
      ],
      hint: 'Kẻ khung Punnett 2×2; dị hợp xuất hiện ở hai ô nên chiếm 2 phần.',
      tags: ['di truyền Mendel', 'kiểu gen', 'khung Punnett'],
    };
  }

  const correct = `3 ${t.dom} : 1 ${t.rec}`;
  return {
    stem: `Cho cây ${t.species} thuần chủng ${t.dom} lai với cây thuần chủng ${t.rec}, biết ${t.dom} là tính trạng trội hoàn toàn. Cho F₁ tự thụ phấn. Tỉ lệ kiểu hình ở F₂ là bao nhiêu?`,
    correct,
    distractors: td(correct, [
      `1 ${t.dom} : 3 ${t.rec}`,
      `1 ${t.dom} : 1 ${t.rec}`,
      `1 ${t.dom} : 2 ${t.rec} : 1 ${t.dom}`,
      `100% ${t.dom}`,
      `9 ${t.dom} : 7 ${t.rec}`,
    ]),
    solution: `P thuần chủng ${g}${g} × ${g.toLowerCase()}${g.toLowerCase()} cho F₁ toàn ${g}${g.toLowerCase()}, biểu hiện ${t.dom} vì đây là tính trạng trội hoàn toàn. F₁ tự thụ phấn (${g}${g.toLowerCase()} × ${g}${g.toLowerCase()}) cho F₂ gồm 1 ${g}${g} : 2 ${g}${g.toLowerCase()} : 1 ${g.toLowerCase()}${g.toLowerCase()}. Ba kiểu gen đầu đều có ít nhất một alen trội nên biểu hiện ${t.dom}; chỉ ${g.toLowerCase()}${g.toLowerCase()} biểu hiện ${t.rec}. Vậy tỉ lệ kiểu hình là ${correct}. Đảo thành 1 : 3 là lỗi hay gặp — tính trạng lặn luôn là nhóm THIỂU SỐ ở F₂.`,
    steps: [
      `F₁: 100% ${g}${g.toLowerCase()} (${t.dom})`,
      `F₂ kiểu gen: 1 ${g}${g} : 2 ${g}${g.toLowerCase()} : 1 ${g.toLowerCase()}${g.toLowerCase()}`,
      `Gộp kiểu hình ⇒ ${correct}`,
    ],
    hint: 'Chỉ kiểu gen đồng hợp lặn mới biểu hiện tính trạng lặn, nên nhóm lặn chiếm 1/4.',
    tags: ['di truyền Mendel', 'tỉ lệ kiểu hình'],
  };
}

// ===========================================================================
// 2. CẤU TRÚC ADN
// ===========================================================================

function gDnaCount(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const mode = pstr(ctx, 'mode', 'total');
  // Chiều dài gen luôn là bội của 3,4 Å ⇒ số nuclêôtit là số nguyên chẵn.
  const pairs = pick(r, [600, 900, 1200, 1500, 1800, 2100, 2400, 3000]);
  const N = pairs * 2;
  const length = roundDec(pairs * 3.4, 1);

  if (mode === 'base') {
    // A chiếm một tỉ lệ đẹp của tổng số nuclêôtit ⇒ mọi loại đều nguyên.
    const pctA = pick(r, [10, 15, 20, 25, 30]);
    const A = (N * pctA) / 100;
    const T = A;
    const G = N / 2 - A;
    const X = G;

    if (slot % 2 === 1) {
      return {
        stem: `Một gen có ${N} nuclêôtit, trong đó nuclêôtit loại A chiếm ${pctA}% tổng số. Tính số nuclêôtit loại G của gen.`,
        correct: uv(G, 'nuclêôtit'),
        numeric: G,
        distractors: ud(
          uv(G, 'nuclêôtit'),
          [
            [N - A, 'nuclêôtit'],
            [A, 'nuclêôtit'],
            [roundDec(N / 2 - 2 * A, 0), 'nuclêôtit'],
            [2 * G, 'nuclêôtit'],
          ],
          [G, 'nuclêôtit'],
        ),
        solution: `Bước 1 — số nuclêôtit loại A: A = ${N} × ${pctA}% = ${A}. Theo nguyên tắc bổ sung A liên kết với T nên T = A = ${T}. Bước 2 — tổng bốn loại bằng N: A + T + G + X = ${N}. Vì G = X nên 2G = ${N} − 2×${A} = ${N - 2 * A}, suy ra G = ${G} nuclêôtit. Công thức rút gọn hay dùng: G = N/2 − A = ${N / 2} − ${A} = ${G}. Lỗi hay gặp là lấy ${N} − ${A} = ${N - A}, tức quên rằng A còn kéo theo T bằng chính nó.`,
        steps: [`A = ${N} × ${pctA}% = ${A}`, `T = A = ${T} (nguyên tắc bổ sung)`, `G = X = (${N} − 2×${A}) : 2 = ${G}`],
        hint: 'Nhớ A = T và G = X; tổng bốn loại bằng N nên A + G = N/2.',
        tags: ['ADN', 'nguyên tắc bổ sung', 'nhiều bước'],
      };
    }

    return {
      stem: `Một gen có ${N} nuclêôtit, trong đó nuclêôtit loại A chiếm ${pctA}% tổng số. Tính số nuclêôtit loại T của gen.`,
      correct: uv(T, 'nuclêôtit'),
      numeric: T,
      distractors: ud(
        uv(T, 'nuclêôtit'),
        [
          [G, 'nuclêôtit'],
          [N / 2 - A, 'nuclêôtit'],
          [2 * A, 'nuclêôtit'],
          [N - A, 'nuclêôtit'],
        ],
        [T, 'nuclêôtit'],
      ),
      solution: `Số nuclêôtit loại A = ${N} × ${pctA}% = ${A}. Theo NGUYÊN TẮC BỔ SUNG trong phân tử ADN mạch kép, A luôn liên kết với T bằng hai liên kết hiđro, nên số lượng hai loại này bằng nhau: T = A = ${T} nuclêôtit. Hệ quả: G = X = ${G}, kiểm tra lại ${A} + ${T} + ${G} + ${X} = ${N} — đúng bằng tổng đã cho.`,
      steps: [`A = ${N} × ${pctA}% = ${A}`, `Nguyên tắc bổ sung: A = T`, `T = ${T} nuclêôtit`],
      hint: 'A luôn bắt cặp với T nên hai loại này có số lượng bằng nhau.',
      tags: ['ADN', 'nguyên tắc bổ sung'],
    };
  }

  // --- mode = 'total': tổng số nuclêôtit ---
  if (lvl >= 1 && slot % 3 === 2) {
    // Cho số liên kết hiđro và số A — bài tổng hợp của phần cấu trúc ADN.
    const A2 = pick(r, [200, 300, 400, 500, 600]);
    const G2 = pick(r, [150, 250, 350, 450]);
    const H = 2 * A2 + 3 * G2;
    const N2 = 2 * (A2 + G2);
    return {
      stem: `Một gen có ${A2} nuclêôtit loại A và tổng số liên kết hiđro là ${H}. Tính tổng số nuclêôtit của gen.`,
      correct: uv(N2, 'nuclêôtit'),
      numeric: N2,
      distractors: ud(
        uv(N2, 'nuclêôtit'),
        [
          [A2 + G2, 'nuclêôtit'],
          [roundDec(H / 2, 0), 'nuclêôtit'],
          [2 * (A2 + roundDec((H - 2 * A2) / 2, 0)), 'nuclêôtit'],
          [H - A2, 'nuclêôtit'],
        ],
        [N2, 'nuclêôtit'],
      ),
      solution: `Mỗi cặp A–T có 2 liên kết hiđro, mỗi cặp G–X có 3 liên kết, nên H = 2A + 3G. Thay số: ${H} = 2×${A2} + 3G, suy ra 3G = ${H} − ${2 * A2} = ${H - 2 * A2}, tức G = ${G2}. Tổng số nuclêôtit: N = 2(A + G) = 2 × (${A2} + ${G2}) = ${N2}. Quên nhân 2 ở bước cuối sẽ ra ${A2 + G2} — đó mới là số nuclêôtit của MỘT mạch, còn gen có hai mạch.`,
      steps: [`H = 2A + 3G`, `3G = ${H} − ${2 * A2} = ${H - 2 * A2} ⇒ G = ${G2}`, `N = 2(A + G) = ${N2} nuclêôtit`],
      hint: 'Cặp A–T có 2 liên kết hiđro, cặp G–X có 3; tổng nuclêôtit bằng 2(A + G).',
      tags: ['ADN', 'liên kết hiđro', 'nhiều bước'],
    };
  }

  return {
    stem: `Một gen có chiều dài ${fmt(length)} Å (angstrom). Tính tổng số nuclêôtit của gen. Biết mỗi cặp nuclêôtit dài 3,4 Å.`,
    correct: uv(N, 'nuclêôtit'),
    numeric: N,
    distractors: ud(
      uv(N, 'nuclêôtit'),
      [
        [pairs, 'nuclêôtit'],
        [roundDec(length * 3.4, 0), 'nuclêôtit'],
        [roundDec(length / 3.4 / 2, 0), 'nuclêôtit'],
        [roundDec(length * 2, 0), 'nuclêôtit'],
      ],
      [N, 'nuclêôtit'],
    ),
    solution: `Bước 1 — số CẶP nuclêôtit bằng chiều dài chia cho 3,4 Å: ${fmt(length)} : 3,4 = ${pairs} cặp. Bước 2 — ADN là mạch KÉP, mỗi cặp gồm 2 nuclêôtit, nên tổng số nuclêôtit N = ${pairs} × 2 = ${N}. Quên nhân 2 ở bước cuối (trả lời ${pairs}) là lỗi phổ biến nhất của dạng bài này — chiều dài gen chỉ đo theo trục nên tương ứng với số cặp, không phải số nuclêôtit.`,
    steps: [`Số cặp = ${fmt(length)} : 3,4 = ${pairs}`, `Mạch kép ⇒ N = 2 × số cặp`, `N = ${N} nuclêôtit`],
    hint: 'Chiều dài chia 3,4 ra số CẶP; nhân thêm 2 mới ra tổng nuclêôtit.',
    tags: ['ADN', 'chiều dài gen'],
  };
}

// ===========================================================================
// 3. DI TRUYỀN QUẦN THỂ — HARDY – WEINBERG
// ===========================================================================

function gHardyWeinberg(ctx: GenCtx): Draft {
  const { r, slot } = ctx;
  const mode = pstr(ctx, 'mode', 'freq');
  const t = pick(r, TRAITS);
  const g = t.gene;
  const lo = g.toLowerCase();

  if (mode === 'geno') {
    // p chọn trước dạng số đẹp ⇒ p², 2pq, q² đều là số thập phân gọn.
    const p = pick(r, [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
    const q = roundDec(1 - p, 4);
    const pp = roundDec(p * p, 4);
    const pq = roundDec(2 * p * q, 4);
    const qq = roundDec(q * q, 4);

    if (slot % 2 === 1) {
      return {
        stem: `Một quần thể ${t.species} ở trạng thái cân bằng di truyền có tần số alen ${g} là ${fmt(p)}. Tính tần số kiểu gen DỊ HỢP ${g}${lo} của quần thể.`,
        correct: fmt(pq),
        numeric: pq,
        distractors: nd(pq, [roundDec(p * q, 4), pp, qq, roundDec(p + q, 4), roundDec(pq / 2, 4), roundDec(1 - pq, 4)], true),
        solution: `Tần số alen ${lo} là q = 1 − ${fmt(p)} = ${fmt(q)}. Ở trạng thái cân bằng, cấu trúc di truyền của quần thể tuân theo công thức Hardy – Weinberg: p²(${g}${g}) + 2pq(${g}${lo}) + q²(${lo}${lo}) = 1. Tần số dị hợp là 2pq = 2 × ${fmt(p)} × ${fmt(q)} = ${fmt(pq)}. Quên hệ số 2 (trả lời ${fmt(roundDec(p * q, 4))}) là lỗi phổ biến nhất — hệ số 2 xuất hiện vì kiểu gen ${g}${lo} tạo được theo hai cách: nhận ${g} từ bố hoặc từ mẹ.`,
        steps: [`q = 1 − ${fmt(p)} = ${fmt(q)}`, `Dị hợp = 2pq`, `2 × ${fmt(p)} × ${fmt(q)} = ${fmt(pq)}`],
        hint: 'Tần số dị hợp là 2pq — đừng quên hệ số 2.',
        tags: ['di truyền quần thể', 'Hardy – Weinberg'],
      };
    }

    return {
      stem: `Một quần thể ${t.species} ở trạng thái cân bằng di truyền có tần số alen ${g} là ${fmt(p)}. Tính tần số kiểu gen đồng hợp lặn ${lo}${lo} của quần thể.`,
      correct: fmt(qq),
      numeric: qq,
      distractors: nd(qq, [q, pp, pq, roundDec(1 - qq, 4), roundDec(q * 2, 4), roundDec(p * q, 4)], true),
      solution: `Tần số alen ${lo}: q = 1 − p = 1 − ${fmt(p)} = ${fmt(q)}. Theo công thức Hardy – Weinberg, tần số kiểu gen đồng hợp lặn bằng q² = ${fmt(q)}² = ${fmt(qq)}. Kiểm tra tổng: p² + 2pq + q² = ${fmt(pp)} + ${fmt(pq)} + ${fmt(qq)} = 1 — đúng. Trả lời thẳng ${fmt(q)} là nhầm giữa tần số ALEN và tần số KIỂU GEN: mỗi cá thể ${lo}${lo} phải nhận alen lặn từ CẢ HAI bố mẹ nên xác suất phải bình phương.`,
      steps: [`q = 1 − ${fmt(p)} = ${fmt(q)}`, `Đồng hợp lặn = q²`, `q² = ${fmt(qq)}`],
      hint: 'Tần số kiểu gen đồng hợp bằng BÌNH PHƯƠNG tần số alen.',
      tags: ['di truyền quần thể', 'Hardy – Weinberg'],
    };
  }

  // --- mode = 'freq': tính tần số alen ---
  if (slot % 3 === 2) {
    // Từ tỉ lệ kiểu hình lặn suy ngược ra tần số alen — dạng thi phổ biến nhất.
    const q = pick(r, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    const qq = roundDec(q * q, 4);
    const p = roundDec(1 - q, 4);
    const pctRec = roundDec(qq * 100, 2);
    return {
      stem: `Một quần thể ${t.species} ở trạng thái cân bằng di truyền có ${fmt(pctRec)}% cá thể mang kiểu hình ${t.rec} (kiểu gen ${lo}${lo}). Tính tần số alen ${g} của quần thể.`,
      correct: fmt(p),
      numeric: p,
      distractors: nd(p, [q, roundDec(1 - qq, 4), qq, roundDec(p * p, 4), roundDec(1 - q / 2, 4), roundDec(2 * q, 4)], true),
      solution: `Bước 1 — kiểu hình lặn chỉ do kiểu gen ${lo}${lo}, nên q² = ${fmt(pctRec)}% = ${fmt(qq)}. Bước 2 — KHAI CĂN để ra tần số alen lặn: q = √${fmt(qq)} = ${fmt(q)}. Bước 3 — tổng hai tần số alen bằng 1: p = 1 − ${fmt(q)} = ${fmt(p)}. Lỗi nặng nhất là lấy thẳng 1 − ${fmt(qq)} = ${fmt(roundDec(1 - qq, 4))}, tức quên bước khai căn và trộn lẫn tần số kiểu gen với tần số alen.`,
      steps: [`q² = ${fmt(qq)}`, `q = √${fmt(qq)} = ${fmt(q)}`, `p = 1 − q = ${fmt(p)}`],
      hint: 'Tỉ lệ kiểu hình lặn chính là q²; phải khai căn mới ra tần số alen.',
      tags: ['di truyền quần thể', 'Hardy – Weinberg', 'nhiều bước'],
    };
  }

  // Đếm alen trực tiếp từ số cá thể mỗi kiểu gen — cách hiểu gốc của tần số alen.
  const nAA = pick(r, [100, 200, 300, 400, 500]);
  const nAa = pick(r, [200, 300, 400, 600]);
  const naa = pick(r, [100, 150, 200, 300]);
  const total = nAA + nAa + naa;
  const p2 = roundDec((2 * nAA + nAa) / (2 * total), 4);
  return {
    stem: `Một quần thể ${t.species} gồm ${nAA} cá thể ${g}${g}, ${nAa} cá thể ${g}${lo} và ${naa} cá thể ${lo}${lo}. Tính tần số alen ${g} của quần thể.`,
    correct: fmt(p2),
    numeric: p2,
    distractors: nd(
      p2,
      [
        roundDec(nAA / total, 4),
        roundDec((nAA + nAa) / total, 4),
        roundDec(1 - p2, 4),
        roundDec((2 * nAA + nAa) / total, 4),
        roundDec(nAa / total, 4),
        roundDec(p2 * p2, 4),
      ],
      true,
    ),
    solution: `Mỗi cá thể lưỡng bội mang HAI alen, nên quần thể ${total} cá thể có tổng cộng 2 × ${total} = ${2 * total} alen. Số alen ${g}: cá thể ${g}${g} góp 2 alen mỗi con (${nAA} × 2 = ${2 * nAA}), cá thể ${g}${lo} góp 1 alen mỗi con (${nAa}), cá thể ${lo}${lo} không góp alen nào. Tổng = ${2 * nAA} + ${nAa} = ${2 * nAA + nAa}. Tần số alen ${g} = ${2 * nAA + nAa} : ${2 * total} = ${fmt(p2)}. Chia cho ${total} thay vì ${2 * total} (ra ${fmt(roundDec((2 * nAA + nAa) / total, 4))}) là lỗi hay gặp — tần số alen luôn nằm trong khoảng 0 đến 1.`,
    steps: [
      `Tổng alen = 2 × ${total} = ${2 * total}`,
      `Số alen ${g} = 2×${nAA} + ${nAa} = ${2 * nAA + nAa}`,
      `p = ${2 * nAA + nAa} : ${2 * total} = ${fmt(p2)}`,
    ],
    hint: 'Cá thể dị hợp chỉ góp MỘT alen trội; mẫu số là gấp đôi số cá thể.',
    tags: ['di truyền quần thể', 'tần số alen'],
  };
}

// ===========================================================================
// 4. MÃ DI TRUYỀN VÀ PROTEIN
// ===========================================================================

function gProtein(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const mode = pstr(ctx, 'mode', 'codon');
  // N luôn chia hết cho 6 ⇒ số bộ ba là số nguyên.
  const codons = pick(r, [100, 150, 200, 250, 300, 400, 500]);
  const N = codons * 6;
  const aaInChain = codons - 2; // trừ bộ ba mở đầu và bộ ba kết thúc
  const aaEnv = codons - 1; // số axit amin môi trường cung cấp

  if (mode === 'aa') {
    if (slot % 3 === 2 && lvl > 0) {
      // Số liên kết peptit = số axit amin − 1 (bài toán "trồng cây thẳng hàng").
      const bonds = aaInChain - 1;
      return {
        stem: `Một chuỗi polipeptit hoàn chỉnh có ${aaInChain} axit amin. Tính số liên kết peptit có trong chuỗi đó.`,
        correct: uv(bonds, 'liên kết'),
        numeric: bonds,
        distractors: ud(
          uv(bonds, 'liên kết'),
          [
            [aaInChain, 'liên kết'],
            [aaInChain + 1, 'liên kết'],
            [2 * aaInChain, 'liên kết'],
            [roundDec(aaInChain / 2, 0), 'liên kết'],
          ],
          [bonds, 'liên kết'],
        ),
        solution: `Các axit amin nối với nhau thành chuỗi, mỗi liên kết peptit nằm GIỮA hai axit amin liền kề. Với ${aaInChain} axit amin xếp thành một hàng thì có ${aaInChain} − 1 = ${aaInChain - 1} chỗ nối. Đây chính là bài toán "trồng cây thẳng hàng": số khoảng luôn ít hơn số cây đúng một đơn vị. Trả lời ${aaInChain} là quên trừ 1.`,
        steps: [`Số liên kết peptit = số axit amin − 1`, `= ${aaInChain} − 1 = ${aaInChain - 1} liên kết`],
        hint: 'Số chỗ nối luôn ít hơn số axit amin đúng một đơn vị.',
        tags: ['protein', 'liên kết peptit'],
      };
    }

    if (slot % 3 === 1) {
      return {
        stem: `Một gen có ${N} nuclêôtit thực hiện tổng hợp một chuỗi polipeptit. Tính số axit amin mà môi trường nội bào phải cung cấp cho quá trình dịch mã.`,
        correct: uv(aaEnv, 'axit amin'),
        numeric: aaEnv,
        distractors: ud(
          uv(aaEnv, 'axit amin'),
          [
            [codons, 'axit amin'],
            [aaInChain, 'axit amin'],
            [roundDec(N / 3, 0), 'axit amin'],
            [codons + 1, 'axit amin'],
          ],
          [aaEnv, 'axit amin'],
        ),
        solution: `Bước 1 — số bộ ba trên mARN: gen ${N} nuclêôtit mạch kép có ${N / 2} nuclêôtit trên mạch mã gốc, chia cho 3 được ${codons} bộ ba. Bước 2 — bộ ba KẾT THÚC không mã hóa axit amin nào, nên số axit amin môi trường cung cấp là ${codons} − 1 = ${aaEnv}. Phân biệt kỹ với số axit amin trong chuỗi HOÀN CHỈNH (${aaInChain}) — chuỗi hoàn chỉnh còn bị cắt bỏ thêm axit amin mở đầu sau khi dịch mã xong.`,
        steps: [
          `Số bộ ba = ${N} : 2 : 3 = ${codons}`,
          `Trừ bộ ba kết thúc: ${codons} − 1 = ${aaEnv}`,
          `Môi trường cung cấp ${aaEnv} axit amin`,
        ],
        hint: 'Bộ ba kết thúc không mã hóa axit amin; axit amin mở đầu vẫn được cung cấp.',
        tags: ['protein', 'dịch mã', 'nhiều bước'],
      };
    }

    return {
      stem: `Một gen có ${N} nuclêôtit. Tính số axit amin của chuỗi polipeptit HOÀN CHỈNH được tổng hợp từ gen đó.`,
      correct: uv(aaInChain, 'axit amin'),
      numeric: aaInChain,
      distractors: ud(
        uv(aaInChain, 'axit amin'),
        [
          [codons, 'axit amin'],
          [aaEnv, 'axit amin'],
          [roundDec(N / 3, 0), 'axit amin'],
          [roundDec(N / 6 + 1, 0), 'axit amin'],
        ],
        [aaInChain, 'axit amin'],
      ),
      solution: `Bước 1 — gen mạch kép ${N} nuclêôtit thì mạch mã gốc có ${N / 2} nuclêôtit; cứ 3 nuclêôtit mã hóa một bộ ba nên có ${N / 2} : 3 = ${codons} bộ ba. Bước 2 — trừ bộ ba KẾT THÚC (không mã hóa axit amin) và axit amin MỞ ĐẦU (bị cắt bỏ ở chuỗi hoàn chỉnh): ${codons} − 2 = ${aaInChain} axit amin. Chia ${N} cho 3 mà quên chia đôi trước sẽ ra ${roundDec(N / 3, 0)} — gấp đôi đáp án đúng, vì gen có HAI mạch nhưng chỉ một mạch làm khuôn.`,
      steps: [
        `Mạch mã gốc = ${N} : 2 = ${N / 2} nuclêôtit`,
        `Số bộ ba = ${N / 2} : 3 = ${codons}`,
        `Chuỗi hoàn chỉnh = ${codons} − 2 = ${aaInChain} axit amin`,
      ],
      hint: 'Chia đôi trước (gen có 2 mạch), chia 3 sau, rồi trừ 2 cho bộ ba kết thúc và axit amin mở đầu.',
      tags: ['protein', 'dịch mã', 'nhiều bước'],
    };
  }

  // --- mode = 'codon': số bộ ba mã hóa ---
  if (slot % 3 === 2) {
    const correct = '64 bộ ba';
    return {
      stem: `Mã di truyền được đọc theo từng bộ ba nuclêôtit. Với 4 loại nuclêôtit A, U, G, X, tổng số bộ ba có thể tạo ra trên phân tử mARN là bao nhiêu?`,
      correct,
      distractors: td(correct, ['12 bộ ba', '16 bộ ba', '61 bộ ba', '24 bộ ba', '81 bộ ba']),
      solution: `Mỗi vị trí trong bộ ba đều có thể là một trong 4 loại nuclêôtit, ba vị trí độc lập nhau nên theo quy tắc nhân: 4 × 4 × 4 = 4³ = 64 bộ ba. Trong đó có 3 bộ ba kết thúc không mã hóa axit amin, nên số bộ ba MÃ HÓA axit amin là 61 — đó là lý do phương án 61 rất dễ chọn nhầm nếu đọc lướt đề. Trả lời 12 là nhầm phép nhân 4 × 3 thay vì lũy thừa.`,
      steps: ['Mỗi vị trí có 4 lựa chọn', '3 vị trí độc lập ⇒ 4³', '4³ = 64 bộ ba'],
      hint: 'Ba vị trí, mỗi vị trí 4 lựa chọn — dùng quy tắc nhân, không phải phép cộng.',
      tags: ['mã di truyền', 'quy tắc nhân'],
    };
  }

  return {
    stem: `Một gen có ${N} nuclêôtit. Tính số bộ ba mã hóa (côđon) trên phân tử mARN được phiên mã từ gen đó.`,
    correct: uv(codons, 'bộ ba'),
    numeric: codons,
    distractors: ud(
      uv(codons, 'bộ ba'),
      [
        [roundDec(N / 3, 0), 'bộ ba'],
        [codons - 1, 'bộ ba'],
        [roundDec(N / 2, 0), 'bộ ba'],
        [codons * 2, 'bộ ba'],
      ],
      [codons, 'bộ ba'],
    ),
    solution: `Phân tử mARN được phiên mã từ MỘT mạch của gen (mạch mã gốc), nên số nuclêôtit của mARN bằng ${N} : 2 = ${N / 2}. Mã di truyền đọc theo bộ ba nên số côđon = ${N / 2} : 3 = ${codons}. Quên chia đôi (lấy ${N} : 3 = ${roundDec(N / 3, 0)}) là lỗi phổ biến nhất — gen có hai mạch nhưng chỉ một mạch được dùng làm khuôn phiên mã.`,
    steps: [`mARN = ${N} : 2 = ${N / 2} nuclêôtit`, `Số côđon = ${N / 2} : 3`, `= ${codons} bộ ba`],
    hint: 'Chỉ một mạch của gen được phiên mã — chia đôi trước rồi mới chia 3.',
    tags: ['mã di truyền', 'phiên mã'],
  };
}

export const BIOLOGY_GENERATORS: Record<string, Gen> = {
  gMendel,
  gDnaCount,
  gHardyWeinberg,
  gProtein,
};
