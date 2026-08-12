/**
 * MODULE LỘ TRÌNH (Recommendation / Study Plan) — specs §6 module 7, §7.6, §7.7,
 * §7.8, §10.1, §10.2.
 *
 * Nhiệm vụ: biến hồ sơ năng lực + mục tiêu + quỹ thời gian thành lịch học theo
 * NGÀY, và luôn giải thích được vì sao mỗi câu có mặt trong lịch (bảng
 * `Recommendation`) — tiêu chí nghiệm thu MVP §17.
 *
 * Ranh giới: file này KHÔNG biết HTTP. Lỗi nghiệp vụ ném `ApiError`.
 * Toàn bộ quyết định chọn câu do `@/engine` thực hiện; ở đây chỉ nạp dữ liệu,
 * gọi engine và ghi kết quả xuống DB.
 */
import { Prisma } from '@prisma/client';
import type {
  BlockType,
  GradeBand,
  PlanDayStatus,
  StudentLevel,
  Subject,
  TeacherAction,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';
import { getConfig, type PlatformConfig } from '@/lib/config';
import { EVENTS, track } from '@/lib/analytics';
import { AUDIT_ACTIONS, writeAudit } from '@/lib/audit';
import {
  BLOCK_DESCRIPTION,
  BLOCK_LABEL,
  BLOCK_ORDER,
  DIFFICULTY_LABEL,
  LEVEL_LABEL,
  PLAN_DAY_STATUS_LABEL,
  formatMinutes,
} from '@/lib/domain';
import {
  addDays,
  daysUntil,
  diffDays,
  formatDateVN,
  formatDayLabelVN,
  pickStudyDates,
  toDateOnly,
  vnToday,
} from '@/lib/dates';
import {
  ENGINE_VERSION,
  buildDayPlan,
  buildGoalOptions,
  checkGoalFeasibility,
  computeGapPriorities,
  createInitialMastery,
  type CandidateItem,
  type DayPlanResult,
  type FeasibilityResult,
  type GapScore,
  type GoalOption,
  type MasteryState,
  type SkillNode,
} from '@/engine';
import type { GoalOptionsInput, TimeBudgetInput } from './schemas';

// ---------------------------------------------------------------------------
// Hằng số nội bộ (KHÔNG phải tham số nghiệp vụ)
// ---------------------------------------------------------------------------

/** Trạng thái của PlanDayItem — schema lưu dạng String để mở rộng không cần migrate. */
export const PLAN_ITEM_STATUS = {
  PENDING: 'PENDING',
  DONE: 'DONE',
  SKIPPED: 'SKIPPED',
} as const;

const PLAN_STATUS = {
  ACTIVE: 'ACTIVE',
  SUPERSEDED: 'SUPERSEDED',
  COMPLETED: 'COMPLETED',
} as const;

/** Số ngày học "gần đây" được coi là nguồn cho block Khởi động của ngày đầu chu kỳ. */
const WARMUP_LOOKBACK_DAYS = 3;

// ---------------------------------------------------------------------------
// Kiểu dữ liệu trả ra
// ---------------------------------------------------------------------------

export interface GoalSummary {
  id: string;
  currentLevel: StudentLevel;
  currentLevelLabel: string;
  targetLevel: StudentLevel;
  targetLevelLabel: string;
  deadline: Date;
  deadlineLabel: string;
  daysLeft: number;
  daysPerWeek: number;
  minutesPerDay: number;
  feasibility: string;
  feasibilityMessage: string;
}

export interface PlanDaySummary {
  id: string;
  date: Date;
  dateLabel: string;
  dayIndex: number;
  status: PlanDayStatus;
  statusLabel: string;
  estimatedMinutes: number;
  actualMinutes: number;
  itemCount: number;
  doneCount: number;
  isToday: boolean;
  rescheduledFrom: Date | null;
  note: string | null;
  blocks: { block: BlockType; label: string; count: number }[];
}

export interface CurrentPlan {
  id: string;
  cycleNo: number;
  startDate: Date;
  endDate: Date;
  status: string;
  engineVersion: string;
  goal: GoalSummary | null;
  focusChapters: { id: string; name: string }[];
  focusSkills: { id: string; name: string; priority: number }[];
  days: PlanDaySummary[];
  totalItems: number;
  totalEstimatedMinutes: number;
  warnings: string[];
}

export interface PlanDayItemView {
  planDayItemId: string;
  itemId: string;
  itemCode: string;
  block: BlockType;
  blockLabel: string;
  order: number;
  status: string;
  skillId: string;
  skillName: string;
  chapterName: string;
  difficulty: string;
  difficultyLabel: string;
  estimatedTimeSeconds: number;
  reasonCode: string | null;
  reasonMessage: string | null;
}

export interface PlanDayDetail {
  id: string;
  planId: string;
  date: Date;
  dateLabel: string;
  dayIndex: number;
  status: PlanDayStatus;
  statusLabel: string;
  estimatedMinutes: number;
  actualMinutes: number;
  startedAt: Date | null;
  completedAt: Date | null;
  rescheduledFrom: Date | null;
  note: string | null;
  progress: { done: number; total: number };
  blocks: TodayBlockSummary[];
  items: PlanDayItemView[];
}

export interface TodayBlockSummary {
  block: BlockType;
  label: string;
  description: string;
  itemCount: number;
  estimatedMinutes: number;
  doneCount: number;
  skillNames: string[];
  reason: string;
}

export interface UpcomingAssessment {
  attemptId: string | null;
  type: string;
  name: string;
  /** IN_PROGRESS = đang làm dở, DUE = tới hạn, UPCOMING = chưa tới hạn. */
  state: 'IN_PROGRESS' | 'DUE' | 'UPCOMING';
  dueAt: Date;
  dueLabel: string;
  daysLeft: number;
  message: string;
}

export interface UpcomingTeacherSession {
  id: string;
  scheduledAt: Date | null;
  scheduledLabel: string | null;
  durationMinutes: number;
  meetingLink: string | null;
  status: string;
  message: string;
}

export interface PlanProgress {
  completedDays: number;
  totalDays: number;
  completionRate: number;
  minutesStudied: number;
  streakDays: number;
  itemsAnswered: number;
  accuracy: number;
}

/** Trả lời đúng 4 câu hỏi của màn hình "Hôm nay học gì" (specs §9.2 màn 9, §10.1). */
export interface TodayPlan {
  enrollmentId: string;
  goal: GoalSummary | null;
  plan: {
    id: string;
    cycleNo: number;
    startDate: Date;
    endDate: Date;
    focusChapters: { id: string; name: string }[];
  } | null;
  day: {
    id: string;
    date: Date;
    dateLabel: string;
    dayIndex: number;
    status: PlanDayStatus;
    statusLabel: string;
    estimatedMinutes: number;
    actualMinutes: number;
    itemCount: number;
    doneCount: number;
    startedAt: Date | null;
  } | null;
  /** false = hôm nay là ngày nghỉ theo lịch, `day` là buổi học kế tiếp. */
  isStudyDayToday: boolean;
  blocks: TodayBlockSummary[];
  /** Học gì + mất bao lâu. */
  headline: string;
  /** Vì sao hôm nay lại là những bài này. */
  whyMessage: string;
  /** Xong thì tiến độ đổi thế nào. */
  impactMessage: string;
  cycleProgress: {
    cycleNo: number;
    completedDays: number;
    totalDays: number;
    percent: number;
    missedDays: number;
  };
  progress: PlanProgress;
  nextAssessment: UpcomingAssessment | null;
  nextTeacherSession: UpcomingTeacherSession | null;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Diễn giải reasonCode sang tiếng Việt cho học sinh (specs §9.1)
// ---------------------------------------------------------------------------

const REASON_MESSAGES: Record<string, string> = {
  WARMUP_RECENT_SKILL:
    'Khởi động bằng kỹ năng bạn vừa luyện vài hôm trước, để kiến thức không nguội đi.',
  REPAIR_HIGH_GAP_PRIORITY:
    'Đây là kỹ năng đang hổng nhiều nhất so với mục tiêu của bạn nên được vá trước tiên.',
  REPAIR_PREREQUISITE_FIRST:
    'Bạn đang vướng ở một kỹ năng khác vì thiếu phần nền này, nên hệ thống cho học phần nền trước.',
  CORE_WEEKLY_FOCUS_CHAPTER:
    'Câu này thuộc chương trọng tâm của chu kỳ, chiếm tỷ trọng lớn trong cấu trúc đề thi.',
  CHALLENGE_MASTERY_UNLOCKED:
    'Bạn đã vững kỹ năng này nên được nâng lên một bậc khó hơn để tiến bộ thật.',
  REVIEW_SPACED_REPETITION:
    'Đã khá lâu bạn không luyện kỹ năng này — ôn lại đúng lúc để khỏi quên.',
  REVIEW_RETENTION_CHECK: 'Kiểm tra nhanh xem kỹ năng đã vững có còn nhớ chắc hay không.',
  REVIEW_MIXED_PRACTICE:
    'Trộn nhiều kỹ năng trong một buổi để bạn quen với việc chuyển dạng bài như khi thi.',
  FILL_DAILY_MINIMUM: 'Thêm câu cho đủ khối lượng tối thiểu của một buổi học.',
  FILL_REMAINING_BUDGET: 'Buổi học còn dư thời gian nên hệ thống bổ sung thêm câu luyện tập.',
  PLAN_WEEKLY_FOCUS: 'Kỹ năng này được chọn làm trọng tâm cho cả chu kỳ học.',
};

const DEFAULT_REASON_MESSAGE =
  'Hệ thống chọn câu này dựa trên hồ sơ năng lực hiện tại và mục tiêu bạn đã đặt.';

/** Câu giải thích ngắn cho học sinh; có tên kỹ năng thì nêu rõ tên. */
export function describeReason(reasonCode: string, reasonData?: unknown): string {
  const base = REASON_MESSAGES[reasonCode] ?? DEFAULT_REASON_MESSAGE;
  const data = asRecord(reasonData);
  const skillName = typeof data.skillName === 'string' ? data.skillName : null;
  return skillName ? `Kỹ năng "${skillName}": ${base}` : base;
}

// ---------------------------------------------------------------------------
// Tiện ích chung
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Chia an toàn — kho rỗng / chưa có ngày học nào thì trả 0 thay vì NaN. */
function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? round(numerator / denominator) : 0;
}

const enrollmentInclude = {
  course: { include: { program: { select: { id: true, code: true, name: true } } } },
  cohort: true,
  student: { select: { id: true, userId: true, actualGrade: true, gradeBand: true } },
} satisfies Prisma.EnrollmentInclude;

type EnrollmentContext = Prisma.EnrollmentGetPayload<{ include: typeof enrollmentInclude }>;

async function loadEnrollment(enrollmentId: string): Promise<EnrollmentContext> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: enrollmentInclude,
  });
  if (!enrollment) throw ApiError.notFound('Không tìm thấy khóa học đã đăng ký.');
  return enrollment;
}

