/**
 * NGHIỆP VỤ THI THỬ + CHẤM ĐIỂM AI.
 *
 * Route handler mỏng, mọi quyết định nằm ở đây (giống các service khác của dự án).
 *
 * BA LUẬT CỦA FILE NÀY:
 *  1. Đề gửi ra cho người đang làm bài TUYỆT ĐỐI không kèm `answerKey`,
 *     `solutionMd` hay barem. Chỉ `getAttemptResult` — tức là sau khi đã nộp —
 *     mới được trả ba thứ đó.
 *  2. Điểm phần trắc nghiệm/đáp số do code chấm, chấm ngay lúc nộp, không chờ AI.
 *  3. Một câu tự luận chấm hỏng KHÔNG được làm hỏng cả bài: câu đó mang trạng
 *     thái FAILED kèm lý do, học sinh bấm "Chấm lại câu này".
 */
import { Prisma } from '@prisma/client';
import type { MockAnswerStatus, MockExamAnswer, MockGradingMode, MockPart } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';
import { getConfigGroup } from '@/lib/config';
import { hasRole, type SessionUser } from '@/lib/auth';
import { autoGrade } from './auto-grade';
import { gradeEssayAnswer, MOCK_PROMPT_VERSION, type RubricCriterion } from './essay-grade';
import { AiProviderError, resolveProvider, type VisionImage } from './ai-provider';
import type { AnswerInput } from './schemas';

// ---------------------------------------------------------------------------
// Kiểu dữ liệu trả ra
// ---------------------------------------------------------------------------

export interface ExamSummary {
  slug: string;
  title: string;
  subject: string | null;
  gradeLevel: string | null;
  durationMin: number;
  totalPoints: number;
  questionCount: number;
  essayCount: number;
}

export interface PlayerQuestion {
  id: string;
  number: number;
  part: MockPart;
  gradingMode: MockGradingMode;
  maxPoints: number;
  promptMd: string;
  imageUrl: string | null;
  options: string[];
  /** Chỉ phần cấu hình KHÔNG lộ đáp án: chữ số cho câu biểu thức, kích thước lưới. */
  config: Record<string, unknown>;
}

export interface ExamForPlayer extends ExamSummary {
  id: string;
  instructions: string | null;
  questions: PlayerQuestion[];
  ai: AiStatus;
}

export interface AiStatus {
  live: boolean;
  demo: boolean;
  label: string;
  model: string;
}

export interface ResultCriterion {
  code: string;
  points: number;
  awarded: number;
  evidence: string;
  reason: string;
}

export interface ResultAnswer {
  id: string;
  questionId: string;
  number: number;
  part: MockPart;
  gradingMode: MockGradingMode;
  promptMd: string;
  options: string[];
  maxPoints: number;
  status: MockAnswerStatus;
  answerText: string | null;
  answerGrid: (string | null)[][] | null;
  imageUrls: string[];
  transcriptMd: string | null;
  awarded: number | null;
  confidence: number | null;
  needsReview: boolean;
  feedbackVi: string | null;
  criteria: ResultCriterion[];
  gradeDetail: Record<string, unknown> | null;
  errorMsg: string | null;
  overridden: boolean;
  /** Chỉ có sau khi nộp bài. */
  solutionMd: string | null;
  answerKeyDisplay: string | null;
  rubric: RubricCriterion[];
}

export interface AttemptResult {
  id: string;
  examSlug: string;
  examTitle: string;
  status: 'GRADING' | 'DONE' | 'PARTIAL_FAILED';
  startedAt: string;
  submittedAt: string | null;
  totalPoints: number;
  autoScore: number;
  finalScore: number | null;
  /** Điểm hiển thị: có sửa tay thì lấy điểm sửa. */
  score: number;
  breakdown: { part: MockPart; label: string; awarded: number; total: number }[];
  answers: ResultAnswer[];
  pendingCount: number;
  failedCount: number;
  needsReviewCount: number;
  canOverride: boolean;
  ai: AiStatus;
}

export const PART_LABEL: Record<MockPart, string> = {
  MCQ: 'Trắc nghiệm',
  SHORT: 'Trả lời ngắn',
  ESSAY: 'Tự luận',
};

