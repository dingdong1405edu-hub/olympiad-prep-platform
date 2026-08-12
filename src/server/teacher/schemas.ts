/**
 * Zod schema cho module Giáo viên (specs §9.3, §10.4, §12.2).
 *
 * Mọi input đi vào service đều đi qua đây: filter dashboard, đặt lịch buổi tư
 * vấn 20 phút, ghi notes sau buổi và phân công giáo viên.
 */
import { z } from 'zod';
import type { GradeBand, SessionStatus, StudentLevel, Subject, TeacherAction } from '@prisma/client';

const GRADE_BAND_VALUES = ['A', 'B', 'C', 'D'] as const satisfies readonly GradeBand[];

const SUBJECT_VALUES = [
  'MATH',
  'SCIENCE',
  'PHYSICS',
  'CHEMISTRY',
  'BIOLOGY',
  'IT',
] as const satisfies readonly Subject[];

const LEVEL_VALUES = [
  'WEAK',
  'AVERAGE',
  'GOOD',
  'EXCELLENT',
] as const satisfies readonly StudentLevel[];

const SESSION_STATUS_VALUES = [
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const satisfies readonly SessionStatus[];

const TEACHER_ACTION_VALUES = [
  'KEEP_PLAN',
  'REDUCE_LOAD',
  'INCREASE_LOAD',
  'CHANGE_PRIORITY',
] as const satisfies readonly TeacherAction[];

/** Mức cần theo dõi sau buổi tư vấn — lưu vào `TeacherSession.followUpLevel`. */
export const FOLLOW_UP_LEVELS = ['NORMAL', 'WATCH', 'ESCALATE'] as const;
export type FollowUpLevel = (typeof FOLLOW_UP_LEVELS)[number];

export const FOLLOW_UP_LEVEL_LABEL: Record<FollowUpLevel, string> = {
  NORMAL: 'Theo dõi bình thường',
  WATCH: 'Cần theo sát',
  ESCALATE: 'Cần can thiệp gấp',
};

export const gradeBandSchema = z.enum(GRADE_BAND_VALUES);
export const subjectSchema = z.enum(SUBJECT_VALUES);
export const studentLevelSchema = z.enum(LEVEL_VALUES);
export const sessionStatusSchema = z.enum(SESSION_STATUS_VALUES);
export const teacherActionSchema = z.enum(TEACHER_ACTION_VALUES);
export const followUpLevelSchema = z.enum(FOLLOW_UP_LEVELS);

const idSchema = z.string().trim().min(1);

/** Query string gửi "false"/"0" nên không dùng được z.coerce.boolean(). */
const optionalBoolean = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === '') return undefined;
  if (['false', '0', 'no'].includes(normalized)) return false;
  if (['true', '1', 'yes'].includes(normalized)) return true;
  return value;
}, z.boolean().optional());

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).max(max).optional(),
  );

// ---------------------------------------------------------------------------
// Dashboard giáo viên
// ---------------------------------------------------------------------------

export const studentFilterSchema = z.object({
  programId: idSchema.optional(),
  gradeBand: gradeBandSchema.optional(),
  subject: subjectSchema.optional(),
  /** Mức hiện tại (ước tính từ bài kiểm tra), không phải mức tự khai. */
  level: studentLevelSchema.optional(),
  /** Chỉ lấy học sinh đang có cảnh báo. */
  needsAttention: optionalBoolean,
  /** Tìm theo tên / email / số điện thoại học sinh. */
  search: optionalText(120),
});

export type StudentFilterInput = z.input<typeof studentFilterSchema>;
export type StudentFilter = z.infer<typeof studentFilterSchema>;

// ---------------------------------------------------------------------------
// Buổi tư vấn
// ---------------------------------------------------------------------------

export const listSessionsSchema = z.object({
  status: sessionStatusSchema.optional(),
  enrollmentId: idSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Chỉ lấy buổi còn ở phía trước — mặc định false để xem cả lịch sử. */
  upcomingOnly: optionalBoolean,
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type ListSessionsInput = z.input<typeof listSessionsSchema>;
export type ListSessionsFilter = z.infer<typeof listSessionsSchema>;

export const bookSessionSchema = z.object({
  enrollmentId: idSchema,
  scheduledAt: z.coerce.date(),
  /** Link Google Meet/Zoom dán tay ở MVP (specs §9.3). */
  meetingLink: optionalText(500),
  /** Bỏ trống = lấy giáo viên đang phụ trách, chưa có thì tự phân công. */
  teacherId: idSchema.optional(),
});

export type BookSessionInput = z.input<typeof bookSessionSchema>;

export const saveSessionNotesSchema = z.object({
  sessionId: idSchema,
  teacherUserId: idSchema,
  teacherNotes: z.string().trim().min(10, 'Ghi chú buổi tư vấn quá ngắn.').max(8000),
  /** Action này được engine dùng làm override cho chu kỳ kế tiếp (specs §10.4). */
  actionCode: teacherActionSchema,
  actionItems: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  focusSkillIds: z.array(idSchema).max(20).default([]),
  followUpLevel: followUpLevelSchema,
  aiBriefApproved: z.boolean().optional(),
});

export type SaveSessionNotesInput = z.input<typeof saveSessionNotesSchema>;

// ---------------------------------------------------------------------------
// Phân công giáo viên (admin)
// ---------------------------------------------------------------------------

export const assignTeacherSchema = z.object({
  enrollmentId: idSchema,
  teacherId: idSchema,
});

export type AssignTeacherInput = z.infer<typeof assignTeacherSchema>;
