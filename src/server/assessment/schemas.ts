/**
 * Schema zod của module Assessment — biên giới giữa HTTP và nghiệp vụ.
 *
 * Route handler validate ở đây rồi mới gọi service; service không tự đọc
 * request. Mọi thông điệp lỗi bằng tiếng Việt vì hiển thị thẳng cho học sinh.
 */
import { z } from 'zod';
import type { AssessmentType, Difficulty, StudentLevel } from '@prisma/client';

// ---------------------------------------------------------------------------
// Enum runtime
// ---------------------------------------------------------------------------

export const ASSESSMENT_TYPE_VALUES = [
  'DIAGNOSTIC',
  'PROGRESS',
  'MOCK',
] as const satisfies readonly AssessmentType[];

export const STUDENT_LEVEL_VALUES = [
  'WEAK',
  'AVERAGE',
  'GOOD',
  'EXCELLENT',
] as const satisfies readonly StudentLevel[];

export const DIFFICULTY_VALUES = [
  'AVERAGE',
  'GOOD',
  'EXCELLENT',
] as const satisfies readonly Difficulty[];

export const assessmentTypeSchema = z.enum(ASSESSMENT_TYPE_VALUES);
export const studentLevelSchema = z.enum(STUDENT_LEVEL_VALUES);
export const difficultySchema = z.enum(DIFFICULTY_VALUES);

// ---------------------------------------------------------------------------
// Trần kỹ thuật cho payload (chống body rác, không phải ngưỡng nghiệp vụ)
// ---------------------------------------------------------------------------

/** Một lần autosave chỉ gửi các câu vừa đổi; 200 câu đã dư cho mọi đề. */
const MAX_AUTOSAVE_ANSWERS = 200;
/** Một câu không thể chiếm quá 12 giờ đồng hồ làm bài. */
const MAX_ITEM_TIME_MS = 12 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Định danh
// ---------------------------------------------------------------------------

export const idSchema = z.string().trim().min(1, 'Thiếu mã định danh.').max(64);
export const attemptIdSchema = z.string().trim().min(1, 'Thiếu mã bài làm.').max(64);
export const enrollmentIdSchema = z.string().trim().min(1, 'Thiếu mã khóa học đã đăng ký.').max(64);

// ---------------------------------------------------------------------------
// Làm bài
// ---------------------------------------------------------------------------

/**
 * Đáp án học sinh gửi lên: ký hiệu phương án, mảng ký hiệu (nhiều đáp án),
 * số (điền số), chuỗi (trả lời ngắn), hoặc null khi học sinh xóa câu trả lời.
 */
export const answerValueSchema = z.union([
  z.string().max(4000),
  z.array(z.string().max(400)).max(24),
  z.number().finite(),
  z.null(),
]);
export type AnswerValue = z.infer<typeof answerValueSchema>;

export const autosaveAnswerSchema = z.object({
  itemAttemptId: idSchema,
  answer: answerValueSchema,
  timeMs: z.number().int().min(0).max(MAX_ITEM_TIME_MS).default(0),
});
export type AutosaveAnswerInput = z.infer<typeof autosaveAnswerSchema>;

export const autosaveAttemptSchema = z.object({
  answers: z
    .array(autosaveAnswerSchema)
    .min(1, 'Không có câu trả lời nào để lưu.')
    .max(MAX_AUTOSAVE_ANSWERS, 'Gửi quá nhiều câu trong một lần lưu.'),
});
export type AutosaveAttemptInput = z.infer<typeof autosaveAttemptSchema>;

export const startAssessmentSchema = z.object({
  enrollmentId: enrollmentIdSchema,
  type: assessmentTypeSchema.default('DIAGNOSTIC'),
});
export type StartAssessmentInput = z.infer<typeof startAssessmentSchema>;

export const attemptScopeSchema = z.object({
  enrollmentId: enrollmentIdSchema,
});

export const masteryDeltaQuerySchema = z.object({
  /** So với mốc đầu tiên thay vì mốc liền trước. */
  againstBaseline: z
    .union([z.boolean(), z.string()])
    .transform((value) =>
      typeof value === 'boolean' ? value : ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase()),
    )
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type MasteryDeltaQuery = z.infer<typeof masteryDeltaQuerySchema>;

// ---------------------------------------------------------------------------
// Admin: cấu hình đề (specs §9.4a — sửa blueprint không cần deploy)
// ---------------------------------------------------------------------------

export const difficultyMixSchema = z
  .object({
    AVERAGE: z.number().min(0).max(1),
    GOOD: z.number().min(0).max(1),
    EXCELLENT: z.number().min(0).max(1),
  })
  .refine((mix) => mix.AVERAGE + mix.GOOD + mix.EXCELLENT > 0, {
    message: 'Tỷ lệ độ khó phải có ít nhất một bậc lớn hơn 0.',
  });

export const blueprintSpecSchema = z.object({
  chapterWeights: z
    .record(z.string().trim().min(1), z.number().min(0).max(1000))
    .refine((weights) => Object.values(weights).some((value) => value > 0), {
      message: 'Blueprint phải có ít nhất một chương với tỷ trọng lớn hơn 0.',
    }),
  difficultyMixByLevel: z.object({
    WEAK: difficultyMixSchema,
    AVERAGE: difficultyMixSchema,
    GOOD: difficultyMixSchema,
    EXCELLENT: difficultyMixSchema,
  }),
  minAnchorItems: z.number().int().min(0).max(500),
});
export type BlueprintSpecInput = z.infer<typeof blueprintSpecSchema>;

export const upsertAssessmentSchema = z.object({
  courseId: idSchema,
  type: assessmentTypeSchema,
  name: z.string().trim().min(2, 'Tên bài kiểm tra quá ngắn.').max(200).optional(),
  itemCount: z
    .number()
    .int()
    .min(1, 'Bài kiểm tra phải có ít nhất 1 câu.')
    .max(500, 'Mỗi bài tối đa 500 câu.')
    .optional(),
  timeLimitMinutes: z.number().int().min(1).max(600).nullable().optional(),
  blueprint: blueprintSpecSchema.optional(),
  active: z.boolean().optional(),
});
export type UpsertAssessmentInput = z.infer<typeof upsertAssessmentSchema>;
