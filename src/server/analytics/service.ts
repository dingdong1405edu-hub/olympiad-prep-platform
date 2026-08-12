/**
 * Analytics & KPI — báo cáo vận hành (specs §13, §9.4c).
 *
 * Bốn nguyên tắc chi phối toàn bộ file này:
 *  1. KHÔNG BAO GIỜ VỠ TRANG: database mới cài gần như trống vẫn phải trả về
 *     số 0, không NaN, không Infinity, không ném lỗi. Mọi phép chia đi qua
 *     `ratio`/`percent` để chặn chia cho 0.
 *  2. Đếm ở DB, không đếm trong JS: dùng groupBy / aggregate / count, và dùng
 *     SQL thô cho những phép đo Prisma không diễn đạt được (COUNT DISTINCT,
 *     lọc theo tỷ lệ đúng, so sánh bậc độ khó liền kề bằng window function).
 *  3. Ngưỡng nghiệp vụ lấy từ getConfig() hoặc từ hằng số đã công bố của module
 *     học liệu — không tự chế thêm con số mới trong file này.
 *  4. Mọi *Rate trong kết quả là PHẦN TRĂM 0–100 đã làm tròn 1 chữ số thập phân.
 */
import { Prisma } from '@prisma/client';
import type {
  Difficulty,
  EnrollmentSource,
  EnrollmentStatus,
  GradeBand,
  ItemStatus,
  PaymentStatus,
  PlanDayStatus,
  SessionStatus,
  Subject,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';
import { EVENTS, trackBatch } from '@/lib/analytics';
import { dateFromKey, daysUntil, diffDays, formatDateVN, formatDateTimeVN, vnDateKey, vnToday } from '@/lib/dates';
import { DIFFICULTIES, GRADE_BAND_LABEL, LEVEL_LABEL, SUBJECT_LABEL } from '@/lib/domain';
import { toCsv } from '@/server/content/csv';
import { ANALYTICS_DEFAULTS, COVERAGE_DEFAULTS, EXPORT_MAX_ROWS } from '@/server/content/service';
import {
  ENROLLMENT_SOURCE_LABEL,
  ENROLLMENT_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
} from '@/server/commerce/service';

// ---------------------------------------------------------------------------
// Hằng số kỹ thuật (không phải tham số nghiệp vụ — không nằm trong AppConfig)
// ---------------------------------------------------------------------------

/** Trần số sự kiện nhận mỗi lần gọi — chặn client bơm rác vào bảng phân tích. */
export const MAX_EVENTS_PER_BATCH = 50;

/** Tên sự kiện hợp lệ (specs §13.2). Tên lạ bị bỏ, không ghi vào DB. */
const ALLOWED_EVENT_NAMES = new Set<string>(Object.values(EVENTS));

/**
 * Cửa sổ Active D1/D7/D14 — đây là ĐỊNH NGHĨA của chỉ số trong specs §13.1,
 * không phải tham số vận hành, nên không đưa vào AppConfig.
 */
const RETENTION_WINDOW_DAYS = { d1: 1, d7: 7, d14: 14 } as const;

/** Việt Nam UTC+7, không có DST — dùng để quy đổi mốc 00:00 giờ VN sang instant. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Tiện ích số học an toàn
// ---------------------------------------------------------------------------

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Tỷ lệ 0–1. Mẫu số <= 0 → 0 (database trống vẫn ra số hợp lệ). */
function ratio(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : 0;
}

/** Phần trăm 0–100, làm tròn 1 chữ số thập phân. */
function percent(numerator: number, denominator: number): number {
  return round(ratio(numerator, denominator) * 100, 1);
}

/** Trung bình an toàn. */
function average(total: number, count: number): number {
  return round(ratio(total, count), 2);
}

/**
 * Mốc thời gian cho SQL thô.
 *
 * BẮT BUỘC dùng kèm ép kiểu `::timestamp` trong câu lệnh: Prisma bind Date của
 * JS thành `timestamptz`, trong khi mọi cột DateTime của schema là `timestamp
 * without time zone` (lưu giờ UTC). Nếu để nguyên Date, PostgreSQL quy đổi theo
 * timezone của session (dev đang là Asia/Ho_Chi_Minh) và mọi bộ lọc lệch 7 giờ.
 */
function sqlTime(date: Date): string {
  return date.toISOString();
}

/** Ép mọi kiểu số DB trả về (bigint, numeric-as-string, Decimal, null) thành number. */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === 'object' && 'toNumber' in value) {
    const candidate = (value as { toNumber: unknown }).toNumber;
    if (typeof candidate === 'function') {
      const parsed = Number((candidate as () => unknown).call(value));
      return Number.isFinite(parsed) ? parsed : 0;
    }
  }
  return 0;
}

/**
 * Chạy truy vấn SQL thô trả về đúng 1 dòng tổng hợp.
 * Lỗi hạ tầng chỉ được ghi log: trang báo cáo phải hiện số 0 chứ không được vỡ.
 */
