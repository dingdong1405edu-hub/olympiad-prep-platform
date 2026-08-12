/**
 * MODULE ASSESSMENT — vòng lặp đánh giá của nền tảng (specs §7.9, §7.10, §10.3).
 *
 *   Chọn đề (blueprint + engine) → làm bài (autosave/resume) → chấm có trọng số
 *   → cập nhật hồ sơ năng lực → chụp mốc → báo cáo kèm delta → buổi tư vấn.
 *
 * Ba luật cứng:
 *  1. Chỉ câu `PUBLISHED` được đưa vào đề — enforce ở tầng truy vấn kho câu.
 *  2. Mỗi câu được chọn đều ghi `Recommendation` kèm `reasonCode` (§7.8, §17).
 *  3. Khi bài đang làm dở, TUYỆT ĐỐI không trả `correctAnswer`/`solution` về
 *     client: truy vấn phục vụ làm bài dùng select riêng, không chứa hai cột đó.
 */
import { Prisma } from '@prisma/client';
import type {
  AssessmentType,
  AttemptContext,
  Difficulty,
  ErrorPattern,
  GradeBand,
  MasteryTrigger,
  QuestionType,
  StudentLevel,
  Subject,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';
import { getConfig, type PlatformConfig } from '@/lib/config';
import { EVENTS, track } from '@/lib/analytics';
import {
  ASSESSMENT_TYPE_LABEL,
  DIFFICULTY_LABEL,
  ERROR_PATTERN_LABEL,
  LEVEL_LABEL,
  LEVEL_ORDER,
  MASTERY_TIER_LABEL,
  STUDENT_LEVELS,
  masteryTier,
  type MasteryTier,
} from '@/lib/domain';
import { addDays, formatDateVN } from '@/lib/dates';
import {
  ENGINE_VERSION,
  computeGapPriorities,
  createInitialMastery,
  scoreAttempt,
  seedMasteryFromScore,
  selectDiagnosticItems,
  selectProgressItems,
  updateMastery,
  type AttemptEvent,
  type BlueprintSpec,
  type CandidateItem,
  type MasteryState,
  type ScoreResult,
  type ScoredAttemptItem,
  type SelectedItem,
  type SkillNode,
} from '@/engine';
import { getPublishedItemPool } from '@/server/content/service';
import { parseOptions, type ItemOption } from '@/server/content/schemas';
import {
  decideLevelChange,
  ensureMasteryRows,
  getMasteryDelta,
  getMasteryMap,
  getMasteryStates,
  getRecentSkillIds,
  getSkillNodes,
  saveMasteryStates,
  snapshotMastery,
  toMasteryState,
  type MasteryMap,
} from '@/server/student-model/service';
import { buildDefaultBlueprint, hasUsableChapterWeights, parseBlueprint } from './blueprint';

// ---------------------------------------------------------------------------
// Hằng số KỸ THUẬT (không phải tham số nghiệp vụ — tham số nghiệp vụ ở getConfig)
// ---------------------------------------------------------------------------

/** Trần số câu nạp về từ kho cho một lần ra đề; chạm trần thì cảnh báo vận hành. */
const POOL_FETCH_LIMIT = 5000;

/** Số ưu tiên học trước hiển thị trong báo cáo — specs §9.2 màn 7 yêu cầu 3–5. */
const REPORT_PRIORITY_COUNT = 5;

/** Số loại lỗi liệt kê trong báo cáo (specs §9.3 khối Error Patterns). */
const REPORT_ERROR_PATTERN_COUNT = 5;

/** Sai số khi so đáp án dạng số — chống lỗi dấu phẩy động của IEEE-754. */
const NUMERIC_EPSILON = 1e-9;

const SUBMITTED_STATUSES = ['SUBMITTED', 'GRADED'] as const;

// ---------------------------------------------------------------------------
// Kiểu dữ liệu công khai
// ---------------------------------------------------------------------------

/** Câu hỏi trong lúc làm bài — KHÔNG chứa đáp án và lời giải. */
export interface AttemptItemView {
  itemAttemptId: string;
  itemId: string;
  orderIndex: number;
  questionType: QuestionType;
  stem: string;
  stemImageUrl: string | null;
  options: ItemOption[];
  difficulty: Difficulty;
  difficultyLabel: string;
  estimatedTime: number;
  /** Đáp án đã lưu tự động; null khi chưa trả lời. */
  answer: unknown;
  timeMs: number;
  answered: boolean;
}

export interface AttemptSession {
  attemptId: string;
  assessmentId: string;
  type: AssessmentType;
  typeLabel: string;
  cycleNo: number;
  status: string;
  startedAt: Date;
  dueAt: Date | null;
  timeLimitMinutes: number | null;
  remainingSeconds: number | null;
  itemCount: number;
  answeredCount: number;
  /** Trạng thái autosave gần nhất để client dựng lại đúng chỗ đang dở. */
  autosaveState: Record<string, unknown>;
  items: AttemptItemView[];
  /** true khi trả lại bài đang dở thay vì tạo bài mới (specs §19.2 #7). */
  resumed: boolean;
  warnings: string[];
}

export interface AttemptReportItem {
  itemAttemptId: string;
  itemId: string;
  itemCode: string;
  orderIndex: number;
  skillId: string;
  skillName: string;
  chapterId: string;
  chapterName: string;
  difficulty: Difficulty;
  difficultyLabel: string;
  questionType: QuestionType;
  stem: string;
  stemImageUrl: string | null;
  options: ItemOption[];
  answer: unknown;
  correctAnswer: unknown;
  isCorrect: boolean;
  timeMs: number;
  estimatedTime: number;
  solution: string;
  solutionSteps: string[];
  errorPattern: ErrorPattern | null;
  errorPatternLabel: string | null;
}

export interface AttemptPriority {
  skillId: string;
  skillName: string;
  chapterName: string;
  masteryScore: number;
  tier: MasteryTier;
  tierLabel: string;
  priority: number;
  reason: string;
  blockedBySkillNames: string[];
}

export interface AttemptErrorSignature {
  skillId: string;
  skillName: string;
  pattern: ErrorPattern;
  label: string;
}

export interface AttemptDeltaSummary {
  comparedAttemptId: string | null;
  averageBefore: number;
  averageAfter: number;
  averageDelta: number;
  improvedSkills: number;
  droppedSkills: number;
  /** Tỷ lệ thời gian thực tế/chuẩn — giảm là nhanh lên. */
  speedBefore: number | null;
  speedAfter: number;
  speedDelta: number | null;
  topGains: { skillId: string; skillName: string; delta: number }[];
  topDrops: { skillId: string; skillName: string; delta: number }[];
  errorsFixed: AttemptErrorSignature[];
  errorsRepeated: AttemptErrorSignature[];
  message: string;
}

export interface AttemptReport {
  attemptId: string;
  assessmentId: string;
  type: AssessmentType;
  typeLabel: string;
  cycleNo: number;
  status: string;
  startedAt: Date;
  submittedAt: Date | null;
  totalTimeMs: number;
  totalMinutes: number;
  rawScore: number;
  maxScore: number;
  weightedScore: number;
  weightedMax: number;
  percent: number;
  avgTimeRatio: number;
  estimatedLevel: StudentLevel;
  estimatedLevelLabel: string;
  levelMessage: string;
  bySkill: { skillId: string; skillName: string; chapterName: string; correct: number; total: number; accuracy: number; estimatedMastery: number }[];
  byChapter: { chapterId: string; chapterName: string; correct: number; total: number; accuracy: number }[];
  masteryMap: MasteryMap;
  priorities: AttemptPriority[];
  errorPatterns: { pattern: ErrorPattern; label: string; count: number }[];
  delta: AttemptDeltaSummary | null;
  items: AttemptReportItem[];
  warnings: string[];
}

export interface AssessmentStatus {
  hasDiagnostic: boolean;
  diagnosticAttemptId: string | null;
  nextDueAt: Date | null;
  isDue: boolean;
  isOverdue: boolean;
  graceUntil: Date | null;
  currentCycleNo: number;
  lastAssessmentAt: Date | null;
  daysUntilDue: number | null;
  inProgressAttemptId: string | null;
  message: string;
}

export interface AttemptListEntry {
  attemptId: string;
  assessmentId: string;
  type: AssessmentType;
  typeLabel: string;
  cycleNo: number;
  status: string;
  startedAt: Date;
  submittedAt: Date | null;
  rawScore: number;
  maxScore: number;
  weightedScore: number;
  percent: number;
  estimatedLevel: StudentLevel | null;
  estimatedLevelLabel: string | null;
  totalTimeMs: number;
  itemCount: number;
  averageDelta: number | null;
}

// ---------------------------------------------------------------------------
// Chấm một câu trả lời
//
// Module learning có thể dùng lại hàm này (`gradeAnswerValue`) để chấm câu
// luyện tập — chấm ở hai nơi bằng hai luật khác nhau là lỗi nghiệp vụ nặng.
// ---------------------------------------------------------------------------

function normalizeText(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function toChoiceKey(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed.toUpperCase() : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function toChoiceKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(toChoiceKey).filter((key): key is string => key !== null);
  }
  const single = toChoiceKey(value);
  return single ? [single] : [];
}

/** Nhận cả "12.5" lẫn "12,5" — học sinh Việt Nam gõ dấu phẩy thập phân. */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function sameKeySets(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const key of setA) if (!setB.has(key)) return false;
  return true;
}