// ---------------------------------------------------------------------------
// Đọc đề
// ---------------------------------------------------------------------------

function toStringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

function toRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Lọc `config` trước khi gửi xuống trình duyệt.
 *
 * Với hai kiểu câu dưới đây, cấu hình đã nằm sẵn trong đề bài (đề đã ghi rõ
 * "dùng chữ số 2, 4, 8 tạo ra số 2", "lưới 4×4") nên gửi đi không lộ gì thêm —
 * nhưng vẫn phải liệt kê từng khóa, không bao giờ đổ nguyên cục JSON, vì mai
 * này ai đó thêm `answer` vào config là lộ đáp án mà không ai biết.
 */
function publicConfig(mode: MockGradingMode, config: Record<string, unknown>): Record<string, unknown> {
  if (mode === 'EXPRESSION') {
    return {
      digits: config.digits ?? [],
      target: config.target ?? null,
      tolerance: config.tolerance ?? null,
      max_length: config.max_length ?? null,
    };
  }
  if (mode === 'GRID') {
    return {
      rows: config.rows ?? null,
      cols: config.cols ?? null,
      cell_states: config.cell_states ?? ['/', '\\'],
      labels: config.labels ?? null,
      prefilled: config.prefilled ?? {},
    };
  }
  return {};
}

export function aiStatus(): AiStatus {
  const provider = resolveProvider();
  return {
    live: provider.live,
    demo: provider.demo,
    label: provider.label,
    model: provider.gradeModel,
  };
}

export async function listPublishedExams(): Promise<ExamSummary[]> {
  const exams = await prisma.mockExam.findMany({
    where: { isPublished: true },
    orderBy: { createdAt: 'asc' },
    include: { questions: { select: { gradingMode: true } } },
  });

  return exams.map((exam) => ({
    slug: exam.slug,
    title: exam.title,
    subject: exam.subject,
    gradeLevel: exam.gradeLevel,
    durationMin: exam.durationMin,
    totalPoints: exam.totalPoints,
    questionCount: exam.questions.length,
    essayCount: exam.questions.filter((q) => q.gradingMode === 'ESSAY').length,
  }));
}

/** Đề để LÀM BÀI — đã bóc sạch đáp án, lời giải và barem. */
export async function getExamForPlayer(slug: string): Promise<ExamForPlayer> {
  const exam = await prisma.mockExam.findUnique({
    where: { slug },
    include: { questions: { orderBy: { number: 'asc' } } },
  });

  if (!exam || !exam.isPublished) {
    throw ApiError.notFound('Không tìm thấy đề thi này.');
  }

  return {
    id: exam.id,
    slug: exam.slug,
    title: exam.title,
    subject: exam.subject,
    gradeLevel: exam.gradeLevel,
    durationMin: exam.durationMin,
    totalPoints: exam.totalPoints,
    instructions: exam.instructions,
    questionCount: exam.questions.length,
    essayCount: exam.questions.filter((q) => q.gradingMode === 'ESSAY').length,
    questions: exam.questions.map((q) => ({
      id: q.id,
      number: q.number,
      part: q.part,
      gradingMode: q.gradingMode,
      maxPoints: q.maxPoints,
      promptMd: q.promptMd,
      imageUrl: q.imageUrl,
      options: toStringArray(q.options),
      config: publicConfig(q.gradingMode, toRecord(q.config)),
    })),
    ai: aiStatus(),
  };
}

// ---------------------------------------------------------------------------
// Nộp bài
// ---------------------------------------------------------------------------

export interface SubmitOutcome {
  attemptId: string;
  totalPoints: number;
  autoScore: number;
  /** Các câu tự luận cần trình duyệt gọi chấm song song. */
  pending: { questionId: string; number: number; maxPoints: number }[];
  /** Số lời gọi chấm chạy cùng lúc — cấu hình ở nhóm `mockExam`, không viết cứng trong UI. */
  parallelLimit: number;
  ai: AiStatus;
}

