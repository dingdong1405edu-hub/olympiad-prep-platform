/**
 * MODULE GIÁO VIÊN (specs §9.3, §10.4, §12.2).
 *
 * Giáo viên là vòng lặp CON NGƯỜI của hệ thống: engine chọn bài, AI diễn giải,
 * còn giáo viên là người duy nhất được phép đổi hướng lộ trình.
 *
 * BỐN RÀNG BUỘC KHÔNG ĐƯỢC PHÁ:
 *  1. PHÂN QUYỀN THEO PHÂN CÔNG. Giáo viên chỉ chạm được vào học sinh mình phụ
 *     trách. Quản lý chương trình và super admin xem được tất cả để vận hành,
 *     nhưng vẫn phải đi qua đúng hàm kiểm tra này chứ không truy vấn thẳng.
 *  2. GHI NOTES LÀ HÀNH ĐỘNG CÓ HẬU QUẢ. Lưu notes đồng thời: chốt buổi tư vấn,
 *     đẩy override vào engine cho chu kỳ sau, báo cho học sinh và ghi audit.
 *     Bốn việc này nằm trong một hàm để không bao giờ xảy ra trạng thái nửa vời.
 *  3. KHÔNG ĐẶT TRÙNG LỊCH. Một enrollment chỉ có một buổi SCHEDULED tại một
 *     thời điểm; đặt lại lịch là CẬP NHẬT buổi cũ chứ không tạo buổi mới.
 *  4. LỖI PHỤ KHÔNG LÀM HỎNG NGHIỆP VỤ CHÍNH. Gửi thông báo hay ghi audit hỏng
 *     thì chỉ log, notes của giáo viên vẫn phải được lưu.
 *
 * Service này KHÔNG import gì từ `next/*` — nó phải gọi được từ cả route
 * handler, React Server Component lẫn script cron.
 */
import type { Prisma, SessionStatus, StudentLevel, TeacherAction } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';
import { getConfig } from '@/lib/config';
import { AUDIT_ACTIONS, writeAudit } from '@/lib/audit';
import { addDays, daysUntil, vnToday } from '@/lib/dates';
import { LEVEL_LABEL, SUBJECT_LABEL } from '@/lib/domain';
import { applyTeacherOverride, getPlanProgress } from '@/server/plan/service';
import { getMasteryMap, getTopErrorPatterns } from '@/server/student-model/service';
import { listAttempts } from '@/server/assessment/service';
import { generateTeacherBrief } from '@/server/ai/service';
import { queueNotification } from '@/server/notification/service';
import { TEMPLATE_CODES } from '@/server/notification/templates';
import {
  FOLLOW_UP_LEVEL_LABEL,
  type FollowUpLevel,
  type ListSessionsFilter,
  type StudentFilter,
} from './schemas';

// ---------------------------------------------------------------------------
// Hằng số kỹ thuật (tham số nghiệp vụ nằm ở getConfig)
// ---------------------------------------------------------------------------

/** Trần bản ghi trả về một lần — chặn dashboard toàn hệ thống kéo về cả nghìn dòng. */
const MAX_ROWS = 200;
const DEFAULT_SESSION_LIMIT = 50;

/** Nhãn hành động hiển thị cho học sinh trong thông báo. */
const ACTION_LABEL: Record<TeacherAction, string> = {
  KEEP_PLAN: 'Lộ trình giữ nguyên',
  REDUCE_LOAD: 'Lộ trình đã giảm tải',
  INCREASE_LOAD: 'Lộ trình đã tăng tải',
  CHANGE_PRIORITY: 'Lộ trình đã đổi thứ tự ưu tiên',
};

// ---------------------------------------------------------------------------
// Kiểu trả về công khai
// ---------------------------------------------------------------------------

export interface TeacherStudentRow {
  enrollmentId: string;
  studentName: string;
  studentEmail: string | null;
  actualGrade: number;
  school: string | null;
  programName: string;
  courseName: string;
  subjectLabel: string;
  estimatedLevel: StudentLevel | null;
  estimatedLevelLabel: string;
  averageMastery: number;
  completionRate: number;
  /** Số ngày kể từ lần làm bài gần nhất; null = chưa làm bài nào. */
  daysSinceActive: number | null;
  nextSessionAt: Date | null;
  /** Cảnh báo đã sắp theo mức nghiêm trọng giảm dần. */
  alerts: StudentAlert[];
  needsAttention: boolean;
}

export type AlertSeverity = 'HIGH' | 'MEDIUM';

export interface StudentAlert {
  kind:
    | 'NO_DIAGNOSTIC'
    | 'INACTIVE'
    | 'MASTERY_DROP'
    | 'ASSESSMENT_OVERDUE'
    | 'GOAL_INFEASIBLE'
    | 'GOAL_TIGHT';
  severity: AlertSeverity;
  message: string;
}

