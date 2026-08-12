/**
 * Commerce — checkout, coupon, webhook thanh toán, entitlement (specs §11).
 *
 * Ba nguyên tắc chi phối toàn bộ file này:
 *  1. Entitlement gắn Enrollment, KHÔNG gắn cứng Payment → cấp học bổng /
 *     voucher 100% / tài khoản nội bộ không cần tạo đơn hàng.
 *  2. Webhook idempotent: mọi con đường kích hoạt quyền truy cập (webhook cổng
 *     thật, xác nhận tay, đơn 0đ) đều đi qua đúng một hàm `settlePayment`, và
 *     hàm đó "giành" Payment.idempotencyKey trong transaction.
 *  3. Giá / thời hạn / cổng thanh toán là DỮ LIỆU (bảng Pricing + AppConfig),
 *     không phải hằng số trong code.
 */
import { Prisma } from '@prisma/client';
import type {
  Coupon,
  Enrollment,
  EnrollmentSource,
  EnrollmentStatus,
  GradeBand,
  PaymentStatus,
  StudentLevel,
  Subject,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';
import { getConfig, type PlatformConfig } from '@/lib/config';
import { AUDIT_ACTIONS, writeAudit } from '@/lib/audit';
import { EVENTS, track } from '@/lib/analytics';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';
import { addDays, daysUntil, formatDateVN } from '@/lib/dates';
import { GRADE_BAND_LABEL, LEVEL_LABEL, SUBJECT_LABEL, formatVnd } from '@/lib/domain';
import { appBaseUrl, getGateway, type ParsedWebhook } from './gateway';
import {
  applyCouponSchema,
  createCheckoutSchema,
  extendEnrollmentSchema,
  listCouponsSchema,
  listPaymentsSchema,
  manualActivationSchema,
  previewCheckoutSchema,
  refundPaymentSchema,
  upsertCouponSchema,
  type CreateCheckoutInput,
  type ListCouponsFilter,
  type ListPaymentsFilter,
  type ManualActivationInput,
  type UpsertCouponInput,
} from './schemas';

// ---------------------------------------------------------------------------
// Nhãn hiển thị riêng của module (domain.ts không có các enum thương mại)
// ---------------------------------------------------------------------------

export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  ACTIVE: 'Đang hiệu lực',
  EXPIRED: 'Đã hết hạn',
  SUSPENDED: 'Tạm khóa',
};

export const ENROLLMENT_SOURCE_LABEL: Record<EnrollmentSource, string> = {
  PAID: 'Đã thanh toán',
  MANUAL: 'Kích hoạt thủ công',
  SCHOLARSHIP: 'Học bổng',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  FAILED: 'Thất bại',
  REFUNDED: 'Đã hoàn tiền',
  CANCELLED: 'Đã hủy',
};

/** Action audit riêng của module — bổ sung cho AUDIT_ACTIONS dùng chung. */
const COMMERCE_AUDIT = {
  CHECKOUT_CREATE: 'payment.checkout',
  COUPON_UPSERT: 'coupon.upsert',
} as const;

/** Mã template thông báo (module Notification tiêu thụ hàng đợi này). */
const NOTIFICATION_TEMPLATE_PURCHASE = 'PURCHASE_ACTIVATED';

// ---------------------------------------------------------------------------
// Kiểu trả về
// ---------------------------------------------------------------------------

export interface CourseInfo {
  id: string;
  name: string;
  description: string | null;
  subject: Subject;
  subjectLabel: string;
  gradeBand: GradeBand;
  gradeBandLabel: string;
  programId: string;
  programCode: string;
  programName: string;
}

export interface ResolvedPricing {
  pricingId: string | null;
  label: string;
  price: number;
  currency: string;
  accessDurationDays: number;
  /** CONFIG = chưa khai báo bảng giá cho khóa này, đang dùng mặc định hệ thống. */
  source: 'PRICING' | 'CONFIG';
}

export interface CheckoutPreview {
  course: CourseInfo;
  price: number;
  discount: number;
  total: number;
  currency: string;
  accessDurationDays: number;
  priceLabel: string;
  totalLabel: string;
  accessUntilLabel: string;
  couponCode?: string;
  couponError?: string;
}

export interface CreateCheckoutResult {
  paymentId: string;
  orderCode: string;
  redirectUrl: string | null;
  total: number;
  currency: string;
  /** true khi tổng tiền = 0 (voucher 100%) → quyền truy cập kích hoạt ngay. */
  activatedImmediately: boolean;
  enrollmentId?: string;
}

export interface WebhookResult {
  handled: boolean;
  alreadyProcessed: boolean;
  enrollmentId?: string;
  paymentId?: string;
  status?: PaymentStatus;
  /** Mã lý do khi không kích hoạt: AMOUNT_MISMATCH | PAYMENT_FAILED… */
  reason?: string;
}

export interface EnrollmentProgress {
  totalPlanDays: number;
  completedPlanDays: number;
  completionRate: number;
  averageMastery: number;
  skillsTracked: number;
}

export interface EnrollmentSummary {
  id: string;
  status: EnrollmentStatus;
  statusLabel: string;
  source: EnrollmentSource;
  sourceLabel: string;
  startsAt: Date;
  expiresAt: Date;
  expiresAtLabel: string;
  daysLeft: number;
  expiringSoon: boolean;
  onboardedAt: Date | null;
  selfDeclaredLevel: StudentLevel | null;
  estimatedLevel: StudentLevel | null;
  estimatedLevelLabel: string | null;
  course: CourseInfo;
  cohort: { id: string; name: string; examDate: Date } | null;
  progress: EnrollmentProgress;
}

export interface CouponEvaluation {
  valid: boolean;
  discount: number;
  message: string;
  coupon: Coupon | null;
}

// ---------------------------------------------------------------------------
// Helper nội bộ
// ---------------------------------------------------------------------------

const courseInclude = { program: true } as const;

type CourseWithProgram = Prisma.CourseGetPayload<{ include: typeof courseInclude }>;

function toCourseInfo(course: CourseWithProgram): CourseInfo {
  return {
    id: course.id,
    name: course.name,
    description: course.description,
    subject: course.subject,
    subjectLabel: SUBJECT_LABEL[course.subject],
    gradeBand: course.gradeBand,
    gradeBandLabel: GRADE_BAND_LABEL[course.gradeBand],
    programId: course.programId,
    programCode: course.program.code,
    programName: course.program.name,
  };
}

