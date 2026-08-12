/**
 * ĐIỂM ƯU TIÊN LỖ HỔNG (Gap Priority) — specs §7.3.
 *
 *   Priority = Deficit × Blueprint × ExamProximity × RepeatError × Prerequisite
 *
 * CÁCH ÁP TRỌNG SỐ: mỗi thừa số được nâng lũy thừa trọng số tương ứng trong
 * `config.weights` → `factor ^ weight`.
 *   - weight = 1  → giữ nguyên thừa số (hành vi mặc định)
 *   - weight = 0  → factor^0 = 1 → thừa số bị VÔ HIỆU hoàn toàn
 *   - weight > 1  → khuếch đại, weight ∈ (0,1) → làm dịu
 * Nhờ vậy đội chuyên môn tắt/bật từng yếu tố trong app_configs mà không sửa code.
 *
 * `factors` trả về là giá trị THÔ (chưa nhân trọng số) để vận hành đọc hiểu
 * được vì sao một skill lên đầu bảng.
 */
import { clamp } from './rng';
import { createInitialMastery } from './mastery';
import type { GapFactors, GapPriorityRequest, GapScore, MasteryState } from './types';

// ---------------------------------------------------------------------------
// Tham số HÌNH DẠNG công thức (ngưỡng nghiệp vụ nằm ở RecommendationConfig).
// ---------------------------------------------------------------------------

/** Sàn deficit để skill đã đạt mục tiêu vẫn có thứ hạng ổn định, không phải 0 tuyệt đối. */
const DEFICIT_FLOOR = 0.02;
/** Skill chưa có dữ liệu bị hạ còn 70% deficit: thiếu dữ liệu không phải bằng chứng yếu. */
const NO_DATA_DAMPING = 0.7;
/** Đủ số lượt này thì deficit được tin hoàn toàn. */
const FULL_EVIDENCE_ATTEMPTS = 5;

/** Chặn thừa số blueprint để một skill trọng số dị biệt không nuốt cả bảng. */
const BLUEPRINT_MIN = 0.3;
const BLUEPRINT_MAX = 3;

/** Ngoài mốc này coi như "còn xa kỳ thi", độ gần kỳ thi không tác động. */
const EXAM_HORIZON_DAYS = 90;
/** Biên độ kéo giãn theo blueprint khi kỳ thi cận kề. */
const EXAM_PROXIMITY_SPREAD = 0.8;
const EXAM_PROXIMITY_MIN = 0.5;
const EXAM_PROXIMITY_MAX = 2.5;

/** Mức tăng tối đa do lỗi lặp lại (bão hòa). */
const REPEAT_ERROR_GAIN = 0.6;
/** Số lỗi để đạt nửa mức tăng tối đa. */
const REPEAT_ERROR_HALF = 3;
/** Mức tăng tối đa do đang sai liên tiếp. */
const CONSECUTIVE_WRONG_GAIN = 0.4;

/** Mức tăng tối đa do là kiến thức nền của nhiều skill đang hổng. */
const PREREQUISITE_GAIN = 1.5;
/** Số skill phụ thuộc để đạt nửa mức tăng tối đa. */
const PREREQUISITE_HALF = 2;

/** Giáo viên chỉ định tập trung → thắng kết quả tính toán của engine. */
const TEACHER_FOCUS_BOOST = 3;

// ---------------------------------------------------------------------------

/** factor^weight, chặn weight âm và cơ số âm để không sinh NaN. */
function applyWeight(factor: number, weight: number): number {
  const safeWeight = Math.max(0, weight);
  if (safeWeight === 0) return 1;
  return Math.pow(Math.max(0, factor), safeWeight);
}

/**
 * Tập skill nằm PHÍA SAU skill này trong đồ thị tiên quyết (trực tiếp + gián
 * tiếp). Duyệt BFS trên cạnh ngược, có chống chu trình vì dữ liệu taxonomy do
 * người nhập có thể lỡ tạo vòng.
 */