function normalizeGrid(value: unknown): (string | null)[][] | null {
  if (!Array.isArray(value)) return null;
  const rows: (string | null)[][] = [];
  for (const row of value) {
    if (!Array.isArray(row)) return null;
    rows.push(row.map((cell) => (typeof cell === 'string' && cell !== '' ? cell : null)));
  }
  return rows.length > 0 ? rows : null;
}

/**
 * Tạo bài làm và chấm ngay toàn bộ phần máy chấm được.
 *
 * Câu tự luận KHÔNG chấm ở đây: một lời gọi vision mất 15–40 giây, mười câu là
 * chắc chắn hết giờ HTTP. Chúng được để trạng thái PENDING và trình duyệt gọi
 * `/grade` song song từng câu (spec §2) — vừa không cần dựng hàng đợi, vừa có
 * thanh tiến độ để nhìn.
 */
export async function submitMockAttempt(input: {
  slug: string;
  userId: string | null;
  startedAt?: string;
  answers: AnswerInput[];
}): Promise<SubmitOutcome> {
  const config = await getConfigGroup('mockExam');

  const exam = await prisma.mockExam.findUnique({
    where: { slug: input.slug },
    include: { questions: { orderBy: { number: 'asc' } } },
  });
  if (!exam || !exam.isPublished) throw ApiError.notFound('Không tìm thấy đề thi này.');

  const byNumber = new Map(input.answers.map((a) => [a.number, a]));

  // Ảnh phải có thật trong kho trước khi ghi vào bài làm.
  const claimedUrls = input.answers.flatMap((a) => a.imageUrls ?? []);
  const uploadIds = claimedUrls.map((url) => url.split('/').pop()!);
  const knownUploads =
    uploadIds.length > 0
      ? await prisma.mockExamUpload.findMany({
          where: { id: { in: uploadIds } },
          select: { id: true },
        })
      : [];
  const knownIds = new Set(knownUploads.map((u) => u.id));

  const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();
  const validStart =
    Number.isFinite(startedAt.getTime()) && startedAt.getTime() <= Date.now()
      ? startedAt
      : new Date();

  const attempt = await prisma.mockExamAttempt.create({
    data: {
      examId: exam.id,
      userId: input.userId,
      status: 'GRADING',
      startedAt: validStart,
      submittedAt: new Date(),
      totalPoints: exam.totalPoints,
    },
  });

  const pending: SubmitOutcome['pending'] = [];
  const rows: Prisma.MockExamAnswerUncheckedCreateInput[] = [];

  for (const question of exam.questions) {
    const given = byNumber.get(question.number);
    const imageUrls = (given?.imageUrls ?? []).filter((url) =>
      knownIds.has(url.split('/').pop()!),
    );
    const answerText = given?.text?.trim() ? given.text.trim() : null;
    const answerGrid = normalizeGrid(given?.grid);

    const data: Prisma.MockExamAnswerUncheckedCreateInput = {
      attemptId: attempt.id,
      questionId: question.id,
      answerText,
      answerJson: (answerGrid ?? undefined) as Prisma.InputJsonValue | undefined,
      imageUrls: imageUrls.slice(0, config.maxImagesPerQuestion),
      maxPoints: question.maxPoints,
      status: 'PENDING',
    };

    const auto = autoGrade({
      gradingMode: question.gradingMode,
      maxPoints: question.maxPoints,
      answerKey: question.answerKey,
      config: question.config,
      answerText,
      answerJson: answerGrid,
    });

    if (auto) {
      data.status = 'GRADED';
      data.awarded = auto.awarded;
      data.needsReview = auto.needsReview;
      data.gradeDetail = auto.detail as Prisma.InputJsonValue;
      data.gradedAt = new Date();
    } else if (imageUrls.length === 0 && answerText === null) {
      // Tự luận bỏ trắng: không có gì để đọc, cho 0 luôn — khỏi tốn một lời gọi
      // AI và khỏi bắt học sinh chờ thanh tiến độ chạy cho một câu bỏ trống.
      data.status = 'GRADED';
      data.awarded = 0;
      data.transcriptMd = '[không có bài làm]';
      data.feedbackVi = 'Câu này chưa có bài làm nên chưa có điểm.';
      data.gradedAt = new Date();
    } else {
      pending.push({
        questionId: question.id,
        number: question.number,
        maxPoints: question.maxPoints,
      });
    }

    rows.push(data);
  }

  // Ghi 20 câu bằng MỘT lệnh: nộp bài là lúc học sinh đang nhìn màn hình chờ,
  // 20 lượt đi–về database ở đây là 20 lần chờ vô ích.
  await prisma.mockExamAnswer.createMany({ data: rows });

  if (uploadIds.length > 0) {
    await prisma.mockExamUpload.updateMany({
      where: { id: { in: uploadIds } },
      data: { attemptId: attempt.id },
    });
  }

  const totals = await recomputeAttempt(attempt.id);

  return {
    attemptId: attempt.id,
    totalPoints: exam.totalPoints,
    autoScore: totals.currentScore,
    pending,
    parallelLimit: config.parallelGradeLimit,
    ai: aiStatus(),
  };
}

