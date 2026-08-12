/**
 * HỒ SƠ NĂNG LỰC HỌC SINH (Student Model) — specs §7.2, §9.2 màn 7 & 11, §10.1.
 *
 * Đây là lớp duy nhất được phép đọc/ghi `StudentSkillMastery` và
 * `MasterySnapshot`. Mọi module khác (assessment, learning, teacher, AI) đi qua
 * các hàm ở đây để hồ sơ luôn nhất quán với engine.
 *
 * Ba ràng buộc nghiệp vụ không được phá:
 *  1. Lưu đủ MỌI skill của khóa, kể cả skill chưa có dữ liệu (confidence = 0).
 *  2. Mastery cập nhật sau MỖI câu, không đợi nộp hết bài.
 *  3. Không "nhảy level" sau một bài — phải đủ độ tin cậy và số lượt (§10.1).
 */
import { Prisma } from '@prisma/client';
import type {
  Enrollment,
  GradeBand,
  MasteryTrigger,
  StudentLevel,
  StudentSkillMastery,
  Subject,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';
import { getConfig, type LevelConfig } from '@/lib/config';
import {
  ERROR_PATTERN_LABEL,
  LEVEL_LABEL,
  LEVEL_ORDER,
  MASTERY_TIER_LABEL,
  STUDENT_LEVELS,
  masteryTier,
  type MasteryTier,
} from '@/lib/domain';
import { addDays } from '@/lib/dates';
import {
  averageMastery,
  createInitialMastery,
  updateMastery,
  type AttemptEvent,
  type MasteryState,
  type MasteryUpdate,
  type SkillNode,
} from '@/engine';

/**
 * Cho phép chạy trong transaction của lớp gọi (nộp bài phải nguyên tử).
 * `prisma` cũng khớp kiểu này nên mặc định vẫn dùng client toàn cục.
 */
type Db = Prisma.TransactionClient;

/** Số câu ví dụ kèm theo mỗi loại lỗi trong báo cáo giáo viên (specs §9.3). */
const ERROR_EXAMPLE_LIMIT = 3;

// ---------------------------------------------------------------------------
// Kiểu dữ liệu công khai
// ---------------------------------------------------------------------------

export interface MasteryMapSkill {
  skillId: string;
  skillName: string;
  chapterId: string;
  chapterName: string;
  masteryScore: number;
  confidence: number;
  tier: MasteryTier;
  tierLabel: string;
  attemptCount: number;
  lastPracticedAt: Date | null;
}

export interface MasteryMapChapter {
  chapterId: string;
  chapterName: string;
  averageMastery: number;
  tier: MasteryTier;
  tierLabel: string;
  skills: MasteryMapSkill[];
}

export interface MasteryMap {
  chapters: MasteryMapChapter[];
  /** Mastery trung bình có trọng số blueprint (0–100). */
  overall: number;
  strongest: MasteryMapSkill | null;
  weakest: MasteryMapSkill | null;
}

export interface MasteryDeltaSkill {
  skillId: string;
  skillName: string;
  chapterName: string;
  before: number;
  after: number;
  delta: number;
}

export interface MasteryDeltaResult {
  bySkill: MasteryDeltaSkill[];
  averageBefore: number;
  averageAfter: number;
  averageDelta: number;
  /** Mốc so sánh; null khi mới có đúng một lần chụp hồ sơ. */
  capturedBefore: Date | null;
  capturedAfter: Date | null;
  /** true khi chưa có mốc trước để so — UI phải nói rõ "chưa có dữ liệu so sánh". */
  isFirstSnapshot: boolean;
}

export interface MasteryDeltaOptions {
  /** Chỉ so giữa các lần chụp cùng loại (vd chỉ giữa các bài 14 ngày). */
  trigger?: MasteryTrigger;
  /** So với lần chụp ĐẦU TIÊN (baseline) thay vì lần liền trước. */
  againstBaseline?: boolean;
  /** Giới hạn số skill trả về, sắp theo mức thay đổi giảm dần. */
  limit?: number;
}

export interface ErrorPatternStat {
  pattern: string;
  count: number;
  label: string;
  exampleItemIds: string[];
}

export interface LevelDecision {
  level: StudentLevel;
  changed: boolean;
  reasonCode: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Tiện ích nội bộ
// ---------------------------------------------------------------------------

type EnrollmentWithCourse = Enrollment & { course: { subject: Subject; gradeBand: GradeBand } };

async function loadEnrollment(enrollmentId: string, db: Db = prisma): Promise<EnrollmentWithCourse> {
  const enrollment = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { course: { select: { subject: true, gradeBand: true } } },
  });
  if (!enrollment) throw ApiError.notFound('Không tìm thấy khóa học đã đăng ký.');
  return enrollment as EnrollmentWithCourse;
}

