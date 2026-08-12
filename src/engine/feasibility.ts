/**
 * TÍNH KHẢ THI CỦA MỤC TIÊU (specs §7.7).
 *
 * Engine TÍNH NGƯỢC: từ khối lượng mastery còn thiếu suy ra số phút cần luyện,
 * so với quỹ thời gian thật của học sinh. Khi không khả thi, hệ thống KHÔNG chỉ
 * báo lỗi mà phải đưa phương án cụ thể: tăng cường độ hoặc lùi mốc — và luôn
 * chào 2–3 phương án để học sinh chọn, không ép một kế hoạch duy nhất (§5.3, §6.1).
 */
import type { GoalFeasibility, StudentLevel } from '@prisma/client';
import type { LevelConfig, RecommendationConfig } from '@/lib/config/defaults';
import { LEVEL_LABEL, LEVEL_ORDER, STUDENT_LEVELS, formatMinutes } from '@/lib/domain';
import { clamp } from './rng';
import type {
  FeasibilityRequest,
  FeasibilityResult,
  GoalOption,
  MasteryState,
  SkillNode,
} from './types';

/** Đầu vào sinh danh sách phương án mục tiêu cho học sinh chọn. */
export interface GoalOptionsRequest {
  masteries: MasteryState[];
  skills: SkillNode[];
  currentLevel: StudentLevel;
  daysPerWeek: number;
  minutesPerDay: number;
  levelConfig: LevelConfig;
  config: RecommendationConfig;
  /** Trần số tuần học sinh chấp nhận; bỏ trống = không giới hạn. */
  maxWeeks?: number;
}

const DAYS_PER_WEEK_MAX = 7;

interface Requirement {
  masteryGapPoints: number;
  requiredMinutes: number;
  skillsBelowTarget: number;
  targetMastery: number;
}

/**
 * Khối lượng cần bù để mọi skill đạt ngưỡng mastery của mức mục tiêu.
 * Trọng số blueprint được chuẩn hóa theo trọng số trung bình để thang "điểm
 * mastery" không phụ thuộc việc đội chuyên môn đánh trọng số 1–5 hay 10–50.
 */
function computeRequirement(
  masteries: MasteryState[],
  skills: SkillNode[],
  targetLevel: StudentLevel,
  levelConfig: LevelConfig,
  config: RecommendationConfig,
): Requirement {
  const targetMastery = clamp(levelConfig.masteryTargets?.[targetLevel] ?? 0, 0, 100);
  const masteryById = new Map<string, MasteryState>(masteries.map((m) => [m.skillId, m]));

  const weightOf = (skill: SkillNode): number => (skill.blueprintWeight > 0 ? skill.blueprintWeight : 1);
  const avgWeight =
    skills.length > 0 ? skills.reduce((sum, s) => sum + weightOf(s), 0) / skills.length : 1;

  let masteryGapPoints = 0;
  let skillsBelowTarget = 0;
  for (const skill of skills) {
    // Skill chưa có dữ liệu coi như mastery 0 — vẫn phải học, không được bỏ qua.
    const score = clamp(masteryById.get(skill.id)?.masteryScore ?? 0, 0, 100);
    const deficit = targetMastery - score;
    if (deficit <= 0) continue;
    skillsBelowTarget += 1;
    masteryGapPoints += deficit * (avgWeight > 0 ? weightOf(skill) / avgWeight : 1);
  }

  const minutesPerPoint = config.minutesPerMasteryPoint > 0 ? config.minutesPerMasteryPoint : 0;
  const safety = config.feasibilitySafetyFactor > 0 ? config.feasibilitySafetyFactor : 1;
  const requiredMinutes = Math.round(masteryGapPoints * minutesPerPoint * safety);

  return {
    masteryGapPoints: Math.round(masteryGapPoints * 100) / 100,
    requiredMinutes,
    skillsBelowTarget,
    targetMastery,
  };
}

function levelLabel(level: StudentLevel, levelConfig: LevelConfig): string {
  return levelConfig.labels?.[level] || LEVEL_LABEL[level];
}

