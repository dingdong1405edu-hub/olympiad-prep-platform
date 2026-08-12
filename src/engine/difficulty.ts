/**
 * LUẬT CHỌN & ĐIỀU CHỈNH ĐỘ KHÓ — specs §7.4.
 *
 * | Tình huống                              | Hành động                        |
 * |-----------------------------------------|----------------------------------|
 * | Sai liên tiếp hoặc thời gian quá dài     | Hạ bậc + đưa bài tiên quyết      |
 * | Đúng ổn định, thời gian tốt              | Tăng một bậc                     |
 * | Còn lại                                  | Giữ nguyên                       |
 *
 * `reasonCode` là hằng SNAKE_CASE ổn định để thống kê/lọc về sau; `reason` là
 * câu tiếng Việt hiển thị cho học sinh ở mục "Vì sao hệ thống giao bài này".
 */
import type { RecommendationConfig } from '@/lib/config/defaults';
import { DIFFICULTIES, DIFFICULTY_LABEL, difficultyFromOrder } from '@/lib/domain';
import { clamp } from './rng';
import type { DifficultyDecision, DifficultyDirection, MasteryState } from './types';

const MAX_RANK = DIFFICULTIES.length - 1;

/** Mã lý do — dùng cho báo cáo vận hành, không đổi tùy tiện. */
export const DIFFICULTY_REASON_CODES = {
  DOWN_REPEATED_WRONG: 'DIFFICULTY_DOWN_REPEATED_WRONG',
  DOWN_TOO_SLOW: 'DIFFICULTY_DOWN_TOO_SLOW',
  UP_STABLE_CORRECT: 'DIFFICULTY_UP_STABLE_CORRECT',
  HOLD_NO_DATA: 'DIFFICULTY_HOLD_NO_DATA',
  HOLD_STABLE: 'DIFFICULTY_HOLD_STABLE',
} as const;

/**
 * Bậc nền suy từ mastery: dưới ngưỡng hổng → Trung bình, đạt ngưỡng vững →
 * Giỏi, ở giữa → Khá. `difficultyCeiling` (bậc đã chứng minh làm được) chỉ cho
 * phép vượt trần cũ đúng 1 bậc — tránh nhảy cóc khi mastery tăng đột biến.
 */
function baseRank(mastery: MasteryState, config: RecommendationConfig): number {
  const gapThreshold = clamp(config.gapThreshold, 0, 100);
  const masteredThreshold = clamp(config.masteredThreshold, gapThreshold, 100);

  let rank: number;
  if (mastery.masteryScore >= masteredThreshold) rank = 2;
  else if (mastery.masteryScore >= gapThreshold) rank = 1;
  else rank = 0;

  if (mastery.difficultyCeiling > 0) {
    // difficultyCeiling 1..3 tương ứng bậc 0..2
    const provenRank = clamp(mastery.difficultyCeiling - 1, 0, MAX_RANK);
    rank = Math.min(rank, provenRank + 1);
  }

  return clamp(rank, 0, MAX_RANK);
}

/** Quyết định bậc độ khó tiếp theo cho một skill. */
export function decideDifficulty(
  mastery: MasteryState,
  config: RecommendationConfig,
): DifficultyDecision {
  const up = config.difficultyUp;
  const down = config.difficultyDown;

  // Chưa có lượt nào thì avgTimeRatio = 0, không được hiểu nhầm là "làm rất nhanh"
  const hasTimeSignal = mastery.attemptCount > 0;
  const wrongLimit = Math.max(1, down.consecutiveWrong);
  const correctLimit = Math.max(1, up.consecutiveCorrect);

  const repeatedWrong = mastery.consecutiveWrong >= wrongLimit;
  const tooSlow = hasTimeSignal && mastery.avgTimeRatio >= down.minTimeRatio;
  const stableCorrect =
    mastery.consecutiveCorrect >= correctLimit && hasTimeSignal && mastery.avgTimeRatio <= up.maxTimeRatio;

  let direction: DifficultyDirection = 'HOLD';
  let reasonCode: string = DIFFICULTY_REASON_CODES.HOLD_STABLE;
  let needsPrerequisite = false;
  let shift = 0;

  if (repeatedWrong || tooSlow) {
    direction = 'DOWN';
    shift = -1;
    // Hạ bậc chưa đủ: phải quay lại kiến thức nền, nếu không em sẽ sai tiếp
    needsPrerequisite = true;
    reasonCode = repeatedWrong
      ? DIFFICULTY_REASON_CODES.DOWN_REPEATED_WRONG
      : DIFFICULTY_REASON_CODES.DOWN_TOO_SLOW;
  } else if (stableCorrect) {
    direction = 'UP';
    shift = 1;
    reasonCode = DIFFICULTY_REASON_CODES.UP_STABLE_CORRECT;
  } else if (!hasTimeSignal) {
    reasonCode = DIFFICULTY_REASON_CODES.HOLD_NO_DATA;
  }

  const difficulty = difficultyFromOrder(clamp(baseRank(mastery, config) + shift, 0, MAX_RANK));
  const label = DIFFICULTY_LABEL[difficulty];

  let reason: string;
  switch (reasonCode) {
    case DIFFICULTY_REASON_CODES.DOWN_REPEATED_WRONG:
      reason = `Em sai ${mastery.consecutiveWrong} câu liên tiếp ở kỹ năng này, hệ thống hạ về mức ${label} và bổ sung bài kiến thức nền.`;
      break;
    case DIFFICULTY_REASON_CODES.DOWN_TOO_SLOW:
      reason = `Thời gian làm bài đang gấp khoảng ${mastery.avgTimeRatio.toFixed(1)} lần mức chuẩn, hệ thống hạ về mức ${label} để em làm chắc trước khi tăng tốc.`;
      break;
    case DIFFICULTY_REASON_CODES.UP_STABLE_CORRECT:
      reason = `Em đúng ${mastery.consecutiveCorrect} câu liên tiếp với tốc độ tốt, hệ thống nâng lên mức ${label}.`;
      break;
    case DIFFICULTY_REASON_CODES.HOLD_NO_DATA:
      reason = `Kỹ năng này chưa có dữ liệu luyện tập, hệ thống bắt đầu ở mức ${label} để đo năng lực.`;
      break;
    default:
      reason = `Kết quả gần đây chưa đủ ổn định để đổi bậc, hệ thống giữ mức ${label}.`;
  }

  return { difficulty, direction, reasonCode, reason, needsPrerequisite };
}