interface TallyInput {
  status: MockAnswerStatus;
  awarded: number | null;
  overriddenById: string | null;
  gradeDetail: Prisma.JsonValue | null;
}

interface Tally {
  /** Tổng điểm MÁY chấm — không đổi khi giáo viên sửa tay. */
  machineScore: number;
  /** Tổng điểm hiện hành, đã tính điểm sửa tay. */
  currentScore: number;
  hasOverride: boolean;
  status: 'GRADING' | 'DONE' | 'PARTIAL_FAILED';
}

/**
 * Cộng điểm cả bài từ các câu.
 *
 * Giữ RIÊNG hai con số: máy chấm bao nhiêu và điểm sau khi người sửa. Trang kết
 * quả nói "giáo viên đã xem lại (máy chấm: 5)" — câu đó chỉ đúng khi điểm máy
 * được cất lại trước lúc bị ghi đè, nên `overrideAnswerScore` cất nó vào
 * `gradeDetail.machineAwarded` ngay lần sửa đầu tiên.
 */
function tallyAnswers(answers: TallyInput[]): Tally {
  let machine = 0;
  let current = 0;

  for (const answer of answers) {
    const awarded = answer.awarded ?? 0;
    const detail = toRecord(answer.gradeDetail);
    const machineAwarded =
      typeof detail.machineAwarded === 'number' ? detail.machineAwarded : awarded;
    machine += machineAwarded;
    current += awarded;
  }

  const hasPending = answers.some((a) => a.status === 'PENDING');
  const hasFailed = answers.some((a) => a.status === 'FAILED');

  return {
    machineScore: Math.round(machine * 100) / 100,
    currentScore: Math.round(current * 100) / 100,
    hasOverride: answers.some((a) => a.overriddenById !== null),
    status: hasPending ? 'GRADING' : hasFailed ? 'PARTIAL_FAILED' : 'DONE',
  };
}

/**
 * Đọc lại toàn bộ câu rồi ghi lại điểm và trạng thái của bài.
 *
 * Gọi sau MỌI thay đổi điểm. Vì hàm đọc lại tất cả trước khi ghi, các lời gọi
 * chấm chạy song song không làm lệch tổng: lượt chạy cuối luôn cho con số đúng.
 */
export async function recomputeAttempt(attemptId: string): Promise<Tally> {
  const answers = await prisma.mockExamAnswer.findMany({
    where: { attemptId },
    select: { status: true, awarded: true, overriddenById: true, gradeDetail: true },
  });

  const tally = tallyAnswers(answers);

  await prisma.mockExamAttempt.update({
    where: { id: attemptId },
    data: {
      autoScore: tally.machineScore,
      finalScore: tally.hasOverride ? tally.currentScore : null,
      status: tally.status,
    },
  });

  return tally;
}

// ---------------------------------------------------------------------------
// Chấm một câu tự luận
// ---------------------------------------------------------------------------

export interface EssayGradeReport {
  questionId: string;
  number: number;
  status: MockAnswerStatus;
  awarded: number | null;
  maxPoints: number;
  needsReview: boolean;
  feedbackVi: string | null;
  transcriptMd: string | null;
  errorMsg: string | null;
  attemptStatus: 'GRADING' | 'DONE' | 'PARTIAL_FAILED';
  attemptScore: number;
}