export function checkGoalFeasibility(req: FeasibilityRequest): FeasibilityResult {
  const { config, levelConfig } = req;
  // Cường độ vượt trần cấu hình không được tính vào quỹ thời gian: kế hoạch
  // không bao giờ được giao quá maxMinutesPerDay (specs §7.6).
  const daysPerWeek = clamp(Math.round(req.daysPerWeek || 0), 0, DAYS_PER_WEEK_MAX);
  const minutesPerDay = clamp(Math.round(req.minutesPerDay || 0), 0, config.maxMinutesPerDay);
  const daysUntilDeadline = Math.max(0, Math.floor(req.daysUntilDeadline));
  const weeks = Math.max(0, Math.floor(daysUntilDeadline / 7));

  const requirement = computeRequirement(
    req.masteries,
    req.skills,
    req.targetLevel,
    levelConfig,
    config,
  );
  const { requiredMinutes, masteryGapPoints, skillsBelowTarget, targetMastery } = requirement;

  const availableMinutes = weeks * daysPerWeek * minutesPerDay;
  const ratio =
    requiredMinutes <= 0
      ? 0
      : availableMinutes <= 0
        ? Number.POSITIVE_INFINITY
        : requiredMinutes / availableMinutes;

  const infeasibleRatio = config.infeasibleRatio > 1 ? config.infeasibleRatio : 1;
  const status: GoalFeasibility =
    ratio <= 1 ? 'FEASIBLE' : ratio <= infeasibleRatio ? 'TIGHT' : 'INFEASIBLE';

  // --- Phương án CỤ THỂ: giữ deadline thì phải học bao nhiêu -------------
  let suggestedDaysPerWeek = Math.max(1, daysPerWeek);
  let suggestedMinutesPerDay = Math.max(minutesPerDay, config.minMinutesPerDay);

  if (status !== 'FEASIBLE') {
    if (weeks > 0) {
      let neededPerDay = Math.ceil(requiredMinutes / (weeks * suggestedDaysPerWeek));
      if (neededPerDay > config.maxMinutesPerDay) {
        // Chạm trần phút/ngày → tăng số buổi/tuần trước khi nghĩ tới lùi mốc.
        const neededDays = Math.ceil(requiredMinutes / (weeks * config.maxMinutesPerDay));
        suggestedDaysPerWeek = clamp(
          Math.max(suggestedDaysPerWeek, neededDays),
          1,
          DAYS_PER_WEEK_MAX,
        );
        neededPerDay = Math.ceil(requiredMinutes / (weeks * suggestedDaysPerWeek));
      }
      suggestedMinutesPerDay = clamp(neededPerDay, config.minMinutesPerDay, config.maxMinutesPerDay);
    } else {
      suggestedDaysPerWeek = clamp(Math.max(suggestedDaysPerWeek, 5), 1, DAYS_PER_WEEK_MAX);
      suggestedMinutesPerDay = clamp(
        Math.max(suggestedMinutesPerDay, config.minMinutesPerDay),
        config.minMinutesPerDay,
        config.maxMinutesPerDay,
      );
    }
  }

  // --- Số ngày cần thêm nếu GIỮ NGUYÊN cường độ hiện tại -----------------
  const currentWeeklyCapacity =
    Math.max(1, daysPerWeek) * Math.max(minutesPerDay, config.minMinutesPerDay);
  const weeksNeededAtCurrent =
    requiredMinutes <= 0 ? 0 : Math.ceil(requiredMinutes / currentWeeklyCapacity);
  const suggestedExtraDays = Math.max(0, weeksNeededAtCurrent * 7 - daysUntilDeadline);

  const suggestedWeeklyCapacity = suggestedDaysPerWeek * suggestedMinutesPerDay;
  const reachableWithSuggestion = weeks > 0 && suggestedWeeklyCapacity * weeks >= requiredMinutes;

  const message = buildMessage({
    status,
    levelConfig,
    targetLevel: req.targetLevel,
    targetMastery,
    skillsBelowTarget,
    totalSkills: req.skills.length,
    requiredMinutes,
    availableMinutes,
    weeks,
    daysUntilDeadline,
    daysPerWeek,
    minutesPerDay,
    weeksNeededAtCurrent,
    suggestedMinutesPerDay,
    suggestedDaysPerWeek,
    suggestedExtraDays,
    reachableWithSuggestion,
    maxMinutesPerDay: config.maxMinutesPerDay,
  });

  return {
    status,
    requiredMinutes,
    availableMinutes,
    ratio: Number.isFinite(ratio) ? Math.round(ratio * 100) / 100 : ratio,
    masteryGapPoints,
    skillsBelowTarget,
    suggestedMinutesPerDay,
    suggestedDaysPerWeek,
    suggestedExtraDays,
    message,
  };
}