function collectDownstream(skillId: string, dependents: Map<string, string[]>): Set<string> {
  const result = new Set<string>();
  const queue = [...(dependents.get(skillId) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === skillId || result.has(current)) continue;
    result.add(current);
    for (const next of dependents.get(current) ?? []) {
      if (!result.has(next)) queue.push(next);
    }
  }
  return result;
}

function buildReason(input: {
  state: MasteryState;
  target: number;
  blockedCount: number;
  downstreamGapCount: number;
  errorTotal: number;
  daysToExam: number | null;
  blueprintFactor: number;
  teacherFocused: boolean;
}): string {
  const parts: string[] = [];
  const score = Math.round(input.state.masteryScore);

  if (input.teacherFocused) parts.push('giáo viên chỉ định tập trung');

  if (input.state.attemptCount === 0) {
    parts.push('chưa có dữ liệu luyện tập nên hệ thống cần đo thử');
  } else if (input.state.masteryScore >= input.target) {
    parts.push(`mastery ${score}/100 đã đạt mục tiêu ${Math.round(input.target)}, chỉ cần duy trì`);
  } else {
    parts.push(`mastery ${score}/100 so với mục tiêu ${Math.round(input.target)}`);
  }

  if (input.downstreamGapCount > 0) {
    parts.push(`là kiến thức nền của ${input.downstreamGapCount} kỹ năng khác đang hổng`);
  }
  if (input.blockedCount > 0) {
    parts.push(`còn ${input.blockedCount} kỹ năng tiên quyết chưa vững`);
  }
  if (input.state.consecutiveWrong > 0) {
    parts.push(`đang sai ${input.state.consecutiveWrong} câu liên tiếp`);
  } else if (input.errorTotal > 0) {
    parts.push(`đã sai lặp ${input.errorTotal} lần`);
  }
  if (input.daysToExam !== null && input.daysToExam <= EXAM_HORIZON_DAYS && input.blueprintFactor > 1) {
    parts.push(`chiếm tỷ trọng cao trong đề thi, còn ${Math.max(0, Math.round(input.daysToExam))} ngày`);
  }

  const sentence = parts.join(', ');
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

/**
 * Xếp hạng skill cần vá trước. Kết quả giảm dần theo `priority`.
 * Skill không có bản ghi mastery được coi như hồ sơ rỗng (mastery 0, 0 lượt).
 */
export function computeGapPriorities(req: GapPriorityRequest): GapScore[] {
  const { skills, config } = req;
  if (skills.length === 0) return [];

  const weights = config.weights;
  const target = clamp(req.targetMastery, 1, 100);
  const gapThreshold = clamp(config.gapThreshold, 0, 100);

  const stateBySkill = new Map<string, MasteryState>();
  for (const state of req.masteries) stateBySkill.set(state.skillId, state);
  const stateOf = (skillId: string): MasteryState =>
    stateBySkill.get(skillId) ?? createInitialMastery(skillId);

  const teacherFocus = new Set(req.teacherFocusSkillIds ?? []);

  // Trọng số blueprint trung bình — mốc chuẩn hóa
  const knownIds = new Set(skills.map((skill) => skill.id));
  const blueprintSum = skills.reduce((acc, skill) => acc + Math.max(0, skill.blueprintWeight), 0);
  const avgBlueprint = blueprintSum > 0 ? blueprintSum / skills.length : 1;

  // Cạnh ngược: prerequisiteId → các skill phụ thuộc vào nó
  const dependents = new Map<string, string[]>();
  for (const skill of skills) {
    for (const prerequisiteId of skill.prerequisiteIds) {
      if (!knownIds.has(prerequisiteId)) continue;
      const list = dependents.get(prerequisiteId);
      if (list) list.push(skill.id);
      else dependents.set(prerequisiteId, [skill.id]);
    }
  }

  // Độ gần kỳ thi: 0 = còn xa / chưa có mốc thi, 1 = thi ngay ngày mai
  const urgency =
    req.daysToExam === null ? 0 : clamp(1 - Math.max(0, req.daysToExam) / EXAM_HORIZON_DAYS, 0, 1);

  const scores: GapScore[] = skills.map((skill) => {
    const state = stateOf(skill.id);

    // --- Deficit ---------------------------------------------------------
    const rawDeficit = clamp((target - state.masteryScore) / target, 0, 1);
    const evidence = clamp(state.attemptCount / FULL_EVIDENCE_ATTEMPTS, 0, 1);
    const damping = NO_DATA_DAMPING + (1 - NO_DATA_DAMPING) * evidence;
    const deficit = Math.max(DEFICIT_FLOOR, rawDeficit * damping);

    // --- Blueprint -------------------------------------------------------
    const blueprint = clamp(
      Math.max(0, skill.blueprintWeight) / avgBlueprint,
      BLUEPRINT_MIN,
      BLUEPRINT_MAX,
    );

    // --- Độ gần kỳ thi ---------------------------------------------------
    // Càng cận ngày thi càng dồn về phần trọng số cao của đề, phần phụ bị nén lại.
    const examProximity = clamp(
      1 + urgency * (blueprint - 1) * EXAM_PROXIMITY_SPREAD,
      EXAM_PROXIMITY_MIN,
      EXAM_PROXIMITY_MAX,
    );

    // --- Lỗi lặp lại -----------------------------------------------------
    const errorTotal = Object.values(state.errorCounts).reduce(
      (acc, count) => acc + Math.max(0, count),
      0,
    );
    const streakLimit = Math.max(1, config.difficultyDown.consecutiveWrong);
    const repeatError =
      1 +
      REPEAT_ERROR_GAIN * (errorTotal / (errorTotal + REPEAT_ERROR_HALF)) +
      CONSECUTIVE_WRONG_GAIN * clamp(state.consecutiveWrong / streakLimit, 0, 1);

    // --- Hệ số tiên quyết ------------------------------------------------
    const downstream = collectDownstream(skill.id, dependents);
    let downstreamGapCount = 0;
    for (const dependentId of downstream) {
      if (stateOf(dependentId).masteryScore < gapThreshold) downstreamGapCount += 1;
    }
    const prerequisite =
      1 +
      PREREQUISITE_GAIN * (downstreamGapCount / (downstreamGapCount + PREREQUISITE_HALF));

    // Skill tiên quyết trực tiếp chưa vững → nên học trước skill này
    const blockedBySkillIds = skill.prerequisiteIds.filter(
      (prerequisiteId) =>
        knownIds.has(prerequisiteId) && stateOf(prerequisiteId).masteryScore < gapThreshold,
    );

    const factors: GapFactors = {
      deficit,
      blueprint,
      examProximity,
      repeatError,
      prerequisite,
    };

    const teacherFocused = teacherFocus.has(skill.id);
    const priority =
      applyWeight(deficit, weights.deficit) *
      applyWeight(blueprint, weights.blueprint) *
      applyWeight(examProximity, weights.examProximity) *
      applyWeight(repeatError, weights.repeatError) *
      applyWeight(prerequisite, weights.prerequisite) *
      (teacherFocused ? TEACHER_FOCUS_BOOST : 1);

    return {
      skillId: skill.id,
      priority,
      factors,
      masteryScore: state.masteryScore,
      targetMastery: target,
      blockedBySkillIds,
      reason: buildReason({
        state,
        target,
        blockedCount: blockedBySkillIds.length,
        downstreamGapCount,
        errorTotal,
        daysToExam: req.daysToExam,
        blueprintFactor: blueprint,
        teacherFocused,
      }),
    };
  });

  // Sắp xếp ổn định: ưu tiên → thiếu hụt → thứ tự trong chương trình → id
  const orderBySkill = new Map(skills.map((skill) => [skill.id, skill.order]));
  return scores.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.factors.deficit !== a.factors.deficit) return b.factors.deficit - a.factors.deficit;
    const orderA = orderBySkill.get(a.skillId) ?? 0;
    const orderB = orderBySkill.get(b.skillId) ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.skillId.localeCompare(b.skillId);
  });
}