async function loadImages(urls: string[]): Promise<VisionImage[]> {
  const ids = urls.map((url) => url.split('/').pop()!).filter(Boolean);
  if (ids.length === 0) return [];

  const rows = await prisma.mockExamUpload.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((row) => [row.id, row]));

  // Giữ đúng thứ tự học sinh chụp — trang 1 trước trang 2.
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => ({
      mediaType: row.mimeType,
      base64: Buffer.from(row.data).toString('base64'),
    }));
}

/**
 * Chấm (hoặc chấm lại) đúng một câu tự luận.
 *
 * Chấm lại KHÔNG gọi lại vision nếu transcript cũ còn đó — vừa rẻ vừa nhanh, và
 * đúng lý do spec §7 tách hai lượt gọi.
 */
export async function gradeMockEssay(input: {
  attemptId: string;
  questionId: string;
  viewer: SessionUser | null;
  /** Bỏ transcript cũ, đọc lại ảnh từ đầu (nút "AI đọc sai chữ em"). */
  forceTranscribe?: boolean;
}): Promise<EssayGradeReport> {
  const config = await getConfigGroup('mockExam');

  const answer = await prisma.mockExamAnswer.findUnique({
    where: { attemptId_questionId: { attemptId: input.attemptId, questionId: input.questionId } },
    include: {
      attempt: { select: { id: true, userId: true } },
      question: { include: { rubric: { orderBy: { orderIndex: 'asc' } } } },
    },
  });

  if (!answer) throw ApiError.notFound('Không tìm thấy câu này trong bài làm.');
  assertCanView(answer.attempt.userId, input.viewer);

  if (answer.question.gradingMode !== 'ESSAY') {
    throw ApiError.badRequest('Câu này không chấm bằng AI.');
  }

  const images = await loadImages(answer.imageUrls);

  // Học sinh gõ thẳng lời giải (câu 9 là dạng này) → chính chữ đó là transcript,
  // không cần bước đọc ảnh.
  const typed = answer.answerText?.trim() ?? '';
  const existingTranscript = input.forceTranscribe
    ? null
    : (answer.transcriptMd?.trim() ??
      (images.length === 0 && typed !== '' ? typed : null));

  try {
    const outcome = await gradeEssayAnswer({
      question: {
        number: answer.question.number,
        maxPoints: answer.question.maxPoints,
        promptMd: answer.question.promptMd,
        solutionMd: answer.question.solutionMd,
        rubric: answer.question.rubric.map((c) => ({
          code: c.code,
          points: c.points,
          description: c.description,
        })),
      },
      images,
      existingTranscript,
      confidenceThreshold: config.confidenceReviewThreshold,
      timeoutMs: config.gradingTimeoutMs,
      maxRetries: config.gradingMaxRetries,
    });

    const updated = await prisma.mockExamAnswer.update({
      where: { id: answer.id },
      data: {
        status: 'GRADED',
        transcriptMd: outcome.transcriptMd,
        awarded: outcome.awarded,
        confidence: outcome.confidence,
        needsReview: outcome.needsReview,
        feedbackVi: outcome.feedbackVi,
        criteriaJson: outcome.criteria as unknown as Prisma.InputJsonValue,
        errorMsg: null,
        gradedAt: new Date(),
        // Chấm lại bằng AI thì xóa dấu sửa tay cũ, nếu không màn hình sẽ ghi
        // "giáo viên đã sửa" trong khi điểm đang hiện là điểm máy vừa chấm.
        // Xóa luôn `machineAwarded` cất từ lần sửa trước: điểm máy chấm bây giờ
        // chính là con số vừa chấm xong.
        gradeDetail: Prisma.DbNull,
        overriddenById: null,
        overriddenAt: null,
      },
    });

    await recordGeneration(answer.id, outcome.modelLabel, outcome, 'OK', null);
    const totals = await recomputeAttempt(input.attemptId);

    return {
      questionId: input.questionId,
      number: answer.question.number,
      status: updated.status,
      awarded: updated.awarded,
      maxPoints: answer.question.maxPoints,
      needsReview: updated.needsReview,
      feedbackVi: updated.feedbackVi,
      transcriptMd: updated.transcriptMd,
      errorMsg: null,
      attemptStatus: totals.status,
      attemptScore: totals.currentScore,
    };
  } catch (error) {
    const message =
      error instanceof AiProviderError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Chấm câu này thất bại.';

    const updated = await prisma.mockExamAnswer.update({
      where: { id: answer.id },
      data: { status: 'FAILED', errorMsg: message.slice(0, 500), needsReview: true },
    });

    await recordGeneration(answer.id, resolveProvider().gradeModel, null, 'FAILED', message);
    const totals = await recomputeAttempt(input.attemptId);

    return {
      questionId: input.questionId,
      number: answer.question.number,
      status: updated.status,
      awarded: null,
      maxPoints: answer.question.maxPoints,
      needsReview: true,
      feedbackVi: null,
      transcriptMd: updated.transcriptMd,
      errorMsg: message,
      attemptStatus: totals.status,
      attemptScore: totals.currentScore,
    };
  }
}

