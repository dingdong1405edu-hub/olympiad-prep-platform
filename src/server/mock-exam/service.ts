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
  /**
   * Đáp án và lời giải mẫu chỉ mở khi em đã dùng hết lượt của đề.
   * `remaining > 0` = còn lượt, nên còn giấu.
   */
  solutionLock: { locked: boolean; remaining: number } | null;
  ai: AiStatus;
}

export const PART_LABEL: Record<MockPart, string> = {
  MCQ: 'Trắc nghiệm',
  SHORT: 'Trả lời ngắn',
  ESSAY: 'Tự luận',
};

/** Thứ tự các phần in trên đề — dùng để sắp bảng cấu trúc đề. */
const PART_SEQUENCE: MockPart[] = ['MCQ', 'SHORT', 'ESSAY'];

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
    // `target` và `tolerance` ở lại máy chủ: gửi xuống là gửi kèm luôn bộ máy
    // dò đáp án. Đề bài đã nói phải bằng bao nhiêu; chỉ cần các chữ số được dùng
    // để nhắc luật viết.
    return {
      digits: config.digits ?? [],
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
// Lượt thi — máy chủ giữ đồng hồ, bản nháp và quota
// ---------------------------------------------------------------------------

export interface AttemptQuota {
  limit: number;
  used: number;
  remaining: number;
}

export interface AttemptHistoryRow {
  attemptId: string;
  submittedAt: string;
  score: number;
  totalPoints: number;
  status: 'GRADING' | 'DONE' | 'PARTIAL_FAILED';
}

/** Trang giới thiệu một đề: ai cũng xem được, nhưng làm bài thì phải có tài khoản. */
export interface ExamIntro extends ExamSummary {
  instructions: string | null;
  parts: { part: MockPart; label: string; count: number; points: number }[];
  ai: AiStatus;
  /** null = chưa đăng nhập nên chưa có quota nào để nói. */
  quota: AttemptQuota | null;
  /** Lượt đang làm dở còn hạn — vào tiếp chứ không tốn thêm lượt. */
  liveAttemptId: string | null;
  history: AttemptHistoryRow[];
}

export interface SittingAnswer {
  number: number;
  text: string | null;
  grid: (string | null)[][] | null;
  imageUrls: string[];
}

/** Một lượt thi đang mở: đề + bản nháp đã lưu + hạn nộp do máy chủ chốt. */
export interface Sitting {
  attemptId: string;
  exam: ExamForPlayer;
  answers: SittingAnswer[];
  startedAt: string;
  expiresAt: string;
  /** Giây còn lại tính theo ĐỒNG HỒ MÁY CHỦ tại thời điểm dựng trang. */
  secondsLeft: number;
  attemptNumber: number;
  quota: AttemptQuota;
}

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

/** Lượt thi đã hết hạn mà chưa nộp thì máy chủ tự nộp hộ, chấm phần đã lưu. */
async function finalizeExpiredSittings(userId: string, examId: string): Promise<void> {
  const stale = await prisma.mockExamAttempt.findMany({
    where: { userId, examId, status: 'IN_PROGRESS', expiresAt: { lt: new Date() } },
    select: { id: true },
  });
  for (const attempt of stale) {
    await gradeSubmittedAttempt(attempt.id);
  }
}

async function quotaOf(userId: string, examId: string, limit: number): Promise<AttemptQuota> {
  const used = await prisma.mockExamAttempt.count({ where: { userId, examId } });
  return { limit, used, remaining: Math.max(0, limit - used) };
}

/**
 * Trang giới thiệu một đề — cửa vào của cả khu thi thử.
 *
 * Khách chưa đăng nhập vẫn xem được đầy đủ cấu trúc đề và cách chấm; chỉ khi
 * bấm bắt đầu mới cần tài khoản. Giấu nội dung đi thì chẳng ai buồn đăng ký.
 */
export async function getExamIntro(slug: string, viewer: SessionUser | null): Promise<ExamIntro> {
  const config = await getConfigGroup('mockExam');

  const exam = await prisma.mockExam.findUnique({
    where: { slug },
    include: { questions: { orderBy: { number: 'asc' } } },
  });
  if (!exam || !exam.isPublished) throw ApiError.notFound('Không tìm thấy đề thi này.');

  const partMap = new Map<MockPart, { count: number; points: number }>();
  for (const question of exam.questions) {
    const bucket = partMap.get(question.part) ?? { count: 0, points: 0 };
    bucket.count += 1;
    bucket.points += question.maxPoints;
    partMap.set(question.part, bucket);
  }

  let quota: AttemptQuota | null = null;
  let liveAttemptId: string | null = null;
  let history: AttemptHistoryRow[] = [];

  if (viewer) {
    await finalizeExpiredSittings(viewer.id, exam.id);

    const [rows, counted] = await Promise.all([
      prisma.mockExamAttempt.findMany({
        where: { userId: viewer.id, examId: exam.id },
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          status: true,
          expiresAt: true,
          submittedAt: true,
          autoScore: true,
          finalScore: true,
          totalPoints: true,
        },
      }),
      quotaOf(viewer.id, exam.id, config.freeAttemptsPerExam),
    ]);

    quota = counted;
    liveAttemptId =
      rows.find(
        (row) =>
          row.status === 'IN_PROGRESS' && (row.expiresAt === null || row.expiresAt > new Date()),
      )?.id ?? null;
    history = rows
      .filter((row) => row.status !== 'IN_PROGRESS' && row.submittedAt !== null)
      .map((row) => ({
        attemptId: row.id,
        submittedAt: row.submittedAt!.toISOString(),
        score: row.finalScore ?? row.autoScore,
        totalPoints: row.totalPoints,
        status: row.status as AttemptHistoryRow['status'],
      }));
  }

  return {
    slug: exam.slug,
    title: exam.title,
    subject: exam.subject,
    gradeLevel: exam.gradeLevel,
    durationMin: exam.durationMin,
    totalPoints: exam.totalPoints,
    questionCount: exam.questions.length,
    essayCount: exam.questions.filter((q) => q.gradingMode === 'ESSAY').length,
    instructions: exam.instructions,
    parts: [...partMap.entries()]
      .map(([part, bucket]) => ({
        part,
        label: PART_LABEL[part],
        count: bucket.count,
        points: Math.round(bucket.points * 100) / 100,
      }))
      .sort((a, b) => PART_SEQUENCE.indexOf(a.part) - PART_SEQUENCE.indexOf(b.part)),
    ai: aiStatus(),
    quota,
    liveAttemptId,
    history,
  };
}

