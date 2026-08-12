/**
 * Schema validate đầu vào cho module Commerce.
 * Route handler dùng qua readJson()/readQuery(); service tự parse lại để
 * mọi lời gọi nội bộ (cron, seed, admin script) cũng đi qua cùng ràng buộc.
 */
import { z } from 'zod';

/** Mã coupon luôn chuẩn hóa hoa + bỏ khoảng trắng để so khớp ổn định. */
export const couponCodeSchema = z
  .string()
  .trim()
  .min(3, 'Mã giảm giá quá ngắn.')
  .max(40, 'Mã giảm giá quá dài.')
  .transform((value) => value.toUpperCase());

const idSchema = z.string().trim().min(1, 'Thiếu mã định danh.');

/** Query string chỉ có chuỗi — cần ép về boolean thủ công. */
const queryBoolean = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true' || value === '1'));

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export const previewCheckoutSchema = z.object({
  courseId: idSchema,
  couponCode: couponCodeSchema.optional(),
});

/** userId lấy từ phiên đăng nhập, không nhận từ client. */
export const createCheckoutSchema = previewCheckoutSchema;

export const applyCouponSchema = z.object({
  code: couponCodeSchema,
  courseId: idSchema,
});

export const confirmMockPaymentSchema = z.object({
  orderCode: z.string().trim().min(4, 'Mã đơn hàng không hợp lệ.'),
});

/** Mã đơn trên URL/param — chuẩn hóa hoa để tra cứu không phụ thuộc cách gõ. */
export const orderCodeSchema = z
  .string()
  .trim()
  .min(4, 'Mã đơn hàng không hợp lệ.')
  .max(40, 'Mã đơn hàng không hợp lệ.')
  .transform((value) => value.toUpperCase());

export const cancelPaymentSchema = z.object({
  orderCode: orderCodeSchema,
  reason: z.string().trim().max(200, 'Lý do hủy tối đa 200 ký tự.').optional(),
});

/** Payload webhook của MockGateway — cổng thật có payload riêng, parse trong gateway.ts. */
export const mockWebhookPayloadSchema = z.object({
  orderCode: z.string().trim().min(4, 'Mã đơn hàng không hợp lệ.'),
  status: z.enum(['PAID', 'FAILED', 'CANCELLED'], {
    errorMap: () => ({ message: 'Trạng thái giao dịch chỉ nhận PAID, FAILED hoặc CANCELLED.' }),
  }),
  gatewayTxnId: z.string().trim().min(1).optional(),
  amount: z.coerce.number({ invalid_type_error: 'Số tiền phải là số.' }).int().min(0, 'Số tiền không hợp lệ.'),
});

// ---------------------------------------------------------------------------
// Entitlement
// ---------------------------------------------------------------------------

export const manualActivationSchema = z.object({
  studentUserId: idSchema,
  courseId: idSchema,
  /** Không có PAID ở đây: kích hoạt tay không sinh Payment (specs §11). */
  source: z.enum(['MANUAL', 'SCHOLARSHIP'], {
    errorMap: () => ({ message: 'Hình thức kích hoạt chỉ nhận MANUAL hoặc SCHOLARSHIP.' }),
  }),
  durationDays: z.coerce
    .number({ invalid_type_error: 'Số ngày truy cập phải là số.' })
    .int('Số ngày truy cập phải là số nguyên.')
    .positive('Số ngày truy cập phải lớn hơn 0.')
    .max(3650, 'Số ngày truy cập tối đa là 3650.')
    .optional(),
  note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự.').optional(),
});

export const extendEnrollmentSchema = z.object({
  extraDays: z.coerce
    .number({ invalid_type_error: 'Số ngày gia hạn phải là số.' })
    .int('Số ngày gia hạn phải là số nguyên.')
    .positive('Số ngày gia hạn phải lớn hơn 0.')
    .max(3650, 'Mỗi lần chỉ gia hạn tối đa 3650 ngày.'),
});

// ---------------------------------------------------------------------------
// Thanh toán (vận hành)
// ---------------------------------------------------------------------------

export const paymentStatusSchema = z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED'], {
  errorMap: () => ({ message: 'Trạng thái đơn hàng không hợp lệ.' }),
});

export const listPaymentsSchema = z.object({
  status: paymentStatusSchema.optional(),
  gateway: z.string().trim().min(1).max(20).optional(),
  userId: idSchema.optional(),
  courseId: idSchema.optional(),
  programId: idSchema.optional(),
  orderCode: z.string().trim().min(2).max(40).optional(),
  couponCode: couponCodeSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const refundPaymentSchema = z.object({
  note: z.string().trim().min(3, 'Cần ghi rõ lý do hoàn tiền để đối soát.').max(500),
});

// ---------------------------------------------------------------------------
// Coupon
// ---------------------------------------------------------------------------

export const upsertCouponSchema = z
  .object({
    code: couponCodeSchema,
    type: z.enum(['PERCENT', 'AMOUNT'], {
      errorMap: () => ({ message: 'Loại giảm giá chỉ nhận PERCENT hoặc AMOUNT.' }),
    }),
    /** PERCENT: 1–100. AMOUNT: số tiền VND. */
    value: z.coerce
      .number({ invalid_type_error: 'Giá trị giảm phải là số.' })
      .int('Giá trị giảm phải là số nguyên.')
      .positive('Giá trị giảm phải lớn hơn 0.'),
    maxUses: z.coerce
      .number({ invalid_type_error: 'Giới hạn lượt dùng phải là số.' })
      .int('Giới hạn lượt dùng phải là số nguyên.')
      .positive('Giới hạn lượt dùng phải lớn hơn 0.')
      .max(1_000_000, 'Giới hạn lượt dùng quá lớn.')
      .nullish(),
    expiresAt: z.coerce.date({ invalid_type_error: 'Ngày hết hạn không hợp lệ.' }).nullish(),
    programId: idSchema.nullish(),
    courseId: idSchema.nullish(),
    active: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'PERCENT' && data.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Giảm theo phần trăm không được vượt quá 100.',
      });
    }
  });

export const listCouponsSchema = z.object({
  code: z.string().trim().min(1).max(40).optional(),
  programId: idSchema.optional(),
  courseId: idSchema.optional(),
  active: queryBoolean.optional(),
  includeExpired: queryBoolean.default(true),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// ---------------------------------------------------------------------------
// Kiểu suy ra
// ---------------------------------------------------------------------------

export type PreviewCheckoutInput = z.infer<typeof previewCheckoutSchema>;
export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema> & { userId: string; ip?: string | null };
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;
export type MockWebhookPayload = z.infer<typeof mockWebhookPayloadSchema>;
export type ManualActivationInput = z.infer<typeof manualActivationSchema> & { actorId: string };
export type ListPaymentsFilter = z.input<typeof listPaymentsSchema>;
export type UpsertCouponInput = z.infer<typeof upsertCouponSchema>;
export type ListCouponsFilter = z.input<typeof listCouponsSchema>;
