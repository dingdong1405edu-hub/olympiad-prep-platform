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
import {
  appBaseUrl,
  buildGatewayDescription,
  getGateway,
  type CreatePaymentResult,
  type ParsedWebhook,
  type PaymentGateway,
  type PaymentQrPayload,
} from './gateway';
import { PAYOS_DUPLICATE_ORDER_CODE, PayosApiError } from './payos';
import { tryBuildQrArtwork, type QrArtwork } from './qr';
import {
  applyCouponSchema,
  cancelPaymentSchema,
  createCheckoutSchema,
  extendEnrollmentSchema,
  listCouponsSchema,
  listPaymentsSchema,
  manualActivationSchema,
  orderCodeSchema,
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
  /** Chỉ có với cổng chuyển hướng. Cổng QR tại chỗ luôn để null. */
  redirectUrl: string | null;
  total: number;
  currency: string;
  /** true khi tổng tiền = 0 (voucher 100%) → quyền truy cập kích hoạt ngay. */
  activatedImmediately: boolean;
  enrollmentId?: string;
  gateway: string;
  /**
   * Có giá trị khi cổng vẽ QR tại chỗ: đủ dữ liệu để mở thẳng màn hình quét mã
   * mà không phải gọi thêm một vòng API nào nữa.
   */
  session: PaymentSession | null;
  /** Trang theo dõi đơn — dùng khi cần rời khỏi luồng hiện tại. */
  resultUrl: string;
}