export interface TeacherSessionRow {
  sessionId: string;
  enrollmentId: string;
  studentName: string;
  programName: string;
  subjectLabel: string;
  cycleNo: number;
  scheduledAt: Date | null;
  durationMinutes: number;
  meetingLink: string | null;
  status: SessionStatus;
  hasNotes: boolean;
  followUpLevel: FollowUpLevel | null;
  followUpLabel: string | null;
}

export interface TeacherDossier {
  enrollmentId: string;
  studentName: string;
  programName: string;
  courseName: string;
  subjectLabel: string;
  actualGrade: number;
  estimatedLevel: StudentLevel | null;
  estimatedLevelLabel: string;
  mastery: Awaited<ReturnType<typeof getMasteryMap>>;
  errorPatterns: Awaited<ReturnType<typeof getTopErrorPatterns>>;
  progress: Awaited<ReturnType<typeof getPlanProgress>> | null;
  attempts: Awaited<ReturnType<typeof listAttempts>>;
  sessions: TeacherSessionRow[];
}

export interface SaveNotesResult {
  sessionId: string;
  status: SessionStatus;
  planUpdated: boolean;
  /** Lộ trình không cập nhật được (vd enrollment hết hạn) — notes vẫn đã lưu. */
  planWarning: string | null;
}

export interface TeacherWorkloadRow {
  teacherId: string;
  userId: string;
  fullName: string;
  email: string | null;
  active: boolean;
  capacityPerCycle: number;
  activeStudents: number;
  upcomingSessions: number;
  sessionsWithoutNotes: number;
  /** 0–1+; > 1 nghĩa là đã vượt sức chứa khai báo. */
  utilization: number;
}

// ---------------------------------------------------------------------------
// Phân quyền — MỌI hàm dưới đây phải đi qua một trong hai cổng này
// ---------------------------------------------------------------------------

interface Actor {
  userId: string;
  /** true = quản lý chương trình / super admin, xem được mọi học sinh. */
  isOverseer: boolean;
}

/**
 * Hồ sơ giáo viên của người đang đăng nhập. Trả về null với người giám sát chưa
 * có hồ sơ giáo viên — họ vẫn xem được nhưng không "sở hữu" học sinh nào.
 */
async function getTeacherProfile(userId: string): Promise<{ id: string } | null> {
  return prisma.teacherProfile.findUnique({ where: { userId }, select: { id: true } });
}

/**
 * Điều kiện lọc enrollment mà actor được phép nhìn thấy.
 * Giáo viên chưa có hồ sơ ⇒ không phụ trách ai ⇒ điều kiện không khớp gì cả,
 * an toàn hơn là trả về toàn bộ.
 */
async function scopeFor(actor: Actor): Promise<Prisma.EnrollmentWhereInput> {
  if (actor.isOverseer) return {};
  const profile = await getTeacherProfile(actor.userId);
  if (!profile) return { id: '__không-phụ-trách-học-sinh-nào__' };
  return { teacherAssignment: { teacherId: profile.id, active: true } };
}

/**
 * Kiểm tra quyền chạm vào một enrollment cụ thể.
 * Ném 404 chứ không phải 403 khi không có quyền: giáo viên không được biết
 * enrollment đó có tồn tại hay không (specs §10.5).
 */
export async function assertCanAccessEnrollment(actor: Actor, enrollmentId: string): Promise<void> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { id: true, teacherAssignment: { select: { teacherId: true, active: true } } },
  });
  if (!enrollment) throw ApiError.notFound('Không tìm thấy học sinh này.');
  if (actor.isOverseer) return;

  const profile = await getTeacherProfile(actor.userId);
  const assignment = enrollment.teacherAssignment;
  if (!profile || !assignment || !assignment.active || assignment.teacherId !== profile.id) {
    throw ApiError.notFound('Không tìm thấy học sinh này.');
  }
}

// ---------------------------------------------------------------------------
// 1. Danh sách học sinh + cảnh báo
// ---------------------------------------------------------------------------

/** Đọc mức tiến bộ trung bình từ JSON `deltaSummary`; thiếu dữ liệu thì trả null. */
function readAverageDelta(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const delta = (value as Record<string, unknown>).averageDelta;
  return typeof delta === 'number' && Number.isFinite(delta) ? delta : null;
}

/**
 * Cảnh báo được TÍNH LẠI mỗi lần đọc chứ không lưu sẵn trong DB.
 * Lý do: ngưỡng cảnh báo nằm trong AppConfig và có thể đổi bất cứ lúc nào;
 * một bảng cache sẽ lệch ngay sau lần đổi cấu hình đầu tiên.
 */
