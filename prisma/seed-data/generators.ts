/**
 * SINH NGÂN HÀNG CÂU HỎI BẰNG THUẬT TOÁN.
 *
 * NGUYÊN TẮC BẤT DI BẤT DỊCH:
 *  1. Mọi câu hỏi phải ĐÚNG TOÁN HỌC. Đáp án và lời giải luôn được TÍNH RA từ chính
 *     tham số vừa sinh — không có chỗ nào viết đáp án bằng tay rồi đoán.
 *  2. Ngẫu nhiên nhưng CÓ HẠT GIỐNG CỐ ĐỊNH (mulberry32 + hash của mã kỹ năng) →
 *     chạy lại seed bao nhiêu lần cũng ra đúng bộ câu hỏi đó.
 *  3. Phương án nhiễu xuất phát từ LỖI SAI THƯỜNG GẶP (quên quy đồng, sai dấu, sai
 *     thứ tự phép tính, quên chia 100, quên +1 khi đếm...), không phải số ngẫu nhiên.
 *  4. Đáp án đúng nằm ở vị trí NGẪU NHIÊN trong 4 phương án.
 *  5. Toàn bộ kho này là DỮ LIỆU DEMO — `sourceNote` ghi rõ không phải đề thi thật.
 *
 * File này KHÔNG import gì từ `src/` (tsx không đọc `paths` của tsconfig).
 */
import type { Difficulty, ItemStatus, QuestionType } from '@prisma/client';
import type { ChapterSeed, SkillSeed, TaxonomySeed } from './taxonomy.js';

// ===========================================================================
// 1. BỘ SINH SỐ NGẪU NHIÊN CÓ HẠT GIỐNG
// ===========================================================================

export type Rng = () => number;

/** mulberry32 — PRNG 32 bit gọn, nhanh, tái lập được 100%. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32 bit — biến chuỗi thành hạt giống ổn định. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Số nguyên ngẫu nhiên trong [lo, hi]. */
function ri(r: Rng, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return lo + Math.floor(r() * (hi - lo + 1));
}

function pick<T>(r: Rng, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

function shuffle<T>(r: Rng, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

// ===========================================================================
// 2. TIỆN ÍCH SỐ HỌC (mọi đáp án đều đi qua đây)
// ===========================================================================

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function lcm(a: number, b: number): number {
  return Math.abs(a * b) / gcd(a, b);
}

/** Định dạng số theo kiểu Việt Nam: dấu phẩy thập phân, không nhóm hàng nghìn. */
function fmt(x: number): string {
  const rounded = Math.round(x * 10000) / 10000;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded).replace('.', ',');
}

/** Bọc số âm trong ngoặc khi ghép vào biểu thức: 5 + (-3). */
function par(x: number): string {
  return x < 0 ? `(${x})` : String(x);
}

// --- phân số chính xác tuyệt đối (không dùng số thực) ---
interface Frac {
  n: number;
  d: number;
}

function frac(n: number, d = 1): Frac {
  if (d === 0) throw new Error('Mẫu số bằng 0');
  let nn = n;
  let dd = d;
  if (dd < 0) {
    nn = -nn;
    dd = -dd;
  }
  const g = gcd(nn, dd);
  return { n: nn / g, d: dd / g };
}

function fAdd(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}
function fSub(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d - b.n * a.d, a.d * b.d);
}
function fMul(a: Frac, b: Frac): Frac {
  return frac(a.n * b.n, a.d * b.d);
}
function fDiv(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d, a.d * b.n);
}
function fStr(f: Frac): string {
  if (f.d === 1) return String(f.n);
  return `${f.n}/${f.d}`;
}
function fNum(f: Frac): number {
  return f.n / f.d;
}
/** Phân số CHƯA rút gọn — dùng làm phương án nhiễu "quên rút gọn". */
function rawStr(n: number, d: number): string {
  if (d < 0) return `${-n}/${-d}`;
  return d === 1 ? String(n) : `${n}/${d}`;
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false;
  return true;
}

function primesBetween(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let i = Math.max(2, lo); i <= hi; i++) if (isPrime(i)) out.push(i);
  return out;
}

function compositesBetween(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let i = Math.max(4, lo); i <= hi; i++) if (!isPrime(i)) out.push(i);
  return out;
}

function divisorsOf(n: number): number[] {
  const out: number[] = [];
  for (let i = 1; i * i <= n; i++) {
    if (n % i === 0) {
      out.push(i);
      if (i !== n / i) out.push(n / i);
    }
  }
  return out.sort((a, b) => a - b);
}

/** Phân tích ra thừa số nguyên tố: 360 → [[2,3],[3,2],[5,1]] */
function factorize(n: number): [number, number][] {
  const out: [number, number][] = [];
  let m = n;
  for (let p = 2; p * p <= m; p++) {
    let e = 0;
    while (m % p === 0) {
      m /= p;
      e++;
    }
    if (e) out.push([p, e]);
  }
  if (m > 1) out.push([m, 1]);
  return out;
}

function factorStr(n: number): string {
  return factorize(n)
    .map(([p, e]) => (e === 1 ? String(p) : `${p}^${e}`))
    .join(' · ');
}

/** Đếm số ước từ dạng phân tích: ∏(e+1). */
function divisorCount(n: number): number {
  return factorize(n).reduce((acc, [, e]) => acc * (e + 1), 1);
}

/** Làm tròn tới hàng `place` (10, 100, 1000...) theo quy tắc ≥5 làm tròn lên. */
function roundTo(n: number, place: number): number {
  return Math.round(n / place) * place;
}

/** Làm tròn tới `k` chữ số thập phân, tính bằng số nguyên để tránh sai số dấu phẩy động. */
function roundDec(value: number, k: number): number {
  const p = Math.pow(10, k);
  return Math.round(value * p + Number.EPSILON * Math.sign(value) * p) / p;
}

// ===========================================================================
// 3. KIỂU DỮ LIỆU CÂU HỎI
// ===========================================================================

export interface ItemOption {
  key: string;
  text: string;
}

export interface GeneratedItem {
  itemCode: string;
  chapterCode: string;
  skillCode: string;
  difficulty: Difficulty;
  difficultyNumeric: number;
  questionType: QuestionType;
  stem: string;
  options: ItemOption[];
  correctAnswer: unknown;
  answerTolerance: number | null;
  solution: string;
  solutionSteps: string[];
  hint: string;
  estimatedTime: number;
  tags: string[];
  status: ItemStatus;
  publishedAt: Date | null;
}

/**
 * Bản nháp do generator trả về. Bộ khung sẽ tự lo phần trộn phương án,
 * chọn loại câu, gán độ khó, thời gian chuẩn và trạng thái duyệt bài.
 */
export interface Draft {
  stem: string;
  /** Đáp án đúng dạng chuỗi hiển thị. */
  correct: string;
  /** Ứng viên phương án nhiễu, xếp theo mức độ "dễ mắc bẫy" giảm dần. */
  distractors: string[];
  solution: string;
  steps: string[];
  hint: string;
  tags: string[];
  /** Có giá trị ⇒ câu này có thể chuyển sang dạng điền số (options rỗng). */
  numeric?: number;
  kind?: 'choice' | 'multi' | 'short';
  /** kind = 'multi': các phát biểu ĐÚNG (cần đúng 2). */
  correctTexts?: string[];
  /** kind = 'multi': các phát biểu SAI. */
  wrongTexts?: string[];
  /** kind = 'short': đáp án chuẩn dạng chuỗi. */
  shortAnswer?: string;
}

export interface GenCtx {
  r: Rng;
  d: Difficulty;
  /** 0 = Trung bình, 1 = Khá, 2 = Giỏi. */
  lvl: number;
  /** Thứ tự câu trong kỹ năng — dùng để đổi dạng đề, tránh 15 câu giống hệt. */
  slot: number;
  params: Record<string, string | number>;
}

type Gen = (ctx: GenCtx) => Draft;

const DIFFICULTIES: Difficulty[] = ['AVERAGE', 'GOOD', 'EXCELLENT'];
const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  AVERAGE: 'Trung bình',
  GOOD: 'Khá',
  EXCELLENT: 'Giỏi',
};

function pnum(ctx: GenCtx, key: string, def: number): number {
  const v = ctx.params[key];
  return typeof v === 'number' ? v : def;
}
function pstr(ctx: GenCtx, key: string, def: string): string {
  const v = ctx.params[key];
  return typeof v === 'string' ? v : def;
}
/** Hệ số thu nhỏ thang số khi tái sử dụng generator cho khối nhỏ hơn. */
function sc(ctx: GenCtx): number {
  return pnum(ctx, 'scale', 1);
}

// ===========================================================================
// 4. DỰNG PHƯƠNG ÁN & DỰNG CÂU HỎI HOÀN CHỈNH
// ===========================================================================

const KEYS = ['A', 'B', 'C', 'D'];

function buildChoices(
  r: Rng,
  correct: string,
  candidates: string[],
  numericHint?: number,
): { options: ItemOption[]; correctKey: string } {
  const picked: string[] = [];
  for (const c of candidates) {
    if (c === correct || picked.includes(c)) continue;
    picked.push(c);
    if (picked.length === 3) break;
  }
  /** Thêm một nhiễu nếu chưa trùng đáp án và chưa có trong danh sách. */
  const add = (text: string): void => {
    if (text && text !== correct && !picked.includes(text)) picked.push(text);
  };

  // ---- Đệm an toàn, chỉ chạy khi generator không cấp đủ 3 nhiễu khác nhau ----
  // Bộ sinh nào cũng nên tự cấp >= 4 ứng viên; phần dưới đây là lưới an toàn để
  // một biến thể hiếm gặp không làm sập cả lượt nạp dữ liệu.

  if (picked.length < 3 && numericHint !== undefined) {
    for (const delta of [1, -1, 2, -2, 5, -5, 10, -10]) {
      if (picked.length >= 3) break;
      add(fmt(numericHint + delta));
    }
  }

  // Đáp án dạng phân số a/b: nhiễu là các sai lệch có thật khi làm bài —
  // lệch tử, lệch mẫu, hoặc đảo ngược phân số.
  if (picked.length < 3) {
    const frac = /^(-?\d+)\/(\d+)$/.exec(correct.trim());
    if (frac) {
      const a = Number(frac[1]);
      const b = Number(frac[2]);
      for (const cand of [
        `${a + 1}/${b}`,
        `${a - 1}/${b}`,
        `${b}/${a}`,
        `${a}/${b + 1}`,
        `${a}/${Math.max(1, b - 1)}`,
        `${a * 2}/${b}`,
      ]) {
        if (picked.length >= 3) break;
        add(cand);
      }
    }
  }

  // Đáp án dạng "số + đơn vị" (kể cả số thập phân kiểu Việt Nam dùng dấu phẩy):
  // giữ nguyên đơn vị, chỉ xê dịch phần số.
  if (picked.length < 3) {
    const withUnit = /^(-?[\d.,]+)(\s*\D.*)?$/.exec(correct.trim());
    if (withUnit) {
      const raw = withUnit[1]!.replace(/\./g, '').replace(',', '.');
      const base = Number(raw);
      const unit = withUnit[2] ?? '';
      if (Number.isFinite(base)) {
        for (const factor of [1.1, 0.9, 2, 0.5, 10, 0.1]) {
          if (picked.length >= 3) break;
          const v = base * factor;
          const rounded = Math.abs(v) < 1 ? Math.round(v * 1000) / 1000 : Math.round(v * 100) / 100;
          add(`${fmt(rounded)}${unit}`);
        }
      }
    }
  }

  if (picked.length < 3) {
    throw new Error(`Không đủ phương án nhiễu cho đáp án "${correct}"`);
  }
  const all = shuffle(r, [correct, ...picked]);
  const options = all.map((text, i) => ({ key: KEYS[i], text }));
  return { options, correctKey: KEYS[all.indexOf(correct)] };
}

const TIME_RANGE: Record<Difficulty, [number, number]> = {
  AVERAGE: [45, 75],
  GOOD: [85, 130],
  EXCELLENT: [140, 210],
};
const DNUM_RANGE: Record<Difficulty, [number, number]> = {
  AVERAGE: [2, 4],
  GOOD: [5, 7],
  EXCELLENT: [8, 10],
};

/**
 * Phân bổ trạng thái workflow biên soạn (specs §5.3): ~90% PUBLISHED, 7% DRAFT,
 * 3% REVIEWED — để màn hình duyệt bài của admin có dữ liệu thật thao tác.
 * Dựa trên hash mã câu ⇒ ổn định giữa các lần chạy, không phụ thuộc thứ tự.
 */
function statusOf(itemCode: string, allPublished: boolean): ItemStatus {
  if (allPublished) return 'PUBLISHED';
  const roll = (hashSeed(`status:${itemCode}`) % 1000) / 1000;
  if (roll < 0.9) return 'PUBLISHED';
  if (roll < 0.97) return 'DRAFT';
  return 'REVIEWED';
}

function buildItem(
  draft: Draft,
  ctx: GenCtx,
  itemCode: string,
  chapter: ChapterSeed,
  skill: SkillSeed,
  allPublished: boolean,
  publishedAt: Date,
): GeneratedItem {
  const { r, d, slot } = ctx;
  let questionType: QuestionType = 'SINGLE_CHOICE';
  let options: ItemOption[] = [];
  let correctAnswer: unknown;
  let answerTolerance: number | null = null;

  if (draft.kind === 'multi') {
    const corrects = draft.correctTexts ?? [];
    const wrongs = (draft.wrongTexts ?? []).filter((w) => !corrects.includes(w));
    if (corrects.length < 2 || wrongs.length < 2) {
      throw new Error(`Câu nhiều đáp án ${itemCode} thiếu phương án`);
    }
    const chosen = shuffle(r, [corrects[0], corrects[1], wrongs[0], wrongs[1]]);
    options = chosen.map((text, i) => ({ key: KEYS[i], text }));
    correctAnswer = options
      .filter((o) => corrects.includes(o.text))
      .map((o) => o.key)
      .sort();
    questionType = 'MULTIPLE_CHOICE';
  } else if (draft.kind === 'short') {
    questionType = 'SHORT_ANSWER';
    correctAnswer = draft.shortAnswer ?? draft.correct;
  } else if (draft.numeric !== undefined && slot % 5 === 2) {
    // ~20% số câu có đáp án là số được chuyển sang dạng điền số
    questionType = 'NUMERIC';
    correctAnswer = draft.numeric;
    answerTolerance = Number.isInteger(draft.numeric) ? null : 0.01;
  } else {
    const built = buildChoices(r, draft.correct, draft.distractors, draft.numeric);
    options = built.options;
    correctAnswer = built.correctKey;
  }

  const [tLo, tHi] = TIME_RANGE[d];
  const [nLo, nHi] = DNUM_RANGE[d];
  let estimatedTime = ri(r, tLo, tHi);
  if (questionType === 'MULTIPLE_CHOICE' || questionType === 'SHORT_ANSWER') estimatedTime += 25;
  else if (questionType === 'NUMERIC') estimatedTime += 10;

  const status = statusOf(itemCode, allPublished);

  return {
    itemCode,
    chapterCode: chapter.code,
    skillCode: skill.code,
    difficulty: d,
    difficultyNumeric: ri(r, nLo, nHi),
    questionType,
    stem: draft.stem,
    options,
    correctAnswer,
    answerTolerance,
    solution: draft.solution,
    solutionSteps: draft.steps,
    hint: draft.hint,
    estimatedTime,
    tags: [chapter.code.toLowerCase(), skill.code.toLowerCase(), DIFFICULTY_LABEL[d], ...draft.tags],
    status,
    publishedAt: status === 'PUBLISHED' ? publishedAt : null,
  };
}

/** Kiểm tra sau khi dựng — bug trong generator phải nổ ngay chứ không lọt vào DB. */
function assertValid(item: GeneratedItem): void {
  const where = `[${item.itemCode}]`;
  if (!item.stem.trim()) throw new Error(`${where} thiếu đề bài`);
  if (!item.solution.trim()) throw new Error(`${where} thiếu lời giải`);
  if (item.solutionSteps.length === 0) throw new Error(`${where} thiếu các bước giải`);
  if (item.questionType === 'SINGLE_CHOICE') {
    if (item.options.length !== 4) throw new Error(`${where} phải có đúng 4 phương án`);
    const texts = new Set(item.options.map((o) => o.text));
    if (texts.size !== 4) throw new Error(`${where} có phương án trùng nhau`);
    if (!item.options.some((o) => o.key === item.correctAnswer)) {
      throw new Error(`${where} đáp án đúng không nằm trong phương án`);
    }
  }
  if (item.questionType === 'MULTIPLE_CHOICE') {
    const keys = item.correctAnswer as string[];
    if (!Array.isArray(keys) || keys.length < 2) throw new Error(`${where} thiếu đáp án đúng`);
  }
  if (item.questionType === 'NUMERIC' && typeof item.correctAnswer !== 'number') {
    throw new Error(`${where} câu điền số nhưng đáp án không phải số`);
  }
  if (item.estimatedTime < 20 || item.estimatedTime > 300) {
    throw new Error(`${where} thời gian chuẩn bất thường: ${item.estimatedTime}`);
  }
}

// ===========================================================================
// 5. ĐIỂM VÀO: SINH CÂU HỎI CHO CẢ TAXONOMY
// ===========================================================================

/** Số câu mỗi kỹ năng: taxonomy chi tiết 12–18 (bội của 3), tối giản 3–5. */
function itemCountFor(tax: TaxonomySeed, skillIndex: number): number {
  if (tax.detailed) return [12, 15, 18][skillIndex % 3];
  return [4, 3, 5, 4][skillIndex % 4];
}

export interface SkillItems {
  chapterCode: string;
  skillCode: string;
  items: GeneratedItem[];
}

