/**
 * Zod schema cho module Catalog: Program → Course → Cohort → Pricing
 * (specs §3.1, §3.2, §6 module 2, §11).
 *
 * Thêm kỳ thi mới = thêm bản ghi Program, không thêm nhánh code theo mã kỳ thi.
 */
import { z } from 'zod';
import type { GradeBand, Subject } from '@prisma/client';

const GRADE_BAND_VALUES = ['A', 'B', 'C', 'D'] as const satisfies readonly GradeBand[];

const SUBJECT_VALUES = [
  'MATH',
  'SCIENCE',
  'PHYSICS',
  'CHEMISTRY',
  'BIOLOGY',
  'IT',
] as const satisfies readonly Subject[];

export const gradeBandSchema = z.enum(GRADE_BAND_VALUES);
export const subjectSchema = z.enum(SUBJECT_VALUES);

/** Mã kỳ thi: ASMOPSS, NEO, STEM, FMC, PAS… — luôn viết hoa để tra cứu ổn định. */
export const programCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{1,23}$/, 'Mã kỳ thi chỉ gồm chữ in hoa, số, dấu gạch (2–24 ký tự).');

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).max(max).optional(),
  );

/** Query string gửi "false"/"0" — z.coerce.boolean() sẽ hiểu nhầm thành true nên tự xử lý. */
const optionalBoolean = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === '') return undefined;
  if (['false', '0', 'no'].includes(normalized)) return false;
  if (['true', '1', 'yes'].includes(normalized)) return true;
  return value;
}, z.boolean().optional());

const idSchema = z.string().trim().min(1);

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

/**
 * Đường dẫn video giới thiệu. Chấp nhận link trống (chưa có video) và mọi link
 * http/https — việc nhận diện YouTube / Vimeo / tệp mp4 do trình phát lo, ở đây
 * chỉ chặn những thứ chắc chắn sai như `javascript:`.
 */
const videoUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .trim()
    .max(600)
    .refine((value) => /^https?:\/\//i.test(value), 'Đường dẫn phải bắt đầu bằng http:// hoặc https://')
    .optional(),
);

/** Danh sách khối nội dung [{ title, body }] do admin soạn. */
const sectionListSchema = z
  .array(
    z.object({
      title: z.string().trim().min(1, 'Tiêu đề khối không được để trống.').max(200),
      body: z.string().trim().min(1, 'Nội dung khối không được để trống.').max(4000),
    }),
  )
  .max(12)
  .optional();

const faqListSchema = z
  .array(
    z.object({
      question: z.string().trim().min(1, 'Câu hỏi không được để trống.').max(300),
      answer: z.string().trim().min(1, 'Câu trả lời không được để trống.').max(4000),
    }),
  )
  .max(20)
  .optional();

const syllabusSchema = z
  .array(
    z.object({
      title: z.string().trim().min(1, 'Tên chặng không được để trống.').max(200),
      detail: z.string().trim().min(1, 'Mô tả chặng không được để trống.').max(2000),
    }),
  )
  .max(30)
  .optional();

export const upsertProgramSchema = z.object({
  id: idSchema.optional(),
  code: programCodeSchema,
  name: z.string().trim().min(2, 'Tên kỳ thi quá ngắn.').max(160),
  shortName: optionalText(40),
  logoEmoji: optionalText(8),
  colorHex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Mã màu phải có dạng #RRGGBB.')
    .optional(),
  description: z.string().trim().min(10, 'Mô tả kỳ thi quá ngắn.').max(4000),
  highlights: z.array(z.string().trim().min(1).max(240)).max(20).optional(),
  season: optionalText(40),
  active: optionalBoolean,
  order: z.coerce.number().int().min(0).max(999).optional(),
  /** Tham số riêng của kỳ thi (blueprint override, quy tắc ra đề…). */
  config: z.record(z.unknown()).optional(),

  // --- Nội dung giới thiệu hiển thị trước khi thanh toán ---
  tagline: optionalText(240),
  longDescription: optionalText(8000),
  introVideoUrl: videoUrlSchema,
  introVideoPoster: videoUrlSchema,
  sections: sectionListSchema,
  faqs: faqListSchema,
});

export type UpsertProgramInput = z.infer<typeof upsertProgramSchema>;

export const listProgramsSchema = z.object({
  includeInactive: optionalBoolean,
});

export type ListProgramsOptions = z.input<typeof listProgramsSchema>;

// ---------------------------------------------------------------------------
// Course
// ---------------------------------------------------------------------------

export const upsertCourseSchema = z.object({
  id: idSchema.optional(),
  programId: idSchema,
  gradeBand: gradeBandSchema,
  subject: subjectSchema,
  name: z.string().trim().min(2, 'Tên khóa quá ngắn.').max(160),
  description: optionalText(2000),
  active: optionalBoolean,

  // --- Nội dung giới thiệu riêng của khóa ---
  tagline: optionalText(240),
  longDescription: optionalText(8000),
  introVideoUrl: videoUrlSchema,
  outcomes: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  syllabus: syllabusSchema,
});

export type UpsertCourseInput = z.infer<typeof upsertCourseSchema>;

export const listCoursesSchema = z.object({
  programId: idSchema.optional(),
  gradeBand: gradeBandSchema.optional(),
  subject: subjectSchema.optional(),
  /** Bỏ trống = chỉ lấy khóa đang mở. */
  active: optionalBoolean,
});

export type ListCoursesFilter = z.input<typeof listCoursesSchema>;

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export const upsertPricingSchema = z
  .object({
    id: idSchema.optional(),
    programId: idSchema.optional(),
    courseId: idSchema.optional(),
    label: optionalText(120),
    price: z.coerce.number().int('Giá phải là số nguyên đồng.').min(0, 'Giá không được âm.'),
    currency: z.string().trim().length(3).toUpperCase().optional(),
    accessDurationDays: z.coerce
      .number()
      .int()
      .min(1, 'Thời hạn truy cập phải từ 1 ngày trở lên.')
      .max(3650)
      .optional(),
    validFrom: z.coerce.date().optional(),
    validTo: z.coerce.date().optional(),
    active: optionalBoolean,
  })
  .refine((value) => Boolean(value.programId) !== Boolean(value.courseId), {
    message: 'Bảng giá phải gắn với đúng một phạm vi: kỳ thi hoặc khóa học.',
    path: ['courseId'],
  })
  .refine((value) => !value.validFrom || !value.validTo || value.validFrom <= value.validTo, {
    message: 'Ngày bắt đầu hiệu lực phải trước ngày kết thúc.',
    path: ['validTo'],
  });

export type UpsertPricingInput = z.infer<typeof upsertPricingSchema>;

// ---------------------------------------------------------------------------
// Cohort (mùa thi)
// ---------------------------------------------------------------------------

export const upsertCohortSchema = z
  .object({
    id: idSchema.optional(),
    programId: idSchema,
    year: z.coerce.number().int().min(2000).max(2100),
    name: z.string().trim().min(2, 'Tên mùa thi quá ngắn.').max(120),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    /** Ngày thi — engine dùng làm hệ số "độ gần kỳ thi" (specs §7.3). */
    examDate: z.coerce.date(),
    active: optionalBoolean,
  })
  .refine((value) => value.startDate <= value.endDate, {
    message: 'Ngày bắt đầu mùa thi phải trước ngày kết thúc.',
    path: ['endDate'],
  })
  .refine((value) => value.examDate >= value.startDate, {
    message: 'Ngày thi phải nằm sau ngày bắt đầu mùa thi.',
    path: ['examDate'],
  });

export type UpsertCohortInput = z.infer<typeof upsertCohortSchema>;
