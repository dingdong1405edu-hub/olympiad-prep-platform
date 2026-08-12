/**
 * HỒ SƠ NĂNG LỰC THEO SKILL — specs §7.2, §7.4, §9.2.
 *
 * Mastery được cập nhật sau MỖI câu trả lời, không đợi nộp hết bài: học sinh
 * làm sai 3 câu liên tiếp thì câu thứ 4 phải đã dễ hơn.
 *
 * Hồ sơ lưu cho MỌI skill của chương trình, kể cả skill chưa từng luyện — khi
 * đó `confidence = 0` để nơi khác biết đây là ước lượng chưa có bằng chứng.
 */
import type { Difficulty, ErrorPattern } from '@prisma/client';
import type { RecommendationConfig } from '@/lib/config/defaults';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '@/lib/domain';
import { clamp } from './rng';
import type { AttemptEvent, MasteryState, MasteryUpdate, SkillBreakdown, SkillNode } from './types';

// ---------------------------------------------------------------------------
// Tham số HÌNH DẠNG của công thức (không phải ngưỡng nghiệp vụ).
// Mọi ngưỡng nghiệp vụ — số lần đúng/sai liên tiếp, hệ số thời gian, ngưỡng
// mastered/gap — đều lấy từ RecommendationConfig do admin chỉnh.
// ---------------------------------------------------------------------------

/** Biên độ tối đa mastery đổi sau 1 câu khi hồ sơ còn trống. */
const BASE_STEP = 12;
/** Sau mỗi ATTEMPT_HALF_LIFE lượt, biên độ thay đổi giảm còn một nửa. */
const ATTEMPT_HALF_LIFE = 8;
/** Sàn biên độ để hồ sơ không bao giờ "đóng băng" hoàn toàn. */
const MIN_STEP = 1.5;

/** Đúng câu khó được cộng nhiều hơn đúng câu dễ. */
const DIFFICULTY_GAIN_STEP = 0.25;
/** Sai câu dễ bị trừ nhiều hơn sai câu khó. */
const DIFFICULTY_LOSS_STEP = 0.3;

/** Đúng nhưng chậm tới ngưỡng hạ độ khó chỉ còn được hưởng phần này của mức tăng. */
const SLOW_CORRECT_FACTOR = 0.3;
/** Đúng sau khi dùng gợi ý. */
const HINT_CORRECT_FACTOR = 0.35;
/** Đúng sau khi đã xem lời giải — gần như không tính công (specs §9.2). */
const SOLUTION_CORRECT_FACTOR = 0.1;

/** Mastery càng cao thì càng khó tăng thêm. */
const HEADROOM_STRENGTH = 0.55;
/** Mastery càng thấp thì mức trừ càng nhẹ (đã ở đáy không cần dìm thêm). */
const LOSS_FLOOR_SHARE = 0.35;

/** Cửa sổ trượt kết quả gần nhất (specs §7.2). */
const RECENT_WINDOW = 10;
/** Số lượt để trung bình trượt thời gian chuyển từ trung bình cộng sang EMA. */
const TIME_WINDOW = 10;
/** Chặn trên timeRatio: bỏ dở rồi quay lại không được bóp méo hồ sơ. */
const TIME_RATIO_CAP = 5;

/** Số lượt để confidence đạt 0,5 — dạng bão hòa n/(n+k), tiệm cận 1. */
const CONFIDENCE_HALF_LIFE = 8;
/** Mức phạt confidence khi kết quả gần đây dao động mạnh (đúng–sai xen kẽ). */
const CONFIDENCE_VOLATILITY_PENALTY = 0.5;

/** Sai mà thời gian chỉ bằng ngần này mức chuẩn → cẩu thả, không phải thiếu kiến thức. */
const CARELESS_TIME_RATIO = 0.35;

/** Khoảng cách an toàn để "đúng nhờ trợ giúp" không chạm ngưỡng mastered. */
const MASTERED_MARGIN = 0.01;

/** Bài chẩn đoán 15 câu chỉ là baseline nhanh (specs §1.4) → confidence trần thấp. */
const SEED_CONFIDENCE_BASE = 0.08;
const SEED_CONFIDENCE_PER_ITEM = 0.05;
const SEED_CONFIDENCE_MAX = 0.35;

const MAX_DIFFICULTY_RANK = DIFFICULTIES.length - 1;

// ---------------------------------------------------------------------------