/** Chặn mọi thao tác ghi khi quyền truy cập đã hết hạn hoặc bị khóa (specs §11). */
function assertEnrollmentUsable(enrollment: EnrollmentContext): void {
  if (enrollment.status === 'SUSPENDED') {
    throw ApiError.forbidden('Khóa học của bạn đang tạm khóa. Vui lòng liên hệ bộ phận hỗ trợ.');
  }
  if (enrollment.status === 'EXPIRED' || enrollment.expiresAt.getTime() < Date.now()) {
    throw ApiError.forbidden(
      `Quyền truy cập khóa học đã hết hạn ngày ${formatDateVN(enrollment.expiresAt)}. Hãy gia hạn để tiếp tục lộ trình.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Nạp dữ liệu cho engine
// ---------------------------------------------------------------------------

/**
 * Cây kỹ năng của môn/khối. `blueprintWeight` của skill được nhân với trọng số
 * chương: một kỹ năng nhỏ trong chương trọng yếu vẫn phải nặng hơn kỹ năng lớn
 * trong chương phụ.
 */
export async function loadSkillGraph(subject: Subject, gradeBand: GradeBand): Promise<SkillNode[]> {
  const chapters = await prisma.chapter.findMany({
    where: { subject, gradeBand },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      name: true,
      order: true,
      blueprintWeight: true,
      skills: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          order: true,
          blueprintWeight: true,
          prerequisites: { select: { prerequisiteSkillId: true } },
        },
      },
    },
  });

  const nodes: SkillNode[] = [];
  for (const chapter of chapters) {
    const chapterWeight = chapter.blueprintWeight > 0 ? chapter.blueprintWeight : 1;
    for (const skill of chapter.skills) {
      const skillWeight = skill.blueprintWeight > 0 ? skill.blueprintWeight : 1;
      nodes.push({
        id: skill.id,
        code: skill.code,
        name: skill.name,
        chapterId: chapter.id,
        chapterName: chapter.name,
        blueprintWeight: skillWeight * chapterWeight,
        order: chapter.order * 1000 + skill.order,
        prerequisiteIds: skill.prerequisites.map((p) => p.prerequisiteSkillId),
      });
    }
  }
  return nodes;
}

function toErrorCounts(value: Prisma.JsonValue): Record<string, number> {
  const record = asRecord(value);
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(record)) {
    const num = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(num) && num > 0) out[key] = num;
  }
  return out;
}

/**
 * Hồ sơ năng lực đủ MỌI kỹ năng của chương trình: kỹ năng chưa từng luyện vẫn
 * phải có mặt với confidence 0, nếu không engine sẽ tưởng học sinh không cần học
 * (specs §7.2).
 */
export async function loadMasteryStates(
  enrollmentId: string,
  skills: SkillNode[],
): Promise<MasteryState[]> {
  const rows = await prisma.studentSkillMastery.findMany({
    where: { enrollmentId, skillId: { in: skills.map((s) => s.id) } },
  });
  const bySkill = new Map(rows.map((row) => [row.skillId, row]));

  return skills.map((skill) => {
    const row = bySkill.get(skill.id);
    if (!row) return createInitialMastery(skill.id);
    return {
      skillId: skill.id,
      masteryScore: row.masteryScore,
      confidence: row.confidence,
      attemptCount: row.attemptCount,
      correctCount: row.correctCount,
      recentAccuracy: row.recentAccuracy,
      recentResults: [...row.recentResults],
      avgTimeRatio: row.avgTimeRatio,
      consecutiveCorrect: row.consecutiveCorrect,
      consecutiveWrong: row.consecutiveWrong,
      difficultyCeiling: row.difficultyCeiling,
      lastPracticedAt: row.lastPracticedAt,
      errorCounts: toErrorCounts(row.errorPattern),
    };
  });
}

/**
 * Kho câu khả dụng cho học sinh này, kèm dữ liệu phơi nhiễm để engine chống lặp
 * (specs §7.5).
 *
 * BẤT DI BẤT DỊCH: `status: 'PUBLISHED'` nằm ngay trong mệnh đề where — câu chưa
 * kiểm duyệt không bao giờ tới được học sinh, kể cả khi giao diện gọi sai.
 */
export async function loadCandidatePool(
  enrollment: EnrollmentContext,
  skillIds: string[],
): Promise<CandidateItem[]> {
  if (skillIds.length === 0) return [];

  const programCode = enrollment.course.program.code;
  const items = await prisma.questionItem.findMany({
    where: {
      status: 'PUBLISHED',
      subject: enrollment.course.subject,
      gradeBand: enrollment.course.gradeBand,
      skillId: { in: skillIds },
      AND: [
        // Rỗng = dùng chung mọi kỳ thi; có giá trị = chỉ dùng cho kỳ thi đó.
        { OR: [{ programScope: { isEmpty: true } }, { programScope: { has: programCode } }] },
        {
          OR: [
            { actualGradeScope: { isEmpty: true } },
            { actualGradeScope: { has: enrollment.student.actualGrade } },
          ],
        },
      ],
    },
    select: {
      id: true,
      skillId: true,
      chapterId: true,
      difficulty: true,
      difficultyNumeric: true,
      estimatedTime: true,
      tags: true,
    },
  });
  if (items.length === 0) return [];

  // Lịch sử phơi nhiễm chỉ của CHÍNH học sinh này nên luôn nhỏ, truy vấn thẳng được.
  const [servedRows, attempts] = await Promise.all([
    prisma.planDayItem.findMany({
      where: { planDay: { plan: { enrollmentId: enrollment.id } } },
      select: { itemId: true, planDay: { select: { date: true } } },
    }),
    prisma.itemAttempt.findMany({
      where: { enrollmentId: enrollment.id },
      select: { itemId: true, createdAt: true, planDayItemId: true },
    }),
  ]);

  const servedCount = new Map<string, number>();
  const lastServed = new Map<string, Date>();
  const bump = (itemId: string, at: Date | null): void => {
    servedCount.set(itemId, (servedCount.get(itemId) ?? 0) + 1);
    if (!at) return;
    const current = lastServed.get(itemId);
    if (!current || at.getTime() > current.getTime()) lastServed.set(itemId, at);
  };

  for (const row of servedRows) bump(row.itemId, row.planDay.date);
  // Lượt làm trong bài kiểm tra không đi qua PlanDayItem → đếm riêng, không trùng.
  for (const attempt of attempts) {
    if (attempt.planDayItemId === null) bump(attempt.itemId, attempt.createdAt);
    else {
      const current = lastServed.get(attempt.itemId);
      if (!current || attempt.createdAt.getTime() > current.getTime()) {
        lastServed.set(attempt.itemId, attempt.createdAt);
      }
    }
  }

  return items.map((item) => ({
    id: item.id,
    skillId: item.skillId,
    chapterId: item.chapterId,
    difficulty: item.difficulty,
    difficultyNumeric: item.difficultyNumeric,
    estimatedTime: item.estimatedTime,
    tags: item.tags,
    lastServedAt: lastServed.get(item.id) ?? null,
    timesServedToStudent: servedCount.get(item.id) ?? 0,
  }));
}

function currentLevelOf(enrollment: EnrollmentContext): StudentLevel {
  return enrollment.estimatedLevel ?? enrollment.selfDeclaredLevel ?? 'WEAK';
}

function levelLabel(level: StudentLevel, config: PlatformConfig): string {
  return config.levels.labels[level] ?? LEVEL_LABEL[level];
}

// ---------------------------------------------------------------------------
// Mục tiêu (specs §6.1, §7.7)
// ---------------------------------------------------------------------------

/** 2–3 phương án mục tiêu khả thi để học sinh chọn — không ép một kế hoạch duy nhất. */
export async function getGoalOptions(
  enrollmentId: string,
  input: GoalOptionsInput | TimeBudgetInput,
): Promise<GoalOption[]> {
  const enrollment = await loadEnrollment(enrollmentId);
  const config = await getConfig();
  const skills = await loadSkillGraph(enrollment.course.subject, enrollment.course.gradeBand);
  if (skills.length === 0) {
    throw ApiError.conflict(
      'Chương trình học của khóa này chưa có cây kỹ năng nên chưa thể đề xuất mục tiêu. Vui lòng liên hệ bộ phận hỗ trợ.',
    );
  }
  const masteries = await loadMasteryStates(enrollment.id, skills);

  // Không chào phương án dài hơn ngày thi hoặc hạn truy cập của học sinh.
  const horizons: number[] = [Math.floor(daysUntil(enrollment.expiresAt) / 7)];
  if (enrollment.cohort) horizons.push(Math.floor(daysUntil(enrollment.cohort.examDate) / 7));
  const maxWeeks = Math.max(1, Math.min(...horizons.filter((w) => Number.isFinite(w))));

  return buildGoalOptions({
    masteries,
    skills,
    currentLevel: currentLevelOf(enrollment),
    daysPerWeek: input.daysPerWeek,
    minutesPerDay: input.minutesPerDay,
    levelConfig: config.levels,
    config: config.recommendation,
    maxWeeks,
  });
}

export interface CreateGoalInputData {
  enrollmentId: string;
  targetLevel: StudentLevel;
  deadline: Date;
  daysPerWeek: number;
  minutesPerDay: number;
}

/**
 * Lưu mục tiêu và sinh ngay lộ trình chu kỳ đầu tiên.
 *
 * Mục tiêu KHÔNG khả thi vẫn được lưu: specs §6.1 yêu cầu hệ thống cảnh báo và
 * đề xuất thay đổi, không chặn cứng quyền tự quyết của học sinh.
 */
export async function createGoal(
  input: CreateGoalInputData,
): Promise<{ goalId: string; feasibility: FeasibilityResult; planId: string }> {
  const enrollment = await loadEnrollment(input.enrollmentId);
  assertEnrollmentUsable(enrollment);

  const daysUntilDeadline = daysUntil(input.deadline);
  if (daysUntilDeadline <= 0) {
    throw ApiError.badRequest('Mốc thời gian của mục tiêu phải nằm sau ngày hôm nay.');
  }

  const config = await getConfig();
  const skills = await loadSkillGraph(enrollment.course.subject, enrollment.course.gradeBand);
  if (skills.length === 0) {
    throw ApiError.conflict(
      'Chương trình học của khóa này chưa có cây kỹ năng nên chưa thể đặt mục tiêu. Vui lòng liên hệ bộ phận hỗ trợ.',
    );
  }
  const masteries = await loadMasteryStates(enrollment.id, skills);
  const currentLevel = currentLevelOf(enrollment);

  const feasibility = checkGoalFeasibility({
    masteries,
    skills,
    currentLevel,
    targetLevel: input.targetLevel,
    daysUntilDeadline,
    daysPerWeek: input.daysPerWeek,
    minutesPerDay: input.minutesPerDay,
    levelConfig: config.levels,
    config: config.recommendation,
  });

  const accessEndsBeforeDeadline = enrollment.expiresAt.getTime() < toDateOnly(input.deadline).getTime();
  const suggestions = buildFeasibilitySuggestions(feasibility, input, config, accessEndsBeforeDeadline);

  const goal = await prisma.$transaction(async (tx) => {
    await tx.goal.updateMany({ where: { enrollmentId: enrollment.id, active: true }, data: { active: false } });
    return tx.goal.create({
      data: {
        enrollmentId: enrollment.id,
        currentLevel,
        targetLevel: input.targetLevel,
        deadline: toDateOnly(input.deadline),
        daysPerWeek: input.daysPerWeek,
        minutesPerDay: input.minutesPerDay,
        feasibility: feasibility.status,
        feasibilityData: toJson({
          ...feasibility,
          currentLevel,
          currentLevelLabel: levelLabel(currentLevel, config),
          targetLevelLabel: levelLabel(input.targetLevel, config),
          daysUntilDeadline,
          accessEndsBeforeDeadline,
          suggestions,
          computedAt: new Date().toISOString(),
        }),
      },
    });
  });

  await track({
    eventName: EVENTS.GOAL_CREATED,
    enrollmentId: enrollment.id,
    userId: enrollment.student.userId,
    properties: {
      target_level: input.targetLevel,
      deadline: toDateOnly(input.deadline).toISOString(),
      minutes_per_day: input.minutesPerDay,
      days_per_week: input.daysPerWeek,
      feasibility: feasibility.status,
    },
  });

  const plan = await generatePlan({
    enrollmentId: enrollment.id,
    cycleNo: 1,
    reason: 'Học sinh vừa đặt mục tiêu mới',
  });

  return { goalId: goal.id, feasibility, planId: plan.planId };
}

/** Đề xuất cụ thể để UI hiển thị nút bấm, không chỉ một câu cảnh báo chung chung. */
function buildFeasibilitySuggestions(
  feasibility: FeasibilityResult,
  input: CreateGoalInputData,
  config: PlatformConfig,
  accessEndsBeforeDeadline: boolean,
): { code: string; label: string }[] {
  const suggestions: { code: string; label: string }[] = [];
  if (feasibility.status !== 'FEASIBLE') {
    if (feasibility.suggestedMinutesPerDay > input.minutesPerDay) {
      suggestions.push({
        code: 'INCREASE_MINUTES',
        label: `Tăng lên ${feasibility.suggestedMinutesPerDay} phút mỗi ngày.`,
      });
    }
    if (feasibility.suggestedDaysPerWeek > input.daysPerWeek) {
      suggestions.push({
        code: 'INCREASE_DAYS',
        label: `Tăng lên ${feasibility.suggestedDaysPerWeek} buổi mỗi tuần.`,
      });
    }
    if (feasibility.suggestedExtraDays > 0) {
      suggestions.push({
        code: 'EXTEND_DEADLINE',
        label: `Lùi mốc thêm ${feasibility.suggestedExtraDays} ngày (khoảng ${Math.ceil(feasibility.suggestedExtraDays / 7)} tuần).`,
      });
    }
    suggestions.push({
      code: 'LOWER_TARGET',
      label: `Hạ mục tiêu xuống mức thấp hơn ${levelLabel(input.targetLevel, config)} để về đích chắc chắn hơn.`,
    });
  }
  if (accessEndsBeforeDeadline) {
    suggestions.push({
      code: 'EXTEND_ACCESS',
      label: 'Quyền truy cập khóa học kết thúc trước mốc mục tiêu — cần gia hạn để học trọn lộ trình.',
    });
  }
  return suggestions;
}

// ---------------------------------------------------------------------------
// Sinh lộ trình (specs §7.6, §7.8)
// ---------------------------------------------------------------------------

export interface GeneratePlanInputData {
  enrollmentId: string;
  cycleNo?: number;
  reason: string;
  loadFactor?: number;
  teacherFocusSkillIds?: string[];
}

export async function generatePlan(
  input: GeneratePlanInputData,
): Promise<{ planId: string; days: number; warnings: string[] }> {
  const enrollment = await loadEnrollment(input.enrollmentId);
  assertEnrollmentUsable(enrollment);

  const goal = await prisma.goal.findFirst({
    where: { enrollmentId: enrollment.id, active: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!goal) {
    throw ApiError.badRequest('Bạn cần đặt mục tiêu học tập trước khi hệ thống sinh lộ trình.');
  }

  const config = await getConfig();
  const recConfig = config.recommendation;

  const skills = await loadSkillGraph(enrollment.course.subject, enrollment.course.gradeBand);
  if (skills.length === 0) {
    throw ApiError.conflict(
      'Chương trình học của khóa này chưa có cây kỹ năng nên chưa sinh được lộ trình.',
    );
  }
  const masteries = await loadMasteryStates(enrollment.id, skills);
  const pool = await loadCandidatePool(enrollment, skills.map((s) => s.id));

  const warnings: string[] = [];
  if (pool.length === 0) {
    warnings.push(
      'Kho câu hỏi đã xuất bản cho môn và khối này đang rỗng — lộ trình được tạo nhưng chưa có bài để làm.',
    );
  }

  const daysToExam = enrollment.cohort ? daysUntil(enrollment.cohort.examDate) : null;
  const targetMastery = config.levels.masteryTargets[goal.targetLevel] ?? 0;

  const gaps = computeGapPriorities({
    skills,
    masteries,
    targetMastery,
    daysToExam,
    config: recConfig,
    teacherFocusSkillIds: input.teacherFocusSkillIds,
  });

  // Chương trọng tâm chu kỳ = chương của những kỹ năng ưu tiên cao nhất; số kỹ
  // năng lấy theo trần "số kỹ năng chạm tới trong một ngày" của cấu hình.
  const focusSkillCount = Math.max(1, Math.round(recConfig.maxSkillsPerDay));
  const orderedGaps = [...gaps].sort((a, b) => b.priority - a.priority);
  const skillById = new Map(skills.map((s) => [s.id, s]));
  const focusSkills = orderedGaps.slice(0, focusSkillCount);
  const coreChapterIds: string[] = [];
  for (const gap of focusSkills) {
    const chapterId = skillById.get(gap.skillId)?.chapterId;
    if (chapterId && !coreChapterIds.includes(chapterId)) coreChapterIds.push(chapterId);
  }

  // -- Lịch ngày học của chu kỳ ---------------------------------------------
  const cycleDays = Math.max(1, Math.round(config.assessment.cycleDays));
  const startDate = vnToday();
  const studyDayCount = Math.max(1, Math.round((cycleDays / 7) * goal.daysPerWeek));
  const cycleEnd = addDays(startDate, cycleDays - 1);
  const accessEnd = toDateOnly(enrollment.expiresAt);
  const dates = pickStudyDates(startDate, studyDayCount, goal.daysPerWeek).filter(
    (date) => date.getTime() <= cycleEnd.getTime() && date.getTime() <= accessEnd.getTime(),
  );
  if (dates.length === 0) {
    warnings.push(
      `Quyền truy cập kết thúc ngày ${formatDateVN(enrollment.expiresAt)} nên không còn ngày học nào trong chu kỳ ${cycleDays} ngày.`,
    );
  }

  // -- Sinh từng ngày --------------------------------------------------------
  const warningDays = new Map<string, string[]>();
  const usedItemIds = new Set<string>();
  const skillsByDay: string[][] = [];
  const generated: { date: Date; dayIndex: number; result: DayPlanResult }[] = [];

  const seedRecentSkillIds = masteries
    .filter((m) => m.lastPracticedAt !== null)
    .filter((m) => diffDays(startDate, m.lastPracticedAt as Date) <= WARMUP_LOOKBACK_DAYS)
    .sort(
      (a, b) => (b.lastPracticedAt as Date).getTime() - (a.lastPracticedAt as Date).getTime(),
    )
    .slice(0, focusSkillCount)
    .map((m) => m.skillId);

  for (let index = 0; index < dates.length; index++) {
    const date = dates[index]!;
    // LOẠI TRỪ LŨY TIẾN: câu đã xếp cho ngày trước không được lặp lại ngày sau.
    const candidates = pool.filter((item) => !usedItemIds.has(item.id));

    const recentSkillIds =
      index === 0
        ? seedRecentSkillIds
        : [...new Set([...(skillsByDay[index - 1] ?? []), ...(skillsByDay[index - 2] ?? [])])];

    const result = buildDayPlan({
      gaps,
      masteries,
      skills,
      candidates,
      minutesBudget: goal.minutesPerDay,
      coreChapterIds,
      recentSkillIds,
      now: date,
      config: recConfig,
      loadFactor: input.loadFactor,
    });

    for (const item of result.items) usedItemIds.add(item.itemId);
    skillsByDay.push([...new Set(result.items.map((item) => item.skillId))]);

    const dayLabel = formatDateVN(date);
    for (const warning of result.warnings) {
      const days = warningDays.get(warning);
      if (days) days.push(dayLabel);
      else warningDays.set(warning, [dayLabel]);
    }

    generated.push({ date, dayIndex: index + 1, result });
  }

  for (const [warning, days] of warningDays) {
    warnings.push(`${warning} (các ngày: ${days.join(', ')})`);
  }

  // -- Ghi xuống DB ----------------------------------------------------------
  const cycleNo = input.cycleNo ?? (await nextCycleNo(enrollment.id));
  const endDate = dates.length > 0 ? dates[dates.length - 1]! : cycleEnd;
  const supersedeNote = `Lộ trình được sinh lại ngày ${formatDateVN(startDate)}: ${input.reason}`;

  const generatedReason = {
    reason: input.reason,
    loadFactor: input.loadFactor ?? 1,
    teacherFocusSkillIds: input.teacherFocusSkillIds ?? [],
    daysToExam,
    targetLevel: goal.targetLevel,
    targetMastery,
    minutesPerDay: goal.minutesPerDay,
    daysPerWeek: goal.daysPerWeek,
    cycleDays,
    poolSize: pool.length,
    topGaps: focusSkills.map((gap) => ({
      skillId: gap.skillId,
      skillName: skillById.get(gap.skillId)?.name ?? null,
      priority: round(gap.priority),
      masteryScore: round(gap.masteryScore, 1),
      reason: gap.reason,
    })),
    warnings,
    generatedAt: new Date().toISOString(),
  };

  const focusJson = {
    chapters: coreChapterIds.map((id) => ({
      id,
      name: skills.find((s) => s.chapterId === id)?.chapterName ?? id,
    })),
    skills: focusSkills.map((gap) => ({
      id: gap.skillId,
      name: skillById.get(gap.skillId)?.name ?? gap.skillId,
      priority: round(gap.priority),
    })),
  };

  const planId = await prisma.$transaction(
    async (tx) => {
      // Ngày chưa học của lộ trình cũ KHÔNG bị xóa — chuyển sang "đã dời lịch"
      // để lịch sử học tập vẫn đầy đủ (specs §10.2).
      await tx.studyPlanDay.updateMany({
        where: {
          plan: { enrollmentId: enrollment.id, status: PLAN_STATUS.ACTIVE },
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
        },
        data: { status: 'RESCHEDULED', note: supersedeNote },
      });
      await tx.studyPlan.updateMany({
        where: { enrollmentId: enrollment.id, status: PLAN_STATUS.ACTIVE },
        data: { status: PLAN_STATUS.SUPERSEDED },
      });

      const plan = await tx.studyPlan.create({
        data: {
          enrollmentId: enrollment.id,
          goalId: goal.id,
          cycleNo,
          startDate,
          endDate,
          focus: toJson(focusJson),
          status: PLAN_STATUS.ACTIVE,
          engineVersion: ENGINE_VERSION,
          generatedReason: toJson(generatedReason),
        },
      });

      for (const day of generated) {
        const planDay = await tx.studyPlanDay.create({
          data: {
            planId: plan.id,
            date: day.date,
            dayIndex: day.dayIndex,
            status: 'PLANNED',
            estimatedMinutes: day.result.estimatedMinutes,
          },
        });

        if (day.result.items.length > 0) {
          await tx.planDayItem.createMany({
            data: day.result.items.map((item) => ({
              planDayId: planDay.id,
              itemId: item.itemId,
              block: item.block,
              order: item.order,
              status: PLAN_ITEM_STATUS.PENDING,
            })),
          });

          // Rule §7.8: MỌI câu được giao đều có bản ghi lý do kèm điểm ưu tiên.
          await tx.recommendation.createMany({
            data: day.result.items.map((item) => ({
              enrollmentId: enrollment.id,
              skillId: item.skillId,
              itemId: item.itemId,
              planDayId: planDay.id,
              reasonCode: item.reasonCode,
              reasonData: toJson({
                ...item.reasonData,
                dayIndex: day.dayIndex,
                date: formatDateVN(day.date),
                cycleNo,
              }),
              gapPriority: item.gapPriority,
              engineVersion: ENGINE_VERSION,
            })),
          });
        }

        // Quyết định "chọn kỹ năng trọng tâm" cũng phải có lý do lưu lại.
        if (day.dayIndex === 1 && focusSkills.length > 0) {
          await tx.recommendation.createMany({
            data: focusSkills.map((gap) => ({
              enrollmentId: enrollment.id,
              skillId: gap.skillId,
              planDayId: planDay.id,
              reasonCode: 'PLAN_WEEKLY_FOCUS',
              reasonData: toJson({
                skillName: skillById.get(gap.skillId)?.name ?? null,
                chapterId: skillById.get(gap.skillId)?.chapterId ?? null,
                factors: gap.factors,
                gapReason: gap.reason,
                masteryScore: round(gap.masteryScore, 1),
                targetMastery: round(gap.targetMastery, 1),
                cycleNo,
              }),
              gapPriority: gap.priority,
              engineVersion: ENGINE_VERSION,
            })),
          });
        }
      }

      return plan.id;
    },
    { timeout: 60_000, maxWait: 15_000 },
  );

  await writeAudit({
    actorId: enrollment.student.userId,
    actorRole: 'STUDENT',
    action: AUDIT_ACTIONS.PLAN_REGENERATE,
    entityType: 'StudyPlan',
    entityId: planId,
    after: {
      cycleNo,
      days: generated.length,
      reason: input.reason,
      loadFactor: input.loadFactor ?? 1,
      warnings: warnings.length,
    },
  });

  return { planId, days: generated.length, warnings };
}

async function nextCycleNo(enrollmentId: string): Promise<number> {
  const last = await prisma.studyPlan.findFirst({
    where: { enrollmentId },
    orderBy: { cycleNo: 'desc' },
    select: { cycleNo: true },
  });
  return (last?.cycleNo ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Đọc lộ trình
// ---------------------------------------------------------------------------

const planDayInclude = {
  items: { select: { block: true, status: true } },
} satisfies Prisma.StudyPlanDayInclude;

function toGoalSummary(
  goal: {
    id: string;
    currentLevel: StudentLevel;
    targetLevel: StudentLevel;
    deadline: Date;
    daysPerWeek: number;
    minutesPerDay: number;
    feasibility: string;
    feasibilityData: Prisma.JsonValue;
  },
  config: PlatformConfig,
): GoalSummary {
  const data = asRecord(goal.feasibilityData);
  return {
    id: goal.id,
    currentLevel: goal.currentLevel,
    currentLevelLabel: levelLabel(goal.currentLevel, config),
    targetLevel: goal.targetLevel,
    targetLevelLabel: levelLabel(goal.targetLevel, config),
    deadline: goal.deadline,
    deadlineLabel: formatDateVN(goal.deadline),
    daysLeft: daysUntil(goal.deadline),
    daysPerWeek: goal.daysPerWeek,
    minutesPerDay: goal.minutesPerDay,
    feasibility: goal.feasibility,
    feasibilityMessage:
      typeof data.message === 'string' ? data.message : 'Chưa có đánh giá tính khả thi cho mục tiêu này.',
  };
}

function toDaySummary(
  day: Prisma.StudyPlanDayGetPayload<{ include: typeof planDayInclude }>,
  today: Date,
): PlanDaySummary {
  const counts = new Map<BlockType, number>();
  let doneCount = 0;
  for (const item of day.items) {
    counts.set(item.block, (counts.get(item.block) ?? 0) + 1);
    if (item.status !== PLAN_ITEM_STATUS.PENDING) doneCount += 1;
  }
  return {
    id: day.id,
    date: day.date,
    dateLabel: formatDayLabelVN(day.date),
    dayIndex: day.dayIndex,
    status: day.status,
    statusLabel: PLAN_DAY_STATUS_LABEL[day.status],
    estimatedMinutes: day.estimatedMinutes,
    actualMinutes: day.actualMinutes,
    itemCount: day.items.length,
    doneCount,
    isToday: day.date.getTime() === today.getTime(),
    rescheduledFrom: day.rescheduledFrom,
    note: day.note,
    blocks: BLOCK_ORDER.filter((block) => (counts.get(block) ?? 0) > 0).map((block) => ({
      block,
      label: BLOCK_LABEL[block],
      count: counts.get(block) ?? 0,
    })),
  };
}

export async function getCurrentPlan(enrollmentId: string): Promise<CurrentPlan | null> {
  const config = await getConfig();
  const plan = await prisma.studyPlan.findFirst({
    where: { enrollmentId, status: PLAN_STATUS.ACTIVE },
    orderBy: { createdAt: 'desc' },
    include: {
      goal: true,
      days: { orderBy: { date: 'asc' }, include: planDayInclude },
    },
  });
  if (!plan) return null;

  const today = vnToday();
  const days = plan.days.map((day) => toDaySummary(day, today));
  const focus = asRecord(plan.focus);
  const generated = asRecord(plan.generatedReason);

  return {
    id: plan.id,
    cycleNo: plan.cycleNo,
    startDate: plan.startDate,
    endDate: plan.endDate,
    status: plan.status,
    engineVersion: plan.engineVersion,
    goal: plan.goal ? toGoalSummary(plan.goal, config) : null,
    focusChapters: Array.isArray(focus.chapters)
      ? (focus.chapters as { id: string; name: string }[])
      : [],
    focusSkills: Array.isArray(focus.skills)
      ? (focus.skills as { id: string; name: string; priority: number }[])
      : [],
    days,
    totalItems: days.reduce((sum, day) => sum + day.itemCount, 0),
    totalEstimatedMinutes: days.reduce((sum, day) => sum + day.estimatedMinutes, 0),
    warnings: Array.isArray(generated.warnings) ? (generated.warnings as string[]) : [],
  };
}

/** Chi tiết một ngày học. KHÔNG kèm đáp án hay lời giải — đó là việc của learning. */
export async function getPlanDay(planDayId: string, userId: string): Promise<PlanDayDetail> {
  const day = await prisma.studyPlanDay.findUnique({
    where: { id: planDayId },
    include: {
      plan: { select: { id: true, enrollment: { select: { student: { select: { userId: true } } } } } },
      items: {
        orderBy: { order: 'asc' },
        include: {
          item: {
            select: {
              id: true,
              itemCode: true,
              difficulty: true,
              estimatedTime: true,
              skill: { select: { id: true, name: true, chapter: { select: { name: true } } } },
            },
          },
        },
      },
      recommendations: {
        orderBy: { createdAt: 'asc' },
        select: { itemId: true, reasonCode: true, reasonData: true },
      },
    },
  });
  if (!day) throw ApiError.notFound('Không tìm thấy buổi học này.');
  if (day.plan.enrollment.student.userId !== userId) {
    throw ApiError.forbidden('Buổi học này không thuộc về tài khoản của bạn.');
  }

  const reasonByItem = new Map<string, { reasonCode: string; reasonData: Prisma.JsonValue }>();
  for (const rec of day.recommendations) {
    if (rec.itemId) reasonByItem.set(rec.itemId, { reasonCode: rec.reasonCode, reasonData: rec.reasonData });
  }

  const items: PlanDayItemView[] = day.items.map((planItem) => {
    const reason = reasonByItem.get(planItem.itemId) ?? null;
    return {
      planDayItemId: planItem.id,
      itemId: planItem.itemId,
      itemCode: planItem.item.itemCode,
      block: planItem.block,
      blockLabel: BLOCK_LABEL[planItem.block],
      order: planItem.order,
      status: planItem.status,
      skillId: planItem.item.skill.id,
      skillName: planItem.item.skill.name,
      chapterName: planItem.item.skill.chapter.name,
      difficulty: planItem.item.difficulty,
      difficultyLabel: DIFFICULTY_LABEL[planItem.item.difficulty],
      estimatedTimeSeconds: planItem.item.estimatedTime,
      reasonCode: reason?.reasonCode ?? null,
      reasonMessage: reason ? describeReason(reason.reasonCode, reason.reasonData) : null,
    };
  });

  const done = items.filter((item) => item.status !== PLAN_ITEM_STATUS.PENDING).length;

  return {
    id: day.id,
    planId: day.plan.id,
    date: day.date,
    dateLabel: formatDayLabelVN(day.date),
    dayIndex: day.dayIndex,
    status: day.status,
    statusLabel: PLAN_DAY_STATUS_LABEL[day.status],
    estimatedMinutes: day.estimatedMinutes,
    actualMinutes: day.actualMinutes,
    startedAt: day.startedAt,
    completedAt: day.completedAt,
    rescheduledFrom: day.rescheduledFrom,
    note: day.note,
    progress: { done, total: items.length },
    blocks: summarizeBlocks(items),
    items,
  };
}

/** Gộp các câu trong ngày theo block để học sinh thấy "buổi học gồm mấy phần". */
function summarizeBlocks(items: PlanDayItemView[]): TodayBlockSummary[] {
  const grouped = new Map<BlockType, PlanDayItemView[]>();
  for (const item of items) {
    const list = grouped.get(item.block);
    if (list) list.push(item);
    else grouped.set(item.block, [item]);
  }

  return BLOCK_ORDER.filter((block) => grouped.has(block)).map((block) => {
    const blockItems = grouped.get(block) ?? [];
    const seconds = blockItems.reduce((sum, item) => sum + Math.max(0, item.estimatedTimeSeconds), 0);
    const skillNames = [...new Set(blockItems.map((item) => item.skillName))];
    const dominantReason = blockItems.find((item) => item.reasonCode !== null);
    return {
      block,
      label: BLOCK_LABEL[block],
      description: BLOCK_DESCRIPTION[block],
      itemCount: blockItems.length,
      estimatedMinutes: Math.max(1, Math.round(seconds / 60)),
      doneCount: blockItems.filter((item) => item.status !== PLAN_ITEM_STATUS.PENDING).length,
      skillNames,
      reason: dominantReason?.reasonMessage ?? BLOCK_DESCRIPTION[block],
    };
  });
}

// ---------------------------------------------------------------------------
// Màn hình "Hôm nay học gì" (specs §9.2 màn 9)
// ---------------------------------------------------------------------------

export async function getTodayPlan(enrollmentId: string): Promise<TodayPlan> {
  const enrollment = await loadEnrollment(enrollmentId);
  const config = await getConfig();
  const today = vnToday();
  const warnings: string[] = [];

  // Ngày đã qua mà chưa học xong phải được đánh dấu trước khi hiển thị tiến độ.
  const missedNow = await markMissedDays(enrollment.id);

  const plan = await prisma.studyPlan.findFirst({
    where: { enrollmentId: enrollment.id, status: PLAN_STATUS.ACTIVE },
    orderBy: { createdAt: 'desc' },
    include: { goal: true, days: { orderBy: { date: 'asc' }, include: planDayInclude } },
  });

  const goal = plan?.goal
    ? toGoalSummary(plan.goal, config)
    : await loadActiveGoalSummary(enrollment.id, config);

  const [progress, nextAssessment, nextTeacherSession] = await Promise.all([
    getPlanProgress(enrollment.id),
    loadUpcomingAssessment(enrollment, config),
    loadUpcomingTeacherSession(enrollment.id),
  ]);

  if (!plan) {
    return {
      enrollmentId: enrollment.id,
      goal,
      plan: null,
      day: null,
      isStudyDayToday: false,
      blocks: [],
      headline: goal
        ? 'Bạn đã có mục tiêu nhưng chưa có lộ trình. Hãy bấm tạo lộ trình để bắt đầu.'
        : 'Bạn chưa đặt mục tiêu học tập. Hãy đặt mục tiêu để hệ thống dựng lộ trình cho bạn.',
      whyMessage:
        'Hệ thống cần mục tiêu và quỹ thời gian của bạn để chọn đúng phần cần học trước.',
      impactMessage: 'Sau khi có lộ trình, mỗi buổi học hoàn thành sẽ được tính vào tiến độ chu kỳ.',
      cycleProgress: { cycleNo: 0, completedDays: 0, totalDays: 0, percent: 0, missedDays: 0 },
      progress,
      nextAssessment,
      nextTeacherSession,
      warnings,
    };
  }

  const days = plan.days;
  const todayDay = days.find((day) => day.date.getTime() === today.getTime()) ?? null;
  const upcoming =
    todayDay ??
    days.find(
      (day) => day.date.getTime() > today.getTime() && day.status !== 'RESCHEDULED',
    ) ??
    null;

  const completedDays = days.filter((day) => day.status === 'COMPLETED').length;
  const missedDays = days.filter((day) => day.status === 'MISSED').length;
  const focus = asRecord(plan.focus);
  const focusChapters = Array.isArray(focus.chapters)
    ? (focus.chapters as { id: string; name: string }[])
    : [];

  let blocks: TodayBlockSummary[] = [];
  let dayView: TodayPlan['day'] = null;
  if (upcoming) {
    const detail = await getPlanDay(upcoming.id, enrollment.student.userId);
    blocks = detail.blocks;
    dayView = {
      id: detail.id,
      date: detail.date,
      dateLabel: detail.dateLabel,
      dayIndex: detail.dayIndex,
      status: detail.status,
      statusLabel: detail.statusLabel,
      estimatedMinutes: detail.estimatedMinutes,
      actualMinutes: detail.actualMinutes,
      itemCount: detail.progress.total,
      doneCount: detail.progress.done,
      startedAt: detail.startedAt,
    };
    if (detail.progress.total === 0) {
      warnings.push(
        'Buổi học này chưa có câu hỏi nào — kho câu của các kỹ năng đang ưu tiên còn thiếu.',
      );
    }
  }

  if (missedNow > 0) {
    warnings.push(
      `Có ${missedNow} buổi học đã qua mà chưa hoàn thành. Bạn có thể dồn phần bị lỡ sang các buổi còn lại.`,
    );
  }

  const totalDays = days.length;
  const remainingItems = dayView ? dayView.itemCount - dayView.doneCount : 0;

  const headline = !dayView
    ? 'Chu kỳ này đã hết ngày học theo lịch. Hãy làm bài kiểm tra tiến bộ để mở chu kỳ mới.'
    : todayDay
      ? `Hôm nay: ${dayView.itemCount} câu, khoảng ${formatMinutes(dayView.estimatedMinutes)}${
          remainingItems > 0 && remainingItems < dayView.itemCount
            ? ` (còn ${remainingItems} câu)`
            : ''
        }.`
      : `Hôm nay là ngày nghỉ. Buổi kế tiếp: ${dayView.dateLabel} — ${dayView.itemCount} câu, khoảng ${formatMinutes(dayView.estimatedMinutes)}.`;

  const whyMessage = buildWhyMessage(blocks, focusChapters, goal);

  const impactMessage = dayView
    ? `Hoàn thành buổi này, bạn đạt ${Math.min(completedDays + 1, totalDays)}/${totalDays} buổi của chu kỳ ${plan.cycleNo} (${Math.round(ratio(Math.min(completedDays + 1, totalDays), totalDays) * 100)}%) và tích lũy thêm khoảng ${formatMinutes(dayView.estimatedMinutes)} luyện tập.`
    : `Bạn đã hoàn thành ${completedDays}/${totalDays} buổi của chu kỳ ${plan.cycleNo}.`;

  return {
    enrollmentId: enrollment.id,
    goal,
    plan: {
      id: plan.id,
      cycleNo: plan.cycleNo,
      startDate: plan.startDate,
      endDate: plan.endDate,
      focusChapters,
    },
    day: dayView,
    isStudyDayToday: todayDay !== null,
    blocks,
    headline,
    whyMessage,
    impactMessage,
    cycleProgress: {
      cycleNo: plan.cycleNo,
      completedDays,
      totalDays,
      percent: Math.round(ratio(completedDays, totalDays) * 100),
      missedDays,
    },
    progress,
    nextAssessment,
    nextTeacherSession,
    warnings,
  };
}

function buildWhyMessage(
  blocks: TodayBlockSummary[],
  focusChapters: { id: string; name: string }[],
  goal: GoalSummary | null,
): string {
  if (blocks.length === 0) {
    return 'Chưa có bài nào được giao cho buổi học này.';
  }
  const repair = blocks.find((block) => block.block === 'REPAIR');
  const parts: string[] = [];
  if (repair && repair.skillNames.length > 0) {
    parts.push(
      `Phần lớn buổi học nhắm vào kỹ năng đang hổng: ${repair.skillNames.slice(0, 3).join(', ')}.`,
    );
  }
  if (focusChapters.length > 0) {
    parts.push(`Chương trọng tâm của chu kỳ: ${focusChapters.map((c) => c.name).join(', ')}.`);
  }
  if (goal) {
    parts.push(
      `Mục tiêu ${goal.targetLevelLabel} còn ${Math.max(0, goal.daysLeft)} ngày, nên hệ thống ưu tiên phần ảnh hưởng nhiều nhất tới điểm số.`,
    );
  }
  return parts.join(' ');
}

async function loadActiveGoalSummary(
  enrollmentId: string,
  config: PlatformConfig,
): Promise<GoalSummary | null> {
  const goal = await prisma.goal.findFirst({
    where: { enrollmentId, active: true },
    orderBy: { createdAt: 'desc' },
  });
  return goal ? toGoalSummary(goal, config) : null;
}

async function loadUpcomingAssessment(
  enrollment: EnrollmentContext,
  config: PlatformConfig,
): Promise<UpcomingAssessment | null> {
  const pending = await prisma.assessmentAttempt.findFirst({
    where: { enrollmentId: enrollment.id, status: 'IN_PROGRESS' },
    orderBy: { startedAt: 'desc' },
    include: { assessment: { select: { type: true, name: true } } },
  });
  if (pending) {
    const dueAt = pending.dueAt ?? addDays(pending.startedAt, config.assessment.gracePeriodDays);
    return {
      attemptId: pending.id,
      type: pending.assessment.type,
      name: pending.assessment.name,
      state: 'IN_PROGRESS',
      dueAt,
      dueLabel: formatDateVN(dueAt),
      daysLeft: daysUntil(dueAt),
      message: `Bạn còn một bài "${pending.assessment.name}" đang làm dở — bài đã được lưu tự động, hãy vào làm tiếp.`,
    };
  }

  const progressAssessment = await prisma.assessment.findFirst({
    where: { courseId: enrollment.courseId, type: 'PROGRESS', active: true },
    select: { name: true },
  });

  const lastDone = await prisma.assessmentAttempt.findFirst({
    where: { enrollmentId: enrollment.id, status: { in: ['SUBMITTED', 'GRADED'] } },
    orderBy: { startedAt: 'desc' },
    select: { submittedAt: true, startedAt: true },
  });

  const anchor = lastDone?.submittedAt ?? lastDone?.startedAt ?? enrollment.onboardedAt;
  if (!anchor) return null;

  const dueAt = addDays(toDateOnly(anchor), config.assessment.cycleDays);
  const daysLeft = daysUntil(dueAt);
  const name = progressAssessment?.name ?? 'Bài kiểm tra tiến bộ';
  return {
    attemptId: null,
    type: 'PROGRESS',
    name,
    state: daysLeft <= 0 ? 'DUE' : 'UPCOMING',
    dueAt,
    dueLabel: formatDateVN(dueAt),
    daysLeft,
    message:
      daysLeft <= 0
        ? `Đã tới hạn làm "${name}" (hạn ${formatDateVN(dueAt)}). Làm bài để hệ thống đo tiến bộ và sinh lộ trình chu kỳ mới.`
        : `Còn ${daysLeft} ngày nữa tới "${name}" (ngày ${formatDateVN(dueAt)}).`,
  };
}

async function loadUpcomingTeacherSession(
  enrollmentId: string,
): Promise<UpcomingTeacherSession | null> {
  const session = await prisma.teacherSession.findFirst({
    where: { enrollmentId, status: 'SCHEDULED' },
    orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
  });
  if (!session) return null;

  return {
    id: session.id,
    scheduledAt: session.scheduledAt,
    scheduledLabel: session.scheduledAt ? formatDayLabelVN(session.scheduledAt) : null,
    durationMinutes: session.durationMinutes,
    meetingLink: session.meetingLink,
    status: session.status,
    message: session.scheduledAt
      ? `Buổi tư vấn ${session.durationMinutes} phút với giáo viên: ${formatDayLabelVN(session.scheduledAt)}.`
      : 'Bạn có một buổi tư vấn với giáo viên đang chờ chốt lịch.',
  };
}

// ---------------------------------------------------------------------------
// Bỏ lỡ & dàn lại lịch (specs §10.2)
// ---------------------------------------------------------------------------

/**
 * Ngày học đã qua mà chưa hoàn thành → MISSED.
 * KHÔNG xóa khỏi lịch sử: học sinh và giáo viên phải nhìn thấy mình đã bỏ những buổi nào.
 */
export async function markMissedDays(enrollmentId: string): Promise<number> {
  const today = vnToday();
  const where: Prisma.StudyPlanDayWhereInput = {
    plan: { enrollmentId },
    date: { lt: today },
    status: { in: ['PLANNED', 'IN_PROGRESS'] },
  };

  const note = `Chuyển sang trạng thái Bỏ lỡ ngày ${formatDateVN(today)} vì đã qua ngày học mà chưa hoàn thành.`;
  const [withoutNote, withNote] = await prisma.$transaction([
    // Chỉ ghi chú lên ngày chưa có ghi chú để không xóa nguyên nhân dời lịch cũ.
    prisma.studyPlanDay.updateMany({ where: { ...where, note: null }, data: { status: 'MISSED', note } }),
    prisma.studyPlanDay.updateMany({ where: { ...where, note: { not: null } }, data: { status: 'MISSED' } }),
  ]);

  return withoutNote.count + withNote.count;
}

/**
 * Dồn nội dung các buổi bị bỏ lỡ sang những buổi còn lại của lộ trình.
 * Không đủ chỗ thì mở thêm buổi mới — nội dung bị lỡ không bao giờ biến mất.
 */
export async function reschedulePlan(input: {
  enrollmentId: string;
  reason: string;
}): Promise<{ movedDays: number; message: string }> {
  const enrollment = await loadEnrollment(input.enrollmentId);
  assertEnrollmentUsable(enrollment);
  await markMissedDays(enrollment.id);

  const config = await getConfig();
  const today = vnToday();

  const plan = await prisma.studyPlan.findFirst({
    where: { enrollmentId: enrollment.id, status: PLAN_STATUS.ACTIVE },
    orderBy: { createdAt: 'desc' },
    include: {
      goal: true,
      days: {
        orderBy: { date: 'asc' },
        include: { items: { orderBy: { order: 'asc' } } },
      },
    },
  });
  if (!plan) throw ApiError.notFound('Bạn chưa có lộ trình đang hoạt động để dàn lại lịch.');

  const missedDays = plan.days.filter(
    (day) => day.status === 'MISSED' && day.items.some((item) => item.status === PLAN_ITEM_STATUS.PENDING),
  );
  if (missedDays.length === 0) {
    return {
      movedDays: 0,
      message: 'Không có buổi học nào bị bỏ lỡ cần dàn lại. Lịch học của bạn vẫn đang đúng tiến độ.',
    };
  }

  const pendingCount = missedDays.reduce(
    (sum, day) => sum + day.items.filter((item) => item.status === PLAN_ITEM_STATUS.PENDING).length,
    0,
  );

  // Chỗ trống ở các buổi còn lại, tôn trọng trần số câu mỗi ngày của cấu hình.
  const maxItemsPerDay = Math.max(1, Math.round(config.recommendation.maxItemsPerDay));
  const targets = plan.days
    .filter((day) => day.date.getTime() >= today.getTime() && day.status === 'PLANNED')
    .map((day) => ({
      id: day.id,
      date: day.date,
      itemIds: new Set(day.items.map((item) => item.itemId)),
      count: day.items.length,
      maxOrder: day.items.reduce((max, item) => Math.max(max, item.order), 0),
      estimatedMinutes: day.estimatedMinutes,
      touched: false,
      rescheduledFrom: day.rescheduledFrom,
    }));

  let freeSlots = targets.reduce((sum, day) => sum + Math.max(0, maxItemsPerDay - day.count), 0);
  const createdDays: typeof targets = [];

  // Thiếu chỗ → mở thêm buổi sau buổi cuối cùng theo đúng nhịp ngày/tuần.
  if (freeSlots < pendingCount) {
    const daysPerWeek = plan.goal?.daysPerWeek ?? 5;
    const needed = Math.ceil((pendingCount - freeSlots) / maxItemsPerDay);
    const lastDate = plan.days.reduce(
      (max, day) => (day.date.getTime() > max.getTime() ? day.date : max),
      today,
    );
    const existingDates = new Set(plan.days.map((day) => day.date.getTime()));
    const accessEnd = toDateOnly(enrollment.expiresAt);
    const extraDates = pickStudyDates(addDays(lastDate, 1), needed + 2, daysPerWeek)
      .filter((date) => !existingDates.has(date.getTime()) && date.getTime() <= accessEnd.getTime())
      .slice(0, needed);

    let dayIndex = plan.days.reduce((max, day) => Math.max(max, day.dayIndex), 0);
    for (const date of extraDates) {
      dayIndex += 1;
      const created = await prisma.studyPlanDay.create({
        data: {
          planId: plan.id,
          date,
          dayIndex,
          status: 'PLANNED',
          estimatedMinutes: 0,
          note: `Buổi bù được mở thêm khi dàn lại lịch: ${input.reason}`,
        },
      });
      createdDays.push({
        id: created.id,
        date: created.date,
        itemIds: new Set<string>(),
        count: 0,
        maxOrder: 0,
        estimatedMinutes: 0,
        touched: false,
        rescheduledFrom: null,
      });
    }
    targets.push(...createdDays);
    freeSlots = targets.reduce((sum, day) => sum + Math.max(0, maxItemsPerDay - day.count), 0);
  }

  const moves: {
    itemId: string;
    planDayItemId: string;
    fromDayId: string;
    fromDate: Date;
    toDayId: string;
    order: number;
  }[] = [];
  const leftBehind: string[] = [];

  for (const missed of missedDays) {
    for (const item of missed.items) {
      if (item.status !== PLAN_ITEM_STATUS.PENDING) continue;
      const target = targets.find(
        (day) => day.count < maxItemsPerDay && !day.itemIds.has(item.itemId),
      );
      if (!target) {
        leftBehind.push(item.id);
        continue;
      }
      target.itemIds.add(item.itemId);
      target.count += 1;
      target.maxOrder += 1;
      target.touched = true;
      if (!target.rescheduledFrom) target.rescheduledFrom = missed.date;
      moves.push({
        itemId: item.itemId,
        planDayItemId: item.id,
        fromDayId: missed.id,
        fromDate: missed.date,
        toDayId: target.id,
        order: target.maxOrder,
      });
    }
  }

  const movedDayIds = new Set(moves.map((move) => move.fromDayId));

  await prisma.$transaction(
    async (tx) => {
      for (const move of moves) {
        await tx.planDayItem.update({
          where: { id: move.planDayItemId },
          data: { planDayId: move.toDayId, order: move.order },
        });
        // Lý do chọn câu phải đi theo câu, nếu không màn "Vì sao giao bài này" sẽ trống.
        await tx.recommendation.updateMany({
          where: { planDayId: move.fromDayId, itemId: move.itemId },
          data: { planDayId: move.toDayId },
        });
      }

      for (const target of targets) {
        if (!target.touched) continue;
        const seconds = await tx.planDayItem.findMany({
          where: { planDayId: target.id },
          select: { item: { select: { estimatedTime: true } } },
        });
        const minutes = Math.round(
          seconds.reduce((sum, row) => sum + Math.max(0, row.item.estimatedTime), 0) / 60,
        );
        await tx.studyPlanDay.update({
          where: { id: target.id },
          data: {
            estimatedMinutes: minutes,
            rescheduledFrom: target.rescheduledFrom,
            note: `Nhận thêm bài từ buổi bị bỏ lỡ ngày ${target.rescheduledFrom ? formatDateVN(target.rescheduledFrom) : ''} — ${input.reason}`,
          },
        });
      }

      for (const missed of missedDays) {
        if (!movedDayIds.has(missed.id)) continue;
        const movedCount = moves.filter((move) => move.fromDayId === missed.id).length;
        await tx.studyPlanDay.update({
          where: { id: missed.id },
          data: {
            status: 'RESCHEDULED',
            note: `Bỏ lỡ ngày ${formatDateVN(missed.date)} — đã dời ${movedCount} câu sang buổi sau. Lý do: ${input.reason}`,
          },
        });
      }
    },
    { timeout: 60_000, maxWait: 15_000 },
  );

  await track({
    eventName: EVENTS.RECOMMENDATION_CHANGED,
    enrollmentId: enrollment.id,
    userId: enrollment.student.userId,
    properties: {
      reason: `reschedule:${input.reason}`,
      moved_days: movedDayIds.size,
      moved_items: moves.length,
      left_behind: leftBehind.length,
    },
  });

  const targetDates = [...new Set(moves.map((move) => move.toDayId))]
    .map((id) => targets.find((day) => day.id === id))
    .filter((day): day is (typeof targets)[number] => Boolean(day))
    .map((day) => formatDateVN(day.date));

  const parts = [
    `Đã dời ${moves.length} câu của ${movedDayIds.size} buổi bị bỏ lỡ sang ${targetDates.length} buổi tiếp theo (${targetDates.join(', ')}).`,
  ];
  if (createdDays.length > 0) {
    parts.push(`Mở thêm ${createdDays.length} buổi bù vì lịch cũ không còn chỗ trống.`);
  }
  if (leftBehind.length > 0) {
    parts.push(
      `Còn ${leftBehind.length} câu chưa xếp được do đã chạm trần ${maxItemsPerDay} câu mỗi buổi và hết ngày trong hạn truy cập.`,
    );
  }

  return { movedDays: movedDayIds.size, message: parts.join(' ') };
}

// ---------------------------------------------------------------------------
// Override của giáo viên (specs §9.3, §10.4)
// ---------------------------------------------------------------------------

/**
 * Quyết định của con người sau buổi tư vấn quay ngược lại điều khiển engine —
 * đây là mắt xích đóng vòng lặp nghiệp vụ.
 */
export async function applyTeacherOverride(input: {
  enrollmentId: string;
  actionCode: TeacherAction;
  focusSkillIds: string[];
  actorId: string;
}): Promise<void> {
  const enrollment = await loadEnrollment(input.enrollmentId);
  assertEnrollmentUsable(enrollment);
  const config = await getConfig();

  const loadFactors = config.recommendation.teacherLoadFactor;
  let loadFactor: number | undefined;
  let teacherFocusSkillIds: string[] | undefined;
  let reason: string;

  switch (input.actionCode) {
    case 'REDUCE_LOAD':
      loadFactor = loadFactors.REDUCE_LOAD;
      reason = 'Giáo viên yêu cầu giảm tải sau buổi tư vấn';
      break;
    case 'INCREASE_LOAD':
      loadFactor = loadFactors.INCREASE_LOAD;
      reason = 'Giáo viên yêu cầu tăng tải sau buổi tư vấn';
      break;
    case 'CHANGE_PRIORITY':
      teacherFocusSkillIds = input.focusSkillIds;
      reason = 'Giáo viên đổi kỹ năng ưu tiên sau buổi tư vấn';
      break;
    default:
      reason = 'Giáo viên giữ nguyên lộ trình sau buổi tư vấn';
      break;
  }

  if (input.actionCode === 'CHANGE_PRIORITY' && input.focusSkillIds.length === 0) {
    throw ApiError.badRequest('Cần chọn ít nhất một kỹ năng khi đổi ưu tiên cho học sinh.');
  }

  const currentPlan = await prisma.studyPlan.findFirst({
    where: { enrollmentId: enrollment.id, status: PLAN_STATUS.ACTIVE },
    orderBy: { createdAt: 'desc' },
    select: { id: true, cycleNo: true },
  });

  // KEEP_PLAN vẫn phải để lại dấu vết: giáo viên đã xem và chủ động không đổi.
  let planId = currentPlan?.id ?? null;
  if (input.actionCode !== 'KEEP_PLAN') {
    const generated = await generatePlan({
      enrollmentId: enrollment.id,
      reason,
      loadFactor,
      teacherFocusSkillIds,
    });
    planId = generated.planId;
  }

  await track({
    eventName: EVENTS.RECOMMENDATION_CHANGED,
    enrollmentId: enrollment.id,
    userId: enrollment.student.userId,
    properties: {
      reason: `teacher:${input.actionCode}`,
      old_priority: currentPlan?.cycleNo ?? null,
      new_priority: loadFactor ?? 1,
      focus_skill_ids: teacherFocusSkillIds ?? [],
      action_code: input.actionCode,
    },
  });

  await writeAudit({
    actorId: input.actorId,
    actorRole: 'TEACHER',
    action: AUDIT_ACTIONS.PLAN_REGENERATE,
    entityType: 'StudyPlan',
    entityId: planId ?? enrollment.id,
    before: { planId: currentPlan?.id ?? null },
    after: {
      actionCode: input.actionCode,
      loadFactor: loadFactor ?? 1,
      focusSkillIds: input.focusSkillIds,
      reason,
    },
  });
}

// ---------------------------------------------------------------------------
// Tiến độ
// ---------------------------------------------------------------------------

export async function getPlanProgress(enrollmentId: string): Promise<PlanProgress> {
  const today = vnToday();

  const [plan, allDays, answered, correct] = await Promise.all([
    prisma.studyPlan.findFirst({
      where: { enrollmentId, status: PLAN_STATUS.ACTIVE },
      orderBy: { createdAt: 'desc' },
      select: {
        days: { select: { status: true, actualMinutes: true } },
      },
    }),
    prisma.studyPlanDay.findMany({
      where: { plan: { enrollmentId } },
      orderBy: { date: 'desc' },
      select: { date: true, status: true },
    }),
    prisma.itemAttempt.count({
      where: { enrollmentId, context: 'PRACTICE', answeredAt: { not: null } },
    }),
    prisma.itemAttempt.count({
      where: { enrollmentId, context: 'PRACTICE', isCorrect: true },
    }),
  ]);

  const days = plan?.days ?? [];
  const totalDays = days.length;
  const completedDays = days.filter((day) => day.status === 'COMPLETED').length;
  const minutesStudied = days.reduce((sum, day) => sum + day.actualMinutes, 0);

  // Chuỗi ngày học liên tiếp: buổi của hôm nay chưa xong thì chưa tính là đứt chuỗi.
  let streakDays = 0;
  for (const day of allDays) {
    if (day.date.getTime() > today.getTime()) continue;
    if (day.status === 'COMPLETED') {
      streakDays += 1;
      continue;
    }
    if (day.date.getTime() === today.getTime()) continue;
    break;
  }

  return {
    completedDays,
    totalDays,
    completionRate: ratio(completedDays, totalDays),
    minutesStudied,
    streakDays,
    itemsAnswered: answered,
    accuracy: ratio(correct, answered),
  };
}
