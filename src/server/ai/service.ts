/**
 * AI SERVICE — điểm vào duy nhất của tầng AI (specs §8.3).
 *
 * Luồng cố định cho MỌI use case:
 *   1. Lấy dữ liệu ĐÃ CÓ CẤU TRÚC do engine tính (report, mastery, delta…).
 *   2. Ẩn danh học sinh → dựng prompt có version (`prompts.ts`).
 *   3. Gọi LLM qua adapter; kiểm tra output đúng cấu trúc JSON mong đợi.
 *   4. Ghi `AiGeneration`: model, promptVersion, token, độ trễ, trạng thái.
 *   5. Sai cấu trúc / lỗi / không có API key → fallback template, fallbackUsed = true.
 *
 * BỐN LUẬT KHÔNG ĐƯỢC PHÁ:
 *  - AI KHÔNG chọn câu, KHÔNG sinh đề, KHÔNG sửa đáp án. Engine quyết, AI diễn giải.
 *  - Giải thích lời giải phải bám `QuestionItem.solution` đã kiểm duyệt (specs §8.2).
 *  - Không đưa PII vào prompt: chỉ biệt danh "Học sinh #<mã>" (specs §8.2, §14 #6).
 *  - Hàm ở đây KHÔNG ném lỗi. Ngoại lệ duy nhất: `explainSolution` từ chối câu
 *    chưa PUBLISHED bằng `ApiError.forbidden` — đó là lỗi phân quyền, không phải lỗi AI.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Difficulty, GradeBand, Prisma, StudentLevel, Subject } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';
import { getConfig, type PlatformConfig } from '@/lib/config';
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  GRADE_BAND_LABEL,
  LEVEL_LABEL,
  QUESTION_TYPE_LABEL,
  SUBJECT_LABEL,
} from '@/lib/domain';
import { addDays, daysUntil, formatDateVN, vnToday } from '@/lib/dates';
import {
  getAssessmentStatus,
  getAttemptReport,
  listAttempts,
  type AttemptReport,
} from '@/server/assessment/service';
import {
  getMasteryDelta,
  getMasteryMap,
  getTopErrorPatterns,
  type MasteryMapSkill,
} from '@/server/student-model/service';
import { parseOptions, type ItemOption } from '@/server/content/schemas';
import { callLlm, isAiConfigured } from './client';
import {
  PROMPT_VERSION,
  buildDiagnosticCommentPrompt,
  buildItemMetadataPrompt,
  buildProgressReportPrompt,
  buildSolutionExplanationPrompt,
  buildTeacherBriefPrompt,
  type AiPrompt,
  type AnonymousStudent,
  type DiagnosticCommentContent,
  type DiagnosticCommentInput,
  type ExplanationLevel,
  type ItemMetadataContent,
  type ItemMetadataInput,
  type PriorityInput,
  type ProgressReportContent,
  type ProgressReportInput,
  type SkillDeltaInput,
  type SkillOutcome,
  type SolutionExplanationContent,
  type SolutionExplanationInput,
  type TeacherBriefContent,
  type TeacherBriefInput,
} from './prompts';
import {
  DEFAULT_FALLBACK_TUNING,
  buildDiagnosticCommentFallback,
  buildItemMetadataFallback,
  buildProgressReportFallback,
  buildSolutionExplanationFallback,
  buildTeacherBriefFallback,
  type FallbackTuning,
} from './fallback';

// ---------------------------------------------------------------------------
// Hằng số KỸ THUẬT (tham số nghiệp vụ nằm ở getConfig — specs §19.2 #4)
// ---------------------------------------------------------------------------

/** Ghi vào cột `model` khi chạy đường fallback — để thống kê tách bạch với lời gọi thật. */
const FALLBACK_MODEL = 'fallback-template';

const STATUS_OK = 'OK';
const STATUS_FAILED = 'FAILED';

/** Số kỹ năng mạnh/yếu đưa vào prompt; fallback còn cắt tiếp khi viết câu. */
const MAX_STRONG_SKILLS = 4;
const MAX_WEAK_SKILLS = 5;
/** specs §9.3 khối Error Patterns: 5 lỗi lặp nhiều nhất. */
const ERROR_PATTERN_LIMIT = 5;
/** Số kỹ năng nổi bật mỗi phía trong mastery map của brief giáo viên. */
const MASTERY_HIGHLIGHT_COUNT = 4;
/** Trần độ dài một chuỗi trong output AI — chặn model trả về cả bài văn. */
const CONTENT_STRING_LIMIT = 900;
/** Trần số phần tử mỗi mảng trong output AI. */
const CONTENT_LIST_LIMIT = 6;
/** Trần danh mục gửi kèm prompt gợi ý metadata. */
const SKILL_CATALOG_LIMIT = 200;
const KNOWN_TAG_LIMIT = 40;
const TAG_SAMPLE_ITEMS = 500;
/** Cửa sổ mặc định của báo cáo sử dụng AI cho màn hình vận hành. */
const DEFAULT_USAGE_WINDOW_DAYS = 30;

// ---------------------------------------------------------------------------
// Use case & khóa cache
// ---------------------------------------------------------------------------

export const AI_USE_CASES = {
  DIAGNOSTIC_COMMENT: 'DIAGNOSTIC_COMMENT',
  PROGRESS_REPORT: 'PROGRESS_REPORT',
  TEACHER_BRIEF: 'TEACHER_BRIEF',
  SOLUTION_EXPLANATION: 'SOLUTION_EXPLANATION',
  ITEM_METADATA: 'ITEM_METADATA',
} as const;

export type AiUseCase = (typeof AI_USE_CASES)[keyof typeof AI_USE_CASES];

export const AI_USE_CASE_LABEL: Record<AiUseCase, string> = {
  DIAGNOSTIC_COMMENT: 'Nhận xét sau bài kiểm tra',
  PROGRESS_REPORT: 'Báo cáo tiến bộ',
  TEACHER_BRIEF: 'Tóm tắt trước buổi tư vấn',
  SOLUTION_EXPLANATION: 'Giải thích lời giải',
  ITEM_METADATA: 'Gợi ý metadata câu hỏi',
};

// ---------------------------------------------------------------------------
// Kiểu trả về công khai
// ---------------------------------------------------------------------------

export interface DiagnosticCommentResult extends DiagnosticCommentContent {
  fallbackUsed: boolean;
}
export interface ProgressReportResult extends ProgressReportContent {
  fallbackUsed: boolean;
}
export interface TeacherBriefResult extends TeacherBriefContent {
  fallbackUsed: boolean;
}
export interface SolutionExplanationResult extends SolutionExplanationContent {
  fallbackUsed: boolean;
}
export interface ItemMetadataResult extends ItemMetadataContent {
  fallbackUsed: boolean;
}

export interface ExplainSolutionInput {
  itemId: string;
  level: ExplanationLevel;
}

export interface SuggestItemMetadataInput {
  stem: string;
  options?: { key: string; text: string }[];
  solution: string;
  subject: Subject;
  gradeBand: GradeBand;
}

export interface AiUsageRange {
  from?: Date;
  to?: Date;
  /** Số ngày gần đây, dùng khi không truyền from/to. */
  days?: number;
}