/** Vết cho khu quản trị: model nào chấm, tốn bao nhiêu token, mất bao lâu. */
async function recordGeneration(
  answerId: string,
  model: string,
  outcome: { tokensIn: number; tokensOut: number; latencyMs: number; demo: boolean } | null,
  status: 'OK' | 'FAILED',
  error: string | null,
): Promise<void> {
  try {
    await prisma.aiGeneration.upsert({
      where: { useCase_subjectKey: { useCase: 'mock-exam-essay', subjectKey: `answer:${answerId}` } },
      create: {
        useCase: 'mock-exam-essay',
        subjectKey: `answer:${answerId}`,
        model,
        promptVersion: MOCK_PROMPT_VERSION,
        tokensIn: outcome?.tokensIn ?? 0,
        tokensOut: outcome?.tokensOut ?? 0,
        latencyMs: outcome?.latencyMs ?? 0,
        status,
        error,
        fallbackUsed: outcome?.demo ?? false,
      },
      update: {
        model,
        tokensIn: outcome?.tokensIn ?? 0,
        tokensOut: outcome?.tokensOut ?? 0,
        latencyMs: outcome?.latencyMs ?? 0,
        status,
        error,
        fallbackUsed: outcome?.demo ?? false,
      },
    });
  } catch {
    // Ghi vết hỏng không được làm hỏng việc chấm.
  }
}

// ---------------------------------------------------------------------------
// Xem kết quả
// ---------------------------------------------------------------------------

const STAFF_VIEW_ROLES = [
  'SUPER_ADMIN',
  'OPS_ADMIN',
  'PROGRAM_MANAGER',
  'REVIEWER',
  'CONTENT_EDITOR',
  'TEACHER',
] as const;

export function isStaff(viewer: SessionUser | null): boolean {
  return viewer ? hasRole(viewer, ...STAFF_VIEW_ROLES) : false;
}

/**
 * Ai được xem một bài làm.
 *
 * Bài của khách chưa đăng nhập (`userId = null`) thì đường link CHÍNH LÀ chìa
 * khóa — id là cuid ngẫu nhiên, không đoán được. Đây là đánh đổi có chủ đích
 * của MVP để "vào là thi được ngay", ghi rõ trong IMPLEMENTATION_NOTES.md.
 */
function assertCanView(ownerId: string | null, viewer: SessionUser | null): void {
  if (ownerId === null) return;
  if (viewer && (viewer.id === ownerId || isStaff(viewer))) return;
  throw ApiError.forbidden('Bài làm này thuộc về tài khoản khác.');
}

function toCriteria(value: Prisma.JsonValue | null): ResultCriterion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const record = item as Record<string, unknown>;
    return [
      {
        code: String(record.code ?? ''),
        points: Number(record.points ?? 0),
        awarded: Number(record.awarded ?? 0),
        evidence: String(record.evidence ?? ''),
        reason: String(record.reason ?? ''),
      },
    ];
  });
}

