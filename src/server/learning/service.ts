/**
 * MODULE LEARNING — vòng lặp làm bài hằng ngày của học sinh
 * (specs §9.2 màn hình 10 "Practice Player", §10.1, §10.2).
 *
 *   Bắt đầu buổi học → lấy câu tiếp theo → trả lời → phản hồi tức thì
 *   → (gợi ý / lời giải / báo lỗi) → hết câu thì đóng buổi học.
 *
 * Bốn luật cứng của module này:
 *  1. Khi câu chưa kết thúc, TUYỆT ĐỐI không trả `correctAnswer`/`solution` về
 *     client — truy vấn phục vụ làm bài dùng select riêng, không chứa hai cột đó.
 *  2. Mọi hàm nhận `userId` và tự kiểm tra buổi học/câu hỏi có thuộc về chính
 *     học sinh đó không; dữ liệu client gửi lên (hintUsed, thời gian…) chỉ được
 *     dùng để BỔ SUNG cho cờ đã ghi nhận ở máy chủ, không được ghi đè.
 *  3. Mastery cập nhật ngay sau MỖI câu (§7.2) — không đợi hết buổi.
 *  4. Ngưỡng "chậm", "sai lặp", số lần làm lại lấy từ getConfig(), không hard-code.
 */
import { Prisma } from '@prisma/client';
import type {
  BlockType,
  Difficulty,
  EnrollmentStatus,
  ErrorPattern,
  PlanDayStatus,
  QuestionType,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';
import { getConfig, type PlatformConfig } from '@/lib/config';
import { EVENTS, track } from '@/lib/analytics';
import {
  BLOCK_DESCRIPTION,
  BLOCK_LABEL,
  BLOCK_ORDER,
  DIFFICULTY_LABEL,
  ERROR_PATTERN_LABEL,
  MASTERY_TIER_LABEL,
  PLAN_DAY_STATUS_LABEL,
  formatMinutes,
  masteryTier,
  type MasteryTier,
} from '@/lib/domain';
import { formatDateVN, formatDayLabelVN } from '@/lib/dates';
import { decideDifficulty, type AttemptEvent, type DifficultyDirection } from '@/engine';
import { parseOptions, type ItemOption } from '@/server/content/schemas';
import { flagItem } from '@/server/content/service';
import { applyAttempt } from '@/server/student-model/service';
import { PLAN_ITEM_STATUS } from '@/server/plan/service';
import { gradeAnswer } from './grading';

// ---------------------------------------------------------------------------
// Kiểu dữ liệu công khai
// ---------------------------------------------------------------------------

export interface DayProgressCounts {
  done: number;
  total: number;
}

export interface StartDayResult {
  planDayId: string;
  date: Date;
  dateLabel: string;
  dayIndex: number;
  status: PlanDayStatus;
  statusLabel: string;
  startedAt: Date | null;
  estimatedMinutes: number;
  progress: DayProgressCounts;
  /** true khi buổi học đã được mở từ trước — gọi lại không tạo mốc mới. */
  alreadyStarted: boolean;
  message: string;
}

/** Câu hỏi đang làm — cố tình KHÔNG có `correctAnswer`, `solution`, `hint`. */
export interface NextItemView {
  planDayItemId: string;
  itemId: string;
  itemCode: string;
  order: number;
  block: BlockType;
  blockLabel: string;
  blockDescription: string;
  skillId: string;
  skillName: string;
  chapterName: string;
  questionType: QuestionType;
  stem: string;
  stemImageUrl: string | null;
  options: ItemOption[];
  difficulty: Difficulty;
  difficultyLabel: string;
  estimatedTimeSeconds: number;
  /** Lần làm thứ mấy của câu này; > 1 nghĩa là đang làm lại sau khi sai. */
  attemptNo: number;
  isRetry: boolean;
  retriesLeft: number;
  /** Câu có gợi ý hay không — nội dung gợi ý chỉ trả khi học sinh bấm xem. */
  hintAvailable: boolean;
  hintUsed: boolean;
  solutionViewed: boolean;
  progress: DayProgressCounts;
}

/** Sáu trường hợp phản hồi sau mỗi câu (specs §9.2). */
export type AnswerOutcome =
  | 'CORRECT_FAST'
  | 'CORRECT_SLOW'
  | 'CORRECT_ASSISTED'
  | 'WRONG_FIRST'
  | 'WRONG_REPEATED'
  | 'SOLUTION_VIEWED_BEFORE_ANSWER';

export const ANSWER_OUTCOME_LABEL: Record<AnswerOutcome, string> = {
  CORRECT_FAST: 'Đúng, trong thời gian chuẩn',
  CORRECT_SLOW: 'Đúng nhưng còn chậm',
  CORRECT_ASSISTED: 'Đúng nhờ gợi ý',
  WRONG_FIRST: 'Chưa đúng — còn lượt thử lại',
  WRONG_REPEATED: 'Sai lặp lại',
  SOLUTION_VIEWED_BEFORE_ANSWER: 'Đã xem lời giải trước khi trả lời',
};

export interface PrerequisiteHint {
  skillId: string;
  skillName: string;
  masteryScore: number;
  tier: MasteryTier;
  tierLabel: string;
}

export interface DifficultyOutlook {
  next: Difficulty;
  nextLabel: string;
  direction: DifficultyDirection;
  message: string;
}

export interface AnswerFeedback {
  planDayItemId: string;
  itemAttemptId: string;
  itemId: string;
  skillId: string;
  skillName: string;
  chapterName: string;
  block: BlockType;
  blockLabel: string;

  isCorrect: boolean;
  outcome: AnswerOutcome;
  outcomeLabel: string;
  /** Thông điệp thân thiện hiển thị ngay dưới câu hỏi. */
  message: string;

  attemptNo: number;
  canRetry: boolean;
  retriesLeft: number;
  shouldShowSolution: boolean;

  masteryBefore: number;
  masteryAfter: number;
  delta: number;
  tier: MasteryTier;
  tierLabel: string;
  /** false khi đúng nhờ xem lời giải trước — không được tính là đã thành thạo. */
  countsAsMastered: boolean;

  timeMs: number;
  estimatedTimeSeconds: number;
  /** Thời gian thực tế / thời gian chuẩn. */
  timeRatio: number;
  isSlow: boolean;

  hintAvailable: boolean;
  hintUsed: boolean;
  solutionViewedBeforeAnswer: boolean;
  /** Chỉ khác null khi câu đã kết thúc (đúng hoặc hết lượt làm lại). */
  solution: string | null;
  solutionSteps: string[];
  correctAnswer: unknown;

  errorPattern: ErrorPattern | null;
  errorPatternLabel: string | null;
  /** Việc nên làm tiếp theo, viết cho học sinh đọc. */
  nextStepHint: string | null;
  /** Kỹ năng nền cần vá trước khi luyện tiếp (chỉ có khi sai lặp). */
  prerequisites: PrerequisiteHint[];
  difficulty: DifficultyOutlook;

  progress: DayProgressCounts;
  dayCompleted: boolean;
  dayMessage: string | null;
}

export interface AnswerItemInput {
  userId: string;
  planDayItemId: string;
  answer: unknown;
  timeMs: number;
  hintUsed: boolean;
  solutionViewedBeforeAnswer: boolean;
}

export interface HintReveal {
  planDayItemId: string;
  itemId: string;
  hintAvailable: boolean;
  hint: string | null;
  message: string;
}

export interface SolutionReveal {
  planDayItemId: string;
  itemId: string;
  solution: string;
  solutionSteps: string[];
  /** true khi xem TRƯỚC lúc trả lời → câu này không tính là đã thành thạo. */
  viewedBeforeAnswer: boolean;
  countsAsMastered: boolean;
  message: string;
}

export interface ReportItemInput {
  itemId: string;
  userId: string;
  reason: string;
  detail?: string;
}

export interface ReportItemResult {
  itemId: string;
  itemCode: string;
  message: string;
}

export interface WhyThisItem {
  planDayItemId: string;
  itemId: string;
  itemCode: string;
  block: BlockType;
  blockLabel: string;
  blockDescription: string;
  skillId: string;
  skillName: string;
  chapterName: string;
  difficulty: Difficulty;
  difficultyLabel: string;
  reasonCode: string;
  /** Câu giải thích bằng tiếng Việt dễ hiểu cho học sinh. */
  reason: string;
  /** Chi tiết bổ sung suy từ `reasonData` (số ngày chưa ôn, kỹ năng bị chặn…). */
  details: string[];
  masteryScore: number;
  tier: MasteryTier;
  tierLabel: string;
  targetMastery: number | null;
  gapPriority: number | null;
  decidedAt: Date | null;
}

export interface BlockProgress {
  block: BlockType;
  label: string;
  description: string;
  total: number;
  done: number;
  correct: number;
  accuracy: number;
  percent: number;
}

export interface DayProgress {
  planDayId: string;
  date: Date;
  dateLabel: string;
  dayIndex: number;
  status: PlanDayStatus;
  statusLabel: string;
  done: number;
  total: number;
  remaining: number;
  percent: number;
  correct: number;
  wrong: number;
  /** Tỷ lệ đúng trên số câu đã làm (0–1). */
  accuracy: number;
  minutesStudied: number;
  estimatedMinutes: number;
  startedAt: Date | null;
  completedAt: Date | null;
  blocks: BlockProgress[];
  message: string;
}

// ---------------------------------------------------------------------------
// Diễn giải reasonCode cho học sinh (specs §7.8 — mọi câu đều giải thích được)
// ---------------------------------------------------------------------------

/** Danh sách lấy từ src/engine/day-plan.ts, src/engine/selection.ts và module Lộ trình. */
const REASON_FOR_STUDENT: Record<string, string> = {
  WARMUP_RECENT_SKILL:
    'Đây là kỹ năng em vừa luyện vài hôm trước. Hệ thống cho làm lại một câu vừa sức để kiến thức không nguội trước khi vào phần khó hơn.',
  REPAIR_HIGH_GAP_PRIORITY:
    'Đây là kỹ năng đang cách mục tiêu xa nhất và có tỷ trọng lớn trong đề thi, nên hệ thống ưu tiên vá trước tiên.',
  REPAIR_PREREQUISITE_FIRST:
    'Kỹ năng này là nền của phần em đang hổng, nên hệ thống cho em luyện chắc phần nền trước.',
  CORE_WEEKLY_FOCUS_CHAPTER:
    'Câu này thuộc chương trọng tâm của chu kỳ học hiện tại — phần chiếm tỷ trọng lớn trong cấu trúc đề thi.',
  CHALLENGE_MASTERY_UNLOCKED:
    'Em đã vững kỹ năng này nên hệ thống mở một câu cao hơn một bậc, để em tiến bộ thật chứ không dậm chân ở mức dễ.',
  REVIEW_SPACED_REPETITION:
    'Đã khá lâu em không luyện kỹ năng này. Ôn lại đúng lúc sắp quên là cách nhớ lâu nhất.',
  REVIEW_RETENTION_CHECK:
    'Kỹ năng này em đã vững; hệ thống kiểm tra nhanh xem em còn nhớ chắc hay không.',
  REVIEW_MIXED_PRACTICE:
    'Buổi học trộn nhiều kỹ năng để em quen với việc chuyển dạng bài liên tục như khi đi thi.',
  FILL_DAILY_MINIMUM:
    'Một buổi học cần đủ số câu tối thiểu thì luyện tập mới có hiệu quả, nên hệ thống bổ sung thêm câu ở kỹ năng em đang học.',
  FILL_REMAINING_BUDGET:
    'Quỹ thời gian của buổi học vẫn còn dư, nên hệ thống thêm câu luyện tập ở kỹ năng em đang học.',
  PLAN_WEEKLY_FOCUS: 'Kỹ năng này được chọn làm trọng tâm cho cả chu kỳ học hiện tại.',
  // Câu đến từ đề kiểm tra (bảng Recommendation dùng chung cho cả hai luồng).
  DIAGNOSTIC_ANCHOR:
    'Câu neo của bài kiểm tra đầu vào, dùng làm mốc để đo em tiến bộ bao nhiêu về sau.',
  DIAGNOSTIC_BLUEPRINT:
    'Câu được chọn theo cấu trúc đề thi, để bài kiểm tra phủ đủ các chương quan trọng.',
  PROGRESS_ANCHOR_MATCHED:
    'Câu cùng kỹ năng và cùng độ khó với bài đầu vào, dùng để so sánh tiến bộ một cách công bằng.',
  PROGRESS_ANCHOR_RELAXED:
    'Câu neo gần nhất còn trong kho (không khớp tuyệt đối độ khó) để vẫn so sánh được với bài đầu vào.',
  PROGRESS_TRAINED_SKILL:
    'Kỹ năng em đã luyện trong chu kỳ vừa rồi — bài kiểm tra xem công sức đã chuyển thành năng lực chưa.',
  PROGRESS_TRAINED_BORROWED:
    'Kỹ năng gần với phần em đã luyện, dùng khi kho câu của kỹ năng chính đã hết.',
  PROGRESS_FRESH_BLUEPRINT:
    'Câu hoàn toàn mới theo cấu trúc đề thi, để chắc chắn em hiểu bản chất chứ không học tủ.',
  PROGRESS_BACKFILL: 'Câu bổ sung cho đủ số câu của đề kiểm tra.',
  // Không bịa lý do khi thiếu bản ghi: nói thật là hệ thống chưa lưu được.
  NO_RECOMMENDATION_RECORD:
    'Hệ thống chưa lưu được lý do chi tiết cho câu này. Câu vẫn được chọn theo kỹ năng và độ khó phù hợp với hồ sơ năng lực hiện tại của em.',
};

const DEFAULT_REASON_FOR_STUDENT =
  'Hệ thống chọn câu này dựa trên hồ sơ năng lực hiện tại của em và mục tiêu em đã đặt.';

// ---------------------------------------------------------------------------
// Tiện ích nội bộ
// ---------------------------------------------------------------------------

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Số thập phân theo cách viết của người Việt: 1.5 → "1,5". */
function formatRatio(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

/** Điểm hiển thị cho học sinh: bỏ phần thập phân thừa, dùng dấu phẩy. */
function formatScore(value: number): string {
  return String(round(value)).replace('.', ',');
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? round(numerator / denominator, 2) : 0;
}

function toJsonAnswer(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function parseSteps(raw: Prisma.JsonValue): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeMs(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function tierOf(score: number): { tier: MasteryTier; tierLabel: string } {
  const tier = masteryTier(score);
  return { tier, tierLabel: MASTERY_TIER_LABEL[tier] };
}

/**
 * Số lần làm tối đa cho MỘT câu. Lấy theo ngưỡng "sai liên tiếp" của cấu hình:
 * chạm ngưỡng đó nghĩa là hệ thống đã coi là sai lặp, phải hiện lời giải và hạ
 * độ khó thay vì để học sinh thử mãi (specs §7.4, §9.2).
 */
function maxAttemptsPerItem(config: PlatformConfig): number {
  return Math.max(1, Math.round(config.recommendation.difficultyDown.consecutiveWrong));
}

/** Ngưỡng nhanh/chậm dùng chung với engine để phản hồi khớp với mức tăng mastery. */
function timeThresholds(config: PlatformConfig): { fast: number; slow: number } {
  const fast = Math.max(0.1, config.recommendation.difficultyUp.maxTimeRatio);
  const slow = Math.max(fast + 0.1, config.recommendation.difficultyDown.minTimeRatio);
  return { fast, slow };
}

// ---------------------------------------------------------------------------
// Kiểm tra quyền sở hữu (không tin dữ liệu client gửi lên)
// ---------------------------------------------------------------------------

const ownerSelect = {
  id: true,
  status: true,
  expiresAt: true,
  student: { select: { userId: true } },
} satisfies Prisma.EnrollmentSelect;

const dayInclude = {
  plan: { select: { id: true, cycleNo: true, enrollment: { select: ownerSelect } } },
} satisfies Prisma.StudyPlanDayInclude;

type DayContext = Prisma.StudyPlanDayGetPayload<{ include: typeof dayInclude }>;

function assertOwner(ownerUserId: string, userId: string): void {
  if (ownerUserId !== userId) {
    throw ApiError.forbidden('Nội dung này không thuộc về tài khoản của bạn.');
  }
}

/** Hết hạn hoặc bị khóa thì không được ghi thêm dữ liệu học tập (specs §11). */
function assertEnrollmentUsable(enrollment: { status: EnrollmentStatus; expiresAt: Date }): void {
  if (enrollment.status === 'SUSPENDED') {
    throw ApiError.forbidden('Khóa học của bạn đang tạm khóa. Vui lòng liên hệ bộ phận hỗ trợ.');
  }
  if (enrollment.status === 'EXPIRED' || enrollment.expiresAt.getTime() < Date.now()) {
    throw ApiError.forbidden(
      `Quyền truy cập khóa học đã hết hạn ngày ${formatDateVN(enrollment.expiresAt)}. Hãy gia hạn để tiếp tục học.`,
    );
  }
}

async function loadOwnedDay(planDayId: string, userId: string): Promise<DayContext> {
  const day = await prisma.studyPlanDay.findUnique({
    where: { id: planDayId },
    include: dayInclude,
  });
  if (!day) throw ApiError.notFound('Không tìm thấy buổi học này.');
  assertOwner(day.plan.enrollment.student.userId, userId);
  return day;
}

/**
 * Câu hỏi KHI ĐANG LÀM — cố tình KHÔNG lấy `correctAnswer` và `solution`.
 * `hint` được nạp để biết câu có gợi ý hay không, nhưng nội dung gợi ý chỉ ra
 * khỏi service qua `revealHint` để còn ghi nhận học sinh đã dùng trợ giúp.
 */
const playItemSelect = {
  id: true,
  itemCode: true,
  skillId: true,
  difficulty: true,
  questionType: true,
  stem: true,
  stemImageUrl: true,
  options: true,
  estimatedTime: true,
  hint: true,
  skill: { select: { id: true, name: true, chapter: { select: { id: true, name: true } } } },
} satisfies Prisma.QuestionItemSelect;

/** Câu hỏi KHI CHẤM — có đáp án và lời giải, chỉ dùng trong lớp service. */
const gradingItemSelect = {
  id: true,
  itemCode: true,
  skillId: true,
  difficulty: true,
  questionType: true,
  correctAnswer: true,
  answerTolerance: true,
  solution: true,
  solutionSteps: true,
  hint: true,
  estimatedTime: true,
  skill: { select: { id: true, name: true, chapter: { select: { id: true, name: true } } } },
} satisfies Prisma.QuestionItemSelect;

const planItemInclude = {
  item: { select: gradingItemSelect },
  planDay: { include: dayInclude },
} satisfies Prisma.PlanDayItemInclude;

type PlanItemContext = Prisma.PlanDayItemGetPayload<{ include: typeof planItemInclude }>;

async function loadOwnedPlanItem(planDayItemId: string, userId: string): Promise<PlanItemContext> {
  const planItem = await prisma.planDayItem.findUnique({
    where: { id: planDayItemId },
    include: planItemInclude,
  });
  if (!planItem) throw ApiError.notFound('Không tìm thấy câu hỏi này trong buổi học.');
  assertOwner(planItem.planDay.plan.enrollment.student.userId, userId);
  return planItem;
}

// ---------------------------------------------------------------------------
// Bắt đầu buổi học
// ---------------------------------------------------------------------------

export async function startPlanDay(planDayId: string, userId: string): Promise<StartDayResult> {
  const day = await loadOwnedDay(planDayId, userId);
  assertEnrollmentUsable(day.plan.enrollment);

  if (day.status === 'RESCHEDULED') {
    throw ApiError.conflict(
      'Buổi học này đã được dời lịch nên không mở lại được. Hãy vào "Hôm nay học gì" để lấy buổi học mới nhất.',
    );
  }

  const counts = await countDayItems(day.id);
  const progress: DayProgressCounts = { done: counts.total - counts.pending, total: counts.total };

  if (day.status === 'COMPLETED') {
    return {
      planDayId: day.id,
      date: day.date,
      dateLabel: formatDayLabelVN(day.date),
      dayIndex: day.dayIndex,
      status: day.status,
      statusLabel: PLAN_DAY_STATUS_LABEL[day.status],
      startedAt: day.startedAt,
      estimatedMinutes: day.estimatedMinutes,
      progress,
      alreadyStarted: true,
      message: `Buổi học ngày ${formatDateVN(day.date)} em đã hoàn thành rồi. Em có thể xem lại tiến độ hoặc chuyển sang buổi kế tiếp.`,
    };
  }

  const alreadyStarted = day.status === 'IN_PROGRESS' && day.startedAt !== null;
  const startedAt = day.startedAt ?? new Date();

  const updated = await prisma.studyPlanDay.update({
    where: { id: day.id },
    data: { status: 'IN_PROGRESS', startedAt },
  });

  await track({
    eventName: EVENTS.STUDY_DAY_STARTED,
    userId,
    enrollmentId: day.plan.enrollment.id,
    properties: {
      plan_day_id: day.id,
      plan_id: day.plan.id,
      cycle_no: day.plan.cycleNo,
      day_index: day.dayIndex,
      item_count: counts.total,
      estimated_minutes: day.estimatedMinutes,
      resumed: alreadyStarted,
    },
  });

  const message =
    counts.total === 0
      ? 'Buổi học này chưa có câu hỏi nào. Hệ thống sẽ bổ sung khi kho câu của các kỹ năng ưu tiên có thêm bài.'
      : alreadyStarted
        ? `Tiếp tục buổi học: còn ${counts.pending}/${counts.total} câu, khoảng ${formatMinutes(day.estimatedMinutes)}.`
        : `Bắt đầu buổi học: ${counts.total} câu, khoảng ${formatMinutes(day.estimatedMinutes)}. Cứ làm từ tốn, hệ thống chấm ngay sau mỗi câu.`;

  return {
    planDayId: updated.id,
    date: updated.date,
    dateLabel: formatDayLabelVN(updated.date),
    dayIndex: updated.dayIndex,
    status: updated.status,
    statusLabel: PLAN_DAY_STATUS_LABEL[updated.status],
    startedAt: updated.startedAt,
    estimatedMinutes: updated.estimatedMinutes,
    progress,
    alreadyStarted,
    message,
  };
}

async function countDayItems(planDayId: string): Promise<{ total: number; pending: number }> {
  const [total, pending] = await Promise.all([
    prisma.planDayItem.count({ where: { planDayId } }),
    prisma.planDayItem.count({ where: { planDayId, status: PLAN_ITEM_STATUS.PENDING } }),
  ]);
  return { total, pending };
}

// ---------------------------------------------------------------------------
// Câu tiếp theo
// ---------------------------------------------------------------------------

export async function getNextItem(planDayId: string, userId: string): Promise<NextItemView | null> {
  const day = await loadOwnedDay(planDayId, userId);
  assertEnrollmentUsable(day.plan.enrollment);
  const config = await getConfig();

  const next = await prisma.planDayItem.findFirst({
    where: { planDayId: day.id, status: PLAN_ITEM_STATUS.PENDING },
    orderBy: { order: 'asc' },
    include: { item: { select: playItemSelect } },
  });
  if (!next) return null;

  const counts = await countDayItems(day.id);
  const attempts = await prisma.itemAttempt.findMany({
    where: { planDayItemId: next.id },
    select: { answeredAt: true, hintUsed: true, solutionViewed: true, solutionViewedBeforeAnswer: true },
    orderBy: { createdAt: 'asc' },
  });

  const answered = attempts.filter((attempt) => attempt.answeredAt !== null).length;
  const attemptNo = answered + 1;
  const maxAttempts = maxAttemptsPerItem(config);

  return {
    planDayItemId: next.id,
    itemId: next.item.id,
    itemCode: next.item.itemCode,
    order: next.order,
    block: next.block,
    blockLabel: BLOCK_LABEL[next.block],
    blockDescription: BLOCK_DESCRIPTION[next.block],
    skillId: next.item.skill.id,
    skillName: next.item.skill.name,
    chapterName: next.item.skill.chapter.name,
    questionType: next.item.questionType,
    stem: next.item.stem,
    stemImageUrl: next.item.stemImageUrl,
    options: parseOptions(next.item.options),
    difficulty: next.item.difficulty,
    difficultyLabel: DIFFICULTY_LABEL[next.item.difficulty],
    estimatedTimeSeconds: next.item.estimatedTime,
    attemptNo,
    isRetry: answered > 0,
    retriesLeft: Math.max(0, maxAttempts - attemptNo),
    hintAvailable: hasText(next.item.hint),
    hintUsed: attempts.some((attempt) => attempt.hintUsed),
    solutionViewed: attempts.some(
      (attempt) => attempt.solutionViewed || attempt.solutionViewedBeforeAnswer,
    ),
    progress: { done: counts.total - counts.pending, total: counts.total },
  };
}

function hasText(value: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Trả lời một câu
// ---------------------------------------------------------------------------

export async function answerItem(input: AnswerItemInput): Promise<AnswerFeedback> {
  const config = await getConfig();
  const planItem = await loadOwnedPlanItem(input.planDayItemId, input.userId);
  const day = planItem.planDay;
  const enrollment = day.plan.enrollment;
  assertEnrollmentUsable(enrollment);

  if (day.status === 'RESCHEDULED') {
    throw ApiError.conflict('Buổi học này đã được dời lịch. Hãy mở buổi học mới nhất để làm bài.');
  }
  if (planItem.status === PLAN_ITEM_STATUS.SKIPPED) {
    throw ApiError.conflict('Câu này đã được bỏ qua trong buổi học. Hãy chuyển sang câu tiếp theo.');
  }
  if (planItem.status !== PLAN_ITEM_STATUS.PENDING) {
    throw ApiError.conflict('Câu này em đã làm xong rồi. Hãy chuyển sang câu tiếp theo.');
  }

  const item = planItem.item;
  const answeredAt = new Date();
  const timeMs = safeMs(input.timeMs);

  // -- Lượt làm thứ mấy & cờ trợ giúp đã ghi nhận ở máy chủ ------------------
  const attempts = await prisma.itemAttempt.findMany({
    where: { planDayItemId: planItem.id },
    orderBy: { createdAt: 'asc' },
  });
  const answeredCount = attempts.filter((attempt) => attempt.answeredAt !== null).length;
  const attemptNo = answeredCount + 1;
  const open = attempts.find((attempt) => attempt.answeredAt === null) ?? null;

  // Cờ của client chỉ được CỘNG THÊM vào cờ máy chủ, không ghi đè: học sinh đã
  // bấm xem gợi ý/lời giải thì không thể "quên" khai báo để lấy trọn điểm. Trợ
  // giúp của các lượt trước cũng tính cho lượt làm lại — đã thấy cách làm rồi.
  const hintUsed = input.hintUsed || attempts.some((attempt) => attempt.hintUsed);
  const solutionViewedBeforeAnswer =
    input.solutionViewedBeforeAnswer ||
    attempts.some((attempt) => attempt.solutionViewed || attempt.solutionViewedBeforeAnswer);

  // -- Chấm -----------------------------------------------------------------
  const grade = gradeAnswer(
    {
      questionType: item.questionType,
      correctAnswer: item.correctAnswer,
      answerTolerance: item.answerTolerance,
    },
    input.answer,
  );
  const isCorrect = grade.isCorrect;

  // -- Cập nhật hồ sơ năng lực NGAY (specs §7.2) -----------------------------
  const before = await prisma.studentSkillMastery.findUnique({
    where: { enrollmentId_skillId: { enrollmentId: enrollment.id, skillId: item.skillId } },
    select: { masteryScore: true },
  });
  const masteryBefore = before?.masteryScore ?? 0;

  const event: AttemptEvent = {
    isCorrect,
    timeMs,
    estimatedTimeSeconds: item.estimatedTime,
    difficulty: item.difficulty,
    hintUsed,
    solutionViewedBeforeAnswer,
    answeredAt,
  };
  const update = await applyAttempt({
    enrollmentId: enrollment.id,
    skillId: item.skillId,
    event,
  });
  const masteryAfter = update.next.masteryScore;

  // Chỉ câu SAI mới gắn error pattern: "đúng nhưng chậm" không phải lỗi lặp lại.
  const errorPattern: ErrorPattern | null = isCorrect ? null : update.errorPattern;

  // -- Phân loại phản hồi (6 trường hợp của specs §9.2) ----------------------
  const { fast, slow } = timeThresholds(config);
  const timeRatio =
    item.estimatedTime > 0 ? round(timeMs / 1000 / item.estimatedTime, 2) : 1;
  const isSlow = timeRatio >= slow;
  const isFast = timeRatio <= fast;

  const maxAttempts = maxAttemptsPerItem(config);
  // Đã xem lời giải thì làm lại không còn ý nghĩa đo năng lực.
  const canRetry = !isCorrect && !solutionViewedBeforeAnswer && attemptNo < maxAttempts;
  const finished = isCorrect || !canRetry;

  const outcome: AnswerOutcome = solutionViewedBeforeAnswer
    ? 'SOLUTION_VIEWED_BEFORE_ANSWER'
    : isCorrect
      ? hintUsed
        ? 'CORRECT_ASSISTED'
        : isSlow
          ? 'CORRECT_SLOW'
          : 'CORRECT_FAST'
      : canRetry
        ? 'WRONG_FIRST'
        : 'WRONG_REPEATED';

  // Lời giải chỉ mở khi câu đã kết thúc — còn lượt làm lại thì tuyệt đối không lộ.
  const shouldShowSolution = finished && (!isCorrect || outcome === 'CORRECT_SLOW');

  const prerequisites =
    outcome === 'WRONG_REPEATED'
      ? await findPrerequisiteGaps(enrollment.id, item.skillId, config)
      : [];

  const difficultyDecision = decideDifficulty(update.next, config.recommendation);
  const difficulty: DifficultyOutlook = {
    next: difficultyDecision.difficulty,
    nextLabel: DIFFICULTY_LABEL[difficultyDecision.difficulty],
    direction: difficultyDecision.direction,
    message: difficultyDecision.reason,
  };

  // -- Ghi lượt làm ----------------------------------------------------------
  const attemptData = {
    answer: toJsonAnswer(grade.normalizedAnswer),
    isCorrect,
    timeMs,
    attemptNo,
    hintUsed,
    solutionViewedBeforeAnswer,
    solutionViewed: solutionViewedBeforeAnswer || (open?.solutionViewed ?? false),
    errorPattern,
    masteryBefore: round(masteryBefore, 2),
    masteryAfter: round(masteryAfter, 2),
    answeredAt,
  };

  const attempt = open
    ? await prisma.itemAttempt.update({ where: { id: open.id }, data: attemptData })
    : await prisma.itemAttempt.create({
        data: {
          enrollmentId: enrollment.id,
          itemId: item.id,
          context: 'PRACTICE',
          planDayItemId: planItem.id,
          orderIndex: planItem.order,
          ...attemptData,
        },
      });

  await prisma.planDayItem.update({
    where: { id: planItem.id },
    data: {
      status: finished ? PLAN_ITEM_STATUS.DONE : PLAN_ITEM_STATUS.PENDING,
      itemAttemptId: attempt.id,
    },
  });

  // Thống kê chất lượng câu hỏi cộng dồn theo từng lượt (module content dùng
  // recomputeItemStats để tính lại toàn bộ kèm discrimination cho admin).
  await prisma.questionItem.update({
    where: { id: item.id },
    data: {
      timesServed: { increment: 1 },
      timesCorrect: { increment: isCorrect ? 1 : 0 },
      totalTimeMs: { increment: BigInt(timeMs) },
    },
  });

  // Học sinh làm bù ngày đã lỡ vẫn được mở lại buổi học (specs §10.2).
  if (day.status === 'PLANNED' || day.status === 'MISSED') {
    await prisma.studyPlanDay.update({
      where: { id: day.id },
      data: { status: 'IN_PROGRESS', startedAt: day.startedAt ?? answeredAt },
    });
  }

  await track({
    eventName: EVENTS.ITEM_ANSWERED,
    userId: input.userId,
    enrollmentId: enrollment.id,
    properties: {
      context: 'PRACTICE',
      plan_day_id: day.id,
      plan_day_item_id: planItem.id,
      item_id: item.id,
      skill_id: item.skillId,
      block: planItem.block,
      difficulty: item.difficulty,
      is_correct: isCorrect,
      outcome,
      attempt_no: attemptNo,
      time_ms: timeMs,
      time_ratio: timeRatio,
      hint_used: hintUsed,
      solution_viewed_before_answer: solutionViewedBeforeAnswer,
      error_pattern: errorPattern,
      mastery_delta: round(update.delta, 2),
    },
  });

  // -- Đóng buổi học khi không còn câu nào chờ ------------------------------
  const counts = await countDayItems(day.id);
  const progress: DayProgressCounts = { done: counts.total - counts.pending, total: counts.total };
  let dayCompleted = false;
  let dayMessage: string | null = null;

  if (counts.pending === 0 && day.status !== 'COMPLETED') {
    const actualMinutes = await computeActualMinutes(day.id);
    await prisma.studyPlanDay.update({
      where: { id: day.id },
      data: { status: 'COMPLETED', completedAt: answeredAt, actualMinutes },
    });
    dayCompleted = true;

    const summary = await summarizeDayResults(day.id);
    await track({
      eventName: EVENTS.STUDY_DAY_COMPLETED,
      userId: input.userId,
      enrollmentId: enrollment.id,
      properties: {
        plan_day_id: day.id,
        plan_id: day.plan.id,
        cycle_no: day.plan.cycleNo,
        day_index: day.dayIndex,
        item_count: counts.total,
        correct_count: summary.correct,
        accuracy: ratio(summary.correct, summary.answered),
        actual_minutes: actualMinutes,
        estimated_minutes: day.estimatedMinutes,
      },
    });

    dayMessage = `Xong buổi học ngày ${formatDateVN(day.date)}: ${summary.correct}/${summary.answered} câu đúng trong ${formatMinutes(actualMinutes)}. Tiến độ chu kỳ của em vừa nhích lên một buổi.`;
  }

  const message = buildFeedbackMessage({
    outcome,
    skillName: item.skill.name,
    masteryBefore,
    masteryAfter,
    delta: update.delta,
    timeMs,
    estimatedTimeSeconds: item.estimatedTime,
    timeRatio,
    isFast,
    retriesLeft: Math.max(0, maxAttempts - attemptNo),
    hintAvailable: hasText(item.hint),
    errorPattern,
    prerequisites,
    difficulty,
    gradeMessage: grade.message ?? null,
  });

  const nextStepHint = buildNextStepHint({
    outcome,
    skillName: item.skill.name,
    estimatedTimeSeconds: item.estimatedTime,
    timeRatio,
    prerequisites,
    difficulty,
  });

  const tier = tierOf(masteryAfter);

  return {
    planDayItemId: planItem.id,
    itemAttemptId: attempt.id,
    itemId: item.id,
    skillId: item.skillId,
    skillName: item.skill.name,
    chapterName: item.skill.chapter.name,
    block: planItem.block,
    blockLabel: BLOCK_LABEL[planItem.block],

    isCorrect,
    outcome,
    outcomeLabel: ANSWER_OUTCOME_LABEL[outcome],
    message,

    attemptNo,
    canRetry,
    retriesLeft: Math.max(0, maxAttempts - attemptNo),
    shouldShowSolution,

    masteryBefore: round(masteryBefore),
    masteryAfter: round(masteryAfter),
    delta: round(update.delta),
    tier: tier.tier,
    tierLabel: tier.tierLabel,
    countsAsMastered: isCorrect && !solutionViewedBeforeAnswer,

    timeMs,
    estimatedTimeSeconds: item.estimatedTime,
    timeRatio,
    isSlow,

    hintAvailable: hasText(item.hint),
    hintUsed,
    solutionViewedBeforeAnswer,
    solution: finished ? item.solution : null,
    solutionSteps: finished ? parseSteps(item.solutionSteps) : [],
    correctAnswer: finished ? item.correctAnswer : null,

    errorPattern,
    errorPatternLabel: errorPattern ? ERROR_PATTERN_LABEL[errorPattern] : null,
    nextStepHint,
    prerequisites,
    difficulty,

    progress,
    dayCompleted,
    dayMessage,
  };
}

/** Kỹ năng nền chưa vững của skill hiện tại — nguồn cho gợi ý "học phần nền trước". */
async function findPrerequisiteGaps(
  enrollmentId: string,
  skillId: string,
  config: PlatformConfig,
): Promise<PrerequisiteHint[]> {
  const links = await prisma.skillPrerequisite.findMany({
    where: { skillId },
    select: { prerequisite: { select: { id: true, name: true } } },
  });
  if (links.length === 0) return [];

  const ids = links.map((link) => link.prerequisite.id);
  const rows = await prisma.studentSkillMastery.findMany({
    where: { enrollmentId, skillId: { in: ids } },
    select: { skillId: true, masteryScore: true },
  });
  const scoreBySkill = new Map(rows.map((row) => [row.skillId, row.masteryScore]));

  return links
    .map((link) => {
      const score = scoreBySkill.get(link.prerequisite.id) ?? 0;
      const tier = tierOf(score);
      return {
        skillId: link.prerequisite.id,
        skillName: link.prerequisite.name,
        masteryScore: round(score),
        tier: tier.tier,
        tierLabel: tier.tierLabel,
      };
    })
    .filter((entry) => entry.masteryScore < config.recommendation.masteredThreshold)
    .sort((a, b) => a.masteryScore - b.masteryScore);
}

async function computeActualMinutes(planDayId: string): Promise<number> {
  const items = await prisma.planDayItem.findMany({
    where: { planDayId },
    select: { id: true },
  });
  if (items.length === 0) return 0;

  const total = await prisma.itemAttempt.aggregate({
    where: { planDayItemId: { in: items.map((item) => item.id) }, answeredAt: { not: null } },
    _sum: { timeMs: true },
  });
  const ms = total._sum.timeMs ?? 0;
  // Làm cực nhanh vẫn phải ghi nhận 1 phút, nếu không lịch sử học tập là 0 phút.
  return ms > 0 ? Math.max(1, Math.round(ms / 60_000)) : 0;
}

async function summarizeDayResults(planDayId: string): Promise<{ answered: number; correct: number }> {
  const items = await prisma.planDayItem.findMany({
    where: { planDayId },
    select: { itemAttemptId: true },
  });
  const attemptIds = items
    .map((item) => item.itemAttemptId)
    .filter((id): id is string => id !== null);
  if (attemptIds.length === 0) return { answered: 0, correct: 0 };

  const attempts = await prisma.itemAttempt.findMany({
    where: { id: { in: attemptIds } },
    select: { isCorrect: true },
  });
  return {
    answered: attempts.length,
    correct: attempts.filter((attempt) => attempt.isCorrect === true).length,
  };
}

// ---------------------------------------------------------------------------
// Thông điệp phản hồi
// ---------------------------------------------------------------------------

interface FeedbackContext {
  outcome: AnswerOutcome;
  skillName: string;
  masteryBefore: number;
  masteryAfter: number;
  delta: number;
  timeMs: number;
  estimatedTimeSeconds: number;
  timeRatio: number;
  isFast: boolean;
  retriesLeft: number;
  hintAvailable: boolean;
  errorPattern: ErrorPattern | null;
  prerequisites: PrerequisiteHint[];
  difficulty: DifficultyOutlook;
  gradeMessage: string | null;
}

function masteryPhrase(before: number, after: number): string {
  const delta = after - before;
  const shown = Math.abs(round(delta));
  if (shown < 0.1) return `Mức thành thạo giữ nguyên ở ${formatScore(after)}/100.`;
  return delta > 0
    ? `Mức thành thạo tăng ${formatRatio(shown)} điểm, lên ${formatScore(after)}/100.`
    : `Mức thành thạo giảm ${formatRatio(shown)} điểm, còn ${formatScore(after)}/100.`;
}

function buildFeedbackMessage(ctx: FeedbackContext): string {
  const seconds = Math.round(ctx.timeMs / 1000);
  const mastery = masteryPhrase(ctx.masteryBefore, ctx.masteryAfter);

  switch (ctx.outcome) {
    case 'CORRECT_FAST': {
      const opening = ctx.isFast
        ? `Chính xác, lại còn nhanh! Em làm hết ${seconds} giây trong khi mức chuẩn là ${ctx.estimatedTimeSeconds} giây.`
        : 'Chính xác! Em làm đúng trong thời gian chuẩn.';
      const harder =
        ctx.difficulty.direction === 'UP'
          ? ` Hệ thống sẽ nâng câu của kỹ năng "${ctx.skillName}" lên mức ${ctx.difficulty.nextLabel}.`
          : '';
      return `${opening} ${mastery}${harder}`;
    }

    case 'CORRECT_SLOW':
      return `Đáp án đúng rồi! Nhưng em mất ${seconds} giây, gấp khoảng ${formatRatio(ctx.timeRatio)} lần mức chuẩn ${ctx.estimatedTimeSeconds} giây, nên ${mastery.charAt(0).toLowerCase()}${mastery.slice(1)} Hãy xem lời giải mẫu để nắm cách làm ngắn hơn — vào phòng thi, làm đúng mà chậm vẫn mất điểm.`;

    case 'CORRECT_ASSISTED':
      return `Đúng rồi. Vì em có dùng gợi ý nên hệ thống chỉ ghi nhận một phần công sức: ${mastery.charAt(0).toLowerCase()}${mastery.slice(1)} Lần tới thử tự làm trước, chưa ra hướng mới mở gợi ý nhé.`;

    case 'SOLUTION_VIEWED_BEFORE_ANSWER':
      return `Hệ thống ghi nhận em đã xem lời giải trước khi trả lời, nên câu này KHÔNG được tính là em đã thành thạo kỹ năng "${ctx.skillName}". ${mastery} Xem lời giải để hiểu cách làm là tốt — hệ thống sẽ giao thêm câu tương tự để em tự làm lại.`;

    case 'WRONG_FIRST': {
      const detail = ctx.gradeMessage ? ` ${ctx.gradeMessage}` : '';
      const helper = ctx.hintAvailable
        ? 'em có thể mở gợi ý nếu thấy bí.'
        : 'em đọc lại đề và kiểm tra từng bước tính toán nhé.';
      return `Chưa đúng.${detail} Em còn ${ctx.retriesLeft} lượt làm lại câu này — ${helper} ${mastery}`;
    }

    case 'WRONG_REPEATED': {
      const errorPart = ctx.errorPattern
        ? ` Hệ thống ghi nhận lỗi: ${ERROR_PATTERN_LABEL[ctx.errorPattern].toLowerCase()}.`
        : '';
      const prerequisite = ctx.prerequisites[0];
      const prerequisitePart = prerequisite
        ? ` Gốc của vấn đề nằm ở kỹ năng nền "${prerequisite.skillName}" (mới ${formatScore(prerequisite.masteryScore)}/100) — buổi tới hệ thống sẽ cho em luyện phần nền này trước.`
        : ` ${ctx.difficulty.message}`;
      return `Câu này em chưa gỡ được sau ${ctx.retriesLeft === 0 ? 'các lượt thử' : 'lần thử vừa rồi'}.${errorPart} Em hãy đọc kỹ lời giải từng bước bên dưới, tự làm lại một lượt trên giấy rồi mới sang câu sau. ${mastery}${prerequisitePart}`;
    }

    default:
      return mastery;
  }
}

interface NextStepContext {
  outcome: AnswerOutcome;
  skillName: string;
  estimatedTimeSeconds: number;
  timeRatio: number;
  prerequisites: PrerequisiteHint[];
  difficulty: DifficultyOutlook;
}

function buildNextStepHint(ctx: NextStepContext): string | null {
  switch (ctx.outcome) {
    case 'CORRECT_FAST':
      return ctx.difficulty.direction === 'UP' ? ctx.difficulty.message : null;

    case 'CORRECT_SLOW':
      return `Lần sau đặt mục tiêu dưới ${ctx.estimatedTimeSeconds} giây: đọc đề một lượt, gạch chân dữ kiện, chọn ngay hướng làm quen thuộc thay vì thử nhiều cách. Hiện em đang mất gấp ${formatRatio(ctx.timeRatio)} lần mức chuẩn.`;

    case 'CORRECT_ASSISTED':
      return `Hãy làm lại một câu cùng kỹ năng "${ctx.skillName}" mà không mở gợi ý — chỉ khi đó hệ thống mới ghi nhận em đã tự làm được.`;

    case 'SOLUTION_VIEWED_BEFORE_ANSWER':
      return `Che lời giải đi và tự trình bày lại các bước của kỹ năng "${ctx.skillName}"; buổi học tới sẽ có câu tương tự để em tự kiểm chứng.`;

    case 'WRONG_FIRST':
      return 'Kiểm tra lại xem em đã dùng đúng dữ kiện của đề chưa, rồi thử lại một lần nữa.';

    case 'WRONG_REPEATED': {
      const prerequisite = ctx.prerequisites[0];
      if (prerequisite) {
        return `Ưu tiên ôn kỹ năng nền "${prerequisite.skillName}" (${formatScore(prerequisite.masteryScore)}/100, mức ${prerequisite.tierLabel}) trước khi quay lại "${ctx.skillName}".`;
      }
      return ctx.difficulty.message;
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Gợi ý & lời giải
// ---------------------------------------------------------------------------

/**
 * Tìm lượt làm để ghi nhận trợ giúp:
 *  - đang có lượt chưa trả lời  → ghi vào chính lượt đó (trợ giúp TRƯỚC khi trả lời);
 *  - câu còn lượt làm lại       → mở lượt mới để lần trả lời sau biết đã có trợ giúp;
 *  - câu đã kết thúc            → ghi vào lượt gần nhất (xem lại sau khi làm xong).
 */
async function recordAssist(
  planItem: PlanItemContext,
  data: { hintUsed?: boolean; solutionViewed?: boolean },
): Promise<{ attemptId: string; beforeAnswer: boolean }> {
  const attempts = await prisma.itemAttempt.findMany({
    where: { planDayItemId: planItem.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, answeredAt: true, attemptNo: true },
  });
  const open = attempts.find((attempt) => attempt.answeredAt === null) ?? null;
  const beforeAnswer = planItem.status === PLAN_ITEM_STATUS.PENDING;

  if (open) {
    await prisma.itemAttempt.update({
      where: { id: open.id },
      data: {
        ...(data.hintUsed ? { hintUsed: true } : {}),
        ...(data.solutionViewed ? { solutionViewed: true, solutionViewedBeforeAnswer: true } : {}),
      },
    });
    return { attemptId: open.id, beforeAnswer: true };
  }

  if (beforeAnswer) {
    const created = await prisma.itemAttempt.create({
      data: {
        enrollmentId: planItem.planDay.plan.enrollment.id,
        itemId: planItem.itemId,
        context: 'PRACTICE',
        planDayItemId: planItem.id,
        orderIndex: planItem.order,
        attemptNo: attempts.filter((attempt) => attempt.answeredAt !== null).length + 1,
        hintUsed: data.hintUsed ?? false,
        solutionViewed: data.solutionViewed ?? false,
        solutionViewedBeforeAnswer: data.solutionViewed ?? false,
      },
    });
    return { attemptId: created.id, beforeAnswer: true };
  }

  const last = attempts[attempts.length - 1];
  if (!last) {
    throw ApiError.conflict('Chưa có dữ liệu làm bài cho câu này.');
  }
  await prisma.itemAttempt.update({
    where: { id: last.id },
    data: {
      ...(data.hintUsed ? { hintUsed: true } : {}),
      ...(data.solutionViewed ? { solutionViewed: true } : {}),
    },
  });
  return { attemptId: last.id, beforeAnswer: false };
}

export async function revealHint(planDayItemId: string, userId: string): Promise<HintReveal> {
  const planItem = await loadOwnedPlanItem(planDayItemId, userId);
  assertEnrollmentUsable(planItem.planDay.plan.enrollment);

  const hintAvailable = hasText(planItem.item.hint);
  // Câu không có gợi ý thì KHÔNG ghi nhận "đã dùng trợ giúp" — học sinh không
  // được nhận thứ gì nên không có lý do trừ bớt mức tăng thành thạo.
  if (hintAvailable) await recordAssist(planItem, { hintUsed: true });

  return {
    planDayItemId: planItem.id,
    itemId: planItem.itemId,
    hintAvailable,
    hint: hintAvailable ? (planItem.item.hint as string).trim() : null,
    message: hintAvailable
      ? 'Đây là gợi ý. Em vẫn tự làm nốt các bước còn lại nhé — câu dùng gợi ý chỉ được tính một phần mức thành thạo.'
      : 'Câu này chưa có gợi ý riêng. Em thử tóm tắt lại dữ kiện của đề và xác định đại lượng cần tìm trước khi tính.',
  };
}

export async function revealSolution(planDayItemId: string, userId: string): Promise<SolutionReveal> {
  const planItem = await loadOwnedPlanItem(planDayItemId, userId);
  const enrollment = planItem.planDay.plan.enrollment;
  assertEnrollmentUsable(enrollment);

  const steps = parseSteps(planItem.item.solutionSteps);
  // Câu chưa có lời giải chuẩn thì không ghi nhận gì cả: học sinh không xem được
  // gì mà vẫn bị coi là "đã xem lời giải" là oan.
  if (!hasText(planItem.item.solution) && steps.length === 0) {
    throw ApiError.conflict(
      'Câu này chưa có lời giải chuẩn. Em hãy bấm "Báo lỗi câu hỏi" để bộ phận chuyên môn bổ sung.',
    );
  }

  const assist = await recordAssist(planItem, { solutionViewed: true });

  await track({
    eventName: EVENTS.SOLUTION_VIEWED,
    userId,
    enrollmentId: enrollment.id,
    properties: {
      plan_day_id: planItem.planDayId,
      plan_day_item_id: planItem.id,
      item_id: planItem.itemId,
      skill_id: planItem.item.skillId,
      item_attempt_id: assist.attemptId,
      before_answer: assist.beforeAnswer,
    },
  });

  return {
    planDayItemId: planItem.id,
    itemId: planItem.itemId,
    solution: planItem.item.solution,
    solutionSteps: steps,
    viewedBeforeAnswer: assist.beforeAnswer,
    countsAsMastered: !assist.beforeAnswer,
    message: assist.beforeAnswer
      ? 'Em xem lời giải trước khi trả lời nên câu này không được tính là đã thành thạo. Hãy đọc kỹ từng bước rồi tự làm lại — hệ thống sẽ giao câu tương tự để em kiểm chứng.'
      : 'Đọc kỹ từng bước và đối chiếu với cách làm của em: chỗ lệch nhau chính là chỗ cần sửa.',
  };
}

// ---------------------------------------------------------------------------
// Báo lỗi câu hỏi (specs §9.2 — tạo ticket gắn item_id)
// ---------------------------------------------------------------------------

export async function reportItem(input: ReportItemInput): Promise<ReportItemResult> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw ApiError.badRequest('Hãy mô tả ngắn gọn lỗi em gặp phải (ít nhất 3 ký tự).');
  }

  const item = await prisma.questionItem.findUnique({
    where: { id: input.itemId },
    select: { id: true, itemCode: true },
  });
  if (!item) throw ApiError.notFound('Không tìm thấy câu hỏi cần báo lỗi.');

  // Chỉ báo lỗi được câu hệ thống ĐÃ GIAO cho chính học sinh này — chặn việc dò
  // id ngẫu nhiên để spam hàng loạt ticket.
  const served = await prisma.planDayItem.findFirst({
    where: {
      itemId: item.id,
      planDay: { plan: { enrollment: { student: { userId: input.userId } } } },
    },
    select: { id: true },
  });
  const attempted = served
    ? null
    : await prisma.itemAttempt.findFirst({
        where: { itemId: item.id, enrollment: { student: { userId: input.userId } } },
        select: { id: true },
      });
  if (!served && !attempted) {
    throw ApiError.forbidden('Em chỉ báo lỗi được những câu hỏi hệ thống đã giao cho em.');
  }

  const detail = input.detail?.trim();
  await flagItem({
    itemId: item.id,
    reporterId: input.userId,
    reporterRole: 'STUDENT',
    reason,
    detail: detail && detail.length > 0 ? detail : null,
  });

  return {
    itemId: item.id,
    itemCode: item.itemCode,
    message: `Cảm ơn em đã báo lỗi câu ${item.itemCode}. Bộ phận chuyên môn sẽ kiểm tra; nếu câu hỏi có vấn đề, kết quả của câu này sẽ không ảnh hưởng tới đánh giá của em.`,
  };
}

// ---------------------------------------------------------------------------
// Vì sao hệ thống giao câu này (specs §7.8, §17)
// ---------------------------------------------------------------------------

export async function getWhyThisItem(planDayItemId: string, userId: string): Promise<WhyThisItem> {
  const planItem = await loadOwnedPlanItem(planDayItemId, userId);
  const enrollment = planItem.planDay.plan.enrollment;

  // Ưu tiên bản ghi của ĐÚNG buổi học này; không có thì lấy lý do gần nhất của
  // chính câu đó (vd câu từng xuất hiện trong đề kiểm tra).
  const recommendation =
    (await prisma.recommendation.findFirst({
      where: { planDayId: planItem.planDayId, itemId: planItem.itemId },
      orderBy: { createdAt: 'desc' },
    })) ??
    (await prisma.recommendation.findFirst({
      where: { enrollmentId: enrollment.id, itemId: planItem.itemId },
      orderBy: { createdAt: 'desc' },
    }));

  const mastery = await prisma.studentSkillMastery.findUnique({
    where: { enrollmentId_skillId: { enrollmentId: enrollment.id, skillId: planItem.item.skillId } },
    select: { masteryScore: true },
  });
  const masteryScore = round(mastery?.masteryScore ?? 0);
  const tier = tierOf(masteryScore);

  const reasonCode = recommendation?.reasonCode ?? 'NO_RECOMMENDATION_RECORD';
  const reasonData = asRecord(recommendation?.reasonData ?? {});
  const details = await buildReasonDetails(reasonData, planItem.block);

  return {
    planDayItemId: planItem.id,
    itemId: planItem.itemId,
    itemCode: planItem.item.itemCode,
    block: planItem.block,
    blockLabel: BLOCK_LABEL[planItem.block],
    blockDescription: BLOCK_DESCRIPTION[planItem.block],
    skillId: planItem.item.skillId,
    skillName: planItem.item.skill.name,
    chapterName: planItem.item.skill.chapter.name,
    difficulty: planItem.item.difficulty,
    difficultyLabel: DIFFICULTY_LABEL[planItem.item.difficulty],
    reasonCode,
    reason: REASON_FOR_STUDENT[reasonCode] ?? DEFAULT_REASON_FOR_STUDENT,
    details,
    masteryScore,
    tier: tier.tier,
    tierLabel: tier.tierLabel,
    targetMastery:
      typeof reasonData.targetMastery === 'number' ? round(reasonData.targetMastery) : null,
    gapPriority: recommendation?.gapPriority ?? null,
    decidedAt: recommendation?.createdAt ?? null,
  };
}

/** Biến `reasonData` của engine thành vài câu ngắn học sinh đọc được. */
async function buildReasonDetails(
  reasonData: Record<string, unknown>,
  block: BlockType,
): Promise<string[]> {
  const details: string[] = [`Câu này nằm trong phần "${BLOCK_LABEL[block]}" — ${BLOCK_DESCRIPTION[block].toLowerCase()}.`];

  if (typeof reasonData.masteryScore === 'number' && typeof reasonData.targetMastery === 'number') {
    details.push(
      `Khi lên lịch, mức thành thạo của em ở kỹ năng này là ${round(reasonData.masteryScore)}/100, còn mục tiêu chu kỳ là ${round(reasonData.targetMastery)}/100.`,
    );
  }
  if (typeof reasonData.daysSinceLastPractice === 'number') {
    details.push(`Em đã ${Math.round(reasonData.daysSinceLastPractice)} ngày không luyện kỹ năng này.`);
  }
  if (typeof reasonData.unlockThreshold === 'number' && typeof reasonData.masteryAtUnlock === 'number') {
    details.push(
      `Em đạt ${round(reasonData.masteryAtUnlock)}/100, vượt ngưỡng ${round(reasonData.unlockThreshold)}/100 nên block Thử thách được mở.`,
    );
  }
  if (typeof reasonData.chapterName === 'string' && reasonData.chapterName.trim() !== '') {
    details.push(`Thuộc chương trọng tâm "${reasonData.chapterName}".`);
  }
  if (typeof reasonData.blockedSkillId === 'string') {
    const blocked = await prisma.skill.findUnique({
      where: { id: reasonData.blockedSkillId },
      select: { name: true },
    });
    if (blocked) {
      details.push(`Học chắc phần này để gỡ nút thắt ở kỹ năng "${blocked.name}".`);
    }
  }
  if (reasonData.cooldownViolated === true) {
    details.push('Kho câu của kỹ năng này còn ít nên em có thể gặp lại một câu đã từng làm.');
  }

  return details;
}

// ---------------------------------------------------------------------------
// Tiến độ buổi học
// ---------------------------------------------------------------------------

export async function getDayProgress(planDayId: string, userId: string): Promise<DayProgress> {
  const day = await loadOwnedDay(planDayId, userId);

  const items = await prisma.planDayItem.findMany({
    where: { planDayId: day.id },
    orderBy: { order: 'asc' },
    select: { id: true, block: true, status: true },
  });

  const attempts =
    items.length > 0
      ? await prisma.itemAttempt.findMany({
          where: { planDayItemId: { in: items.map((item) => item.id) }, answeredAt: { not: null } },
          orderBy: { createdAt: 'asc' },
          select: { planDayItemId: true, isCorrect: true, timeMs: true },
        })
      : [];

  // Một câu có thể làm lại vài lượt → lấy KẾT QUẢ CUỐI CÙNG làm kết quả của câu,
  // nhưng thời gian thì cộng dồn toàn bộ các lượt.
  const lastResult = new Map<string, boolean>();
  let totalMs = 0;
  for (const attempt of attempts) {
    totalMs += Math.max(0, attempt.timeMs);
    if (attempt.planDayItemId) lastResult.set(attempt.planDayItemId, attempt.isCorrect === true);
  }

  const total = items.length;
  const done = items.filter((item) => item.status !== PLAN_ITEM_STATUS.PENDING).length;
  const answered = lastResult.size;
  const correct = [...lastResult.values()].filter(Boolean).length;
  const wrong = answered - correct;
  const minutesStudied = Math.max(
    day.actualMinutes,
    totalMs > 0 ? Math.max(1, Math.round(totalMs / 60_000)) : 0,
  );

  const blocks: BlockProgress[] = BLOCK_ORDER.filter((block) =>
    items.some((item) => item.block === block),
  ).map((block) => {
    const blockItems = items.filter((item) => item.block === block);
    const blockDone = blockItems.filter((item) => item.status !== PLAN_ITEM_STATUS.PENDING).length;
    const blockAnswered = blockItems.filter((item) => lastResult.has(item.id));
    const blockCorrect = blockAnswered.filter((item) => lastResult.get(item.id) === true).length;
    return {
      block,
      label: BLOCK_LABEL[block],
      description: BLOCK_DESCRIPTION[block],
      total: blockItems.length,
      done: blockDone,
      correct: blockCorrect,
      accuracy: ratio(blockCorrect, blockAnswered.length),
      percent: Math.round(ratio(blockDone, blockItems.length) * 100),
    };
  });

  const remaining = total - done;
  const accuracy = ratio(correct, answered);
  const message =
    total === 0
      ? 'Buổi học này chưa có câu hỏi nào.'
      : remaining === 0
        ? `Em đã hoàn thành cả ${total} câu, đúng ${correct} câu (${Math.round(accuracy * 100)}%), học trong ${formatMinutes(minutesStudied)}.`
        : `Em đã làm ${done}/${total} câu, đúng ${correct}${answered > 0 ? `/${answered}` : ''} câu, còn ${remaining} câu nữa là xong buổi hôm nay.`;

  return {
    planDayId: day.id,
    date: day.date,
    dateLabel: formatDayLabelVN(day.date),
    dayIndex: day.dayIndex,
    status: day.status,
    statusLabel: PLAN_DAY_STATUS_LABEL[day.status],
    done,
    total,
    remaining,
    percent: Math.round(ratio(done, total) * 100),
    correct,
    wrong,
    accuracy,
    minutesStudied,
    estimatedMinutes: day.estimatedMinutes,
    startedAt: day.startedAt,
    completedAt: day.completedAt,
    blocks,
    message,
  };
}