/**
 * Hồ sơ rỗng cho một skill chưa có dữ liệu.
 * Vẫn phải được lưu xuống DB: engine cần biết skill đó tồn tại nhưng chưa đo.
 */
export function createInitialMastery(skillId: string): MasteryState {
  return {
    skillId,
    masteryScore: 0,
    confidence: 0,
    attemptCount: 0,
    correctCount: 0,
    recentAccuracy: 0,
    recentResults: [],
    avgTimeRatio: 0,
    consecutiveCorrect: 0,
    consecutiveWrong: 0,
    difficultyCeiling: 0,
    lastPracticedAt: null,
    errorCounts: {},
  };
}

/** Thời gian thực tế / thời gian chuẩn, đã chặn trên. */
function computeTimeRatio(event: AttemptEvent): number {
  const standardSeconds = event.estimatedTimeSeconds > 0 ? event.estimatedTimeSeconds : 0;
  if (standardSeconds <= 0) return 1;
  const actualSeconds = Math.max(0, event.timeMs) / 1000;
  return clamp(actualSeconds / standardSeconds, 0, TIME_RATIO_CAP);
}

function rankOf(difficulty: Difficulty): number {
  return DIFFICULTY_ORDER[difficulty] ?? 0;
}

/**
 * Suy luận loại lỗi. Thứ tự xét là CÓ CHỦ Ý, luật trên thắng luật dưới:
 *   1. Sai + quá chậm (>= ngưỡng hạ độ khó)      → TIMEOUT
 *   2. Sai + trả lời quá nhanh                    → CARELESS (đọc lướt, bấm bừa)
 *   3. Sai ở câu Khá/Giỏi (nhiều bước suy luận)   → REASONING
 *   4. Sai dù đã xem gợi ý / lời giải             → KNOWLEDGE (hổng kiến thức nền)
 *   5. Mặc định                                   → KNOWLEDGE
 * Trả lời ĐÚNG: chỉ đánh dấu TIMEOUT khi quá chậm, còn lại null.
 * READING và CALCULATION cần dữ liệu phân tích đáp án nhiễu — không suy được từ
 * một lượt trả lời, để lớp chấm chi tiết bổ sung sau.
 */
function inferErrorPattern(
  event: AttemptEvent,
  timeRatio: number,
  config: RecommendationConfig,
): ErrorPattern | null {
  const slowLimit = config.difficultyDown.minTimeRatio;

  if (event.isCorrect) {
    return timeRatio >= slowLimit ? 'TIMEOUT' : null;
  }
  if (timeRatio >= slowLimit) return 'TIMEOUT';
  if (timeRatio <= CARELESS_TIME_RATIO) return 'CARELESS';
  if (rankOf(event.difficulty) >= 1) return 'REASONING';
  return 'KNOWLEDGE';
}

/**
 * Cập nhật hồ sơ sau MỘT câu trả lời.
 *
 * Nguyên tắc: một câu không được lật ngược cả hồ sơ — biên độ thay đổi tỷ lệ
 * nghịch với số lượt đã làm, nên học sinh có 50 lượt cần nhiều bằng chứng mới
 * đổi được đánh giá.
 */
