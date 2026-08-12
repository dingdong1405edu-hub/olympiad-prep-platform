/**
 * Schema zod + bất biến dùng chung của module Content Bank.
 *
 * Mọi ràng buộc "một câu hỏi thế nào là hợp lệ" nằm ở đây để form CRUD và
 * đường import dùng CHUNG một luật — tránh tình trạng import lọt câu mà CRUD
 * chặn (hoặc ngược lại).
 */
import { z } from 'zod';
import type {
  Difficulty,
  GradeBand,
  ItemStatus,
  QuestionType,
  Subject,
} from '@prisma/client';
import type { RecommendationConfig } from '@/lib/config/defaults';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '@/lib/domain';

// ---------------------------------------------------------------------------
// Enum dưới dạng giá trị runtime (zod cần mảng literal)
// ---------------------------------------------------------------------------

export const SUBJECT_VALUES = [
  'MATH',
  'SCIENCE',
  'PHYSICS',
  'CHEMISTRY',
  'BIOLOGY',
  'IT',
] as const satisfies readonly Subject[];

export const GRADE_BAND_VALUES = ['A', 'B', 'C', 'D'] as const satisfies readonly GradeBand[];

export const DIFFICULTY_VALUES = [
  'AVERAGE',
  'GOOD',
  'EXCELLENT',
] as const satisfies readonly Difficulty[];

export const QUESTION_TYPE_VALUES = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'NUMERIC',
  'SHORT_ANSWER',
] as const satisfies readonly QuestionType[];

export const ITEM_STATUS_VALUES = [
  'DRAFT',
  'REVIEWED',
  'PUBLISHED',
  'FLAGGED',
  'RETIRED',
] as const satisfies readonly ItemStatus[];

export const FLAG_STATUS_VALUES = ['OPEN', 'RESOLVED', 'REJECTED'] as const;

export const subjectSchema = z.enum(SUBJECT_VALUES);
export const gradeBandSchema = z.enum(GRADE_BAND_VALUES);
export const difficultySchema = z.enum(DIFFICULTY_VALUES);
export const questionTypeSchema = z.enum(QUESTION_TYPE_VALUES);
export const itemStatusSchema = z.enum(ITEM_STATUS_VALUES);
export const flagStatusSchema = z.enum(FLAG_STATUS_VALUES);

/**
 * Cờ boolean gửi từ query string/form.
 * KHÔNG dùng z.coerce.boolean() vì Boolean("false") === true — cấu hình dryRun
 * mà hiểu sai một lần là ghi thẳng vào kho câu hỏi.
 */
const booleanFlagSchema = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase()),
  );

/** Nhận cả mảng lẫn chuỗi "A,B" từ query string. */
const stringListSchema = z
  .union([z.array(z.string()), z.string()])
  .transform((value) =>
    (Array.isArray(value) ? value : value.split(','))
      .map((v) => v.trim())
      .filter((v) => v.length > 0),
  );

// ---------------------------------------------------------------------------
// Phương án trả lời & tính nhất quán của đáp án
// ---------------------------------------------------------------------------

export interface ItemOption {
  key: string;
  text: string;
  imageUrl?: string;
}

export const itemOptionSchema = z.object({
  key: z.string().trim().min(1, 'Mỗi phương án phải có ký hiệu (A, B, C…).').max(8),
  text: z.string().trim().min(1, 'Phương án không được để trống.').max(2000),
  imageUrl: z.string().trim().url('Ảnh phương án phải là URL hợp lệ.').optional(),
});

export const correctAnswerSchema = z.union([
  z.string().trim().min(1),
  z.array(z.string().trim().min(1)).min(1),
  z.number(),
]);

export type CorrectAnswerValue = z.infer<typeof correctAnswerSchema>;

/** Ép dữ liệu options thô (từ DB dạng Json) về mảng phương án có kiểu. */
export function parseOptions(raw: unknown): ItemOption[] {
  if (!Array.isArray(raw)) return [];
  const out: ItemOption[] = [];
  raw.forEach((entry, index) => {
    if (typeof entry === 'string') {
      out.push({ key: autoOptionKey(index), text: entry });
      return;
    }
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const key = typeof record.key === 'string' && record.key.trim() ? record.key.trim() : autoOptionKey(index);
      const text = typeof record.text === 'string' ? record.text.trim() : '';
      if (!text) return;
      const imageUrl = typeof record.imageUrl === 'string' && record.imageUrl.trim() ? record.imageUrl.trim() : undefined;
      out.push(imageUrl ? { key, text, imageUrl } : { key, text });
    }
  });
  return out;
}