async function loadCourseForSale(courseId: string): Promise<CourseWithProgram> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, include: courseInclude });
  if (!course) throw ApiError.notFound('Không tìm thấy khóa học.');
  if (!course.active || !course.program.active) {
    throw ApiError.badRequest('Khóa học này hiện chưa mở bán.');
  }
  return course;
}

/**
 * Giá và thời hạn truy cập: ưu tiên bảng giá riêng của khóa, sau đó bảng giá
 * theo chương trình, cuối cùng mới tới mặc định trong cấu hình hệ thống.
 */
export async function resolvePricing(
  course: { id: string; programId: string },
  config?: PlatformConfig,
): Promise<ResolvedPricing> {
  const cfg = config ?? (await getConfig());
  const now = new Date();

  const rows = await prisma.pricing.findMany({
    where: {
      active: true,
      OR: [{ courseId: course.id }, { courseId: null, programId: course.programId }],
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validTo: null }, { validTo: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  const picked = rows.find((row) => row.courseId === course.id) ?? rows[0];
  if (!picked) {
    return {
      pricingId: null,
      label: 'Giá mặc định hệ thống',
      price: cfg.commerce.defaultPrice,
      currency: cfg.commerce.currency,
      accessDurationDays: cfg.commerce.accessDurationDays,
      source: 'CONFIG',
    };
  }

  return {
    pricingId: picked.id,
    label: picked.label,
    price: picked.price,
    currency: picked.currency,
    // accessDurationDays có thể để 0 trong dữ liệu xấu → rơi về cấu hình chung.
    accessDurationDays: picked.accessDurationDays > 0 ? picked.accessDurationDays : cfg.commerce.accessDurationDays,
    source: 'PRICING',
  };
}

/** Giá công khai của một khóa học (dùng cho trang catalog). */
export async function getCoursePricing(courseId: string): Promise<ResolvedPricing> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, programId: true } });
  if (!course) throw ApiError.notFound('Không tìm thấy khóa học.');
  return resolvePricing(course);
}

function computeDiscount(coupon: Coupon, amount: number): number {
  if (amount <= 0) return 0;
  const raw = coupon.type === 'PERCENT' ? (amount * Math.min(coupon.value, 100)) / 100 : coupon.value;
  return Math.max(0, Math.min(amount, Math.round(raw)));
}

/** Đánh giá coupon mà KHÔNG ném lỗi — dùng cho preview để hiện thông báo mềm. */
async function evaluateCoupon(
  code: string | undefined,
  course: { id: string; programId: string },
  amount: number,
): Promise<CouponEvaluation> {
  if (!code) return { valid: false, discount: 0, message: '', coupon: null };

  const normalized = code.trim().toUpperCase();
  const coupon = await prisma.coupon.findUnique({ where: { code: normalized } });

  if (!coupon) return { valid: false, discount: 0, message: 'Mã giảm giá không tồn tại.', coupon: null };
  if (!coupon.active) {
    return { valid: false, discount: 0, message: 'Mã giảm giá đã ngừng áp dụng.', coupon: null };
  }
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    return {
      valid: false,
      discount: 0,
      message: `Mã giảm giá đã hết hạn ngày ${formatDateVN(coupon.expiresAt)}.`,
      coupon: null,
    };
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { valid: false, discount: 0, message: 'Mã giảm giá đã hết lượt sử dụng.', coupon: null };
  }
  if (coupon.programId && coupon.programId !== course.programId) {
    return { valid: false, discount: 0, message: 'Mã giảm giá không áp dụng cho chương trình này.', coupon: null };
  }
  if (coupon.courseId && coupon.courseId !== course.id) {
    return { valid: false, discount: 0, message: 'Mã giảm giá không áp dụng cho khóa học này.', coupon: null };
  }

  const discount = computeDiscount(coupon, amount);
  if (discount <= 0) {
    return { valid: false, discount: 0, message: 'Mã giảm giá không làm thay đổi số tiền phải trả.', coupon: null };
  }

  return {
    valid: true,
    discount,
    message: `Đã áp dụng mã ${coupon.code}: giảm ${formatVnd(discount)}.`,
    coupon,
  };
}

/** Bảng chữ cái bỏ ký tự dễ đọc nhầm (0/O, 1/I) để CSKH đọc mã qua điện thoại. */
const ORDER_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateOrderCode(): string {
  const now = new Date();
  const stamp =
    String(now.getUTCFullYear() % 100).padStart(2, '0') +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0');

  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += ORDER_CODE_ALPHABET[Math.floor(Math.random() * ORDER_CODE_ALPHABET.length)];
  }
  return `OLP-${stamp}-${suffix}`;
}

/** Mùa thi đang mở gần nhất của chương trình — gắn vào enrollment nếu có. */
async function findCurrentCohortId(programId: string): Promise<string | null> {
  const now = new Date();
  const cohort = await prisma.cohort.findFirst({
    where: { programId, active: true, endDate: { gte: now } },
    orderBy: { examDate: 'asc' },
    select: { id: true },
  });
  return cohort?.id ?? null;
}

async function requireStudentProfileId(userId: string): Promise<string> {
  const profile = await prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) {
    throw ApiError.badRequest('Tài khoản chưa có hồ sơ học sinh. Vui lòng bổ sung lớp và khối trước khi tiếp tục.');
  }
  return profile.id;
}

/** Thông báo "đã kích hoạt khóa học" — lỗi ở đây không được làm hỏng thanh toán. */
async function queueActivationNotification(
  userId: string,
  courseName: string,
  expiresAt: Date,
  config: PlatformConfig,
): Promise<void> {
  if (!config.notification.enabled || !config.notification.triggers.afterPurchase) return;
  try {
    await prisma.notification.create({
      data: {
        userId,
        channel: 'IN_APP',
        templateCode: NOTIFICATION_TEMPLATE_PURCHASE,
        title: 'Khóa học đã được kích hoạt',
        body:
          `Bạn đã có quyền truy cập khóa "${courseName}" đến hết ngày ${formatDateVN(expiresAt)}. ` +
          'Hãy làm bài kiểm tra đầu vào để hệ thống xây lộ trình riêng cho bạn.',
        payload: { courseName, expiresAt: expiresAt.toISOString() },
        status: 'QUEUED',
      },
    });
  } catch (error) {
    console.error('[commerce] không tạo được thông báo kích hoạt', error);
  }
}