interface MessageInput {
  status: GoalFeasibility;
  levelConfig: LevelConfig;
  targetLevel: StudentLevel;
  targetMastery: number;
  skillsBelowTarget: number;
  totalSkills: number;
  requiredMinutes: number;
  availableMinutes: number;
  weeks: number;
  daysUntilDeadline: number;
  daysPerWeek: number;
  minutesPerDay: number;
  weeksNeededAtCurrent: number;
  suggestedMinutesPerDay: number;
  suggestedDaysPerWeek: number;
  suggestedExtraDays: number;
  reachableWithSuggestion: boolean;
  maxMinutesPerDay: number;
}

/** Thông điệp phải nói thẳng con số để học sinh/phụ huynh tự quyết được. */
function buildMessage(input: MessageInput): string {
  const target = levelLabel(input.targetLevel, input.levelConfig);
  const intensity = `${input.minutesPerDay} phút/ngày và ${input.daysPerWeek} ngày/tuần`;
  const extraWeeks = Math.ceil(input.suggestedExtraDays / 7);

  if (input.requiredMinutes <= 0) {
    return `Bạn đã đạt ngưỡng thành thạo ${input.targetMastery} điểm của mức ${target} ở toàn bộ ${input.totalSkills} kỹ năng. Mục tiêu này khả thi ngay — nên cân nhắc đặt mục tiêu cao hơn.`;
  }

  if (input.status === 'FEASIBLE') {
    return `Mục tiêu khả thi: cần khoảng ${formatMinutes(input.requiredMinutes)} luyện tập để nâng ${input.skillsBelowTarget} kỹ năng lên mức ${target}, trong khi với ${intensity} bạn có ${formatMinutes(input.availableMinutes)} trong ${input.weeks} tuần tới. Giữ nguyên nhịp hiện tại là đủ.`;
  }

  if (input.weeks === 0) {
    return `Chỉ còn ${input.daysUntilDeadline} ngày tới mốc mục tiêu — chưa đủ một tuần học nên không thể nâng ${input.skillsBelowTarget} kỹ năng lên mức ${target}. Cần khoảng ${formatMinutes(input.requiredMinutes)}, tương đương ${input.weeksNeededAtCurrent} tuần với ${intensity}. Hãy lùi mốc thêm ${input.suggestedExtraDays} ngày hoặc hạ mục tiêu.`;
  }

  const head =
    input.status === 'TIGHT'
      ? `Mục tiêu hơi gấp: với ${intensity}, bạn cần khoảng ${input.weeksNeededAtCurrent} tuần chứ không phải ${input.weeks} tuần.`
      : `Mục tiêu không khả thi: với ${intensity}, bạn cần khoảng ${input.weeksNeededAtCurrent} tuần chứ không phải ${input.weeks} tuần.`;
  const volume = `Khối lượng cần luyện khoảng ${formatMinutes(input.requiredMinutes)} nhưng quỹ thời gian chỉ có ${formatMinutes(input.availableMinutes)}.`;

  const advice = input.reachableWithSuggestion
    ? `Hãy tăng lên ${input.suggestedMinutesPerDay} phút/ngày (${input.suggestedDaysPerWeek} ngày/tuần) hoặc lùi mốc thêm ${input.suggestedExtraDays} ngày (khoảng ${extraWeeks} tuần).`
    : `Cường độ tối đa cho phép là ${input.maxMinutesPerDay} phút/ngày nên tăng thời lượng cũng không đủ — hãy lùi mốc thêm ${input.suggestedExtraDays} ngày (khoảng ${extraWeeks} tuần) hoặc hạ mục tiêu xuống mức thấp hơn.`;

  return `${head} ${volume} ${advice}`;
}

// ---------------------------------------------------------------------------
// Phương án mục tiêu (specs §5.3, §6.1 — 2–3 lựa chọn, không ép một kế hoạch)
// ---------------------------------------------------------------------------

