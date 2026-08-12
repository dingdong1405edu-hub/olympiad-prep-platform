/**
 * THÔNG BÁO & NHẮC HỌC — specs §12.
 *
 * Hai đường vào:
 *  1. Sự kiện nghiệp vụ gọi trực tiếp `queueNotification` (mua xong, có report
 *     mới, giáo viên ghi notes xong).
 *  2. Cron gọi `runNotificationSweep` cho các nhắc theo thời gian (chưa làm
 *     diagnostic, bỏ học, sắp đến hạn assessment, sắp hết hạn truy cập, sắp có
 *     buổi tư vấn).
 *
 * Ba ràng buộc bắt buộc của specs: tắt/bật toàn cục, tắt/bật từng trigger, và
 * trần số thông báo mỗi ngày — cadence do admin cấu hình, tránh spam gây tác
 * dụng ngược với học sinh nhỏ tuổi.
 */
import { Prisma } from '@prisma/client';
import type { Notification, NotificationChannel, NotificationStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';
import { getConfig, type NotificationConfig } from '@/lib/config';
import { addDays, addHours, daysUntil, diffDays, formatDateTimeVN, formatDateVN, formatDayLabelVN, vnDateKey, vnToday } from '@/lib/dates';
import { GRADE_BAND_LABEL, SUBJECT_LABEL } from '@/lib/domain';
import { NOTIFICATION_TEMPLATES, TEMPLATE_CODES } from './templates';

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

export interface QueueNotificationInput {
  userId: string;
  templateCode: string;
  data: Record<string, unknown>;
  channel?: NotificationChannel;
  scheduledFor?: Date | null;
  /**
   * Khóa chống trùng. Bỏ trống = tự sinh theo template + ngày lịch VN, nhờ vậy
   * cron chạy nhiều lần trong ngày cũng chỉ tạo một thông báo.
   */
  dedupeKey?: string;
}

export interface NotificationRow {
  id: string;
  channel: NotificationChannel;
  templateCode: string;
  title: string;
  body: string;
  status: NotificationStatus;
  read: boolean;
  createdAt: Date;
  createdAtLabel: string;
  scheduledFor: Date | null;
  payload: Prisma.JsonValue;
}

export interface ListNotificationsOptions {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
  channel?: NotificationChannel;
}

export interface ListNotificationsResult {
  rows: NotificationRow[];
  total: number;
  unread: number;
}

export interface SweepResult {
  queued: number;
  details: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Hằng số nội bộ
// ---------------------------------------------------------------------------

/** Trần số bản ghi xử lý mỗi lượt quét — bảo vệ cron khi dữ liệu lớn. */
const SWEEP_BATCH = 1000;

/** Bật/tắt từng trigger theo cấu hình admin (specs §12 — cadence cấu hình được). */
const TRIGGER_ENABLED: Record<string, (triggers: NotificationConfig['triggers']) => boolean> = {
  [TEMPLATE_CODES.AFTER_PURCHASE]: (t) => t.afterPurchase,
  [TEMPLATE_CODES.DIAGNOSTIC_REMINDER]: (t) => t.diagnosticReminderHours > 0,
  [TEMPLATE_CODES.DAILY_PLAN]: (t) => t.dailyPlanReminder,
  [TEMPLATE_CODES.INACTIVE_REMINDER]: (t) => t.inactiveReminderDays > 0,
  [TEMPLATE_CODES.ASSESSMENT_DUE]: (t) => t.assessmentDueBeforeDays > 0,
  [TEMPLATE_CODES.NEW_REPORT]: (t) => t.newReport,
  [TEMPLATE_CODES.SESSION_REMINDER]: (t) => t.sessionReminderHours > 0,
  [TEMPLATE_CODES.TEACHER_NOTES_READY]: (t) => t.teacherNotesReady,
  [TEMPLATE_CODES.ACCESS_EXPIRING]: (t) => t.accessExpiringBeforeDays > 0,
};

// ---------------------------------------------------------------------------
// Gửi thật (MVP: chỉ ghi log)
// ---------------------------------------------------------------------------

/**
 * ĐIỂM CẮM NHÀ CUNG CẤP THẬT.
 * MVP: IN_APP/PUSH coi như đã tới nơi ngay khi có bản ghi; EMAIL/SMS chỉ log ra
 * console. Khi tích hợp thật (SendGrid/Amazon SES/eSMS/Zalo OA), thay phần thân
 * hàm này bằng lời gọi provider và giữ nguyên việc cập nhật trạng thái bản ghi.
 */
async function deliver(notification: Notification): Promise<void> {
  if (notification.channel === 'EMAIL' || notification.channel === 'SMS') {
    console.info(
      `[notification] (${notification.channel}) → user=${notification.userId} | ${notification.title} | ${notification.body}`,
    );
  }

  try {
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'SENT', sentAt: new Date() },
    });
  } catch (error) {
    console.error('[notification] không cập nhật được trạng thái gửi', notification.id, error);
  }
}