// ---------------------------------------------------------------------------
// 1. Checkout & coupon
// ---------------------------------------------------------------------------

export async function previewCheckout(input: { courseId: string; couponCode?: string }): Promise<CheckoutPreview> {
  const data = previewCheckoutSchema.parse(input);
  const config = await getConfig();

  const course = await loadCourseForSale(data.courseId);
  const pricing = await resolvePricing(course, config);
  const evaluation = await evaluateCoupon(data.couponCode, course, pricing.price);

  const total = Math.max(0, pricing.price - evaluation.discount);

  return {
    course: toCourseInfo(course),
    price: pricing.price,
    discount: evaluation.discount,
    total,
    currency: pricing.currency,
    accessDurationDays: pricing.accessDurationDays,
    priceLabel: formatVnd(pricing.price),
    totalLabel: formatVnd(total),
    accessUntilLabel: formatDateVN(addDays(new Date(), pricing.accessDurationDays)),
    couponCode: evaluation.valid ? evaluation.coupon?.code : undefined,
    couponError: data.couponCode && !evaluation.valid ? evaluation.message : undefined,
  };
}

/** Kiểm tra mã giảm giá trước khi đặt hàng — không ném lỗi, trả thông điệp mềm. */
export async function applyCouponPreview(
  code: string,
  courseId: string,
): Promise<{ valid: boolean; discount: number; message: string }> {
  const data = applyCouponSchema.parse({ code, courseId });
  const config = await getConfig();

  const course = await prisma.course.findUnique({
    where: { id: data.courseId },
    select: { id: true, programId: true },
  });
  if (!course) return { valid: false, discount: 0, message: 'Không tìm thấy khóa học.' };

  const pricing = await resolvePricing(course, config);
  const evaluation = await evaluateCoupon(data.code, course, pricing.price);

  return { valid: evaluation.valid, discount: evaluation.discount, message: evaluation.message };
}

/** Bản "cứng" của kiểm tra coupon: ném ApiError khi không hợp lệ. */
export async function validateCoupon(
  code: string,
  courseId: string,
): Promise<{ coupon: Coupon; discount: number; amountBefore: number; total: number }> {
  const data = applyCouponSchema.parse({ code, courseId });
  const course = await loadCourseForSale(data.courseId);
  const pricing = await resolvePricing(course);
  const evaluation = await evaluateCoupon(data.code, course, pricing.price);

  if (!evaluation.valid || !evaluation.coupon) {
    throw ApiError.badRequest(evaluation.message || 'Mã giảm giá không hợp lệ.');
  }

  return {
    coupon: evaluation.coupon,
    discount: evaluation.discount,
    amountBefore: pricing.price,
    total: Math.max(0, pricing.price - evaluation.discount),
  };
}

export async function createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
  const data = createCheckoutSchema.parse(input);
  const userId = input.userId;

  // Chặn spam tạo đơn: theo user và theo IP (specs §14 #2).
  enforceRateLimit(`checkout:user:${userId}`, RATE_LIMITS.CHECKOUT);
  if (input.ip) enforceRateLimit(`checkout:ip:${input.ip}`, RATE_LIMITS.CHECKOUT);

  const config = await getConfig();
  const course = await loadCourseForSale(data.courseId);
  const studentId = await requireStudentProfileId(userId);

  // Không cho mua trùng khi quyền truy cập còn hiệu lực.
  const existing = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId, courseId: course.id } },
  });
  if (existing && existing.status === 'ACTIVE' && existing.expiresAt.getTime() > Date.now()) {
    throw ApiError.conflict(
      `Bạn đang có quyền truy cập khóa học này đến hết ngày ${formatDateVN(existing.expiresAt)}. ` +
        'Nếu muốn gia hạn, vui lòng liên hệ bộ phận hỗ trợ.',
      { enrollmentId: existing.id, expiresAt: existing.expiresAt },
    );
  }

  const pricing = await resolvePricing(course, config);
  const evaluation = await evaluateCoupon(data.couponCode, course, pricing.price);
  if (data.couponCode && !evaluation.valid) {
    throw ApiError.badRequest(evaluation.message || 'Mã giảm giá không hợp lệ.');
  }

  const discount = evaluation.discount;
  const total = Math.max(0, pricing.price - discount);
  // Đơn 0đ (voucher 100%) không đi qua cổng thanh toán.
  const gatewayCode = total > 0 ? getGateway(config.commerce.gateway).code : 'MANUAL';

  const payment = await createPaymentRow({
    userId,
    courseId: course.id,
    amountOriginal: pricing.price,
    discountAmount: discount,
    amount: total,
    currency: pricing.currency,
    gateway: gatewayCode,
    couponId: evaluation.coupon?.id ?? null,
  });

  await track({
    eventName: EVENTS.START_CHECKOUT,
    userId,
    properties: {
      course_id: course.id,
      program_code: course.program.code,
      price: pricing.price,
      discount,
      total,
      order_code: payment.orderCode,
      coupon_code: evaluation.coupon?.code ?? null,
    },
  });
  await writeAudit({
    actorId: userId,
    action: COMMERCE_AUDIT.CHECKOUT_CREATE,
    entityType: 'Payment',
    entityId: payment.id,
    after: { orderCode: payment.orderCode, amount: total, gateway: gatewayCode, courseId: course.id },
    ip: input.ip ?? null,
  });

  if (total === 0) {
    const settled = await settlePayment({
      gatewayCode: 'MANUAL',
      parsed: {
        orderCode: payment.orderCode,
        status: 'PAID',
        gatewayTxnId: `FREE-${payment.orderCode}`,
        amount: 0,
      },
      rawPayload: { reason: 'FREE_ORDER', couponCode: evaluation.coupon?.code ?? null },
      actorId: userId,
      via: 'FREE_ORDER',
    });
    return {
      paymentId: payment.id,
      orderCode: payment.orderCode,
      redirectUrl: `${appBaseUrl()}/hoc-tap`,
      total,
      currency: pricing.currency,
      activatedImmediately: true,
      enrollmentId: settled.enrollmentId,
    };
  }

  const gateway = getGateway(gatewayCode);
  let redirectUrl: string | null = null;
  try {
    const created = await gateway.createPayment({
      orderCode: payment.orderCode,
      amount: total,
      currency: pricing.currency,
      description: `${course.program.code} - ${course.name}`,
      customerRef: userId,
      returnUrl: `${appBaseUrl()}/checkout/${payment.orderCode}`,
    });
    redirectUrl = created.redirectUrl;
    if (created.gatewayTxnId) {
      await prisma.payment.update({ where: { id: payment.id }, data: { gatewayTxnId: created.gatewayTxnId } });
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('[commerce] cổng thanh toán lỗi khi tạo đơn', error);
    throw new ApiError(502, 'PAYMENT_GATEWAY_ERROR', 'Không kết nối được cổng thanh toán, vui lòng thử lại sau.');
  }

  return {
    paymentId: payment.id,
    orderCode: payment.orderCode,
    redirectUrl,
    total,
    currency: pricing.currency,
    activatedImmediately: false,
  };
}