interface OptionSpec {
  targetLevel: StudentLevel;
  daysPerWeek: number;
  minutesPerDay: number;
  weeks: number;
  kind: 'FAST' | 'STEADY' | 'LIGHT' | 'STRETCH' | 'CONSOLIDATE';
}

export function buildGoalOptions(req: GoalOptionsRequest): GoalOption[] {
  const { config, levelConfig } = req;
  const daysPerWeek = clamp(Math.round(req.daysPerWeek || 0) || 1, 1, DAYS_PER_WEEK_MAX);
  const minutesPerDay = clamp(
    Math.round(req.minutesPerDay || 0) || config.minMinutesPerDay,
    config.minMinutesPerDay,
    config.maxMinutesPerDay,
  );
  const maxWeeks = req.maxWeeks && req.maxWeeks > 0 ? Math.floor(req.maxWeeks) : Number.POSITIVE_INFINITY;

  const currentOrder = LEVEL_ORDER[req.currentLevel];
  const topOrder = STUDENT_LEVELS.length - 1;
  const nextLevel = STUDENT_LEVELS[Math.min(currentOrder + 1, topOrder)];
  const stretchLevel = STUDENT_LEVELS[Math.min(currentOrder + 2, topOrder)];

  const requirementCache = new Map<StudentLevel, Requirement>();
  const requirementOf = (level: StudentLevel): Requirement => {
    const cached = requirementCache.get(level);
    if (cached) return cached;
    const value = computeRequirement(req.masteries, req.skills, level, levelConfig, config);
    requirementCache.set(level, value);
    return value;
  };

  // Số tuần tối thiểu để quỹ thời gian phủ đủ khối lượng ⇒ phương án luôn FEASIBLE.
  const weeksFor = (level: StudentLevel, dpw: number, mpd: number): number => {
    const required = requirementOf(level).requiredMinutes;
    const weekly = Math.max(1, dpw * mpd);
    return Math.max(1, Math.ceil(required / weekly));
  };

  const specs: OptionSpec[] = [];
  const pushSpec = (
    targetLevel: StudentLevel,
    dpw: number,
    mpd: number,
    kind: OptionSpec['kind'],
  ): void => {
    specs.push({ targetLevel, daysPerWeek: dpw, minutesPerDay: mpd, weeks: weeksFor(targetLevel, dpw, mpd), kind });
  };

  // 1. Tăng tốc: giữ số buổi/tuần, đẩy phút/ngày lên trần cho phép.
  pushSpec(nextLevel, daysPerWeek, config.maxMinutesPerDay, 'FAST');
  // 2. Giữ nhịp: đúng cường độ học sinh khai báo.
  pushSpec(nextLevel, daysPerWeek, minutesPerDay, 'STEADY');
  // 3. Vươn xa: mục tiêu cao hơn một bậc nữa, cường độ hiện tại.
  if (stretchLevel !== nextLevel) pushSpec(stretchLevel, daysPerWeek, minutesPerDay, 'STRETCH');
  // 4. Nhẹ nhàng: cường độ tối thiểu, đổi lại lộ trình dài hơn.
  pushSpec(nextLevel, daysPerWeek, config.minMinutesPerDay, 'LIGHT');

  const seen = new Set<string>();
  const unique = specs.filter((spec) => {
    const key = `${spec.targetLevel}|${spec.daysPerWeek}|${spec.minutesPerDay}|${spec.weeks}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const byWeeks = [...unique].sort((a, b) => a.weeks - b.weeks || a.minutesPerDay - b.minutesPerDay);

  let chosen = byWeeks.filter((spec) => spec.weeks <= maxWeeks);
  if (chosen.length === 0) {
    // Không phương án nâng mức nào lọt trần thời gian → vẫn phải chào phương án
    // khả thi: lộ trình nâng mức ngắn nhất + phương án củng cố mức hiện tại.
    const shortest = byWeeks[0];
    const consolidate: OptionSpec | null =
      nextLevel !== req.currentLevel
        ? {
            targetLevel: req.currentLevel,
            daysPerWeek,
            minutesPerDay,
            weeks: weeksFor(req.currentLevel, daysPerWeek, minutesPerDay),
            kind: 'CONSOLIDATE',
          }
        : null;
    chosen = [shortest, consolidate].filter((spec): spec is OptionSpec => spec !== undefined && spec !== null);
  }
  if (chosen.length === 1) {
    const extra = byWeeks.find((spec) => spec !== chosen[0]);
    if (extra) chosen = [...chosen, extra];
  }

  const ordered = chosen
    .sort((a, b) => a.weeks - b.weeks || a.minutesPerDay - b.minutesPerDay)
    .slice(0, 3);

  const raisesLevel = (spec: OptionSpec): boolean =>
    LEVEL_ORDER[spec.targetLevel] > LEVEL_ORDER[req.currentLevel];

  const options: GoalOption[] = ordered.map((spec) => {
    const feasibility = checkGoalFeasibility({
      masteries: req.masteries,
      skills: req.skills,
      currentLevel: req.currentLevel,
      targetLevel: spec.targetLevel,
      daysUntilDeadline: spec.weeks * 7,
      daysPerWeek: spec.daysPerWeek,
      minutesPerDay: spec.minutesPerDay,
      levelConfig,
      config,
    });
    return {
      targetLevel: spec.targetLevel,
      weeks: spec.weeks,
      daysPerWeek: spec.daysPerWeek,
      minutesPerDay: spec.minutesPerDay,
      feasibility,
      label: buildOptionLabel(spec, req.currentLevel, levelConfig),
      description: buildOptionDescription(spec, levelConfig, requirementOf(spec.targetLevel)),
      recommended: false,
    };
  });

  if (options.length > 0) {
    // Khuyến nghị: khả thi trước, ưu tiên phương án thực sự nâng mức, về đích
    // sớm nhất; hòa nhau thì chọn phương án nhẹ hơn cho học sinh.
    const ranked = ordered
      .map((spec, index) => ({ spec, option: options[index] }))
      .sort(
        (a, b) =>
          Number(b.option.feasibility.status === 'FEASIBLE') -
            Number(a.option.feasibility.status === 'FEASIBLE') ||
          Number(raisesLevel(b.spec)) - Number(raisesLevel(a.spec)) ||
          a.option.weeks - b.option.weeks ||
          a.option.minutesPerDay - b.option.minutesPerDay,
      );
    const best = ranked[0]?.option;
    for (const option of options) option.recommended = option === best;
  }

  return options;
}

function buildOptionLabel(
  spec: OptionSpec,
  currentLevel: StudentLevel,
  levelConfig: LevelConfig,
): string {
  const label = levelLabel(spec.targetLevel, levelConfig);
  const verb = LEVEL_ORDER[spec.targetLevel] > LEVEL_ORDER[currentLevel] ? 'Lên' : 'Giữ vững';
  return `${verb} ${label} trong ${spec.weeks} tuần`;
}

function buildOptionDescription(
  spec: OptionSpec,
  levelConfig: LevelConfig,
  requirement: Requirement,
): string {
  const label = levelLabel(spec.targetLevel, levelConfig);
  const pace = `${spec.minutesPerDay} phút/ngày, ${spec.daysPerWeek} ngày/tuần`;
  const volume = `tổng khoảng ${formatMinutes(requirement.requiredMinutes)} luyện tập`;
  const scope =
    requirement.skillsBelowTarget > 0
      ? `cần đưa ${requirement.skillsBelowTarget} kỹ năng lên ngưỡng ${requirement.targetMastery} điểm`
      : 'chủ yếu là duy trì và củng cố những gì đã vững';

  switch (spec.kind) {
    case 'FAST':
      return `Nhịp nhanh nhất: ${pace} — ${volume}, ${scope}. Phù hợp nếu bạn dồn sức được trong thời gian ngắn.`;
    case 'STEADY':
      return `Giữ đúng nhịp bạn đăng ký: ${pace} — ${volume}, ${scope}.`;
    case 'LIGHT':
      return `Nhẹ nhàng, dài hơi: ${pace} — ${volume}, ${scope}. Ít áp lực nhưng về đích muộn hơn.`;
    case 'STRETCH':
      return `Mục tiêu cao hơn (${label}): ${pace} — ${volume}, ${scope}. Chọn khi bạn còn nhiều thời gian trước kỳ thi.`;
    default:
      return `Củng cố mức ${label} cho thật chắc: ${pace} — ${volume}, ${scope}.`;
  }
}
