/**
 * Zod schema + chuẩn hóa dữ liệu đầu vào cho module Identity/Auth
 * (specs §6 module 1, §9.2 màn hình 3, §10.5 RBAC 8 role).
 */
import { z } from 'zod';
import type { GradeBand, Role, Subject, UserStatus } from '@prisma/client';
import { GRADE_BAND_GRADES } from '@/lib/domain';

// ---------------------------------------------------------------------------
// Hằng số suy ra từ taxonomy — không hard-code lại danh sách lớp ở đây
// ---------------------------------------------------------------------------

const ALL_GRADES: number[] = Object.values(GRADE_BAND_GRADES).flat();

export const MIN_GRADE = Math.min(...ALL_GRADES);
export const MAX_GRADE = Math.max(...ALL_GRADES);

/** Độ dài mật khẩu tối thiểu — yêu cầu bảo mật (specs §14), không phải tham số nghiệp vụ. */
export const MIN_PASSWORD_LENGTH = 8;

const ROLE_VALUES = [
  'STUDENT',
  'PARENT',
  'TEACHER',
  'CONTENT_EDITOR',
  'REVIEWER',
  'PROGRAM_MANAGER',
  'OPS_ADMIN',
  'SUPER_ADMIN',
] as const satisfies readonly Role[];

const USER_STATUS_VALUES = ['PENDING', 'ACTIVE', 'SUSPENDED'] as const satisfies readonly UserStatus[];

const GRADE_BAND_VALUES = ['A', 'B', 'C', 'D'] as const satisfies readonly GradeBand[];

const SUBJECT_VALUES = [
  'MATH',
  'SCIENCE',
  'PHYSICS',
  'CHEMISTRY',
  'BIOLOGY',
  'IT',
] as const satisfies readonly Subject[];

export const roleSchema = z.enum(ROLE_VALUES);
export const userStatusSchema = z.enum(USER_STATUS_VALUES);
export const gradeBandSchema = z.enum(GRADE_BAND_VALUES);
export const subjectSchema = z.enum(SUBJECT_VALUES);

/** Học sinh phải tự đăng ký (kèm lớp thực tế) nên admin không tạo tài khoản STUDENT ở màn hình nhân sự. */
export const STAFF_ROLES: Role[] = ROLE_VALUES.filter((role) => role !== 'STUDENT');

export const OTP_PURPOSES = ['VERIFY_EMAIL', 'RESET_PASSWORD'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];
export const otpPurposeSchema = z.enum(OTP_PURPOSES);

// ---------------------------------------------------------------------------
// Chuẩn hóa email / số điện thoại
// ---------------------------------------------------------------------------

/** Số VN: bỏ dấu cách/gạch, quy +84 và 84 về dạng bắt đầu bằng 0. */
export function normalizePhone(raw: string): string {
  const digitsOnly = raw.replace(/[\s.\-()]/g, '').trim();
  if (!digitsOnly) return '';
  if (digitsOnly.startsWith('+84')) return `0${digitsOnly.slice(3)}`;
  if (digitsOnly.startsWith('84') && digitsOnly.length >= 11) return `0${digitsOnly.slice(2)}`;
  return digitsOnly;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Người dùng đăng nhập bằng email HOẶC số điện thoại — tự nhận dạng theo ký tự '@'. */
export function splitIdentifier(raw: string): { email?: string; phone?: string } {
  const value = raw.trim();
  if (!value) return {};
  if (value.includes('@')) return { email: normalizeEmail(value) };
  const phone = normalizePhone(value);
  return phone ? { phone } : {};
}

const VN_PHONE_PATTERN = /^0\d{8,10}$/;

const optionalEmail = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().toLowerCase().email('Email không hợp lệ.').max(160).optional(),
);

const optionalPhone = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const phone = normalizePhone(value);
    return phone === '' ? undefined : phone;
  },
  z.string().regex(VN_PHONE_PATTERN, 'Số điện thoại không hợp lệ.').optional(),
);

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).max(max).optional(),
  );