/**
 * Dấu vân tay của một câu hỏi, dùng để phát hiện trùng lặp trong cùng kỹ năng.
 * Gồm đề bài và toàn bộ phần đáp án đúng — hai câu chỉ thật sự trùng nhau khi
 * cả hỏi lẫn đáp đều giống hệt.
 */
function fingerprint(draft: Draft): string {
  const multi = draft.correctTexts ? [...draft.correctTexts].sort().join('|') : '';
  return `${draft.stem}⟂${draft.correct}⟂${multi}`;
}

/**
 * Registry được TIÊM TỪ NGOÀI thay vì cố định trong file này: bộ sinh câu được
 * tách thành nhiều file theo nhóm chương, `generators-all.ts` gom lại rồi truyền
 * vào đây. Nhờ vậy thêm chương mới không phải sửa bộ khung.
 */
export function generateForTaxonomy(
  tax: TaxonomySeed,
  publishedAt: Date,
  registry: Record<string, Gen>,
): SkillItems[] {
  const out: SkillItems[] = [];
  let skillIndex = 0;
  for (const chapter of tax.chapters) {
    for (const skill of chapter.skills) {
      const genKey = skill.gen ?? skill.code;
      const gen = registry[genKey];
      if (!gen) throw new Error(`Thiếu generator "${genKey}" cho kỹ năng ${tax.prefix}-${skill.code}`);

      const count = itemCountFor(tax, skillIndex);
      const r = mulberry32(hashSeed(`${tax.prefix}:${skill.code}:v1`));
      const items: GeneratedItem[] = [];
      const seen = new Set<string>();

      for (let slot = 0; slot < count; slot++) {
        const d = DIFFICULTIES[slot % 3];
        const ctx: GenCtx = { r, d, lvl: slot % 3, slot, params: skill.genParams ?? {} };
        let draft: Draft | null = null;
        // Tránh sinh trùng đề trong cùng một kỹ năng (không gian tham số hữu hạn).
        // Dấu vân tay là ĐỀ BÀI + ĐÁP ÁN chứ không chỉ đề bài: nhiều câu hỏi có
        // phần dẫn cố định ("Số nào sau đây là số nguyên tố?") nhưng bộ số và
        // đáp án khác hẳn nhau — với học sinh đó là những câu hoàn toàn khác.
        for (let attempt = 0; attempt < 25; attempt++) {
          const candidate = gen(ctx);
          if (!seen.has(fingerprint(candidate))) {
            draft = candidate;
            break;
          }
        }
        if (!draft) continue; // hết biến thể → bỏ qua slot, không tạo câu trùng
        seen.add(fingerprint(draft));

        const itemCode = `${tax.prefix}-${skill.code}-${String(slot + 1).padStart(5, '0')}`;
        const item = buildItem(draft, ctx, itemCode, chapter, skill, !tax.detailed, publishedAt);
        assertValid(item);
        items.push(item);
      }

      out.push({ chapterCode: chapter.code, skillCode: skill.code, items });
      skillIndex++;
    }
  }
  return out;
}

// ===========================================================================
// 6. CÁC GENERATOR THEO KỸ NĂNG
// ===========================================================================

/** Lọc danh sách phương án nhiễu dạng số: bỏ trùng, bỏ giá trị bằng đáp án. */
function nd(correct: number, cands: number[], allowFraction = false): string[] {
  const out: string[] = [];
  for (const c of cands) {
    if (!Number.isFinite(c)) continue;
    if (!allowFraction && !Number.isInteger(c)) continue;
    if (Math.abs(c - correct) < 1e-9) continue;
    const t = fmt(c);
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** Lọc phương án nhiễu dạng chuỗi. */
function td(correct: string, cands: string[]): string[] {
  const out: string[] = [];
  for (const c of cands) {
    if (c === correct || out.includes(c)) continue;
    out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chương SET — Tập hợp và số tự nhiên
// ---------------------------------------------------------------------------

function SET01(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const a = ri(r, 3, 14);
  const b = a + ri(r, 6, 11);
  let cond: (x: number) => boolean;
  let label: string;
  let rule: string;
  if (lvl === 0) {
    cond = (x) => x >= a && x <= b;
    label = `A = {x ∈ ℕ | ${a} ≤ x ≤ ${b}}`;
    rule = `A gồm mọi số tự nhiên từ ${a} đến ${b}, lấy CẢ hai đầu mút.`;
  } else if (lvl === 1) {
    cond = (x) => x > a && x < b && x % 2 === 0;
    label = `A = {x ∈ ℕ | ${a} < x < ${b} và x là số chẵn}`;
    rule = `A gồm các số CHẴN nằm giữa ${a} và ${b}, KHÔNG lấy hai đầu mút.`;
  } else {
    cond = (x) => x >= a && x <= b && x % 3 === 0;
    label = `A = {x ∈ ℕ | ${a} ≤ x ≤ ${b} và x chia hết cho 3}`;
    rule = `A gồm các số chia hết cho 3 trong đoạn từ ${a} đến ${b}.`;
  }
  const inSet: number[] = [];
  const outSet: number[] = [];
  for (let x = Math.max(0, a - 4); x <= b + 4; x++) (cond(x) ? inSet : outSet).push(x);
  const correct = pick(r, inSet);
  // Nhiễu = các số GẦN NHẤT không thỏa mãn ⇒ đúng kiểu lỗi "quên điều kiện", "lấy nhầm đầu mút"
  const distractors = outSet
    .slice()
    .sort((p, q) => Math.abs(p - correct) - Math.abs(q - correct))
    .slice(0, 6)
    .map(fmt);
  return {
    stem: `Cho tập hợp ${label}. Số nào sau đây là phần tử của A?`,
    correct: fmt(correct),
    numeric: correct,
    distractors,
    solution: `${rule} Liệt kê: A = {${inSet.join('; ')}}. Vì ${correct} có mặt trong danh sách nên ${correct} ∈ A. Các số còn lại đều không thỏa mãn điều kiện nên không thuộc A.`,
    steps: [
      `Đọc kỹ điều kiện: ${rule}`,
      `Liệt kê đầy đủ các phần tử: A = {${inSet.join('; ')}}`,
      `Đối chiếu từng phương án với danh sách trên → chọn ${correct}`,
    ],
    hint: 'Hãy liệt kê hẳn các phần tử của A ra giấy rồi mới đối chiếu với từng phương án.',
    tags: ['tập hợp', 'kí hiệu thuộc'],
  };
}

function SET02(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  if (lvl === 0) {
    const a = ri(r, 5, 40);
    const b = a + ri(r, 12, 60);
    let count = 0;
    for (let x = a; x <= b; x++) count++;
    return {
      stem: `Tập hợp A = {x ∈ ℕ | ${a} ≤ x ≤ ${b}} có bao nhiêu phần tử?`,
      correct: fmt(count),
      numeric: count,
      distractors: nd(count, [b - a, b - a + 2, b, a + b]),
      solution: `Số phần tử của tập hợp các số tự nhiên liên tiếp từ ${a} đến ${b} bằng (số cuối − số đầu) + 1 = ${b} − ${a} + 1 = ${count}. Lỗi hay gặp là quên cộng thêm 1 và trả lời ${b - a}.`,
      steps: [
        `Đây là các số tự nhiên liên tiếp từ ${a} đến ${b}`,
        `Số phần tử = số cuối − số đầu + 1 = ${b} − ${a} + 1`,
        `Kết quả: ${count} phần tử`,
      ],
      hint: 'Đếm số tự nhiên liên tiếp thì phải cộng thêm 1: từ 1 đến 5 có 5 số chứ không phải 4.',
      tags: ['đếm phần tử'],
    };
  }
  if (lvl === 1) {
    const a = ri(r, 8, 40);
    const b = a + ri(r, 20, 70);
    const members: number[] = [];
    for (let x = a; x <= b; x++) if (x % 2 === 0) members.push(x);
    const count = members.length;
    return {
      stem: `Tập hợp B = {x ∈ ℕ | ${a} ≤ x ≤ ${b} và x là số chẵn} có bao nhiêu phần tử?`,
      correct: fmt(count),
      numeric: count,
      distractors: nd(count, [b - a + 1, count - 1, count + 1, Math.floor((b - a) / 2)]),
      solution: `Phần tử nhỏ nhất là ${members[0]}, lớn nhất là ${members[count - 1]}, hai số chẵn liên tiếp cách nhau 2 đơn vị. Số phần tử = (${members[count - 1]} − ${members[0]}) : 2 + 1 = ${count}.`,
      steps: [
        `Số chẵn nhỏ nhất trong đoạn: ${members[0]}`,
        `Số chẵn lớn nhất trong đoạn: ${members[count - 1]}`,
        `Số phần tử = (số cuối − số đầu) : khoảng cách + 1 = (${members[count - 1]} − ${members[0]}) : 2 + 1 = ${count}`,
      ],
      hint: 'Các số chẵn tạo thành dãy cách đều với khoảng cách 2, dùng công thức đếm dãy cách đều.',
      tags: ['đếm phần tử', 'dãy cách đều'],
    };
  }
  const d = ri(r, 3, 7);
  const a = ri(r, 4, 20);
  const b = a + d * ri(r, 8, 25);
  const members: number[] = [];
  for (let x = a; x <= b; x += d) members.push(x);
  const count = members.length;
  return {
    stem: `Cho tập hợp C = {${members.slice(0, 3).join('; ')}; ...; ${members[count - 1]}} trong đó hai phần tử liên tiếp hơn kém nhau ${d} đơn vị. Tập hợp C có bao nhiêu phần tử?`,
    correct: fmt(count),
    numeric: count,
    distractors: nd(count, [count - 1, (b - a) / d, count + 1, Math.floor(b / d)]),
    solution: `Dãy cách đều có số đầu ${a}, số cuối ${b}, khoảng cách ${d}. Số phần tử = (${b} − ${a}) : ${d} + 1 = ${(b - a) / d} + 1 = ${count}.`,
    steps: [
      `Xác định số đầu ${a}, số cuối ${b}, khoảng cách ${d}`,
      `Hiệu số đầu và số cuối: ${b} − ${a} = ${b - a}`,
      `Số phần tử = ${b - a} : ${d} + 1 = ${count}`,
    ],
    hint: 'Công thức đếm dãy cách đều: (số cuối − số đầu) : khoảng cách + 1.',
    tags: ['đếm phần tử', 'dãy cách đều'],
  };
}

function SET03(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  if (lvl === 2) {
    const a = ri(r, 1200, 8900);
    const b = ri(r, 1200, 8900);
    const ra = roundTo(a, 100);
    const rb = roundTo(b, 100);
    const val = ra + rb;
    return {
      stem: `Làm tròn mỗi số ${a} và ${b} đến hàng trăm rồi tính tổng hai số đã làm tròn. Kết quả bằng bao nhiêu?`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [a + b, roundTo(a + b, 100), ra + b, Math.floor(a / 100) * 100 + Math.floor(b / 100) * 100]),
      solution: `${a} làm tròn đến hàng trăm được ${ra} (xét chữ số hàng chục). ${b} làm tròn đến hàng trăm được ${rb}. Tổng hai số đã làm tròn: ${ra} + ${rb} = ${val}. Lưu ý đề yêu cầu làm tròn TRƯỚC rồi mới cộng, nên kết quả có thể khác với tổng thật ${a + b}.`,
      steps: [
        `Làm tròn ${a} đến hàng trăm: ${ra}`,
        `Làm tròn ${b} đến hàng trăm: ${rb}`,
        `Cộng hai kết quả: ${ra} + ${rb} = ${val}`,
      ],
      hint: 'Làm tròn từng số trước, cộng sau — đừng cộng rồi mới làm tròn.',
      tags: ['làm tròn', 'ước lượng'],
    };
  }
  const place = lvl === 0 ? 10 : 100;
  const placeName = lvl === 0 ? 'hàng chục' : 'hàng trăm';
  const n = lvl === 0 ? ri(r, 120, 989) : ri(r, 1230, 9870);
  const val = roundTo(n, place);
  const truncated = Math.floor(n / place) * place;
  const up = Math.ceil(n / place) * place;
  return {
    stem: `Làm tròn số ${n} đến ${placeName}.`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [truncated, up, roundTo(n, place * 10), val + place]),
    solution: `Để làm tròn ${n} đến ${placeName}, ta nhìn chữ số ở hàng liền sau ${placeName}. Chữ số đó là ${Math.floor((n % place) / (place / 10))}; vì ${Math.floor((n % place) / (place / 10)) >= 5 ? 'lớn hơn hoặc bằng 5 nên làm tròn LÊN' : 'nhỏ hơn 5 nên giữ nguyên và bỏ các chữ số phía sau'}. Kết quả: ${val}.`,
    steps: [
      `Xác định chữ số đứng ngay sau ${placeName}: ${Math.floor((n % place) / (place / 10))}`,
      `So sánh chữ số đó với 5`,
      `Kết luận: ${n} ≈ ${val}`,
    ],
    hint: 'Chữ số ngay sau hàng cần làm tròn: từ 5 trở lên thì tăng thêm 1, nhỏ hơn 5 thì giữ nguyên.',
    tags: ['làm tròn'],
  };
}

function SET04(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const k = sc(ctx);
  if (lvl === 0) {
    const a = ri(r, 5, Math.round(60 * k) + 5);
    const b = ri(r, 2, 12);
    const c = ri(r, 2, 9);
    const val = a + b * c;
    return {
      stem: `Tính giá trị của biểu thức: ${a} + ${b} × ${c}`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [(a + b) * c, a + b + c, a * b + c, a * b * c]),
      solution: `Trong biểu thức chỉ có phép cộng và phép nhân thì phải NHÂN TRƯỚC, CỘNG SAU. Ta có ${b} × ${c} = ${b * c}, sau đó ${a} + ${b * c} = ${val}. Nếu cộng trước rồi nhân sẽ ra ${(a + b) * c} — đó là lỗi sai thứ tự phép tính.`,
      steps: [`Nhân trước: ${b} × ${c} = ${b * c}`, `Cộng sau: ${a} + ${b * c} = ${val}`],
      hint: 'Không có ngoặc thì nhân chia làm trước, cộng trừ làm sau.',
      tags: ['thứ tự phép tính'],
    };
  }
  if (lvl === 1) {
    const a = ri(r, 3, 12);
    const b = ri(r, 4, 20);
    const c = ri(r, 3, 18);
    const dd = ri(r, 2, 9);
    const e = ri(r, 2, 9);
    const val = a * (b + c) - dd * e;
    return {
      stem: `Tính giá trị của biểu thức: ${a} × (${b} + ${c}) − ${dd} × ${e}`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [a * b + c - dd * e, a * (b + c - dd) * e, a * (b + c) - dd + e, (a * (b + c) - dd) * e]),
      solution: `Làm trong ngoặc trước: ${b} + ${c} = ${b + c}. Sau đó nhân: ${a} × ${b + c} = ${a * (b + c)} và ${dd} × ${e} = ${dd * e}. Cuối cùng trừ: ${a * (b + c)} − ${dd * e} = ${val}.`,
      steps: [
        `Trong ngoặc: ${b} + ${c} = ${b + c}`,
        `Nhân: ${a} × ${b + c} = ${a * (b + c)}; ${dd} × ${e} = ${dd * e}`,
        `Trừ: ${a * (b + c)} − ${dd * e} = ${val}`,
      ],
      hint: 'Thứ tự: ngoặc → nhân chia → cộng trừ.',
      tags: ['thứ tự phép tính', 'dấu ngoặc'],
    };
  }
  // Mức Giỏi: có ngoặc lồng, có phép chia hết và nhiều bước hơn
  const dd = ri(r, 3, 9);
  const q = ri(r, 6, 25);
  const b = ri(r, 3, 12);
  const c = ri(r, 2, 9);
  const a = dd * q - b * c; // đảm bảo (a + b×c) chia hết cho dd
  const e = ri(r, 4, 30);
  const val = (a + b * c) / dd - e;
  return {
    stem: `Tính giá trị của biểu thức: (${a} + ${b} × ${c}) : ${dd} − ${e}`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [
      ((a + b) * c) / dd - e,
      (a + b * c) / dd + e,
      a + (b * c) / dd - e,
      (a + b * c) / (dd - e),
    ]),
    solution: `Bước 1 — trong ngoặc, nhân trước: ${b} × ${c} = ${b * c}, rồi ${a} + ${b * c} = ${a + b * c}. Bước 2 — chia: ${a + b * c} : ${dd} = ${(a + b * c) / dd}. Bước 3 — trừ: ${(a + b * c) / dd} − ${e} = ${val}.`,
    steps: [
      `Trong ngoặc nhân trước: ${b} × ${c} = ${b * c}`,
      `Trong ngoặc cộng: ${a} + ${b * c} = ${a + b * c}`,
      `Chia: ${a + b * c} : ${dd} = ${(a + b * c) / dd}`,
      `Trừ: ${(a + b * c) / dd} − ${e} = ${val}`,
    ],
    hint: 'Ngoặc trước, trong ngoặc vẫn phải theo thứ tự nhân chia trước cộng trừ sau.',
    tags: ['thứ tự phép tính', 'dấu ngoặc', 'nhiều bước'],
  };
}

// ---------------------------------------------------------------------------
// Chương POW — Lũy thừa với số mũ tự nhiên
// ---------------------------------------------------------------------------