/**
 * Chấm đúng/sai một câu. Bỏ trống luôn là SAI — không có khái niệm "chưa chấm"
 * sau khi nộp bài, nếu không điểm trọng số sẽ lệch.
 */
export function gradeAnswerValue(input: {
  questionType: QuestionType;
  correctAnswer: unknown;
  answer: unknown;
  answerTolerance?: number | null;
}): boolean {
  const { questionType, correctAnswer, answer } = input;
  if (answer === null || answer === undefined) return false;
  if (typeof answer === 'string' && answer.trim() === '') return false;
  if (Array.isArray(answer) && answer.length === 0) return false;

  if (questionType === 'SINGLE_CHOICE') {
    const expected = toChoiceKey(correctAnswer);
    const given = toChoiceKeys(answer);
    return expected !== null && given.length === 1 && given[0] === expected;
  }

  if (questionType === 'MULTIPLE_CHOICE') {
    return sameKeySets(toChoiceKeys(correctAnswer), toChoiceKeys(answer));
  }

  if (questionType === 'NUMERIC') {
    const expected = toNumber(correctAnswer);
    const given = toNumber(Array.isArray(answer) ? answer[0] : answer);
    if (expected === null || given === null) return false;
    const tolerance = Math.max(0, input.answerTolerance ?? 0);
    return Math.abs(expected - given) <= tolerance + NUMERIC_EPSILON;
  }

  // SHORT_ANSWER: chấp nhận danh sách đáp án tương đương do biên soạn viên khai.
  const candidates = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
  const givenRaw = Array.isArray(answer) ? answer[0] : answer;
  const givenText = typeof givenRaw === 'number' ? String(givenRaw) : typeof givenRaw === 'string' ? givenRaw : '';
  if (!givenText.trim()) return false;
  const givenNormalized = normalizeText(givenText);
  const givenNumber = toNumber(givenText);

  return candidates.some((candidate) => {
    const text = typeof candidate === 'number' ? String(candidate) : typeof candidate === 'string' ? candidate : '';
    if (!text.trim()) return false;
    if (normalizeText(text) === givenNormalized) return true;
    const expectedNumber = toNumber(text);
    if (expectedNumber !== null && givenNumber !== null) {
      const tolerance = Math.max(0, input.answerTolerance ?? 0);
      return Math.abs(expectedNumber - givenNumber) <= tolerance + NUMERIC_EPSILON;
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// Truy vấn dùng chung
// ---------------------------------------------------------------------------

const enrollmentInclude = {
  course: { include: { program: { select: { code: true, name: true } } } },
  student: { select: { id: true, userId: true, actualGrade: true } },
  cohort: { select: { examDate: true } },
} as const;

type EnrollmentContext = Prisma.EnrollmentGetPayload<{ include: typeof enrollmentInclude }>;

/** Câu hỏi khi ĐANG LÀM BÀI — cố tình không select correctAnswer/solution. */
const playItemSelect = {
  id: true,
  skillId: true,
  chapterId: true,
  difficulty: true,
  questionType: true,
  stem: true,
  stemImageUrl: true,
  options: true,
  estimatedTime: true,
} as const;

const gradingItemSelect = {
  id: true,
  itemCode: true,
  skillId: true,
  chapterId: true,
  difficulty: true,
  questionType: true,
  stem: true,
  stemImageUrl: true,
  options: true,
  correctAnswer: true,
  answerTolerance: true,
  solution: true,
  solutionSteps: true,
  estimatedTime: true,
  skill: { select: { name: true, chapter: { select: { id: true, name: true } } } },
} as const;

const playAttemptInclude = {
  assessment: { select: { id: true, type: true, name: true, itemCount: true, timeLimitMinutes: true } },
  enrollment: { include: enrollmentInclude },
  itemAttempts: { select: { id: true, itemId: true, orderIndex: true, answer: true, timeMs: true, answeredAt: true, item: { select: playItemSelect } }, orderBy: { orderIndex: 'asc' } },
} as const;

const gradingAttemptInclude = {
  assessment: { select: { id: true, type: true, name: true, itemCount: true, timeLimitMinutes: true } },
  enrollment: { include: enrollmentInclude },
  itemAttempts: {
    select: {
      id: true,
      itemId: true,
      orderIndex: true,
      answer: true,
      timeMs: true,
      isCorrect: true,
      hintUsed: true,
      solutionViewedBeforeAnswer: true,
      errorPattern: true,
      answeredAt: true,
      item: { select: gradingItemSelect },
    },
    orderBy: { orderIndex: 'asc' },
  },
} as const;

type PlayAttempt = Prisma.AssessmentAttemptGetPayload<{ include: typeof playAttemptInclude }>;
type GradingAttempt = Prisma.AssessmentAttemptGetPayload<{ include: typeof gradingAttemptInclude }>;

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function levelLabelOf(level: StudentLevel, config: PlatformConfig): string {
  return config.levels.labels?.[level] ?? LEVEL_LABEL[level];
}

async function loadActiveEnrollment(enrollmentId: string): Promise<EnrollmentContext> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: enrollmentInclude,
  });
  if (!enrollment) throw ApiError.notFound('Không tìm thấy khóa học đã đăng ký.');
  if (enrollment.status === 'SUSPENDED') {
    throw ApiError.forbidden('Khóa học của bạn đang tạm khóa, vui lòng liên hệ bộ phận hỗ trợ.');
  }
  if (enrollment.status === 'EXPIRED' || enrollment.expiresAt.getTime() <= Date.now()) {
    throw ApiError.forbidden(
      `Quyền truy cập khóa học đã hết hạn ngày ${formatDateVN(enrollment.expiresAt)}. Vui lòng gia hạn để tiếp tục.`,
    );
  }
  return enrollment;
}

function assertOwnership(attempt: { enrollment: { student: { userId: string } } }, userId: string): void {
  if (attempt.enrollment.student.userId !== userId) {
    throw ApiError.forbidden('Bài làm này không thuộc về tài khoản của bạn.');
  }
}

// ---------------------------------------------------------------------------
// Kho câu ứng viên
// ---------------------------------------------------------------------------

/** Tham số truy vấn kho câu — khớp `publishedPoolFilterSchema` của module content. */
interface PublishedPoolQuery {
  subject: Subject;
  gradeBand: GradeBand;
  programCode?: string;
  excludeItemIds?: string[];
  actualGrade?: number;
  limit?: number;
}

interface PoolRow {
  id: string;
  skillId: string;
  chapterId: string;
  difficulty: Difficulty;
  difficultyNumeric: number;
  estimatedTime: number;
  tags: string[];
}

/**
 * Chuẩn hóa kết quả kho câu về đúng kiểu engine cần. Nhận cả mảng thuần lẫn
 * dạng bọc `{ items }` để module content đổi cách trả về mà không vỡ luồng đề.
 */
function normalizePoolRows(raw: unknown): PoolRow[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)
      ? ((raw as { items: unknown[] }).items)
      : [];

  const rows: PoolRow[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : typeof record.itemId === 'string' ? record.itemId : null;
    const skillId = typeof record.skillId === 'string' ? record.skillId : null;
    const chapterId = typeof record.chapterId === 'string' ? record.chapterId : null;
    const difficulty = record.difficulty;
    if (!id || !skillId || !chapterId) continue;
    if (difficulty !== 'AVERAGE' && difficulty !== 'GOOD' && difficulty !== 'EXCELLENT') continue;

    rows.push({
      id,
      skillId,
      chapterId,
      difficulty,
      difficultyNumeric: typeof record.difficultyNumeric === 'number' ? record.difficultyNumeric : 5,
      estimatedTime: typeof record.estimatedTime === 'number' && record.estimatedTime > 0 ? record.estimatedTime : 60,
      tags: parseStringArray(record.tags),
    });
  }
  return rows;
}