const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`)
  .max(72, 'Mật khẩu quá dài.');

const fullNameSchema = z.string().trim().min(2, 'Họ tên phải có ít nhất 2 ký tự.').max(120);

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const registerStudentSchema = z
  .object({
    fullName: fullNameSchema,
    email: optionalEmail,
    phone: optionalPhone,
    password: passwordSchema,
    /** Luôn lưu lớp thực tế, khối do hệ thống suy ra (specs §3.2). */
    actualGrade: z.coerce
      .number()
      .int('Lớp phải là số nguyên.')
      .min(MIN_GRADE, `Chỉ nhận học sinh từ lớp ${MIN_GRADE} đến lớp ${MAX_GRADE}.`)
      .max(MAX_GRADE, `Chỉ nhận học sinh từ lớp ${MIN_GRADE} đến lớp ${MAX_GRADE}.`),
    school: optionalText(160),
    parentName: optionalText(120),
    parentPhone: optionalPhone,
    parentEmail: optionalEmail,
  })
  .refine((value) => Boolean(value.email ?? value.phone), {
    message: 'Cần ít nhất email hoặc số điện thoại để tạo tài khoản.',
    path: ['email'],
  });

export type RegisterStudentInput = z.infer<typeof registerStudentSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Nhập email hoặc số điện thoại.').max(160),
  password: z.string().min(1, 'Nhập mật khẩu.').max(72),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const verifyOtpSchema = z.object({
  userId: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/, 'Mã xác thực gồm 6 chữ số.'),
  purpose: otpPurposeSchema,
});

export const requestPasswordResetSchema = z.object({
  identifier: z.string().trim().min(3, 'Nhập email hoặc số điện thoại.').max(160),
});

export const resetPasswordSchema = z.object({
  identifier: z.string().trim().min(3, 'Nhập email hoặc số điện thoại.').max(160),
  code: z.string().trim().regex(/^\d{6}$/, 'Mã xác thực gồm 6 chữ số.'),
  newPassword: passwordSchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Nhập mật khẩu hiện tại.').max(72),
  newPassword: passwordSchema,
});

export const assignRoleSchema = z.object({
  userId: z.string().min(1),
  role: roleSchema,
});

export const listUsersSchema = z.object({
  search: optionalText(120),
  role: roleSchema.optional(),
  status: userStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListUsersFilter = z.input<typeof listUsersSchema>;

/**
 * Dữ liệu tạo tài khoản nhân sự.
 *
 * KHÔNG có `actorId`: người thực hiện được xác định từ phiên đăng nhập ở tầng
 * route. Để trong body thì bất kỳ ai gọi API cũng ghi được nhật ký dưới tên
 * người khác.
 */
export const createStaffUserSchema = z
  .object({
    fullName: fullNameSchema,
    email: optionalEmail,
    phone: optionalPhone,
    password: passwordSchema,
    roles: z.array(roleSchema).min(1, 'Chọn ít nhất một vai trò.'),
    bio: optionalText(1000),
    subjects: z.array(subjectSchema).optional(),
    /** Bỏ trống → lấy config.teacher.defaultCapacityPerCycle. */
    capacityPerCycle: z.coerce.number().int().min(1).max(500).optional(),
  })
  .refine((value) => Boolean(value.email ?? value.phone), {
    message: 'Cần ít nhất email hoặc số điện thoại để tạo tài khoản.',
    path: ['email'],
  })
  .refine((value) => value.roles.every((role) => STAFF_ROLES.includes(role)), {
    message: 'Không tạo tài khoản học sinh ở đây — học sinh tự đăng ký để khai lớp thực tế.',
    path: ['roles'],
  });

export type CreateStaffUserInput = z.infer<typeof createStaffUserSchema>;

export const updateStudentProfileSchema = z.object({
  fullName: fullNameSchema.optional(),
  actualGrade: z.coerce.number().int().min(MIN_GRADE).max(MAX_GRADE).optional(),
  school: optionalText(160),
  parentName: optionalText(120),
  parentPhone: optionalPhone,
  parentEmail: optionalEmail,
});

export type UpdateStudentProfileInput = z.infer<typeof updateStudentProfileSchema>;