/** Tạo Payment với orderCode duy nhất; thử lại khi trùng mã ngẫu nhiên. */
async function createPaymentRow(data: {
  userId: string;
  courseId: string;
  amountOriginal: number;
  discountAmount: number;
  amount: number;
  currency: string;
  gateway: string;
  couponId: string | null;
}): Promise<{ id: string; orderCode: string }> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const orderCode = generateOrderCode();
    try {
      const payment = await prisma.payment.create({
        data: { ...data, orderCode, status: 'PENDING' },
        select: { id: true, orderCode: true },
      });
      return payment;
    } catch (error) {
      const duplicated =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!duplicated) throw error;
    }
  }
  throw ApiError.conflict('Không sinh được mã đơn hàng, vui lòng thử lại.');
}

// ---------------------------------------------------------------------------
// 2. Webhook & kích hoạt quyền truy cập (đường đi DUY NHẤT)
// ---------------------------------------------------------------------------

interface SettleInput {
  gatewayCode: string;
  parsed: ParsedWebhook;
  rawPayload: unknown;
  actorId?: string | null;
  via: 'WEBHOOK' | 'MANUAL_CONFIRM' | 'FREE_ORDER';
  ip?: string | null;
}

/** Enrollment gắn với payment; fallback theo (học sinh, khóa) khi đơn đã bị đơn mới ghi đè. */
async function findEnrollmentIdForPayment(payment: {
  id: string;
  userId: string;
  courseId: string;
}): Promise<string | undefined> {
  const byPayment = await prisma.enrollment.findFirst({
    where: { paymentId: payment.id },
    select: { id: true },
  });
  if (byPayment) return byPayment.id;

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: payment.userId },
    select: { id: true },
  });
  if (!profile) return undefined;

  const byCourse = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId: profile.id, courseId: payment.courseId } },
    select: { id: true },
  });
  return byCourse?.id;
}

/**
 * Ghi nhận kết quả thanh toán và kích hoạt entitlement — IDEMPOTENT.
 *
 * Khóa chống trùng là Payment.idempotencyKey = "<gateway>:<mã giao dịch>".
 * Việc "giành khóa" và tạo Enrollment nằm trong CÙNG một transaction, nên bắn
 * lại webhook bao nhiêu lần thì quyền truy cập cũng chỉ được cấp đúng một lần.
 */