interface ItemHistory {
  count: number;
  lastServedAt: Date | null;
}

async function loadItemHistory(enrollmentId: string): Promise<Map<string, ItemHistory>> {
  const grouped = await prisma.itemAttempt.groupBy({
    by: ['itemId'],
    where: { enrollmentId },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  const map = new Map<string, ItemHistory>();
  for (const row of grouped) {
    map.set(row.itemId, { count: row._count._all, lastServedAt: row._max.createdAt ?? null });
  }
  return map;
}

async function loadCandidates(input: {
  enrollment: EnrollmentContext;
  excludeItemIds: string[];
  history: Map<string, ItemHistory>;
  warnings: string[];
}): Promise<CandidateItem[]> {
  const query: PublishedPoolQuery = {
    subject: input.enrollment.course.subject,
    gradeBand: input.enrollment.course.gradeBand,
    programCode: input.enrollment.course.program.code,
    actualGrade: input.enrollment.student.actualGrade,
    limit: POOL_FETCH_LIMIT,
  };
  if (input.excludeItemIds.length > 0) query.excludeItemIds = input.excludeItemIds;

  const raw: unknown = await getPublishedItemPool(query);
  const rows = normalizePoolRows(raw);

  if (rows.length >= POOL_FETCH_LIMIT) {
    input.warnings.push(
      `Kho câu trả về chạm trần ${POOL_FETCH_LIMIT} câu — đề vẫn ra được nhưng cần rà lại bộ lọc kho câu hỏi.`,
    );
  }

  return rows.map((row) => {
    const history = input.history.get(row.id);
    return {
      id: row.id,
      skillId: row.skillId,
      chapterId: row.chapterId,
      difficulty: row.difficulty,
      difficultyNumeric: row.difficultyNumeric,
      estimatedTime: row.estimatedTime,
      tags: row.tags,
      lastServedAt: history?.lastServedAt ?? null,
      timesServedToStudent: history?.count ?? 0,
    } satisfies CandidateItem;
  });
}

// ---------------------------------------------------------------------------
// Assessment mặc định của khóa
// ---------------------------------------------------------------------------

async function loadChapters(subject: Subject, gradeBand: GradeBand) {
  return prisma.chapter.findMany({
    where: { subject, gradeBand },
    select: { id: true, blueprintWeight: true },
    orderBy: { order: 'asc' },
  });
}

/**
 * Tạo bài DIAGNOSTIC và PROGRESS mặc định cho khóa nếu chưa có.
 * Không ghi đè cấu hình admin đã sửa; chỉ tự vá blueprint khi blueprint đang
 * rỗng (thường do khóa được tạo trước khi đội nội dung dựng xong taxonomy).
 */
export async function ensureAssessmentsForCourse(courseId: string): Promise<void> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, subject: true, gradeBand: true, name: true },
  });
  if (!course) throw ApiError.notFound('Không tìm thấy khóa học.');

  const config = await getConfig();
  const chapters = await loadChapters(course.subject, course.gradeBand);
  const existing = await prisma.assessment.findMany({ where: { courseId } });
  const byType = new Map(existing.map((row) => [row.type, row]));

  const plans: { type: AssessmentType; name: string; itemCount: number; timeLimitMinutes: number | null }[] = [
    {
      type: 'DIAGNOSTIC',
      name: `${ASSESSMENT_TYPE_LABEL.DIAGNOSTIC} — ${course.name}`,
      itemCount: config.assessment.diagnosticItemCount,
      timeLimitMinutes: config.assessment.diagnosticTimeLimitMinutes,
    },
    {
      type: 'PROGRESS',
      name: `${ASSESSMENT_TYPE_LABEL.PROGRESS} — ${course.name}`,
      itemCount: config.assessment.progressItemCount,
      timeLimitMinutes: config.assessment.progressTimeLimitMinutes,
    },
  ];

  for (const plan of plans) {
    const current = byType.get(plan.type);
    const blueprint = buildDefaultBlueprint(chapters, { itemCount: plan.itemCount });

    if (!current) {
      await prisma.assessment.create({
        data: {
          courseId,
          type: plan.type,
          name: plan.name,
          itemCount: plan.itemCount,
          timeLimitMinutes: plan.timeLimitMinutes,
          blueprint: toJson(blueprint),
        },
      });
      continue;
    }

    if (!hasUsableChapterWeights(current.blueprint) && chapters.length > 0) {
      await prisma.assessment.update({
        where: { id: current.id },
        data: { blueprint: toJson(blueprint) },
      });
    }
  }
}

async function loadAssessment(courseId: string, type: AssessmentType) {
  const assessment = await prisma.assessment.findUnique({
    where: { courseId_type: { courseId, type } },
  });
  if (!assessment || !assessment.active) {
    throw ApiError.notFound(
      `Khóa học chưa được cấu hình ${ASSESSMENT_TYPE_LABEL[type].toLowerCase()}. Vui lòng liên hệ bộ phận hỗ trợ.`,
    );
  }
  return assessment;
}

async function resolveBlueprint(
  assessment: { blueprint: Prisma.JsonValue; itemCount: number },
  subject: Subject,
  gradeBand: GradeBand,
): Promise<BlueprintSpec> {
  const chapters = await loadChapters(subject, gradeBand);
  const fallback = buildDefaultBlueprint(chapters, { itemCount: assessment.itemCount });
  return parseBlueprint(assessment.blueprint, fallback);
}

// ---------------------------------------------------------------------------
// Tạo bài làm
// ---------------------------------------------------------------------------

function startingLevel(enrollment: EnrollmentContext): StudentLevel {
  // Mức tự khai chỉ chọn vùng độ khó xuất phát (specs §7.9). Chưa khai gì thì
  // lấy mức giữa thang để không ném đề quá dễ hoặc quá khó ngay từ đầu.
  const middle = STUDENT_LEVELS.find((level) => LEVEL_ORDER[level] === Math.floor((STUDENT_LEVELS.length - 1) / 2));
  return enrollment.selfDeclaredLevel ?? enrollment.estimatedLevel ?? middle ?? 'AVERAGE';
}

async function persistNewAttempt(input: {
  enrollment: EnrollmentContext;
  assessment: { id: string; itemCount: number; timeLimitMinutes: number | null; type: AssessmentType };
  selection: SelectedItem[];
  context: AttemptContext;
  cycleNo: number;
  history: Map<string, ItemHistory>;
  warnings: string[];
  seedKey: string;
}): Promise<string> {
  const now = new Date();
  const dueAt = input.assessment.timeLimitMinutes
    ? new Date(now.getTime() + input.assessment.timeLimitMinutes * 60_000)
    : null;

  return prisma.$transaction(async (tx) => {
    const attempt = await tx.assessmentAttempt.create({
      data: {
        enrollmentId: input.enrollment.id,
        assessmentId: input.assessment.id,
        cycleNo: input.cycleNo,
        status: 'IN_PROGRESS',
        startedAt: now,
        dueAt,
        maxScore: input.selection.length,
        autosaveState: toJson({ savedAt: null, answers: {} }),
        // Cảnh báo kho câu được giữ lại để hiện trong báo cáo cho vận hành.
        resultSummary: toJson({ selectionWarnings: input.warnings, seedKey: input.seedKey }),
      },
      select: { id: true },
    });

    await tx.itemAttempt.createMany({
      data: input.selection.map((selected, index) => ({
        enrollmentId: input.enrollment.id,
        itemId: selected.itemId,
        context: input.context,
        assessmentAttemptId: attempt.id,
        orderIndex: index,
        attemptNo: (input.history.get(selected.itemId)?.count ?? 0) + 1,
      })),
    });

    // specs §7.8 + §17: mọi câu được chọn phải trả lời được "vì sao chọn câu này".
    await tx.recommendation.createMany({
      data: input.selection.map((selected, index) => ({
        enrollmentId: input.enrollment.id,
        skillId: selected.skillId,
        itemId: selected.itemId,
        reasonCode: selected.reasonCode,
        reasonData: toJson({
          assessmentType: input.assessment.type,
          attemptId: attempt.id,
          cycleNo: input.cycleNo,
          role: selected.role,
          difficulty: selected.difficulty,
          chapterId: selected.chapterId,
          orderIndex: index,
          seedKey: input.seedKey,
        }),
        engineVersion: ENGINE_VERSION,
      })),
    });

    return attempt.id;
  });
}

