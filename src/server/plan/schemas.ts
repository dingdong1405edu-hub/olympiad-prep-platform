/**
 * Zod schema cho module Lộ trình (plan) và Làm bài (learning) — specs §6 module 7 & 9.
 *
 * Chỉ chặn dữ liệu VÔ LÝ VỀ VẬT LÝ (ngày âm, quá 7 ngày/tuần, thời gian dài hơn
 * một ngày). Ngưỡng NGHIỆP VỤ (tối thiểu/tối đa phút mỗi ngày, số câu mỗi ngày…)
 * do engine kẹp lại theo `getConfig()`, không lặp lại ở đây để admin đổi cấu hình
 * là có hiệu lực ngay.
 */
import { z } from 'zod';
import type { StudentLevel, TeacherAction } from '@prisma/client';

const STUDENT_LEVEL_VALUES = [
  'WEAK',
  'AVERAGE',
  'GOOD',
  'EXCELLENT',
] as const satisfies readonly StudentLevel[];

const TEACHER_ACTION_VALUES = [
  'KEEP_PLAN',
  'REDUCE_LOAD',
  'INCREASE_LOAD',
  'CHANGE_PRIORITY',
] as const satisfies readonly TeacherAction[];

export const studentLevelSchema = z.enum(STUDENT_LEVEL_VALUES);
export const teacherActionSchema = z.enum(TEACHER_ACTION_VALUES);

const idSchema = z.string().trim().min(1, 'Thiếu mã định danh.');

const MINUTES_IN_DAY = 24 * 60;
const MS_IN_DAY = MINUTES_IN_DAY * 60 * 1000;

// ---------------------------------------------------------------------------
// Mục tiêu & lộ trình
// ---------------------------------------------------------------------------

/** Quỹ thời gian học sinh tự khai — dùng cho cả gợi ý mục tiêu lẫn tạo mục tiêu. */
export const timeBudgetSchema = z.object({
  daysPerWeek: z.coerce
    .number()
    .int('Số ngày học mỗi tuần phải là số nguyên.')
    .min(1, 'Cần học ít nhất 1 ngày mỗi tuần.')
    .max(7, 'Một tuần chỉ có 7 ngày.'),
  minutesPerDay: z.coerce
    .number()
    .int('Số phút học mỗi ngày phải là số nguyên.')
    .min(1, 'Số phút học mỗi ngày phải lớn hơn 0.')
    .max(MINUTES_IN_DAY, 'Số phút học mỗi ngày không thể vượt quá một ngày.'),
});
export type TimeBudgetInput = z.infer<typeof timeBudgetSchema>;

export const goalOptionsSchema = timeBudgetSchema;
export type GoalOptionsInput = z.infer<typeof goalOptionsSchema>;

export const createGoalSchema = timeBudgetSchema.extend({
  enrollmentId: idSchema,
  targetLevel: studentLevelSchema,
  deadline: z.coerce.date({ invalid_type_error: 'Mốc thời gian không hợp lệ.' }),
});
export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export const generatePlanSchema = z.object({
  enrollmentId: idSchema,
  /** Bỏ trống = tự lấy chu kỳ kế tiếp của học sinh. */
  cycleNo: z.coerce.number().int().min(1).optional(),
  reason: z.string().trim().min(1, 'Cần nêu lý do sinh lộ trình.').max(200),
  /** Hệ số tải do giáo viên áp; bỏ trống = giữ nguyên. */
  loadFactor: z.coerce.number().min(0.1).max(3).optional(),
  teacherFocusSkillIds: z.array(idSchema).max(50).optional(),
});
export type GeneratePlanInput = z.infer<typeof generatePlanSchema>;

export const reschedulePlanSchema = z.object({
  enrollmentId: idSchema,
  reason: z.string().trim().min(1, 'Cần nêu lý do dàn lại lịch.').max(200),
});
export type ReschedulePlanInput = z.infer<typeof reschedulePlanSchema>;

export const teacherOverrideSchema = z.object({
  enrollmentId: idSchema,
  actionCode: teacherActionSchema,
  focusSkillIds: z.array(idSchema).max(50).default([]),
  actorId: idSchema,
});
export type TeacherOverrideInput = z.infer<typeof teacherOverrideSchema>;

// ---------------------------------------------------------------------------
// Làm bài (module learning dùng chung file này, không có schemas riêng)
// ---------------------------------------------------------------------------

export const answerItemSchema = z.object({
  planDayItemId: idSchema,
  /** Kiểu đáp án phụ thuộc questionType — grading.ts tự chuẩn hóa và chấm. */
  answer: z.unknown(),
  timeMs: z.coerce
    .number()
    .int()
    .min(0)
    .max(MS_IN_DAY, 'Thời gian làm bài của một câu không thể dài hơn một ngày.')
    .default(0),
  hintUsed: z.coerce.boolean().default(false),
  solutionViewedBeforeAnswer: z.coerce.boolean().default(false),
});

export const reportItemSchema = z.object({
  itemId: idSchema,
  reason: z.string().trim().min(3, 'Hãy mô tả ngắn gọn lỗi bạn gặp phải.').max(200),
  detail: z.string().trim().max(2000).optional(),
});
export type ReportItemInput = z.infer<typeof reportItemSchema>;

export const planDayIdSchema = z.object({ planDayId: idSchema });
export const enrollmentIdSchema = z.object({ enrollmentId: idSchema });