/** Ký hiệu phương án tự sinh: 0 → A, 1 → B… */
export function autoOptionKey(index: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return index < alphabet.length ? alphabet[index] : `O${index + 1}`;
}

/**
 * Kiểm tra đáp án có khớp loại câu và danh sách phương án hay không.
 * Trả về thông điệp lỗi tiếng Việt, hoặc null nếu hợp lệ.
 * Đây là luật chặn cuối cùng trước khi một câu được ghi/xuất bản.
 */
export function checkAnswerConsistency(input: {
  questionType: QuestionType;
  options: ItemOption[];
  correctAnswer: unknown;
}): string | null {
  const { questionType, options, correctAnswer } = input;
  const keys = options.map((o) => o.key.trim().toUpperCase());

  if (questionType === 'SINGLE_CHOICE' || questionType === 'MULTIPLE_CHOICE') {
    if (options.length < 2) {
      return 'Câu trắc nghiệm phải có ít nhất 2 phương án trả lời.';
    }
    if (new Set(keys).size !== keys.length) {
      return 'Các phương án bị trùng ký hiệu (A, B, C…).';
    }
  }

  if (questionType === 'SINGLE_CHOICE') {
    if (typeof correctAnswer !== 'string' || !correctAnswer.trim()) {
      return 'Câu 1 đáp án phải ghi đúng một ký hiệu phương án (ví dụ: A).';
    }
    if (!keys.includes(correctAnswer.trim().toUpperCase())) {
      return `Đáp án "${correctAnswer}" không nằm trong danh sách phương án (${keys.join(', ')}).`;
    }
    return null;
  }

  if (questionType === 'MULTIPLE_CHOICE') {
    if (!Array.isArray(correctAnswer) || correctAnswer.length === 0) {
      return 'Câu nhiều đáp án phải liệt kê ít nhất một ký hiệu phương án đúng.';
    }
    const answers = correctAnswer.map((a) => String(a).trim().toUpperCase());
    const missing = answers.filter((a) => !keys.includes(a));
    if (missing.length > 0) {
      return `Đáp án "${missing.join(', ')}" không nằm trong danh sách phương án (${keys.join(', ')}).`;
    }
    if (new Set(answers).size !== answers.length) {
      return 'Danh sách đáp án đúng bị lặp ký hiệu.';
    }
    return null;
  }

  if (questionType === 'NUMERIC') {
    if (typeof correctAnswer !== 'number' || !Number.isFinite(correctAnswer)) {
      return 'Câu điền số phải có đáp án là một số hợp lệ.';
    }
    return null;
  }

  // SHORT_ANSWER
  if (typeof correctAnswer !== 'string' || !correctAnswer.trim()) {
    return 'Câu trả lời ngắn phải có đáp án chuẩn dạng chuỗi.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Giá trị mặc định suy từ cấu hình (không hard-code — specs §19.2 #4)
// ---------------------------------------------------------------------------

/**
 * Thời gian chuẩn mặc định của một câu (giây) khi người nhập bỏ trống.
 * Suy từ quỹ thời gian tối thiểu / số câu tối thiểu mỗi ngày trong cấu hình
 * engine, để lịch học không bị lệch so với tải/ngày đang đặt.
 */
export function defaultEstimatedTimeSeconds(config: RecommendationConfig): number {
  const items = Math.max(1, config.minItemsPerDay);
  const minutes = Math.max(1, config.minMinutesPerDay);
  return Math.max(1, Math.round((minutes / items) * 60));
}

/** Thang difficultyNumeric 1..10 do schema quy định. */
export const DIFFICULTY_NUMERIC_MIN = 1;
export const DIFFICULTY_NUMERIC_MAX = 10;

/** Quy đổi bậc độ khó sang thang 1..10 khi người nhập không khai. */
export function defaultDifficultyNumeric(difficulty: Difficulty): number {
  const step = DIFFICULTY_NUMERIC_MAX / DIFFICULTIES.length;
  return Math.round((DIFFICULTY_ORDER[difficulty] + 1) * step);
}

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

const codeSchema = z
  .string()
  .trim()
  .min(2, 'Mã phải có ít nhất 2 ký tự.')
  .max(48, 'Mã tối đa 48 ký tự.')
  .regex(/^[A-Za-z0-9._-]+$/, 'Mã chỉ gồm chữ, số và ký tự . _ -')
  .transform((v) => v.toUpperCase());

export const chapterFilterSchema = z.object({
  subject: subjectSchema.optional(),
  gradeBand: gradeBandSchema.optional(),
  search: z.string().trim().max(120).optional(),
});
export type ChapterFilter = z.infer<typeof chapterFilterSchema>;

export const upsertChapterSchema = z.object({
  id: z.string().trim().min(1).optional(),
  subject: subjectSchema,
  gradeBand: gradeBandSchema,
  code: codeSchema,
  name: z.string().trim().min(2, 'Tên chương quá ngắn.').max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  order: z.number().int().min(0).max(999).default(0),
  blueprintWeight: z
    .number()
    .positive('Tỷ trọng blueprint phải lớn hơn 0.')
    .max(100)
    .default(1),
});
export type UpsertChapterInput = z.infer<typeof upsertChapterSchema>;

export const skillFilterSchema = z.object({
  subject: subjectSchema.optional(),
  gradeBand: gradeBandSchema.optional(),
  chapterId: z.string().trim().min(1).optional(),
  search: z.string().trim().max(120).optional(),
});
export type SkillFilter = z.infer<typeof skillFilterSchema>;

export const upsertSkillSchema = z.object({
  id: z.string().trim().min(1).optional(),
  chapterId: z.string().trim().min(1, 'Phải chọn chương cho kỹ năng.'),
  code: codeSchema,
  name: z.string().trim().min(2, 'Tên kỹ năng quá ngắn.').max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  order: z.number().int().min(0).max(999).default(0),
  blueprintWeight: z.number().positive('Tỷ trọng blueprint phải lớn hơn 0.').max(100).default(1),
});
export type UpsertSkillInput = z.infer<typeof upsertSkillSchema>;

export const setPrerequisitesSchema = z.object({
  skillId: z.string().trim().min(1),
  prerequisiteSkillIds: z.array(z.string().trim().min(1)).max(20, 'Tối đa 20 kỹ năng tiên quyết.'),
});

// ---------------------------------------------------------------------------
// Câu hỏi
// ---------------------------------------------------------------------------

const itemBaseSchema = z.object({
  itemCode: codeSchema,
  skillId: z.string().trim().min(1, 'Phải chọn kỹ năng cho câu hỏi.'),
  /** Không bắt buộc: nếu gửi lên thì phải khớp chương của kỹ năng. */
  chapterId: z.string().trim().min(1).optional(),
  programScope: z.array(z.string().trim().min(1).max(32).toUpperCase()).max(20).default([]),
  actualGradeScope: z.array(z.number().int().min(1).max(12)).max(12).default([]),
  difficulty: difficultySchema,
  difficultyNumeric: z
    .number()
    .int()
    .min(DIFFICULTY_NUMERIC_MIN)
    .max(DIFFICULTY_NUMERIC_MAX)
    .optional(),
  questionType: questionTypeSchema.default('SINGLE_CHOICE'),
  stem: z.string().trim().min(5, 'Nội dung câu hỏi quá ngắn.').max(8000),
  stemImageUrl: z.string().trim().max(500).optional().nullable(),
  options: z.array(itemOptionSchema).max(12).default([]),
  correctAnswer: correctAnswerSchema,
  answerTolerance: z.number().min(0).optional().nullable(),
  solution: z
    .string()
    .trim()
    .min(5, 'Lời giải chuẩn là bắt buộc — đây là nguồn grounding duy nhất cho AI.')
    .max(20000),
  solutionSteps: z.array(z.string().trim().min(1).max(2000)).max(30).default([]),
  hint: z.string().trim().max(2000).optional().nullable(),
  estimatedTime: z.number().int().positive('Thời gian chuẩn phải lớn hơn 0 giây.').max(7200).optional(),
  tags: z.array(z.string().trim().min(1).max(48)).max(30).default([]),
  sourceNote: z.string().trim().max(500).optional().nullable(),
});

export const createItemSchema = itemBaseSchema.superRefine((value, ctx) => {
  const message = checkAnswerConsistency({
    questionType: value.questionType,
    options: value.options,
    correctAnswer: value.correctAnswer,
  });
  if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['correctAnswer'], message });
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = itemBaseSchema
  .omit({ itemCode: true })
  .partial()
  .extend({
    /** Lý do sửa — ghi vào QuestionItemVersion để truy vết ai sửa gì, vì sao. */
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.questionType && value.options && value.correctAnswer !== undefined) {
      const message = checkAnswerConsistency({
        questionType: value.questionType,
        options: value.options,
        correctAnswer: value.correctAnswer,
      });
      if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['correctAnswer'], message });
    }
  });
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const itemFilterSchema = z.object({
  search: z.string().trim().max(200).optional(),
  subject: subjectSchema.optional(),
  gradeBand: gradeBandSchema.optional(),
  chapterId: z.string().trim().min(1).optional(),
  skillId: z.string().trim().min(1).optional(),
  difficulty: difficultySchema.optional(),
  status: itemStatusSchema.optional(),
  programCode: z.string().trim().min(1).max(32).toUpperCase().optional(),
  tag: z.string().trim().min(1).max(48).optional(),
  /** Chỉ lấy câu đang có báo lỗi chưa xử lý. */
  hasOpenFlags: booleanFlagSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.enum(['RECENT', 'CODE', 'MOST_SERVED', 'MOST_REPORTED', 'LOWEST_DISCRIMINATION']).default('RECENT'),
});
export type ItemFilter = z.infer<typeof itemFilterSchema>;