export function updateMastery(
  prev: MasteryState,
  event: AttemptEvent,
  config: RecommendationConfig,
): MasteryUpdate {
  const timeRatio = computeTimeRatio(event);
  const rank = rankOf(event.difficulty);
  const assisted = event.hintUsed || event.solutionViewedBeforeAnswer;

  // Biên độ giảm dần theo số lượt đã có
  const step = Math.max(MIN_STEP, BASE_STEP / (1 + prev.attemptCount / ATTEMPT_HALF_LIFE));

  const fastLimit = Math.max(0.1, config.difficultyUp.maxTimeRatio);
  const slowLimit = Math.max(fastLimit + 0.1, config.difficultyDown.minTimeRatio);

  let delta: number;
  let partialCredit = false;

  if (event.isCorrect) {
    // Càng chậm càng ít công: nội suy tuyến tính giữa "ngưỡng còn nhanh" và
    // "ngưỡng bị coi là quá chậm"
    let speedFactor = 1;
    if (timeRatio > fastLimit) {
      const over = clamp((timeRatio - fastLimit) / (slowLimit - fastLimit), 0, 1);
      speedFactor = 1 - over * (1 - SLOW_CORRECT_FACTOR);
      partialCredit = true;
    }

    let assistFactor = 1;
    if (event.solutionViewedBeforeAnswer) {
      assistFactor = SOLUTION_CORRECT_FACTOR;
      partialCredit = true;
    } else if (event.hintUsed) {
      assistFactor = HINT_CORRECT_FACTOR;
      partialCredit = true;
    }

    const difficultyGain = 1 + rank * DIFFICULTY_GAIN_STEP;
    const headroom = 1 - HEADROOM_STRENGTH * (prev.masteryScore / 100);
    delta = step * difficultyGain * speedFactor * assistFactor * headroom;
  } else {
    // Sai câu dễ nghiêm trọng hơn sai câu khó
    const difficultyLoss = 1 + (MAX_DIFFICULTY_RANK - rank) * DIFFICULTY_LOSS_STEP;
    const floorGuard = LOSS_FLOOR_SHARE + (1 - LOSS_FLOOR_SHARE) * (prev.masteryScore / 100);
    delta = -step * difficultyLoss * floorGuard;
  }

  let masteryScore = clamp(prev.masteryScore + delta, 0, 100);

  // specs §9.2: đúng nhờ gợi ý/lời giải KHÔNG được đưa skill lên mức "đã vững"
  if (event.isCorrect && assisted && prev.masteryScore < config.masteredThreshold) {
    masteryScore = Math.min(masteryScore, config.masteredThreshold - MASTERED_MARGIN);
  }

  const attemptCount = prev.attemptCount + 1;
  const correctCount = prev.correctCount + (event.isCorrect ? 1 : 0);

  const recentResults = [...prev.recentResults, event.isCorrect ? 1 : 0].slice(-RECENT_WINDOW);
  const recentAccuracy =
    recentResults.length > 0
      ? recentResults.reduce((sum, value) => sum + value, 0) / recentResults.length
      : 0;

  // Trung bình trượt: trung bình cộng thật khi ít dữ liệu, EMA cửa sổ 10 về sau
  const smoothingWindow = Math.min(attemptCount, TIME_WINDOW);
  const avgTimeRatio =
    prev.attemptCount === 0
      ? timeRatio
      : prev.avgTimeRatio + (timeRatio - prev.avgTimeRatio) / smoothingWindow;

  const consecutiveCorrect = event.isCorrect ? prev.consecutiveCorrect + 1 : 0;
  const consecutiveWrong = event.isCorrect ? 0 : prev.consecutiveWrong + 1;

  // Trần độ khó CHỈ tăng, và chỉ khi tự làm đúng, tốc độ tốt, đủ số lần liên tiếp
  let difficultyCeiling = prev.difficultyCeiling;
  const neededStreak = Math.max(1, config.difficultyUp.consecutiveCorrect);
  if (
    event.isCorrect &&
    !assisted &&
    timeRatio <= fastLimit &&
    consecutiveCorrect >= neededStreak &&
    rank + 1 > difficultyCeiling
  ) {
    difficultyCeiling = rank + 1;
  }

  // Bão hòa theo số lượt, trừ đi phần dao động: p(1-p) lớn nhất khi đúng–sai 50/50
  const evidence = attemptCount / (attemptCount + CONFIDENCE_HALF_LIFE);
  const volatility = 2 * recentAccuracy * (1 - recentAccuracy);
  const confidence = clamp(evidence * (1 - CONFIDENCE_VOLATILITY_PENALTY * volatility), 0, 1);

  const errorPattern = inferErrorPattern(event, timeRatio, config);

  // errorCounts chỉ cộng dồn lỗi của câu SAI — đây là nguồn của RepeatErrorFactor
  // trong Gap Priority, "đúng nhưng chậm" không phải lỗi lặp lại.
  const errorCounts: Record<string, number> = { ...prev.errorCounts };
  if (!event.isCorrect && errorPattern) {
    errorCounts[errorPattern] = (errorCounts[errorPattern] ?? 0) + 1;
  }

  const next: MasteryState = {
    skillId: prev.skillId,
    masteryScore,
    confidence,
    attemptCount,
    correctCount,
    recentAccuracy,
    recentResults,
    avgTimeRatio,
    consecutiveCorrect,
    consecutiveWrong,
    difficultyCeiling,
    lastPracticedAt: event.answeredAt,
    errorCounts,
  };

  return {
    next,
    delta: masteryScore - prev.masteryScore,
    errorPattern,
    partialCredit: event.isCorrect ? partialCredit : false,
  };
}