function buildAlerts(input: {
  hasDiagnostic: boolean;
  daysSinceActive: number | null;
  masteryDelta: number | null;
  assessmentOverdueDays: number | null;
  goalFeasibility: string | null;
  inactiveThresholdDays: number;
}): StudentAlert[] {
  const alerts: StudentAlert[] = [];

  if (!input.hasDiagnostic) {
    alerts.push({
      kind: 'NO_DIAGNOSTIC',
      severity: 'MEDIUM',
      message: 'Chưa làm bài kiểm tra đầu vào nên hệ thống chưa đo được năng lực.',
    });
  }

  if (input.daysSinceActive !== null && input.daysSinceActive >= input.inactiveThresholdDays) {
    alerts.push({
      kind: 'INACTIVE',
      severity: 'HIGH',
      message: `Đã ${input.daysSinceActive} ngày không làm bài nào.`,
    });
  }

  if (input.masteryDelta !== null && input.masteryDelta < 0) {
    alerts.push({
      kind: 'MASTERY_DROP',
      severity: 'HIGH',
      message: `Mastery giảm ${Math.abs(Math.round(input.masteryDelta))} điểm so với lần đo trước.`,
    });
  }

  if (input.assessmentOverdueDays !== null && input.assessmentOverdueDays > 0) {
    alerts.push({
      kind: 'ASSESSMENT_OVERDUE',
      severity: 'HIGH',
      message: `Bài kiểm tra định kỳ đã quá hạn ${input.assessmentOverdueDays} ngày.`,
    });
  }

  if (input.goalFeasibility === 'INFEASIBLE') {
    alerts.push({
      kind: 'GOAL_INFEASIBLE',
      severity: 'HIGH',
      message: 'Mục tiêu hiện tại không khả thi với quỹ thời gian đã khai.',
    });
  } else if (input.goalFeasibility === 'TIGHT') {
    alerts.push({
      kind: 'GOAL_TIGHT',
      severity: 'MEDIUM',
      message: 'Mục tiêu hơi căng, cần bám sát tiến độ.',
    });
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'HIGH' ? -1 : 1));
}