// ---------------------------------------------------------------------------
// Tạo thông báo
// ---------------------------------------------------------------------------

function toRow(notification: Notification): NotificationRow {
  return {
    id: notification.id,
    channel: notification.channel,
    templateCode: notification.templateCode,
    title: notification.title,
    body: notification.body,
    status: notification.status,
    read: notification.readAt !== null,
    createdAt: notification.createdAt,
    createdAtLabel: formatDateTimeVN(notification.createdAt),
    scheduledFor: notification.scheduledFor,
    payload: notification.payload,
  };
}

/** Số thông báo đã tạo cho user trong ngày lịch VN hiện tại. */
async function countToday(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, createdAt: { gte: vnToday() } },
  });
}

/** Trả về true khi thực sự tạo được bản ghi — dùng để đếm chính xác ở cron. */
async function enqueue(input: QueueNotificationInput): Promise<boolean> {
  const template = NOTIFICATION_TEMPLATES[input.templateCode];
  if (!template) {
    console.warn('[notification] mã template không tồn tại:', input.templateCode);
    return false;
  }

  const config = await getConfig();
  if (!config.notification.enabled) return false;

  const isEnabled = TRIGGER_ENABLED[input.templateCode];
  if (isEnabled && !isEnabled(config.notification.triggers)) return false;

  const dedupeKey = input.dedupeKey ?? `${input.templateCode}:${vnDateKey()}`;

  const duplicated = await prisma.notification.findFirst({
    where: {
      userId: input.userId,
      templateCode: input.templateCode,
      payload: { path: ['dedupeKey'], equals: dedupeKey },
    },
    select: { id: true },
  });
  if (duplicated) return false;

  const maxPerDay = Math.max(0, config.notification.maxPerDay);
  if (maxPerDay > 0 && (await countToday(input.userId)) >= maxPerDay) {
    console.info(
      `[notification] bỏ qua ${input.templateCode} cho user=${input.userId}: đã đạt trần ${maxPerDay} thông báo/ngày`,
    );
    return false;
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, status: true },
  });
  if (!user || user.status === 'SUSPENDED') return false;

  // Không có email thì hạ kênh về in-app thay vì gửi vào hư không.
  let channel = input.channel ?? template.channel;
  if (channel === 'EMAIL' && !user.email) channel = 'IN_APP';

  const scheduledFor = input.scheduledFor ?? null;
  const isFuture = scheduledFor !== null && scheduledFor.getTime() > Date.now();

  const created = await prisma.notification.create({
    data: {
      userId: input.userId,
      channel,
      templateCode: input.templateCode,
      title: template.title(input.data),
      body: template.body(input.data),
      payload: { ...input.data, dedupeKey } as Prisma.InputJsonValue,
      status: 'QUEUED',
      scheduledFor,
    },
  });

  // Hẹn giờ tương lai → để lượt quét sau phát đi.
  if (!isFuture) await deliver(created);
  return true;
}