function toAttemptItemView(row: PlayAttempt['itemAttempts'][number]): AttemptItemView {
  return {
    itemAttemptId: row.id,
    itemId: row.itemId,
    orderIndex: row.orderIndex,
    questionType: row.item.questionType,
    stem: row.item.stem,
    stemImageUrl: row.item.stemImageUrl,
    options: parseOptions(row.item.options),
    difficulty: row.item.difficulty,
    difficultyLabel: DIFFICULTY_LABEL[row.item.difficulty],
    estimatedTime: row.item.estimatedTime,
    answer: row.answer ?? null,
    timeMs: row.timeMs,
    answered: row.answer !== null && row.answer !== undefined,
  };
}

function toAttemptSession(attempt: PlayAttempt, resumed: boolean, warnings: string[]): AttemptSession {
  const autosaveState =
    attempt.autosaveState && typeof attempt.autosaveState === 'object' && !Array.isArray(attempt.autosaveState)
      ? (attempt.autosaveState as Record<string, unknown>)
      : {};
  const remainingSeconds = attempt.dueAt
    ? Math.max(0, Math.round((attempt.dueAt.getTime() - Date.now()) / 1000))
    : null;

  const items = attempt.itemAttempts.map(toAttemptItemView);
  return {
    attemptId: attempt.id,
    assessmentId: attempt.assessmentId,
    type: attempt.assessment.type,
    typeLabel: ASSESSMENT_TYPE_LABEL[attempt.assessment.type],
    cycleNo: attempt.cycleNo,
    status: attempt.status,
    startedAt: attempt.startedAt,
    dueAt: attempt.dueAt,
    timeLimitMinutes: attempt.assessment.timeLimitMinutes,
    remainingSeconds,
    itemCount: items.length,
    answeredCount: items.filter((item) => item.answered).length,
    autosaveState,
    items,
    resumed,
    warnings,
  };
}

async function loadPlayAttempt(attemptId: string): Promise<PlayAttempt> {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: playAttemptInclude,
  });
  if (!attempt) throw ApiError.notFound('Không tìm thấy bài làm.');
  return attempt;
}

// ---------------------------------------------------------------------------
// §7.9 — Bài kiểm tra đầu vào
// ---------------------------------------------------------------------------

export async function startDiagnostic(enrollmentId: string): Promise<AttemptSession> {
  const enrollment = await loadActiveEnrollment(enrollmentId);
  await ensureAssessmentsForCourse(enrollment.courseId);
  const assessment = await loadAssessment(enrollment.courseId, 'DIAGNOSTIC');

  const finished = await prisma.assessmentAttempt.findFirst({
    where: { enrollmentId, assessmentId: assessment.id, status: { in: [...SUBMITTED_STATUSES] } },
    orderBy: { submittedAt: 'desc' },
    select: { id: true },
  });
  if (finished) {
    throw ApiError.conflict(
      'Bạn đã hoàn thành bài kiểm tra đầu vào. Hãy xem lại báo cáo hoặc chờ bài kiểm tra tiến bộ theo chu kỳ.',
      { attemptId: finished.id },
    );
  }

  // Đang dở → trả lại đúng bài đó để làm tiếp (specs §19.2 #7).
  const inProgress = await prisma.assessmentAttempt.findFirst({
    where: { enrollmentId, assessmentId: assessment.id, status: 'IN_PROGRESS' },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  });
  if (inProgress) {
    return toAttemptSession(await loadPlayAttempt(inProgress.id), true, []);
  }

  const warnings: string[] = [];
  await ensureMasteryRows(enrollmentId);
  const skills = await getSkillNodes({
    subject: enrollment.course.subject,
    gradeBand: enrollment.course.gradeBand,
  });
  if (skills.length === 0) {
    throw ApiError.conflict(
      'Chương trình học của khóa này chưa được khai báo kỹ năng nên chưa tạo được đề. Vui lòng liên hệ bộ phận hỗ trợ.',
    );
  }

  const history = await loadItemHistory(enrollmentId);
  const candidates = await loadCandidates({ enrollment, excludeItemIds: [], history, warnings });
  const blueprint = await resolveBlueprint(assessment, enrollment.course.subject, enrollment.course.gradeBand);
  const seedKey = `${enrollmentId}:DIAGNOSTIC`;

  const selection = selectDiagnosticItems({
    candidates,
    skills,
    blueprint,
    selfLevel: startingLevel(enrollment),
    itemCount: assessment.itemCount,
    seedKey,
  });
  warnings.push(...selection.warnings);

  if (selection.items.length === 0) {
    throw ApiError.conflict(
      'Kho câu hỏi đã xuất bản chưa đủ để tạo bài kiểm tra đầu vào cho khóa này. Bộ phận nội dung đã được ghi nhận.',
      { warnings },
    );
  }

  const attemptId = await persistNewAttempt({
    enrollment,
    assessment,
    selection: selection.items,
    context: 'DIAGNOSTIC',
    cycleNo: 0,
    history,
    warnings,
    seedKey,
  });

  await track({
    eventName: EVENTS.DIAGNOSTIC_STARTED,
    userId: enrollment.student.userId,
    enrollmentId,
    properties: {
      attemptId,
      itemCount: selection.items.length,
      selfLevel: startingLevel(enrollment),
      warnings: warnings.length,
    },
  });

  return toAttemptSession(await loadPlayAttempt(attemptId), false, warnings);
}

// ---------------------------------------------------------------------------
// §7.10 — Bài kiểm tra tiến bộ 14 ngày
// ---------------------------------------------------------------------------

export async function startProgressAssessment(enrollmentId: string): Promise<AttemptSession> {
  const enrollment = await loadActiveEnrollment(enrollmentId);
  await ensureAssessmentsForCourse(enrollment.courseId);
  const assessment = await loadAssessment(enrollment.courseId, 'PROGRESS');
  const config = await getConfig();

  const baselineAttempt = await prisma.assessmentAttempt.findFirst({
    where: {
      enrollmentId,
      status: { in: [...SUBMITTED_STATUSES] },
      assessment: { type: 'DIAGNOSTIC' },
    },
    orderBy: { submittedAt: 'asc' },
    select: {
      id: true,
      itemAttempts: {
        select: { itemId: true, item: { select: { skillId: true, difficulty: true } } },
      },
    },
  });
  if (!baselineAttempt) {
    throw ApiError.conflict(
      'Bạn cần hoàn thành bài kiểm tra đầu vào trước khi làm bài kiểm tra tiến bộ.',
    );
  }

  const inProgress = await prisma.assessmentAttempt.findFirst({
    where: { enrollmentId, assessmentId: assessment.id, status: 'IN_PROGRESS' },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  });
  if (inProgress) {
    return toAttemptSession(await loadPlayAttempt(inProgress.id), true, []);
  }

  const warnings: string[] = [];
  await ensureMasteryRows(enrollmentId);
  const skills = await getSkillNodes({
    subject: enrollment.course.subject,
    gradeBand: enrollment.course.gradeBand,
  });
  const masteries = await getMasteryStates(enrollmentId);

  const doneCycles = await prisma.assessmentAttempt.count({
    where: { enrollmentId, assessmentId: assessment.id, status: { in: [...SUBMITTED_STATUSES] } },
  });
  const cycleNo = doneCycles + 1;

  // Chống điểm giả: loại mọi câu học sinh vừa gặp trong N ngày (specs §7.5).
  const since = addDays(new Date(), -Math.max(1, config.assessment.recentExclusionDays));
  const recentlySeen = await prisma.itemAttempt.findMany({
    where: { enrollmentId, createdAt: { gte: since } },
    select: { itemId: true },
    distinct: ['itemId'],
  });
  const excludeItemIds = recentlySeen.map((row) => row.itemId);

  const history = await loadItemHistory(enrollmentId);
  const candidates = await loadCandidates({ enrollment, excludeItemIds, history, warnings });
  const blueprint = await resolveBlueprint(assessment, enrollment.course.subject, enrollment.course.gradeBand);
  const trainedSkillIds = await getRecentSkillIds(enrollmentId, config.assessment.cycleDays);
  const seedKey = `${enrollmentId}:PROGRESS:${cycleNo}`;

  const selection = selectProgressItems({
    candidates,
    skills,
    blueprint,
    masteries,
    baselineItems: baselineAttempt.itemAttempts.map((row) => ({
      itemId: row.itemId,
      skillId: row.item.skillId,
      difficulty: row.item.difficulty,
    })),
    trainedSkillIds,
    excludeItemIds,
    composition: config.assessment.progressComposition,
    itemCount: assessment.itemCount,
    seedKey,
  });
  warnings.push(...selection.warnings);

  if (selection.items.length === 0) {
    throw ApiError.conflict(
      'Kho câu hỏi chưa đủ câu mới để tạo bài kiểm tra tiến bộ. Bộ phận nội dung đã được ghi nhận.',
      { warnings },
    );
  }

  const attemptId = await persistNewAttempt({
    enrollment,
    assessment,
    selection: selection.items,
    context: 'ASSESSMENT',
    cycleNo,
    history,
    warnings,
    seedKey,
  });

  await track({
    eventName: 'assessment_started',
    userId: enrollment.student.userId,
    enrollmentId,
    properties: { attemptId, cycleNo, itemCount: selection.items.length, warnings: warnings.length },
  });

  return toAttemptSession(await loadPlayAttempt(attemptId), false, warnings);
}