export interface AiUseCaseUsage {
  useCase: string;
  label: string;
  total: number;
  fallbackCount: number;
  failedCount: number;
  fallbackRate: number;
  avgLatencyMs: number;
  totalTokens: number;
}

export interface AiUsageStats {
  from: Date;
  to: Date;
  total: number;
  fallbackCount: number;
  failedCount: number;
  /** 0–1: tỷ lệ bản sinh phải chạy template thay vì LLM. */
  fallbackRate: number;
  /** Trung bình độ trễ của LỜI GỌI LLM THẬT (bản fallback không tính, latency ~0). */
  avgLatencyMs: number;
  totalTokens: number;
  byUseCase: AiUseCaseUsage[];
}

// ---------------------------------------------------------------------------
// Tiện ích chung
// ---------------------------------------------------------------------------

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Lỗi không xác định khi gọi tầng AI.';
}

/**
 * Biệt danh ổn định, KHÔNG suy ngược được ra danh tính: băm id nội bộ rồi lấy 4
 * ký tự. Không bao giờ dùng tên/email/trường của học sinh (specs §8.2, §14 #6).
 */
function nicknameOf(seed: string): string {
  const digest = createHash('sha256').update(seed).digest('hex').slice(0, 4).toUpperCase();
  return `Học sinh #${digest}`;
}

function levelLabelOf(level: StudentLevel | null, config: PlatformConfig): string {
  if (!level) return 'chưa xác định';
  return config.levels.labels?.[level] ?? LEVEL_LABEL[level];
}

function tuningFrom(config: PlatformConfig): FallbackTuning {
  return {
    fastTimeRatio: config.recommendation.difficultyUp.maxTimeRatio ?? DEFAULT_FALLBACK_TUNING.fastTimeRatio,
    slowTimeRatio: config.recommendation.difficultyDown.minTimeRatio ?? DEFAULT_FALLBACK_TUNING.slowTimeRatio,
    masteredThreshold: config.recommendation.masteredThreshold ?? DEFAULT_FALLBACK_TUNING.masteredThreshold,
    gapThreshold: config.recommendation.gapThreshold ?? DEFAULT_FALLBACK_TUNING.gapThreshold,
  };
}

/**
 * Phiên bản prompt dùng để truy vết và để làm mới cache: gồm version trong code
 * và version admin đặt trong cấu hình (specs §8.3 — "đổi prompt không cần deploy").
 */
function resolvePromptVersion(config: PlatformConfig): string {
  const configured = config.ai.promptVersion?.trim() ?? '';
  if (configured === '' || configured === PROMPT_VERSION) return PROMPT_VERSION;
  return `${PROMPT_VERSION}+${configured}`;
}

// ---------------------------------------------------------------------------
// Đọc output LLM
// ---------------------------------------------------------------------------