const skillInclude = {
  chapter: { select: { id: true, name: true, order: true, blueprintWeight: true } },
  prerequisites: { select: { prerequisiteSkillId: true } },
} as const;

type SkillRow = Prisma.SkillGetPayload<{ include: typeof skillInclude }>;

async function loadSkillRows(subject: Subject, gradeBand: GradeBand, db: Db = prisma): Promise<SkillRow[]> {
  return db.skill.findMany({
    where: { chapter: { subject, gradeBand } },
    include: skillInclude,
    orderBy: [{ chapter: { order: 'asc' } }, { order: 'asc' }, { code: 'asc' }],
  });
}

/**
 * Trọng số của skill trong blueprint = trọng số skill × trọng số chương.
 * Hổng một skill thuộc chương nặng phải kéo ưu tiên lên mạnh hơn skill cùng
 * điểm nhưng thuộc chương phụ.
 */
function skillWeight(row: SkillRow): number {
  const own = row.blueprintWeight > 0 ? row.blueprintWeight : 1;
  const chapter = row.chapter.blueprintWeight > 0 ? row.chapter.blueprintWeight : 1;
  return own * chapter;
}

function toSkillNode(row: SkillRow): SkillNode {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    chapterId: row.chapterId,
    chapterName: row.chapter.name,
    blueprintWeight: skillWeight(row),
    order: row.order,
    prerequisiteIds: row.prerequisites.map((p) => p.prerequisiteSkillId),
  };
}

function parseErrorCounts(raw: Prisma.JsonValue): Record<string, number> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) out[key] = value;
  }
  return out;
}