/**
 * BẮT ĐẦU một lượt thi.
 *
 * Lượt thi là một bản ghi ở máy chủ, tạo ngay lúc bấm bắt đầu. Đó là thứ khiến
 * khu này chạy được như một kỳ thi online thật:
 *   - Đồng hồ do máy chủ chốt (`expiresAt`), trình duyệt chỉ hiển thị.
 *   - Bản nháp nằm cùng lượt thi nên KHÔNG BAO GIỜ lẫn sang lượt sau. Trước
 *     đây bản nháp chỉ khóa theo slug đề, nên mở đề lần hai là hiện nguyên bài
 *     làm của lần trước — đúng thứ chủ hệ thống gọi là "dữ liệu cũ chèn vào".
 *   - Đếm được mỗi tài khoản đã dùng bao nhiêu lượt cho đề nào.
 *
 * Mở lại trang khi đang có lượt dở thì VÀO TIẾP lượt đó, không tạo lượt mới —
 * nếu không thì lỡ tay tải lại trang năm lần là hết sạch quota.
 */
export async function startMockAttempt(input: {
  slug: string;
  userId: string;
}): Promise<{ attemptId: string; resumed: boolean; quota: AttemptQuota }> {
  const config = await getConfigGroup('mockExam');

  const exam = await prisma.mockExam.findUnique({
    where: { slug: input.slug },
    include: { questions: { orderBy: { number: 'asc' } } },
  });
  if (!exam || !exam.isPublished) throw ApiError.notFound('Không tìm thấy đề thi này.');

  await finalizeExpiredSittings(input.userId, exam.id);

  const live = await prisma.mockExamAttempt.findFirst({
    where: {
      userId: input.userId,
      examId: exam.id,
      status: 'IN_PROGRESS',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  });

  if (live) {
    return {
      attemptId: live.id,
      resumed: true,
      quota: await quotaOf(input.userId, exam.id, config.freeAttemptsPerExam),
    };
  }

  const quota = await quotaOf(input.userId, exam.id, config.freeAttemptsPerExam);
  if (quota.remaining <= 0) {
    throw ApiError.forbidden(
      `Em đã dùng hết ${quota.limit} lượt thi thử miễn phí của đề này. ` +
        'Đăng ký khóa học để luyện tiếp với đề và lộ trình riêng.',
    );
  }

  const startedAt = new Date();
  const attempt = await prisma.mockExamAttempt.create({
    data: {
      examId: exam.id,
      userId: input.userId,
      status: 'IN_PROGRESS',
      startedAt,
      expiresAt: new Date(startedAt.getTime() + exam.durationMin * 60_000),
      totalPoints: exam.totalPoints,
    },
  });

  // Một dòng cho MỌI câu ngay từ đầu: bản nháp ghi đè lên chính các dòng này,
  // và tổng điểm tối đa của bài luôn bằng tổng điểm của đề dù em bỏ trống câu nào.
  await prisma.mockExamAnswer.createMany({
    data: exam.questions.map((question) => ({
      attemptId: attempt.id,
      questionId: question.id,
      maxPoints: question.maxPoints,
      status: 'PENDING' as const,
    })),
  });

  return {
    attemptId: attempt.id,
    resumed: false,
    quota: await quotaOf(input.userId, exam.id, config.freeAttemptsPerExam),
  };
}

/** Lượt thi phải đang mở, đúng chủ, và còn hạn. */
async function loadOpenSitting(attemptId: string, userId: string) {
  const attempt = await prisma.mockExamAttempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: { include: { questions: { orderBy: { number: 'asc' } } } },
      answers: { select: { questionId: true, answerText: true, answerJson: true, imageUrls: true } },
    },
  });

  if (!attempt) throw ApiError.notFound('Không tìm thấy lượt thi này.');
  if (attempt.userId !== userId) throw ApiError.forbidden('Lượt thi này thuộc về tài khoản khác.');
  if (attempt.status !== 'IN_PROGRESS') {
    throw ApiError.badRequest('Lượt thi này đã nộp rồi. Mở trang kết quả để xem điểm.');
  }
  return attempt;
}