/** Trạng thái đơn cho màn hình chờ thanh toán — không lộ dữ liệu của người khác. */
export interface PaymentSession {
  orderCode: string;
  status: PaymentStatus;
  statusLabel: string;
  gateway: string;
  amount: number;
  amountLabel: string;
  currency: string;
  createdAt: string;
  /** null khi cổng không trả QR (MANUAL) hoặc đơn đã đóng. */
  qr: PaymentQrPayload | null;
  qrArtwork: QrArtwork | null;
  /** Có sau khi thanh toán thành công — nơi học sinh đi tiếp. */
  enrollmentId: string | null;
  course: { id: string; name: string; programName: string };
  /** Cổng đã hết hạn nhận tiền cho đơn này. */
  expired: boolean;
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

/**
 * Mã đơn dạng số cho cổng bắt buộc kiểu number (PayOS).
 *
 * 9 chữ số nằm gọn trong Int32 nên cột vẫn là INTEGER, khỏi kéo BigInt vào tầng
 * JSON. Trùng thì đã có ràng buộc UNIQUE chặn lại và vòng lặp sinh mã khác.
 */
function generateNumericOrderRef(): number {
  return 100_000_000 + Math.floor(Math.random() * 900_000_000);
}

/** Hạn hiệu lực của mã QR. Quá hạn cổng từ chối tiền vào, tránh trả tiền vào đơn chết. */
const QR_TTL_MINUTES = 30;

function qrExpiryFrom(createdAt: Date): Date {
  return new Date(createdAt.getTime() + QR_TTL_MINUTES * 60_000);
}

/**
 * Các mã số cổng ĐÃ TỪNG cấp cho đơn này.
 *
 * Mỗi lần mã QR hết hạn và xin mã mới, `gatewayOrderRef` bị ghi đè. Nếu chỉ tra
 * theo mã hiện tại thì một webhook về muộn của mã cũ — tiền đã vào tài khoản
 * thật — sẽ không tìm thấy đơn nào. Danh sách này khép lại đúng lỗ hổng đó.
 */
function readPreviousOrderRefs(meta: Prisma.JsonValue | null): number[] {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return [];
  const list = (meta as Record<string, unknown>).previousOrderRefs;
  if (!Array.isArray(list)) return [];
  return list.filter((value): value is number => typeof value === 'number' && Number.isInteger(value));
}

/** `gatewayMeta` lưu dạng Json tự do — đọc lại phải kiểm kiểu, không tin cột JSON. */
function readQrMeta(meta: Prisma.JsonValue | null): PaymentQrPayload | null {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return null;
  const source = meta as Record<string, unknown>;
  const qr = source.qr;
  if (typeof qr !== 'object' || qr === null || Array.isArray(qr)) return null;

  const payload = qr as Record<string, unknown>;
  if (typeof payload.raw !== 'string' || payload.raw.length === 0) return null;

  const str = (key: string): string | null =>
    typeof payload[key] === 'string' && (payload[key] as string).length > 0 ? (payload[key] as string) : null;

  return {
    raw: payload.raw,
    bin: str('bin'),
    accountNumber: str('accountNumber'),
    accountName: str('accountName'),
    transferContent: str('transferContent'),
    amount: typeof payload.amount === 'number' ? payload.amount : 0,
    expiresAt: str('expiresAt'),
    checkoutUrl: str('checkoutUrl'),
    paymentLinkId: str('paymentLinkId'),
  };
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

  const resultUrl = `${appBaseUrl()}${checkoutResultPath(payment.orderCode)}`;

  if (total === 0) {
    const settled = await settlePayment({
      gatewayCode: 'MANUAL',
      parsed: {
        orderCode: payment.orderCode,
        numericOrderRef: null,
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
      gateway: 'MANUAL',
      session: null,
      resultUrl,
    };
  }

  const gateway = getGateway(gatewayCode);
  const created = await openGatewayPayment({
    gateway,
    paymentId: payment.id,
    orderCode: payment.orderCode,
    numericOrderRef: payment.gatewayOrderRef,
    amount: total,
    currency: pricing.currency,
    description: buildGatewayDescription(payment.orderCode),
    customerRef: userId,
    resultUrl,
  });

  return {
    paymentId: payment.id,
    orderCode: payment.orderCode,
    redirectUrl: created.redirectUrl,
    total,
    currency: pricing.currency,
    activatedImmediately: false,
    gateway: gateway.code,
    // Đơn vừa mở xong nên không cần hỏi lại cổng — tiết kiệm một vòng gọi mạng
    // ngay ở khoảnh khắc người dùng đang chờ mã QR hiện ra.
    session: created.qr ? await getPaymentSession(userId, payment.orderCode, { reconcile: false }) : null,
    resultUrl,
  };
}

/** Trùng `routes.checkoutResult`; giữ bản sao ở server để tầng dịch vụ không import UI. */
function checkoutResultPath(orderCode: string): string {
  return `/thanh-toan/ket-qua/${orderCode}`;
}

/**
 * Mở đơn ở phía cổng rồi ghi QR/mã giao dịch vào Payment.
 *
 * Tách riêng vì có hai chỗ gọi: lúc tạo đơn, và lúc người dùng quay lại trang chờ
 * khi mã QR cũ đã hết hạn. PayOS báo trùng `orderCode` (mã 231) khi số đó đã tồn
 * tại phía họ — hay gặp khi dev và production dùng chung khóa merchant — nên gặp
 * mã đó thì cấp số mới rồi thử lại, thay vì bắt khách chịu lỗi.
 */
async function openGatewayPayment(input: {
  gateway: PaymentGateway;
  paymentId: string;
  orderCode: string;
  numericOrderRef: number | null;
  amount: number;
  currency: string;
  description: string;
  customerRef: string;
  resultUrl: string;
  /** Mã số đã dùng ở những lần mở trước — giữ lại để webhook về muộn vẫn khớp đơn. */
  previousOrderRefs?: number[];
}): Promise<CreatePaymentResult> {
  const now = new Date();
  const expiresAt = qrExpiryFrom(now);
  let numericOrderRef = input.numericOrderRef ?? generateNumericOrderRef();

  // Giới hạn 20 mã: đủ cho mọi lần gia hạn thực tế mà cột JSON không phình vô hạn.
  const history = [...new Set(input.previousOrderRefs ?? [])].slice(-20);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const created = await input.gateway.createPayment({
        orderCode: input.orderCode,
        numericOrderRef,
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        customerRef: input.customerRef,
        returnUrl: input.resultUrl,
        cancelUrl: `${input.resultUrl}?huy=1`,
        expiresAt: input.gateway.rendersQrInline ? expiresAt : null,
      });

      await prisma.payment.update({
        where: { id: input.paymentId },
        data: {
          gatewayOrderRef: numericOrderRef,
          ...(created.gatewayTxnId ? { gatewayTxnId: created.gatewayTxnId } : {}),
          ...(created.qr
            ? {
                gatewayMeta: {
                  qr: { ...created.qr, expiresAt: created.qr.expiresAt ?? expiresAt.toISOString() },
                  openedAt: now.toISOString(),
                  previousOrderRefs: history,
                } as unknown as Prisma.InputJsonValue,
              }
            : {}),
        },
      });

      return created;
    } catch (error) {
      const duplicated =
        (error instanceof PayosApiError && error.code === PAYOS_DUPLICATE_ORDER_CODE) ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002');

      if (duplicated && attempt < 3) {
        numericOrderRef = generateNumericOrderRef();
        continue;
      }

      if (error instanceof ApiError) throw error;
      if (error instanceof PayosApiError) {
        console.error('[commerce] PayOS từ chối tạo đơn', { code: error.code, message: error.message });
        throw new ApiError(502, 'PAYMENT_GATEWAY_ERROR', `Cổng thanh toán từ chối tạo đơn: ${error.message}`);
      }
      console.error('[commerce] cổng thanh toán lỗi khi tạo đơn', error);
      throw new ApiError(502, 'PAYMENT_GATEWAY_ERROR', 'Không kết nối được cổng thanh toán, vui lòng thử lại sau.');
    }
  }

  throw new ApiError(502, 'PAYMENT_GATEWAY_ERROR', 'Không tạo được mã thanh toán, vui lòng thử lại.');
}

/**
 * Tạo Payment với orderCode duy nhất; thử lại khi trùng mã ngẫu nhiên.
 * Cấp luôn `gatewayOrderRef` ngay từ đầu để đối soát theo mã số làm được kể cả
 * khi lời gọi sang cổng thất bại giữa chừng.
 */
async function createPaymentRow(data: {
  userId: string;
  courseId: string;
  amountOriginal: number;
  discountAmount: number;
  amount: number;
  currency: string;
  gateway: string;
  couponId: string | null;
}): Promise<{ id: string; orderCode: string; gatewayOrderRef: number | null }> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const orderCode = generateOrderCode();
    try {
      const payment = await prisma.payment.create({
        data: { ...data, orderCode, gatewayOrderRef: generateNumericOrderRef(), status: 'PENDING' },
        select: { id: true, orderCode: true, gatewayOrderRef: true },
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
  /** RECONCILE = mình chủ động hỏi cổng, không phải cổng gọi vào. */
  via: 'WEBHOOK' | 'MANUAL_CONFIRM' | 'FREE_ORDER' | 'RECONCILE';
  ip?: string | null;
}

/**
 * Tìm Payment từ dữ liệu webhook. Cổng kiểu PayOS chỉ biết mã số nên phải tra
 * theo `gatewayOrderRef`; cổng gửi lại mã đơn nội bộ thì tra thẳng theo orderCode.
 */
async function findPaymentForWebhook(parsed: ParsedWebhook) {
  if (parsed.orderCode) {
    const byOrderCode = await prisma.payment.findUnique({ where: { orderCode: parsed.orderCode } });
    if (byOrderCode) return byOrderCode;
  }
  if (parsed.numericOrderRef !== null) {
    const byRef = await prisma.payment.findUnique({ where: { gatewayOrderRef: parsed.numericOrderRef } });
    if (byRef) return byRef;

    // Mã cũ của đơn đã được cấp lại QR: tiền vẫn là tiền thật, phải khớp được đơn.
    return prisma.payment.findFirst({
      where: {
        gatewayMeta: { path: ['previousOrderRefs'], array_contains: parsed.numericOrderRef },
      },
    });
  }
  return null;
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

  const payment = await findPaymentForWebhook(parsed);
  if (!payment) {
    const label = parsed.orderCode ?? parsed.numericOrderRef;
    /**
     * Webhook trỏ tới đơn không tồn tại. Đúng một tình huống bình thường gây ra
     * chuyện này: PayOS bắn gói thử (orderCode 123) lúc đăng ký URL và chỉ chấp
     * nhận URL nào trả HTTP 200. Còn lại là webhook lạc từ môi trường khác dùng
     * chung khóa merchant — cũng không có gì để làm. Cả hai đều phải trả 200,
     * vì trả lỗi chỉ khiến cổng bắn lại mãi mãi.
     */
    if (input.via === 'WEBHOOK') {
      console.warn('[commerce] webhook trỏ tới đơn không tồn tại', { orderCode: label });
      return { handled: false, alreadyProcessed: false, reason: 'ORDER_NOT_FOUND' };
    }
    throw ApiError.notFound(`Không tìm thấy đơn hàng ${label}.`);
  }

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

// ---------------------------------------------------------------------------
// 2b. Trang chờ thanh toán: đọc QR, hỏi cổng, hủy đơn
// ---------------------------------------------------------------------------

const paymentSessionInclude = {
  course: { select: { id: true, name: true, program: { select: { name: true } } } },
  enrollment: { select: { id: true } },
} as const;

type PaymentForSession = Prisma.PaymentGetPayload<{ include: typeof paymentSessionInclude }>;

/** Chủ đơn mới được xem. Không dùng ApiError.notFound riêng cho hai trường hợp
 *  "không có đơn" và "đơn của người khác" — làm vậy là để lộ mã đơn nào có thật. */
async function loadOwnPayment(userId: string, orderCode: string): Promise<PaymentForSession> {
  const payment = await prisma.payment.findUnique({
    where: { orderCode: orderCodeSchema.parse(orderCode) },
    include: paymentSessionInclude,
  });
  if (!payment || payment.userId !== userId) {
    throw ApiError.notFound('Không tìm thấy đơn hàng này.');
  }
  return payment;
}

function toPaymentSession(payment: PaymentForSession, qr: PaymentQrPayload | null): PaymentSession {
  const expiresAt = qr?.expiresAt ? new Date(qr.expiresAt).getTime() : null;
  const live = payment.status === 'PENDING' ? qr : null;
  return {
    qrArtwork: tryBuildQrArtwork(live?.raw),
    orderCode: payment.orderCode,
    status: payment.status,
    statusLabel: PAYMENT_STATUS_LABEL[payment.status],
    gateway: payment.gateway,
    amount: payment.amount,
    amountLabel: formatVnd(payment.amount),
    currency: payment.currency,
    createdAt: payment.createdAt.toISOString(),
    qr: live,
    enrollmentId: payment.enrollment?.id ?? null,
    course: {
      id: payment.course.id,
      name: payment.course.name,
      programName: payment.course.program.name,
    },
    expired: expiresAt !== null && expiresAt <= Date.now(),
  };
}

/**
 * Trạng thái đơn cho màn hình chờ + ĐỐI SOÁT CHỦ ĐỘNG với cổng.
 *
 * Đây là xương sống của luồng QR, không phải tối ưu phụ. Webhook không bao giờ
 * tới được localhost, và trên production nó vẫn có thể trễ hoặc rớt. Trang chờ
 * gọi hàm này vài giây một lần, nên tiền vào là quyền truy cập mở — webhook chỉ
 * còn là đường nhanh hơn, không phải đường duy nhất.
 *
 * Kích hoạt vẫn đi qua đúng `settlePayment` nên chạy song song với webhook cũng
 * chỉ cấp quyền một lần.
 */
export async function getPaymentSession(
  userId: string,
  orderCode: string,
  options: { reconcile?: boolean } = {},
): Promise<PaymentSession> {
  let payment = await loadOwnPayment(userId, orderCode);

  if (options.reconcile !== false && payment.status === 'PENDING') {
    const settled = await reconcileWithGateway(payment);
    if (settled) payment = await loadOwnPayment(userId, orderCode);
  }

  let qr = readQrMeta(payment.gatewayMeta);

  // Mã QR hết hạn mà đơn còn treo: xin cổng mã mới thay vì bắt khách tạo lại đơn.
  if (payment.status === 'PENDING' && qr && new Date(qr.expiresAt ?? 0).getTime() <= Date.now()) {
    const gateway = getGateway(payment.gateway);
    if (gateway.rendersQrInline) {
      const created = await openGatewayPayment({
        gateway,
        paymentId: payment.id,
        orderCode: payment.orderCode,
        // Mã cũ đã gắn với link hết hạn phía cổng → phải cấp số mới.
        numericOrderRef: null,
        amount: payment.amount,
        currency: payment.currency,
        description: buildGatewayDescription(payment.orderCode),
        customerRef: payment.userId,
        resultUrl: `${appBaseUrl()}${checkoutResultPath(payment.orderCode)}`,
        previousOrderRefs: [
          ...readPreviousOrderRefs(payment.gatewayMeta),
          ...(payment.gatewayOrderRef === null ? [] : [payment.gatewayOrderRef]),
        ],
      });
      qr = created.qr;
    }
  }

  return toPaymentSession(payment, qr);
}

/**
 * Hỏi cổng xem đơn đã có tiền chưa; có thì đi qua `settlePayment`.
 * Trả true khi trạng thái đơn vừa đổi. Lỗi mạng ở đây KHÔNG được ném ra ngoài —
 * trang chờ vẫn phải hiện mã QR dù cổng đang chập chờn.
 */
async function reconcileWithGateway(payment: {
  id: string;
  orderCode: string;
  gateway: string;
  amount: number;
  gatewayOrderRef: number | null;
  gatewayMeta: Prisma.JsonValue | null;
}): Promise<boolean> {
  let gateway;
  try {
    gateway = getGateway(payment.gateway);
  } catch {
    return false;
  }
  if (!gateway.queryPayment) return false;

  const qr = readQrMeta(payment.gatewayMeta);

  try {
    const snapshot = await gateway.queryPayment({
      orderCode: payment.orderCode,
      numericOrderRef: payment.gatewayOrderRef,
      paymentLinkId: qr?.paymentLinkId ?? null,
    });

    if (snapshot.state === 'PAID') {
      const result = await settlePayment({
        gatewayCode: gateway.code,
        parsed: {
          orderCode: payment.orderCode,
          numericOrderRef: payment.gatewayOrderRef,
          status: 'PAID',
          gatewayTxnId: snapshot.gatewayTxnId ?? `${gateway.code}-${payment.gatewayOrderRef ?? payment.orderCode}`,
          // Dùng số tiền cổng ĐÃ NHẬN, không dùng số tiền mình mong đợi —
          // trả thiếu phải rơi vào nhánh lệch tiền chứ không được kích hoạt.
          amount: snapshot.amountPaid || payment.amount,
        },
        rawPayload: snapshot.raw,
        via: 'RECONCILE',
      });
      return result.handled;
    }

    // CHỈ đóng đơn khi cổng báo đã HỦY. Link HẾT HẠN thì để nguyên trạng thái
    // chờ: người dùng vẫn đang muốn mua, chỉ là mã QR quá hạn — luồng bên dưới
    // sẽ xin cổng cấp mã mới cho chính đơn này, thay vì bắt họ đặt lại từ đầu.
    if (snapshot.state === 'CANCELLED') {
      await prisma.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      return true;
    }

    return false;
  } catch (error) {
    console.error('[commerce] không đối soát được với cổng thanh toán', {
      orderCode: payment.orderCode,
      error: error instanceof Error ? error.message : error,
    });
    return false;
  }
}

/** Người dùng bỏ dở đơn: đóng cả phía mình lẫn phía cổng để không còn nhận tiền vào. */
export async function cancelPendingPayment(
  userId: string,
  input: { orderCode: string; reason?: string },
): Promise<PaymentSession> {
  const data = cancelPaymentSchema.parse(input);
  const payment = await loadOwnPayment(userId, data.orderCode);

  if (payment.status === 'PAID' || payment.status === 'REFUNDED') {
    throw ApiError.conflict('Đơn hàng đã thanh toán nên không thể hủy. Vui lòng liên hệ bộ phận hỗ trợ.');
  }
  if (payment.status !== 'PENDING') return toPaymentSession(payment, null);

  const reason = data.reason?.trim() || 'Người dùng hủy trên trang thanh toán';
  const gateway = getGateway(payment.gateway);

  if (gateway.cancelPayment) {
    try {
      await gateway.cancelPayment({
        orderCode: payment.orderCode,
        numericOrderRef: payment.gatewayOrderRef,
        paymentLinkId: readQrMeta(payment.gatewayMeta)?.paymentLinkId ?? null,
        reason,
      });
    } catch (error) {
      // Cổng có thể đã tự đóng link vì hết hạn. Đóng phía mình vẫn đúng.
      console.warn('[commerce] cổng từ chối hủy link thanh toán', {
        orderCode: payment.orderCode,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  // updateMany + điều kiện PENDING: webhook báo thành công xen vào giữa thì
  // câu này không ăn, tiền của khách không bị hủy oan.
  const closed = await prisma.payment.updateMany({
    where: { id: payment.id, status: 'PENDING' },
    data: { status: 'CANCELLED', gatewayMeta: Prisma.DbNull },
  });

  if (closed.count > 0) {
    await writeAudit({
      actorId: userId,
      action: AUDIT_ACTIONS.PAYMENT_WEBHOOK,
      entityType: 'Payment',
      entityId: payment.id,
      before: { status: 'PENDING' },
      after: { status: 'CANCELLED', via: 'USER_CANCEL', reason },
    });
  }

  return getPaymentSession(userId, payment.orderCode, { reconcile: false });
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
      numericOrderRef: payment.gatewayOrderRef,
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