function POW01(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  if (lvl === 0) {
    const a = ri(r, 2, 6);
    const n = ri(r, 2, 4);
    const val = Math.pow(a, n);
    return {
      stem: `Tính giá trị của lũy thừa ${a}^${n}.`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [a * n, Math.pow(a, n - 1), Math.pow(a, n + 1), Math.pow(n, a)]),
      solution: `${a}^${n} nghĩa là nhân ${n} thừa số ${a} với nhau: ${Array(n).fill(a).join(' × ')} = ${val}. Lỗi hay gặp là lấy cơ số nhân với số mũ và trả lời ${a * n}.`,
      steps: [`Viết dạng tích: ${a}^${n} = ${Array(n).fill(a).join(' × ')}`, `Nhân lần lượt: kết quả ${val}`],
      hint: 'Lũy thừa là phép nhân lặp lại, không phải phép nhân cơ số với số mũ.',
      tags: ['lũy thừa'],
    };
  }
  if (lvl === 1) {
    const a = ri(r, 2, 5);
    const n = ri(r, 3, 6);
    const val = Math.pow(a, n);
    return {
      stem: `Tìm số tự nhiên x, biết ${a}^x = ${val}.`,
      correct: fmt(n),
      numeric: n,
      distractors: nd(n, [val / a, n + 1, n - 1, val - a]),
      solution: `Phân tích ${val} thành tích các thừa số ${a}: ${val} = ${Array(n).fill(a).join(' × ')} = ${a}^${n}. Vậy ${a}^x = ${a}^${n} nên x = ${n}.`,
      steps: [
        `Chia liên tiếp ${val} cho ${a} đến khi được 1`,
        `Số lần chia chính là số mũ: ${n}`,
        `Kết luận x = ${n}`,
      ],
      hint: `Hãy chia ${val} cho ${a} nhiều lần và đếm số lần chia.`,
      tags: ['lũy thừa', 'tìm số mũ'],
    };
  }
  const a = ri(r, 2, 5);
  const m = ri(r, 3, 5);
  const b = ri(r, 2, 6);
  const n = ri(r, 2, 3);
  const val = Math.pow(a, m) - Math.pow(b, n);
  return {
    stem: `Tính giá trị của biểu thức ${a}^${m} − ${b}^${n}.`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [
      a * m - b * n,
      Math.pow(a, m) + Math.pow(b, n),
      Math.pow(a - b, m - n),
      Math.pow(b, n) - Math.pow(a, m),
    ]),
    solution: `Tính từng lũy thừa trước: ${a}^${m} = ${Math.pow(a, m)} và ${b}^${n} = ${Math.pow(b, n)}. Sau đó trừ: ${Math.pow(a, m)} − ${Math.pow(b, n)} = ${val}. Không được trừ cơ số rồi trừ số mũ.`,
    steps: [
      `${a}^${m} = ${Math.pow(a, m)}`,
      `${b}^${n} = ${Math.pow(b, n)}`,
      `Hiệu: ${Math.pow(a, m)} − ${Math.pow(b, n)} = ${val}`,
    ],
    hint: 'Tính giá trị từng lũy thừa rồi mới thực hiện phép trừ.',
    tags: ['lũy thừa', 'nhiều bước'],
  };
}

function POW02(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const a = ri(r, 2, 9);
  if (lvl === 0) {
    const m = ri(r, 2, 7);
    const n = ri(r, 2, 7);
    const correct = `${a}^${m + n}`;
    return {
      stem: `Viết kết quả của phép tính ${a}^${m} × ${a}^${n} dưới dạng một lũy thừa.`,
      correct,
      distractors: td(correct, [
        `${a}^${m * n}`,
        `${a * a}^${m + n}`,
        `${a}^${Math.abs(m - n)}`,
        `${a * a}^${m * n}`,
      ]),
      solution: `Nhân hai lũy thừa CÙNG CƠ SỐ thì giữ nguyên cơ số và CỘNG các số mũ: ${a}^${m} × ${a}^${n} = ${a}^(${m} + ${n}) = ${correct}. Hai lỗi hay gặp là nhân số mũ (ra ${a}^${m * n}) hoặc nhân cả cơ số (ra ${a * a}^${m + n}).`,
      steps: [`Cùng cơ số ${a} nên giữ nguyên cơ số`, `Cộng số mũ: ${m} + ${n} = ${m + n}`, `Kết quả: ${correct}`],
      hint: 'Nhân lũy thừa cùng cơ số: giữ cơ số, cộng số mũ.',
      tags: ['lũy thừa', 'nhân lũy thừa'],
    };
  }
  if (lvl === 1) {
    const m = ri(r, 4, 9);
    const n = ri(r, 3, 8);
    const k = ri(r, 2, Math.min(6, m + n - 2));
    const correct = `${a}^${m + n - k}`;
    return {
      stem: `Viết kết quả của phép tính ${a}^${m} × ${a}^${n} : ${a}^${k} dưới dạng một lũy thừa.`,
      correct,
      distractors: td(correct, [
        `${a}^${m + n + k}`,
        `${a}^${m * n - k}`,
        `${a}^${m + n}`,
        `${a}^${Math.abs(m - n - k)}`,
      ]),
      solution: `Cùng cơ số ${a}: nhân thì cộng số mũ, chia thì trừ số mũ. Số mũ kết quả là ${m} + ${n} − ${k} = ${m + n - k}, nên kết quả là ${correct}.`,
      steps: [
        `Nhân: ${a}^${m} × ${a}^${n} = ${a}^${m + n}`,
        `Chia: ${a}^${m + n} : ${a}^${k} = ${a}^(${m + n} − ${k})`,
        `Kết quả: ${correct}`,
      ],
      hint: 'Nhân thì cộng số mũ, chia thì trừ số mũ — cơ số luôn giữ nguyên.',
      tags: ['lũy thừa', 'chia lũy thừa'],
    };
  }
  const m = ri(r, 2, 5);
  const n = ri(r, 2, 4);
  const k = ri(r, 2, m * n - 2);
  const correct = `${a}^${m * n - k}`;
  return {
    stem: `Viết kết quả của phép tính (${a}^${m})^${n} : ${a}^${k} dưới dạng một lũy thừa.`,
    correct,
    distractors: td(correct, [
      `${a}^${m + n - k}`,
      `${a}^${m * n + k}`,
      `${a}^${m * n}`,
      `${a}^${m * n * k}`,
    ]),
    solution: `Lũy thừa của lũy thừa thì NHÂN các số mũ: (${a}^${m})^${n} = ${a}^${m * n}. Sau đó chia cho ${a}^${k} nên trừ số mũ: ${m * n} − ${k} = ${m * n - k}. Kết quả là ${correct}. Bẫy ở đây là cộng số mũ thành ${a}^${m + n - k}.`,
    steps: [
      `(${a}^${m})^${n} = ${a}^(${m} × ${n}) = ${a}^${m * n}`,
      `Chia: ${a}^${m * n} : ${a}^${k} = ${a}^(${m * n} − ${k})`,
      `Kết quả: ${correct}`,
    ],
    hint: '(a^m)^n = a^(m·n) — nhân số mũ, khác với a^m · a^n = a^(m+n).',
    tags: ['lũy thừa', 'lũy thừa của lũy thừa'],
  };
}

function POW03(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  if (lvl === 0) {
    const a = ri(r, 3, 12);
    const b = ri(r, 2, 12);
    const c = ri(r, 2, 9);
    const val = a * a + b * c;
    return {
      stem: `Tính giá trị của biểu thức ${a}^2 + ${b} × ${c}.`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [a * 2 + b * c, (a * a + b) * c, a * a + b + c, a * a * b * c]),
      solution: `Tính lũy thừa trước: ${a}^2 = ${a * a}. Rồi nhân: ${b} × ${c} = ${b * c}. Cuối cùng cộng: ${a * a} + ${b * c} = ${val}.`,
      steps: [`${a}^2 = ${a * a}`, `${b} × ${c} = ${b * c}`, `Cộng: ${a * a} + ${b * c} = ${val}`],
      hint: 'Thứ tự: lũy thừa → nhân chia → cộng trừ.',
      tags: ['lũy thừa', 'thứ tự phép tính'],
    };
  }
  if (lvl === 1) {
    const a = ri(r, 2, 5);
    const b = ri(r, 2, 7);
    const c = ri(r, 2, 9);
    const val = Math.pow(a, 3) - b * b * c;
    return {
      stem: `Tính giá trị của biểu thức ${a}^3 − ${b}^2 × ${c}.`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [
        Math.pow(a, 3) - b * b - c,
        (Math.pow(a, 3) - b * b) * c,
        a * 3 - b * 2 * c,
        Math.pow(a, 3) + b * b * c,
      ]),
      solution: `Tính các lũy thừa: ${a}^3 = ${Math.pow(a, 3)}, ${b}^2 = ${b * b}. Nhân: ${b * b} × ${c} = ${b * b * c}. Trừ: ${Math.pow(a, 3)} − ${b * b * c} = ${val}.`,
      steps: [
        `${a}^3 = ${Math.pow(a, 3)}`,
        `${b}^2 × ${c} = ${b * b} × ${c} = ${b * b * c}`,
        `Hiệu: ${Math.pow(a, 3)} − ${b * b * c} = ${val}`,
      ],
      hint: 'Lũy thừa tính trước nhân, nhân tính trước trừ.',
      tags: ['lũy thừa', 'thứ tự phép tính'],
    };
  }
  const a = ri(r, 2, 7);
  const b = ri(r, 2, 7);
  const c = ri(r, 2, 6);
  const base = ri(r, 2, 4);
  const cube = Math.pow(base, 3);
  const inner = a * a + b * b;
  // Chọn số chia là một ước thực sự của base^3 ⇒ phép chia luôn hết
  const divs = divisorsOf(cube).filter((x) => x > 1 && x < cube);
  const e = divs.length ? pick(r, divs) : 2;
  const quotient = cube / e;
  const val = inner * c - quotient;
  return {
    stem: `Tính giá trị của biểu thức (${a}^2 + ${b}^2) × ${c} − ${base}^3 : ${e}.`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [
      (inner * c - cube) / e,
      inner * c - cube,
      (a + b) * (a + b) * c - quotient,
      inner * c + quotient,
    ]),
    solution: `Tính trong ngoặc: ${a}^2 + ${b}^2 = ${a * a} + ${b * b} = ${inner}. Nhân: ${inner} × ${c} = ${inner * c}. Tính lũy thừa rồi chia: ${base}^3 = ${cube}, ${cube} : ${e} = ${quotient}. Cuối cùng trừ: ${inner * c} − ${quotient} = ${val}. Lưu ý phép chia chỉ tác dụng lên ${base}^3 chứ không tác dụng lên cả biểu thức đứng trước.`,
    steps: [
      `Trong ngoặc: ${a}^2 + ${b}^2 = ${inner}`,
      `Nhân: ${inner} × ${c} = ${inner * c}`,
      `${base}^3 : ${e} = ${cube} : ${e} = ${quotient}`,
      `Trừ: ${inner * c} − ${quotient} = ${val}`,
    ],
    hint: 'Phép chia chỉ áp dụng cho số hạng đứng ngay trước nó, không phải cho cả biểu thức.',
    tags: ['lũy thừa', 'thứ tự phép tính', 'nhiều bước'],
  };
}

function POW04(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const pool: [number, number][] =
    lvl === 0
      ? [
          [2, 5],
          [3, 3],
          [5, 2],
          [4, 3],
          [2, 6],
          [6, 2],
          [3, 4],
          [7, 2],
        ]
      : lvl === 1
        ? [
            [2, 8],
            [3, 5],
            [5, 3],
            [4, 4],
            [6, 3],
            [7, 3],
            [2, 9],
            [9, 2],
          ]
        : [
            [2, 12],
            [3, 7],
            [5, 5],
            [7, 4],
            [11, 3],
            [4, 6],
            [6, 5],
            [2, 11],
          ];
  const chosen: [number, number][] = [];
  const values = new Set<number>();
  const shuffled = shuffle(r, pool);
  for (const p of shuffled) {
    const v = Math.pow(p[0], p[1]);
    if (values.has(v)) continue;
    values.add(v);
    chosen.push(p);
    if (chosen.length === 4) break;
  }
  const withVals = chosen.map((p) => ({ text: `${p[0]}^${p[1]}`, v: Math.pow(p[0], p[1]) }));
  const best = withVals.reduce((a, b) => (b.v > a.v ? b : a));
  return {
    stem: `Trong các lũy thừa sau, lũy thừa nào có giá trị LỚN NHẤT?`,
    correct: best.text,
    distractors: withVals.filter((x) => x.text !== best.text).map((x) => x.text),
    solution: `Tính giá trị từng lũy thừa rồi so sánh: ${withVals.map((x) => `${x.text} = ${x.v}`).join('; ')}. Số lớn nhất là ${best.v}, ứng với ${best.text}. Không được so sánh bằng cách nhìn cơ số hay số mũ riêng lẻ — phải quy về giá trị cụ thể.`,
    steps: withVals.map((x) => `${x.text} = ${x.v}`).concat([`So sánh các giá trị → lớn nhất là ${best.text}`]),
    hint: 'Cơ số lớn chưa chắc giá trị lớn — hãy tính ra giá trị cụ thể rồi so sánh.',
    tags: ['lũy thừa', 'so sánh'],
  };
}

// ---------------------------------------------------------------------------
// Chương DIV — Quan hệ chia hết, ước và bội
// ---------------------------------------------------------------------------

function DIV01(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const k = pick(r, lvl === 0 ? [2, 5] : lvl === 1 ? [3, 9] : [3, 9]);

  if (slot % 5 === 0) {
    // Biến thể nhiều đáp án đúng
    const multiples: number[] = [];
    const others: number[] = [];
    while (multiples.length < 3) {
      const v = k * ri(r, 12, 99);
      if (!multiples.includes(v)) multiples.push(v);
    }
    while (others.length < 3) {
      const v = ri(r, 120, 999);
      if (v % k !== 0 && !others.includes(v)) others.push(v);
    }
    return {
      stem: `Trong các số sau, những số nào chia hết cho ${k}? (Chọn tất cả đáp án đúng)`,
      correct: fmt(multiples[0]),
      distractors: others.map(fmt),
      kind: 'multi',
      correctTexts: [fmt(multiples[0]), fmt(multiples[1])],
      wrongTexts: others.map(fmt),
      solution: `Dấu hiệu chia hết cho ${k}: ${k === 2 ? 'chữ số tận cùng là số chẵn' : k === 5 ? 'chữ số tận cùng là 0 hoặc 5' : `tổng các chữ số chia hết cho ${k}`}. Kiểm tra: ${[multiples[0], multiples[1], others[0], others[1]].map((v) => `${v} : ${k} ${v % k === 0 ? `= ${v / k} (chia hết)` : `dư ${v % k}`}`).join('; ')}. Vậy ${multiples[0]} và ${multiples[1]} chia hết cho ${k}.`,
      steps: [
        `Nhắc lại dấu hiệu chia hết cho ${k}`,
        `Kiểm tra từng số theo dấu hiệu`,
        `Chọn các số thỏa mãn: ${multiples[0]}, ${multiples[1]}`,
      ],
      hint: k === 3 || k === 9 ? `Cộng các chữ số lại rồi xét tổng có chia hết cho ${k} không.` : 'Chỉ cần nhìn chữ số tận cùng.',
      tags: ['dấu hiệu chia hết'],
    };
  }

  if (lvl === 2) {
    // Tìm chữ số thay dấu * — chỉ nhận trường hợp có DUY NHẤT một chữ số thỏa mãn
    for (let attempt = 0; attempt < 40; attempt++) {
      const d1 = ri(r, 1, 9);
      const d3 = ri(r, 0, 9);
      const d4 = ri(r, 0, 9);
      const known = d1 + d3 + d4;
      const need = (k - (known % k)) % k;
      if (need === 0) continue; // x = 0 và x = k đều thỏa → không duy nhất
      const solutions: number[] = [];
      for (let x = 0; x <= 9; x++) if ((known + x) % k === 0) solutions.push(x);
      if (solutions.length !== 1) continue;
      const x = solutions[0];
      const numberText = `${d1}*${d3}${d4}`;
      return {
        stem: `Tìm chữ số thích hợp thay cho dấu * để số ${numberText} chia hết cho ${k}.`,
        correct: fmt(x),
        numeric: x,
        distractors: nd(x, [known % k, k - (known % k) + 1, (x + k) % 10, 9 - x]),
        solution: `Số ${numberText} chia hết cho ${k} khi tổng các chữ số chia hết cho ${k}. Tổng các chữ số đã biết: ${d1} + ${d3} + ${d4} = ${known}. Ta cần ${known} + * chia hết cho ${k}. Vì ${known} chia ${k} dư ${known % k} nên * = ${k} − ${known % k} = ${x}. Thử lại: ${known} + ${x} = ${known + x}, mà ${known + x} : ${k} = ${(known + x) / k} nên đúng.`,
        steps: [
          `Tổng các chữ số đã biết: ${d1} + ${d3} + ${d4} = ${known}`,
          `${known} chia ${k} dư ${known % k}`,
          `Cần thêm ${x} để tổng chia hết cho ${k}`,
          `Kiểm tra lại: ${known + x} chia hết cho ${k}`,
        ],
        hint: `Dùng dấu hiệu chia hết cho ${k}: xét TỔNG các chữ số.`,
        tags: ['dấu hiệu chia hết', 'tìm chữ số'],
      };
    }
  }

  const correct = k * ri(r, 15, 99);
  const cands: number[] = [];
  // Nhiễu: số gần đúng nhưng không chia hết; với k = 9 thêm số chia hết cho 3 mà không chia hết cho 9
  for (const delta of [1, -1, 2, -2, 3, 4]) {
    const v = correct + delta;
    if (v > 0 && v % k !== 0) cands.push(v);
  }
  if (k === 9) {
    const trap = 3 * ri(r, 40, 99);
    if (trap % 9 !== 0) cands.unshift(trap);
  }
  return {
    stem: `Trong các số sau, số nào chia hết cho ${k}?`,
    correct: fmt(correct),
    numeric: correct,
    distractors: nd(correct, cands),
    solution: `Dấu hiệu chia hết cho ${k}: ${k === 2 ? 'chữ số tận cùng chẵn' : k === 5 ? 'chữ số tận cùng là 0 hoặc 5' : `tổng các chữ số chia hết cho ${k}`}. Với ${correct}: ${k === 3 || k === 9 ? `tổng các chữ số là ${String(correct).split('').reduce((s, c) => s + Number(c), 0)}, chia hết cho ${k}` : `chữ số tận cùng là ${correct % 10}`}, và ${correct} : ${k} = ${correct / k}. Các số còn lại đều chia ${k} còn dư.`,
    steps: [
      `Nhắc lại dấu hiệu chia hết cho ${k}`,
      `Kiểm tra từng phương án`,
      `${correct} : ${k} = ${correct / k} → chọn ${correct}`,
    ],
    hint: k === 3 || k === 9 ? 'Cộng các chữ số lại rồi xét tổng.' : 'Nhìn chữ số tận cùng.',
    tags: ['dấu hiệu chia hết'],
  };
}