async function aggregateRow<T extends object>(fallback: T, run: () => Promise<T[]>): Promise<T> {
  try {
    const rows = await run();
    return rows[0] ?? fallback;
  } catch (error) {
    console.error('[analytics] truy vấn tổng hợp lỗi', error);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Khoảng thời gian báo cáo
// ---------------------------------------------------------------------------

export interface DateRange {
  from: Date;
  to: Date;
}

export interface RangeInfo {
  from: Date;
  to: Date;
  /** Số ngày lịch được bao phủ (>= 1). */
  days: number;
  label: string;
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/** Chuẩn hóa khoảng: thiếu/sai định dạng → toàn bộ lịch sử; đảo ngược → hoán đổi. */
function normalizeRange(range?: Partial<DateRange>): RangeInfo {
  const to = isValidDate(range?.to) ? range.to : new Date();
  const from = isValidDate(range?.from) ? range.from : new Date(0);
  const [start, end] = from.getTime() <= to.getTime() ? [from, to] : [to, from];
  return {
    from: start,
    to: end,
    days: Math.max(1, diffDays(end, start) + 1),
    label: `${formatDateVN(start)} – ${formatDateVN(end)}`,
  };
}

/** Mốc thời gian THỰC của 00:00 giờ VN — dùng khi lọc cột timestamp. */
function startOfVnDayInstant(instant: Date = new Date()): Date {
  return new Date(vnToday(instant).getTime() - VN_OFFSET_MS);
}

/** Mốc thời gian THỰC của 00:00 ngày 1 tháng hiện tại theo giờ VN. */
function startOfVnMonthInstant(instant: Date = new Date()): Date {
  const key = `${vnDateKey(instant).slice(0, 7)}-01`;
  return new Date(dateFromKey(key).getTime() - VN_OFFSET_MS);
}

// ---------------------------------------------------------------------------
// 1. Nhận sự kiện tracking từ client
// ---------------------------------------------------------------------------

export interface IncomingEvent {
  eventName: string;
  enrollmentId?: string | null;
  properties?: Record<string, unknown>;
  sessionId?: string | null;
  userId?: string | null;
}

export interface RecordEventsResult {
  received: number;
  accepted: number;
  /** Bị bỏ vì vượt trần 50 sự kiện/lần. */
  droppedOverLimit: number;
  /** Tên sự kiện không có trong danh mục chuẩn (specs §13.2). */
  rejectedNames: string[];
}

/**
 * Nhận batch sự kiện từ trình duyệt.
 * Chấp nhận cả khách chưa đăng nhập vì phễu bán hàng bắt đầu từ trang chủ;
 * `userId` (nếu có) ghi đè userId của từng sự kiện để client không mạo danh.
 */
export async function recordEvents(
  events: IncomingEvent[],
  userId?: string | null,
): Promise<RecordEventsResult> {
  const list = Array.isArray(events) ? events : [];
  const capped = list.slice(0, MAX_EVENTS_PER_BATCH);

  const rejectedNames: string[] = [];
  const accepted = capped.filter((event) => {
    const name = typeof event?.eventName === 'string' ? event.eventName.trim() : '';
    if (ALLOWED_EVENT_NAMES.has(name)) return true;
    if (name && !rejectedNames.includes(name)) rejectedNames.push(name);
    return false;
  });

  if (accepted.length > 0) {
    await trackBatch(
      accepted.map((event) => ({
        eventName: event.eventName.trim(),
        userId: userId ?? event.userId ?? null,
        enrollmentId: event.enrollmentId ?? null,
        properties: event.properties ?? {},
        sessionId: event.sessionId ?? null,
      })),
    );
  }

  return {
    received: list.length,
    accepted: accepted.length,
    droppedOverLimit: Math.max(0, list.length - capped.length),
    rejectedNames,
  };
}

// ---------------------------------------------------------------------------
// 2. KPI Kinh doanh
// ---------------------------------------------------------------------------

export interface FunnelStepKpi {
  key: string;
  label: string;
  /** Số khách duy nhất (sessionId, nếu không có thì userId). */
  visitors: number;
  /** Tổng số lần sự kiện xảy ra. */
  events: number;
  /** % so với bước liền trước. */
  conversionFromPrevious: number;
  /** % so với bước đầu phễu. */
  conversionFromStart: number;
}

export interface ProgramRevenueRow {
  programId: string;
  programCode: string;
  programName: string;
  orders: number;
  revenue: number;
  discount: number;
  newEnrollments: number;
  averageOrderValue: number;
}

export interface BusinessKpis {
  range: RangeInfo;
  funnel: {
    steps: FunnelStepKpi[];
    viewProgram: number;
    startCheckout: number;
    purchaseSuccess: number;
    viewToCheckoutRate: number;
    checkoutToPaidRate: number;
    viewToPaidRate: number;
  };
  revenue: {
    total: number;
    paidOrders: number;
    averageOrderValue: number;
    byProgram: ProgramRevenueRow[];
  };
  coupon: {
    redeemedOrders: number;
    distinctCoupons: number;
    discountTotal: number;
    /** % số đơn đã thanh toán có dùng mã. */
    redemptionRate: number;
  };
  refund: {
    orders: number;
    amount: number;
    /** % số đơn hoàn trên tổng đơn đã thu. */
    refundRate: number;
  };
  orders: Record<PaymentStatus, number>;
}

interface FunnelRawRow {
  view_visitors: unknown;
  view_events: unknown;
  checkout_visitors: unknown;
  checkout_events: unknown;
  purchase_visitors: unknown;
  purchase_events: unknown;
}

const EMPTY_FUNNEL_ROW: FunnelRawRow = {
  view_visitors: 0,
  view_events: 0,
  checkout_visitors: 0,
  checkout_events: 0,
  purchase_visitors: 0,
  purchase_events: 0,
};

function emptyOrderCounts(): Record<PaymentStatus, number> {
  return { PENDING: 0, PAID: 0, FAILED: 0, REFUNDED: 0, CANCELLED: 0 };
}

/**
 * Phễu bán hàng + doanh thu (specs §13.1 nhóm Kinh doanh).
 *
 * Phễu đếm theo KHÁCH DUY NHẤT (sessionId, thiếu thì userId) chứ không đếm số
 * lần bắn sự kiện — cùng một người bấm thanh toán hai lần vẫn là một khách.
 * Doanh thu lấy từ bảng Payment (nguồn đối soát kế toán), không lấy từ sự kiện.
 */
export async function getBusinessKpis(range?: Partial<DateRange>): Promise<BusinessKpis> {
  const info = normalizeRange(range);
  const { from, to } = info;

  const [funnelRow, paidAgg, byCourse, enrollmentsByCourse, couponGroup, refundAgg, statusGroup] =
    await Promise.all([
      aggregateRow(EMPTY_FUNNEL_ROW, () =>
        prisma.$queryRaw<FunnelRawRow[]>`
          SELECT
            COUNT(DISTINCT COALESCE("sessionId", "userId", "id"))
              FILTER (WHERE "eventName" = ${EVENTS.VIEW_PROGRAM}) AS view_visitors,
            COUNT(*) FILTER (WHERE "eventName" = ${EVENTS.VIEW_PROGRAM}) AS view_events,
            COUNT(DISTINCT COALESCE("sessionId", "userId", "id"))
              FILTER (WHERE "eventName" = ${EVENTS.START_CHECKOUT}) AS checkout_visitors,
            COUNT(*) FILTER (WHERE "eventName" = ${EVENTS.START_CHECKOUT}) AS checkout_events,
            COUNT(DISTINCT COALESCE("sessionId", "userId", "id"))
              FILTER (WHERE "eventName" = ${EVENTS.PURCHASE_SUCCESS}) AS purchase_visitors,
            COUNT(*) FILTER (WHERE "eventName" = ${EVENTS.PURCHASE_SUCCESS}) AS purchase_events
          FROM "AnalyticsEvent"
          WHERE "createdAt" >= ${sqlTime(from)}::timestamp AND "createdAt" <= ${sqlTime(to)}::timestamp
        `,
      ),
      prisma.payment.aggregate({
        where: { status: 'PAID', paidAt: { gte: from, lte: to } },
        _sum: { amount: true, discountAmount: true },
        _count: { _all: true },
      }),
      prisma.payment.groupBy({
        by: ['courseId'],
        where: { status: 'PAID', paidAt: { gte: from, lte: to } },
        _sum: { amount: true, discountAmount: true },
        _count: { _all: true },
      }),
      prisma.enrollment.groupBy({
        by: ['courseId'],
        where: { createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      prisma.payment.groupBy({
        by: ['couponId'],
        where: { status: 'PAID', paidAt: { gte: from, lte: to }, couponId: { not: null } },
        _sum: { discountAmount: true },
        _count: { _all: true },
      }),
      prisma.payment.aggregate({
        // Không có cột refundedAt — đơn hoàn được nhận diện qua lần cập nhật cuối.
        where: { status: 'REFUNDED', updatedAt: { gte: from, lte: to } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.payment.groupBy({
        by: ['status'],
        where: { createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
    ]);

  // -- Phễu ------------------------------------------------------------------
  const viewVisitors = toNumber(funnelRow.view_visitors);
  const checkoutVisitors = toNumber(funnelRow.checkout_visitors);
  const purchaseVisitors = toNumber(funnelRow.purchase_visitors);

  const steps: FunnelStepKpi[] = [
    {
      key: 'view_program',
      label: 'Xem chương trình',
      visitors: viewVisitors,
      events: toNumber(funnelRow.view_events),
      conversionFromPrevious: viewVisitors > 0 ? 100 : 0,
      conversionFromStart: viewVisitors > 0 ? 100 : 0,
    },
    {
      key: 'start_checkout',
      label: 'Bắt đầu thanh toán',
      visitors: checkoutVisitors,
      events: toNumber(funnelRow.checkout_events),
      conversionFromPrevious: percent(checkoutVisitors, viewVisitors),
      conversionFromStart: percent(checkoutVisitors, viewVisitors),
    },
    {
      key: 'purchase_success',
      label: 'Thanh toán thành công',
      visitors: purchaseVisitors,
      events: toNumber(funnelRow.purchase_events),
      conversionFromPrevious: percent(purchaseVisitors, checkoutVisitors),
      conversionFromStart: percent(purchaseVisitors, viewVisitors),
    },
  ];

  // -- Doanh thu theo chương trình ------------------------------------------
  const courseIds = [
    ...new Set([...byCourse.map((row) => row.courseId), ...enrollmentsByCourse.map((row) => row.courseId)]),
  ];
  const courses =
    courseIds.length > 0
      ? await prisma.course.findMany({
          where: { id: { in: courseIds } },
          select: { id: true, programId: true, program: { select: { code: true, name: true } } },
        })
      : [];
  const courseById = new Map(courses.map((course) => [course.id, course]));

  const programRows = new Map<string, ProgramRevenueRow>();
  const ensureProgramRow = (courseId: string): ProgramRevenueRow | null => {
    const course = courseById.get(courseId);
    if (!course) return null;
    const existing = programRows.get(course.programId);
    if (existing) return existing;
    const created: ProgramRevenueRow = {
      programId: course.programId,
      programCode: course.program.code,
      programName: course.program.name,
      orders: 0,
      revenue: 0,
      discount: 0,
      newEnrollments: 0,
      averageOrderValue: 0,
    };
    programRows.set(course.programId, created);
    return created;
  };

  for (const row of byCourse) {
    const target = ensureProgramRow(row.courseId);
    if (!target) continue;
    target.orders += row._count._all;
    target.revenue += row._sum.amount ?? 0;
    target.discount += row._sum.discountAmount ?? 0;
  }
  for (const row of enrollmentsByCourse) {
    const target = ensureProgramRow(row.courseId);
    if (!target) continue;
    target.newEnrollments += row._count._all;
  }
  const byProgram = [...programRows.values()]
    .map((row) => ({ ...row, averageOrderValue: Math.round(ratio(row.revenue, row.orders)) }))
    .sort((a, b) => b.revenue - a.revenue || a.programCode.localeCompare(b.programCode));

  // -- Mã giảm giá, hoàn tiền, trạng thái đơn -------------------------------
  const redeemedOrders = couponGroup.reduce((sum, row) => sum + row._count._all, 0);
  const discountTotal = couponGroup.reduce((sum, row) => sum + (row._sum.discountAmount ?? 0), 0);

  const orders = emptyOrderCounts();
  for (const row of statusGroup) orders[row.status] = row._count._all;

  const paidOrders = paidAgg._count._all;
  const revenueTotal = paidAgg._sum.amount ?? 0;
  const refundOrders = refundAgg._count._all;

  return {
    range: info,
    funnel: {
      steps,
      viewProgram: viewVisitors,
      startCheckout: checkoutVisitors,
      purchaseSuccess: purchaseVisitors,
      viewToCheckoutRate: percent(checkoutVisitors, viewVisitors),
      checkoutToPaidRate: percent(purchaseVisitors, checkoutVisitors),
      viewToPaidRate: percent(purchaseVisitors, viewVisitors),
    },
    revenue: {
      total: revenueTotal,
      paidOrders,
      averageOrderValue: Math.round(ratio(revenueTotal, paidOrders)),
      byProgram,
    },
    coupon: {
      redeemedOrders,
      distinctCoupons: couponGroup.length,
      discountTotal,
      redemptionRate: percent(redeemedOrders, paidOrders),
    },
    refund: {
      orders: refundOrders,
      amount: refundAgg._sum.amount ?? 0,
      refundRate: percent(refundOrders, paidOrders),
    },
    orders,
  };
}

// ---------------------------------------------------------------------------
// 3. KPI Học tập
// ---------------------------------------------------------------------------

export interface PlanDayCounts {
  total: number;
  planned: number;
  inProgress: number;
  completed: number;
  missed: number;
  rescheduled: number;
  /** Tổng - đã dời lịch: ngày dời đi đã được tính ở buổi nhận bài. */
  scheduled: number;
  totalMinutes: number;
  /** % ngày học hoàn thành trên số ngày còn hiệu lực. */
  completionRate: number;
}

export interface AssessmentCyclePoint {
  cycleNo: number;
  attempts: number;
  /** % điểm thô / điểm tối đa. */
  averageScorePercent: number;
  averageWeightedScore: number;
}

export interface LearningKpis {
  range: RangeInfo;
  plan: PlanDayCounts;
  time: {
    totalMinutes: number;
    averageMinutesPerCompletedDay: number;
    averageMinutesPerStudent: number;
  };
  practice: {
    totalItems: number;
    correctItems: number;
    /** % câu trả lời đúng. */
    accuracy: number;
    activeStudents: number;
    itemsPerCompletedDay: number;
    itemsPerStudentPerDay: number;
  };
  mastery: {
    measuredAttempts: number;
    averageBefore: number;
    averageAfter: number;
    /** Chênh lệch mastery trung bình mỗi lượt làm bài. */
    averageDelta: number;
  };
  assessment: {
    attempts: number;
    cycles: AssessmentCyclePoint[];
    firstCycleScorePercent: number;
    lastCycleScorePercent: number;
    /** Chênh lệch điểm giữa chu kỳ đánh giá đầu và cuối trong khoảng. */
    scoreDelta: number;
  };
}

function emptyPlanDayCounts(): PlanDayCounts {
  return {
    total: 0,
    planned: 0,
    inProgress: 0,
    completed: 0,
    missed: 0,
    rescheduled: 0,
    scheduled: 0,
    totalMinutes: 0,
    completionRate: 0,
  };
}

type PlanDayGroupRow = {
  status: PlanDayStatus;
  _count: { _all: number };
  _sum: { actualMinutes: number | null };
};

function summarizePlanDays(rows: PlanDayGroupRow[]): PlanDayCounts {
  const counts = emptyPlanDayCounts();
  for (const row of rows) {
    const value = row._count._all;
    counts.total += value;
    counts.totalMinutes += row._sum.actualMinutes ?? 0;
    if (row.status === 'PLANNED') counts.planned = value;
    else if (row.status === 'IN_PROGRESS') counts.inProgress = value;
    else if (row.status === 'COMPLETED') counts.completed = value;
    else if (row.status === 'MISSED') counts.missed = value;
    else if (row.status === 'RESCHEDULED') counts.rescheduled = value;
  }
  counts.scheduled = counts.total - counts.rescheduled;
  counts.completionRate = percent(counts.completed, counts.scheduled);
  return counts;
}

/** Số học sinh (enrollment) có ít nhất một lượt làm bài trong khoảng. */
async function countActiveEnrollments(from: Date, to: Date): Promise<number> {
  const row = await aggregateRow({ total: 0 } as { total: unknown }, () =>
    prisma.$queryRaw<{ total: unknown }[]>`
      SELECT COUNT(DISTINCT "enrollmentId") AS total
      FROM "ItemAttempt"
      WHERE "createdAt" >= ${sqlTime(from)}::timestamp AND "createdAt" <= ${sqlTime(to)}::timestamp
    `,
  );
  return toNumber(row.total);
}

/**
 * KPI học tập (specs §13.1 nhóm Học tập).
 * Mastery delta lấy từ chính lượt làm bài (masteryBefore/masteryAfter) nên
 * không phải quét lịch sử snapshot — trung bình sau trừ trung bình trước.
 */
export async function getLearningKpis(range?: Partial<DateRange>): Promise<LearningKpis> {
  const info = normalizeRange(range);
  const { from, to } = info;
  const dayFrom = vnToday(from);
  const dayTo = vnToday(to);

  const [planRows, attemptAgg, correctItems, masteryAgg, activeStudents, cycleRows] = await Promise.all([
    prisma.studyPlanDay.groupBy({
      by: ['status'],
      where: { date: { gte: dayFrom, lte: dayTo } },
      _count: { _all: true },
      _sum: { actualMinutes: true },
    }),
    prisma.itemAttempt.aggregate({
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    }),
    prisma.itemAttempt.count({ where: { createdAt: { gte: from, lte: to }, isCorrect: true } }),
    prisma.itemAttempt.aggregate({
      where: {
        createdAt: { gte: from, lte: to },
        masteryBefore: { not: null },
        masteryAfter: { not: null },
      },
      _count: { _all: true },
      _avg: { masteryBefore: true, masteryAfter: true },
    }),
    countActiveEnrollments(from, to),
    prisma.assessmentAttempt.groupBy({
      by: ['cycleNo'],
      where: { submittedAt: { gte: from, lte: to }, status: { in: ['SUBMITTED', 'GRADED'] } },
      _count: { _all: true },
      _avg: { rawScore: true, maxScore: true, weightedScore: true },
    }),
  ]);

  const plan = summarizePlanDays(planRows);
  const totalItems = attemptAgg._count._all;

  const cycles: AssessmentCyclePoint[] = cycleRows
    .map((row) => ({
      cycleNo: row.cycleNo,
      attempts: row._count._all,
      averageScorePercent: percent(row._avg.rawScore ?? 0, row._avg.maxScore ?? 0),
      averageWeightedScore: round(row._avg.weightedScore ?? 0, 2),
    }))
    .sort((a, b) => a.cycleNo - b.cycleNo);

  const firstCycle = cycles[0];
  const lastCycle = cycles[cycles.length - 1];
  const firstScore = firstCycle ? firstCycle.averageScorePercent : 0;
  const lastScore = lastCycle ? lastCycle.averageScorePercent : 0;

  return {
    range: info,
    plan,
    time: {
      totalMinutes: plan.totalMinutes,
      averageMinutesPerCompletedDay: average(plan.totalMinutes, plan.completed),
      averageMinutesPerStudent: average(plan.totalMinutes, activeStudents),
    },
    practice: {
      totalItems,
      correctItems,
      accuracy: percent(correctItems, totalItems),
      activeStudents,
      itemsPerCompletedDay: average(totalItems, plan.completed),
      itemsPerStudentPerDay: average(totalItems, activeStudents * info.days),
    },
    mastery: {
      measuredAttempts: masteryAgg._count._all,
      averageBefore: round(masteryAgg._avg.masteryBefore ?? 0, 2),
      averageAfter: round(masteryAgg._avg.masteryAfter ?? 0, 2),
      averageDelta: round((masteryAgg._avg.masteryAfter ?? 0) - (masteryAgg._avg.masteryBefore ?? 0), 2),
    },
    assessment: {
      attempts: cycles.reduce((sum, cycle) => sum + cycle.attempts, 0),
      cycles,
      firstCycleScorePercent: firstScore,
      lastCycleScorePercent: lastScore,
      scoreDelta: round(lastScore - firstScore, 1),
    },
  };
}

// ---------------------------------------------------------------------------
// 4. KPI Nội dung
// ---------------------------------------------------------------------------

export interface ContentKpis {
  skills: {
    total: number;
    withPublishedItems: number;
    withoutItems: number;
    /** % kỹ năng đã có ít nhất một câu PUBLISHED. */
    coverageRate: number;
    /** Kỹ năng chưa đủ số câu tối thiểu để engine xoay vòng. */
    belowMinimum: number;
    minItemsPerSkill: number;
    averageItemsPerSkill: number;
  };
  items: {
    total: number;
    published: number;
    byStatus: Record<ItemStatus, number>;
    byDifficulty: Record<Difficulty, number>;
  };
  quality: {
    /** Số câu đủ lượt làm để kết luận dễ/khó. */
    evaluated: number;
    tooEasy: number;
    tooHard: number;
    tooEasyRate: number;
    tooHardRate: number;
    thresholds: { minAttempts: number; easyThreshold: number; hardThreshold: number };
  };
  flags: {
    openFlags: number;
    resolvedFlags: number;
    rejectedFlags: number;
    itemsWithReports: number;
    itemsAboveReportThreshold: number;
    totalReports: number;
    totalServed: number;
    /** % lượt làm bài có kèm báo lỗi câu hỏi. */
    reportRate: number;
  };
}

interface ContentQualityRow {
  published_total: unknown;
  evaluated: unknown;
  too_easy: unknown;
  too_hard: unknown;
  items_with_reports: unknown;
  items_above_report_threshold: unknown;
  total_served: unknown;
  total_reports: unknown;
}

const EMPTY_CONTENT_QUALITY: ContentQualityRow = {
  published_total: 0,
  evaluated: 0,
  too_easy: 0,
  too_hard: 0,
  items_with_reports: 0,
  items_above_report_threshold: 0,
  total_served: 0,
  total_reports: 0,
};

function emptyStatusCounts(): Record<ItemStatus, number> {
  return { DRAFT: 0, REVIEWED: 0, PUBLISHED: 0, FLAGGED: 0, RETIRED: 0 };
}

function emptyDifficultyCounts(): Record<Difficulty, number> {
  return { AVERAGE: 0, GOOD: 0, EXCELLENT: 0 };
}

/**
 * KPI học liệu (specs §13.1 nhóm Nội dung).
 * Câu "quá dễ / quá khó" lọc theo tỷ lệ đúng ngay trong SQL — Prisma không diễn
 * đạt được phép chia giữa hai cột, và tải 6.000 câu về JS để đếm là lãng phí.
 */
export async function getContentKpis(): Promise<ContentKpis> {
  const thresholds = {
    minAttempts: ANALYTICS_DEFAULTS.minAttempts,
    easyThreshold: ANALYTICS_DEFAULTS.easyThreshold,
    hardThreshold: ANALYTICS_DEFAULTS.hardThreshold,
  };
  // Mỗi kỹ năng cần đủ câu ở cả 3 bậc độ khó thì engine mới xoay vòng được.
  const minItemsPerSkill = COVERAGE_DEFAULTS.minPerDifficulty * DIFFICULTIES.length;

  const [totalSkills, publishedBySkill, statusRows, difficultyRows, qualityRow, flagRows] =
    await Promise.all([
      prisma.skill.count(),
      prisma.questionItem.groupBy({
        by: ['skillId'],
        where: { status: 'PUBLISHED' },
        _count: { _all: true },
      }),
      prisma.questionItem.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.questionItem.groupBy({
        by: ['difficulty'],
        where: { status: 'PUBLISHED' },
        _count: { _all: true },
      }),
      aggregateRow(EMPTY_CONTENT_QUALITY, () =>
        prisma.$queryRaw<ContentQualityRow[]>`
          SELECT
            COUNT(*) AS published_total,
            COUNT(*) FILTER (WHERE "timesServed" >= ${thresholds.minAttempts}::int) AS evaluated,
            COUNT(*) FILTER (
              WHERE "timesServed" >= ${thresholds.minAttempts}::int
                AND "timesCorrect"::float8 / NULLIF("timesServed", 0) >= ${thresholds.easyThreshold}::float8
            ) AS too_easy,
            COUNT(*) FILTER (
              WHERE "timesServed" >= ${thresholds.minAttempts}::int
                AND "timesCorrect"::float8 / NULLIF("timesServed", 0) <= ${thresholds.hardThreshold}::float8
            ) AS too_hard,
            COUNT(*) FILTER (WHERE "reportCount" > 0) AS items_with_reports,
            COUNT(*) FILTER (
              WHERE "timesServed" > 0
                AND "reportCount"::float8 / NULLIF("timesServed", 0) >= ${ANALYTICS_DEFAULTS.reportRateThreshold}::float8
            ) AS items_above_report_threshold,
            COALESCE(SUM("timesServed"), 0) AS total_served,
            COALESCE(SUM("reportCount"), 0) AS total_reports
          FROM "QuestionItem"
          WHERE "status" = 'PUBLISHED'
        `,
      ),
      prisma.itemFlag.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

  const byStatus = emptyStatusCounts();
  let totalItems = 0;
  for (const row of statusRows) {
    byStatus[row.status] = row._count._all;
    totalItems += row._count._all;
  }

  const byDifficulty = emptyDifficultyCounts();
  for (const row of difficultyRows) byDifficulty[row.difficulty] = row._count._all;

  const withPublishedItems = publishedBySkill.length;
  const publishedTotal = publishedBySkill.reduce((sum, row) => sum + row._count._all, 0);
  const skillsUnderMinimum = publishedBySkill.filter(
    (row) => row._count._all < minItemsPerSkill,
  ).length;
  const withoutItems = Math.max(0, totalSkills - withPublishedItems);

  const evaluated = toNumber(qualityRow.evaluated);
  const totalServed = toNumber(qualityRow.total_served);
  const totalReports = toNumber(qualityRow.total_reports);

  const flagCounts = { OPEN: 0, RESOLVED: 0, REJECTED: 0 };
  for (const row of flagRows) flagCounts[row.status] = row._count._all;

  return {
    skills: {
      total: totalSkills,
      withPublishedItems,
      withoutItems,
      coverageRate: percent(withPublishedItems, totalSkills),
      // Kỹ năng chưa có câu nào cũng là kỹ năng dưới mức tối thiểu.
      belowMinimum: skillsUnderMinimum + withoutItems,
      minItemsPerSkill,
      averageItemsPerSkill: average(publishedTotal, totalSkills),
    },
    items: {
      total: totalItems,
      published: byStatus.PUBLISHED,
      byStatus,
      byDifficulty,
    },
    quality: {
      evaluated,
      tooEasy: toNumber(qualityRow.too_easy),
      tooHard: toNumber(qualityRow.too_hard),
      tooEasyRate: percent(toNumber(qualityRow.too_easy), evaluated),
      tooHardRate: percent(toNumber(qualityRow.too_hard), evaluated),
      thresholds,
    },
    flags: {
      openFlags: flagCounts.OPEN,
      resolvedFlags: flagCounts.RESOLVED,
      rejectedFlags: flagCounts.REJECTED,
      itemsWithReports: toNumber(qualityRow.items_with_reports),
      itemsAboveReportThreshold: toNumber(qualityRow.items_above_report_threshold),
      totalReports,
      totalServed,
      reportRate: percent(totalReports, totalServed),
    },
  };
}

// ---------------------------------------------------------------------------
// 5. KPI AI / Engine
// ---------------------------------------------------------------------------

export interface EngineKpis {
  range: RangeInfo;
  planDays: PlanDayCounts;
  difficulty: {
    /** Số lần bậc độ khó giao cho học sinh ở cùng kỹ năng thay đổi. */
    adjustments: number;
    up: number;
    down: number;
    transitionsObserved: number;
    adjustmentRate: number;
  };
  plans: {
    generated: number;
    /** Lộ trình sinh lại: mọi chu kỳ từ thứ 2 trở đi. */
    regenerated: number;
    superseded: number;
    forcedByTeacher: number;
    regenerationRate: number;
  };
  recommendations: {
    total: number;
    /** Buổi tư vấn mà giáo viên đã duyệt/từ chối brief AI. */
    teacherReviewed: number;
    teacherAccepted: number;
    /** % khuyến nghị AI được giáo viên chấp nhận. */
    acceptanceRate: number;
    teacherOverrides: number;
  };
  ai: {
    generations: number;
    failed: number;
    fallbackUsed: number;
    failureRate: number;
    fallbackRate: number;
  };
}

interface DifficultyShiftRow {
  up: unknown;
  down: unknown;
  transitions: unknown;
}

const EMPTY_DIFFICULTY_SHIFT: DifficultyShiftRow = { up: 0, down: 0, transitions: 0 };

/**
 * KPI engine (specs §13.1 nhóm AI/Engine).
 *
 * "Số lần điều chỉnh độ khó" đo trực tiếp trên dữ liệu thật: với mỗi cặp
 * (học sinh, kỹ năng), so bậc độ khó của câu vừa làm với câu liền trước bằng
 * window function — không cần bảng log riêng và không tải bản ghi về JS.
 */
export async function getEngineKpis(range?: Partial<DateRange>): Promise<EngineKpis> {
  const info = normalizeRange(range);
  const { from, to } = info;
  const dayFrom = vnToday(from);
  const dayTo = vnToday(to);

  const [
    planRows,
    shiftRow,
    plansGenerated,
    plansRegenerated,
    plansSuperseded,
    forcedByTeacher,
    recommendations,
    sessionReviewRows,
    teacherOverrides,
    aiRows,
    aiFallback,
  ] = await Promise.all([
    prisma.studyPlanDay.groupBy({
      by: ['status'],
      where: { date: { gte: dayFrom, lte: dayTo } },
      _count: { _all: true },
      _sum: { actualMinutes: true },
    }),
    aggregateRow(EMPTY_DIFFICULTY_SHIFT, () =>
      prisma.$queryRaw<DifficultyShiftRow[]>`
        WITH ordered AS (
          SELECT
            CASE i."difficulty"::text WHEN 'AVERAGE' THEN 0 WHEN 'GOOD' THEN 1 ELSE 2 END AS rank_now,
            LAG(CASE i."difficulty"::text WHEN 'AVERAGE' THEN 0 WHEN 'GOOD' THEN 1 ELSE 2 END)
              OVER (PARTITION BY a."enrollmentId", i."skillId" ORDER BY a."createdAt", a."id") AS rank_prev
          FROM "ItemAttempt" a
          JOIN "QuestionItem" i ON i."id" = a."itemId"
          WHERE a."createdAt" >= ${sqlTime(from)}::timestamp AND a."createdAt" <= ${sqlTime(to)}::timestamp
        )
        SELECT
          COUNT(*) FILTER (WHERE rank_prev IS NOT NULL AND rank_now > rank_prev) AS up,
          COUNT(*) FILTER (WHERE rank_prev IS NOT NULL AND rank_now < rank_prev) AS down,
          COUNT(*) FILTER (WHERE rank_prev IS NOT NULL) AS transitions
        FROM ordered
      `,
    ),
    prisma.studyPlan.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.studyPlan.count({ where: { createdAt: { gte: from, lte: to }, cycleNo: { gt: 1 } } }),
    prisma.studyPlan.count({
      where: { createdAt: { gte: from, lte: to }, status: 'SUPERSEDED' },
    }),
    prisma.auditLog.count({
      where: { action: 'plan.regenerate', actorRole: 'TEACHER', createdAt: { gte: from, lte: to } },
    }),
    prisma.recommendation.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.teacherSession.groupBy({
      by: ['aiBriefApproved'],
      where: { updatedAt: { gte: from, lte: to }, aiBriefApproved: { not: null } },
      _count: { _all: true },
    }),
    prisma.teacherSession.count({
      where: {
        updatedAt: { gte: from, lte: to },
        actionCode: { not: null },
        NOT: { actionCode: 'KEEP_PLAN' },
      },
    }),
    prisma.aiGeneration.groupBy({
      by: ['status'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    }),
    prisma.aiGeneration.count({ where: { createdAt: { gte: from, lte: to }, fallbackUsed: true } }),
  ]);

  const planDays = summarizePlanDays(planRows);

  const up = toNumber(shiftRow.up);
  const down = toNumber(shiftRow.down);
  const transitions = toNumber(shiftRow.transitions);

  let teacherReviewed = 0;
  let teacherAccepted = 0;
  for (const row of sessionReviewRows) {
    teacherReviewed += row._count._all;
    if (row.aiBriefApproved === true) teacherAccepted += row._count._all;
  }

  let aiTotal = 0;
  let aiFailed = 0;
  for (const row of aiRows) {
    aiTotal += row._count._all;
    if (row.status !== 'OK') aiFailed += row._count._all;
  }

  return {
    range: info,
    planDays,
    difficulty: {
      adjustments: up + down,
      up,
      down,
      transitionsObserved: transitions,
      adjustmentRate: percent(up + down, transitions),
    },
    plans: {
      generated: plansGenerated,
      regenerated: plansRegenerated,
      superseded: plansSuperseded,
      forcedByTeacher,
      regenerationRate: percent(plansRegenerated, plansGenerated),
    },
    recommendations: {
      total: recommendations,
      teacherReviewed,
      teacherAccepted,
      acceptanceRate: percent(teacherAccepted, teacherReviewed),
      teacherOverrides,
    },
    ai: {
      generations: aiTotal,
      failed: aiFailed,
      fallbackUsed: aiFallback,
      failureRate: percent(aiFailed, aiTotal),
      fallbackRate: percent(aiFallback, aiTotal),
    },
  };
}

// ---------------------------------------------------------------------------
// 6. KPI Giáo viên
// ---------------------------------------------------------------------------

export interface TeacherLoadRow {
  teacherId: string;
  teacherName: string;
  sessions: number;
  completed: number;
  noShow: number;
  attendanceRate: number;
}

export interface TeacherKpis {
  range: RangeInfo;
  sessions: {
    total: number;
    byStatus: Record<SessionStatus, number>;
    /** Tổng số phút tư vấn đã diễn ra. */
    completedMinutes: number;
  };
  /** % buổi diễn ra trên tổng buổi (đã diễn ra + học sinh vắng). */
  attendanceRate: number;
  notes: {
    completedSessions: number;
    withNotes: number;
    withActionCode: number;
    /** Có cả notes lẫn action code → hồ sơ đủ để engine nhận override. */
    complete: number;
    completionRate: number;
  };
  escalation: {
    escalatedSessions: number;
    studentsNeedingIntervention: number;
    watchStudents: number;
  };
  byTeacher: TeacherLoadRow[];
}

function emptySessionCounts(): Record<SessionStatus, number> {
  return { SCHEDULED: 0, COMPLETED: 0, CANCELLED: 0, NO_SHOW: 0 };
}

/**
 * KPI giáo viên (specs §13.1 nhóm Giáo viên).
 * Buổi tư vấn tính theo `scheduledAt`; buổi chưa xếp lịch tính theo ngày tạo để
 * yêu cầu đặt lịch tồn đọng không biến mất khỏi báo cáo.
 */
export async function getTeacherKpis(range?: Partial<DateRange>): Promise<TeacherKpis> {
  const info = normalizeRange(range);
  const { from, to } = info;

  const sessionWhere: Prisma.TeacherSessionWhereInput = {
    OR: [
      { scheduledAt: { gte: from, lte: to } },
      { AND: [{ scheduledAt: null }, { createdAt: { gte: from, lte: to } }] },
    ],
  };

  const [
    statusRows,
    completedAgg,
    withNotes,
    withActionCode,
    completeNotes,
    escalatedSessions,
    escalatedStudents,
    watchStudents,
    teacherRows,
  ] = await Promise.all([
    prisma.teacherSession.groupBy({
      by: ['status'],
      where: sessionWhere,
      _count: { _all: true },
    }),
    prisma.teacherSession.aggregate({
      where: { ...sessionWhere, status: 'COMPLETED' },
      _sum: { durationMinutes: true },
      _count: { _all: true },
    }),
    prisma.teacherSession.count({
      where: { ...sessionWhere, status: 'COMPLETED', teacherNotes: { not: null }, NOT: { teacherNotes: '' } },
    }),
    prisma.teacherSession.count({
      where: { ...sessionWhere, status: 'COMPLETED', actionCode: { not: null } },
    }),
    prisma.teacherSession.count({
      where: {
        ...sessionWhere,
        status: 'COMPLETED',
        teacherNotes: { not: null },
        actionCode: { not: null },
        NOT: { teacherNotes: '' },
      },
    }),
    prisma.teacherSession.count({ where: { ...sessionWhere, followUpLevel: 'ESCALATE' } }),
    prisma.teacherSession.groupBy({
      by: ['enrollmentId'],
      where: { ...sessionWhere, followUpLevel: 'ESCALATE' },
      _count: { _all: true },
    }),
    prisma.teacherSession.groupBy({
      by: ['enrollmentId'],
      where: { ...sessionWhere, followUpLevel: 'WATCH' },
      _count: { _all: true },
    }),
    prisma.teacherSession.groupBy({
      by: ['teacherId', 'status'],
      where: { ...sessionWhere, teacherId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const byStatus = emptySessionCounts();
  let total = 0;
  for (const row of statusRows) {
    byStatus[row.status] = row._count._all;
    total += row._count._all;
  }

  const teacherIds = [
    ...new Set(teacherRows.map((row) => row.teacherId).filter((id): id is string => Boolean(id))),
  ];
  const teachers =
    teacherIds.length > 0
      ? await prisma.teacherProfile.findMany({
          where: { id: { in: teacherIds } },
          select: { id: true, user: { select: { fullName: true } } },
        })
      : [];
  const teacherNameById = new Map(teachers.map((teacher) => [teacher.id, teacher.user.fullName]));

  const loadById = new Map<string, TeacherLoadRow>();
  for (const row of teacherRows) {
    const id = row.teacherId;
    if (!id) continue;
    const current =
      loadById.get(id) ??
      ({
        teacherId: id,
        teacherName: teacherNameById.get(id) ?? 'Giáo viên đã bị xóa',
        sessions: 0,
        completed: 0,
        noShow: 0,
        attendanceRate: 0,
      } satisfies TeacherLoadRow);
    current.sessions += row._count._all;
    if (row.status === 'COMPLETED') current.completed += row._count._all;
    if (row.status === 'NO_SHOW') current.noShow += row._count._all;
    loadById.set(id, current);
  }
  const byTeacher = [...loadById.values()]
    .map((row) => ({ ...row, attendanceRate: percent(row.completed, row.completed + row.noShow) }))
    .sort((a, b) => b.sessions - a.sessions || a.teacherName.localeCompare(b.teacherName, 'vi'));

  const completedSessions = completedAgg._count._all;

  return {
    range: info,
    sessions: {
      total,
      byStatus,
      completedMinutes: completedAgg._sum.durationMinutes ?? 0,
    },
    attendanceRate: percent(byStatus.COMPLETED, byStatus.COMPLETED + byStatus.NO_SHOW),
    notes: {
      completedSessions,
      withNotes,
      withActionCode,
      complete: completeNotes,
      completionRate: percent(completeNotes, completedSessions),
    },
    escalation: {
      escalatedSessions,
      studentsNeedingIntervention: escalatedStudents.length,
      watchStudents: watchStudents.length,
    },
    byTeacher,
  };
}

// ---------------------------------------------------------------------------
// 7. KPI Retention
// ---------------------------------------------------------------------------

export interface RetentionKpis {
  range: RangeInfo;
  activeEnrollments: number;
  active: {
    d1: number;
    d7: number;
    d14: number;
    d1Rate: number;
    d7Rate: number;
    d14Rate: number;
  };
  inactivity: {
    /** Số ngày trung bình kể từ lần học gần nhất (chưa học thì tính từ ngày mở khóa). */
    averageDaysInactive: number;
    neverPracticed: number;
    /** Học sinh không học quá ngưỡng chu kỳ đánh giá. */
    inactiveOverThreshold: number;
    thresholdDays: number;
  };
  churn: {
    enrollmentsBeforeExam: number;
    churnedBeforeExam: number;
    /** % học sinh còn hạn, kỳ thi chưa diễn ra nhưng đã ngừng học. */
    churnRate: number;
  };
}

interface RetentionActiveRow {
  d1: unknown;
  d7: unknown;
  d14: unknown;
}

interface InactivityRow {
  avg_days: unknown;
  never_practiced: unknown;
}

const EMPTY_RETENTION_ACTIVE: RetentionActiveRow = { d1: 0, d7: 0, d14: 0 };
const EMPTY_INACTIVITY: InactivityRow = { avg_days: 0, never_practiced: 0 };

/**
 * KPI giữ chân (specs §13.1 nhóm Retention).
 * Ngưỡng "ngừng học" lấy theo chu kỳ đánh giá trong cấu hình: quá một chu kỳ
 * không làm bài nghĩa là học sinh đã lỡ cả một vòng lộ trình.
 */
export async function getRetentionKpis(range?: Partial<DateRange>): Promise<RetentionKpis> {
  const info = normalizeRange(range);
  const to = info.to;
  const config = await getConfig();
  const thresholdDays = Math.max(1, config.assessment.cycleDays);

  const d1From = new Date(to.getTime() - RETENTION_WINDOW_DAYS.d1 * MS_PER_DAY);
  const d7From = new Date(to.getTime() - RETENTION_WINDOW_DAYS.d7 * MS_PER_DAY);
  const d14From = new Date(to.getTime() - RETENTION_WINDOW_DAYS.d14 * MS_PER_DAY);
  const inactiveCutoff = new Date(to.getTime() - thresholdDays * MS_PER_DAY);

  const [activeRow, inactivityRow, activeEnrollments, inactiveOverThreshold, beforeExam, churned] =
    await Promise.all([
      aggregateRow(EMPTY_RETENTION_ACTIVE, () =>
        prisma.$queryRaw<RetentionActiveRow[]>`
          SELECT
            COUNT(DISTINCT "enrollmentId") FILTER (WHERE "createdAt" >= ${sqlTime(d1From)}::timestamp) AS d1,
            COUNT(DISTINCT "enrollmentId") FILTER (WHERE "createdAt" >= ${sqlTime(d7From)}::timestamp) AS d7,
            COUNT(DISTINCT "enrollmentId") FILTER (WHERE "createdAt" >= ${sqlTime(d14From)}::timestamp) AS d14
          FROM "ItemAttempt"
          WHERE "createdAt" >= ${sqlTime(d14From)}::timestamp AND "createdAt" <= ${sqlTime(to)}::timestamp
        `,
      ),
      aggregateRow(EMPTY_INACTIVITY, () =>
        prisma.$queryRaw<InactivityRow[]>`
          SELECT
            AVG(EXTRACT(EPOCH FROM (${sqlTime(to)}::timestamp - COALESCE(a.last_attempt, e."startsAt"))) / 86400.0)::float8
              AS avg_days,
            COUNT(*) FILTER (WHERE a.last_attempt IS NULL) AS never_practiced
          FROM "Enrollment" e
          LEFT JOIN (
            SELECT "enrollmentId", MAX("createdAt") AS last_attempt
            FROM "ItemAttempt"
            GROUP BY "enrollmentId"
          ) a ON a."enrollmentId" = e."id"
          WHERE e."status" = 'ACTIVE'
        `,
      ),
      prisma.enrollment.count({ where: { status: 'ACTIVE' } }),
      prisma.enrollment.count({
        where: { status: 'ACTIVE', itemAttempts: { none: { createdAt: { gte: inactiveCutoff } } } },
      }),
      prisma.enrollment.count({
        where: { status: 'ACTIVE', cohort: { examDate: { gt: to } } },
      }),
      prisma.enrollment.count({
        where: {
          status: 'ACTIVE',
          cohort: { examDate: { gt: to } },
          itemAttempts: { none: { createdAt: { gte: inactiveCutoff } } },
        },
      }),
    ]);

  const d1 = toNumber(activeRow.d1);
  const d7 = toNumber(activeRow.d7);
  const d14 = toNumber(activeRow.d14);

  return {
    range: info,
    activeEnrollments,
    active: {
      d1,
      d7,
      d14,
      d1Rate: percent(d1, activeEnrollments),
      d7Rate: percent(d7, activeEnrollments),
      d14Rate: percent(d14, activeEnrollments),
    },
    inactivity: {
      averageDaysInactive: round(Math.max(0, toNumber(inactivityRow.avg_days)), 1),
      neverPracticed: toNumber(inactivityRow.never_practiced),
      inactiveOverThreshold,
      thresholdDays,
    },
    churn: {
      enrollmentsBeforeExam: beforeExam,
      churnedBeforeExam: churned,
      churnRate: percent(churned, beforeExam),
    },
  };
}

// ---------------------------------------------------------------------------
// 8. Tổng quan trang chủ quản trị
// ---------------------------------------------------------------------------

export interface AdminOverview {
  generatedAt: Date;
  users: { total: number; students: number; teachers: number; suspended: number };
  enrollments: { active: number; expiringSoon: number; expired: number; newThisMonth: number };
  revenue: {
    today: number;
    thisMonth: number;
    paidOrdersThisMonth: number;
    pendingOrders: number;
    refundedThisMonth: number;
  };
  content: {
    published: number;
    draft: number;
    reviewed: number;
    flagged: number;
    openFlags: number;
    skillsWithoutItems: number;
  };
  learning: {
    activeStudentsToday: number;
    studyDaysCompletedToday: number;
    itemsAnsweredToday: number;
    overdueAssessments: number;
  };
  teacher: { upcomingSessions: number; sessionsMissingNotes: number; escalations: number };
  /** Việc cần xử lý ngay, đã diễn giải sẵn bằng tiếng Việt cho trang quản trị. */
  alerts: string[];
}

/** Số liệu tổng hợp cho trang chủ quản trị (specs §9.4). */
export async function getAdminOverview(): Promise<AdminOverview> {
  const now = new Date();
  const config = await getConfig();
  const startOfToday = startOfVnDayInstant(now);
  const startOfMonth = startOfVnMonthInstant(now);
  const today = vnToday(now);
  const expiringBefore = new Date(
    now.getTime() + Math.max(0, config.notification.triggers.accessExpiringBeforeDays) * MS_PER_DAY,
  );

  const [
    totalUsers,
    students,
    teachers,
    suspended,
    activeEnrollments,
    expiringSoon,
    expiredEnrollments,
    newEnrollments,
    revenueToday,
    revenueMonth,
    pendingOrders,
    refundedMonth,
    itemStatusRows,
    openFlags,
    totalSkills,
    skillsWithItems,
    activeStudentsToday,
    studyDaysCompletedToday,
    itemsAnsweredToday,
    overdueAssessments,
    upcomingSessions,
    sessionsMissingNotes,
    escalations,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.studentProfile.count(),
    prisma.teacherProfile.count({ where: { active: true } }),
    prisma.user.count({ where: { status: 'SUSPENDED' } }),
    prisma.enrollment.count({ where: { status: 'ACTIVE' } }),
    prisma.enrollment.count({
      where: { status: 'ACTIVE', expiresAt: { gte: now, lte: expiringBefore } },
    }),
    prisma.enrollment.count({ where: { status: 'EXPIRED' } }),
    prisma.enrollment.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.payment.aggregate({
      where: { status: 'PAID', paidAt: { gte: startOfToday } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { status: 'PAID', paidAt: { gte: startOfMonth } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payment.count({ where: { status: 'PENDING' } }),
    prisma.payment.aggregate({
      where: { status: 'REFUNDED', updatedAt: { gte: startOfMonth } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.questionItem.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.itemFlag.count({ where: { status: 'OPEN' } }),
    prisma.skill.count(),
    prisma.questionItem.groupBy({
      by: ['skillId'],
      where: { status: 'PUBLISHED' },
      _count: { _all: true },
    }),
    countActiveEnrollments(startOfToday, now),
    prisma.studyPlanDay.count({ where: { date: today, status: 'COMPLETED' } }),
    prisma.itemAttempt.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.assessmentAttempt.count({
      where: { status: 'IN_PROGRESS', dueAt: { lt: now } },
    }),
    prisma.teacherSession.count({
      where: { status: 'SCHEDULED', scheduledAt: { gte: now } },
    }),
    prisma.teacherSession.count({
      where: { status: 'COMPLETED', OR: [{ teacherNotes: null }, { teacherNotes: '' }] },
    }),
    prisma.teacherSession.count({ where: { followUpLevel: 'ESCALATE', status: 'COMPLETED' } }),
  ]);

  const byStatus = emptyStatusCounts();
  for (const row of itemStatusRows) byStatus[row.status] = row._count._all;
  const skillsWithoutItems = Math.max(0, totalSkills - skillsWithItems.length);

  const alerts: string[] = [];
  if (skillsWithoutItems > 0) {
    alerts.push(
      `${skillsWithoutItems} kỹ năng chưa có câu hỏi nào — engine không thể cá nhân hóa cho phần này.`,
    );
  }
  if (openFlags > 0) alerts.push(`${openFlags} báo lỗi câu hỏi đang chờ xử lý.`);
  if (byStatus.FLAGGED > 0) alerts.push(`${byStatus.FLAGGED} câu hỏi đang bị gắn cờ lỗi.`);
  if (pendingOrders > 0) alerts.push(`${pendingOrders} đơn hàng đang chờ thanh toán.`);
  if (expiringSoon > 0) {
    alerts.push(
      `${expiringSoon} quyền truy cập sẽ hết hạn trong ${config.notification.triggers.accessExpiringBeforeDays} ngày tới.`,
    );
  }
  if (overdueAssessments > 0) alerts.push(`${overdueAssessments} bài kiểm tra đang quá hạn nộp.`);
  if (sessionsMissingNotes > 0) {
    alerts.push(`${sessionsMissingNotes} buổi tư vấn đã xong nhưng chưa có ghi chép của giáo viên.`);
  }
  if (escalations > 0) alerts.push(`${escalations} học sinh được đánh dấu cần can thiệp.`);

  return {
    generatedAt: now,
    users: { total: totalUsers, students, teachers, suspended },
    enrollments: {
      active: activeEnrollments,
      expiringSoon,
      expired: expiredEnrollments,
      newThisMonth: newEnrollments,
    },
    revenue: {
      today: revenueToday._sum.amount ?? 0,
      thisMonth: revenueMonth._sum.amount ?? 0,
      paidOrdersThisMonth: revenueMonth._count._all,
      pendingOrders,
      refundedThisMonth: refundedMonth._sum.amount ?? 0,
    },
    content: {
      published: byStatus.PUBLISHED,
      draft: byStatus.DRAFT,
      reviewed: byStatus.REVIEWED,
      flagged: byStatus.FLAGGED,
      openFlags,
      skillsWithoutItems,
    },
    learning: {
      activeStudentsToday,
      studyDaysCompletedToday,
      itemsAnsweredToday,
      overdueAssessments,
    },
    teacher: { upcomingSessions, sessionsMissingNotes, escalations },
    alerts,
  };
}

// ---------------------------------------------------------------------------
// 9. Xuất danh sách ghi danh cho CSKH & kế toán
// ---------------------------------------------------------------------------

export interface EnrollmentExportFilter {
  status?: EnrollmentStatus;
  source?: EnrollmentSource;
  courseId?: string;
  programCode?: string;
  gradeBand?: GradeBand;
  subject?: Subject;
  /** Tìm theo tên / email / SĐT học sinh hoặc mã đơn hàng. */
  search?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

/** Cột file xuất — tiếng Việt có dấu để CSKH và kế toán dùng trực tiếp. */
export const ENROLLMENT_EXPORT_HEADERS = [
  'Mã ghi danh',
  'Ngày tạo',
  'Học sinh',
  'Email',
  'Số điện thoại',
  'Lớp',
  'Khối',
  'Trường',
  'Phụ huynh',
  'SĐT phụ huynh',
  'Mã chương trình',
  'Chương trình',
  'Khóa học',
  'Môn',
  'Khóa tuyển sinh',
  'Ngày thi',
  'Nguồn',
  'Trạng thái',
  'Bắt đầu',
  'Hết hạn',
  'Số ngày còn lại',
  'Mức tự khai',
  'Mức ước tính',
  'Mã đơn hàng',
  'Cổng thanh toán',
  'Trạng thái thanh toán',
  'Giá gốc',
  'Giảm giá',
  'Số tiền',
  'Mã giảm giá',
  'Ngày thanh toán',
  'Ghi chú hoàn tiền',
] as const;

/**
 * Xuất CSV danh sách ghi danh.
 * `toCsv` đã tự thêm BOM UTF-8 và escape ngoặc kép/dấu phẩy/xuống dòng, nên
 * Excel trên Windows mở ra không vỡ font tiếng Việt.
 */
export async function exportEnrollmentsCsv(filter: EnrollmentExportFilter = {}): Promise<string> {
  const config = await getConfig();
  const take = Math.min(EXPORT_MAX_ROWS, Math.max(1, Math.trunc(filter.limit ?? EXPORT_MAX_ROWS)));

  const search = filter.search?.trim();
  const where: Prisma.EnrollmentWhereInput = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.source ? { source: filter.source } : {}),
    ...(filter.courseId ? { courseId: filter.courseId } : {}),
    ...(isValidDate(filter.from) || isValidDate(filter.to)
      ? {
          createdAt: {
            ...(isValidDate(filter.from) ? { gte: filter.from } : {}),
            ...(isValidDate(filter.to) ? { lte: filter.to } : {}),
          },
        }
      : {}),
    ...(filter.programCode || filter.gradeBand || filter.subject
      ? {
          course: {
            ...(filter.gradeBand ? { gradeBand: filter.gradeBand } : {}),
            ...(filter.subject ? { subject: filter.subject } : {}),
            ...(filter.programCode
              ? { program: { code: filter.programCode.toUpperCase() } }
              : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { student: { user: { fullName: { contains: search, mode: 'insensitive' } } } },
            { student: { user: { email: { contains: search, mode: 'insensitive' } } } },
            { student: { user: { phone: { contains: search } } } },
            { payment: { orderCode: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const rows = await prisma.enrollment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      status: true,
      source: true,
      startsAt: true,
      expiresAt: true,
      createdAt: true,
      selfDeclaredLevel: true,
      estimatedLevel: true,
      student: {
        select: {
          actualGrade: true,
          gradeBand: true,
          school: true,
          parentName: true,
          parentPhone: true,
          user: { select: { fullName: true, email: true, phone: true } },
        },
      },
      course: {
        select: {
          name: true,
          subject: true,
          program: { select: { code: true, name: true } },
        },
      },
      cohort: { select: { name: true, examDate: true } },
      payment: {
        select: {
          orderCode: true,
          gateway: true,
          status: true,
          amountOriginal: true,
          discountAmount: true,
          amount: true,
          paidAt: true,
          refundNote: true,
          coupon: { select: { code: true } },
        },
      },
    },
  });

  const levelLabel = (level: keyof typeof LEVEL_LABEL | null): string =>
    level ? (config.levels.labels[level] ?? LEVEL_LABEL[level]) : '';

  const csvRows = rows.map((row) => ({
    'Mã ghi danh': row.id,
    'Ngày tạo': formatDateTimeVN(row.createdAt),
    'Học sinh': row.student.user.fullName,
    Email: row.student.user.email ?? '',
    'Số điện thoại': row.student.user.phone ?? '',
    Lớp: String(row.student.actualGrade),
    Khối: GRADE_BAND_LABEL[row.student.gradeBand],
    'Trường': row.student.school ?? '',
    'Phụ huynh': row.student.parentName ?? '',
    'SĐT phụ huynh': row.student.parentPhone ?? '',
    'Mã chương trình': row.course.program.code,
    'Chương trình': row.course.program.name,
    'Khóa học': row.course.name,
    'Môn': SUBJECT_LABEL[row.course.subject],
    'Khóa tuyển sinh': row.cohort?.name ?? '',
    'Ngày thi': row.cohort ? formatDateVN(row.cohort.examDate) : '',
    'Nguồn': ENROLLMENT_SOURCE_LABEL[row.source],
    'Trạng thái': ENROLLMENT_STATUS_LABEL[row.status],
    'Bắt đầu': formatDateVN(row.startsAt),
    'Hết hạn': formatDateVN(row.expiresAt),
    'Số ngày còn lại': String(daysUntil(row.expiresAt)),
    'Mức tự khai': levelLabel(row.selfDeclaredLevel),
    'Mức ước tính': levelLabel(row.estimatedLevel),
    'Mã đơn hàng': row.payment?.orderCode ?? '',
    'Cổng thanh toán': row.payment?.gateway ?? '',
    'Trạng thái thanh toán': row.payment ? PAYMENT_STATUS_LABEL[row.payment.status] : '',
    // Cột tiền để nguyên số nguyên VND — kế toán còn cộng trừ trong Excel.
    'Giá gốc': row.payment ? String(row.payment.amountOriginal) : '',
    'Giảm giá': row.payment ? String(row.payment.discountAmount) : '',
    'Số tiền': row.payment ? String(row.payment.amount) : '',
    'Mã giảm giá': row.payment?.coupon?.code ?? '',
    'Ngày thanh toán': row.payment?.paidAt ? formatDateTimeVN(row.payment.paidAt) : '',
    'Ghi chú hoàn tiền': row.payment?.refundNote ?? '',
  }));

  return toCsv([...ENROLLMENT_EXPORT_HEADERS], csvRows);
}