// ---------------------------------------------------------------------------
// Làm bài: đọc lại & autosave
// ---------------------------------------------------------------------------

export async function getAttemptForStudent(attemptId: string, userId: string): Promise<AttemptSession> {
  const attempt = await loadPlayAttempt(attemptId);
  assertOwnership(attempt, userId);
  return toAttemptSession(attempt, attempt.status === 'IN_PROGRESS', []);
}

/**
 * Lưu tạm bài làm. Gọi bao nhiêu lần cũng ra cùng kết quả: mỗi câu chỉ ghi đè
 * đáp án mới nhất, thời gian lấy giá trị lớn hơn để mất mạng giữa chừng rồi
 * gửi lại không làm mất thời gian đã tích lũy (specs §19.2 #7).
 */
export async function autosaveAttempt(input: {
  attemptId: string;
  userId: string;
  answers: { itemAttemptId: string; answer: unknown; timeMs: number }[];
}): Promise<void> {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: input.attemptId },
    select: {
      id: true,
      status: true,
      autosaveState: true,
      enrollment: { select: { student: { select: { userId: true } } } },
      itemAttempts: { select: { id: true, timeMs: true } },
    },
  });
  if (!attempt) throw ApiError.notFound('Không tìm thấy bài làm.');
  assertOwnership(attempt, input.userId);

  // Autosave đến muộn sau khi bài đã nộp: bỏ qua trong im lặng, tuyệt đối không
  // sửa bài đã chấm và cũng không báo lỗi làm hỏng trải nghiệm trên mobile.
  if (attempt.status !== 'IN_PROGRESS') return;
  if (input.answers.length === 0) return;

  const known = new Map(attempt.itemAttempts.map((row) => [row.id, row.timeMs]));
  const accepted = input.answers.filter((entry) => known.has(entry.itemAttemptId));
  if (accepted.length === 0) {
    throw ApiError.badRequest('Các câu gửi lên không thuộc bài làm này.');
  }

  const previousState =
    attempt.autosaveState && typeof attempt.autosaveState === 'object' && !Array.isArray(attempt.autosaveState)
      ? (attempt.autosaveState as Record<string, unknown>)
      : {};
  const previousAnswers =
    previousState.answers && typeof previousState.answers === 'object' && !Array.isArray(previousState.answers)
      ? { ...(previousState.answers as Record<string, unknown>) }
      : {};

  const timeById = new Map(known);
  for (const entry of accepted) {
    const timeMs = Math.max(entry.timeMs ?? 0, timeById.get(entry.itemAttemptId) ?? 0);
    timeById.set(entry.itemAttemptId, timeMs);
    previousAnswers[entry.itemAttemptId] = { answer: entry.answer ?? null, timeMs };
  }

  const totalTimeMs = [...timeById.values()].reduce((sum, value) => sum + value, 0);

  await prisma.$transaction(async (tx) => {
    for (const entry of accepted) {
      await tx.itemAttempt.updateMany({
        where: { id: entry.itemAttemptId, assessmentAttemptId: attempt.id },
        data: {
          answer:
            entry.answer === null || entry.answer === undefined
              ? Prisma.DbNull
              : (entry.answer as Prisma.InputJsonValue),
          timeMs: timeById.get(entry.itemAttemptId) ?? 0,
        },
      });
    }
    await tx.assessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        totalTimeMs,
        autosaveState: toJson({ savedAt: new Date().toISOString(), answers: previousAnswers }),
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Nộp bài — luồng quan trọng nhất
// ---------------------------------------------------------------------------

interface GradedItem {
  itemAttemptId: string;
  itemId: string;
  skillId: string;
  skillName: string;
  chapterId: string;
  chapterName: string;
  difficulty: Difficulty;
  isCorrect: boolean;
  timeMs: number;
  estimatedTime: number;
  event: AttemptEvent;
}

function buildGradedItems(attempt: GradingAttempt, submittedAt: Date): GradedItem[] {
  return attempt.itemAttempts.map((row) => {
    const isCorrect = gradeAnswerValue({
      questionType: row.item.questionType,
      correctAnswer: row.item.correctAnswer,
      answer: row.answer ?? null,
      answerTolerance: row.item.answerTolerance,
    });
    return {
      itemAttemptId: row.id,
      itemId: row.itemId,
      skillId: row.item.skillId,
      skillName: row.item.skill.name,
      chapterId: row.item.chapterId,
      chapterName: row.item.skill.chapter.name,
      difficulty: row.item.difficulty,
      isCorrect,
      timeMs: row.timeMs,
      estimatedTime: row.item.estimatedTime,
      event: {
        isCorrect,
        timeMs: row.timeMs,
        estimatedTimeSeconds: row.item.estimatedTime,
        difficulty: row.item.difficulty,
        hintUsed: row.hintUsed,
        solutionViewedBeforeAnswer: row.solutionViewedBeforeAnswer,
        answeredAt: row.answeredAt ?? submittedAt,
      },
    };
  });
}

function toScoredItems(items: GradedItem[]): ScoredAttemptItem[] {
  return items.map((item) => ({
    itemId: item.itemId,
    skillId: item.skillId,
    chapterId: item.chapterId,
    difficulty: item.difficulty,
    isCorrect: item.isCorrect,
    timeMs: item.timeMs,
    estimatedTimeSeconds: item.estimatedTime,
  }));
}

interface ItemOutcome {
  itemAttemptId: string;
  isCorrect: boolean;
  errorPattern: ErrorPattern | null;
  masteryBefore: number;
  masteryAfter: number;
}

/**
 * So sánh với bài gần nhất: mastery tăng/giảm, tốc độ, lỗi đã sửa / còn lặp
 * (specs §7.10 — kết quả bắt buộc có delta).
 */
async function buildDeltaSummary(
  tx: Prisma.TransactionClient,
  input: {
    enrollmentId: string;
    attemptId: string;
    graded: GradedItem[];
    outcomes: ItemOutcome[];
    score: ScoreResult;
  },
): Promise<AttemptDeltaSummary> {
  const delta = await getMasteryDelta(input.enrollmentId, {}, tx);

  const previous = await tx.assessmentAttempt.findFirst({
    where: {
      enrollmentId: input.enrollmentId,
      id: { not: input.attemptId },
      status: { in: [...SUBMITTED_STATUSES] },
    },
    orderBy: { submittedAt: 'desc' },
    select: {
      id: true,
      resultSummary: true,
      itemAttempts: {
        select: { errorPattern: true, item: { select: { skillId: true, skill: { select: { name: true } } } } },
      },
    },
  });

  const previousSummary =
    previous?.resultSummary && typeof previous.resultSummary === 'object' && !Array.isArray(previous.resultSummary)
      ? (previous.resultSummary as Record<string, unknown>)
      : null;
  const speedBefore =
    previousSummary && typeof previousSummary.avgTimeRatio === 'number' ? previousSummary.avgTimeRatio : null;

  const signatureKey = (skillId: string, pattern: ErrorPattern): string => `${skillId}::${pattern}`;
  const previousErrors = new Map<string, AttemptErrorSignature>();
  for (const row of previous?.itemAttempts ?? []) {
    if (!row.errorPattern) continue;
    previousErrors.set(signatureKey(row.item.skillId, row.errorPattern), {
      skillId: row.item.skillId,
      skillName: row.item.skill.name,
      pattern: row.errorPattern,
      label: ERROR_PATTERN_LABEL[row.errorPattern],
    });
  }

  const currentErrors = new Map<string, AttemptErrorSignature>();
  const outcomeById = new Map(input.outcomes.map((outcome) => [outcome.itemAttemptId, outcome]));
  for (const item of input.graded) {
    const outcome = outcomeById.get(item.itemAttemptId);
    if (!outcome?.errorPattern || outcome.isCorrect) continue;
    currentErrors.set(signatureKey(item.skillId, outcome.errorPattern), {
      skillId: item.skillId,
      skillName: item.skillName,
      pattern: outcome.errorPattern,
      label: ERROR_PATTERN_LABEL[outcome.errorPattern],
    });
  }

  const errorsFixed = [...previousErrors.entries()]
    .filter(([key]) => !currentErrors.has(key))
    .map(([, value]) => value);
  const errorsRepeated = [...currentErrors.entries()]
    .filter(([key]) => previousErrors.has(key))
    .map(([, value]) => value);

  const improvedSkills = delta.bySkill.filter((skill) => skill.delta > 0).length;
  const droppedSkills = delta.bySkill.filter((skill) => skill.delta < 0).length;
  const speedAfter = input.score.avgTimeRatio;
  const speedDelta = speedBefore !== null ? Math.round((speedAfter - speedBefore) * 1000) / 1000 : null;

  const parts: string[] = [];
  parts.push(
    delta.isFirstSnapshot
      ? 'Đây là mốc đầu tiên nên chưa có số liệu so sánh.'
      : `Mastery trung bình ${delta.averageDelta >= 0 ? 'tăng' : 'giảm'} ${Math.abs(delta.averageDelta)} điểm.`,
  );
  if (speedDelta !== null) {
    parts.push(speedDelta <= 0 ? 'Tốc độ làm bài nhanh hơn chu kỳ trước.' : 'Tốc độ làm bài chậm hơn chu kỳ trước.');
  }
  if (errorsFixed.length > 0) parts.push(`Đã khắc phục ${errorsFixed.length} lỗi lặp.`);
  if (errorsRepeated.length > 0) parts.push(`Còn ${errorsRepeated.length} lỗi lặp lại cần xử lý trong buổi tư vấn.`);

  return {
    comparedAttemptId: previous?.id ?? null,
    averageBefore: delta.averageBefore,
    averageAfter: delta.averageAfter,
    averageDelta: delta.averageDelta,
    improvedSkills,
    droppedSkills,
    speedBefore,
    speedAfter,
    speedDelta,
    topGains: delta.bySkill
      .filter((skill) => skill.delta > 0)
      .slice(0, REPORT_PRIORITY_COUNT)
      .map((skill) => ({ skillId: skill.skillId, skillName: skill.skillName, delta: skill.delta })),
    topDrops: delta.bySkill
      .filter((skill) => skill.delta < 0)
      .slice(-REPORT_PRIORITY_COUNT)
      .reverse()
      .map((skill) => ({ skillId: skill.skillId, skillName: skill.skillName, delta: skill.delta })),
    errorsFixed,
    errorsRepeated,
    message: parts.join(' '),
  };
}

export async function submitAttempt(input: { attemptId: string; userId: string }): Promise<AttemptReport> {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: input.attemptId },
    include: gradingAttemptInclude,
  });
  if (!attempt) throw ApiError.notFound('Không tìm thấy bài làm.');
  assertOwnership(attempt, input.userId);

  // Nộp lại bài đã chấm (bấm hai lần, mất mạng rồi gửi lại) → trả báo cáo cũ.
  if (attempt.status !== 'IN_PROGRESS') {
    return getAttemptReport(input.attemptId, input.userId);
  }
  if (attempt.itemAttempts.length === 0) {
    throw ApiError.conflict('Bài làm không có câu hỏi nào, không thể chấm.');
  }

  const config = await getConfig();
  const enrollment = attempt.enrollment;
  const isDiagnostic = attempt.assessment.type === 'DIAGNOSTIC';
  const trigger: MasteryTrigger = isDiagnostic ? 'DIAGNOSTIC' : 'BIWEEKLY';
  const submittedAt = new Date();

  await ensureMasteryRows(enrollment.id);
  const skills = await getSkillNodes({
    subject: enrollment.course.subject,
    gradeBand: enrollment.course.gradeBand,
  });

  const graded = buildGradedItems(attempt, submittedAt);
  const score = scoreAttempt(toScoredItems(graded), config.levels);
  const totalTimeMs = graded.reduce((sum, item) => sum + Math.max(0, item.timeMs), 0);

  const previousWarnings =
    attempt.resultSummary && typeof attempt.resultSummary === 'object' && !Array.isArray(attempt.resultSummary)
      ? parseStringArray((attempt.resultSummary as Record<string, unknown>).selectionWarnings)
      : [];

  const report = await prisma.$transaction(
    async (tx) => {
      const masteryRows = await tx.studentSkillMastery.findMany({ where: { enrollmentId: enrollment.id } });
      const stateBySkill = new Map<string, MasteryState>();
      for (const row of masteryRows) stateBySkill.set(row.skillId, toMasteryState(row));

      const outcomes: ItemOutcome[] = [];
      let statesToSave: MasteryState[] = [];

      if (isDiagnostic) {
        // Bài đầu vào: hồ sơ được KHỞI TẠO từ toàn bài (§7.9) chứ không cộng dồn
        // từng câu. Loại lỗi vẫn suy theo luật engine để báo cáo nói được vì sao sai.
        const seeded = seedMasteryFromScore(
          score.bySkill,
          skills.map((skill) => skill.id),
          config.recommendation,
        );
        const seededBySkill = new Map(seeded.map((state) => [state.skillId, state]));

        for (const item of graded) {
          const probe = updateMastery(createInitialMastery(item.skillId), item.event, config.recommendation);
          outcomes.push({
            itemAttemptId: item.itemAttemptId,
            isCorrect: item.isCorrect,
            errorPattern: item.isCorrect ? null : probe.errorPattern,
            masteryBefore: stateBySkill.get(item.skillId)?.masteryScore ?? 0,
            masteryAfter: seededBySkill.get(item.skillId)?.masteryScore ?? 0,
          });
        }

        // Chỉ ghi skill có dữ liệu: skill chưa đo đã có sẵn bản ghi rỗng.
        statesToSave = seeded
          .filter((state) => state.attemptCount > 0)
          .map((state) => ({ ...state, lastPracticedAt: submittedAt }));
      } else {
        // Bài tiến bộ: cập nhật tuần tự từng câu đúng như luồng luyện tập
        // (`applyAttempt`), nhưng giữ trong bộ nhớ để cả lần nộp nằm gọn trong
        // một transaction thay vì N vòng đọc–ghi.
        const touched = new Set<string>();
        for (const item of graded) {
          const prev = stateBySkill.get(item.skillId) ?? createInitialMastery(item.skillId);
          const update = updateMastery(prev, item.event, config.recommendation);
          stateBySkill.set(item.skillId, update.next);
          touched.add(item.skillId);
          outcomes.push({
            itemAttemptId: item.itemAttemptId,
            isCorrect: item.isCorrect,
            errorPattern: item.isCorrect ? null : update.errorPattern,
            masteryBefore: prev.masteryScore,
            masteryAfter: update.next.masteryScore,
          });
        }
        statesToSave = [...touched]
          .map((skillId) => stateBySkill.get(skillId))
          .filter((state): state is MasteryState => state !== undefined);
      }

      for (const outcome of outcomes) {
        await tx.itemAttempt.update({
          where: { id: outcome.itemAttemptId },
          data: {
            isCorrect: outcome.isCorrect,
            errorPattern: outcome.errorPattern,
            masteryBefore: outcome.masteryBefore,
            masteryAfter: outcome.masteryAfter,
            answeredAt: submittedAt,
          },
        });
      }

      await saveMasteryStates(enrollment.id, statesToSave, tx);
      await snapshotMastery(enrollment.id, trigger, tx);

      // specs §10.1 — không nhảy level sau một bài.
      const updatedStates = await getMasteryStates(enrollment.id, tx);
      const levelDecision = decideLevelChange({
        currentLevel: enrollment.estimatedLevel,
        candidateLevel: score.estimatedLevel,
        masteries: updatedStates,
        levelConfig: config.levels,
      });
      if (levelDecision.level !== enrollment.estimatedLevel) {
        await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { estimatedLevel: levelDecision.level },
        });
      }

      const deltaSummary = isDiagnostic
        ? null
        : await buildDeltaSummary(tx, {
            enrollmentId: enrollment.id,
            attemptId: attempt.id,
            graded,
            outcomes,
            score,
          });

      await tx.assessmentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'GRADED',
          submittedAt,
          rawScore: score.rawScore,
          maxScore: score.maxScore,
          weightedScore: score.weightedScore,
          estimatedLevel: score.estimatedLevel,
          totalTimeMs,
          resultSummary: toJson({
            percent: score.percent,
            rawScore: score.rawScore,
            maxScore: score.maxScore,
            weightedScore: score.weightedScore,
            weightedMax: score.weightedMax,
            avgTimeRatio: score.avgTimeRatio,
            totalTimeMs,
            estimatedLevel: score.estimatedLevel,
            displayLevel: levelDecision.level,
            levelChanged: levelDecision.changed,
            levelReasonCode: levelDecision.reasonCode,
            levelMessage: levelDecision.message,
            bySkill: score.bySkill,
            byChapter: score.byChapter,
            weakestSkillIds: score.weakestSkillIds,
            strongestSkillIds: score.strongestSkillIds,
            selectionWarnings: previousWarnings,
          }),
          ...(deltaSummary ? { deltaSummary: toJson(deltaSummary) } : {}),
        },
      });

      // specs §10.3 #3 — nộp bài xong phải sinh nhiệm vụ đặt lịch buổi tư vấn.
      if (!isDiagnostic && config.teacher.autoCreateSessionAfterAssessment) {
        const existingSession = await tx.teacherSession.findFirst({
          where: { enrollmentId: enrollment.id, cycleNo: attempt.cycleNo },
          select: { id: true },
        });
        if (!existingSession) {
          const assignment = await tx.teacherAssignment.findUnique({
            where: { enrollmentId: enrollment.id },
            select: { teacherId: true, active: true },
          });
          await tx.teacherSession.create({
            data: {
              enrollmentId: enrollment.id,
              teacherId: assignment?.active ? assignment.teacherId : null,
              cycleNo: attempt.cycleNo,
              durationMinutes: config.teacher.sessionMinutes,
              status: 'SCHEDULED',
              focusSkillIds: score.weakestSkillIds.slice(0, REPORT_PRIORITY_COUNT),
            },
          });
        }
      }

      return { levelDecision, deltaSummary };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  // Thống kê chất lượng câu hỏi nằm ngoài transaction: hỏng thống kê không được
  // phép làm hỏng bài đã chấm của học sinh.
  await updateItemStats(graded).catch((error: unknown) => {
    console.error('[assessment] không cập nhật được thống kê câu hỏi', error);
  });

  await track({
    eventName: isDiagnostic ? EVENTS.DIAGNOSTIC_COMPLETED : EVENTS.ASSESSMENT_COMPLETED,
    userId: enrollment.student.userId,
    enrollmentId: enrollment.id,
    properties: {
      attemptId: attempt.id,
      cycleNo: attempt.cycleNo,
      percent: score.percent,
      rawScore: score.rawScore,
      maxScore: score.maxScore,
      estimatedLevel: score.estimatedLevel,
      displayLevel: report.levelDecision.level,
      averageDelta: report.deltaSummary?.averageDelta ?? null,
    },
  });

  return getAttemptReport(input.attemptId, input.userId);
}

