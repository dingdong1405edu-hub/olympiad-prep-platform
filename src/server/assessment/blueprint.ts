/**
 * BLUEPRINT ĐỀ KIỂM TRA (specs §7.9 diagnostic, §7.10 progress).
 *
 * Blueprint trả lời hai câu hỏi: "đề rải vào chương nào, tỷ lệ bao nhiêu" và
 * "mức tự khai của học sinh quyết định vùng độ khó xuất phát ra sao". Bài 15 câu
 * KHÔNG được random đơn thuần.
 *
 * File này chỉ sinh giá trị KHỞI TẠO. Bản chính thức nằm ở cột
 * `Assessment.blueprint` (JSON) để Program Manager sửa trong admin mà không
 * đụng vào code (specs §9.4a).
 */
import type { Difficulty, StudentLevel } from '@prisma/client';
import type { BlueprintSpec } from '@/engine';
import { clamp } from '@/engine';
import { DIFFICULTIES, STUDENT_LEVELS } from '@/lib/domain';

// ---------------------------------------------------------------------------
// GIÁ TRỊ KHỞI TẠO — cấu hình được qua Assessment.blueprint trong admin
// ---------------------------------------------------------------------------

/**
 * Tỷ trọng 3 bậc độ khó theo mức TỰ KHAI, đúng bảng specs §7.9.
 * Mức tự khai chỉ chọn vùng xuất phát, không phải kết luận về học sinh.
 *   - Kém        : nhiều câu cơ bản + vài câu trung bình để dò trần năng lực
 *   - Trung bình : trộn cơ bản + trung bình + vài câu khá, tìm khoảng chuyển tiếp
 *   - Khá        : tăng trung bình/khá, cài vài câu giỏi để tách "khá thật" khỏi "học mẹo"
 *   - Giỏi       : trọng tâm khá/giỏi, vẫn giữ câu neo cơ bản để so sánh được
 * Cấu hình được qua Assessment.blueprint trong admin.
 */
export const DEFAULT_DIFFICULTY_MIX_BY_LEVEL: Record<StudentLevel, Record<Difficulty, number>> = {
  WEAK: { AVERAGE: 0.8, GOOD: 0.2, EXCELLENT: 0 },
  AVERAGE: { AVERAGE: 0.55, GOOD: 0.35, EXCELLENT: 0.1 },
  GOOD: { AVERAGE: 0.3, GOOD: 0.45, EXCELLENT: 0.25 },
  EXCELLENT: { AVERAGE: 0.2, GOOD: 0.4, EXCELLENT: 0.4 },
};

/**
 * Tỷ lệ câu neo cơ bản tối thiểu trong đề (so với tổng số câu).
 * Kể cả học sinh tự khai Giỏi vẫn phải có mốc cơ bản, nếu không hai bài của hai
 * mức khác nhau sẽ không so sánh được với nhau.
 * Cấu hình được qua Assessment.blueprint trong admin.
 */
export const DEFAULT_ANCHOR_RATIO = 0.2;

/** Trọng số chương khi dữ liệu taxonomy chưa gắn trọng số. */
export const DEFAULT_CHAPTER_WEIGHT = 1;

// ---------------------------------------------------------------------------
// Kiểu dữ liệu đầu vào
// ---------------------------------------------------------------------------

export interface BlueprintChapterInput {
  id: string;
  blueprintWeight?: number | null;
}

export interface BuildBlueprintOptions {
  /** Số câu của đề — quyết định số câu neo tối thiểu. */
  itemCount: number;
  /** Ghi đè một phần tỷ trọng độ khó (admin gửi lên). */
  difficultyMixByLevel?: Partial<Record<StudentLevel, Partial<Record<Difficulty, number>>>>;
  /** Ghi đè số câu neo tối thiểu. */
  minAnchorItems?: number;
}

// ---------------------------------------------------------------------------
// Chuẩn hóa
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** Đưa tỷ lệ 3 bậc về tổng = 1; tổng <= 0 thì trả null để lớp gọi dùng mặc định. */
function normalizeMix(raw: Partial<Record<Difficulty, number>> | undefined): Record<Difficulty, number> | null {
  if (!raw) return null;
  const values: Record<Difficulty, number> = { AVERAGE: 0, GOOD: 0, EXCELLENT: 0 };
  let total = 0;
  for (const difficulty of DIFFICULTIES) {
    const value = raw[difficulty];
    const safe = typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
    values[difficulty] = safe;
    total += safe;
  }
  if (total <= 0) return null;
  for (const difficulty of DIFFICULTIES) values[difficulty] = values[difficulty] / total;
  return values;
}

