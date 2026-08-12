/**
 * CHẤM BÀI KIỂM TRA (specs §7.9).
 *
 * Cấm tuyệt đối kiểu "đúng 10/15 = Khá": điểm phải phản ánh ĐỘ KHÓ + CHỦ ĐỀ +
 * THỜI GIAN. Hai học sinh cùng số câu đúng nhưng sai ở kỹ năng khác nhau bắt
 * buộc ra hai hồ sơ khác nhau (tiêu chí nghiệm thu §17).
 *
 * Toàn bộ ngưỡng quy đổi điểm → mức năng lực nằm trong `LevelConfig` (admin sửa
 * được), engine chỉ nội suy trên các mốc đó chứ không tự chế ngưỡng.
 */
import type { StudentLevel } from '@prisma/client';
import type { LevelConfig } from '@/lib/config/defaults';
import { DIFFICULTY_WEIGHT, LEVEL_ORDER, STUDENT_LEVELS } from '@/lib/domain';
import { clamp } from './rng';
import type {
  ChapterBreakdown,
  ScoreResult,
  ScoredAttemptItem,
  SkillBreakdown,
} from './types';

/**
 * Hằng số HÌNH DẠNG của công thức chấm (không phải tham số nghiệp vụ):
 * làm đúng nhưng chậm gấp đôi thời gian chuẩn chỉ được tính khoảng 71% giá trị,
 * và không bao giờ bị trừ quá một nửa — "đúng nhưng quá chậm thì chưa mastered"
 * (specs §7.4) chứ không phải "chậm thì coi như sai".
 */
const SPEED_PENALTY_EXPONENT = 0.5;
const MIN_SPEED_FACTOR = 0.5;

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Tỷ lệ thời gian thực tế / thời gian chuẩn; câu thiếu thời gian chuẩn coi như đúng nhịp. */
function timeRatioOf(item: ScoredAttemptItem): number {
  if (!(item.estimatedTimeSeconds > 0)) return 1;
  const seconds = Math.max(0, item.timeMs) / 1000;
  return seconds / item.estimatedTimeSeconds;
}

/** Hệ số tốc độ: nhanh hơn chuẩn không được thưởng, chậm hơn thì bị chiết khấu. */
function speedFactor(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 1) return 1;
  return clamp(1 / ratio ** SPEED_PENALTY_EXPONENT, MIN_SPEED_FACTOR, 1);
}

interface CurvePoint {
  percent: number;
  mastery: number;
}

/**
 * Đường quy đổi % điểm có trọng số sang mastery 0–100, dựng từ chính các mốc
 * cấu hình: (ngưỡng điểm của mức) → (mastery mục tiêu của mức).
 */
function masteryCurve(levelConfig: LevelConfig): CurvePoint[] {
  const points: CurvePoint[] = [{ percent: 0, mastery: 0 }];
  const levels = [...STUDENT_LEVELS].sort((a, b) => LEVEL_ORDER[a] - LEVEL_ORDER[b]);
  for (const level of levels) {
    const percent = clamp(levelConfig.scoreThresholds?.[level] ?? 0, 0, 100);
    const mastery = clamp(levelConfig.masteryTargets?.[level] ?? 0, 0, 100);
    // Ngưỡng 0 là mức sàn hiển thị, không phải mốc của đường quy đổi.
    if (percent <= 0) continue;
    points.push({ percent, mastery });
  }
  points.push({ percent: 100, mastery: 100 });
  points.sort((a, b) => a.percent - b.percent);
  for (let i = 1; i < points.length; i++) {
    if (points[i].mastery < points[i - 1].mastery) points[i].mastery = points[i - 1].mastery;
  }
  return points;
}

function masteryFromPercent(percent: number, curve: CurvePoint[]): number {
  const value = clamp(percent, 0, 100);
  for (let i = 1; i < curve.length; i++) {
    const low = curve[i - 1];
    const high = curve[i];
    if (value <= high.percent) {
      const span = high.percent - low.percent;
      if (span <= 0) return high.mastery;
      return low.mastery + ((value - low.percent) / span) * (high.mastery - low.mastery);
    }
  }
  return curve[curve.length - 1].mastery;
}

interface Bucket {
  correct: number;
  total: number;
  earned: number;
  possible: number;
  ratioSum: number;
}

function emptyBucket(): Bucket {
  return { correct: 0, total: 0, earned: 0, possible: 0, ratioSum: 0 };
}