/**
 * Đưa một thông báo vào hàng đợi.
 * Bỏ qua (không ném lỗi) khi: tắt thông báo, tắt trigger, vượt trần mỗi ngày,
 * hoặc đã có đúng thông báo đó trong ngày — nhờ vậy cron gọi lại vẫn an toàn.
 */
export async function queueNotification(input: QueueNotificationInput): Promise<void> {
  await enqueue(input);
}

// ---------------------------------------------------------------------------
// Đọc & đánh dấu
// ---------------------------------------------------------------------------

export async function listNotifications(
  userId: string,
  options: ListNotificationsOptions = {},
): Promise<ListNotificationsResult> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(options.channel ? { channel: options.channel } : {}),
    ...(options.unreadOnly ? { readAt: null } : {}),
    // Thông báo hẹn giờ chưa tới lượt thì chưa hiện cho người dùng.
    OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }],
  };

  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.notification.count({ where }),
    countUnread(userId),
  ]);

  return { rows: rows.map(toRow), total, unread };
}

export async function markNotificationRead(id: string, userId: string): Promise<void> {
  const notification = await prisma.notification.findUnique({
    where: { id },
    select: { id: true, userId: true, readAt: true },
  });
  if (!notification) throw ApiError.notFound('Không tìm thấy thông báo.');
  if (notification.userId !== userId) throw ApiError.forbidden('Bạn không có quyền xem thông báo này.');
  if (notification.readAt) return;

  await prisma.notification.update({
    where: { id },
    data: { status: 'READ', readAt: new Date() },
  });
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { status: 'READ', readAt: new Date() },
  });
  return result.count;
}

export async function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({
    where: {
      userId,
      readAt: null,
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }],
    },
  });
}

// ---------------------------------------------------------------------------
// Quét định kỳ
// ---------------------------------------------------------------------------

const recipientInclude = {
  course: {
    select: {
      id: true,
      name: true,
      subject: true,
      gradeBand: true,
      program: { select: { id: true, name: true, shortName: true } },
    },
  },
  student: {
    select: {
      userId: true,
      actualGrade: true,
      user: { select: { id: true, fullName: true, status: true } },
    },
  },
} as const;

type EnrollmentWithRecipient = Prisma.EnrollmentGetPayload<{ include: typeof recipientInclude }>;

function recipientData(enrollment: EnrollmentWithRecipient): Record<string, unknown> {
  return {
    enrollmentId: enrollment.id,
    courseId: enrollment.course.id,
    courseName: `${SUBJECT_LABEL[enrollment.course.subject]} ${GRADE_BAND_LABEL[enrollment.course.gradeBand]}`,
    programName: enrollment.course.program.shortName ?? enrollment.course.program.name,
    studentName: enrollment.student.user.fullName,
  };
}

/** Phát các thông báo đã hẹn giờ và tới hạn. */
async function flushScheduled(): Promise<number> {
  const due = await prisma.notification.findMany({
    where: { status: 'QUEUED', scheduledFor: { not: null, lte: new Date() } },
    take: SWEEP_BATCH,
  });
  for (const notification of due) await deliver(notification);
  return due.length;
}

/**
 * Quét toàn bộ trigger theo thời gian. Idempotent theo ngày lịch VN: chạy lại
 * trong cùng ngày không tạo thêm bản ghi trùng loại cho cùng học sinh.
 */