export function toMasteryState(row: StudentSkillMastery): MasteryState {
  return {
    skillId: row.skillId,
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
    errorCounts: parseErrorCounts(row.errorPattern),
  };
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Taxonomy cho engine
// ---------------------------------------------------------------------------

export async function getSkillNodes(input: { subject: Subject; gradeBand: GradeBand }): Promise<SkillNode[]> {
  const rows = await loadSkillRows(input.subject, input.gradeBand);
  return rows.map(toSkillNode);
}

// ---------------------------------------------------------------------------
// Đọc / ghi hồ sơ
// ---------------------------------------------------------------------------

/**
 * Tạo đủ bản ghi mastery cho MỌI skill của khóa (specs §7.2).
 * Skill chưa có dữ liệu vẫn phải tồn tại với confidence = 0, nếu không engine
 * sẽ tưởng chương đó không nằm trong chương trình và không bao giờ giao bài.
 */
export async function ensureMasteryRows(enrollmentId: string, db: Db = prisma): Promise<void> {
  const enrollment = await loadEnrollment(enrollmentId, db);
  const skills = await db.skill.findMany({
    where: { chapter: { subject: enrollment.course.subject, gradeBand: enrollment.course.gradeBand } },
    select: { id: true },
  });
  if (skills.length === 0) return;

  const existing = await db.studentSkillMastery.findMany({
    where: { enrollmentId },
    select: { skillId: true },
  });
  const known = new Set(existing.map((row) => row.skillId));
  const missing = skills.filter((skill) => !known.has(skill.id));
  if (missing.length === 0) return;

  await db.studentSkillMastery.createMany({
    data: missing.map((skill) => ({ enrollmentId, skillId: skill.id })),
    skipDuplicates: true,
  });
}

export async function getMasteryStates(enrollmentId: string, db: Db = prisma): Promise<MasteryState[]> {
  const rows = await db.studentSkillMastery.findMany({
    where: { enrollmentId },
    orderBy: { skillId: 'asc' },
  });
  return rows.map(toMasteryState);
}

/**
 * Ghi hồ sơ xuống DB. Ghi tuần tự (không dùng $transaction lồng) để hàm chạy
 * được cả khi lớp gọi đã mở transaction của riêng nó.
 */
export async function saveMasteryStates(
  enrollmentId: string,
  states: MasteryState[],
  db: Db = prisma,
): Promise<void> {
  for (const state of states) {
    const data = {
      masteryScore: state.masteryScore,
      confidence: state.confidence,
      attemptCount: state.attemptCount,
      correctCount: state.correctCount,
      recentAccuracy: state.recentAccuracy,
      recentResults: state.recentResults,
      avgTimeRatio: state.avgTimeRatio,
      errorPattern: state.errorCounts as Prisma.InputJsonValue,
      difficultyCeiling: state.difficultyCeiling,
      consecutiveCorrect: state.consecutiveCorrect,
      consecutiveWrong: state.consecutiveWrong,
      lastPracticedAt: state.lastPracticedAt,
    };
    await db.studentSkillMastery.upsert({
      where: { enrollmentId_skillId: { enrollmentId, skillId: state.skillId } },
      create: { enrollmentId, skillId: state.skillId, ...data },
      update: data,
    });
  }
}

/**
 * Cập nhật hồ sơ sau MỘT câu trả lời và trả kết quả để hiển thị phản hồi tức
 * thì cho học sinh (specs §9.2 — "đúng, chậm" khác "đúng, nhanh").
 */
export async function applyAttempt(input: {
  enrollmentId: string;
  skillId: string;
  event: AttemptEvent;
}): Promise<MasteryUpdate> {
  const config = await getConfig();
  const row = await prisma.studentSkillMastery.findUnique({
    where: { enrollmentId_skillId: { enrollmentId: input.enrollmentId, skillId: input.skillId } },
  });
  const prev = row ? toMasteryState(row) : createInitialMastery(input.skillId);
  const update = updateMastery(prev, input.event, config.recommendation);
  await saveMasteryStates(input.enrollmentId, [update.next]);
  return update;
}

/** Chụp hồ sơ làm mốc lịch sử — nguồn duy nhất để tính delta (specs §7.10). */
export async function snapshotMastery(
  enrollmentId: string,
  trigger: MasteryTrigger,
  db: Db = prisma,
): Promise<void> {
  const rows = await db.studentSkillMastery.findMany({
    where: { enrollmentId },
    select: { skillId: true, masteryScore: true, confidence: true },
  });
  if (rows.length === 0) return;

  // Một mốc thời gian duy nhất cho cả lô: delta so sánh theo capturedAt.
  const capturedAt = new Date();
  await db.masterySnapshot.createMany({
    data: rows.map((row) => ({
      enrollmentId,
      skillId: row.skillId,
      masteryScore: row.masteryScore,
      confidence: row.confidence,
      trigger,
      capturedAt,
    })),
  });
}

// ---------------------------------------------------------------------------
// Delta (specs §7.10 — kết quả bắt buộc có delta, không chỉ điểm tuyệt đối)
// ---------------------------------------------------------------------------

export async function getMasteryDelta(
  enrollmentId: string,
  options: MasteryDeltaOptions = {},
  db: Db = prisma,
): Promise<MasteryDeltaResult> {
  const where = {
    enrollmentId,
    ...(options.trigger ? { trigger: options.trigger } : {}),
  };

  const latest = await db.masterySnapshot.groupBy({
    by: ['capturedAt'],
    where,
    orderBy: { capturedAt: 'desc' },
    take: 2,
  });

  const empty: MasteryDeltaResult = {
    bySkill: [],
    averageBefore: 0,
    averageAfter: 0,
    averageDelta: 0,
    capturedBefore: null,
    capturedAfter: null,
    isFirstSnapshot: true,
  };
  if (latest.length === 0) return empty;

  const capturedAfter = latest[0].capturedAt;
  let capturedBefore: Date | null = latest[1]?.capturedAt ?? null;

  if (options.againstBaseline) {
    const first = await db.masterySnapshot.groupBy({
      by: ['capturedAt'],
      where,
      orderBy: { capturedAt: 'asc' },
      take: 1,
    });
    const baseline = first[0]?.capturedAt ?? null;
    capturedBefore =
      baseline && baseline.getTime() !== capturedAfter.getTime() ? baseline : capturedBefore;
  }

  const times = capturedBefore ? [capturedBefore, capturedAfter] : [capturedAfter];
  const rows = await db.masterySnapshot.findMany({
    where: { enrollmentId, capturedAt: { in: times } },
    include: { skill: { select: { id: true, name: true, chapter: { select: { name: true } } } } },
  });

  const beforeBySkill = new Map<string, number>();
  const afterBySkill = new Map<string, number>();
  const nameBySkill = new Map<string, { skillName: string; chapterName: string }>();

  for (const row of rows) {
    nameBySkill.set(row.skillId, {
      skillName: row.skill.name,
      chapterName: row.skill.chapter.name,
    });
    if (row.capturedAt.getTime() === capturedAfter.getTime()) {
      afterBySkill.set(row.skillId, row.masteryScore);
    } else if (capturedBefore && row.capturedAt.getTime() === capturedBefore.getTime()) {
      beforeBySkill.set(row.skillId, row.masteryScore);
    }
  }

  const bySkill: MasteryDeltaSkill[] = [];
  let sumBefore = 0;
  let sumAfter = 0;
  for (const [skillId, after] of afterBySkill) {
    // Không có mốc trước → coi như đứng yên, KHÔNG quy về 0 để tránh delta ảo.
    const before = capturedBefore ? beforeBySkill.get(skillId) ?? 0 : after;
    const names = nameBySkill.get(skillId);
    bySkill.push({
      skillId,
      skillName: names?.skillName ?? skillId,
      chapterName: names?.chapterName ?? '',
      before: round(before),
      after: round(after),
      delta: round(after - before),
    });
    sumBefore += before;
    sumAfter += after;
  }

  bySkill.sort((a, b) => b.delta - a.delta || a.skillName.localeCompare(b.skillName, 'vi'));
  const count = bySkill.length;
  const averageBefore = count > 0 ? round(sumBefore / count) : 0;
  const averageAfter = count > 0 ? round(sumAfter / count) : 0;

  return {
    bySkill: options.limit && options.limit > 0 ? bySkill.slice(0, options.limit) : bySkill,
    averageBefore,
    averageAfter,
    averageDelta: round(averageAfter - averageBefore),
    capturedBefore,
    capturedAfter,
    isFirstSnapshot: capturedBefore === null,
  };
}

// ---------------------------------------------------------------------------
// Bản đồ năng lực (radar "Mạnh – Ổn – Cần củng cố – Hổng")
// ---------------------------------------------------------------------------

export async function getMasteryMap(enrollmentId: string): Promise<MasteryMap> {
  const enrollment = await loadEnrollment(enrollmentId);
  const skillRows = await loadSkillRows(enrollment.course.subject, enrollment.course.gradeBand);
  const masteryRows = await prisma.studentSkillMastery.findMany({ where: { enrollmentId } });
  const bySkill = new Map(masteryRows.map((row) => [row.skillId, row]));

  const chapters = new Map<string, MasteryMapChapter>();
  const allSkills: MasteryMapSkill[] = [];

  for (const row of skillRows) {
    const mastery = bySkill.get(row.id);
    const score = mastery?.masteryScore ?? 0;
    const tier = masteryTier(score);
    const entry: MasteryMapSkill = {
      skillId: row.id,
      skillName: row.name,
      chapterId: row.chapterId,
      chapterName: row.chapter.name,
      masteryScore: round(score),
      confidence: round(mastery?.confidence ?? 0, 2),
      tier,
      tierLabel: MASTERY_TIER_LABEL[tier],
      attemptCount: mastery?.attemptCount ?? 0,
      lastPracticedAt: mastery?.lastPracticedAt ?? null,
    };
    allSkills.push(entry);

    const chapter = chapters.get(row.chapterId);
    if (chapter) chapter.skills.push(entry);
    else {
      chapters.set(row.chapterId, {
        chapterId: row.chapterId,
        chapterName: row.chapter.name,
        averageMastery: 0,
        tier: 'GAP',
        tierLabel: MASTERY_TIER_LABEL.GAP,
        skills: [entry],
      });
    }
  }

  for (const chapter of chapters.values()) {
    const total = chapter.skills.reduce((sum, skill) => sum + skill.masteryScore, 0);
    chapter.averageMastery = chapter.skills.length > 0 ? round(total / chapter.skills.length) : 0;
    chapter.tier = masteryTier(chapter.averageMastery);
    chapter.tierLabel = MASTERY_TIER_LABEL[chapter.tier];
  }

  const states = masteryRows.map(toMasteryState);
  const overall = round(averageMastery(states, skillRows.map(toSkillNode)));

  // Chỉ xếp hạng skill đã có bằng chứng: skill chưa đo không phải "yếu nhất".
  const measured = allSkills.filter((skill) => skill.attemptCount > 0);
  const ranked = (measured.length > 0 ? measured : allSkills)
    .slice()
    .sort((a, b) => a.masteryScore - b.masteryScore);

  return {
    chapters: [...chapters.values()],
    overall,
    strongest: ranked.length > 0 ? ranked[ranked.length - 1] : null,
    weakest: ranked.length > 0 ? ranked[0] : null,
  };
}

// ---------------------------------------------------------------------------
// Lỗi lặp lại & hoạt động gần đây
// ---------------------------------------------------------------------------

export async function getTopErrorPatterns(
  enrollmentId: string,
  limit: number,
): Promise<ErrorPatternStat[]> {
  const take = Math.max(1, Math.floor(limit));
  const grouped = await prisma.itemAttempt.groupBy({
    by: ['errorPattern'],
    where: { enrollmentId, errorPattern: { not: null }, isCorrect: false },
    _count: { _all: true },
  });

  const sorted = grouped
    .filter((row) => row.errorPattern !== null)
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, take);

  const stats: ErrorPatternStat[] = [];
  for (const row of sorted) {
    const pattern = row.errorPattern;
    if (!pattern) continue;
    const examples = await prisma.itemAttempt.findMany({
      where: { enrollmentId, errorPattern: pattern, isCorrect: false },
      select: { itemId: true },
      orderBy: { createdAt: 'desc' },
      distinct: ['itemId'],
      take: ERROR_EXAMPLE_LIMIT,
    });
    stats.push({
      pattern,
      count: row._count._all,
      label: ERROR_PATTERN_LABEL[pattern],
      exampleItemIds: examples.map((example) => example.itemId),
    });
  }
  return stats;
}