async function settlePayment(input: SettleInput): Promise<WebhookResult> {
  const { parsed } = input;
  const idempotencyKey = `${input.gatewayCode}:${parsed.gatewayTxnId}`;
  const config = await getConfig();

  const payment = await prisma.payment.findUnique({ where: { orderCode: parsed.orderCode } });
  if (!payment) throw ApiError.notFound(`Không tìm thấy đơn hàng ${parsed.orderCode}.`);

  // (a) Đơn đã được xử lý trước đó — trả về kết quả cũ, tuyệt đối không cấp lại quyền.
  if (payment.idempotencyKey !== null || payment.status === 'PAID' || payment.status === 'REFUNDED') {
    const enrollmentId = await findEnrollmentIdForPayment(payment);
    return {
      handled: true,
      alreadyProcessed: true,
      enrollmentId,
      paymentId: payment.id,
      status: payment.status,
    };
  }

  // (b) Khóa idempotency đã thuộc về một đơn khác → webhook lặp/lạc, bỏ qua.
  const clash = await prisma.payment.findUnique({ where: { idempotencyKey }, select: { id: true } });
  if (clash && clash.id !== payment.id) {
    return { handled: true, alreadyProcessed: true, paymentId: payment.id, status: payment.status };
  }

  const webhookPayload = {
    via: input.via,
    receivedAt: new Date().toISOString(),
    parsed: { ...parsed },
    raw: (input.rawPayload ?? null) as Prisma.InputJsonValue,
  } as unknown as Prisma.InputJsonValue;

  // (c) Lệch tiền: ĐÁNH DẤU để đối soát, KHÔNG kích hoạt và KHÔNG giành khóa
  //     (để đơn được xử lý lại sau khi vận hành xác minh).
  if (parsed.amount !== payment.amount) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        webhookPayload: {
          ...(webhookPayload as object),
          amountMismatch: { expected: payment.amount, received: parsed.amount },
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await writeAudit({
      actorId: input.actorId ?? null,
      action: AUDIT_ACTIONS.PAYMENT_WEBHOOK,
      entityType: 'Payment',
      entityId: payment.id,
      after: { result: 'AMOUNT_MISMATCH', expected: payment.amount, received: parsed.amount, via: input.via },
      ip: input.ip ?? null,
    });
    return {
      handled: false,
      alreadyProcessed: false,
      paymentId: payment.id,
      status: payment.status,
      reason: 'AMOUNT_MISMATCH',
    };
  }

  // (d) Giao dịch thất bại/hủy: ghi nhận trạng thái, không tạo entitlement.
  if (parsed.status !== 'PAID') {
    const nextStatus: PaymentStatus = parsed.status === 'FAILED' ? 'FAILED' : 'CANCELLED';
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: nextStatus,
        idempotencyKey,
        gatewayTxnId: parsed.gatewayTxnId,
        webhookPayload,
      },
    });
    await writeAudit({
      actorId: input.actorId ?? null,
      action: AUDIT_ACTIONS.PAYMENT_WEBHOOK,
      entityType: 'Payment',
      entityId: payment.id,
      before: { status: payment.status },
      after: { status: nextStatus, via: input.via },
      ip: input.ip ?? null,
    });
    return {
      handled: true,
      alreadyProcessed: false,
      paymentId: payment.id,
      status: nextStatus,
      reason: 'PAYMENT_NOT_PAID',
    };
  }

  // (e) Thanh toán thành công.
  const course = await prisma.course.findUnique({ where: { id: payment.courseId }, include: courseInclude });
  if (!course) throw ApiError.notFound('Khóa học của đơn hàng không còn tồn tại.');

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: payment.userId },
    select: { id: true },
  });
  if (!profile) {
    // Ném lỗi để transaction chưa chạy: vận hành bổ sung hồ sơ rồi webhook retry là kích hoạt được.
    throw ApiError.conflict(
      'Tài khoản chưa có hồ sơ học sinh nên chưa thể kích hoạt khóa học. Vui lòng liên hệ bộ phận hỗ trợ.',
    );
  }

  const pricing = await resolvePricing(course, config);
  const cohortId = await findCurrentCohortId(course.programId);
  const now = new Date();

  const outcome = await prisma.$transaction(async (tx) => {
    // Giành khóa idempotency: chỉ MỘT lời gọi thắng, các lời gọi khác count = 0.
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, idempotencyKey: null, status: 'PENDING' },
      data: {
        idempotencyKey,
        status: 'PAID',
        paidAt: now,
        gatewayTxnId: parsed.gatewayTxnId,
        webhookPayload,
      },
    });
    if (claimed.count === 0) {
      return { alreadyProcessed: true as const, enrollmentId: undefined, expiresAt: now };
    }

    const current = await tx.enrollment.findUnique({
      where: { studentId_courseId: { studentId: profile.id, courseId: payment.courseId } },
    });

    // Mua lại/gia hạn: cộng dồn từ hạn còn lại, không cắt ngắn thời gian đang có.
    const base = current && current.expiresAt.getTime() > now.getTime() ? current.expiresAt : now;
    const expiresAt = addDays(base, pricing.accessDurationDays);

    const enrollment = current
      ? await tx.enrollment.update({
          where: { id: current.id },
          data: {
            status: 'ACTIVE',
            source: 'PAID',
            paymentId: payment.id,
            cohortId: current.cohortId ?? cohortId,
            expiresAt,
          },
          select: { id: true },
        })
      : await tx.enrollment.create({
          data: {
            studentId: profile.id,
            courseId: payment.courseId,
            cohortId,
            paymentId: payment.id,
            source: 'PAID',
            status: 'ACTIVE',
            startsAt: now,
            expiresAt,
          },
          select: { id: true },
        });

    if (payment.couponId) {
      await tx.coupon.update({ where: { id: payment.couponId }, data: { usedCount: { increment: 1 } } });
    }

    return { alreadyProcessed: false as const, enrollmentId: enrollment.id, expiresAt };
  });

  if (outcome.alreadyProcessed) {
    const enrollmentId = await findEnrollmentIdForPayment(payment);
    return { handled: true, alreadyProcessed: true, enrollmentId, paymentId: payment.id, status: 'PAID' };
  }

  const expiresAt = outcome.expiresAt;
  await writeAudit({
    actorId: input.actorId ?? null,
    action: AUDIT_ACTIONS.PAYMENT_WEBHOOK,
    entityType: 'Payment',
    entityId: payment.id,
    before: { status: payment.status },
    after: {
      status: 'PAID',
      via: input.via,
      enrollmentId: outcome.enrollmentId,
      amount: payment.amount,
      gatewayTxnId: parsed.gatewayTxnId,
      accessUntil: expiresAt,
    },
    ip: input.ip ?? null,
  });
  await track({
    eventName: EVENTS.PURCHASE_SUCCESS,
    userId: payment.userId,
    enrollmentId: outcome.enrollmentId,
    properties: {
      order_id: payment.orderCode,
      course_id: payment.courseId,
      program_code: course.program.code,
      amount: payment.amount,
      gateway: input.gatewayCode,
      via: input.via,
    },
  });
  await queueActivationNotification(payment.userId, course.name, expiresAt, config);

  return {
    handled: true,
    alreadyProcessed: false,
    enrollmentId: outcome.enrollmentId,
    paymentId: payment.id,
    status: 'PAID',
  };
}

export async function handlePaymentWebhook(input: {
  gatewayCode: string;
  rawBody: string;
  signature: string | null;
  payload: unknown;
  ip?: string | null;
}): Promise<WebhookResult> {
  const gateway = getGateway(input.gatewayCode);

  // Xác thực chữ ký TRƯỚC mọi thứ khác — không parse dữ liệu chưa tin cậy vào DB.
  if (!gateway.verifyWebhook(input.rawBody, input.signature)) {
    throw ApiError.forbidden('Chữ ký webhook không hợp lệ.');
  }

  const parsed = gateway.parseWebhook(input.payload);
  return settlePayment({
    gatewayCode: gateway.code,
    parsed,
    rawPayload: input.payload,
    via: 'WEBHOOK',
    ip: input.ip ?? null,
  });
}

/** Xác nhận tay (dev/admin) — đi qua ĐÚNG đường idempotent của webhook. */
export async function confirmMockPayment(orderCode: string, actorId?: string): Promise<{ enrollmentId: string }> {
  const config = await getConfig();
  if (!config.commerce.allowManualActivation) {
    throw ApiError.forbidden('Chức năng xác nhận thanh toán thủ công đang bị tắt.');
  }

  const code = orderCode.trim().toUpperCase();
  const payment = await prisma.payment.findUnique({ where: { orderCode: code } });
  if (!payment) throw ApiError.notFound(`Không tìm thấy đơn hàng ${code}.`);
  if (payment.status === 'REFUNDED' || payment.status === 'CANCELLED') {
    throw ApiError.conflict(`Đơn hàng đang ở trạng thái "${PAYMENT_STATUS_LABEL[payment.status]}", không thể xác nhận.`);
  }

  const result = await settlePayment({
    gatewayCode: payment.gateway,
    parsed: {
      orderCode: payment.orderCode,
      status: 'PAID',
      gatewayTxnId: `MANUAL-${payment.orderCode}`,
      amount: payment.amount,
    },
    rawPayload: { confirmedBy: actorId ?? 'system', confirmedAt: new Date().toISOString() },
    actorId: actorId ?? null,
    via: 'MANUAL_CONFIRM',
  });

  if (!result.enrollmentId) {
    throw ApiError.conflict(
      'Đơn hàng đã được xử lý trước đó nhưng không tìm thấy quyền truy cập tương ứng. Vui lòng kiểm tra lại hồ sơ học sinh.',
    );
  }
  return { enrollmentId: result.enrollmentId };
}