export async function runNotificationSweep(): Promise<SweepResult> {
  const config = await getConfig();
  const details: Record<string, number> = {
    [TEMPLATE_CODES.DIAGNOSTIC_REMINDER]: 0,
    [TEMPLATE_CODES.DAILY_PLAN]: 0,
    [TEMPLATE_CODES.INACTIVE_REMINDER]: 0,
    [TEMPLATE_CODES.ASSESSMENT_DUE]: 0,
    [TEMPLATE_CODES.SESSION_REMINDER]: 0,
    [TEMPLATE_CODES.ACCESS_EXPIRING]: 0,
    DELIVERED_SCHEDULED: 0,
  };

  if (!config.notification.enabled) return { queued: 0, details };

  const triggers = config.notification.triggers;
  const now = new Date();
  const today = vnToday(now);
  const dayKey = vnDateKey(now);

  details.DELIVERED_SCHEDULED = await flushScheduled();

  const enrollments = await prisma.enrollment.findMany({
    where: { status: 'ACTIVE', expiresAt: { gt: now } },
    include: recipientInclude,
    orderBy: { createdAt: 'desc' },
    take: SWEEP_BATCH,
  });
  if (enrollments.length === 0) return { queued: 0, details };

  const ids = enrollments.map((enrollment) => enrollment.id);

  // Gom toàn bộ số liệu cần dùng bằng truy vấn gộp, tránh N+1 trong vòng lặp.
  const [lastAttempts, diagnosticDone, lastAssessments, todayPlanDays, upcomingSessions] =
    await Promise.all([
      prisma.itemAttempt.groupBy({
        by: ['enrollmentId'],
        where: { enrollmentId: { in: ids } },
        _max: { createdAt: true },
      }),
      prisma.assessmentAttempt.findMany({
        where: {
          enrollmentId: { in: ids },
          assessment: { type: 'DIAGNOSTIC' },
          status: { in: ['SUBMITTED', 'GRADED'] },
        },
        select: { enrollmentId: true },
        distinct: ['enrollmentId'],
      }),
      prisma.assessmentAttempt.groupBy({
        by: ['enrollmentId'],
        where: { enrollmentId: { in: ids }, status: { in: ['SUBMITTED', 'GRADED'] } },
        _max: { submittedAt: true },
      }),
      prisma.studyPlanDay.findMany({
        where: { plan: { enrollmentId: { in: ids } }, date: today, status: { in: ['PLANNED', 'IN_PROGRESS'] } },
        select: {
          id: true,
          estimatedMinutes: true,
          date: true,
          plan: { select: { enrollmentId: true } },
          _count: { select: { items: true } },
        },
      }),
      triggers.sessionReminderHours > 0
        ? prisma.teacherSession.findMany({
            where: {
              status: 'SCHEDULED',
              scheduledAt: { gte: now, lte: addHours(now, triggers.sessionReminderHours) },
            },
            select: {
              id: true,
              enrollmentId: true,
              scheduledAt: true,
              durationMinutes: true,
              meetingLink: true,
            },
            take: SWEEP_BATCH,
          })
        : Promise.resolve([]),
    ]);

  const lastAttemptBy = new Map<string, Date | null>(
    lastAttempts.map((row) => [row.enrollmentId, row._max.createdAt]),
  );
  const diagnosticDoneSet = new Set(diagnosticDone.map((row) => row.enrollmentId));
  const lastAssessmentBy = new Map<string, Date | null>(
    lastAssessments.map((row) => [row.enrollmentId, row._max.submittedAt]),
  );
  const planDayBy = new Map(todayPlanDays.map((day) => [day.plan.enrollmentId, day]));
  const enrollmentById = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]));

  let queued = 0;
  const send = async (
    templateCode: string,
    enrollment: EnrollmentWithRecipient,
    data: Record<string, unknown>,
    dedupeSuffix: string,
  ): Promise<void> => {
    if (enrollment.student.user.status === 'SUSPENDED') return;
    const created = await enqueue({
      userId: enrollment.student.userId,
      templateCode,
      data: { ...recipientData(enrollment), ...data },
      dedupeKey: `${templateCode}:${enrollment.id}:${dedupeSuffix}`,
    });
    if (!created) return;
    details[templateCode] = (details[templateCode] ?? 0) + 1;
    queued += 1;
  };

  for (const enrollment of enrollments) {
    // --- Chưa làm bài kiểm tra đầu vào sau N giờ ---------------------------
    if (
      triggers.diagnosticReminderHours > 0 &&
      !diagnosticDoneSet.has(enrollment.id) &&
      enrollment.createdAt <= addHours(now, -triggers.diagnosticReminderHours)
    ) {
      await send(
        TEMPLATE_CODES.DIAGNOSTIC_REMINDER,
        enrollment,
        { itemCount: config.assessment.diagnosticItemCount },
        dayKey,
      );
      continue; // mỗi ngày chỉ nhắc một việc quan trọng nhất cho mỗi khóa
    }

    // --- Nội dung học hôm nay ---------------------------------------------
    const planDay = planDayBy.get(enrollment.id);
    if (triggers.dailyPlanReminder && planDay) {
      await send(
        TEMPLATE_CODES.DAILY_PLAN,
        enrollment,
        {
          planDayId: planDay.id,
          itemCount: planDay._count.items,
          minutes: planDay.estimatedMinutes,
          dayLabel: formatDayLabelVN(planDay.date),
        },
        dayKey,
      );
      continue;
    }

    // --- Bỏ học nhiều ngày -------------------------------------------------
    const lastAttemptAt = lastAttemptBy.get(enrollment.id) ?? null;
    if (triggers.inactiveReminderDays > 0 && lastAttemptAt) {
      const idleDays = diffDays(now, lastAttemptAt);
      if (idleDays >= triggers.inactiveReminderDays) {
        await send(
          TEMPLATE_CODES.INACTIVE_REMINDER,
          enrollment,
          { days: idleDays, minutes: config.recommendation.minMinutesPerDay },
          dayKey,
        );
        continue;
      }
    }

    // --- Sắp tới hạn kiểm tra tiến bộ --------------------------------------
    const lastSubmittedAt = lastAssessmentBy.get(enrollment.id) ?? null;
    if (triggers.assessmentDueBeforeDays > 0 && lastSubmittedAt) {
      const dueAt = addDays(lastSubmittedAt, config.assessment.cycleDays);
      const daysLeft = daysUntil(dueAt);
      if (daysLeft >= 0 && daysLeft <= triggers.assessmentDueBeforeDays) {
        await send(
          TEMPLATE_CODES.ASSESSMENT_DUE,
          enrollment,
          {
            days: daysLeft,
            cycleDays: config.assessment.cycleDays,
            itemCount: config.assessment.progressItemCount,
            minutes: config.assessment.progressTimeLimitMinutes ?? config.recommendation.minMinutesPerDay * 2,
            dueAtLabel: formatDateVN(dueAt),
          },
          vnDateKey(dueAt),
        );
        continue;
      }
    }

    // --- Sắp hết quyền truy cập -------------------------------------------
    if (triggers.accessExpiringBeforeDays > 0) {
      const daysLeft = daysUntil(enrollment.expiresAt);
      if (daysLeft >= 0 && daysLeft <= triggers.accessExpiringBeforeDays) {
        await send(
          TEMPLATE_CODES.ACCESS_EXPIRING,
          enrollment,
          { days: daysLeft, expiresAtLabel: formatDateVN(enrollment.expiresAt) },
          vnDateKey(enrollment.expiresAt),
        );
      }
    }
  }

  // --- Sắp tới buổi tư vấn -------------------------------------------------
  for (const session of upcomingSessions) {
    const enrollment = enrollmentById.get(session.enrollmentId);
    if (!enrollment || !session.scheduledAt) continue;
    await send(
      TEMPLATE_CODES.SESSION_REMINDER,
      enrollment,
      {
        sessionId: session.id,
        timeLabel: formatDateTimeVN(session.scheduledAt),
        durationMinutes: session.durationMinutes,
        meetingLink: session.meetingLink ?? '',
      },
      session.id,
    );
  }

  return { queued, details };
}