function DIV02(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  if (lvl === 0) {
    const n = pick(r, [24, 30, 36, 40, 48, 54, 60, 72, 84, 90]);
    const divs = divisorsOf(n);
    const correct = pick(r, divs.filter((d) => d > 1 && d < n));
    const nonDivs: number[] = [];
    for (let x = 2; x < n && nonDivs.length < 8; x++) if (n % x !== 0) nonDivs.push(x);
    const near = nonDivs.sort((p, q) => Math.abs(p - correct) - Math.abs(q - correct)).slice(0, 5);
    return {
      stem: `Số nào sau đây là ước của ${n}?`,
      correct: fmt(correct),
      numeric: correct,
      distractors: near.map(fmt),
      solution: `Ước của ${n} là số chia hết ${n}. Ta có ${n} : ${correct} = ${n / correct} (phép chia hết) nên ${correct} là ước của ${n}. Tập hợp ước: Ư(${n}) = {${divs.join('; ')}}. Các số còn lại đều chia ${n} còn dư.`,
      steps: [
        `Lần lượt chia ${n} cho từng phương án`,
        `${n} : ${correct} = ${n / correct} — chia hết`,
        `Kết luận ${correct} ∈ Ư(${n})`,
      ],
      hint: 'Ước của một số là số mà phép chia không còn dư.',
      tags: ['ước và bội'],
    };
  }
  if (lvl === 1) {
    const n = pick(r, [48, 60, 72, 84, 96, 120, 126, 132, 150, 168]);
    const divs = divisorsOf(n);
    const correct = divs[divs.length - 2]; // ước lớn nhất không kể chính nó
    return {
      stem: `Tìm ước lớn nhất của ${n} (không kể chính số ${n}).`,
      correct: fmt(correct),
      numeric: correct,
      distractors: nd(correct, [n - 1, divs[divs.length - 3], n / 3, Math.floor(n / 2) - 1]),
      solution: `Ư(${n}) = {${divs.join('; ')}}. Bỏ đi chính số ${n}, ước lớn nhất còn lại là ${correct}. Cách nhanh: lấy ${n} chia cho ước nguyên tố nhỏ nhất của nó là ${factorize(n)[0][0]}, được ${n} : ${factorize(n)[0][0]} = ${correct}.`,
      steps: [
        `Liệt kê Ư(${n}) = {${divs.join('; ')}}`,
        `Loại bỏ chính số ${n}`,
        `Ước lớn nhất còn lại: ${correct}`,
      ],
      hint: 'Ước lớn nhất (khác chính nó) = số đó chia cho ước nguyên tố nhỏ nhất.',
      tags: ['ước và bội'],
    };
  }
  const a = pick(r, [12, 18, 20, 24, 28, 30, 36, 40, 45]);
  const count = divisorsOf(a).length;
  return {
    stem: `Có bao nhiêu số tự nhiên n khác 0 sao cho (n + ${a}) chia hết cho n?`,
    correct: fmt(count),
    numeric: count,
    distractors: nd(count, [count - 1, count + 1, a, Math.floor(a / 2)]),
    solution: `Vì n luôn chia hết cho n nên (n + ${a}) chia hết cho n khi và chỉ khi ${a} chia hết cho n, tức n là ước của ${a}. Ư(${a}) = {${divisorsOf(a).join('; ')}} gồm ${count} số. Vậy có ${count} giá trị của n.`,
    steps: [
      `n chia hết cho n, nên điều kiện rút gọn thành ${a} chia hết cho n`,
      `Vậy n là ước của ${a}`,
      `Ư(${a}) = {${divisorsOf(a).join('; ')}} → có ${count} giá trị`,
    ],
    hint: 'Tách n + a = n + a và nhớ rằng n luôn chia hết cho n.',
    tags: ['ước và bội', 'suy luận'],
  };
}

function DIV03(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  if (lvl === 2) {
    const k = ri(r, 7, 19);
    const a = ri(r, 100, 400);
    const smallest = (Math.floor(a / k) + 1) * k;
    return {
      stem: `Tìm bội nhỏ nhất của ${k} mà lớn hơn ${a}.`,
      correct: fmt(smallest),
      numeric: smallest,
      distractors: nd(smallest, [Math.floor(a / k) * k, smallest + k, a + k, k * Math.round(a / k)]),
      solution: `Chia ${a} cho ${k}: ${a} = ${k} × ${Math.floor(a / k)} + ${a % k}. Bội của ${k} ngay sau ${a} là ${k} × ${Math.floor(a / k) + 1} = ${smallest}. Kiểm tra ${smallest} > ${a} và ${smallest} : ${k} = ${smallest / k}.`,
      steps: [
        `${a} : ${k} = ${Math.floor(a / k)} dư ${a % k}`,
        `Bội tiếp theo ứng với thương ${Math.floor(a / k) + 1}`,
        `${k} × ${Math.floor(a / k) + 1} = ${smallest}`,
      ],
      hint: 'Chia rồi lấy thương cộng thêm 1, sau đó nhân lại.',
      tags: ['ước và bội'],
    };
  }
  const k = ri(r, 3, 12);
  const a = lvl === 0 ? ri(r, 10, 60) : ri(r, 50, 200);
  const b = a + (lvl === 0 ? ri(r, 40, 90) : ri(r, 150, 400));
  let count = 0;
  const first: number[] = [];
  for (let x = a; x <= b; x++)
    if (x % k === 0) {
      count++;
      if (first.length < 3) first.push(x);
    }
  return {
    stem: `Có bao nhiêu bội của ${k} nằm trong đoạn từ ${a} đến ${b}?`,
    correct: fmt(count),
    numeric: count,
    distractors: nd(count, [count - 1, count + 1, Math.floor((b - a) / k), Math.floor(b / k)]),
    solution: `Bội nhỏ nhất của ${k} không nhỏ hơn ${a} là ${first[0]}; bội lớn nhất không vượt quá ${b} là ${Math.floor(b / k) * k}. Các bội này lập thành dãy cách đều ${k} đơn vị: ${first.join('; ')}; ... Số bội = (${Math.floor(b / k) * k} − ${first[0]}) : ${k} + 1 = ${count}.`,
    steps: [
      `Bội đầu tiên: ${first[0]}`,
      `Bội cuối cùng: ${Math.floor(b / k) * k}`,
      `Số bội = (số cuối − số đầu) : ${k} + 1 = ${count}`,
    ],
    hint: 'Các bội tạo thành dãy cách đều — dùng công thức đếm dãy cách đều, nhớ cộng 1.',
    tags: ['ước và bội', 'đếm'],
  };
}

function DIV04(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const m = ri(r, 3, 9);
  if (lvl === 0) {
    const a = ri(r, 20, 99);
    const b = ri(r, 20, 99);
    const rem = (a + b) % m;
    return {
      stem: `Tổng ${a} + ${b} chia cho ${m} có số dư bằng bao nhiêu?`,
      correct: fmt(rem),
      numeric: rem,
      distractors: nd(rem, [(a % m) + (b % m), a % m, b % m, m - rem]),
      solution: `Cách 1 — tính trực tiếp: ${a} + ${b} = ${a + b}; ${a + b} : ${m} = ${Math.floor((a + b) / m)} dư ${rem}. Cách 2 — dùng tính chất số dư: ${a} chia ${m} dư ${a % m}, ${b} chia ${m} dư ${b % m}; tổng hai số dư là ${(a % m) + (b % m)}, số dư thật là phần dư của tổng đó khi chia cho ${m}, bằng ${rem}.`,
      steps: [
        `${a} chia ${m} dư ${a % m}`,
        `${b} chia ${m} dư ${b % m}`,
        `Tổng hai số dư: ${(a % m) + (b % m)}, chia tiếp cho ${m} còn dư ${rem}`,
      ],
      hint: 'Số dư của tổng bằng số dư của (tổng các số dư).',
      tags: ['chia hết', 'số dư'],
    };
  }
  const a = lvl === 1 ? ri(r, 30, 200) : ri(r, 12, 40) * ri(r, 3, 12);
  const b = lvl === 1 ? ri(r, 30, 200) : ri(r, 100, 600);
  const rem = (a + b) % m;
  if (rem === 0) return DIV04(ctx);
  const x = m - rem;
  return {
    stem: `Tìm số tự nhiên x nhỏ nhất khác 0 sao cho tổng ${a} + ${b} + x chia hết cho ${m}.`,
    correct: fmt(x),
    numeric: x,
    distractors: nd(x, [rem, m, x + m, m - x]),
    solution: `Tính tổng: ${a} + ${b} = ${a + b}. Chia cho ${m}: ${a + b} = ${m} × ${Math.floor((a + b) / m)} + ${rem}, tức còn dư ${rem}. Muốn tổng chia hết cho ${m}, x phải bù cho đủ: x = ${m} − ${rem} = ${x}. Kiểm tra: ${a + b} + ${x} = ${a + b + x}, mà ${a + b + x} : ${m} = ${(a + b + x) / m}. Bẫy hay gặp là lấy luôn số dư ${rem} làm đáp án.`,
    steps: [
      `${a} + ${b} = ${a + b}`,
      `${a + b} chia ${m} dư ${rem}`,
      `x = ${m} − ${rem} = ${x}`,
      `Kiểm tra: ${a + b + x} chia hết cho ${m}`,
    ],
    hint: 'Tìm số dư trước, rồi lấy số chia trừ đi số dư để biết cần bù bao nhiêu.',
    tags: ['chia hết', 'tính chất chia hết của tổng'],
  };
}

// ---------------------------------------------------------------------------
// Chương PRIME — Số nguyên tố và phân tích ra thừa số nguyên tố
// ---------------------------------------------------------------------------

function PRIME01(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const hi = lvl === 0 ? 60 : lvl === 1 ? 120 : 220;
  const primes = primesBetween(11, hi);
  const composites = compositesBetween(11, hi).filter((n) => n % 2 !== 0 && n % 5 !== 0);

  if (slot % 5 === 0) {
    const p = shuffle(r, primes).slice(0, 2);
    const c = shuffle(r, composites).slice(0, 2);
    return {
      stem: `Trong các số sau, những số nào là số nguyên tố? (Chọn tất cả đáp án đúng)`,
      correct: fmt(p[0]),
      distractors: c.map(fmt),
      kind: 'multi',
      correctTexts: p.map(fmt),
      wrongTexts: c.map(fmt),
      solution: `Số nguyên tố là số tự nhiên lớn hơn 1 và chỉ có đúng hai ước là 1 và chính nó. Kiểm tra: ${p[0]} và ${p[1]} không chia hết cho bất kỳ số nguyên tố nào không vượt quá căn bậc hai của chúng nên là số nguyên tố. Còn ${c[0]} = ${factorStr(c[0])} và ${c[1]} = ${factorStr(c[1])} nên là hợp số.`,
      steps: [
        'Nhắc lại: số nguyên tố chỉ có hai ước là 1 và chính nó',
        `Thử chia lần lượt cho 2, 3, 5, 7, 11, 13...`,
        `Kết luận: ${p[0]} và ${p[1]} là số nguyên tố`,
      ],
      hint: 'Chỉ cần thử chia cho các số nguyên tố nhỏ hơn hoặc bằng căn bậc hai của số đó.',
      tags: ['số nguyên tố'],
    };
  }

  const correct = pick(r, primes);
  const wrong = shuffle(r, composites)
    .sort((p, q) => Math.abs(p - correct) - Math.abs(q - correct))
    .slice(0, 5);
  return {
    stem: `Số nào sau đây là số nguyên tố?`,
    correct: fmt(correct),
    numeric: correct,
    distractors: wrong.map(fmt),
    solution: `${correct} chỉ có hai ước là 1 và ${correct} nên là số nguyên tố. Các số còn lại đều là hợp số: ${wrong.slice(0, 3).map((n) => `${n} = ${factorStr(n)}`).join('; ')}.`,
    steps: [
      `Thử chia ${correct} cho 2, 3, 5, 7, ... (đến khi bình phương vượt quá ${correct})`,
      `Không có phép chia nào hết dư ⇒ ${correct} là số nguyên tố`,
      `Các số còn lại phân tích được thành tích hai thừa số lớn hơn 1`,
    ],
    hint: 'Các số như 91, 87, 51, 119 trông giống số nguyên tố nhưng đều là hợp số — hãy thử chia cho 3, 7, 11, 13.',
    tags: ['số nguyên tố', 'hợp số'],
  };
}

function PRIME02(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const p1 = 2;
  const p2 = 3;
  const p3 = pick(r, [5, 7, 11]);
  const e1 = lvl === 0 ? ri(r, 1, 3) : ri(r, 2, 4);
  const e2 = lvl === 0 ? ri(r, 1, 2) : ri(r, 1, 3);
  const e3 = lvl === 2 ? ri(r, 1, 2) : lvl === 1 ? 1 : 0;
  const n = Math.pow(p1, e1) * Math.pow(p2, e2) * Math.pow(p3, e3);
  const correct = factorStr(n);
  const cands = [
    `${Math.pow(p1, e1)} · ${Math.pow(p2, e2)}${e3 ? ` · ${Math.pow(p3, e3)}` : ''}`,
    `${p1}^${e1 + 1} · ${p2}^${e2}${e3 ? ` · ${p3}^${e3}` : ''}`,
    `${p1}^${e1} · ${p2}^${e2 + 1}${e3 ? ` · ${p3}^${e3}` : ''}`,
    e1 > 1 ? `${p1}^${e1 - 1} · ${p2}^${e2}${e3 ? ` · ${p3}^${e3}` : ''}` : `${p1} · ${p2}^${e2}${e3 ? ` · ${p3}^${e3}` : ''}`,
    `${p1}^${e2} · ${p2}^${e1}${e3 ? ` · ${p3}^${e3}` : ''}`,
  ];
  return {
    stem: `Phân tích số ${n} ra thừa số nguyên tố.`,
    correct,
    distractors: td(correct, cands),
    solution: `Chia ${n} lần lượt cho các số nguyên tố từ nhỏ đến lớn: ${factorize(n).map(([p, e]) => `chia được ${e} lần cho ${p}`).join(', ')}. Vậy ${n} = ${correct}. Kiểm tra lại bằng phép nhân: ${factorize(n).map(([p, e]) => Math.pow(p, e)).join(' × ')} = ${n}. Lưu ý mọi thừa số trong kết quả đều phải là SỐ NGUYÊN TỐ.`,
    steps: [
      `Chia ${n} cho 2 cho tới khi không chia hết nữa`,
      `Tiếp tục chia cho 3, 5, 7...`,
      `Viết kết quả dưới dạng lũy thừa: ${correct}`,
      `Nhân thử lại để kiểm tra: bằng ${n}`,
    ],
    hint: 'Chia liên tiếp cho số nguyên tố nhỏ nhất, và nhớ mọi thừa số trong đáp án phải là số nguyên tố.',
    tags: ['phân tích thừa số nguyên tố'],
  };
}

function PRIME03(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const e1 = lvl === 0 ? ri(r, 1, 3) : ri(r, 2, 4);
  const e2 = lvl === 0 ? ri(r, 1, 2) : ri(r, 1, 3);
  const p3 = pick(r, [5, 7]);
  const e3 = lvl === 2 ? ri(r, 1, 2) : lvl === 1 ? 1 : 0;
  const n = Math.pow(2, e1) * Math.pow(3, e2) * Math.pow(p3, e3);
  const count = divisorCount(n);
  // Kiểm chứng chéo: đếm ước bằng vét cạn phải khớp công thức ∏(e+1)
  if (divisorsOf(n).length !== count) throw new Error(`Sai công thức đếm ước với n = ${n}`);
  const exps = factorize(n).map(([, e]) => e);
  return {
    stem: `Số ${n} có bao nhiêu ước tự nhiên?`,
    correct: fmt(count),
    numeric: count,
    distractors: nd(count, [
      exps.reduce((a, b) => a * b, 1),
      exps.reduce((a, b) => a + b + 1, 0),
      count - 1,
      count - 2,
    ]),
    solution: `Phân tích ra thừa số nguyên tố: ${n} = ${factorStr(n)}. Số ước bằng tích của (số mũ + 1) ở từng thừa số: ${exps.map((e) => `(${e} + 1)`).join(' × ')} = ${count}. Lỗi hay gặp là quên cộng 1 vào mỗi số mũ.`,
    steps: [
      `Phân tích: ${n} = ${factorStr(n)}`,
      `Lấy từng số mũ cộng thêm 1: ${exps.map((e) => e + 1).join('; ')}`,
      `Nhân lại: ${exps.map((e) => e + 1).join(' × ')} = ${count}`,
    ],
    hint: 'Công thức: nếu n = p^a · q^b thì số ước của n là (a+1)(b+1).',
    tags: ['phân tích thừa số nguyên tố', 'đếm ước'],
  };
}

// ---------------------------------------------------------------------------
// Chương GCDLCM — ƯCLN và BCNN
// ---------------------------------------------------------------------------