function buildMixByLevel(
  override?: Partial<Record<StudentLevel, Partial<Record<Difficulty, number>>>>,
  fallback: Record<StudentLevel, Record<Difficulty, number>> = DEFAULT_DIFFICULTY_MIX_BY_LEVEL,
): Record<StudentLevel, Record<Difficulty, number>> {
  const result = {} as Record<StudentLevel, Record<Difficulty, number>>;
  for (const level of STUDENT_LEVELS) {
    result[level] =
      normalizeMix(override?.[level]) ??
      normalizeMix(fallback[level]) ??
      normalizeMix(DEFAULT_DIFFICULTY_MIX_BY_LEVEL[level]) ??
      { AVERAGE: 1, GOOD: 0, EXCELLENT: 0 };
  }
  return result;
}

// ---------------------------------------------------------------------------

/**
 * Blueprint mặc định cho một khóa: tỷ trọng chương lấy thẳng từ
 * `Chapter.blueprintWeight` do đội chuyên môn khai, không tự chế trong code.
 */
export function buildDefaultBlueprint(
  chapters: BlueprintChapterInput[],
  options: BuildBlueprintOptions,
): BlueprintSpec {
  const itemCount = Math.max(0, Math.floor(options.itemCount));

  const chapterWeights: Record<string, number> = {};
  for (const chapter of chapters) {
    if (!chapter.id) continue;
    chapterWeights[chapter.id] = positiveNumber(chapter.blueprintWeight) ?? DEFAULT_CHAPTER_WEIGHT;
  }

  const minAnchorItems =
    options.minAnchorItems !== undefined && Number.isFinite(options.minAnchorItems)
      ? clamp(Math.floor(options.minAnchorItems), 0, itemCount)
      : clamp(Math.round(itemCount * DEFAULT_ANCHOR_RATIO), 0, itemCount);

  return {
    chapterWeights,
    difficultyMixByLevel: buildMixByLevel(options.difficultyMixByLevel),
    minAnchorItems,
  };
}

/**
 * Đọc blueprint đã lưu trong DB (JSON tự do do admin sửa) về đúng kiểu engine.
 * Mọi phần khuyết/hỏng đều rơi về `fallback` — đề vẫn ra được, không chặn học sinh.
 */
export function parseBlueprint(json: unknown, fallback: BlueprintSpec): BlueprintSpec {
  if (!isPlainObject(json)) return fallback;

  const chapterWeights: Record<string, number> = {};
  const rawChapters = json.chapterWeights;
  if (isPlainObject(rawChapters)) {
    for (const [chapterId, weight] of Object.entries(rawChapters)) {
      const value = positiveNumber(weight);
      if (chapterId && value !== null) chapterWeights[chapterId] = value;
    }
  }

  const rawMix = json.difficultyMixByLevel;
  const mixOverride: Partial<Record<StudentLevel, Partial<Record<Difficulty, number>>>> = {};
  if (isPlainObject(rawMix)) {
    for (const level of STUDENT_LEVELS) {
      const entry = rawMix[level];
      if (!isPlainObject(entry)) continue;
      const partial: Partial<Record<Difficulty, number>> = {};
      for (const difficulty of DIFFICULTIES) {
        const value = entry[difficulty];
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) partial[difficulty] = value;
      }
      if (Object.keys(partial).length > 0) mixOverride[level] = partial;
    }
  }

  const rawAnchor = json.minAnchorItems;
  const minAnchorItems =
    typeof rawAnchor === 'number' && Number.isFinite(rawAnchor) && rawAnchor >= 0
      ? Math.floor(rawAnchor)
      : fallback.minAnchorItems;

  return {
    chapterWeights: Object.keys(chapterWeights).length > 0 ? chapterWeights : fallback.chapterWeights,
    difficultyMixByLevel: buildMixByLevel(mixOverride, fallback.difficultyMixByLevel),
    minAnchorItems,
  };
}

/** Blueprint đã lưu có còn dùng được không — dùng để tự sửa đề khi taxonomy đổi. */
export function hasUsableChapterWeights(json: unknown): boolean {
  if (!isPlainObject(json)) return false;
  const rawChapters = json.chapterWeights;
  if (!isPlainObject(rawChapters)) return false;
  return Object.values(rawChapters).some((weight) => positiveNumber(weight) !== null);
}