/** Đọc lại lượt đang làm để dựng màn hình làm bài (kể cả sau khi đổi máy). */
export async function getSitting(attemptId: string, userId: string): Promise<Sitting> {
  const config = await getConfigGroup('mockExam');
  const attempt = await loadOpenSitting(attemptId, userId);

  const expiresAt =
    attempt.expiresAt ?? new Date(attempt.startedAt.getTime() + attempt.exam.durationMin * 60_000);

  const byQuestion = new Map(attempt.answers.map((row) => [row.questionId, row]));
  const [exam, quota, attemptNumber] = await Promise.all([
    getExamForPlayer(attempt.exam.slug),
    quotaOf(userId, attempt.examId, config.freeAttemptsPerExam),
    prisma.mockExamAttempt.count({
      where: { userId, examId: attempt.examId, startedAt: { lte: attempt.startedAt } },
    }),
  ]);

  return {
    attemptId: attempt.id,
    exam,
    answers: attempt.exam.questions.map((question) => {
      const saved = byQuestion.get(question.id);
      return {
        number: question.number,
        text: saved?.answerText ?? null,
        grid: normalizeGrid(saved?.answerJson),
        imageUrls: saved?.imageUrls ?? [],
      };
    }),
    startedAt: attempt.startedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    secondsLeft: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    attemptNumber,
    quota,
  };
}