function GCDLCM01(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const g = lvl === 0 ? ri(r, 2, 9) : ri(r, 6, 18);
  let m = ri(r, 2, lvl === 0 ? 9 : 15);
  let n = ri(r, 2, lvl === 0 ? 9 : 15);
  while (gcd(m, n) !== 1 || m === n) {
    m = ri(r, 2, 15);
    n = ri(r, 2, 15);
  }
  const a = g * m;
  const b = g * n;
  const val = gcd(a, b);
  if (val !== g) throw new Error(`ƯCLN dựng sai: ${a}, ${b}`);
  return {
    stem: `Tìm ƯCLN(${a}; ${b}).`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [lcm(a, b), Math.abs(a - b), val * 2, Math.min(a, b), a * b]),
    solution: `Phân tích ra thừa số nguyên tố: ${a} = ${factorStr(a)} và ${b} = ${factorStr(b)}. ƯCLN lấy các thừa số nguyên tố CHUNG với số mũ NHỎ NHẤT, được ${val}. Kiểm tra: ${a} : ${val} = ${a / val}, ${b} : ${val} = ${b / val}, và hai thương ${a / val} với ${b / val} không còn ước chung nào lớn hơn 1.`,
    steps: [
      `${a} = ${factorStr(a)}`,
      `${b} = ${factorStr(b)}`,
      `Lấy thừa số chung, số mũ nhỏ nhất → ƯCLN = ${val}`,
    ],
    hint: 'ƯCLN: thừa số CHUNG, số mũ NHỎ nhất. BCNN mới là chung và riêng, số mũ lớn nhất.',
    tags: ['ƯCLN'],
  };
}

function GCDLCM02(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const a = lvl === 0 ? ri(r, 4, 15) : lvl === 1 ? ri(r, 8, 30) : ri(r, 12, 48);
  const b = lvl === 0 ? ri(r, 4, 15) : lvl === 1 ? ri(r, 8, 30) : ri(r, 12, 48);
  if (a === b) return GCDLCM02(ctx);
  const val = lcm(a, b);
  const g = gcd(a, b);
  return {
    stem: `Tìm BCNN(${a}; ${b}).`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [a * b, g, a + b, val / 2, Math.max(a, b)]),
    solution: `Phân tích: ${a} = ${factorStr(a)}, ${b} = ${factorStr(b)}. BCNN lấy các thừa số nguyên tố CHUNG VÀ RIÊNG với số mũ LỚN NHẤT, được ${val}. Cách nhanh: BCNN = (${a} × ${b}) : ƯCLN = ${a * b} : ${g} = ${val}. Lỗi kinh điển là lấy luôn tích ${a} × ${b} = ${a * b} mà quên chia cho ƯCLN.`,
    steps: [
      `${a} = ${factorStr(a)}; ${b} = ${factorStr(b)}`,
      `ƯCLN(${a}; ${b}) = ${g}`,
      `BCNN = ${a} × ${b} : ${g} = ${a * b} : ${g} = ${val}`,
    ],
    hint: 'BCNN × ƯCLN = tích hai số. Đừng lấy thẳng tích hai số làm BCNN.',
    tags: ['BCNN'],
  };
}

function GCDLCM03(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const g = lvl === 0 ? ri(r, 4, 12) : ri(r, 8, 24);
  let m = ri(r, 2, 12);
  let n = ri(r, 2, 12);
  while (gcd(m, n) !== 1 || m === n) {
    m = ri(r, 2, 12);
    n = ri(r, 2, 12);
  }
  const a = g * m;
  const b = g * n;
  const val = gcd(a, b);
  const askPerPart = lvl === 2;
  const perPart = a / val;
  return {
    stem: askPerPart
      ? `Cô giáo có ${a} quyển vở và ${b} chiếc bút, muốn chia đều vào các phần quà sao cho mỗi phần có số vở như nhau và số bút như nhau. Hỏi khi chia được nhiều phần quà nhất thì mỗi phần có bao nhiêu quyển vở?`
      : `Cô giáo có ${a} quyển vở và ${b} chiếc bút, muốn chia đều vào các phần quà sao cho mỗi phần có số vở như nhau và số bút như nhau. Hỏi chia được nhiều nhất bao nhiêu phần quà?`,
    correct: fmt(askPerPart ? perPart : val),
    numeric: askPerPart ? perPart : val,
    distractors: askPerPart
      ? nd(perPart, [val, b / val, a / 2, perPart + 1])
      : nd(val, [lcm(a, b), a / val, b / val, Math.abs(a - b)]),
    solution: `Số phần quà phải là ước chung của ${a} và ${b}; muốn NHIỀU NHẤT thì lấy ƯCLN. ${a} = ${factorStr(a)}, ${b} = ${factorStr(b)} nên ƯCLN(${a}; ${b}) = ${val}. Vậy chia được nhiều nhất ${val} phần quà, khi đó mỗi phần có ${a} : ${val} = ${perPart} quyển vở và ${b} : ${val} = ${b / val} chiếc bút. ${askPerPart ? `Đáp số cần tìm là ${perPart} quyển vở.` : `Đáp số cần tìm là ${val} phần quà.`}`,
    steps: [
      `Số phần quà là ước chung của ${a} và ${b}`,
      `Nhiều nhất ⇒ lấy ƯCLN(${a}; ${b}) = ${val}`,
      `Mỗi phần: ${a} : ${val} = ${perPart} vở và ${b} : ${val} = ${b / val} bút`,
    ],
    hint: 'Chia đều "nhiều nhất" thì dùng ƯCLN; "cùng lúc gặp lại" mới dùng BCNN.',
    tags: ['ƯCLN', 'toán lời văn'],
  };
}

function GCDLCM04(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const a = lvl === 0 ? ri(r, 4, 12) : lvl === 1 ? ri(r, 6, 20) : ri(r, 8, 30);
  const b = lvl === 0 ? ri(r, 4, 12) : lvl === 1 ? ri(r, 6, 20) : ri(r, 8, 30);
  if (a === b) return GCDLCM04(ctx);
  const val = lcm(a, b);
  const askClock = lvl === 2;
  const startHour = 6;
  const totalMinutes = startHour * 60 + val;
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  if (askClock) {
    const correct = `${hh} giờ ${mm} phút`;
    return {
      stem: `Tại một bến xe, xe buýt tuyến số 1 cứ ${a} phút lại xuất bến một lần, tuyến số 2 cứ ${b} phút lại xuất bến một lần. Lúc ${startHour} giờ hai xe cùng xuất bến. Hỏi lần kế tiếp hai xe cùng xuất bến là lúc mấy giờ?`,
      correct,
      distractors: td(correct, [
        `${Math.floor((startHour * 60 + a * b) / 60)} giờ ${(startHour * 60 + a * b) % 60} phút`,
        `${Math.floor((startHour * 60 + a + b) / 60)} giờ ${(startHour * 60 + a + b) % 60} phút`,
        `${Math.floor((startHour * 60 + gcd(a, b)) / 60)} giờ ${(startHour * 60 + gcd(a, b)) % 60} phút`,
        `${hh} giờ ${mm + 5} phút`,
      ]),
      solution: `Khoảng thời gian giữa hai lần cùng xuất bến là bội chung nhỏ nhất của ${a} và ${b}. Ta có ${a} = ${factorStr(a)}, ${b} = ${factorStr(b)} nên BCNN(${a}; ${b}) = ${val} phút. Vậy lần kế tiếp là ${startHour} giờ + ${val} phút = ${hh} giờ ${mm} phút.`,
      steps: [
        `Thời gian giữa hai lần trùng nhau = BCNN(${a}; ${b})`,
        `BCNN(${a}; ${b}) = ${val} phút`,
        `${startHour} giờ + ${val} phút = ${hh} giờ ${mm} phút`,
      ],
      hint: 'Tính BCNN ra phút trước, sau đó mới cộng vào giờ xuất phát.',
      tags: ['BCNN', 'toán lời văn'],
    };
  }
  return {
    stem: `Hai bạn cùng bắt đầu tập bơi vào một ngày. An cứ ${a} ngày lại đi bơi một lần, Bình cứ ${b} ngày lại đi bơi một lần. Hỏi sau ít nhất bao nhiêu ngày thì hai bạn lại cùng đi bơi?`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [a * b, gcd(a, b), a + b, val / 2]),
    solution: `Số ngày cần tìm phải chia hết cho cả ${a} và ${b}, tức là bội chung của hai số; "ít nhất" nên lấy BCNN. ${a} = ${factorStr(a)}, ${b} = ${factorStr(b)}, ƯCLN = ${gcd(a, b)} nên BCNN = ${a} × ${b} : ${gcd(a, b)} = ${val}. Vậy sau ${val} ngày hai bạn lại cùng đi bơi.`,
    steps: [
      `Số ngày cần tìm là bội chung của ${a} và ${b}`,
      `"Ít nhất" ⇒ lấy BCNN(${a}; ${b})`,
      `BCNN = ${a} × ${b} : ${gcd(a, b)} = ${val} ngày`,
    ],
    hint: '"Cùng lặp lại sau ít nhất bao lâu" là dấu hiệu của BCNN.',
    tags: ['BCNN', 'toán lời văn'],
  };
}

// ---------------------------------------------------------------------------
// Chương INT — Số nguyên
// ---------------------------------------------------------------------------

function INT01(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  if (lvl === 0) {
    const x = -ri(r, 5, 60);
    const y = ri(r, 5, 60);
    const val = x + y;
    return {
      stem: `Tính: (${x}) + ${y}`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [-Math.abs(x) - y, Math.abs(x) + y, -val, x - y]),
      solution: `Cộng hai số nguyên khác dấu: lấy giá trị tuyệt đối lớn trừ giá trị tuyệt đối nhỏ rồi đặt dấu của số có giá trị tuyệt đối lớn hơn. Ở đây |${x}| = ${Math.abs(x)}, |${y}| = ${y}; hiệu là ${Math.abs(Math.abs(x) - y)} và dấu theo ${Math.abs(x) > y ? `số âm ${x}` : `số dương ${y}`}. Kết quả: ${val}.`,
      steps: [
        `|${x}| = ${Math.abs(x)}, |${y}| = ${y}`,
        `Lấy số lớn trừ số bé: ${Math.max(Math.abs(x), y)} − ${Math.min(Math.abs(x), y)} = ${Math.abs(Math.abs(x) - y)}`,
        `Đặt dấu của số có giá trị tuyệt đối lớn hơn → ${val}`,
      ],
      hint: 'Hai số khác dấu thì TRỪ hai giá trị tuyệt đối, dấu theo số "mạnh" hơn.',
      tags: ['số nguyên', 'cộng trừ'],
    };
  }
  if (lvl === 1) {
    const x = -ri(r, 10, 80);
    const y = -ri(r, 10, 80);
    const z = ri(r, 10, 90);
    const val = x + y - -z;
    return {
      stem: `Tính: (${x}) + (${y}) − (${-z})`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [x + y - z, -(Math.abs(x) + Math.abs(y) + z), x - y + z, Math.abs(x) + Math.abs(y) - z]),
      solution: `Trừ đi một số âm chính là cộng số đối của nó: −(${-z}) = +${z}. Biểu thức thành ${x} + ${y} + ${z}. Cộng hai số âm: ${x} + ${y} = ${x + y}. Sau đó ${x + y} + ${z} = ${val}.`,
      steps: [
        `−(${-z}) = +${z}`,
        `${x} + ${y} = ${x + y}`,
        `${x + y} + ${z} = ${val}`,
      ],
      hint: 'Trừ một số âm = cộng số dương tương ứng.',
      tags: ['số nguyên', 'cộng trừ'],
    };
  }
  const a = -ri(r, 20, 120);
  const b = ri(r, 20, 120);
  const c = -ri(r, 20, 120);
  const dd = ri(r, 20, 120);
  const val = a - b + c - -dd;
  return {
    stem: `Tính: (${a}) − ${b} + (${c}) − (${-dd})`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [a - b + c - dd, a + b + c + dd, -val, a - b - c + dd]),
    solution: `Bỏ dấu ngoặc và đổi dấu khi cần: −(${-dd}) = +${dd}. Biểu thức trở thành ${a} − ${b} + ${c} + ${dd}. Nhóm các số âm: ${a} + ${c} = ${a + c} và ${a + c} − ${b} = ${a + c - b}. Cuối cùng ${a + c - b} + ${dd} = ${val}.`,
    steps: [
      `−(${-dd}) = +${dd}`,
      `Nhóm số âm: ${a} + ${c} = ${a + c}`,
      `${a + c} − ${b} = ${a + c - b}`,
      `${a + c - b} + ${dd} = ${val}`,
    ],
    hint: 'Nhóm các số cùng dấu lại rồi mới cộng trừ để tránh nhầm dấu.',
    tags: ['số nguyên', 'cộng trừ', 'nhiều bước'],
  };
}

function INT02(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  if (lvl === 0) {
    const x = -ri(r, 3, 15);
    const y = ri(r, 3, 15);
    const val = x * y;
    return {
      stem: `Tính: (${x}) × ${y}`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [-val, x + y, Math.abs(x) + y, x - y]),
      solution: `Nhân hai số nguyên KHÁC DẤU thì kết quả mang dấu âm: |${x}| × |${y}| = ${Math.abs(x) * y}, đặt dấu "−" được ${val}.`,
      steps: [
        `Nhân hai giá trị tuyệt đối: ${Math.abs(x)} × ${y} = ${Math.abs(x) * y}`,
        `Hai thừa số khác dấu ⇒ tích mang dấu âm`,
        `Kết quả: ${val}`,
      ],
      hint: 'Khác dấu thì tích âm, cùng dấu thì tích dương.',
      tags: ['số nguyên', 'nhân chia'],
    };
  }
  if (lvl === 1) {
    const x = -ri(r, 4, 20);
    const y = -ri(r, 3, 15);
    const val = x * y;
    return {
      stem: `Tính: (${x}) × (${y})`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [-val, x + y, -(Math.abs(x) + Math.abs(y)), Math.abs(x) - Math.abs(y)]),
      solution: `Nhân hai số nguyên CÙNG DẤU (cùng âm) thì tích mang dấu dương: |${x}| × |${y}| = ${Math.abs(x * y)}. Kết quả: ${val}.`,
      steps: [
        `${Math.abs(x)} × ${Math.abs(y)} = ${Math.abs(x * y)}`,
        `Hai thừa số cùng dấu ⇒ tích dương`,
        `Kết quả: ${val}`,
      ],
      hint: 'Âm nhân âm ra dương.',
      tags: ['số nguyên', 'nhân chia'],
    };
  }
  const q = -ri(r, 3, 18);
  const y = -ri(r, 3, 12);
  const x = q * y;
  const val = x / y;
  return {
    stem: `Tính: ${par(x)} : (${y})`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [-val, x * y, x + y, Math.abs(val) + 1]),
    solution: `Chia hai số nguyên: lấy thương hai giá trị tuyệt đối rồi xét dấu. ${Math.abs(x)} : ${Math.abs(y)} = ${Math.abs(val)}. Hai số ${x > 0 ? 'dương' : 'âm'} và ${y > 0 ? 'dương' : 'âm'} nên ${x * y > 0 ? 'cùng dấu ⇒ thương dương' : 'khác dấu ⇒ thương âm'}. Kết quả: ${val}. Thử lại: ${val} × ${y} = ${x}.`,
    steps: [
      `${Math.abs(x)} : ${Math.abs(y)} = ${Math.abs(val)}`,
      `Xét dấu theo quy tắc cùng dấu / khác dấu`,
      `Kết quả ${val}, thử lại ${val} × ${y} = ${x}`,
    ],
    hint: 'Xác định giá trị tuyệt đối trước, xét dấu sau, rồi nhân lại để kiểm tra.',
    tags: ['số nguyên', 'nhân chia'],
  };
}

function INT03(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  if (lvl === 0) {
    const a = ri(r, 20, 90);
    const b = ri(r, 10, 60);
    const c = ri(r, 5, 40);
    const val = a - (b - c);
    return {
      stem: `Tính: ${a} − (${b} − ${c})`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [a - b - c, a + b - c, a + b + c, -val]),
      solution: `Bỏ ngoặc có dấu "−" đằng trước thì phải ĐỔI DẤU mọi số hạng trong ngoặc: ${a} − (${b} − ${c}) = ${a} − ${b} + ${c} = ${val}. Lỗi kinh điển là chỉ đổi dấu số hạng đầu và viết thành ${a} − ${b} − ${c} = ${a - b - c}.`,
      steps: [
        `Bỏ ngoặc, đổi dấu tất cả: ${a} − ${b} + ${c}`,
        `${a} − ${b} = ${a - b}`,
        `${a - b} + ${c} = ${val}`,
      ],
      hint: 'Dấu trừ trước ngoặc thì mọi số hạng trong ngoặc đều đổi dấu.',
      tags: ['số nguyên', 'dấu ngoặc'],
    };
  }
  if (lvl === 1) {
    const a = ri(r, 30, 150);
    const b = ri(r, 10, 80);
    const c = ri(r, 10, 60);
    const dd = ri(r, 10, 70);
    const e = ri(r, 5, 50);
    const val = a - (b + c) - (dd - e);
    return {
      stem: `Tính: ${a} − (${b} + ${c}) − (${dd} − ${e})`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [a - b + c - dd + e, a - b - c - dd - e, a - (b + c) + (dd - e), a + b + c - dd + e]),
      solution: `Bỏ hai ngoặc, cả hai đều có dấu "−" phía trước nên đổi dấu toàn bộ bên trong: ${a} − ${b} − ${c} − ${dd} + ${e}. Tính lần lượt: ${a} − ${b} = ${a - b}; ${a - b} − ${c} = ${a - b - c}; ${a - b - c} − ${dd} = ${a - b - c - dd}; cộng ${e} được ${val}.`,
      steps: [
        `Bỏ ngoặc: ${a} − ${b} − ${c} − ${dd} + ${e}`,
        `${a} − ${b} − ${c} = ${a - b - c}`,
        `${a - b - c} − ${dd} + ${e} = ${val}`,
      ],
      hint: 'Chú ý số hạng cuối trong ngoặc thứ hai: −(d − e) = −d + e.',
      tags: ['số nguyên', 'dấu ngoặc'],
    };
  }
  const a = ri(r, 40, 200);
  const b = ri(r, 20, 120);
  const c = ri(r, 20, 100);
  const dd = ri(r, 10, 90);
  const val = a - (b - (c - dd));
  return {
    stem: `Tính: ${a} − [${b} − (${c} − ${dd})]`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [a - b - c + dd, a - b + c + dd, a - b - c - dd, a + b - c + dd]),
    solution: `Làm từ trong ra ngoài. Trong cùng: ${c} − ${dd} = ${c - dd}. Tiếp theo: ${b} − ${c - dd} = ${b - (c - dd)}. Cuối cùng: ${a} − ${b - (c - dd)} = ${val}. Nếu bỏ ngoặc thì đổi dấu hai lần: ${a} − ${b} + ${c} − ${dd} = ${val} — kết quả trùng khớp.`,
    steps: [
      `Ngoặc trong cùng: ${c} − ${dd} = ${c - dd}`,
      `${b} − ${c - dd} = ${b - (c - dd)}`,
      `${a} − ${b - (c - dd)} = ${val}`,
    ],
    hint: 'Ngoặc lồng nhau thì tính từ trong ra ngoài, hoặc bỏ ngoặc và đổi dấu cẩn thận từng lớp.',
    tags: ['số nguyên', 'dấu ngoặc', 'nhiều bước'],
  };
}