// ---------------------------------------------------------------------------
// 3. Entitlement
// ---------------------------------------------------------------------------

/**
 * Cấp quyền truy cập không qua thanh toán (học bổng, voucher 100%, tài khoản
 * nội bộ). Entitlement gắn Enrollment nên KHÔNG tạo Payment (specs §11).
 */
export async function activateEnrollmentManually(input: ManualActivationInput): Promise<{ enrollmentId: string }> {
  const data = manualActivationSchema.parse(input);
  const config = await getConfig();
  if (!config.commerce.allowManualActivation) {
    throw ApiError.forbidden('Chức năng kích hoạt thủ công đang bị tắt trong cấu hình hệ thống.');
  }

  const course = await prisma.course.findUnique({ where: { id: data.courseId }, include: courseInclude });
  if (!course) throw ApiError.notFound('Không tìm thấy khóa học.');

  const studentId = await requireStudentProfileId(data.studentUserId);
  const pricing = await resolvePricing(course, config);
  const durationDays = data.durationDays ?? pricing.accessDurationDays;
  const cohortId = await findCurrentCohortId(course.programId);
  const now = new Date();

  const current = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId, courseId: course.id } },
  });

  const base = current && current.expiresAt.getTime() > now.getTime() ? current.expiresAt : now;
  const expiresAt = addDays(base, durationDays);

  const enrollment = current
    ? await prisma.enrollment.update({
        where: { id: current.id },
        data: {
          status: 'ACTIVE',
          source: data.source,
          cohortId: current.cohortId ?? cohortId,
          expiresAt,
        },
        select: { id: true },
      })
    : await prisma.enrollment.create({
        data: {
          studentId,
          courseId: course.id,
          cohortId,
          source: data.source,
          status: 'ACTIVE',
          startsAt: now,
          expiresAt,
        },
        select: { id: true },
      });

  await writeAudit({
    actorId: input.actorId,
    action: AUDIT_ACTIONS.ENROLLMENT_ACTIVATE,
    entityType: 'Enrollment',
    entityId: enrollment.id,
    before: current ? { status: current.status, expiresAt: current.expiresAt } : null,
    after: {
      status: 'ACTIVE',
      source: data.source,
      expiresAt,
      durationDays,
      courseId: course.id,
      studentUserId: data.studentUserId,
      note: data.note ?? null,
    },
  });
  await queueActivationNotification(data.studentUserId, course.name, expiresAt, config);

  return { enrollmentId: enrollment.id };
}

export async function extendEnrollment(
  enrollmentId: string,
  extraDays: number,
  actorId: string,
): Promise<EnrollmentSummary> {
  const { extraDays: days } = extendEnrollmentSchema.parse({ extraDays });

  const current = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!current) throw ApiError.notFound('Không tìm thấy quyền truy cập cần gia hạn.');

  const now = new Date();
  const base = current.expiresAt.getTime() > now.getTime() ? current.expiresAt : now;
  const expiresAt = addDays(base, days);

  await prisma.enrollment.update({
    where: { id: current.id },
    // Gia hạn cho bản ghi đã hết hạn thì mở lại; bản ghi đang bị khóa vẫn giữ trạng thái khóa.
    data: {
      expiresAt,
      status: current.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
    },
  });

  await writeAudit({
    actorId,
    action: AUDIT_ACTIONS.ENROLLMENT_EXTEND,
    entityType: 'Enrollment',
    entityId: current.id,
    before: { expiresAt: current.expiresAt, status: current.status },
    after: { expiresAt, extraDays: days },
  });

  return loadEnrollmentSummary(current.id);
}

export async function suspendEnrollment(enrollmentId: string, actorId: string): Promise<EnrollmentSummary> {
  const current = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!current) throw ApiError.notFound('Không tìm thấy quyền truy cập.');
  if (current.status === 'SUSPENDED') return loadEnrollmentSummary(current.id);

  await prisma.enrollment.update({ where: { id: current.id }, data: { status: 'SUSPENDED' } });
  await writeAudit({
    actorId,
    action: AUDIT_ACTIONS.ENROLLMENT_SUSPEND,
    entityType: 'Enrollment',
    entityId: current.id,
    before: { status: current.status },
    after: { status: 'SUSPENDED' },
  });

  return loadEnrollmentSummary(current.id);
}

export async function resumeEnrollment(enrollmentId: string, actorId: string): Promise<EnrollmentSummary> {
  const current = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!current) throw ApiError.notFound('Không tìm thấy quyền truy cập.');
  if (current.status === 'ACTIVE') return loadEnrollmentSummary(current.id);

  // Hết hạn thì không "mở khóa" được — phải gia hạn trước, tránh mở nhầm quyền đã hết.
  if (current.expiresAt.getTime() <= Date.now()) {
    await prisma.enrollment.update({ where: { id: current.id }, data: { status: 'EXPIRED' } });
    throw ApiError.badRequest(
      `Quyền truy cập đã hết hạn ngày ${formatDateVN(current.expiresAt)}. Hãy gia hạn trước khi mở lại.`,
    );
  }

  await prisma.enrollment.update({ where: { id: current.id }, data: { status: 'ACTIVE' } });
  await writeAudit({
    actorId,
    action: AUDIT_ACTIONS.ENROLLMENT_ACTIVATE,
    entityType: 'Enrollment',
    entityId: current.id,
    before: { status: current.status },
    after: { status: 'ACTIVE' },
  });

  return loadEnrollmentSummary(current.id);
}

const enrollmentInclude = {
  course: { include: courseInclude },
  cohort: { select: { id: true, name: true, examDate: true } },
} as const;

type EnrollmentWithCourse = Prisma.EnrollmentGetPayload<{ include: typeof enrollmentInclude }>;

async function computeProgress(enrollmentId: string): Promise<EnrollmentProgress> {
  const [totalPlanDays, completedPlanDays, mastery] = await Promise.all([
    prisma.studyPlanDay.count({ where: { plan: { enrollmentId } } }),
    prisma.studyPlanDay.count({ where: { plan: { enrollmentId }, status: 'COMPLETED' } }),
    prisma.studentSkillMastery.aggregate({
      where: { enrollmentId },
      _avg: { masteryScore: true },
      _count: { _all: true },
    }),
  ]);

  return {
    totalPlanDays,
    completedPlanDays,
    // Chưa có lộ trình → 0, không chia cho 0.
    completionRate: totalPlanDays > 0 ? Math.round((completedPlanDays / totalPlanDays) * 100) / 100 : 0,
    averageMastery: Math.round((mastery._avg.masteryScore ?? 0) * 10) / 10,
    skillsTracked: mastery._count._all,
  };
}