/** Ảnh phải có thật trong kho trước khi được ghi vào bài làm. */
async function keepKnownUploads(answers: AnswerInput[]): Promise<Set<string>> {
  const ids = answers.flatMap((a) => a.imageUrls ?? []).map((url) => url.split('/').pop()!);
  if (ids.length === 0) return new Set();
  const rows = await prisma.mockExamUpload.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

async function writeDraft(
  attempt: { id: string; exam: { questions: { id: string; number: number }[] } },
  answers: AnswerInput[],
  maxImages: number,
): Promise<void> {
  const known = await keepKnownUploads(answers);
  const byNumber = new Map(answers.map((a) => [a.number, a]));

  await prisma.$transaction(
    attempt.exam.questions.flatMap((question) => {
      const given = byNumber.get(question.number);
      if (!given) return [];
      const imageUrls = (given.imageUrls ?? [])
        .filter((url) => known.has(url.split('/').pop()!))
        .slice(0, maxImages);
      const grid = normalizeGrid(given.grid);

      return [
        prisma.mockExamAnswer.update({
          where: { attemptId_questionId: { attemptId: attempt.id, questionId: question.id } },
          data: {
            answerText: given.text?.trim() ? given.text.trim() : null,
            answerJson: (grid ?? Prisma.DbNull) as Prisma.InputJsonValue,
            imageUrls,
          },
        }),
      ];
    }),
  );

  const uploadIds = answers
    .flatMap((a) => a.imageUrls ?? [])
    .map((url) => url.split('/').pop()!)
    .filter((id) => known.has(id));
  if (uploadIds.length > 0) {
    // CHỈ nhận ảnh chưa thuộc lượt nào, hoặc đã thuộc chính lượt này. Không có
    // điều kiện này thì một ảnh của lượt đã nộp bị kéo sang lượt mới, và quyền
    // xem ảnh (uploads.ts tra theo lượt đang giữ ảnh) cũng đi theo luôn.
    await prisma.mockExamUpload.updateMany({
      where: {
        id: { in: uploadIds },
        OR: [{ attemptId: null }, { attemptId: attempt.id }],
      },
      data: { attemptId: attempt.id },
    });
  }
}

/**
 * Tự lưu trong lúc làm bài.
 *
 * Ghi thẳng vào lượt thi ở máy chủ chứ không chỉ vào localStorage: mất điện,
 * đổi máy, hay trình duyệt xóa dữ liệu thì bài vẫn còn — mà cũng không có cách
 * nào để bản nháp lẫn sang một lượt thi khác.
 */
export async function saveSittingDraft(input: {
  attemptId: string;
  userId: string;
  answers: AnswerInput[];
}): Promise<{ secondsLeft: number }> {
  const config = await getConfigGroup('mockExam');
  const attempt = await loadOpenSitting(input.attemptId, input.userId);

  const expiresAt =
    attempt.expiresAt ?? new Date(attempt.startedAt.getTime() + attempt.exam.durationMin * 60_000);
  const secondsLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

  // Hết giờ rồi thì không nhận thêm chữ nào nữa — nhưng cũng không báo lỗi ầm ĩ,
  // vì trình duyệt sẽ tự nộp ngay sau đó.
  if (secondsLeft > 0) {
    await writeDraft(attempt, input.answers, config.maxImagesPerQuestion);
  }
  return { secondsLeft };
}

// ---------------------------------------------------------------------------
// Nộp bài
// ---------------------------------------------------------------------------

/**
 * Chấm toàn bộ phần máy chấm được của một lượt đã nộp.
 *
 * Tách riêng khỏi `submitSitting` để dùng lại được cho lượt hết giờ mà không ai
 * bấm nộp: máy chủ tự nộp hộ và chấm đúng những gì đã lưu.
 *
 * Câu tự luận KHÔNG chấm ở đây: một lời gọi vision mất 15–40 giây, mười câu là
 * chắc chắn hết giờ HTTP. Chúng ở lại trạng thái PENDING và được chấm bằng
 * `/grade` từng câu (spec §2) — có thanh tiến độ để nhìn.
 */
async function gradeSubmittedAttempt(attemptId: string): Promise<SubmitOutcome> {
  const config = await getConfigGroup('mockExam');

  const attempt = await prisma.mockExamAttempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: { include: { questions: { orderBy: { number: 'asc' } } } },
      answers: true,
    },
  });
  if (!attempt) throw ApiError.notFound('Không tìm thấy lượt thi này.');

  const byQuestion = new Map(attempt.answers.map((row) => [row.questionId, row]));
  const pending: SubmitOutcome['pending'] = [];

  for (const question of attempt.exam.questions) {
    const saved = byQuestion.get(question.id);
    if (!saved || saved.status !== 'PENDING') continue;

    const answerText = saved.answerText;
    const answerGrid = normalizeGrid(saved.answerJson);

    const auto = autoGrade({
      gradingMode: question.gradingMode,
      maxPoints: question.maxPoints,
      answerKey: question.answerKey,
      config: question.config,
      answerText,
      answerJson: answerGrid,
    });

    if (auto) {
      await prisma.mockExamAnswer.update({
        where: { id: saved.id },
        data: {
          status: 'GRADED',
          awarded: auto.awarded,
          needsReview: auto.needsReview,
          gradeDetail: auto.detail as Prisma.InputJsonValue,
          gradedAt: new Date(),
        },
      });
    } else if (saved.imageUrls.length === 0 && (answerText ?? '') === '') {
      // Tự luận bỏ trắng: không có gì để đọc, cho 0 luôn — khỏi tốn một lời gọi
      // AI và khỏi bắt học sinh chờ thanh tiến độ chạy cho một câu bỏ trống.
      await prisma.mockExamAnswer.update({
        where: { id: saved.id },
        data: {
          status: 'GRADED',
          awarded: 0,
          transcriptMd: '[không có bài làm]',
          feedbackVi: 'Câu này chưa có bài làm nên chưa có điểm.',
          gradedAt: new Date(),
        },
      });
    } else {
      pending.push({
        questionId: question.id,
        number: question.number,
        maxPoints: question.maxPoints,
      });
    }
  }

  if (attempt.submittedAt === null) {
    await prisma.mockExamAttempt.update({
      where: { id: attempt.id },
      data: { submittedAt: new Date() },
    });
  }

  const totals = await recomputeAttempt(attempt.id);

  return {
    attemptId: attempt.id,
    totalPoints: attempt.totalPoints,
    autoScore: totals.currentScore,
    pending,
    parallelLimit: config.parallelGradeLimit,
    ai: aiStatus(),
  };
}