/**
 * Skill đã luyện trong N ngày gần đây — nguồn cho block Khởi động và cho phần
 * "kỹ năng đã luyện" của bài 14 ngày. Lấy từ cả hồ sơ (nhanh) lẫn lịch sử làm
 * bài (chính xác khi hồ sơ chưa kịp cập nhật).
 */
export async function getRecentSkillIds(enrollmentId: string, days: number): Promise<string[]> {
  const window = Math.max(1, Math.floor(days));
  const since = addDays(new Date(), -window);

  const practiced = await prisma.studentSkillMastery.findMany({
    where: { enrollmentId, lastPracticedAt: { gte: since } },
    select: { skillId: true },
  });
  const skillIds = new Set(practiced.map((row) => row.skillId));

  const attempts = await prisma.itemAttempt.findMany({
    where: { enrollmentId, createdAt: { gte: since }, answeredAt: { not: null } },
    select: { itemId: true, item: { select: { skillId: true } } },
    distinct: ['itemId'],
  });
  for (const attempt of attempts) skillIds.add(attempt.item.skillId);

  return [...skillIds];
}

// ---------------------------------------------------------------------------
// Mức năng lực hiển thị (specs §10.1)
// ---------------------------------------------------------------------------

/** Mức cao nhất mà mastery trung bình đã vượt ngưỡng `masteryTargets`. */
export function levelFromMastery(average: number, levelConfig: LevelConfig): StudentLevel {
  const sorted = [...STUDENT_LEVELS].sort(
    (a, b) =>
      (levelConfig.masteryTargets?.[a] ?? 0) - (levelConfig.masteryTargets?.[b] ?? 0) ||
      LEVEL_ORDER[a] - LEVEL_ORDER[b],
  );
  let result: StudentLevel = sorted[0] ?? 'WEAK';
  for (const level of sorted) {
    if (average >= (levelConfig.masteryTargets?.[level] ?? 0)) result = level;
  }
  return result;
}