export const transitionItemSchema = z.object({
  status: itemStatusSchema,
  note: z.string().trim().max(500).optional(),
});

export const bulkUpdateItemsSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1, 'Chưa chọn câu hỏi nào.').max(500, 'Mỗi lần tối đa 500 câu.'),
  patch: z
    .object({
      status: itemStatusSchema.optional(),
      difficulty: difficultySchema.optional(),
      /** Thay thế TOÀN BỘ tag hiện có, không cộng dồn. */
      tags: z.array(z.string().trim().min(1).max(48)).max(30).optional(),
      programScope: z.array(z.string().trim().min(1).max(32).toUpperCase()).max(20).optional(),
    })
    .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
      message: 'Không có trường nào để cập nhật hàng loạt.',
    }),
});
export type BulkUpdatePatch = z.infer<typeof bulkUpdateItemsSchema>['patch'];

// ---------------------------------------------------------------------------
// Báo lỗi câu hỏi
// ---------------------------------------------------------------------------

export const flagItemSchema = z.object({
  itemId: z.string().trim().min(1),
  reporterId: z.string().trim().min(1).optional().nullable(),
  reporterRole: z.string().trim().min(1).max(32).default('STUDENT'),
  reason: z.string().trim().min(3, 'Hãy mô tả ngắn gọn lỗi gặp phải.').max(200),
  detail: z.string().trim().max(2000).optional().nullable(),
});
export type FlagItemInput = z.infer<typeof flagItemSchema>;