/**
 * NỘP BÀI.
 *
 * Nhận bản cuối cùng rồi chấm ngay phần máy chấm được. Quá hạn + ân hạn thì
 * KHÔNG nhận thêm chữ nào: chấm đúng bản nháp máy chủ đã lưu trước lúc hết giờ.
 */
export async function submitSitting(input: {
  attemptId: string;
  userId: string;
  answers: AnswerInput[];
}): Promise<SubmitOutcome> {
  const config = await getConfigGroup('mockExam');
  const attempt = await loadOpenSitting(input.attemptId, input.userId);

  const expiresAt =
    attempt.expiresAt ?? new Date(attempt.startedAt.getTime() + attempt.exam.durationMin * 60_000);
  const withinGrace = Date.now() <= expiresAt.getTime() + config.submitGraceSeconds * 1_000;

  if (withinGrace) {
    await writeDraft(attempt, input.answers, config.maxImagesPerQuestion);
  }

  return gradeSubmittedAttempt(attempt.id);
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

  /**
   * Giáo viên đã sửa tay thì học sinh KHÔNG được chấm lại.
   *
   * Nút "Chấm lại câu này" nằm ngay trên trang kết quả của học sinh, và đường
   * ghi ở dưới xóa sạch `overriddenById`/`overriddenAt` rồi ghi đè điểm bằng
   * điểm máy. Nghĩa là một em bị giáo viên hạ điểm chỉ cần bấm một nút là quyết
   * định chấm tay biến mất — không cảnh báo, không dấu vết trên màn hình.
   *
   * Nhân sự vẫn chấm lại được: đó là thao tác có chủ đích của người có thẩm
   * quyền, và có nhật ký.
   */
  if (answer.overriddenById !== null && !isStaff(input.viewer)) {
    throw ApiError.forbidden(
      'Câu này đã được giáo viên chấm tay nên không chấm lại bằng AI được. ' +
        'Nếu em thấy điểm chưa đúng, hãy báo lại với giáo viên.',
    );
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

    /**
     * CHẤM LẠI HỎNG THÌ GIỮ NGUYÊN ĐIỂM CŨ, KHÔNG HẠ CÂU XUỐNG "CHƯA CHẤM".
     *
     * Câu đã có điểm hợp lệ mà em bấm "AI đọc sai chữ" rồi lượt đọc lại rớt
     * mạng: nếu ghi FAILED thì điểm cũ vẫn nằm trong tổng, nhưng cả bài bị coi
     * là chưa chấm xong nên trang kết quả rút luôn phần xếp học lực — điểm thì
     * vẫn tính, mà học lực thì biến mất, đúng kiểu "xếp hạng lúc có lúc không".
     *
     * Chỉ câu CHƯA từng chấm được mới rơi xuống FAILED.
     */
    const hadValidGrade = answer.status === 'GRADED' && answer.awarded !== null;

    const updated = await prisma.mockExamAnswer.update({
      where: { id: answer.id },
      data: {
        status: hadValidGrade ? 'GRADED' : 'FAILED',
        errorMsg: message.slice(0, 500),
        needsReview: true,
      },
    });

    await recordGeneration(answer.id, resolveProvider().gradeModel, null, 'FAILED', message);
    const totals = await recomputeAttempt(input.attemptId);

    return {
      questionId: input.questionId,
      number: answer.question.number,
      status: updated.status,
      awarded: updated.awarded,
      maxPoints: answer.question.maxPoints,
      needsReview: true,
      feedbackVi: updated.feedbackVi,
      transcriptMd: updated.transcriptMd,
      errorMsg: hadValidGrade
        ? `${message} — điểm cũ của câu này được giữ nguyên.`
        : message,
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
  const config = await getConfigGroup('mockExam');

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

  /**
   * CHƯA NỘP THÌ CHƯA CÓ KẾT QUẢ.
   *
   * Không phải chuyện gọn gàng mà là chuyện gian lận: trang kết quả trả về
   * `answerKey`, `solutionMd` và cả barem. Lượt thi bây giờ tồn tại ở máy chủ
   * ngay từ lúc bấm bắt đầu, nên nếu không chặn ở đây thì học sinh chỉ cần mở
   * /ket-qua/<id> của chính lượt mình ĐANG LÀM ở một tab khác là có nguyên bộ
   * đáp án và lời giải.
   */
  if (attempt.status === 'IN_PROGRESS' && !isStaff(viewer)) {
    throw ApiError.badRequest('Lượt thi này chưa nộp nên chưa có kết quả để xem.');
  }

  /**
   * ĐÁP ÁN VÀ LỜI GIẢI MẪU CHỈ MỞ KHI HẾT LƯỢT.
   *
   * Mỗi tài khoản có 5 lượt cho một đề. Nếu nộp lượt đầu là thấy ngay toàn bộ
   * đáp án thì bốn lượt còn lại vô nghĩa: chép đáp án vào là 100/100, và con số
   * "học lực Giỏi" thành ra vô giá trị với chính em lẫn với giáo viên.
   *
   * Em vẫn nhận đủ thứ để học được ngay từ lượt đầu: điểm từng câu, barem AI
   * chấm sai ở tiêu chí nào, nhận xét bằng tiếng Việt, và bài AI đọc ra từ ảnh.
   * Chỉ đáp số đúng và lời giải mẫu là để dành tới khi hết lượt.
   */
  const staffViewer = isStaff(viewer);
  let solutionLock: AttemptResult['solutionLock'] = null;
  if (!staffViewer && attempt.userId !== null) {
    const used = await prisma.mockExamAttempt.count({
      where: { userId: attempt.userId, examId: attempt.examId },
    });
    const remaining = Math.max(0, config.freeAttemptsPerExam - used);
    solutionLock = { locked: remaining > 0, remaining };
  }
  const revealAnswers = solutionLock === null || !solutionLock.locked;

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
    answers: answers.map((answer) => toResultAnswer(answer, revealAnswers)),
    pendingCount,
    failedCount,
    needsReviewCount: answers.filter((a) => a.needsReview).length,
    canOverride: staffViewer,
    solutionLock,
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

function toResultAnswer(answer: AnswerWithQuestion, revealAnswers: boolean): ResultAnswer {
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
    // Còn lượt thi thì đáp án và lời giải KHÔNG ra khỏi máy chủ — cắt ở đây chứ
    // không chỉ ẩn trên giao diện, vì ẩn trên giao diện thì mở tab Network là thấy.
    solutionMd: revealAnswers ? answer.question.solutionMd : null,
    answerKeyDisplay: revealAnswers
      ? answerKeyDisplay(answer.question.gradingMode, answer.question.answerKey)
      : null,
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
    // Lượt đang làm dở chưa có gì để chấm, và điểm của nó là 0 vì chưa nộp —
    // để lẫn vào đây chỉ tổ làm giáo viên tưởng có một bài 0 điểm cần xem.
    where: { status: { not: 'IN_PROGRESS' } },
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