function INT04(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  if (lvl === 0) {
    const a = -ri(r, 2, 12);
    const b = ri(r, 3, 12);
    const c = ri(r, 5, 40);
    const val = a * b + c;
    return {
      stem: `Tính giá trị của biểu thức: (${a}) × ${b} + ${c}`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [a * (b + c), Math.abs(a) * b + c, a * b - c, a + b + c]),
      solution: `Nhân trước, cộng sau: (${a}) × ${b} = ${a * b} (khác dấu nên tích âm). Sau đó ${a * b} + ${c} = ${val}.`,
      steps: [`(${a}) × ${b} = ${a * b}`, `${a * b} + ${c} = ${val}`],
      hint: 'Nhân chia trước, cộng trừ sau; nhớ quy tắc dấu khi nhân.',
      tags: ['số nguyên', 'thứ tự phép tính'],
    };
  }
  if (lvl === 1) {
    const a = -ri(r, 3, 15);
    const b = ri(r, 3, 12);
    const c = ri(r, 3, 12);
    const dd = -ri(r, 2, 10);
    const val = a * b + c * dd;
    return {
      stem: `Tính giá trị của biểu thức: (${a}) × ${b} + ${c} × (${dd})`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [Math.abs(a) * b + c * Math.abs(dd), a * b - c * dd, -val, (a + b) * (c + dd)]),
      solution: `Tính hai tích trước: (${a}) × ${b} = ${a * b} và ${c} × (${dd}) = ${c * dd}. Cả hai đều âm. Cộng lại: ${a * b} + ${c * dd} = ${val}.`,
      steps: [
        `(${a}) × ${b} = ${a * b}`,
        `${c} × (${dd}) = ${c * dd}`,
        `Cộng: ${a * b} + ${c * dd} = ${val}`,
      ],
      hint: 'Tính riêng từng tích với đúng dấu rồi mới cộng.',
      tags: ['số nguyên', 'thứ tự phép tính'],
    };
  }
  const a = -ri(r, 3, 15);
  const b = ri(r, 4, 15);
  const q = -ri(r, 2, 12);
  const f = -ri(r, 2, 9);
  const e = q * f;
  const c = ri(r, 5, 40);
  const val = a * b - c + e / f;
  return {
    stem: `Tính giá trị của biểu thức: (${a}) × ${b} − ${c} + ${par(e)} : (${f})`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [a * b - (c + e / f), Math.abs(a) * b - c + e / f, a * b - c - e / f, a * b - c + e * f]),
    solution: `Thực hiện nhân và chia trước: (${a}) × ${b} = ${a * b}; ${e} : (${f}) = ${e / f} (hai số cùng dấu nên thương dương). Sau đó cộng trừ từ trái sang phải: ${a * b} − ${c} = ${a * b - c}; ${a * b - c} + ${e / f} = ${val}.`,
    steps: [
      `(${a}) × ${b} = ${a * b}`,
      `${e} : (${f}) = ${e / f}`,
      `${a * b} − ${c} = ${a * b - c}`,
      `${a * b - c} + ${e / f} = ${val}`,
    ],
    hint: 'Nhân chia làm trước theo thứ tự từ trái sang phải, sau đó mới cộng trừ.',
    tags: ['số nguyên', 'thứ tự phép tính', 'nhiều bước'],
  };
}

// ---------------------------------------------------------------------------
// Chương FRA — Phân số
// ---------------------------------------------------------------------------

function FRA01(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const q = ri(r, 3, lvl === 0 ? 9 : 15);
  let p = ri(r, 2, q - 1);
  while (gcd(p, q) !== 1) p = ri(r, 2, q - 1);
  const k = lvl === 0 ? ri(r, 2, 6) : ri(r, 4, 12);
  const n = p * k;
  const d = q * k;
  const correct = `${p}/${q}`;
  const halfDivs = divisorsOf(k).filter((t) => t > 1 && t < k);
  const cands: string[] = [];
  if (halfDivs.length) {
    const t = halfDivs[0];
    cands.push(rawStr(n / t, d / t));
  }
  cands.push(`${q}/${p}`, rawStr(n - k, d - k), `${p + 1}/${q}`, `${p}/${q + 1}`);
  return {
    stem: `Rút gọn phân số ${n}/${d} về phân số tối giản.`,
    correct,
    distractors: td(correct, cands),
    solution: `Tìm ƯCLN của tử và mẫu: ƯCLN(${n}; ${d}) = ${gcd(n, d)}. Chia cả tử và mẫu cho ${gcd(n, d)}: ${n} : ${gcd(n, d)} = ${p} và ${d} : ${gcd(n, d)} = ${q}. Vậy ${n}/${d} = ${correct}, và vì ƯCLN(${p}; ${q}) = 1 nên đây là phân số tối giản. Lưu ý: KHÔNG được trừ cùng một số ở tử và mẫu, chỉ được chia.`,
    steps: [
      `ƯCLN(${n}; ${d}) = ${gcd(n, d)}`,
      `Chia cả tử và mẫu cho ${gcd(n, d)}`,
      `Kết quả tối giản: ${correct}`,
    ],
    hint: 'Rút gọn = CHIA cả tử và mẫu cho ước chung, không phải trừ.',
    tags: ['phân số', 'rút gọn'],
  };
}

function FRA02(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const k = sc(ctx);
  if (slot % 2 === 1) {
    const b = ri(r, 3, Math.max(4, Math.round(12 * k)));
    let d = ri(r, 3, Math.max(5, Math.round(15 * k)));
    while (d === b) d = ri(r, 3, 15);
    const a = ri(r, 1, b - 1);
    const c = ri(r, 1, d - 1);
    const val = lcm(b, d);
    return {
      stem: `Khi quy đồng mẫu hai phân số ${a}/${b} và ${c}/${d}, mẫu số chung NHỎ NHẤT là bao nhiêu?`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [b * d, b + d, Math.max(b, d), gcd(b, d)]),
      solution: `Mẫu số chung nhỏ nhất chính là BCNN của hai mẫu. Ta có ${b} = ${factorStr(b)}, ${d} = ${factorStr(d)}, ƯCLN(${b}; ${d}) = ${gcd(b, d)} nên BCNN = ${b} × ${d} : ${gcd(b, d)} = ${val}. Lấy tích ${b} × ${d} = ${b * d} vẫn là mẫu chung nhưng KHÔNG phải nhỏ nhất${b * d === val ? ' (ở đây hai giá trị trùng nhau vì hai mẫu nguyên tố cùng nhau)' : ''}.`,
      steps: [
        `Phân tích: ${b} = ${factorStr(b)}; ${d} = ${factorStr(d)}`,
        `ƯCLN(${b}; ${d}) = ${gcd(b, d)}`,
        `BCNN = ${b} × ${d} : ${gcd(b, d)} = ${val}`,
      ],
      hint: 'Mẫu số chung nhỏ nhất = BCNN của các mẫu, không phải tích các mẫu.',
      tags: ['phân số', 'quy đồng'],
    };
  }
  const maxDen = lvl === 0 ? 9 : lvl === 1 ? 13 : 20;
  const fr: Frac[] = [];
  const seen = new Set<number>();
  let guard = 0;
  while (fr.length < 4 && guard++ < 200) {
    const d = ri(r, 2, Math.max(3, Math.round(maxDen * k)));
    const n = ri(r, 1, d * 2);
    const f = frac(n, d);
    if (f.d === 1) continue;
    const v = fNum(f);
    if (seen.has(v)) continue;
    seen.add(v);
    fr.push(f);
  }
  const best = fr.reduce((a, b) => (fNum(b) > fNum(a) ? b : a));
  return {
    stem: `Trong các phân số sau, phân số nào LỚN NHẤT?`,
    correct: fStr(best),
    distractors: fr.filter((f) => f !== best).map(fStr),
    solution: `Quy đồng về cùng mẫu số chung rồi so sánh tử, hoặc đổi mỗi phân số ra số thập phân: ${fr.map((f) => `${fStr(f)} ≈ ${fmt(Math.round(fNum(f) * 1000) / 1000)}`).join('; ')}. Giá trị lớn nhất là ${fmt(Math.round(fNum(best) * 1000) / 1000)} ứng với ${fStr(best)}. Không được so sánh bằng cách chỉ nhìn tử số hoặc chỉ nhìn mẫu số.`,
    steps: [
      'Đổi mỗi phân số về số thập phân (hoặc quy đồng cùng mẫu)',
      fr.map((f) => `${fStr(f)} ≈ ${fmt(Math.round(fNum(f) * 1000) / 1000)}`).join('; '),
      `So sánh → lớn nhất là ${fStr(best)}`,
    ],
    hint: 'Tử lớn chưa chắc phân số lớn — phải quy đồng hoặc đổi ra số thập phân.',
    tags: ['phân số', 'so sánh'],
  };
}

function FRA03(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const k = sc(ctx);
  const cap = Math.max(4, Math.round((lvl === 0 ? 9 : 12) * k));
  const b = ri(r, 2, cap);
  let d = ri(r, 2, cap);
  while (d === b) d = ri(r, 2, cap);
  const a = ri(r, 1, b * 2);
  const c = ri(r, 1, d * 2);

  if (lvl === 2) {
    let f3d = ri(r, 2, cap);
    while (f3d === b || f3d === d) f3d = ri(r, 2, cap);
    const e = ri(r, 1, f3d * 2);
    const res = fSub(fAdd(frac(a, b), frac(c, d)), frac(e, f3d));
    const sum = fAdd(frac(a, b), frac(c, d));
    return {
      stem: `Tính: ${a}/${b} + ${c}/${d} − ${e}/${f3d}`,
      correct: fStr(res),
      distractors: td(fStr(res), [
        rawStr(a + c - e, b + d - f3d),
        fStr(fAdd(fAdd(frac(a, b), frac(c, d)), frac(e, f3d))),
        rawStr(res.n * 2, res.d * 2),
        fStr(fSub(frac(a, b), fAdd(frac(c, d), frac(e, f3d)))),
      ]),
      solution: `Mẫu số chung là BCNN(${b}; ${d}; ${f3d}) = ${lcm(lcm(b, d), f3d)}. Cộng hai phân số đầu: ${a}/${b} + ${c}/${d} = ${fStr(sum)}. Sau đó trừ: ${fStr(sum)} − ${e}/${f3d} = ${fStr(res)}. Nhớ rút gọn kết quả cuối cùng.`,
      steps: [
        `Quy đồng: mẫu chung = ${lcm(lcm(b, d), f3d)}`,
        `${a}/${b} + ${c}/${d} = ${fStr(sum)}`,
        `${fStr(sum)} − ${e}/${f3d} = ${fStr(res)}`,
      ],
      hint: 'Làm lần lượt từ trái sang phải, mỗi bước đều phải quy đồng.',
      tags: ['phân số', 'cộng trừ', 'nhiều bước'],
    };
  }

  const isAdd = lvl === 0;
  const res = isAdd ? fAdd(frac(a, b), frac(c, d)) : fSub(frac(a, b), frac(c, d));
  const den = lcm(b, d);
  const rawN = isAdd ? (a * den) / b + (c * den) / d : (a * den) / b - (c * den) / d;
  return {
    stem: `Tính: ${a}/${b} ${isAdd ? '+' : '−'} ${c}/${d}`,
    correct: fStr(res),
    distractors: td(fStr(res), [
      rawStr(isAdd ? a + c : a - c, isAdd ? b + d : b - d === 0 ? b : b - d),
      rawStr(rawN, den),
      rawStr(isAdd ? a + c : a - c, den),
      fStr(isAdd ? fSub(frac(a, b), frac(c, d)) : fAdd(frac(a, b), frac(c, d))),
      fStr(fMul(frac(a, b), frac(c, d))),
    ]),
    solution: `Muốn ${isAdd ? 'cộng' : 'trừ'} hai phân số khác mẫu thì BẮT BUỘC phải quy đồng trước. Mẫu chung là BCNN(${b}; ${d}) = ${den}. Ta có ${a}/${b} = ${(a * den) / b}/${den} và ${c}/${d} = ${(c * den) / d}/${den}. Khi đó ${(a * den) / b}/${den} ${isAdd ? '+' : '−'} ${(c * den) / d}/${den} = ${rawN}/${den} = ${fStr(res)} sau khi rút gọn. Lỗi kinh điển là cộng thẳng tử với tử, mẫu với mẫu.`,
    steps: [
      `Mẫu chung: BCNN(${b}; ${d}) = ${den}`,
      `Quy đồng: ${a}/${b} = ${(a * den) / b}/${den}; ${c}/${d} = ${(c * den) / d}/${den}`,
      `${isAdd ? 'Cộng' : 'Trừ'} tử, giữ nguyên mẫu: ${rawN}/${den}`,
      `Rút gọn: ${fStr(res)}`,
    ],
    hint: 'Khác mẫu thì phải quy đồng — tuyệt đối không cộng tử với tử và mẫu với mẫu.',
    tags: ['phân số', 'cộng trừ', 'quy đồng'],
  };
}

function FRA04(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const b = ri(r, 2, 12);
  const d = ri(r, 2, 12);
  const a = ri(r, 1, 15);
  const c = ri(r, 1, 15);
  if (lvl === 0) {
    const res = fMul(frac(a, b), frac(c, d));
    return {
      stem: `Tính: ${a}/${b} × ${c}/${d}`,
      correct: fStr(res),
      distractors: td(fStr(res), [
        rawStr(a * c, b * d),
        fStr(fDiv(frac(a, b), frac(c, d))),
        rawStr(a + c, b + d),
        rawStr(a * d, b * c),
      ]),
      solution: `Nhân hai phân số: lấy tử nhân tử, mẫu nhân mẫu. ${a} × ${c} = ${a * c} và ${b} × ${d} = ${b * d}, được ${a * c}/${b * d}. Rút gọn cho ƯCLN(${a * c}; ${b * d}) = ${gcd(a * c, b * d)} ta được ${fStr(res)}.`,
      steps: [
        `Tử nhân tử: ${a} × ${c} = ${a * c}`,
        `Mẫu nhân mẫu: ${b} × ${d} = ${b * d}`,
        `Rút gọn ${a * c}/${b * d} = ${fStr(res)}`,
      ],
      hint: 'Nhân phân số không cần quy đồng — chỉ cần nhân thẳng tử và mẫu, rồi rút gọn.',
      tags: ['phân số', 'nhân chia'],
    };
  }
  if (lvl === 1) {
    const res = fDiv(frac(a, b), frac(c, d));
    return {
      stem: `Tính: ${a}/${b} : ${c}/${d}`,
      correct: fStr(res),
      distractors: td(fStr(res), [
        fStr(fMul(frac(a, b), frac(c, d))),
        rawStr(a * d, b * c),
        fStr(fDiv(frac(c, d), frac(a, b))),
        rawStr(a, c),
      ]),
      solution: `Chia hai phân số = nhân với phân số NGHỊCH ĐẢO của số chia: ${a}/${b} : ${c}/${d} = ${a}/${b} × ${d}/${c} = ${a * d}/${b * c} = ${fStr(res)}. Lỗi kinh điển là quên đảo ngược và nhân thẳng thành ${fStr(fMul(frac(a, b), frac(c, d)))}.`,
      steps: [
        `Đảo ngược số chia: ${c}/${d} → ${d}/${c}`,
        `Nhân: ${a}/${b} × ${d}/${c} = ${a * d}/${b * c}`,
        `Rút gọn: ${fStr(res)}`,
      ],
      hint: 'Chia phân số = nhân với nghịch đảo của phân số thứ hai.',
      tags: ['phân số', 'nhân chia'],
    };
  }
  const f = ri(r, 2, 10);
  const e = ri(r, 1, 12);
  const res = fMul(fDiv(frac(a, b), frac(c, d)), frac(e, f));
  return {
    stem: `Tính: ${a}/${b} : ${c}/${d} × ${e}/${f}`,
    correct: fStr(res),
    distractors: td(fStr(res), [
      fStr(fDiv(frac(a, b), fMul(frac(c, d), frac(e, f)))),
      fStr(fMul(fMul(frac(a, b), frac(c, d)), frac(e, f))),
      rawStr(a * d * e, b * c * f),
      fStr(fDiv(fMul(frac(a, b), frac(e, f)), frac(d, c))),
    ]),
    solution: `Phép nhân và phép chia có cùng mức ưu tiên nên thực hiện từ TRÁI SANG PHẢI. Trước hết ${a}/${b} : ${c}/${d} = ${a}/${b} × ${d}/${c} = ${fStr(fDiv(frac(a, b), frac(c, d)))}. Sau đó nhân với ${e}/${f}: ${fStr(fDiv(frac(a, b), frac(c, d)))} × ${e}/${f} = ${fStr(res)}. Nếu nhân ${c}/${d} với ${e}/${f} trước rồi mới chia là SAI thứ tự.`,
    steps: [
      `${a}/${b} : ${c}/${d} = ${fStr(fDiv(frac(a, b), frac(c, d)))}`,
      `Nhân tiếp với ${e}/${f}`,
      `Kết quả rút gọn: ${fStr(res)}`,
    ],
    hint: 'Nhân và chia cùng mức ưu tiên — làm từ trái sang phải.',
    tags: ['phân số', 'nhân chia', 'nhiều bước'],
  };
}