/** Đáp số hiện ở trang kết quả — chỉ lấy phần "đáp án cuối", không lấy lời giải. */
function answerKeyDisplay(mode: MockGradingMode, key: Prisma.JsonValue | null): string | null {
  const record = toRecord(key);
  if (mode === 'ESSAY') return record.final ? String(record.final) : null;
  if (mode === 'NUMERIC') return String(record.display ?? record.value ?? '');
  if (mode === 'EXACT') return String(record.value ?? '');
  if (mode === 'EXPRESSION') {
    const examples = Array.isArray(record.examples) ? record.examples.slice(0, 3) : [];
    return examples.length > 0 ? `Ví dụ: ${examples.join(' · ')}` : null;
  }
  return null;
}

export async function getAttemptResult(
  attemptId: string,
  viewer: SessionUser | null,
): Promise<AttemptResult> {
  const attempt = await prisma.mockExamAttempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: { select: { slug: true, title: true } },
      answers: {
        include: { question: { include: { rubric: { orderBy: { orderIndex: 'asc' } } } } },
      },
    },
  });

  if (!attempt) throw ApiError.notFound('Không tìm thấy bài làm này.');
  assertCanView(attempt.userId, viewer);

  const answers = [...attempt.answers].sort((a, b) => a.question.number - b.question.number);

  const breakdownMap = new Map<MockPart, { awarded: number; total: number }>();
  for (const answer of answers) {
    const current = breakdownMap.get(answer.question.part) ?? { awarded: 0, total: 0 };
    current.awarded += answer.awarded ?? 0;
    current.total += answer.maxPoints;
    breakdownMap.set(answer.question.part, current);
  }

  const tally = tallyAnswers(answers);
  const finalScore = tally.hasOverride ? tally.currentScore : null;

  // Tự chữa nếu điểm trong bảng lệch với tổng các câu (ví dụ hai lời gọi chấm
  // song song cùng ghi một lúc). Trang kết quả là chỗ cuối cùng nhìn thấy sự
  // thật, nên nó có trách nhiệm sửa lại cho đúng.
  if (
    Math.abs(tally.machineScore - attempt.autoScore) > 0.001 ||
    (attempt.finalScore ?? null) !== finalScore ||
    attempt.status !== tally.status
  ) {
    await prisma.mockExamAttempt.update({
      where: { id: attempt.id },
      data: { autoScore: tally.machineScore, finalScore, status: tally.status },
    });
  }

  const failedCount = answers.filter((a) => a.status === 'FAILED').length;
  const pendingCount = answers.filter((a) => a.status === 'PENDING').length;

  return {
    id: attempt.id,
    examSlug: attempt.exam.slug,
    examTitle: attempt.exam.title,
    status: tally.status,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    totalPoints: attempt.totalPoints,
    autoScore: tally.machineScore,
    finalScore,
    score: tally.currentScore,
    breakdown: [...breakdownMap.entries()].map(([part, value]) => ({
      part,
      label: PART_LABEL[part],
      awarded: Math.round(value.awarded * 100) / 100,
      total: value.total,
    })),
    answers: answers.map((answer) => toResultAnswer(answer)),
    pendingCount,
    failedCount,
    needsReviewCount: answers.filter((a) => a.needsReview).length,
    canOverride: isStaff(viewer),
    ai: aiStatus(),
  };
}

type AnswerWithQuestion = MockExamAnswer & {
  question: {
    number: number;
    part: MockPart;
    gradingMode: MockGradingMode;
    promptMd: string;
    options: Prisma.JsonValue;
    solutionMd: string | null;
    answerKey: Prisma.JsonValue;
    rubric: { code: string; points: number; description: string }[];
  };
};

function toResultAnswer(answer: AnswerWithQuestion): ResultAnswer {
  return {
    id: answer.id,
    questionId: answer.questionId,
    number: answer.question.number,
    part: answer.question.part,
    gradingMode: answer.question.gradingMode,
    promptMd: answer.question.promptMd,
    options: toStringArray(answer.question.options),
    maxPoints: answer.maxPoints,
    status: answer.status,
    answerText: answer.answerText,
    answerGrid: normalizeGrid(answer.answerJson),
    imageUrls: answer.imageUrls,
    transcriptMd: answer.transcriptMd,
    awarded: answer.awarded,
    confidence: answer.confidence,
    needsReview: answer.needsReview,
    feedbackVi: answer.feedbackVi,
    criteria: toCriteria(answer.criteriaJson),
    gradeDetail: answer.gradeDetail ? toRecord(answer.gradeDetail) : null,
    errorMsg: answer.errorMsg,
    overridden: answer.overriddenById !== null,
    solutionMd: answer.question.solutionMd,
    answerKeyDisplay: answerKeyDisplay(answer.question.gradingMode, answer.question.answerKey),
    rubric: answer.question.rubric,
  };
}