async function toEnrollmentSummary(
  enrollment: EnrollmentWithCourse,
  config: PlatformConfig,
): Promise<EnrollmentSummary> {
  const progress = await computeProgress(enrollment.id);
  const daysLeft = daysUntil(enrollment.expiresAt);

  return {
    id: enrollment.id,
    status: enrollment.status,
    statusLabel: ENROLLMENT_STATUS_LABEL[enrollment.status],
    source: enrollment.source,
    sourceLabel: ENROLLMENT_SOURCE_LABEL[enrollment.source],
    startsAt: enrollment.startsAt,
    expiresAt: enrollment.expiresAt,
    expiresAtLabel: formatDateVN(enrollment.expiresAt),
    daysLeft,
    expiringSoon:
      enrollment.status === 'ACTIVE' &&
      daysLeft >= 0 &&
      daysLeft <= config.notification.triggers.accessExpiringBeforeDays,
    onboardedAt: enrollment.onboardedAt,
    selfDeclaredLevel: enrollment.selfDeclaredLevel,
    estimatedLevel: enrollment.estimatedLevel,
    estimatedLevelLabel: enrollment.estimatedLevel
      ? (config.levels.labels[enrollment.estimatedLevel] ?? LEVEL_LABEL[enrollment.estimatedLevel])
      : null,
    course: toCourseInfo(enrollment.course),
    cohort: enrollment.cohort,
    progress,
  };
}

async function loadEnrollmentSummary(enrollmentId: string): Promise<EnrollmentSummary> {
  const [config, enrollment] = await Promise.all([
    getConfig(),
    prisma.enrollment.findUnique({ where: { id: enrollmentId }, include: enrollmentInclude }),
  ]);
  if (!enrollment) throw ApiError.notFound('Không tìm thấy quyền truy cập.');
  return toEnrollmentSummary(enrollment, config);
}

export async function listEnrollmentsForUser(userId: string): Promise<EnrollmentSummary[]> {
  const profile = await prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return [];

  const [config, enrollments] = await Promise.all([
    getConfig(),
    prisma.enrollment.findMany({
      where: { studentId: profile.id },
      include: enrollmentInclude,
      orderBy: [{ status: 'asc' }, { expiresAt: 'desc' }],
    }),
  ]);

  return Promise.all(enrollments.map((enrollment) => toEnrollmentSummary(enrollment, config)));
}

export async function getEnrollmentForUser(userId: string, enrollmentId: string): Promise<EnrollmentSummary> {
  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId }, include: enrollmentInclude });
  if (!enrollment) throw ApiError.notFound('Không tìm thấy khóa học đã đăng ký.');

  const profile = await prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile || profile.id !== enrollment.studentId) {
    throw ApiError.forbidden('Bạn không có quyền xem khóa học này.');
  }

  return toEnrollmentSummary(enrollment, await getConfig());
}

/**
 * Cổng kiểm tra dùng chung cho MỌI module học tập (assessment, plan, practice).
 * Hết hạn hoặc bị khóa đều chặn, kèm thông điệp tiếng Việt để UI hiển thị thẳng.
 */
export async function requireActiveEnrollment(userId: string, enrollmentId: string): Promise<Enrollment> {
  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment) throw ApiError.notFound('Không tìm thấy khóa học đã đăng ký.');

  const profile = await prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile || profile.id !== enrollment.studentId) {
    throw ApiError.forbidden('Bạn không có quyền truy cập khóa học này.');
  }

  if (enrollment.status === 'SUSPENDED') {
    throw ApiError.forbidden('Quyền truy cập của bạn đang tạm khóa. Vui lòng liên hệ bộ phận hỗ trợ.');
  }

  if (enrollment.expiresAt.getTime() <= Date.now()) {
    // Đồng bộ trạng thái ngay để dashboard và cron không lệch nhau.
    if (enrollment.status === 'ACTIVE') {
      await prisma.enrollment.update({ where: { id: enrollment.id }, data: { status: 'EXPIRED' } });
    }
    throw ApiError.forbidden(
      `Quyền truy cập khóa học đã hết hạn ngày ${formatDateVN(enrollment.expiresAt)}. Hãy gia hạn để tiếp tục học.`,
    );
  }

  if (enrollment.status !== 'ACTIVE') {
    throw ApiError.forbidden('Quyền truy cập khóa học không còn hiệu lực. Vui lòng liên hệ bộ phận hỗ trợ.');
  }

  return enrollment;
}

/** Cron hằng ngày: đóng các quyền truy cập đã quá hạn. Trả về số bản ghi đã đổi. */
export async function expireOverdueEnrollments(): Promise<number> {
  const result = await prisma.enrollment.updateMany({
    where: { status: 'ACTIVE', expiresAt: { lte: new Date() } },
    data: { status: 'EXPIRED' },
  });
  if (result.count > 0) {
    console.info(`[commerce] đã chuyển ${result.count} enrollment sang EXPIRED`);
  }
  return result.count;
}

// ---------------------------------------------------------------------------
// 4. Vận hành: đơn hàng, hoàn tiền, coupon
// ---------------------------------------------------------------------------

const paymentInclude = {
  user: { select: { id: true, fullName: true, email: true, phone: true } },
  course: { select: { id: true, name: true, program: { select: { code: true, name: true } } } },
  coupon: { select: { id: true, code: true, type: true, value: true } },
  enrollment: { select: { id: true, status: true, expiresAt: true } },
} as const;

export type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }> & {
  statusLabel: string;
  amountLabel: string;
};

export interface PaymentListResult {
  items: PaymentRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Tổng tiền các đơn PAID khớp bộ lọc — phục vụ đối soát doanh thu. */
  paidAmount: number;
}