export async function listStudents(
  actor: Actor,
  filter: StudentFilter = {},
): Promise<TeacherStudentRow[]> {
  const config = await getConfig();
  const scope = await scopeFor(actor);
  const today = vnToday();

  const where: Prisma.EnrollmentWhereInput = {
    ...scope,
    status: 'ACTIVE',
    ...(filter.level ? { estimatedLevel: filter.level } : {}),
    ...(filter.programId || filter.gradeBand || filter.subject
      ? {
          course: {
            ...(filter.programId ? { programId: filter.programId } : {}),
            ...(filter.gradeBand ? { gradeBand: filter.gradeBand } : {}),
            ...(filter.subject ? { subject: filter.subject } : {}),
          },
        }
      : {}),
    ...(filter.search
      ? {
          student: {
            user: {
              OR: [
                { fullName: { contains: filter.search, mode: 'insensitive' } },
                { email: { contains: filter.search, mode: 'insensitive' } },
                { phone: { contains: filter.search } },
              ],
            },
          },
        }
      : {}),
  };

  const rows = await prisma.enrollment.findMany({
    where,
    take: MAX_ROWS,
    orderBy: { createdAt: 'desc' },
    include: {
      student: {
        include: { user: { select: { fullName: true, email: true } } },
      },
      course: {
        include: { program: { select: { name: true } } },
      },
      goals: { where: { active: true }, take: 1, orderBy: { createdAt: 'desc' } },
      teacherSessions: {
        where: { status: 'SCHEDULED' },
        orderBy: { scheduledAt: 'asc' },
        take: 1,
      },
      assessmentAttempts: {
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 2,
        select: {
          submittedAt: true,
          // Mức tiến bộ nằm trong JSON `deltaSummary` do engine ghi lúc chấm bài,
          // không phải cột riêng — đọc ra ở dưới bằng readAverageDelta().
          deltaSummary: true,
          assessment: { select: { type: true } },
        },
      },
      masteries: { select: { masteryScore: true } },
      plans: { where: { status: 'ACTIVE' }, select: { id: true } },
    },
  });

  // Tỷ lệ hoàn thành lộ trình tính bằng MỘT truy vấn gộp cho cả trang thay vì
  // gọi getPlanProgress cho từng học sinh — 200 dòng sẽ thành 200 lượt truy vấn.
  const planToEnrollment = new Map<string, string>();
  for (const row of rows) {
    for (const plan of row.plans) planToEnrollment.set(plan.id, row.id);
  }
  const dayCounts = await prisma.studyPlanDay.groupBy({
    by: ['planId', 'status'],
    where: { planId: { in: [...planToEnrollment.keys()] } },
    _count: { _all: true },
  });
  const totalDays = new Map<string, number>();
  const doneDays = new Map<string, number>();
  const lastActiveDay = new Map<string, Date>();
  for (const group of dayCounts) {
    const enrollmentId = planToEnrollment.get(group.planId);
    if (!enrollmentId) continue;
    const n = group._count._all;
    totalDays.set(enrollmentId, (totalDays.get(enrollmentId) ?? 0) + n);
    if (group.status === 'COMPLETED' || group.status === 'IN_PROGRESS') {
      doneDays.set(enrollmentId, (doneDays.get(enrollmentId) ?? 0) + n);
    }
  }

  // Ngày học gần nhất đã hoàn thành — dùng để đo "đã lâu không học".
  const recentDays = await prisma.studyPlanDay.findMany({
    where: {
      planId: { in: [...planToEnrollment.keys()] },
      status: { in: ['COMPLETED', 'IN_PROGRESS'] },
    },
    orderBy: { date: 'desc' },
    select: { planId: true, date: true },
  });
  for (const day of recentDays) {
    const enrollmentId = planToEnrollment.get(day.planId);
    if (!enrollmentId || lastActiveDay.has(enrollmentId)) continue;
    lastActiveDay.set(enrollmentId, day.date);
  }

  const inactiveDays = config.notification.triggers.inactiveReminderDays;
  const cycleDays = config.assessment.cycleDays;

  return rows.map((row) => {
    const scores = row.masteries.map((m) => m.masteryScore);
    const averageMastery =
      scores.length === 0 ? 0 : scores.reduce((a, b) => a + b, 0) / scores.length;

    // "Hoạt động gần nhất" lấy mốc muộn hơn giữa nộp bài và hoàn thành ngày học
    // — học sinh chăm luyện tập hằng ngày mà chưa tới kỳ kiểm tra vẫn được tính.
    const lastAttempt = row.assessmentAttempts[0]?.submittedAt ?? null;
    const lastPlanDay = lastActiveDay.get(row.id) ?? null;
    const lastActive =
      lastAttempt && lastPlanDay
        ? lastAttempt > lastPlanDay
          ? lastAttempt
          : lastPlanDay
        : (lastAttempt ?? lastPlanDay);
    const daysSinceActive = lastActive === null ? null : Math.max(0, -daysUntil(lastActive));

    const hasDiagnostic =
      row.assessmentAttempts.some((a) => a.assessment.type === 'DIAGNOSTIC') ||
      row.estimatedLevel !== null;
    const latestDelta = readAverageDelta(row.assessmentAttempts[0]?.deltaSummary);

    // Quá hạn kiểm tra định kỳ: tính từ lần nộp gần nhất cộng độ dài chu kỳ.
    const assessmentOverdueDays =
      lastAttempt === null ? null : Math.max(0, -daysUntil(addDays(lastAttempt, cycleDays)));

    const alerts = buildAlerts({
      hasDiagnostic,
      daysSinceActive,
      masteryDelta: latestDelta,
      assessmentOverdueDays,
      goalFeasibility: row.goals[0]?.feasibility ?? null,
      inactiveThresholdDays: inactiveDays > 0 ? inactiveDays : 7,
    });

    return {
      enrollmentId: row.id,
      studentName: row.student.user.fullName,
      studentEmail: row.student.user.email,
      actualGrade: row.student.actualGrade,
      school: row.student.school,
      programName: row.course.program.name,
      courseName: row.course.name,
      subjectLabel: SUBJECT_LABEL[row.course.subject],
      estimatedLevel: row.estimatedLevel,
      estimatedLevelLabel: row.estimatedLevel ? LEVEL_LABEL[row.estimatedLevel] : 'Chưa đo',
      averageMastery: Math.round(averageMastery * 10) / 10,
      completionRate:
        (totalDays.get(row.id) ?? 0) === 0
          ? 0
          : Math.round(((doneDays.get(row.id) ?? 0) / (totalDays.get(row.id) ?? 1)) * 100) / 100,
      daysSinceActive,
      nextSessionAt: row.teacherSessions[0]?.scheduledAt ?? null,
      alerts,
      needsAttention: alerts.length > 0,
    };
  });
}

/** Chỉ những học sinh đang có cảnh báo, dùng cho khối "Cần chú ý" ở dashboard. */
export async function listAlerts(actor: Actor): Promise<TeacherStudentRow[]> {
  const rows = await listStudents(actor);
  return rows
    .filter((row) => row.needsAttention)
    .sort((a, b) => {
      const aHigh = a.alerts.filter((x) => x.severity === 'HIGH').length;
      const bHigh = b.alerts.filter((x) => x.severity === 'HIGH').length;
      if (aHigh !== bHigh) return bHigh - aHigh;
      return b.alerts.length - a.alerts.length;
    });
}

// ---------------------------------------------------------------------------
// 2. Hồ sơ đầy đủ một học sinh
// ---------------------------------------------------------------------------