function levelLabel(level: StudentLevel, levelConfig: LevelConfig): string {
  return levelConfig.labels?.[level] ?? LEVEL_LABEL[level];
}

/**
 * Quyết định có đổi mức hiển thị hay không (specs §10.1).
 * Ba chốt chặn: chưa đủ độ tin cậy, chưa đủ số lượt, và mỗi lần chỉ dịch một
 * bậc — để một bài may mắn không đẩy học sinh từ Kém lên Giỏi.
 */
export function decideLevelChange(input: {
  currentLevel: StudentLevel | null;
  candidateLevel: StudentLevel;
  masteries: MasteryState[];
  levelConfig: LevelConfig;
}): LevelDecision {
  const { currentLevel, candidateLevel, masteries, levelConfig } = input;

  if (!currentLevel) {
    return {
      level: candidateLevel,
      changed: true,
      reasonCode: 'LEVEL_INITIAL',
      message: `Mức khởi tạo từ bài kiểm tra: ${levelLabel(candidateLevel, levelConfig)}.`,
    };
  }
  if (candidateLevel === currentLevel) {
    return {
      level: currentLevel,
      changed: false,
      reasonCode: 'LEVEL_UNCHANGED',
      message: `Giữ nguyên mức ${levelLabel(currentLevel, levelConfig)}.`,
    };
  }

  const measured = masteries.filter((state) => state.attemptCount > 0);
  const totalAttempts = masteries.reduce((sum, state) => sum + state.attemptCount, 0);
  const avgConfidence =
    measured.length > 0
      ? measured.reduce((sum, state) => sum + state.confidence, 0) / measured.length
      : 0;

  if (avgConfidence < levelConfig.minConfidenceForLevelChange) {
    return {
      level: currentLevel,
      changed: false,
      reasonCode: 'LEVEL_HOLD_LOW_CONFIDENCE',
      message:
        'Dữ liệu chưa đủ ổn định để đổi mức đánh giá — hệ thống giữ nguyên mức hiện tại và tiếp tục theo dõi.',
    };
  }
  if (totalAttempts < levelConfig.minAttemptsForLevelChange) {
    return {
      level: currentLevel,
      changed: false,
      reasonCode: 'LEVEL_HOLD_FEW_ATTEMPTS',
      message: `Cần thêm bài luyện (đã có ${totalAttempts}/${levelConfig.minAttemptsForLevelChange} lượt) trước khi đổi mức đánh giá.`,
    };
  }

  // Chỉ dịch một bậc mỗi lần — không nhảy level sau một bài.
  const step = LEVEL_ORDER[candidateLevel] > LEVEL_ORDER[currentLevel] ? 1 : -1;
  const nextOrder = LEVEL_ORDER[currentLevel] + step;
  const level = STUDENT_LEVELS.find((value) => LEVEL_ORDER[value] === nextOrder) ?? currentLevel;

  return {
    level,
    changed: level !== currentLevel,
    reasonCode: step > 0 ? 'LEVEL_UP' : 'LEVEL_DOWN',
    message:
      step > 0
        ? `Mức đánh giá tăng lên ${levelLabel(level, levelConfig)}.`
        : `Mức đánh giá điều chỉnh về ${levelLabel(level, levelConfig)} để lộ trình bám đúng năng lực hiện tại.`,
  };
}

/**
 * Mức hiển thị hiện tại của học sinh. Không đổi mức khi độ tin cậy trung bình
 * hoặc tổng số lượt chưa đạt ngưỡng cấu hình (specs §10.1).
 */
export async function getEstimatedLevel(enrollmentId: string): Promise<StudentLevel> {
  const config = await getConfig();
  const enrollment = await loadEnrollment(enrollmentId);
  const skillRows = await loadSkillRows(enrollment.course.subject, enrollment.course.gradeBand);
  const states = await getMasteryStates(enrollmentId);

  const totalAttempts = states.reduce((sum, state) => sum + state.attemptCount, 0);
  if (totalAttempts === 0) {
    // Chưa có bằng chứng nào: mức tự khai chỉ để khởi tạo, không phải kết luận.
    return enrollment.estimatedLevel ?? enrollment.selfDeclaredLevel ?? 'WEAK';
  }

  const average = averageMastery(states, skillRows.map(toSkillNode));
  const candidate = levelFromMastery(average, config.levels);
  return decideLevelChange({
    currentLevel: enrollment.estimatedLevel,
    candidateLevel: candidate,
    masteries: states,
    levelConfig: config.levels,
  }).level;
}