async function updateItemStats(graded: GradedItem[]): Promise<void> {
  for (const item of graded) {
    await prisma.questionItem.update({
      where: { id: item.itemId },
      data: {
        timesServed: { increment: 1 },
        timesCorrect: { increment: item.isCorrect ? 1 : 0 },
        totalTimeMs: { increment: BigInt(Math.max(0, Math.round(item.timeMs))) },
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Báo cáo
// ---------------------------------------------------------------------------

function parseSolutionSteps(raw: Prisma.JsonValue): string[] {
  return parseStringArray(raw);
}

function parseDeltaSummary(raw: Prisma.JsonValue): AttemptDeltaSummary | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.averageDelta !== 'number') return null;
  // JSON này do chính submitAttempt ghi ra nên cấu trúc đã biết trước.
  return raw as unknown as AttemptDeltaSummary;
}

async function buildPriorities(input: {
  enrollmentId: string;
  skills: SkillNode[];
  masteries: MasteryState[];
  config: PlatformConfig;
  examDate: Date | null;
}): Promise<AttemptPriority[]> {
  const goal = await prisma.goal.findFirst({
    where: { enrollmentId: input.enrollmentId, active: true },
    orderBy: { createdAt: 'desc' },
    select: { targetLevel: true },
  });

  const enrollmentLevel = await prisma.enrollment.findUnique({
    where: { id: input.enrollmentId },
    select: { estimatedLevel: true },
  });
  const currentOrder = LEVEL_ORDER[enrollmentLevel?.estimatedLevel ?? 'WEAK'];
  const nextLevel =
    STUDENT_LEVELS.find((level) => LEVEL_ORDER[level] === Math.min(currentOrder + 1, STUDENT_LEVELS.length - 1)) ??
    'AVERAGE';
  const targetLevel = goal?.targetLevel ?? nextLevel;
  const targetMastery = input.config.levels.masteryTargets?.[targetLevel] ?? 0;

  const daysToExam = input.examDate
    ? Math.max(0, Math.round((input.examDate.getTime() - Date.now()) / 86_400_000))
    : null;

  const gaps = computeGapPriorities({
    skills: input.skills,
    masteries: input.masteries,
    targetMastery,
    daysToExam,
    config: input.config.recommendation,
  });

  const skillById = new Map(input.skills.map((skill) => [skill.id, skill]));
  return gaps.slice(0, REPORT_PRIORITY_COUNT).map((gap) => {
    const skill = skillById.get(gap.skillId);
    const tier = masteryTier(gap.masteryScore);
    return {
      skillId: gap.skillId,
      skillName: skill?.name ?? gap.skillId,
      chapterName: skill?.chapterName ?? '',
      masteryScore: Math.round(gap.masteryScore * 10) / 10,
      tier,
      tierLabel: MASTERY_TIER_LABEL[tier],
      priority: Math.round(gap.priority * 1000) / 1000,
      reason: gap.reason,
      blockedBySkillNames: gap.blockedBySkillIds.map((id) => skillById.get(id)?.name ?? id),
    };
  });
}

export async function getAttemptReport(attemptId: string, userId: string): Promise<AttemptReport> {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: gradingAttemptInclude,
  });
  if (!attempt) throw ApiError.notFound('Không tìm thấy bài làm.');
  assertOwnership(attempt, userId);
  if (attempt.status === 'IN_PROGRESS') {
    throw ApiError.conflict('Bài làm chưa được nộp nên chưa có báo cáo. Hãy nộp bài để xem kết quả.');
  }

  const config = await getConfig();
  const enrollment = attempt.enrollment;

  // Chấm lại từ chính các bản ghi ItemAttempt đã lưu: báo cáo luôn khớp dữ liệu
  // gốc, không phụ thuộc vào JSON tóm tắt có thể lệch phiên bản.
  const scored: ScoredAttemptItem[] = attempt.itemAttempts.map((row) => ({
    itemId: row.itemId,
    skillId: row.item.skillId,
    chapterId: row.item.chapterId,
    difficulty: row.item.difficulty,
    isCorrect: row.isCorrect ?? false,
    timeMs: row.timeMs,
    estimatedTimeSeconds: row.item.estimatedTime,
  }));
  const score = scoreAttempt(scored, config.levels);

  const summary =
    attempt.resultSummary && typeof attempt.resultSummary === 'object' && !Array.isArray(attempt.resultSummary)
      ? (attempt.resultSummary as Record<string, unknown>)
      : {};
  const warnings = parseStringArray(summary.selectionWarnings);
  const levelMessage = typeof summary.levelMessage === 'string' ? summary.levelMessage : '';

  const skills = await getSkillNodes({
    subject: enrollment.course.subject,
    gradeBand: enrollment.course.gradeBand,
  });
  const masteries = await getMasteryStates(enrollment.id);
  const masteryMap = await getMasteryMap(enrollment.id);
  const priorities = await buildPriorities({
    enrollmentId: enrollment.id,
    skills,
    masteries,
    config,
    examDate: enrollment.cohort?.examDate ?? null,
  });

  const skillNameById = new Map<string, { skillName: string; chapterName: string }>();
  const chapterNameById = new Map<string, string>();
  for (const row of attempt.itemAttempts) {
    skillNameById.set(row.item.skillId, {
      skillName: row.item.skill.name,
      chapterName: row.item.skill.chapter.name,
    });
    chapterNameById.set(row.item.chapterId, row.item.skill.chapter.name);
  }

  const errorCounts = new Map<ErrorPattern, number>();
  for (const row of attempt.itemAttempts) {
    if (!row.errorPattern) continue;
    errorCounts.set(row.errorPattern, (errorCounts.get(row.errorPattern) ?? 0) + 1);
  }

  const items: AttemptReportItem[] = attempt.itemAttempts.map((row) => ({
    itemAttemptId: row.id,
    itemId: row.itemId,
    itemCode: row.item.itemCode,
    orderIndex: row.orderIndex,
    skillId: row.item.skillId,
    skillName: row.item.skill.name,
    chapterId: row.item.chapterId,
    chapterName: row.item.skill.chapter.name,
    difficulty: row.item.difficulty,
    difficultyLabel: DIFFICULTY_LABEL[row.item.difficulty],
    questionType: row.item.questionType,
    stem: row.item.stem,
    stemImageUrl: row.item.stemImageUrl,
    options: parseOptions(row.item.options),
    answer: row.answer ?? null,
    correctAnswer: row.item.correctAnswer,
    isCorrect: row.isCorrect ?? false,
    timeMs: row.timeMs,
    estimatedTime: row.item.estimatedTime,
    solution: row.item.solution,
    solutionSteps: parseSolutionSteps(row.item.solutionSteps),
    errorPattern: row.errorPattern,
    errorPatternLabel: row.errorPattern ? ERROR_PATTERN_LABEL[row.errorPattern] : null,
  }));

  // Mức hiển thị đúng như tại thời điểm nộp bài — báo cáo cũ không được đổi
  // theo mức hiện tại của học sinh.
  const storedDisplayLevel =
    typeof summary.displayLevel === 'string' && (STUDENT_LEVELS as string[]).includes(summary.displayLevel)
      ? (summary.displayLevel as StudentLevel)
      : null;
  const displayLevel = storedDisplayLevel ?? attempt.estimatedLevel ?? score.estimatedLevel;

  return {
    attemptId: attempt.id,
    assessmentId: attempt.assessmentId,
    type: attempt.assessment.type,
    typeLabel: ASSESSMENT_TYPE_LABEL[attempt.assessment.type],
    cycleNo: attempt.cycleNo,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    totalTimeMs: attempt.totalTimeMs,
    totalMinutes: Math.round(attempt.totalTimeMs / 60_000),
    rawScore: score.rawScore,
    maxScore: score.maxScore,
    weightedScore: score.weightedScore,
    weightedMax: score.weightedMax,
    percent: score.percent,
    avgTimeRatio: score.avgTimeRatio,
    estimatedLevel: displayLevel,
    estimatedLevelLabel: levelLabelOf(displayLevel, config),
    levelMessage,
    bySkill: score.bySkill.map((entry) => ({
      skillId: entry.skillId,
      skillName: skillNameById.get(entry.skillId)?.skillName ?? entry.skillId,
      chapterName: skillNameById.get(entry.skillId)?.chapterName ?? '',
      correct: entry.correct,
      total: entry.total,
      accuracy: entry.accuracy,
      estimatedMastery: entry.estimatedMastery,
    })),
    byChapter: score.byChapter.map((entry) => ({
      chapterId: entry.chapterId,
      chapterName: chapterNameById.get(entry.chapterId) ?? entry.chapterId,
      correct: entry.correct,
      total: entry.total,
      accuracy: entry.accuracy,
    })),
    masteryMap,
    priorities,
    errorPatterns: [...errorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, REPORT_ERROR_PATTERN_COUNT)
      .map(([pattern, count]) => ({ pattern, label: ERROR_PATTERN_LABEL[pattern], count })),
    delta: parseDeltaSummary(attempt.deltaSummary),
    items,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Chu kỳ đánh giá (specs §10.3)
// ---------------------------------------------------------------------------

export async function getAssessmentStatus(enrollmentId: string): Promise<AssessmentStatus> {
  const config = await getConfig();
  const now = new Date();

  const [diagnostic, inProgress, lastSubmitted, progressDone] = await Promise.all([
    prisma.assessmentAttempt.findFirst({
      where: { enrollmentId, status: { in: [...SUBMITTED_STATUSES] }, assessment: { type: 'DIAGNOSTIC' } },
      orderBy: { submittedAt: 'desc' },
      select: { id: true, submittedAt: true },
    }),
    prisma.assessmentAttempt.findFirst({
      where: { enrollmentId, status: 'IN_PROGRESS' },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    }),
    prisma.assessmentAttempt.findFirst({
      where: { enrollmentId, status: { in: [...SUBMITTED_STATUSES] } },
      orderBy: { submittedAt: 'desc' },
      select: { submittedAt: true },
    }),
    prisma.assessmentAttempt.count({
      where: { enrollmentId, status: { in: [...SUBMITTED_STATUSES] }, assessment: { type: 'PROGRESS' } },
    }),
  ]);

  const lastAssessmentAt = lastSubmitted?.submittedAt ?? null;
  const nextDueAt = lastAssessmentAt ? addDays(lastAssessmentAt, config.assessment.cycleDays) : null;
  const graceUntil = nextDueAt ? addDays(nextDueAt, config.assessment.gracePeriodDays) : null;
  const isDue = nextDueAt !== null && now.getTime() >= nextDueAt.getTime();
  const isOverdue = graceUntil !== null && now.getTime() > graceUntil.getTime();
  const daysUntilDue = nextDueAt
    ? Math.ceil((nextDueAt.getTime() - now.getTime()) / 86_400_000)
    : null;

  let message: string;
  if (!diagnostic) {
    message = 'Bạn chưa làm bài kiểm tra đầu vào — đây là bước đầu tiên để hệ thống dựng lộ trình riêng cho bạn.';
  } else if (isOverdue) {
    message = `Bài kiểm tra tiến bộ đã quá hạn từ ngày ${formatDateVN(nextDueAt as Date)}. Hãy làm ngay để lộ trình bám đúng năng lực.`;
  } else if (isDue) {
    message = 'Đã đến hạn kiểm tra tiến bộ. Bài chỉ mất khoảng 20–30 phút và cho bạn thấy mình tiến bộ tới đâu.';
  } else {
    message = nextDueAt
      ? `Bài kiểm tra tiến bộ tiếp theo vào ngày ${formatDateVN(nextDueAt)}.`
      : 'Chưa có lịch kiểm tra tiến bộ.';
  }

  return {
    hasDiagnostic: diagnostic !== null,
    diagnosticAttemptId: diagnostic?.id ?? null,
    nextDueAt,
    isDue,
    isOverdue,
    graceUntil,
    currentCycleNo: progressDone + 1,
    lastAssessmentAt,
    daysUntilDue,
    inProgressAttemptId: inProgress?.id ?? null,
    message,
  };
}

export async function listAttempts(enrollmentId: string): Promise<AttemptListEntry[]> {
  const config = await getConfig();
  const attempts = await prisma.assessmentAttempt.findMany({
    where: { enrollmentId },
    orderBy: [{ startedAt: 'desc' }],
    include: {
      assessment: { select: { type: true } },
      _count: { select: { itemAttempts: true } },
    },
  });

  return attempts.map((attempt) => {
    const summary =
      attempt.resultSummary && typeof attempt.resultSummary === 'object' && !Array.isArray(attempt.resultSummary)
        ? (attempt.resultSummary as Record<string, unknown>)
        : {};
    const percent =
      typeof summary.percent === 'number'
        ? summary.percent
        : attempt.maxScore > 0
          ? Math.round((attempt.rawScore / attempt.maxScore) * 1000) / 10
          : 0;
    const delta = parseDeltaSummary(attempt.deltaSummary);

    return {
      attemptId: attempt.id,
      assessmentId: attempt.assessmentId,
      type: attempt.assessment.type,
      typeLabel: ASSESSMENT_TYPE_LABEL[attempt.assessment.type],
      cycleNo: attempt.cycleNo,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      rawScore: attempt.rawScore,
      maxScore: attempt.maxScore,
      weightedScore: attempt.weightedScore,
      percent,
      estimatedLevel: attempt.estimatedLevel,
      estimatedLevelLabel: attempt.estimatedLevel ? levelLabelOf(attempt.estimatedLevel, config) : null,
      totalTimeMs: attempt.totalTimeMs,
      itemCount: attempt._count.itemAttempts,
      averageDelta: delta?.averageDelta ?? null,
    };
  });
}