export function scoreAttempt(items: ScoredAttemptItem[], levelConfig: LevelConfig): ScoreResult {
  const curve = masteryCurve(levelConfig);
  const lowestLevel = lowestConfiguredLevel(levelConfig);

  if (items.length === 0) {
    return {
      rawScore: 0,
      maxScore: 0,
      weightedScore: 0,
      weightedMax: 0,
      percent: 0,
      estimatedLevel: lowestLevel,
      totalTimeMs: 0,
      avgTimeRatio: 0,
      bySkill: [],
      byChapter: [],
      weakestSkillIds: [],
      strongestSkillIds: [],
    };
  }

  let rawScore = 0;
  let weightedScore = 0;
  let weightedMax = 0;
  let totalTimeMs = 0;
  let ratioSum = 0;

  const skillBuckets = new Map<string, Bucket>();
  const chapterBuckets = new Map<string, Bucket>();

  for (const item of items) {
    const weight = DIFFICULTY_WEIGHT[item.difficulty] ?? 1;
    const ratio = timeRatioOf(item);
    const timeMs = Math.max(0, item.timeMs);

    weightedMax += weight;
    totalTimeMs += timeMs;
    ratioSum += ratio;
    if (item.isCorrect) {
      rawScore += 1;
      weightedScore += weight;
    }

    const skill = skillBuckets.get(item.skillId) ?? emptyBucket();
    skill.total += 1;
    skill.possible += weight;
    skill.ratioSum += ratio;
    if (item.isCorrect) {
      skill.correct += 1;
      // Đúng ở câu khó ăn nhiều điểm hơn; đúng mà lề mề thì bị chiết khấu.
      skill.earned += weight * speedFactor(ratio);
    }
    skillBuckets.set(item.skillId, skill);

    const chapter = chapterBuckets.get(item.chapterId) ?? emptyBucket();
    chapter.total += 1;
    chapter.possible += weight;
    chapter.ratioSum += ratio;
    if (item.isCorrect) {
      chapter.correct += 1;
      chapter.earned += weight * speedFactor(ratio);
    }
    chapterBuckets.set(item.chapterId, chapter);
  }

  const percent = weightedMax > 0 ? clamp((weightedScore / weightedMax) * 100, 0, 100) : 0;
  const avgTimeRatio = ratioSum / items.length;

  const bySkill: SkillBreakdown[] = [...skillBuckets.entries()]
    .map(([skillId, bucket]) => ({
      skillId,
      correct: bucket.correct,
      total: bucket.total,
      accuracy: bucket.total > 0 ? round(bucket.correct / bucket.total, 4) : 0,
      estimatedMastery: round(
        masteryFromPercent(
          bucket.possible > 0 ? (bucket.earned / bucket.possible) * 100 : 0,
          curve,
        ),
        1,
      ),
      avgTimeRatio: bucket.total > 0 ? round(bucket.ratioSum / bucket.total, 3) : 0,
    }))
    .sort((a, b) => (a.skillId < b.skillId ? -1 : a.skillId > b.skillId ? 1 : 0));

  const byChapter: ChapterBreakdown[] = [...chapterBuckets.entries()]
    .map(([chapterId, bucket]) => ({
      chapterId,
      correct: bucket.correct,
      total: bucket.total,
      accuracy: bucket.total > 0 ? round(bucket.correct / bucket.total, 4) : 0,
    }))
    .sort((a, b) => (a.chapterId < b.chapterId ? -1 : a.chapterId > b.chapterId ? 1 : 0));

  // Chỉ xếp hạng skill thực sự có dữ liệu trong bài; caller tự cắt top-N.
  const ranked = bySkill.filter((s) => s.total >= 1);
  const weakestSkillIds = [...ranked]
    .sort(
      (a, b) =>
        a.estimatedMastery - b.estimatedMastery ||
        a.accuracy - b.accuracy ||
        (a.skillId < b.skillId ? -1 : 1),
    )
    .map((s) => s.skillId);
  const strongestSkillIds = [...weakestSkillIds].reverse();

  return {
    rawScore,
    maxScore: items.length,
    weightedScore: round(weightedScore, 3),
    weightedMax: round(weightedMax, 3),
    percent: round(percent, 2),
    estimatedLevel: estimateLevel(percent, levelConfig),
    totalTimeMs,
    avgTimeRatio: round(avgTimeRatio, 3),
    bySkill,
    byChapter,
    weakestSkillIds,
    strongestSkillIds,
  };
}

/** Mức có ngưỡng thấp nhất — dùng làm mặc định khi điểm chưa vượt ngưỡng nào. */
function lowestConfiguredLevel(levelConfig: LevelConfig): StudentLevel {
  const sorted = sortLevelsByThreshold(levelConfig);
  return sorted[0] ?? 'WEAK';
}

function sortLevelsByThreshold(levelConfig: LevelConfig): StudentLevel[] {
  return [...STUDENT_LEVELS].sort(
    (a, b) =>
      (levelConfig.scoreThresholds?.[a] ?? 0) - (levelConfig.scoreThresholds?.[b] ?? 0) ||
      LEVEL_ORDER[a] - LEVEL_ORDER[b],
  );
}

/** Mức cao nhất mà % điểm có trọng số vượt qua ngưỡng cấu hình. */
export function estimateLevel(percent: number, levelConfig: LevelConfig): StudentLevel {
  const value = clamp(Number.isFinite(percent) ? percent : 0, 0, 100);
  const sorted = sortLevelsByThreshold(levelConfig);
  let result: StudentLevel = sorted[0] ?? 'WEAK';
  for (const level of sorted) {
    if (value >= (levelConfig.scoreThresholds?.[level] ?? 0)) result = level;
  }
  return result;
}