/**
 * Khởi tạo hồ sơ từ kết quả bài chẩn đoán đầu vào.
 *
 * Bài 15 câu chỉ phân loại nhanh (specs §1.4) nên confidence bị chặn trần thấp:
 * hồ sơ thật được hình thành trong quá trình luyện. Skill không xuất hiện trong
 * bài vẫn có bản ghi với confidence 0 (specs §7.2).
 *
 * Không có mốc thời gian trong đầu vào → `lastPracticedAt` để null, lớp gọi tự
 * gán thời điểm nộp bài nếu cần cho spaced repetition.
 */
export function seedMasteryFromScore(
  breakdowns: SkillBreakdown[],
  allSkillIds: string[],
  config: RecommendationConfig,
): MasteryState[] {
  const bySkill = new Map<string, SkillBreakdown>();
  for (const breakdown of breakdowns) bySkill.set(breakdown.skillId, breakdown);

  // Giữ nguyên thứ tự allSkillIds, bổ sung skill chỉ có trong breakdowns
  const skillIds = [...allSkillIds];
  const seen = new Set(skillIds);
  for (const breakdown of breakdowns) {
    if (!seen.has(breakdown.skillId)) {
      skillIds.push(breakdown.skillId);
      seen.add(breakdown.skillId);
    }
  }

  return skillIds.map((skillId) => {
    const state = createInitialMastery(skillId);
    const breakdown = bySkill.get(skillId);
    if (!breakdown || breakdown.total <= 0) return state;

    const total = Math.max(0, Math.round(breakdown.total));
    const correct = clamp(Math.round(breakdown.correct), 0, total);
    const accuracy = total > 0 ? correct / total : 0;

    state.masteryScore = clamp(breakdown.estimatedMastery, 0, 100);
    state.attemptCount = total;
    state.correctCount = correct;
    state.recentAccuracy = accuracy;
    state.avgTimeRatio = Math.max(0, breakdown.avgTimeRatio);
    state.confidence = Math.min(
      SEED_CONFIDENCE_MAX,
      SEED_CONFIDENCE_BASE + SEED_CONFIDENCE_PER_ITEM * total,
    );

    // Rải đều đúng/sai trong cửa sổ trượt: bài chẩn đoán không lưu thứ tự làm,
    // dồn hết câu sai về cuối sẽ khiến engine tưởng học sinh đang tuột dốc.
    const windowSize = Math.min(total, RECENT_WINDOW);
    const results: number[] = [];
    for (let i = 0; i < windowSize; i++) {
      const filled = Math.floor((i + 1) * accuracy) - Math.floor(i * accuracy);
      results.push(filled > 0 ? 1 : 0);
    }
    state.recentResults = results;

    // Chưa đủ bằng chứng ổn định để mở trần độ khó, nhưng nếu bài chẩn đoán cho
    // thấy đã vượt ngưỡng vững thì cho phép bắt đầu ở bậc Khá thay vì Trung bình.
    if (state.masteryScore >= config.masteredThreshold && accuracy >= 1) {
      state.difficultyCeiling = 1;
    }

    return state;
  });
}

/**
 * Mastery trung bình của học sinh, có trọng số theo tầm quan trọng blueprint:
 * hổng một skill trọng số cao kéo trung bình xuống mạnh hơn skill phụ.
 * Skill nằm trong chương trình nhưng chưa có hồ sơ được tính 0 điểm.
 */
export function averageMastery(masteries: MasteryState[], skills: SkillNode[]): number {
  const scoreBySkill = new Map<string, number>();
  for (const state of masteries) scoreBySkill.set(state.skillId, clamp(state.masteryScore, 0, 100));

  if (skills.length === 0) {
    if (masteries.length === 0) return 0;
    const sum = masteries.reduce((acc, state) => acc + clamp(state.masteryScore, 0, 100), 0);
    return sum / masteries.length;
  }

  let weightedSum = 0;
  let weightTotal = 0;
  for (const skill of skills) {
    const weight = Math.max(0, skill.blueprintWeight);
    weightedSum += weight * (scoreBySkill.get(skill.id) ?? 0);
    weightTotal += weight;
  }

  if (weightTotal <= 0) {
    // Toàn bộ blueprintWeight = 0 (dữ liệu chưa gắn trọng số) → trung bình cộng
    const sum = skills.reduce((acc, skill) => acc + (scoreBySkill.get(skill.id) ?? 0), 0);
    return sum / skills.length;
  }

  return weightedSum / weightTotal;
}