// ---------------------------------------------------------------------------
// Giáo viên sửa điểm
// ---------------------------------------------------------------------------

export async function overrideAnswerScore(input: {
  attemptId: string;
  answerId: string;
  awarded: number;
  feedbackVi?: string | null;
  actor: SessionUser;
}): Promise<{ awarded: number; previousAwarded: number | null; attemptScore: number }> {
  const answer = await prisma.mockExamAnswer.findUnique({
    where: { id: input.answerId },
    select: {
      id: true,
      attemptId: true,
      maxPoints: true,
      awarded: true,
      feedbackVi: true,
      gradeDetail: true,
    },
  });

  if (!answer || answer.attemptId !== input.attemptId) {
    throw ApiError.notFound('Không tìm thấy câu cần sửa điểm.');
  }
  if (input.awarded < 0 || input.awarded > answer.maxPoints) {
    throw ApiError.badRequest(`Điểm phải nằm trong khoảng 0 đến ${answer.maxPoints}.`);
  }

  // Cất điểm máy chấm lại TRƯỚC khi ghi đè, và chỉ cất ở lần sửa đầu tiên — sửa
  // lần hai lần ba vẫn phải đối chiếu được với con số máy đưa ra ban đầu.
  const detail = toRecord(answer.gradeDetail);
  const gradeDetail = {
    ...detail,
    machineAwarded:
      typeof detail.machineAwarded === 'number' ? detail.machineAwarded : (answer.awarded ?? 0),
  };

  await prisma.mockExamAnswer.update({
    where: { id: answer.id },
    data: {
      awarded: Math.round(input.awarded * 100) / 100,
      // Sửa tay là đã có người xem rồi — bỏ cờ nhờ xem lại và bỏ trạng thái hỏng.
      status: 'GRADED',
      needsReview: false,
      errorMsg: null,
      gradeDetail: gradeDetail as Prisma.InputJsonValue,
      overriddenById: input.actor.id,
      overriddenAt: new Date(),
      ...(input.feedbackVi === undefined ? {} : { feedbackVi: input.feedbackVi }),
    },
  });

  // `recomputeAttempt` tự đặt `finalScore` (điểm sau khi sửa) và giữ nguyên
  // `autoScore` là điểm máy chấm.
  const totals = await recomputeAttempt(input.attemptId);

  return {
    awarded: input.awarded,
    previousAwarded: answer.awarded,
    attemptScore: totals.currentScore,
  };
}

/** Danh sách bài đã nộp cho khu quản trị. */
export async function listAttemptsForStaff(limit = 100): Promise<
  {
    id: string;
    examTitle: string;
    studentName: string;
    submittedAt: string | null;
    score: number;
    totalPoints: number;
    status: string;
    needsReviewCount: number;
  }[]
> {
  const attempts = await prisma.mockExamAttempt.findMany({
    orderBy: { submittedAt: 'desc' },
    take: limit,
    include: {
      exam: { select: { title: true } },
      answers: { select: { needsReview: true } },
    },
  });

  const userIds = [...new Set(attempts.map((a) => a.userId).filter((id): id is string => !!id))];
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true },
        })
      : [];
  const nameById = new Map(users.map((u) => [u.id, u.fullName]));

  return attempts.map((attempt) => ({
    id: attempt.id,
    examTitle: attempt.exam.title,
    studentName: attempt.userId
      ? (nameById.get(attempt.userId) ?? 'Người dùng đã xóa')
      : 'Khách (chưa đăng nhập)',
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    score: attempt.finalScore ?? attempt.autoScore,
    totalPoints: attempt.totalPoints,
    status: attempt.status,
    needsReviewCount: attempt.answers.filter((a) => a.needsReview).length,
  }));
}