/** Model hay bọc JSON trong ```json … ``` dù prompt đã cấm — vẫn phải gỡ được. */
function extractJsonObject(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function trimText(value: string, limit = CONTENT_STRING_LIMIT): string {
  const cleaned = value.replace(/\r/g, '').trim();
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, limit - 1).trimEnd()}…`;
}

function cleanList(list: string[], limit = CONTENT_LIST_LIMIT): string[] {
  return list
    .map((entry) => trimText(entry))
    .filter((entry) => entry !== '')
    .slice(0, limit);
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

const nonEmptyString = z.string().trim().min(1);
const stringList = z.array(z.string()).optional().default([]);

const diagnosticSchema = z.object({
  summary: nonEmptyString,
  strengths: stringList,
  weaknesses: stringList,
  priorities: z
    .array(z.object({ skillName: z.string(), why: z.string() }))
    .optional()
    .default([]),
  encouragement: nonEmptyString,
});

const progressSchema = z.object({
  summary: nonEmptyString,
  improved: stringList,
  stillWeak: stringList,
  nextFocus: stringList,
});

const teacherSchema = z.object({
  overview: nonEmptyString,
  keyIssues: stringList,
  talkingPoints: stringList,
  suggestedActions: stringList,
});

const explanationSchema = z.object({ explanation: nonEmptyString });

const metadataSchema = z.object({
  suggestedSkillCodes: stringList,
  suggestedDifficulty: z.string(),
  suggestedTags: stringList,
  confidence: z.number(),
  note: nonEmptyString,
});

/**
 * Kiểm tra nhận xét: đúng cấu trúc VÀ không bịa kỹ năng. Thứ tự ưu tiên do
 * engine xếp — AI đảo thứ tự cũng bị đưa về đúng thứ tự gốc.
 */
function validateDiagnostic(raw: unknown, orderedSkillNames: string[]): DiagnosticCommentContent | null {
  const parsed = diagnosticSchema.safeParse(raw);
  if (!parsed.success) return null;

  const indexByName = new Map<string, number>();
  orderedSkillNames.forEach((name, index) => indexByName.set(normalizeName(name), index));

  const picked = new Map<number, { skillName: string; why: string }>();
  for (const entry of parsed.data.priorities) {
    const index = indexByName.get(normalizeName(entry.skillName));
    const why = trimText(entry.why);
    if (index === undefined || why === '' || picked.has(index)) continue;
    picked.set(index, { skillName: orderedSkillNames[index], why });
  }
  // Engine có ưu tiên mà AI không bám được kỹ năng nào → coi như sai cấu trúc.
  if (orderedSkillNames.length > 0 && picked.size === 0) return null;

  return {
    summary: trimText(parsed.data.summary),
    strengths: cleanList(parsed.data.strengths),
    weaknesses: cleanList(parsed.data.weaknesses),
    priorities: [...picked.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value),
    encouragement: trimText(parsed.data.encouragement),
  };
}

function validateProgress(raw: unknown): ProgressReportContent | null {
  const parsed = progressSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    summary: trimText(parsed.data.summary),
    improved: cleanList(parsed.data.improved),
    stillWeak: cleanList(parsed.data.stillWeak),
    nextFocus: cleanList(parsed.data.nextFocus),
  };
}

function validateTeacherBrief(raw: unknown): TeacherBriefContent | null {
  const parsed = teacherSchema.safeParse(raw);
  if (!parsed.success) return null;
  const content: TeacherBriefContent = {
    overview: trimText(parsed.data.overview),
    keyIssues: cleanList(parsed.data.keyIssues),
    talkingPoints: cleanList(parsed.data.talkingPoints),
    suggestedActions: cleanList(parsed.data.suggestedActions),
  };
  // Brief rỗng ruột thì vô dụng với giáo viên — thà dùng bản dựng từ số liệu.
  if (content.keyIssues.length === 0 && content.suggestedActions.length === 0) return null;
  return content;
}

function validateExplanation(raw: unknown): SolutionExplanationContent | null {
  const parsed = explanationSchema.safeParse(raw);
  if (!parsed.success) return null;
  return { explanation: trimText(parsed.data.explanation, CONTENT_STRING_LIMIT * 2) };
}

/** Câu nhắc bắt buộc: gợi ý metadata luôn cần người phê duyệt (specs §8.1). */
const HUMAN_APPROVAL_NOTE = 'Đây chỉ là gợi ý — biên soạn viên phải kiểm tra và phê duyệt trước khi lưu.';

function validateMetadata(raw: unknown, catalogCodes: string[]): ItemMetadataContent | null {
  const parsed = metadataSchema.safeParse(raw);
  if (!parsed.success) return null;

  const allowed = new Map(catalogCodes.map((code) => [code.trim().toUpperCase(), code]));
  const codes: string[] = [];
  for (const code of parsed.data.suggestedSkillCodes) {
    const canonical = allowed.get(code.trim().toUpperCase());
    if (canonical && !codes.includes(canonical)) codes.push(canonical);
  }
  // Model bịa mã kỹ năng ngoài danh mục → không dùng được, chuyển fallback.
  if (parsed.data.suggestedSkillCodes.length > 0 && codes.length === 0) return null;

  const difficulty = parsed.data.suggestedDifficulty.trim().toUpperCase();
  if (!(DIFFICULTIES as string[]).includes(difficulty)) return null;

  const tags = parsed.data.suggestedTags
    .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, '-'))
    .filter((tag) => tag !== '')
    .slice(0, CONTENT_LIST_LIMIT);

  const note = trimText(parsed.data.note);
  return {
    suggestedSkillCodes: codes,
    suggestedDifficulty: difficulty as Difficulty,
    suggestedTags: tags,
    confidence: Math.min(1, Math.max(0, round(parsed.data.confidence, 2))),
    note: note.toLowerCase().includes('gợi ý') ? note : `${note} ${HUMAN_APPROVAL_NOTE}`,
  };
}

// ---------------------------------------------------------------------------
// Chạy sinh nội dung: cache → LLM → validate → ghi log → fallback
// ---------------------------------------------------------------------------

interface GenerationPlan<T> {
  useCase: AiUseCase;
  subjectKey: string;
  /** Dữ liệu ĐÃ ẨN DANH đưa vào prompt; ghi lại để truy vết (specs §15 Auditability). */
  input: unknown;
  prompt: AiPrompt;
  model: string;
  validate: (raw: unknown) => T | null;
  fallback: () => T;
}

interface GenerationOutcome<T> {
  content: T;
  fallbackUsed: boolean;
}

interface WriteInput {
  useCase: AiUseCase;
  subjectKey: string;
  model: string;
  promptVersion: string;
  input: unknown;
  output: unknown;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  status: string;
  error: string | null;
  fallbackUsed: boolean;
}

/** Ghi nhật ký sinh nội dung. Hỏng log KHÔNG được làm hỏng nội dung đã có. */
async function writeGeneration(input: WriteInput): Promise<void> {
  const data = {
    model: input.model,
    promptVersion: input.promptVersion,
    input: toJson(input.input),
    output: toJson(input.output),
    tokensIn: Math.max(0, Math.round(input.tokensIn)),
    tokensOut: Math.max(0, Math.round(input.tokensOut)),
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    status: input.status,
    error: input.error,
    fallbackUsed: input.fallbackUsed,
  };

  try {
    await prisma.aiGeneration.upsert({
      where: { useCase_subjectKey: { useCase: input.useCase, subjectKey: input.subjectKey } },
      create: { useCase: input.useCase, subjectKey: input.subjectKey, ...data },
      update: { ...data, createdAt: new Date() },
    });
  } catch (error) {
    console.error('[ai] không ghi được AiGeneration', input.useCase, input.subjectKey, error);
  }
}

async function readCache<T>(
  plan: GenerationPlan<T>,
  promptVersion: string,
  llmReady: boolean,
): Promise<GenerationOutcome<T> | null> {
  try {
    const row = await prisma.aiGeneration.findUnique({
      where: { useCase_subjectKey: { useCase: plan.useCase, subjectKey: plan.subjectKey } },
      select: { output: true, status: true, promptVersion: true, fallbackUsed: true },
    });
    if (!row || row.status !== STATUS_OK) return null;
    // Prompt đổi version → nội dung cũ coi như hết hạn.
    if (row.promptVersion !== promptVersion) return null;
    // Bản cũ chạy chay vì chưa có API key, nay đã có LLM → sinh lại cho tốt hơn.
    if (row.fallbackUsed && llmReady) return null;

    const content = plan.validate(row.output);
    if (content === null) return null;
    return { content, fallbackUsed: row.fallbackUsed };
  } catch (error) {
    console.error('[ai] không đọc được cache AiGeneration', plan.useCase, error);
    return null;
  }
}

async function runGeneration<T>(plan: GenerationPlan<T>, config: PlatformConfig): Promise<GenerationOutcome<T>> {
  const promptVersion = resolvePromptVersion(config);
  const llmReady = config.ai.enabled && isAiConfigured();

  const cached = await readCache(plan, promptVersion, llmReady);
  if (cached) return cached;

  // Không bật AI hoặc chưa cấu hình API key: đây là ĐƯỜNG CHẠY BÌNH THƯỜNG của
  // hệ thống, không phải sự cố → status OK, chỉ đánh dấu fallbackUsed.
  if (!llmReady) {
    const content = plan.fallback();
    await writeGeneration({
      useCase: plan.useCase,
      subjectKey: plan.subjectKey,
      model: FALLBACK_MODEL,
      promptVersion,
      input: plan.input,
      output: content,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      status: STATUS_OK,
      error: null,
      fallbackUsed: true,
    });
    return { content, fallbackUsed: true };
  }

  const startedAt = Date.now();
  try {
    const result = await callLlm({ system: plan.prompt.system, prompt: plan.prompt.prompt, model: plan.model });
    const content = plan.validate(extractJsonObject(result.text));

    if (content === null) {
      // specs §8.3 bước 4: output sai cấu trúc bị loại — ghi FAILED để cảnh báo
      // vận hành, nội dung trả về lấy từ template.
      const fallbackContent = plan.fallback();
      await writeGeneration({
        useCase: plan.useCase,
        subjectKey: plan.subjectKey,
        model: result.model,
        promptVersion,
        input: plan.input,
        output: fallbackContent,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        latencyMs: result.latencyMs,
        status: STATUS_FAILED,
        error: 'Output của LLM không đúng cấu trúc JSON mong đợi.',
        fallbackUsed: true,
      });
      return { content: fallbackContent, fallbackUsed: true };
    }

    await writeGeneration({
      useCase: plan.useCase,
      subjectKey: plan.subjectKey,
      model: result.model,
      promptVersion,
      input: plan.input,
      output: content,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      latencyMs: result.latencyMs,
      status: STATUS_OK,
      error: null,
      fallbackUsed: false,
    });
    return { content, fallbackUsed: false };
  } catch (error) {
    const fallbackContent = plan.fallback();
    await writeGeneration({
      useCase: plan.useCase,
      subjectKey: plan.subjectKey,
      model: plan.model,
      promptVersion,
      input: plan.input,
      output: fallbackContent,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: Date.now() - startedAt,
      status: STATUS_FAILED,
      error: trimText(errorMessage(error), 500),
      fallbackUsed: true,
    });
    return { content: fallbackContent, fallbackUsed: true };
  }
}

// ---------------------------------------------------------------------------
// Dựng dữ liệu vào từ kết quả engine
// ---------------------------------------------------------------------------

interface AttemptBundle {
  report: AttemptReport;
  enrollmentId: string;
  studentId: string;
  userId: string;
  subject: Subject;
  gradeBand: GradeBand;
  programName: string;
  examDate: Date | null;
}

async function loadAttemptBundle(attemptId: string): Promise<AttemptBundle | null> {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      status: true,
      enrollment: {
        select: {
          id: true,
          student: { select: { id: true, userId: true } },
          course: {
            select: { subject: true, gradeBand: true, program: { select: { name: true } } },
          },
          cohort: { select: { examDate: true } },
        },
      },
    },
  });
  if (!attempt || attempt.status === 'IN_PROGRESS') return null;

  const enrollment = attempt.enrollment;
  const report = await getAttemptReport(attempt.id, enrollment.student.userId);

  return {
    report,
    enrollmentId: enrollment.id,
    studentId: enrollment.student.id,
    userId: enrollment.student.userId,
    subject: enrollment.course.subject,
    gradeBand: enrollment.course.gradeBand,
    programName: enrollment.course.program.name,
    examDate: enrollment.cohort?.examDate ?? null,
  };
}

function anonymousStudent(input: {
  studentId: string;
  gradeBand: GradeBand;
  subject: Subject;
  levelLabel: string;
}): AnonymousStudent {
  return {
    nickname: nicknameOf(input.studentId),
    gradeBandLabel: GRADE_BAND_LABEL[input.gradeBand],
    subjectLabel: SUBJECT_LABEL[input.subject],
    currentLevelLabel: input.levelLabel,
  };
}

interface SkillSplit {
  strong: SkillOutcome[];
  weak: SkillOutcome[];
}

/**
 * Tách kỹ năng mạnh / yếu theo NGƯỠNG CẤU HÌNH, kèm tỷ lệ thời gian và nhãn lỗi
 * lấy từ chính các câu trong bài. AI chỉ nhận kết quả đã phân loại sẵn.
 */
function splitSkillOutcomes(report: AttemptReport, config: PlatformConfig): SkillSplit {
  interface SkillStat {
    timeMs: number;
    estimatedMs: number;
    errorLabels: string[];
  }

  const stats = new Map<string, SkillStat>();
  for (const item of report.items) {
    const stat = stats.get(item.skillId) ?? { timeMs: 0, estimatedMs: 0, errorLabels: [] };
    stat.timeMs += Math.max(0, item.timeMs);
    stat.estimatedMs += Math.max(0, item.estimatedTime) * 1000;
    if (!item.isCorrect && item.errorPatternLabel) stat.errorLabels.push(item.errorPatternLabel);
    stats.set(item.skillId, stat);
  }

  const masteryBySkill = new Map<string, number>();
  for (const chapter of report.masteryMap.chapters) {
    for (const skill of chapter.skills) masteryBySkill.set(skill.skillId, skill.masteryScore);
  }

  const outcomes: SkillOutcome[] = report.bySkill
    .filter((entry) => entry.total > 0)
    .map((entry) => {
      const stat = stats.get(entry.skillId);
      const timeRatio = stat && stat.estimatedMs > 0 ? round(stat.timeMs / stat.estimatedMs, 2) : null;
      return {
        skillName: entry.skillName,
        chapterName: entry.chapterName,
        correct: entry.correct,
        total: entry.total,
        accuracyPercent: round(entry.accuracy * 100),
        masteryScore: round(masteryBySkill.get(entry.skillId) ?? entry.estimatedMastery),
        timeRatio,
        errorLabels: [...new Set(stat?.errorLabels ?? [])],
      } satisfies SkillOutcome;
    });

  const mastered = config.recommendation.masteredThreshold;
  const gap = config.recommendation.gapThreshold;

  const strong = outcomes
    .filter((outcome) => outcome.masteryScore >= mastered || outcome.correct === outcome.total)
    .sort((a, b) => b.masteryScore - a.masteryScore || b.accuracyPercent - a.accuracyPercent)
    .slice(0, MAX_STRONG_SKILLS);

  const strongNames = new Set(strong.map((outcome) => outcome.skillName));
  const byWeakness = (a: SkillOutcome, b: SkillOutcome): number =>
    a.masteryScore - b.masteryScore || a.accuracyPercent - b.accuracyPercent;

  let weak = outcomes
    .filter(
      (outcome) =>
        !strongNames.has(outcome.skillName) &&
        (outcome.masteryScore < gap || outcome.accuracyPercent < gap),
    )
    .sort(byWeakness)
    .slice(0, MAX_WEAK_SKILLS);

  // Chưa skill nào rơi xuống ngưỡng hổng nhưng bài vẫn có câu sai: học sinh phải
  // biết sai ở đâu, nên lấy các kỹ năng còn sai và yếu nhất để nói cụ thể.
  if (weak.length === 0) {
    weak = outcomes
      .filter((outcome) => !strongNames.has(outcome.skillName) && outcome.correct < outcome.total)
      .sort(byWeakness)
      .slice(0, MAX_WEAK_SKILLS);
  }

  return { strong, weak };
}

function toPriorityInputs(report: AttemptReport): PriorityInput[] {
  return report.priorities.map((priority) => ({
    skillName: priority.skillName,
    chapterName: priority.chapterName,
    masteryScore: round(priority.masteryScore),
    tierLabel: priority.tierLabel,
    engineReason: priority.reason,
    blockedBySkillNames: priority.blockedBySkillNames,
  }));
}

// ---------------------------------------------------------------------------
// Nội dung "chưa có dữ liệu" — dùng khi không dựng được input (không ném lỗi)
// ---------------------------------------------------------------------------

const NO_DATA_HINT = 'Nếu tình trạng này kéo dài, em báo bộ phận hỗ trợ để được kiểm tra.';

function noDataDiagnostic(): DiagnosticCommentContent {
  return {
    summary: 'Hệ thống chưa lấy được dữ liệu bài làm nên chưa đưa ra nhận xét được.',
    strengths: [],
    weaknesses: [],
    priorities: [],
    encouragement: `Em thử mở lại báo cáo sau ít phút nhé. ${NO_DATA_HINT}`,
  };
}

function noDataProgress(): ProgressReportContent {
  return {
    summary: 'Hệ thống chưa lấy được dữ liệu chu kỳ này nên chưa lập được báo cáo tiến bộ.',
    improved: [],
    stillWeak: [],
    nextFocus: [`Em giữ nhịp học theo kế hoạch hiện tại. ${NO_DATA_HINT}`],
  };
}

function noDataTeacherBrief(): TeacherBriefContent {
  return {
    overview: 'Chưa lấy được dữ liệu buổi tư vấn này nên hệ thống chưa dựng được bản tóm tắt.',
    keyIssues: [],
    talkingPoints: ['Mở hồ sơ học sinh trong dashboard để xem trực tiếp mastery map và lịch sử làm bài.'],
    suggestedActions: ['Kiểm tra lại buổi tư vấn trong hệ thống hoặc báo bộ phận vận hành.'],
  };
}

// ---------------------------------------------------------------------------
// 1. Nhận xét sau bài kiểm tra đầu vào (specs §8.1)
// ---------------------------------------------------------------------------

function buildDiagnosticInput(bundle: AttemptBundle, config: PlatformConfig): DiagnosticCommentInput {
  const { report } = bundle;
  const split = splitSkillOutcomes(report, config);

  return {
    student: anonymousStudent({
      studentId: bundle.studentId,
      gradeBand: bundle.gradeBand,
      subject: bundle.subject,
      levelLabel: report.estimatedLevelLabel,
    }),
    assessmentTypeLabel: report.typeLabel,
    correctCount: report.rawScore,
    itemCount: report.maxScore > 0 ? report.maxScore : report.items.length,
    percent: round(report.percent),
    avgTimeRatio: round(report.avgTimeRatio, 2),
    totalMinutes: report.totalMinutes,
    estimatedLevelLabel: report.estimatedLevelLabel,
    strongSkills: split.strong,
    weakSkills: split.weak,
    priorities: toPriorityInputs(report),
    errorPatterns: report.errorPatterns.map((entry) => ({ label: entry.label, count: entry.count })),
  };
}

export async function generateDiagnosticComment(attemptId: string): Promise<DiagnosticCommentResult> {
  try {
    const config = await getConfig();
    const bundle = await loadAttemptBundle(attemptId);
    if (!bundle) return { ...noDataDiagnostic(), fallbackUsed: true };

    const input = buildDiagnosticInput(bundle, config);
    const tuning = tuningFrom(config);
    const skillOrder = input.priorities.map((priority) => priority.skillName);

    const outcome = await runGeneration<DiagnosticCommentContent>(
      {
        useCase: AI_USE_CASES.DIAGNOSTIC_COMMENT,
        subjectKey: `attempt:${attemptId}`,
        input,
        prompt: buildDiagnosticCommentPrompt(input),
        model: config.ai.model,
        validate: (raw) => validateDiagnostic(raw, skillOrder),
        fallback: () => buildDiagnosticCommentFallback(input, tuning),
      },
      config,
    );

    return { ...outcome.content, fallbackUsed: outcome.fallbackUsed };
  } catch (error) {
    console.error('[ai] generateDiagnosticComment lỗi', attemptId, error);
    return { ...noDataDiagnostic(), fallbackUsed: true };
  }
}

// ---------------------------------------------------------------------------
// 2. Báo cáo tiến bộ mỗi chu kỳ (specs §7.10)
// ---------------------------------------------------------------------------

async function buildProgressInput(bundle: AttemptBundle, config: PlatformConfig): Promise<ProgressReportInput> {
  const { report } = bundle;
  const split = splitSkillOutcomes(report, config);

  // Điểm lần trước: lấy từ bài đã nộp gần nhất TRƯỚC bài này.
  const attempts = await listAttempts(bundle.enrollmentId);
  const submittedAt = report.submittedAt?.getTime() ?? Date.now();
  const previous = attempts
    .filter((entry) => entry.submittedAt !== null && entry.submittedAt.getTime() < submittedAt)
    .sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0))[0];

  // Delta theo từng kỹ năng: mốc chụp gần nhất chính là mốc chụp khi nộp bài này.
  const delta = await getMasteryDelta(bundle.enrollmentId, { limit: MAX_WEAK_SKILLS });
  const toDelta = (entry: { skillName: string; before: number; after: number; delta: number }): SkillDeltaInput => ({
    skillName: entry.skillName,
    before: round(entry.before),
    after: round(entry.after),
    delta: round(entry.delta),
  });

  const masteryBefore = report.delta?.averageBefore ?? delta.averageBefore;
  const masteryAfter = report.delta?.averageAfter ?? delta.averageAfter;

  return {
    student: anonymousStudent({
      studentId: bundle.studentId,
      gradeBand: bundle.gradeBand,
      subject: bundle.subject,
      levelLabel: report.estimatedLevelLabel,
    }),
    cycleNo: report.cycleNo,
    correctCount: report.rawScore,
    itemCount: report.maxScore > 0 ? report.maxScore : report.items.length,
    percent: round(report.percent),
    previousPercent: previous ? round(previous.percent) : null,
    masteryBefore: round(masteryBefore),
    masteryAfter: round(masteryAfter),
    masteryDelta: round(report.delta?.averageDelta ?? delta.averageDelta),
    speedBefore: report.delta?.speedBefore !== undefined && report.delta?.speedBefore !== null
      ? round(report.delta.speedBefore, 2)
      : null,
    speedAfter: round(report.avgTimeRatio, 2),
    improvedSkills: delta.bySkill.filter((entry) => entry.delta > 0).map(toDelta),
    droppedSkills: delta.bySkill.filter((entry) => entry.delta < 0).map(toDelta),
    stillWeakSkills: split.weak,
    nextFocus: toPriorityInputs(report),
    errorsFixed: (report.delta?.errorsFixed ?? []).map((entry) => ({
      skillName: entry.skillName,
      label: entry.label,
    })),
    errorsRepeated: (report.delta?.errorsRepeated ?? []).map((entry) => ({
      skillName: entry.skillName,
      label: entry.label,
    })),
    daysToExam: bundle.examDate ? Math.max(0, daysUntil(bundle.examDate)) : null,
  };
}

export async function generateProgressReport(attemptId: string): Promise<ProgressReportResult> {
  try {
    const config = await getConfig();
    const bundle = await loadAttemptBundle(attemptId);
    if (!bundle) return { ...noDataProgress(), fallbackUsed: true };

    const input = await buildProgressInput(bundle, config);
    const tuning = tuningFrom(config);

    const outcome = await runGeneration<ProgressReportContent>(
      {
        useCase: AI_USE_CASES.PROGRESS_REPORT,
        subjectKey: `attempt:${attemptId}`,
        input,
        prompt: buildProgressReportPrompt(input),
        model: config.ai.model,
        validate: validateProgress,
        fallback: () => buildProgressReportFallback(input, tuning),
      },
      config,
    );

    return { ...outcome.content, fallbackUsed: outcome.fallbackUsed };
  } catch (error) {
    console.error('[ai] generateProgressReport lỗi', attemptId, error);
    return { ...noDataProgress(), fallbackUsed: true };
  }
}

// ---------------------------------------------------------------------------
// 3. Pre-session brief cho giáo viên (specs §9.3 — 7 khối)
// ---------------------------------------------------------------------------

/** Nhãn hiển thị tính khả thi của mục tiêu (specs §7.7). */
const FEASIBILITY_LABEL: Record<string, string> = {
  FEASIBLE: 'mục tiêu khả thi với quỹ thời gian đã khai',
  TIGHT: 'mục tiêu khả thi nhưng sát sao, phải bám lịch',
  INFEASIBLE: 'mục tiêu chưa khả thi với quỹ thời gian đã khai',
};

interface EngagementStats {
  completedDays: number;
  totalDays: number;
  completionRatePercent: number;
  minutesStudied: number;
  streakDays: number;
  itemsAnswered: number;
  accuracyPercent: number;
}

async function buildEngagement(enrollmentId: string, windowStart: Date): Promise<EngagementStats> {
  const planDays = await prisma.studyPlanDay.findMany({
    where: { plan: { enrollmentId }, date: { gte: windowStart, lte: vnToday() } },
    select: { status: true, actualMinutes: true, date: true },
    orderBy: { date: 'asc' },
  });

  const totalDays = planDays.length;
  const completedDays = planDays.filter((day) => day.status === 'COMPLETED').length;
  const minutesStudied = planDays.reduce((sum, day) => sum + Math.max(0, day.actualMinutes), 0);

  // Chuỗi ngày học liên tiếp tính ngược từ ngày gần nhất trong kế hoạch.
  let streakDays = 0;
  for (let index = planDays.length - 1; index >= 0; index -= 1) {
    if (planDays[index].status !== 'COMPLETED') break;
    streakDays += 1;
  }

  const answers = await prisma.itemAttempt.findMany({
    where: { enrollmentId, answeredAt: { not: null }, createdAt: { gte: windowStart } },
    select: { isCorrect: true },
  });
  const itemsAnswered = answers.length;
  const correct = answers.filter((row) => row.isCorrect === true).length;

  return {
    completedDays,
    totalDays,
    completionRatePercent: totalDays > 0 ? round((completedDays / totalDays) * 100) : 0,
    minutesStudied,
    streakDays,
    itemsAnswered,
    accuracyPercent: itemsAnswered > 0 ? round((correct / itemsAnswered) * 100) : 0,
  };
}

function toBriefSkill(skill: MasteryMapSkill) {
  return {
    skillName: skill.skillName,
    chapterName: skill.chapterName,
    masteryScore: round(skill.masteryScore),
    confidence: round(skill.confidence, 2),
  };
}

async function buildTeacherBriefInput(sessionId: string, config: PlatformConfig): Promise<TeacherBriefInput | null> {
  const session = await prisma.teacherSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      cycleNo: true,
      enrollment: {
        select: {
          id: true,
          estimatedLevel: true,
          student: { select: { id: true, userId: true } },
          course: { select: { subject: true, gradeBand: true, program: { select: { name: true } } } },
          cohort: { select: { examDate: true } },
        },
      },
    },
  });
  if (!session) return null;

  const enrollment = session.enrollment;
  const enrollmentId = enrollment.id;
  const windowStart = addDays(vnToday(), -Math.max(1, config.assessment.cycleDays));

  const [attempts, masteryMap, delta, errorStats, goal, engagement, assessmentStatus, lastAttempt] = await Promise.all([
    listAttempts(enrollmentId),
    getMasteryMap(enrollmentId),
    getMasteryDelta(enrollmentId, {}),
    getTopErrorPatterns(enrollmentId, ERROR_PATTERN_LIMIT),
    prisma.goal.findFirst({
      where: { enrollmentId, active: true },
      orderBy: { createdAt: 'desc' },
      select: { targetLevel: true, deadline: true, feasibility: true },
    }),
    buildEngagement(enrollmentId, windowStart),
    getAssessmentStatus(enrollmentId),
    prisma.itemAttempt.findFirst({
      where: { enrollmentId, answeredAt: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  const submitted = attempts
    .filter((entry) => entry.submittedAt !== null)
    .sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0));
  const latest = submitted[0] ?? null;
  const baseline = submitted.find((entry) => entry.type === 'DIAGNOSTIC') ?? submitted[submitted.length - 1] ?? null;

  const latestReport = latest ? await getAttemptReport(latest.attemptId, enrollment.student.userId) : null;

  // Mã câu ví dụ cho từng loại lỗi — giáo viên mở lại đúng câu (specs §9.3).
  const exampleIds = [...new Set(errorStats.flatMap((stat) => stat.exampleItemIds))];
  const exampleItems = exampleIds.length
    ? await prisma.questionItem.findMany({
        where: { id: { in: exampleIds } },
        select: { id: true, itemCode: true },
      })
    : [];
  const codeById = new Map(exampleItems.map((item) => [item.id, item.itemCode]));

  const measured = masteryMap.chapters
    .flatMap((chapter) => chapter.skills)
    .filter((skill) => skill.attemptCount > 0);
  const ascending = [...measured].sort((a, b) => a.masteryScore - b.masteryScore);
  const gaps = ascending.slice(0, MASTERY_HIGHLIGHT_COUNT);
  const gapNames = new Set(gaps.map((skill) => skill.skillId));
  const strengths = [...ascending]
    .reverse()
    .filter((skill) => !gapNames.has(skill.skillId))
    .slice(0, MASTERY_HIGHLIGHT_COUNT);

  // Cảnh báo lấy đúng ngưỡng admin cấu hình (specs §9.3 "thẻ cảnh báo").
  const alerts = config.teacher.alerts;
  const warnings: string[] = [];

  const inactiveDays = lastAttempt ? Math.max(0, -daysUntil(lastAttempt.createdAt)) : null;
  if (inactiveDays !== null && inactiveDays >= alerts.inactiveDays) {
    warnings.push(`Đã ${inactiveDays} ngày không làm bài (ngưỡng cảnh báo ${alerts.inactiveDays} ngày)`);
  } else if (inactiveDays === null) {
    warnings.push('Chưa ghi nhận lần làm bài nào');
  }
  if (delta.averageDelta <= -Math.abs(alerts.masteryDropPoints)) {
    warnings.push(`Mastery trung bình giảm ${round(Math.abs(delta.averageDelta))} điểm so với mốc trước`);
  }
  if (assessmentStatus.isOverdue) {
    warnings.push('Bài kiểm tra tiến bộ đã quá hạn');
  }
  if (goal && FEASIBILITY_LABEL[goal.feasibility] && goal.feasibility !== 'FEASIBLE') {
    warnings.push(`Mục tiêu hiện tại: ${FEASIBILITY_LABEL[goal.feasibility]}`);
  }

  const wrongRows = await prisma.itemAttempt.findMany({
    where: { enrollmentId, isCorrect: false, createdAt: { gte: windowStart } },
    select: { item: { select: { skillId: true, skill: { select: { name: true } } } } },
  });
  const wrongBySkill = new Map<string, { name: string; count: number }>();
  for (const row of wrongRows) {
    const current = wrongBySkill.get(row.item.skillId) ?? { name: row.item.skill.name, count: 0 };
    current.count += 1;
    wrongBySkill.set(row.item.skillId, current);
  }
  const worstSkill = [...wrongBySkill.values()].sort((a, b) => b.count - a.count)[0];
  if (worstSkill && worstSkill.count >= alerts.repeatedWrongSameSkill) {
    warnings.push(`Sai ${worstSkill.count} câu ở kỹ năng ${worstSkill.name} trong chu kỳ này`);
  }

  const examDate = enrollment.cohort?.examDate ?? null;

  return {
    student: anonymousStudent({
      studentId: enrollment.student.id,
      gradeBand: enrollment.course.gradeBand,
      subject: enrollment.course.subject,
      levelLabel: levelLabelOf(enrollment.estimatedLevel, config),
    }),
    cycleNo: session.cycleNo,
    programName: enrollment.course.program.name,
    examDateLabel: examDate ? formatDateVN(examDate) : null,
    daysToExam: examDate ? Math.max(0, daysUntil(examDate)) : null,
    targetLevelLabel: goal ? levelLabelOf(goal.targetLevel, config) : null,
    goalDeadlineLabel: goal ? formatDateVN(goal.deadline) : null,
    feasibilityLabel: goal ? (FEASIBILITY_LABEL[goal.feasibility] ?? null) : null,
    baselinePercent: baseline ? round(baseline.percent) : null,
    latestPercent: latest ? round(latest.percent) : null,
    percentDelta: latest && baseline && latest.attemptId !== baseline.attemptId
      ? round(latest.percent - baseline.percent)
      : null,
    masteryDelta: round(delta.averageDelta),
    speedRatio: latestReport ? round(latestReport.avgTimeRatio, 2) : null,
    strengths: strengths.map(toBriefSkill),
    gaps: gaps.map(toBriefSkill),
    errorPatterns: errorStats.map((stat) => ({
      label: stat.label,
      count: stat.count,
      exampleItemCodes: stat.exampleItemIds
        .map((id) => codeById.get(id))
        .filter((code): code is string => typeof code === 'string'),
    })),
    engagement,
    priorities: latestReport ? toPriorityInputs(latestReport) : [],
    warnings,
  };
}

export async function generateTeacherBrief(sessionId: string): Promise<TeacherBriefResult> {
  try {
    const config = await getConfig();
    const input = await buildTeacherBriefInput(sessionId, config);
    if (!input) return { ...noDataTeacherBrief(), fallbackUsed: true };

    const tuning = tuningFrom(config);
    const outcome = await runGeneration<TeacherBriefContent>(
      {
        useCase: AI_USE_CASES.TEACHER_BRIEF,
        subjectKey: `session:${sessionId}`,
        input,
        prompt: buildTeacherBriefPrompt(input),
        model: config.ai.model,
        validate: validateTeacherBrief,
        fallback: () => buildTeacherBriefFallback(input, tuning),
      },
      config,
    );

    return { ...outcome.content, fallbackUsed: outcome.fallbackUsed };
  } catch (error) {
    console.error('[ai] generateTeacherBrief lỗi', sessionId, error);
    return { ...noDataTeacherBrief(), fallbackUsed: true };
  }
}

// ---------------------------------------------------------------------------
// 4. Giải thích lời giải (specs §8.1, §8.2)
// ---------------------------------------------------------------------------

/** Diễn đạt đáp án đúng thành chuỗi đọc được; KHÔNG suy luận lại đáp án. */
function formatCorrectAnswer(
  questionType: string,
  correctAnswer: unknown,
  options: ItemOption[],
): string {
  const textByKey = new Map(options.map((option) => [option.key.trim().toUpperCase(), option.text]));

  const describeKey = (value: unknown): string => {
    const key = typeof value === 'string' ? value.trim().toUpperCase() : String(value);
    const text = textByKey.get(key);
    return text ? `${key}. ${text}` : key;
  };

  if (questionType === 'SINGLE_CHOICE' || questionType === 'MULTIPLE_CHOICE') {
    const values = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
    return values.map(describeKey).join('; ');
  }

  if (Array.isArray(correctAnswer)) {
    return correctAnswer.map((value) => String(value)).join(' hoặc ');
  }
  if (correctAnswer === null || correctAnswer === undefined) return '';
  return String(correctAnswer);
}

function parseSteps(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

export async function explainSolution(input: ExplainSolutionInput): Promise<SolutionExplanationResult> {
  const item = await prisma.questionItem
    .findUnique({
      where: { id: input.itemId },
      select: {
        id: true,
        status: true,
        version: true,
        gradeBand: true,
        subject: true,
        difficulty: true,
        questionType: true,
        stem: true,
        options: true,
        correctAnswer: true,
        solution: true,
        solutionSteps: true,
        hint: true,
        skill: { select: { name: true, chapter: { select: { name: true } } } },
      },
    })
    .catch((error: unknown) => {
      console.error('[ai] explainSolution không đọc được câu hỏi', input.itemId, error);
      return null;
    });

  if (!item) {
    return {
      explanation: 'Hệ thống chưa lấy được dữ liệu câu hỏi nên chưa giảng lại được. Em thử lại sau ít phút nhé.',
      fallbackUsed: true,
    };
  }

  // NGOẠI LỆ DUY NHẤT được phép ném: câu chưa xuất bản thì không ai được xem
  // lời giải, kể cả qua đường AI (specs §8.2 — chỉ dùng nội dung đã kiểm duyệt).
  if (item.status !== 'PUBLISHED') {
    throw ApiError.forbidden('Câu hỏi chưa được xuất bản nên chưa thể sinh phần giải thích.');
  }

  try {
    const config = await getConfig();
    const options = parseOptions(item.options);
    const promptInput: SolutionExplanationInput = {
      level: input.level,
      gradeBandLabel: GRADE_BAND_LABEL[item.gradeBand],
      subjectLabel: SUBJECT_LABEL[item.subject],
      chapterName: item.skill.chapter.name,
      skillName: item.skill.name,
      difficultyLabel: DIFFICULTY_LABEL[item.difficulty],
      questionTypeLabel: QUESTION_TYPE_LABEL[item.questionType],
      stem: item.stem,
      options,
      correctAnswerText: formatCorrectAnswer(item.questionType, item.correctAnswer, options),
      solution: item.solution,
      solutionSteps: parseSteps(item.solutionSteps),
      hint: item.hint,
    };

    const outcome = await runGeneration<SolutionExplanationContent>(
      {
        useCase: AI_USE_CASES.SOLUTION_EXPLANATION,
        // Kèm version câu hỏi: biên tập sửa lời giải là cache tự hết hạn.
        subjectKey: `item:${item.id}:${input.level}:v${item.version}`,
        input: promptInput,
        prompt: buildSolutionExplanationPrompt(promptInput),
        // Mức ngắn dùng model rẻ: khối lượng lớn, yêu cầu suy luận thấp.
        model: input.level === 'DETAILED' ? config.ai.model : config.ai.cheapModel,
        validate: validateExplanation,
        fallback: () => buildSolutionExplanationFallback(promptInput),
      },
      config,
    );

    return { ...outcome.content, fallbackUsed: outcome.fallbackUsed };
  } catch (error) {
    console.error('[ai] explainSolution lỗi', input.itemId, error);
    return {
      explanation: 'Hệ thống chưa giảng lại được câu này. Em xem tạm lời giải chuẩn phía dưới nhé.',
      fallbackUsed: true,
    };
  }
}

// ---------------------------------------------------------------------------
// 5. Gợi ý metadata cho câu hỏi mới — CHỈ GỢI Ý, người duyệt (specs §8.1)
// ---------------------------------------------------------------------------

function fallbackMetadataNote(): ItemMetadataContent {
  return {
    suggestedSkillCodes: [],
    suggestedDifficulty: 'AVERAGE',
    suggestedTags: [],
    confidence: 0,
    note: `Hệ thống chưa đọc được danh mục kỹ năng nên chưa gợi ý được. ${HUMAN_APPROVAL_NOTE}`,
  };
}

async function buildItemMetadataInput(input: SuggestItemMetadataInput): Promise<ItemMetadataInput> {
  const skills = await prisma.skill.findMany({
    where: { chapter: { subject: input.subject, gradeBand: input.gradeBand } },
    select: { code: true, name: true, chapter: { select: { name: true } } },
    orderBy: [{ chapter: { order: 'asc' } }, { order: 'asc' }],
    take: SKILL_CATALOG_LIMIT,
  });

  const tagRows = await prisma.questionItem.findMany({
    where: { subject: input.subject, gradeBand: input.gradeBand, status: 'PUBLISHED' },
    select: { tags: true },
    orderBy: { updatedAt: 'desc' },
    take: TAG_SAMPLE_ITEMS,
  });
  const tagCount = new Map<string, number>();
  for (const row of tagRows) {
    for (const tag of row.tags) {
      const cleaned = tag.trim();
      if (cleaned === '') continue;
      tagCount.set(cleaned, (tagCount.get(cleaned) ?? 0) + 1);
    }
  }
  const knownTags = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, KNOWN_TAG_LIMIT)
    .map(([tag]) => tag);

  return {
    stem: input.stem,
    options: (input.options ?? []).map((option) => ({ key: option.key, text: option.text })),
    solution: input.solution,
    subjectLabel: SUBJECT_LABEL[input.subject],
    gradeBandLabel: GRADE_BAND_LABEL[input.gradeBand],
    skillCatalog: skills.map((skill) => ({
      code: skill.code,
      name: skill.name,
      chapterName: skill.chapter.name,
    })),
    difficultyOptions: DIFFICULTIES.map((value) => ({ value, label: DIFFICULTY_LABEL[value] })),
    knownTags,
  };
}

export async function suggestItemMetadata(input: SuggestItemMetadataInput): Promise<ItemMetadataResult> {
  try {
    const config = await getConfig();
    const promptInput = await buildItemMetadataInput(input);
    if (promptInput.skillCatalog.length === 0) {
      return { ...fallbackMetadataNote(), fallbackUsed: true };
    }

    // Câu hỏi mới chưa có id → khóa cache là vân tay nội dung.
    const fingerprint = createHash('sha256')
      // Dấu phân cách không thể xuất hiện trong nội dung câu hỏi, tránh hai đầu
      // vào khác nhau vô tình ghép thành cùng một chuỗi băm.
      .update([input.subject, input.gradeBand, input.stem, input.solution].join(' '))
      .digest('hex')
      .slice(0, 32);
    const catalogCodes = promptInput.skillCatalog.map((skill) => skill.code);

    const outcome = await runGeneration<ItemMetadataContent>(
      {
        useCase: AI_USE_CASES.ITEM_METADATA,
        subjectKey: `draft:${fingerprint}`,
        input: promptInput,
        prompt: buildItemMetadataPrompt(promptInput),
        // Việc phân loại metadata chạy hàng loạt khi nhập kho → dùng model rẻ.
        model: config.ai.cheapModel,
        validate: (raw) => validateMetadata(raw, catalogCodes),
        fallback: () => buildItemMetadataFallback(promptInput),
      },
      config,
    );

    return { ...outcome.content, fallbackUsed: outcome.fallbackUsed };
  } catch (error) {
    console.error('[ai] suggestItemMetadata lỗi', error);
    return { ...fallbackMetadataNote(), fallbackUsed: true };
  }
}

// ---------------------------------------------------------------------------
// Vận hành: xóa cache & thống kê sử dụng (specs §15 Observability)
// ---------------------------------------------------------------------------

/**
 * Xóa nội dung đã sinh để lần gọi sau tạo lại. Bỏ trống `subjectKey` là xóa cả
 * use case (dùng khi đổi prompt thủ công hoặc khi phát hiện nội dung sai).
 */
export async function invalidateAiCache(useCase: AiUseCase, subjectKey?: string): Promise<number> {
  try {
    const result = await prisma.aiGeneration.deleteMany({
      where: { useCase, ...(subjectKey ? { subjectKey } : {}) },
    });
    return result.count;
  } catch (error) {
    console.error('[ai] không xóa được cache AiGeneration', useCase, subjectKey, error);
    return 0;
  }
}

export async function getAiUsageStats(range: AiUsageRange = {}): Promise<AiUsageStats> {
  const to = range.to ?? new Date();
  const from =
    range.from ?? addDays(to, -Math.max(1, Math.floor(range.days ?? DEFAULT_USAGE_WINDOW_DAYS)));

  const empty: AiUsageStats = {
    from,
    to,
    total: 0,
    fallbackCount: 0,
    failedCount: 0,
    fallbackRate: 0,
    avgLatencyMs: 0,
    totalTokens: 0,
    byUseCase: [],
  };

  try {
    const rows = await prisma.aiGeneration.groupBy({
      by: ['useCase', 'status', 'fallbackUsed'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { tokensIn: true, tokensOut: true, latencyMs: true },
    });

    interface Bucket {
      total: number;
      fallbackCount: number;
      failedCount: number;
      totalTokens: number;
      llmCalls: number;
      llmLatencyMs: number;
    }
    const buckets = new Map<string, Bucket>();

    for (const row of rows) {
      const bucket = buckets.get(row.useCase) ?? {
        total: 0,
        fallbackCount: 0,
        failedCount: 0,
        totalTokens: 0,
        llmCalls: 0,
        llmLatencyMs: 0,
      };
      const count = row._count._all;
      bucket.total += count;
      if (row.fallbackUsed) bucket.fallbackCount += count;
      if (row.status === STATUS_FAILED) bucket.failedCount += count;
      bucket.totalTokens += (row._sum.tokensIn ?? 0) + (row._sum.tokensOut ?? 0);
      // Chỉ lời gọi LLM thật mới có ý nghĩa về độ trễ; bản template luôn ~0ms.
      if (!row.fallbackUsed) {
        bucket.llmCalls += count;
        bucket.llmLatencyMs += row._sum.latencyMs ?? 0;
      }
      buckets.set(row.useCase, bucket);
    }

    const byUseCase: AiUseCaseUsage[] = [...buckets.entries()]
      .map(([useCase, bucket]) => ({
        useCase,
        label: AI_USE_CASE_LABEL[useCase as AiUseCase] ?? useCase,
        total: bucket.total,
        fallbackCount: bucket.fallbackCount,
        failedCount: bucket.failedCount,
        fallbackRate: bucket.total > 0 ? round(bucket.fallbackCount / bucket.total, 3) : 0,
        avgLatencyMs: bucket.llmCalls > 0 ? Math.round(bucket.llmLatencyMs / bucket.llmCalls) : 0,
        totalTokens: bucket.totalTokens,
      }))
      .sort((a, b) => b.total - a.total);

    const total = byUseCase.reduce((sum, entry) => sum + entry.total, 0);
    const fallbackCount = byUseCase.reduce((sum, entry) => sum + entry.fallbackCount, 0);
    const failedCount = byUseCase.reduce((sum, entry) => sum + entry.failedCount, 0);
    const totalTokens = byUseCase.reduce((sum, entry) => sum + entry.totalTokens, 0);
    const llmCalls = [...buckets.values()].reduce((sum, bucket) => sum + bucket.llmCalls, 0);
    const llmLatencyMs = [...buckets.values()].reduce((sum, bucket) => sum + bucket.llmLatencyMs, 0);

    return {
      from,
      to,
      total,
      fallbackCount,
      failedCount,
      fallbackRate: total > 0 ? round(fallbackCount / total, 3) : 0,
      avgLatencyMs: llmCalls > 0 ? Math.round(llmLatencyMs / llmCalls) : 0,
      totalTokens,
      byUseCase,
    };
  } catch (error) {
    console.error('[ai] không đọc được thống kê AiGeneration', error);
    return empty;
  }
}