// ---------------------------------------------------------------------------
// Chương DEC — Số thập phân
// ---------------------------------------------------------------------------

function DEC01(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  if (lvl === 0) {
    const X = ri(r, 15, 900);
    const Y = ri(r, 15, 900);
    const isAdd = r() < 0.5 || Y > X;
    const val = isAdd ? (X + Y) / 10 : (X - Y) / 10;
    const x = X / 10;
    const y = Y / 10;
    return {
      stem: `Tính: ${fmt(x)} ${isAdd ? '+' : '−'} ${fmt(y)}`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [val * 10, val / 10, isAdd ? (X - Y) / 10 : (X + Y) / 10, (X + Y) / 100], true),
      solution: `Đặt tính sao cho các dấu phẩy thẳng cột rồi ${isAdd ? 'cộng' : 'trừ'} như số tự nhiên. Có thể quy về phần mười: ${X}/10 ${isAdd ? '+' : '−'} ${Y}/10 = ${isAdd ? X + Y : X - Y}/10 = ${fmt(val)}.`,
      steps: [
        'Viết hai số thẳng cột dấu phẩy',
        `Tính như số tự nhiên: ${X} ${isAdd ? '+' : '−'} ${Y} = ${isAdd ? X + Y : X - Y}`,
        `Đặt lại dấu phẩy: ${fmt(val)}`,
      ],
      hint: 'Cộng trừ số thập phân phải viết thẳng cột dấu phẩy.',
      tags: ['số thập phân', 'cộng trừ'],
    };
  }
  if (lvl === 1) {
    const X = ri(r, 12, 95);
    const Y = ri(r, 12, 95);
    const val = (X * Y) / 100;
    return {
      stem: `Tính: ${fmt(X / 10)} × ${fmt(Y / 10)}`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [X * Y, (X * Y) / 10, (X * Y) / 1000, (X + Y) / 10], true),
      solution: `Nhân như số tự nhiên: ${X} × ${Y} = ${X * Y}. Hai thừa số có tổng cộng 2 chữ số ở phần thập phân nên tích cũng có 2 chữ số ở phần thập phân: ${fmt(val)}. Lỗi hay gặp là đặt sai vị trí dấu phẩy.`,
      steps: [
        `Bỏ dấu phẩy, nhân: ${X} × ${Y} = ${X * Y}`,
        'Đếm tổng số chữ số ở phần thập phân của hai thừa số: 1 + 1 = 2',
        `Đặt dấu phẩy từ phải sang 2 chữ số: ${fmt(val)}`,
      ],
      hint: 'Số chữ số thập phân của tích = tổng số chữ số thập phân của hai thừa số.',
      tags: ['số thập phân', 'nhân'],
    };
  }
  // Chia hai số thập phân: dựng sao cho thương là số nguyên (dạng bài chuẩn SGK)
  const Y = ri(r, 12, 95);
  const q = ri(r, 3, 40);
  const X = Y * q;
  const val = q;
  return {
    stem: `Tính: ${fmt(X / 10)} : ${fmt(Y / 10)}`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [q * 10, q / 10, X / 10, (X + Y) / 10], true),
    solution: `Nhân cả số bị chia và số chia với 10 thì thương KHÔNG đổi, đồng thời khử được dấu phẩy: ${fmt(X / 10)} : ${fmt(Y / 10)} = ${X} : ${Y} = ${val}. Thử lại: ${fmt(Y / 10)} × ${val} = ${fmt(X / 10)} ✓.`,
    steps: [
      `Nhân cả hai số với 10: ${fmt(X / 10)} × 10 = ${X}; ${fmt(Y / 10)} × 10 = ${Y}`,
      `Thương không đổi: ${X} : ${Y} = ${val}`,
      `Thử lại: ${fmt(Y / 10)} × ${val} = ${fmt(X / 10)}`,
    ],
    hint: 'Nhân cả số bị chia và số chia với cùng một số thì thương không đổi — hãy khử dấu phẩy trước.',
    tags: ['số thập phân', 'chia'],
  };
}

function DEC02(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const n = ri(r, 1000, 99999);
  const value = n / 1000;
  const places = lvl === 0 ? 1 : lvl === 1 ? 2 : 2;
  const val = places === 1 ? Math.round(n / 100) / 10 : Math.round(n / 10) / 100;
  const truncated = places === 1 ? Math.floor(n / 100) / 10 : Math.floor(n / 10) / 100;
  const up = places === 1 ? Math.ceil(n / 100) / 10 : Math.ceil(n / 10) / 100;
  return {
    stem: `Làm tròn số ${fmt(value)} đến ${places === 1 ? 'chữ số thập phân thứ nhất (hàng phần mười)' : 'chữ số thập phân thứ hai (hàng phần trăm)'}.`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [truncated, up, Math.round(value), places === 1 ? Math.round(n / 10) / 100 : Math.round(n / 100) / 10], true),
    solution: `Để làm tròn đến ${places === 1 ? 'hàng phần mười' : 'hàng phần trăm'}, ta xét chữ số ở hàng liền sau, tức chữ số thập phân thứ ${places + 1} của ${fmt(value)}. Chữ số đó là ${places === 1 ? Math.floor((n % 100) / 10) : n % 10}; vì nó ${(places === 1 ? Math.floor((n % 100) / 10) : n % 10) >= 5 ? 'lớn hơn hoặc bằng 5 nên ta tăng chữ số đứng trước thêm 1' : 'nhỏ hơn 5 nên ta giữ nguyên chữ số đứng trước'} rồi bỏ các chữ số phía sau. Kết quả: ${fmt(val)}.`,
    steps: [
      `Xác định chữ số thập phân thứ ${places + 1}: ${places === 1 ? Math.floor((n % 100) / 10) : n % 10}`,
      'So sánh với 5 để quyết định tăng hay giữ nguyên',
      `Kết quả: ${fmt(val)}`,
    ],
    hint: 'Chỉ nhìn MỘT chữ số ngay sau hàng cần làm tròn, không nhìn cả phần còn lại.',
    tags: ['số thập phân', 'làm tròn'],
  };
}

function DEC03(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const dens = [2, 4, 5, 8, 10, 20, 25, 50];
  if (lvl === 1) {
    // Đổi số thập phân sang phân số tối giản
    const hundredths = ri(r, 5, 95);
    const f = frac(hundredths, 100);
    const value = hundredths / 100;
    return {
      stem: `Viết số thập phân ${fmt(value)} dưới dạng phân số tối giản.`,
      correct: fStr(f),
      distractors: td(fStr(f), [
        rawStr(hundredths, 100),
        rawStr(hundredths, 10),
        rawStr(100, hundredths),
        rawStr(f.n * 2, f.d * 2),
      ]),
      solution: `${fmt(value)} đọc là "${hundredths} phần trăm" nên viết được thành ${hundredths}/100. Rút gọn cho ƯCLN(${hundredths}; 100) = ${gcd(hundredths, 100)} ta được ${fStr(f)}.`,
      steps: [
        `${fmt(value)} = ${hundredths}/100`,
        `ƯCLN(${hundredths}; 100) = ${gcd(hundredths, 100)}`,
        `Rút gọn: ${fStr(f)}`,
      ],
      hint: 'Hai chữ số sau dấu phẩy ⇒ mẫu số là 100, sau đó rút gọn.',
      tags: ['số thập phân', 'phân số'],
    };
  }
  const d = pick(r, dens);
  const p = ri(r, 1, d * (lvl === 2 ? 3 : 1));
  const value = p / d;
  return {
    stem: `Viết phân số ${p}/${d} dưới dạng số thập phân.`,
    correct: fmt(value),
    numeric: value,
    distractors: nd(value, [d / p, value * 10, value / 10, p / (d * 10)], true),
    solution: `Lấy tử chia cho mẫu: ${p} : ${d} = ${fmt(value)}. Có thể nhân cả tử và mẫu để mẫu thành 10, 100 hoặc 1000: ${p}/${d} = ${(p * (100 / d)) % 1 === 0 ? `${p * (100 / d)}/100` : `${p * (1000 / d)}/1000`} = ${fmt(value)}.`,
    steps: [
      `Thực hiện phép chia ${p} : ${d}`,
      'Hoặc quy về mẫu 10 / 100 / 1000',
      `Kết quả: ${fmt(value)}`,
    ],
    hint: 'Phân số = tử chia mẫu; hoặc quy về mẫu số là lũy thừa của 10.',
    tags: ['số thập phân', 'phân số'],
  };
}

// ---------------------------------------------------------------------------
// Chương RATIO — Tỉ số và tỉ lệ thức
// ---------------------------------------------------------------------------

function RATIO01(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  if (lvl === 0) {
    const a = ri(r, 4, 40);
    const b = ri(r, 4, 40);
    if (a === b) return RATIO01(ctx);
    const f = frac(a, b);
    return {
      stem: `Tìm tỉ số của ${a} và ${b} (viết dưới dạng phân số tối giản).`,
      correct: fStr(f),
      distractors: td(fStr(f), [
        rawStr(a, b) === fStr(f) ? rawStr(a * 2, b * 2) : rawStr(a, b),
        fStr(frac(b, a)),
        rawStr(b, a),
        fmt(a - b),
      ]),
      solution: `Tỉ số của ${a} và ${b} là ${a} : ${b} = ${a}/${b}. Rút gọn cho ƯCLN(${a}; ${b}) = ${gcd(a, b)} được ${fStr(f)}. Chú ý thứ tự: "tỉ số của a và b" là a/b chứ không phải b/a.`,
      steps: [`Viết tỉ số: ${a}/${b}`, `ƯCLN(${a}; ${b}) = ${gcd(a, b)}`, `Rút gọn: ${fStr(f)}`],
      hint: 'Giữ đúng thứ tự: "tỉ số của a và b" nghĩa là a chia b.',
      tags: ['tỉ số'],
    };
  }
  if (lvl === 1) {
    const minutes = pick(r, [15, 20, 24, 30, 36, 40, 45, 50]);
    const hours = ri(r, 1, 3);
    const f = frac(minutes, hours * 60);
    return {
      stem: `Tìm tỉ số của ${minutes} phút và ${hours} giờ (viết dưới dạng phân số tối giản).`,
      correct: fStr(f),
      distractors: td(fStr(f), [
        fStr(frac(minutes, hours)),
        fStr(frac(hours * 60, minutes)),
        rawStr(minutes, hours * 60),
        fmt(minutes - hours),
      ]),
      solution: `Muốn lập tỉ số thì hai đại lượng phải CÙNG ĐƠN VỊ. Đổi ${hours} giờ = ${hours * 60} phút. Khi đó tỉ số là ${minutes} : ${hours * 60} = ${minutes}/${hours * 60} = ${fStr(f)} sau khi rút gọn. Lấy thẳng ${minutes}/${hours} là sai vì chưa đổi đơn vị.`,
      steps: [
        `Đổi ${hours} giờ = ${hours * 60} phút`,
        `Lập tỉ số: ${minutes}/${hours * 60}`,
        `Rút gọn: ${fStr(f)}`,
      ],
      hint: 'Đưa hai đại lượng về cùng đơn vị TRƯỚC khi lập tỉ số.',
      tags: ['tỉ số', 'đổi đơn vị'],
    };
  }
  const gram = pick(r, [200, 250, 300, 400, 500, 600, 750, 800]);
  const kg = ri(r, 1, 4);
  const f = frac(gram, kg * 1000);
  return {
    stem: `Tìm tỉ số của ${gram} g và ${kg} kg (viết dưới dạng phân số tối giản).`,
    correct: fStr(f),
    distractors: td(fStr(f), [
      fStr(frac(gram, kg)),
      fStr(frac(kg * 1000, gram)),
      rawStr(gram, kg * 1000),
      fStr(frac(gram, kg * 100)),
    ]),
    solution: `Đổi ${kg} kg = ${kg * 1000} g. Tỉ số là ${gram} : ${kg * 1000} = ${gram}/${kg * 1000}. Rút gọn cho ƯCLN(${gram}; ${kg * 1000}) = ${gcd(gram, kg * 1000)} được ${fStr(f)}.`,
    steps: [
      `Đổi ${kg} kg = ${kg * 1000} g`,
      `Lập tỉ số ${gram}/${kg * 1000}`,
      `Rút gọn: ${fStr(f)}`,
    ],
    hint: '1 kg = 1000 g — phải đổi đơn vị trước khi lập tỉ số.',
    tags: ['tỉ số', 'đổi đơn vị'],
  };
}

function RATIO02(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const a = ri(r, 2, lvl === 0 ? 12 : 25);
  const c = ri(r, 2, lvl === 0 ? 12 : 20);
  const t = ri(r, 2, lvl === 0 ? 8 : 15);
  const b = c * t;
  const x = a * t;
  return {
    stem: `Tìm x, biết x/${a} = ${b}/${c}.`,
    correct: fmt(x),
    numeric: x,
    distractors: nd(x, [(a * c) / b, (b * c) / a, a + b - c, (a * b) / c === x ? x + a : (a * b) / c]),
    solution: `Áp dụng tính chất tỉ lệ thức (nhân chéo): x × ${c} = ${a} × ${b}, tức ${c}x = ${a * b}. Suy ra x = ${a * b} : ${c} = ${x}. Thử lại: ${x}/${a} = ${t} và ${b}/${c} = ${t}, hai tỉ số bằng nhau nên kết quả đúng.`,
    steps: [
      `Nhân chéo: x × ${c} = ${a} × ${b}`,
      `${c}x = ${a * b}`,
      `x = ${a * b} : ${c} = ${x}`,
      `Thử lại: ${x}/${a} = ${b}/${c} = ${t}`,
    ],
    hint: 'Tính chất tỉ lệ thức: tích hai trung tỉ bằng tích hai ngoại tỉ.',
    tags: ['tỉ lệ thức'],
  };
}

function RATIO03(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const a = ri(r, 2, 9);
  let b = ri(r, 2, 9);
  while (b === a) b = ri(r, 2, 9);
  const k = lvl === 0 ? ri(r, 2, 9) : lvl === 1 ? ri(r, 5, 20) : ri(r, 8, 30);
  const S = k * (a + b);
  const x = a * k;
  const y = b * k;
  return {
    stem: `Tìm hai số x và y, biết x/${a} = y/${b} và x + y = ${S}. Giá trị của x là bao nhiêu?`,
    correct: fmt(x),
    numeric: x,
    distractors: nd(x, [y, k, S / 2, (S * a) / b]),
    solution: `Áp dụng tính chất dãy tỉ số bằng nhau: x/${a} = y/${b} = (x + y)/(${a} + ${b}) = ${S}/${a + b} = ${k}. Từ đó x = ${a} × ${k} = ${x} và y = ${b} × ${k} = ${y}. Kiểm tra: ${x} + ${y} = ${S} ✓. Lỗi hay gặp là dừng lại ở giá trị ${k} mà quên nhân với ${a}.`,
    steps: [
      `x/${a} = y/${b} = (x + y)/(${a} + ${b})`,
      `= ${S}/${a + b} = ${k}`,
      `x = ${a} × ${k} = ${x}; y = ${b} × ${k} = ${y}`,
      `Thử lại: ${x} + ${y} = ${S}`,
    ],
    hint: 'Dãy tỉ số bằng nhau: a/b = c/d = (a+c)/(b+d). Đừng quên nhân lại với hệ số.',
    tags: ['dãy tỉ số bằng nhau'],
  };
}

function RATIO04(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const a = ri(r, 2, 8);
  const b = ri(r, 2, 8);
  const c = ri(r, 2, 8);
  if (a === b && b === c) return RATIO04(ctx);
  const k = lvl === 0 ? ri(r, 3, 12) : lvl === 1 ? ri(r, 8, 25) : ri(r, 15, 60);
  const S = k * (a + b + c);
  const parts = [a * k, b * k, c * k];
  const maxPart = Math.max(...parts);
  const minPart = Math.min(...parts);
  return {
    stem: `Chia số ${S} thành ba phần tỉ lệ với ${a}; ${b}; ${c}. Phần LỚN NHẤT bằng bao nhiêu?`,
    correct: fmt(maxPart),
    numeric: maxPart,
    distractors: nd(maxPart, [minPart, k, S / 3, S - maxPart]),
    solution: `Gọi ba phần là ${a}k, ${b}k, ${c}k. Tổng: ${a}k + ${b}k + ${c}k = ${a + b + c}k = ${S} nên k = ${S} : ${a + b + c} = ${k}. Ba phần lần lượt là ${parts.join('; ')}. Phần lớn nhất là ${maxPart}. Kiểm tra tổng: ${parts.join(' + ')} = ${S} ✓.`,
    steps: [
      `Đặt ba phần là ${a}k; ${b}k; ${c}k`,
      `Tổng: ${a + b + c}k = ${S} ⇒ k = ${k}`,
      `Ba phần: ${parts.join('; ')}`,
      `Phần lớn nhất: ${maxPart}`,
    ],
    hint: 'Đặt hệ số k chung, tính k từ tổng rồi nhân ngược lại.',
    tags: ['tỉ lệ', 'chia theo tỉ lệ'],
  };
}