export async function listPayments(filter: ListPaymentsFilter = {}): Promise<PaymentListResult> {
  const f = listPaymentsSchema.parse(filter);

  const where: Prisma.PaymentWhereInput = {
    ...(f.status ? { status: f.status } : {}),
    ...(f.gateway ? { gateway: f.gateway.toUpperCase() } : {}),
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.courseId ? { courseId: f.courseId } : {}),
    ...(f.programId ? { course: { programId: f.programId } } : {}),
    ...(f.orderCode ? { orderCode: { contains: f.orderCode.toUpperCase() } } : {}),
    ...(f.couponCode ? { coupon: { code: f.couponCode } } : {}),
    ...(f.from || f.to
      ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } }
      : {}),
  };

  const [rows, total, paid] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: paymentInclude,
      orderBy: { createdAt: 'desc' },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({ where: { ...where, status: 'PAID' }, _sum: { amount: true } }),
  ]);

  return {
    items: rows.map((row) => ({
      ...row,
      statusLabel: PAYMENT_STATUS_LABEL[row.status],
      amountLabel: formatVnd(row.amount),
    })),
    total,
    page: f.page,
    pageSize: f.pageSize,
    paidAmount: paid._sum.amount ?? 0,
  };
}

/** Hoàn tiền: chỉ đơn đã PAID; quyền truy cập kèm theo bị tạm khóa chứ không xóa lịch sử. */
export async function refundPayment(
  paymentId: string,
  note: string,
  actorId: string,
): Promise<{ paymentId: string; status: PaymentStatus; suspendedEnrollmentId?: string }> {
  const { note: refundNote } = refundPaymentSchema.parse({ note });

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { enrollment: { select: { id: true, status: true } } },
  });
  if (!payment) throw ApiError.notFound('Không tìm thấy đơn hàng.');
  if (payment.status !== 'PAID') {
    throw ApiError.conflict(
      `Chỉ hoàn tiền được đơn ở trạng thái "${PAYMENT_STATUS_LABEL.PAID}". Đơn này đang "${PAYMENT_STATUS_LABEL[payment.status]}".`,
    );
  }

  const suspendedEnrollmentId = payment.enrollment?.id;

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'REFUNDED', refundNote },
    });
    if (suspendedEnrollmentId) {
      await tx.enrollment.update({ where: { id: suspendedEnrollmentId }, data: { status: 'SUSPENDED' } });
    }
  });

  await writeAudit({
    actorId,
    action: AUDIT_ACTIONS.PAYMENT_REFUND,
    entityType: 'Payment',
    entityId: payment.id,
    before: { status: payment.status },
    after: { status: 'REFUNDED', refundNote, suspendedEnrollmentId: suspendedEnrollmentId ?? null },
  });
  if (suspendedEnrollmentId) {
    await writeAudit({
      actorId,
      action: AUDIT_ACTIONS.ENROLLMENT_SUSPEND,
      entityType: 'Enrollment',
      entityId: suspendedEnrollmentId,
      before: { status: payment.enrollment?.status },
      after: { status: 'SUSPENDED', reason: 'REFUND', paymentId: payment.id },
    });
  }

  return { paymentId: payment.id, status: 'REFUNDED', suspendedEnrollmentId };
}

export async function upsertCoupon(input: UpsertCouponInput, actorId: string): Promise<Coupon> {
  const data = upsertCouponSchema.parse(input);

  if (data.programId) {
    const program = await prisma.program.findUnique({ where: { id: data.programId }, select: { id: true } });
    if (!program) throw ApiError.badRequest('Chương trình áp dụng không tồn tại.');
  }
  if (data.courseId) {
    const course = await prisma.course.findUnique({
      where: { id: data.courseId },
      select: { id: true, programId: true },
    });
    if (!course) throw ApiError.badRequest('Khóa học áp dụng không tồn tại.');
    if (data.programId && course.programId !== data.programId) {
      throw ApiError.badRequest('Khóa học áp dụng không thuộc chương trình đã chọn.');
    }
  }

  const before = await prisma.coupon.findUnique({ where: { code: data.code } });
  // Không cho hạ maxUses xuống dưới số lượt đã dùng — dữ liệu sẽ mâu thuẫn khi đối soát.
  if (before && data.maxUses != null && data.maxUses < before.usedCount) {
    throw ApiError.badRequest(`Mã đã dùng ${before.usedCount} lượt, không thể đặt giới hạn thấp hơn.`);
  }

  const payload = {
    type: data.type,
    value: data.value,
    maxUses: data.maxUses ?? null,
    expiresAt: data.expiresAt ?? null,
    programId: data.programId ?? null,
    courseId: data.courseId ?? null,
    active: data.active,
  };

  const coupon = await prisma.coupon.upsert({
    where: { code: data.code },
    create: { code: data.code, ...payload },
    update: payload,
  });

  await writeAudit({
    actorId,
    action: COMMERCE_AUDIT.COUPON_UPSERT,
    entityType: 'Coupon',
    entityId: coupon.id,
    before,
    after: coupon,
  });

  return coupon;
}

export interface CouponRow extends Coupon {
  typeLabel: string;
  valueLabel: string;
  remainingUses: number | null;
  expired: boolean;
  usable: boolean;
}

export async function listCoupons(
  filter: ListCouponsFilter = {},
): Promise<{ items: CouponRow[]; total: number; page: number; pageSize: number }> {
  const f = listCouponsSchema.parse(filter);
  const now = new Date();

  const where: Prisma.CouponWhereInput = {
    ...(f.code ? { code: { contains: f.code.toUpperCase() } } : {}),
    ...(f.programId ? { programId: f.programId } : {}),
    ...(f.courseId ? { courseId: f.courseId } : {}),
    ...(f.active === undefined ? {} : { active: f.active }),
    ...(f.includeExpired ? {} : { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }),
  };

  const [rows, total] = await Promise.all([
    prisma.coupon.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
    prisma.coupon.count({ where }),
  ]);

  const items: CouponRow[] = rows.map((coupon) => {
    const expired = coupon.expiresAt !== null && coupon.expiresAt.getTime() < now.getTime();
    const remainingUses = coupon.maxUses === null ? null : Math.max(0, coupon.maxUses - coupon.usedCount);
    return {
      ...coupon,
      typeLabel: coupon.type === 'PERCENT' ? 'Giảm theo phần trăm' : 'Giảm số tiền',
      valueLabel: coupon.type === 'PERCENT' ? `${coupon.value}%` : formatVnd(coupon.value),
      remainingUses,
      expired,
      usable: coupon.active && !expired && (remainingUses === null || remainingUses > 0),
    };
  });

  return { items, total, page: f.page, pageSize: f.pageSize };
}