export async function getStudentDossier(actor: Actor, enrollmentId: string): Promise<TeacherDossier> {
  await assertCanAccessEnrollment(actor, enrollmentId);

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      student: { include: { user: { select: { fullName: true } } } },
      course: { include: { program: { select: { name: true } } } },
      teacherSessions: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
  if (!enrollment) throw ApiError.notFound('Không tìm thấy học sinh này.');

  // Bốn truy vấn nặng chạy song song; getPlanProgress ném lỗi khi chưa có lộ
  // trình nên bắt lại thành null thay vì làm hỏng cả hồ sơ.
  const [mastery, errorPatterns, progress, attempts] = await Promise.all([
    getMasteryMap(enrollmentId),
    getTopErrorPatterns(enrollmentId, 5),
    getPlanProgress(enrollmentId).catch(() => null),
    listAttempts(enrollmentId),
  ]);

  const subjectLabel = SUBJECT_LABEL[enrollment.course.subject];
  const studentName = enrollment.student.user.fullName;

  return {
    enrollmentId,
    studentName,
    programName: enrollment.course.program.name,
    courseName: enrollment.course.name,
    subjectLabel,
    actualGrade: enrollment.student.actualGrade,
    estimatedLevel: enrollment.estimatedLevel,
    estimatedLevelLabel: enrollment.estimatedLevel ? LEVEL_LABEL[enrollment.estimatedLevel] : 'Chưa đo',
    mastery,
    errorPatterns,
    progress,
    attempts,
    sessions: enrollment.teacherSessions.map((session) => ({
      sessionId: session.id,
      enrollmentId,
      studentName,
      programName: enrollment.course.program.name,
      subjectLabel,
      cycleNo: session.cycleNo,
      scheduledAt: session.scheduledAt,
      durationMinutes: session.durationMinutes,
      meetingLink: session.meetingLink,
      status: session.status,
      hasNotes: Boolean(session.teacherNotes && session.teacherNotes.trim() !== ''),
      followUpLevel: (session.followUpLevel as FollowUpLevel | null) ?? null,
      followUpLabel: session.followUpLevel
        ? (FOLLOW_UP_LEVEL_LABEL[session.followUpLevel as FollowUpLevel] ?? null)
        : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// 3. Buổi tư vấn
// ---------------------------------------------------------------------------

export async function listSessions(
  actor: Actor,
  filter: ListSessionsFilter = {},
): Promise<TeacherSessionRow[]> {
  const scope = await scopeFor(actor);
  const now = new Date();

  const where: Prisma.TeacherSessionWhereInput = {
    enrollment: scope,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.enrollmentId ? { enrollmentId: filter.enrollmentId } : {}),
    ...(filter.from || filter.to || filter.upcomingOnly
      ? {
          scheduledAt: {
            ...(filter.upcomingOnly ? { gte: now } : {}),
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lte: filter.to } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.teacherSession.findMany({
    where,
    take: Math.min(filter.limit ?? DEFAULT_SESSION_LIMIT, MAX_ROWS),
    // Buổi chưa hẹn giờ (scheduledAt = null) xếp cuối để lịch sắp tới nằm trên.
    orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
    include: {
      enrollment: {
        include: {
          student: { include: { user: { select: { fullName: true } } } },
          course: { include: { program: { select: { name: true } } } },
        },
      },
    },
  });

  return rows.map((session) => ({
    sessionId: session.id,
    enrollmentId: session.enrollmentId,
    studentName: session.enrollment.student.user.fullName,
    programName: session.enrollment.course.program.name,
    subjectLabel: SUBJECT_LABEL[session.enrollment.course.subject],
    cycleNo: session.cycleNo,
    scheduledAt: session.scheduledAt,
    durationMinutes: session.durationMinutes,
    meetingLink: session.meetingLink,
    status: session.status,
    hasNotes: Boolean(session.teacherNotes && session.teacherNotes.trim() !== ''),
    followUpLevel: (session.followUpLevel as FollowUpLevel | null) ?? null,
    followUpLabel: session.followUpLevel
      ? (FOLLOW_UP_LEVEL_LABEL[session.followUpLevel as FollowUpLevel] ?? null)
      : null,
  }));
}

/**
 * Đặt hoặc dời lịch buổi tư vấn.
 *
 * Buổi SCHEDULED của cùng enrollment được CẬP NHẬT chứ không tạo thêm — nếu tạo
 * mới thì học sinh sẽ thấy hai buổi trùng nhau và không biết vào buổi nào.
 */
export async function bookSession(
  actor: Actor,
  input: { enrollmentId: string; scheduledAt: Date; meetingLink?: string; teacherId?: string },
): Promise<TeacherSessionRow> {
  await assertCanAccessEnrollment(actor, input.enrollmentId);
  const config = await getConfig();

  if (input.scheduledAt.getTime() < Date.now()) {
    throw ApiError.badRequest('Không đặt được lịch tư vấn trong quá khứ.');
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: input.enrollmentId },
    include: {
      student: { include: { user: { select: { id: true, fullName: true } } } },
      course: { include: { program: { select: { name: true } } } },
      teacherAssignment: { select: { teacherId: true } },
    },
  });
  if (!enrollment) throw ApiError.notFound('Không tìm thấy học sinh này.');

  // Giáo viên phụ trách theo thứ tự ưu tiên: chỉ định tay → đang phân công →
  // hồ sơ của chính người đang thao tác. Không có ai thì để trống, admin gán sau.
  const ownProfile = await getTeacherProfile(actor.userId);
  const teacherId = input.teacherId ?? enrollment.teacherAssignment?.teacherId ?? ownProfile?.id ?? null;
  if (teacherId) {
    const exists = await prisma.teacherProfile.findUnique({ where: { id: teacherId }, select: { id: true } });
    if (!exists) throw ApiError.badRequest('Không tìm thấy hồ sơ giáo viên được chọn.');
  }

  const existing = await prisma.teacherSession.findFirst({
    where: { enrollmentId: input.enrollmentId, status: 'SCHEDULED' },
    orderBy: { createdAt: 'desc' },
  });

  const lastCycle = await prisma.teacherSession.aggregate({
    where: { enrollmentId: input.enrollmentId },
    _max: { cycleNo: true },
  });

  const session = existing
    ? await prisma.teacherSession.update({
        where: { id: existing.id },
        data: {
          scheduledAt: input.scheduledAt,
          meetingLink: input.meetingLink ?? existing.meetingLink,
          teacherId: teacherId ?? existing.teacherId,
          durationMinutes: config.teacher.sessionMinutes,
        },
      })
    : await prisma.teacherSession.create({
        data: {
          enrollmentId: input.enrollmentId,
          teacherId,
          cycleNo: (lastCycle._max.cycleNo ?? 0) + 1,
          scheduledAt: input.scheduledAt,
          meetingLink: input.meetingLink ?? null,
          durationMinutes: config.teacher.sessionMinutes,
          status: 'SCHEDULED',
        },
      });

  // Thông báo là việc phụ: hỏng thì học sinh vẫn thấy lịch trong giao diện.
  await queueNotification({
    userId: enrollment.student.user.id,
    templateCode: TEMPLATE_CODES.SESSION_REMINDER,
    data: {
      durationMinutes: session.durationMinutes,
      timeLabel: input.scheduledAt.toISOString(),
      meetingLink: session.meetingLink ?? '',
    },
    dedupeKey: `${TEMPLATE_CODES.SESSION_REMINDER}:${session.id}:${input.scheduledAt.getTime()}`,
  }).catch((error) => console.error('[teacher] không gửi được nhắc lịch tư vấn', error));

  return {
    sessionId: session.id,
    enrollmentId: session.enrollmentId,
    studentName: enrollment.student.user.fullName,
    programName: enrollment.course.program.name,
    subjectLabel: SUBJECT_LABEL[enrollment.course.subject],
    cycleNo: session.cycleNo,
    scheduledAt: session.scheduledAt,
    durationMinutes: session.durationMinutes,
    meetingLink: session.meetingLink,
    status: session.status,
    hasNotes: false,
    followUpLevel: null,
    followUpLabel: null,
  };
}

/** Chi tiết một buổi kèm brief AI — dùng cho màn hình 20 phút tư vấn. */
export async function getSessionDetail(actor: Actor, sessionId: string) {
  const session = await prisma.teacherSession.findUnique({
    where: { id: sessionId },
    include: {
      enrollment: {
        include: {
          student: { include: { user: { select: { fullName: true } } } },
          course: { include: { program: { select: { name: true } } } },
        },
      },
    },
  });
  if (!session) throw ApiError.notFound('Không tìm thấy buổi tư vấn.');
  await assertCanAccessEnrollment(actor, session.enrollmentId);

  const [dossier, brief] = await Promise.all([
    getStudentDossier(actor, session.enrollmentId),
    // Brief AI hỏng thì màn hình vẫn mở được với dữ liệu số — giáo viên là
    // người quyết định, brief chỉ là gợi ý (specs §8.1).
    generateTeacherBrief(sessionId).catch(() => null),
  ]);

  return {
    sessionId: session.id,
    enrollmentId: session.enrollmentId,
    cycleNo: session.cycleNo,
    scheduledAt: session.scheduledAt,
    durationMinutes: session.durationMinutes,
    meetingLink: session.meetingLink,
    status: session.status,
    brief,
    notes: {
      teacherNotes: session.teacherNotes ?? '',
      actionCode: session.actionCode,
      actionItems: Array.isArray(session.actionItems) ? (session.actionItems as string[]) : [],
      focusSkillIds: session.focusSkillIds,
      followUpLevel: (session.followUpLevel as FollowUpLevel | null) ?? null,
      aiBriefApproved: session.aiBriefApproved,
    },
    dossier,
  };
}

/**
 * Lưu notes sau buổi tư vấn — HÀNH ĐỘNG QUAN TRỌNG NHẤT của module này.
 *
 * Thứ tự cố ý: ghi notes TRƯỚC, đẩy override vào engine SAU. Nếu làm ngược lại
 * mà bước ghi notes lỗi thì lộ trình đã đổi trong khi không ai biết vì sao.
 */
export async function saveSessionNotes(
  actor: Actor,
  input: {
    sessionId: string;
    teacherNotes: string;
    actionCode: TeacherAction;
    actionItems: string[];
    focusSkillIds: string[];
    followUpLevel: FollowUpLevel;
    aiBriefApproved?: boolean;
  },
): Promise<SaveNotesResult> {
  const session = await prisma.teacherSession.findUnique({
    where: { id: input.sessionId },
    include: {
      enrollment: {
        select: {
          id: true,
          status: true,
          student: { select: { user: { select: { id: true } } } },
        },
      },
    },
  });
  if (!session) throw ApiError.notFound('Không tìm thấy buổi tư vấn.');
  await assertCanAccessEnrollment(actor, session.enrollmentId);

  if (session.status === 'CANCELLED' || session.status === 'NO_SHOW') {
    throw ApiError.conflict('Buổi tư vấn đã hủy hoặc học sinh vắng mặt, không ghi nhận xét được.');
  }

  if (input.actionCode === 'CHANGE_PRIORITY' && input.focusSkillIds.length === 0) {
    throw ApiError.badRequest('Chọn đổi ưu tiên kỹ năng thì cần chọn ít nhất một kỹ năng.');
  }

  // Kỹ năng ưu tiên phải thuộc đúng cây kiến thức của học sinh này — chống việc
  // dán nhầm id từ tab khác làm engine bám vào kỹ năng không liên quan.
  if (input.focusSkillIds.length > 0) {
    const valid = await prisma.studentSkillMastery.count({
      where: { enrollmentId: session.enrollmentId, skillId: { in: input.focusSkillIds } },
    });
    if (valid !== input.focusSkillIds.length) {
      throw ApiError.badRequest('Có kỹ năng ưu tiên không thuộc lộ trình của học sinh này.');
    }
  }

  const before = {
    teacherNotes: session.teacherNotes,
    actionCode: session.actionCode,
    followUpLevel: session.followUpLevel,
    status: session.status,
  };

  const updated = await prisma.teacherSession.update({
    where: { id: session.id },
    data: {
      teacherNotes: input.teacherNotes,
      actionCode: input.actionCode,
      actionItems: input.actionItems as Prisma.InputJsonValue,
      focusSkillIds: input.focusSkillIds,
      followUpLevel: input.followUpLevel,
      aiBriefApproved: input.aiBriefApproved ?? session.aiBriefApproved,
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });

  // Đẩy quyết định của giáo viên vào engine cho chu kỳ tới. Enrollment hết hạn
  // hoặc bị treo sẽ ném lỗi ở đây — notes vẫn giữ, chỉ báo cảnh báo lên UI.
  let planUpdated = false;
  let planWarning: string | null = null;
  try {
    await applyTeacherOverride({
      enrollmentId: session.enrollmentId,
      actionCode: input.actionCode,
      focusSkillIds: input.focusSkillIds,
      actorId: actor.userId,
    });
    planUpdated = true;
  } catch (error) {
    planWarning =
      error instanceof ApiError
        ? error.message
        : 'Đã lưu nhận xét nhưng chưa cập nhật được lộ trình, vui lòng thử lại sau.';
    console.error('[teacher] không áp được override lộ trình', error);
  }

  await queueNotification({
    userId: session.enrollment.student.user.id,
    templateCode: TEMPLATE_CODES.TEACHER_NOTES_READY,
    data: {
      actionLabel: ACTION_LABEL[input.actionCode],
      actionItems: input.actionItems,
    },
    dedupeKey: `${TEMPLATE_CODES.TEACHER_NOTES_READY}:${session.id}`,
  }).catch((error) => console.error('[teacher] không gửi được thông báo nhận xét', error));

  await writeAudit({
    actorId: actor.userId,
    action: AUDIT_ACTIONS.TEACHER_NOTES,
    entityType: 'TeacherSession',
    entityId: session.id,
    before,
    after: {
      actionCode: input.actionCode,
      followUpLevel: input.followUpLevel,
      focusSkillIds: input.focusSkillIds,
      planUpdated,
    },
  });

  return {
    sessionId: updated.id,
    status: updated.status,
    planUpdated,
    planWarning,
  };
}

/** Đánh dấu buổi bị hủy hoặc học sinh vắng mặt. */
export async function closeSession(
  actor: Actor,
  input: { sessionId: string; status: Extract<SessionStatus, 'CANCELLED' | 'NO_SHOW'>; reason?: string },
): Promise<TeacherSessionRow[]> {
  const session = await prisma.teacherSession.findUnique({
    where: { id: input.sessionId },
    select: { id: true, enrollmentId: true, status: true, teacherNotes: true },
  });
  if (!session) throw ApiError.notFound('Không tìm thấy buổi tư vấn.');
  await assertCanAccessEnrollment(actor, session.enrollmentId);

  if (session.status === 'COMPLETED') {
    throw ApiError.conflict('Buổi tư vấn đã hoàn thành, không đổi trạng thái được nữa.');
  }

  await prisma.teacherSession.update({
    where: { id: session.id },
    data: {
      status: input.status,
      completedAt: new Date(),
      teacherNotes: input.reason ? `[${input.status}] ${input.reason}` : session.teacherNotes,
    },
  });

  await writeAudit({
    actorId: actor.userId,
    action: AUDIT_ACTIONS.TEACHER_NOTES,
    entityType: 'TeacherSession',
    entityId: session.id,
    before: { status: session.status },
    after: { status: input.status, reason: input.reason ?? null },
  });

  return listSessions(actor, { enrollmentId: session.enrollmentId });
}

// ---------------------------------------------------------------------------
// 4. Phân công & tải giáo viên (admin)
// ---------------------------------------------------------------------------

export async function assignTeacher(input: {
  enrollmentId: string;
  teacherId: string;
  actorId: string;
}): Promise<void> {
  const [enrollment, teacher] = await Promise.all([
    prisma.enrollment.findUnique({
      where: { id: input.enrollmentId },
      select: { id: true, course: { select: { subject: true } } },
    }),
    prisma.teacherProfile.findUnique({
      where: { id: input.teacherId },
      select: { id: true, active: true, subjects: true, capacityPerCycle: true },
    }),
  ]);
  if (!enrollment) throw ApiError.notFound('Không tìm thấy học sinh này.');
  if (!teacher) throw ApiError.notFound('Không tìm thấy hồ sơ giáo viên.');
  if (!teacher.active) throw ApiError.badRequest('Giáo viên này đang ngừng nhận lớp.');

  // Phân công sai môn thì brief và nhận xét đều mất giá trị chuyên môn.
  if (teacher.subjects.length > 0 && !teacher.subjects.includes(enrollment.course.subject)) {
    throw ApiError.badRequest(
      `Giáo viên này không phụ trách môn ${SUBJECT_LABEL[enrollment.course.subject]}.`,
    );
  }

  const load = await prisma.teacherAssignment.count({
    where: { teacherId: teacher.id, active: true },
  });
  if (load >= teacher.capacityPerCycle) {
    throw ApiError.conflict(
      `Giáo viên đã nhận đủ ${teacher.capacityPerCycle} học sinh cho chu kỳ này.`,
    );
  }

  const existing = await prisma.teacherAssignment.findUnique({
    where: { enrollmentId: input.enrollmentId },
    select: { id: true, teacherId: true },
  });

  await prisma.teacherAssignment.upsert({
    where: { enrollmentId: input.enrollmentId },
    create: { enrollmentId: input.enrollmentId, teacherId: teacher.id, active: true },
    update: { teacherId: teacher.id, active: true, assignedAt: new Date() },
  });

  await writeAudit({
    actorId: input.actorId,
    action: AUDIT_ACTIONS.TEACHER_ASSIGN,
    entityType: 'Enrollment',
    entityId: input.enrollmentId,
    before: { teacherId: existing?.teacherId ?? null },
    after: { teacherId: teacher.id },
  });
}

export async function getTeacherWorkload(): Promise<TeacherWorkloadRow[]> {
  const profiles = await prisma.teacherProfile.findMany({
    include: {
      user: { select: { id: true, fullName: true, email: true } },
      _count: { select: { assignments: { where: { active: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const now = new Date();
  const rows = await Promise.all(
    profiles.map(async (profile) => {
      const [upcoming, withoutNotes] = await Promise.all([
        prisma.teacherSession.count({
          where: { teacherId: profile.id, status: 'SCHEDULED', scheduledAt: { gte: now } },
        }),
        // Buổi đã qua giờ hẹn mà chưa có nhận xét — đây là chỉ số vận hành quan
        // trọng nhất, vì không có notes thì chu kỳ sau engine không nhận override.
        prisma.teacherSession.count({
          where: {
            teacherId: profile.id,
            status: 'SCHEDULED',
            scheduledAt: { lt: now },
            OR: [{ teacherNotes: null }, { teacherNotes: '' }],
          },
        }),
      ]);

      const activeStudents = profile._count.assignments;
      return {
        teacherId: profile.id,
        userId: profile.user.id,
        fullName: profile.user.fullName,
        email: profile.user.email,
        active: profile.active,
        capacityPerCycle: profile.capacityPerCycle,
        activeStudents,
        upcomingSessions: upcoming,
        sessionsWithoutNotes: withoutNotes,
        utilization:
          profile.capacityPerCycle > 0
            ? Math.round((activeStudents / profile.capacityPerCycle) * 100) / 100
            : 0,
      };
    }),
  );

  return rows;
}

export type { Actor as TeacherActor };