export const flagFilterSchema = z.object({
  status: flagStatusSchema.optional(),
  itemId: z.string().trim().min(1).optional(),
  reporterRole: z.string().trim().min(1).max(32).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type FlagFilter = z.infer<typeof flagFilterSchema>;

export const resolveFlagSchema = z.object({
  resolution: z.enum(['RESOLVED', 'REJECTED']),
});

// ---------------------------------------------------------------------------
// Pool cho engine, coverage, analytics
// ---------------------------------------------------------------------------

export const publishedPoolFilterSchema = z.object({
  subject: subjectSchema,
  gradeBand: gradeBandSchema,
  programCode: z.string().trim().min(1).max(32).toUpperCase().optional(),
  skillIds: stringListSchema.optional(),
  chapterIds: stringListSchema.optional(),
  excludeItemIds: stringListSchema.optional(),
  /** Lớp thực tế của học sinh (specs §19.4 #14) để lọc actualGradeScope. */
  actualGrade: z.coerce.number().int().min(1).max(12).optional(),
  difficulties: z.array(difficultySchema).optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
});
export type PublishedPoolFilter = z.infer<typeof publishedPoolFilterSchema>;

export const coverageFilterSchema = z.object({
  subject: subjectSchema,
  gradeBand: gradeBandSchema,
  programCode: z.string().trim().min(1).max(32).toUpperCase().optional(),
  minPerDifficulty: z.coerce.number().int().min(1).max(1000).optional(),
  minTotal: z.coerce.number().int().min(1).max(5000).optional(),
});
export type CoverageFilter = z.infer<typeof coverageFilterSchema>;

export const itemAnalyticsFilterSchema = itemFilterSchema.extend({
  /** Dưới ngưỡng này coi như chưa đủ dữ liệu để kết luận câu dễ/khó. */
  minAttempts: z.coerce.number().int().min(1).max(10000).optional(),
  easyThreshold: z.coerce.number().min(0.5).max(1).optional(),
  hardThreshold: z.coerce.number().min(0).max(0.5).optional(),
  slowRatio: z.coerce.number().min(1).max(10).optional(),
  reportRateThreshold: z.coerce.number().min(0).max(1).optional(),
});
export type ItemAnalyticsFilter = z.infer<typeof itemAnalyticsFilterSchema>;

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export const importRequestSchema = z.object({
  /** Nội dung file CSV thô (UTF-8). */
  csv: z.string().min(1, 'Chưa có nội dung file CSV.'),
  /** Mặc định true: UI phải chạy kiểm tra trước khi ghi thật. */
  dryRun: booleanFlagSchema.default(true),
});
export type ImportRequest = z.infer<typeof importRequestSchema>;