// ---------------------------------------------------------------------------
// Chương PROP — Đại lượng tỉ lệ thuận, tỉ lệ nghịch
// ---------------------------------------------------------------------------

function PROP01(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const k = ri(r, 2, lvl === 0 ? 9 : 15);
  const x0 = ri(r, 2, lvl === 0 ? 10 : 20);
  const y0 = k * x0;
  if (lvl === 0) {
    return {
      stem: `Đại lượng y tỉ lệ thuận với đại lượng x theo hệ số tỉ lệ k. Biết khi x = ${x0} thì y = ${y0}. Tìm k.`,
      correct: fmt(k),
      numeric: k,
      distractors: nd(k, [x0 / y0 === k ? k + 1 : x0 / y0, y0 - x0, y0 * x0, y0 + x0]),
      solution: `Vì y tỉ lệ thuận với x nên y = kx. Thay x = ${x0}, y = ${y0}: ${y0} = k × ${x0}, suy ra k = ${y0} : ${x0} = ${k}. Chú ý k = y : x chứ không phải x : y.`,
      steps: [`Công thức: y = kx`, `${y0} = k × ${x0}`, `k = ${y0} : ${x0} = ${k}`],
      hint: 'Hệ số tỉ lệ thuận k = y : x.',
      tags: ['tỉ lệ thuận'],
    };
  }
  const x1 = ri(r, 2, 25);
  const y1 = k * x1;
  return {
    stem: `Đại lượng y tỉ lệ thuận với x. Biết khi x = ${x0} thì y = ${y0}. Tính giá trị của y khi x = ${x1}.`,
    correct: fmt(y1),
    numeric: y1,
    distractors: nd(y1, [y0 + (x1 - x0), (y0 * x0) / x1, x1 / k, y0 * x1]),
    solution: `Hệ số tỉ lệ: k = ${y0} : ${x0} = ${k}, nên y = ${k}x. Khi x = ${x1} thì y = ${k} × ${x1} = ${y1}. Có thể kiểm tra bằng tỉ lệ thức: ${y0}/${x0} = ${y1}/${x1} vì cả hai đều bằng ${k}.`,
    steps: [`k = ${y0} : ${x0} = ${k}`, `y = ${k}x`, `x = ${x1} ⇒ y = ${k} × ${x1} = ${y1}`],
    hint: 'Tìm hệ số k trước, rồi thay giá trị mới vào công thức y = kx.',
    tags: ['tỉ lệ thuận'],
  };
}

function PROP02(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const unit = pick(r, [5000, 6000, 7500, 8000, 12000, 15000]);
  const n = ri(r, 2, lvl === 0 ? 8 : 12);
  const m = ri(r, 3, lvl === 0 ? 12 : 30);
  const M = unit * n;
  const val = unit * m;
  return {
    stem: `Mua ${n} quyển vở cùng loại hết ${M} đồng. Hỏi mua ${m} quyển vở như thế hết bao nhiêu đồng?`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [(M * n) / m, M * m, M + (m - n) * 1000, M * (m - n)]),
    solution: `Số tiền tỉ lệ thuận với số quyển vở. Giá một quyển: ${M} : ${n} = ${unit} đồng. Mua ${m} quyển hết ${unit} × ${m} = ${val} đồng. Cách khác — dùng tỉ lệ thức: ${M}/${n} = x/${m} ⇒ x = ${M} × ${m} : ${n} = ${val}.`,
    steps: [
      `Giá 1 quyển: ${M} : ${n} = ${unit} đồng`,
      `Mua ${m} quyển: ${unit} × ${m} = ${val} đồng`,
    ],
    hint: 'Bài toán rút về đơn vị: tìm giá một quyển trước.',
    tags: ['tỉ lệ thuận', 'toán lời văn'],
  };
}

function PROP03(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const a = ri(r, 2, 12);
  const t = ri(r, 2, lvl === 0 ? 12 : 30);
  const W = a * t;
  const divs = divisorsOf(W).filter((x) => x > 1 && x !== a && W / x !== t && x <= 40);
  if (!divs.length) return PROP03(ctx);
  const b = pick(r, divs);
  const val = W / b;
  return {
    stem: `Một đội có ${a} công nhân hoàn thành một công việc trong ${t} ngày. Hỏi nếu đội có ${b} công nhân (năng suất mỗi người như nhau) thì hoàn thành công việc đó trong bao nhiêu ngày?`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [(b * t) / a, t + (b - a), t - (b - a), (a * b) / t], true),
    solution: `Số công nhân và số ngày là hai đại lượng TỈ LỆ NGHỊCH (tích của chúng — tổng số ngày công — không đổi). Tổng số ngày công: ${a} × ${t} = ${W}. Với ${b} công nhân, số ngày là ${W} : ${b} = ${val}. Nếu dùng tỉ lệ thuận (${b} × ${t} : ${a}) sẽ ra kết quả sai.`,
    steps: [
      `Tổng khối lượng công việc: ${a} × ${t} = ${W} ngày công`,
      `Số ngày với ${b} người: ${W} : ${b} = ${val}`,
    ],
    hint: 'Càng nhiều người càng ít ngày ⇒ tỉ lệ nghịch ⇒ tích không đổi.',
    tags: ['tỉ lệ nghịch', 'toán lời văn'],
  };
}

/** Bộ cặp đại lượng đã kiểm tra thủ công — dùng cho câu phân biệt thuận / nghịch. */
const PROP_DIRECT: string[] = [
  'Quãng đường đi được và thời gian đi, khi vận tốc không đổi',
  'Số quyển vở mua và số tiền phải trả, khi giá mỗi quyển không đổi',
  'Khối lượng gạo và số tiền phải trả, khi giá mỗi ki-lô-gam không đổi',
  'Cạnh hình vuông và chu vi hình vuông đó',
  'Số giờ làm và số sản phẩm làm được, khi năng suất không đổi',
];
const PROP_INVERSE: string[] = [
  'Vận tốc và thời gian đi hết cùng một quãng đường',
  'Số công nhân và số ngày hoàn thành cùng một công việc',
  'Số máy bơm và thời gian bơm đầy cùng một bể nước',
  'Số người ăn và số ngày ăn hết cùng một lượng lương thực',
  'Chiều dài và chiều rộng của các hình chữ nhật có cùng diện tích',
];

function PROP04(ctx: GenCtx): Draft {
  const { r, slot } = ctx;
  const askInverse = slot % 2 === 0;
  const correctPool = askInverse ? PROP_INVERSE : PROP_DIRECT;
  const wrongPool = askInverse ? PROP_DIRECT : PROP_INVERSE;
  const correct = pick(r, correctPool);
  const wrongs = shuffle(r, wrongPool).slice(0, 4);
  return {
    stem: `Cặp đại lượng nào sau đây tỉ lệ ${askInverse ? 'NGHỊCH' : 'THUẬN'} với nhau?`,
    correct,
    distractors: wrongs,
    solution: `Hai đại lượng tỉ lệ thuận khi đại lượng này tăng bao nhiêu lần thì đại lượng kia cũng tăng bấy nhiêu lần (thương không đổi: y : x = k). Hai đại lượng tỉ lệ nghịch khi đại lượng này tăng bao nhiêu lần thì đại lượng kia giảm bấy nhiêu lần (tích không đổi: x × y = a). Trường hợp "${correct}" đúng là quan hệ tỉ lệ ${askInverse ? 'nghịch vì tích của chúng không đổi' : 'thuận vì thương của chúng không đổi'}. Các phương án còn lại là quan hệ tỉ lệ ${askInverse ? 'thuận' : 'nghịch'}.`,
    steps: [
      'Tỉ lệ thuận: y : x không đổi',
      'Tỉ lệ nghịch: x × y không đổi',
      `Xét từng cặp đại lượng → chọn "${correct}"`,
    ],
    hint: 'Thử tăng gấp đôi một đại lượng và xem đại lượng kia tăng gấp đôi hay giảm một nửa.',
    tags: ['tỉ lệ thuận', 'tỉ lệ nghịch', 'phân biệt'],
  };
}

// ---------------------------------------------------------------------------
// Chương PERCENT — Tỉ số phần trăm
// ---------------------------------------------------------------------------

function PERCENT01(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const p = pick(r, lvl === 0 ? [10, 20, 25, 50] : lvl === 1 ? [12, 15, 30, 40, 60, 75] : [8, 18, 35, 45, 65, 85]);
  const base = lvl === 0 ? ri(r, 2, 20) * 100 : ri(r, 4, 60) * 100;
  const val = (base * p) / 100;
  return {
    stem: `Tính ${p}% của ${base}.`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [base * p, base / p, base + val, (base * p) / 10], true),
    solution: `${p}% của ${base} nghĩa là ${base} × ${p}/100 = ${base} × ${p} : 100 = ${base * p} : 100 = ${val}. Lỗi hay gặp là nhân xong quên chia cho 100 và trả lời ${base * p}.`,
    steps: [`Viết ${p}% = ${p}/100`, `${base} × ${p} = ${base * p}`, `Chia cho 100: ${val}`],
    hint: 'p% của N = N × p : 100 — đừng quên bước chia cho 100.',
    tags: ['phần trăm'],
  };
}

function PERCENT02(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const p = pick(r, lvl === 0 ? [10, 20, 25, 50] : [15, 30, 40, 60, 75, 80]);
  const x = ri(r, 2, lvl === 0 ? 30 : 80) * 100;
  const V = (x * p) / 100;
  return {
    stem: `Biết ${p}% của một số bằng ${V}. Tìm số đó.`,
    correct: fmt(x),
    numeric: x,
    distractors: nd(x, [(V * p) / 100, V / p, V * 100, V + p], true),
    solution: `Gọi số cần tìm là x. Theo đề: x × ${p}/100 = ${V}. Suy ra x = ${V} × 100 : ${p} = ${V * 100} : ${p} = ${x}. Thử lại: ${p}% của ${x} là ${x} × ${p} : 100 = ${V} ✓. Lỗi kinh điển là làm ngược, lấy ${V} × ${p} : 100 = ${(V * p) / 100}.`,
    steps: [
      `Đặt số cần tìm là x`,
      `x × ${p} : 100 = ${V}`,
      `x = ${V} × 100 : ${p} = ${x}`,
      `Thử lại: ${p}% của ${x} = ${V}`,
    ],
    hint: 'Biết phần trăm và giá trị, muốn tìm toàn thể thì nhân 100 rồi chia cho số phần trăm.',
    tags: ['phần trăm'],
  };
}

function PERCENT03(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const b = lvl === 0 ? pick(r, [20, 25, 40, 50, 80, 100]) : pick(r, [16, 32, 60, 120, 200, 250]);
  const a = ri(r, 1, b - 1);
  const val = roundDec((a / b) * 100, 2);
  return {
    stem: `Tính tỉ số phần trăm của ${a} và ${b} (làm tròn đến chữ số thập phân thứ hai nếu cần).`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [roundDec((b / a) * 100, 2), roundDec(a / b, 2), roundDec(((b - a) / b) * 100, 2), roundDec((a / b) * 10, 2)], true),
    solution: `Tỉ số phần trăm của ${a} và ${b} bằng ${a} : ${b} × 100% = ${fmt(roundDec(a / b, 4))} × 100% = ${fmt(val)}%. Chú ý thứ tự: lấy số thứ nhất chia số thứ hai, sau đó mới nhân 100.`,
    steps: [
      `${a} : ${b} = ${fmt(roundDec(a / b, 4))}`,
      `Nhân 100: ${fmt(val)}%`,
    ],
    hint: 'Tỉ số phần trăm của a và b = a : b × 100%.',
    tags: ['phần trăm', 'tỉ số phần trăm'],
  };
}

function PERCENT04(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;
  const price = ri(r, 2, 40) * 50000;
  if (lvl === 0) {
    const p = pick(r, [10, 15, 20, 25, 30]);
    const val = (price * (100 - p)) / 100;
    return {
      stem: `Một chiếc áo có giá niêm yết ${price} đồng, được giảm giá ${p}%. Hỏi giá bán sau khi giảm là bao nhiêu đồng?`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [(price * p) / 100, price + (price * p) / 100, price - p, (price * (100 + p)) / 100]),
      solution: `Số tiền được giảm: ${price} × ${p} : 100 = ${(price * p) / 100} đồng. Giá bán sau giảm: ${price} − ${(price * p) / 100} = ${val} đồng. Cách nhanh hơn: giá bán bằng ${100 - p}% giá niêm yết, tức ${price} × ${100 - p} : 100 = ${val} đồng.`,
      steps: [
        `Tiền giảm: ${price} × ${p}% = ${(price * p) / 100}`,
        `Giá sau giảm: ${price} − ${(price * p) / 100} = ${val}`,
      ],
      hint: 'Giảm p% nghĩa là chỉ còn (100 − p)% giá gốc.',
      tags: ['phần trăm', 'giảm giá'],
    };
  }
  if (lvl === 1) {
    const p = pick(r, [10, 20, 25]);
    const q = pick(r, [10, 20, 25]);
    const afterUp = (price * (100 + p)) / 100;
    const val = roundDec((afterUp * (100 - q)) / 100, 2);
    return {
      stem: `Giá một món hàng là ${price} đồng. Cửa hàng tăng giá ${p}%, sau đó giảm giá ${q}% so với giá mới. Hỏi giá cuối cùng là bao nhiêu đồng?`,
      correct: fmt(val),
      numeric: val,
      distractors: nd(val, [price, roundDec((price * (100 + p - q)) / 100, 2), roundDec((price * (100 - q)) / 100, 2), roundDec((price * (100 + p)) / 100, 2)], true),
      solution: `Sau khi tăng ${p}%: ${price} × ${100 + p} : 100 = ${afterUp} đồng. Sau đó giảm ${q}% so với GIÁ MỚI: ${afterUp} × ${100 - q} : 100 = ${val} đồng. Bẫy ở đây là cộng trừ thẳng phần trăm (${p}% − ${q}%) rồi áp vào giá gốc — điều đó sai vì hai lần tính phần trăm dựa trên hai gốc khác nhau.`,
      steps: [
        `Sau khi tăng: ${price} × ${100 + p}% = ${afterUp}`,
        `Sau khi giảm: ${afterUp} × ${100 - q}% = ${val}`,
      ],
      hint: 'Lần giảm sau tính trên giá MỚI, không tính trên giá ban đầu.',
      tags: ['phần trăm', 'tăng giảm giá'],
    };
  }
  const p = pick(r, [10, 20, 25]);
  const q = pick(r, [10, 20, 25]);
  const after1 = (price * (100 - p)) / 100;
  const val = roundDec((after1 * (100 - q)) / 100, 2);
  return {
    stem: `Một cửa hàng giảm giá ${p}% cho tất cả sản phẩm, sau đó giảm tiếp ${q}% trên giá đã giảm. Một sản phẩm giá gốc ${price} đồng thì giá cuối cùng là bao nhiêu đồng?`,
    correct: fmt(val),
    numeric: val,
    distractors: nd(val, [roundDec((price * (100 - p - q)) / 100, 2), after1, roundDec((price * (100 - q)) / 100, 2), roundDec(price - (price * (p + q)) / 100 - 1000, 2)], true),
    solution: `Sau lần giảm thứ nhất: ${price} × ${100 - p} : 100 = ${after1} đồng. Lần giảm thứ hai tính trên ${after1} đồng: ${after1} × ${100 - q} : 100 = ${val} đồng. Nếu cộng gộp thành giảm ${p + q}% sẽ ra ${roundDec((price * (100 - p - q)) / 100, 2)} đồng — SAI, vì lần giảm thứ hai áp lên số tiền đã nhỏ hơn.`,
    steps: [
      `Sau lần 1: ${price} × ${100 - p}% = ${after1}`,
      `Sau lần 2: ${after1} × ${100 - q}% = ${val}`,
      `So sánh với cách cộng gộp sai: ${roundDec((price * (100 - p - q)) / 100, 2)}`,
    ],
    hint: 'Giảm hai lần liên tiếp KHÔNG bằng giảm tổng phần trăm một lần.',
    tags: ['phần trăm', 'giảm giá', 'nhiều bước'],
  };
}

// ===========================================================================
// XUẤT KHẨU DÙNG CHUNG
// Các file generator bổ sung (generators-algebra / -geometry / -word / -science)
// dùng lại đúng bộ tiện ích này để mọi câu hỏi có cùng phong cách và cùng mức
// đảm bảo đúng đắn — KHÔNG tự viết lại hàm tính toán riêng.
// ===========================================================================

export type { Gen };

export {
  ri,
  pick,
  shuffle,
  gcd,
  lcm,
  fmt,
  par,
  isPrime,
  primesBetween,
  compositesBetween,
  divisorsOf,
  factorize,
  factorStr,
  divisorCount,
  roundTo,
  roundDec,
  pnum,
  pstr,
  sc,
  nd,
  td,
  frac,
  fAdd,
  fSub,
  fMul,
  fDiv,
  fStr,
  fNum,
  rawStr,
};

/** 41 generator của các chương số học nền tảng, định nghĩa ngay trong file này. */
export const BASE_GENERATORS: Record<string, Gen> = {
  SET01,
  SET02,
  SET03,
  SET04,
  POW01,
  POW02,
  POW03,
  POW04,
  DIV01,
  DIV02,
  DIV03,
  DIV04,
  PRIME01,
  PRIME02,
  PRIME03,
  GCDLCM01,
  GCDLCM02,
  GCDLCM03,
  GCDLCM04,
  INT01,
  INT02,
  INT03,
  INT04,
  FRA01,
  FRA02,
  FRA03,
  FRA04,
  DEC01,
  DEC02,
  DEC03,
  RATIO01,
  RATIO02,
  RATIO03,
  RATIO04,
  PROP01,
  PROP02,
  PROP03,
  PROP04,
  PERCENT01,
  PERCENT02,
  PERCENT03,
  PERCENT04,
};
