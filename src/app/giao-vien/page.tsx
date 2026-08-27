import Link from 'next/link';
import type { GoalFeasibility, Prisma, StudentLevel } from '@prisma/client';
import { hasRole, requireTeacher } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';
import { routes } from '@/lib/routes';
import { GRADE_BAND_LABEL, LEVEL_LABEL, SUBJECT_LABEL } from '@/lib/domain';
import { addDays, daysUntil, formatDateTimeVN, vnToday, vnWeekday } from '@/lib/dates';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  StatTile,
} from '@/components/ui';
import { StudentsTable, type AttentionLevel, type StudentRow } from './students-table';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Học sinh của tôi' };

/**
 * Trần số học sinh nạp một lần. Một giáo viên chỉ phụ trách vài chục em mỗi chu
 * kỳ; trần này chỉ để quản lý chương trình mở dashboard toàn hệ thống không kéo
 * về nghìn bản ghi.
 */
const MAX_ROWS = 200;

/** Số thẻ cảnh báo hiển thị ngay; phần còn lại nằm trong bảng phía dưới. */
const MAX_ALERT_CARDS = 8;

const FEASIBILITY_LABEL: Record<GoalFeasibility, string> = {
  FEASIBLE: 'Khả thi',
  TIGHT: 'Hơi căng',
  INFEASIBLE: 'Chưa khả thi',
};

type AlertKind =
  | 'MASTERY_DROP'
  | 'INACTIVE'
  | 'ASSESSMENT_OVERDUE'
  | 'GOAL_INFEASIBLE'
  | 'GOAL_TIGHT'
  | 'REPEATED_WRONG'
  | 'NO_DIAGNOSTIC';

const ALERT_META: Record<AlertKind, { icon: string; title: string; severity: AttentionLevel }> = {
  MASTERY_DROP: { icon: '📉', title: 'Mastery đang đi xuống', severity: 'HIGH' },
  INACTIVE: { icon: '🌙', title: 'Đã lâu không học', severity: 'HIGH' },
  ASSESSMENT_OVERDUE: { icon: '⏰', title: 'Bài kiểm tra quá hạn', severity: 'HIGH' },
  GOAL_INFEASIBLE: { icon: '🎯', title: 'Mục tiêu chưa khả thi', severity: 'HIGH' },
  GOAL_TIGHT: { icon: '🎯', title: 'Mục tiêu hơi căng', severity: 'MEDIUM' },
  REPEATED_WRONG: { icon: '🔁', title: 'Sai lặp một kỹ năng', severity: 'MEDIUM' },
  NO_DIAGNOSTIC: { icon: '🧭', title: 'Chưa làm bài đầu vào', severity: 'MEDIUM' },
};

interface StudentAlert {
  kind: AlertKind;
  enrollmentId: string;
  studentName: string;
  detail: string;
}

function levelLabel(level: StudentLevel | null, labels: Record<StudentLevel, string>): string {
  if (!level) return 'Chưa xác định';
  return labels[level] ?? LEVEL_LABEL[level];
}

/** Mốc thứ hai của tuần theo lịch Việt Nam. */
function startOfWeek(today: Date): Date {
  const weekday = vnWeekday(today); // 0 = Chủ nhật
  return addDays(today, -((weekday + 6) % 7));
}

function describeLastActive(days: number | null): string {
  if (days === null) return 'Chưa làm bài nào';
  if (days <= 0) return 'Hôm nay';
  if (days === 1) return 'Hôm qua';
  return `${days} ngày trước`;
}

export default async function TeacherDashboardPage() {
  const session = await requireTeacher();
  const config = await getConfig();

  // Quản lý chương trình / Super Admin xem được toàn bộ; giáo viên CHỈ xem học
  // sinh được phân công (specs §10.5).
  const supervisor = hasRole(session, 'SUPER_ADMIN', 'PROGRAM_MANAGER');
  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.id },
    select: { id: true, capacityPerCycle: true, active: true },
  });

  if (!profile && !supervisor) {
    return (
      <>
        <PageHeader title="Học sinh của tôi" />
        <EmptyState
          icon="👋"
          title="Tài khoản chưa được tạo hồ sơ giáo viên"
          description="Bộ phận vận hành cần tạo hồ sơ và phân công học sinh trước khi khu vực này có dữ liệu. Thầy cô báo lại với quản lý chương trình giúp nhé."
        />
      </>
    );
  }

  const where: Prisma.EnrollmentWhereInput = profile
    ? { teacherAssignment: { is: { teacherId: profile.id, active: true } } }
    : { status: 'ACTIVE' };

  const today = vnToday();
  const now = new Date();
  const alerts = config.teacher.alerts;
  const cycleWindowStart = addDays(today, -Math.max(1, config.assessment.cycleDays));
  const snapshotWindowStart = addDays(now, -120);

  const enrollments = await prisma.enrollment.findMany({
    where,
    take: MAX_ROWS,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      onboardedAt: true,
      estimatedLevel: true,
      student: {
        select: {
          actualGrade: true,
          gradeBand: true,
          user: { select: { fullName: true } },
        },
      },
      course: {
        select: {
          subject: true,
          gradeBand: true,
          program: { select: { code: true, name: true } },
        },
      },
      goals: {
        where: { active: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { targetLevel: true, deadline: true, feasibility: true },
      },
      plans: {
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { cycleNo: true, days: { select: { status: true } } },
      },
      assessmentAttempts: {
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 1,
        select: { submittedAt: true },
      },
      teacherSessions: {
        where: { status: 'SCHEDULED' },
        orderBy: { scheduledAt: 'asc' },
        take: 1,
        select: { id: true, scheduledAt: true },
      },
    },
  });

  const ids = enrollments.map((entry) => entry.id);

  // Các số liệu còn lại gom thành truy vấn theo lô — dashboard không được nạp
  // dữ liệu theo vòng lặp từng học sinh.
  const [masteryAverages, lastActivity, wrongRows, snapshots, sessionsThisWeek] = ids.length
    ? await Promise.all([
        prisma.studentSkillMastery.groupBy({
          by: ['enrollmentId'],
          where: { enrollmentId: { in: ids }, attemptCount: { gt: 0 } },
          _avg: { masteryScore: true },
        }),
        prisma.itemAttempt.groupBy({
          by: ['enrollmentId'],
          where: { enrollmentId: { in: ids } },
          _max: { createdAt: true },
        }),
        prisma.itemAttempt.findMany({
          where: {
            enrollmentId: { in: ids },
            isCorrect: false,
            createdAt: { gte: cycleWindowStart },
          },
          select: {
            enrollmentId: true,
            item: { select: { skillId: true, skill: { select: { name: true } } } },
          },
        }),
        prisma.masterySnapshot.findMany({
          where: { enrollmentId: { in: ids }, capturedAt: { gte: snapshotWindowStart } },
          orderBy: { capturedAt: 'desc' },
          select: { enrollmentId: true, skillId: true, masteryScore: true, capturedAt: true },
        }),
        prisma.teacherSession.count({
          where: {
            enrollmentId: { in: ids },
            status: 'SCHEDULED',
            scheduledAt: { gte: startOfWeek(today), lt: addDays(startOfWeek(today), 7) },
          },
        }),
      ])
    : [[], [], [], [], 0];

  const averageBySkillCount = new Map(
    masteryAverages.map((row) => [row.enrollmentId, row._avg.masteryScore ?? 0]),
  );
  const lastActiveAt = new Map(
    lastActivity.map((row) => [row.enrollmentId, row._max.createdAt ?? null]),
  );

  // Kỹ năng bị sai nhiều nhất trong chu kỳ, theo từng học sinh.
  const worstSkill = new Map<string, { name: string; count: number }>();
  const wrongTally = new Map<string, Map<string, { name: string; count: number }>>();
  for (const row of wrongRows) {
    const bySkill = wrongTally.get(row.enrollmentId) ?? new Map();
    const current = bySkill.get(row.item.skillId) ?? { name: row.item.skill.name, count: 0 };
    current.count += 1;
    bySkill.set(row.item.skillId, current);
    wrongTally.set(row.enrollmentId, bySkill);
  }
  for (const [enrollmentId, bySkill] of wrongTally) {
    const worst = [...bySkill.values()].sort((a, b) => b.count - a.count)[0];
    if (worst) worstSkill.set(enrollmentId, worst);
  }

  /**
   * Chênh lệch mastery giữa hai lần chụp hồ sơ gần nhất, đối chiếu THEO KỸ NĂNG
   * để không bị lệch khi số kỹ năng đã đo thay đổi giữa hai mốc.
   */
  const masteryDelta = new Map<string, number>();
  const byEnrollment = new Map<string, typeof snapshots>();
  for (const row of snapshots) {
    const list = byEnrollment.get(row.enrollmentId) ?? [];
    list.push(row);
    byEnrollment.set(row.enrollmentId, list);
  }
  for (const [enrollmentId, rows] of byEnrollment) {
    const times = [...new Set(rows.map((row) => row.capturedAt.getTime()))].sort((a, b) => b - a);
    if (times.length < 2) continue;
    const [afterAt, beforeAt] = times;
    const before = new Map(
      rows.filter((row) => row.capturedAt.getTime() === beforeAt).map((row) => [row.skillId, row.masteryScore]),
    );
    const after = rows.filter((row) => row.capturedAt.getTime() === afterAt);
    let sum = 0;
    let count = 0;
    for (const row of after) {
      const previous = before.get(row.skillId);
      if (previous === undefined) continue;
      sum += row.masteryScore - previous;
      count += 1;
    }
    if (count > 0) masteryDelta.set(enrollmentId, sum / count);
  }

  // --- Dựng dòng bảng + danh sách cảnh báo ---
  const rows: StudentRow[] = [];
  const alertList: StudentAlert[] = [];

  for (const entry of enrollments) {
    const studentName = entry.student.user.fullName;
    const goal = entry.goals[0] ?? null;
    const plan = entry.plans[0] ?? null;
    const days = plan?.days ?? [];
    const completedDays = days.filter((day) => day.status === 'COMPLETED').length;
    const completionRate = days.length > 0 ? (completedDays / days.length) * 100 : 0;

    const lastAt = lastActiveAt.get(entry.id) ?? null;
    const inactiveDays = lastAt ? Math.max(0, -daysUntil(lastAt)) : null;

    const delta = masteryDelta.get(entry.id) ?? null;
    const lastSubmittedAt = entry.assessmentAttempts[0]?.submittedAt ?? null;

    // Hạn kiểm tra tiến bộ = lần nộp gần nhất + chu kỳ + thời gian ân hạn (specs §10.3).
    const graceUntil = lastSubmittedAt
      ? addDays(
          addDays(lastSubmittedAt, config.assessment.cycleDays),
          config.assessment.gracePeriodDays,
        )
      : null;
    const assessmentOverdue = graceUntil !== null && now.getTime() > graceUntil.getTime();

    const kinds: AlertKind[] = [];
    const push = (kind: AlertKind, detail: string) => {
      kinds.push(kind);
      alertList.push({ kind, enrollmentId: entry.id, studentName, detail });
    };

    if (delta !== null && delta <= -Math.abs(alerts.masteryDropPoints)) {
      push('MASTERY_DROP', `Giảm ${Math.round(Math.abs(delta))} điểm so với lần đo trước.`);
    }
    if (inactiveDays !== null && inactiveDays >= alerts.inactiveDays) {
      push('INACTIVE', `${inactiveDays} ngày chưa làm bài nào (ngưỡng ${alerts.inactiveDays} ngày).`);
    }
    if (assessmentOverdue) {
      push('ASSESSMENT_OVERDUE', 'Bài kiểm tra tiến bộ đã qua cả thời gian ân hạn.');
    }
    if (goal?.feasibility === 'INFEASIBLE') {
      push(
        'GOAL_INFEASIBLE',
        `Mục tiêu ${levelLabel(goal.targetLevel, config.levels.labels)} khó đạt với quỹ thời gian hiện tại.`,
      );
    } else if (goal?.feasibility === 'TIGHT') {
      push(
        'GOAL_TIGHT',
        `Mục tiêu ${levelLabel(goal.targetLevel, config.levels.labels)} còn ${Math.max(0, daysUntil(goal.deadline))} ngày, cần bám sát.`,
      );
    }
    const worst = worstSkill.get(entry.id);
    if (worst && worst.count >= alerts.repeatedWrongSameSkill) {
      push('REPEATED_WRONG', `Sai ${worst.count} câu ở kỹ năng “${worst.name}” trong chu kỳ này.`);
    }
    if (entry.onboardedAt === null && lastSubmittedAt === null) {
      push('NO_DIAGNOSTIC', 'Đã kích hoạt khóa nhưng chưa làm bài kiểm tra đầu vào.');
    }

    const attention: AttentionLevel = kinds.some((kind) => ALERT_META[kind].severity === 'HIGH')
      ? 'HIGH'
      : kinds.length > 0
        ? 'MEDIUM'
        : 'NONE';

    const nextSession = entry.teacherSessions[0] ?? null;

    rows.push({
      enrollmentId: entry.id,
      studentName,
      gradeLabel: `Lớp ${entry.student.actualGrade} · ${GRADE_BAND_LABEL[entry.student.gradeBand]}`,
      programName: entry.course.program.name,
      programCode: entry.course.program.code,
      subjectLabel: SUBJECT_LABEL[entry.course.subject],
      levelLabel: levelLabel(entry.estimatedLevel, config.levels.labels),
      targetLevelLabel: goal ? levelLabel(goal.targetLevel, config.levels.labels) : null,
      completionRate,
      masteryAverage: averageBySkillCount.get(entry.id) ?? 0,
      masteryDelta: delta,
      inactiveDays,
      lastActiveLabel: describeLastActive(inactiveDays),
      attention,
      alertLabels: kinds.map((kind) => ALERT_META[kind].title),
      nextSessionAtMs: nextSession?.scheduledAt?.getTime() ?? null,
      nextSessionLabel: nextSession?.scheduledAt
        ? formatDateTimeVN(nextSession.scheduledAt)
        : null,
      cycleNo: plan?.cycleNo ?? 1,
    });
  }

  const needAttention = rows.filter((row) => row.attention !== 'NONE').length;
  const averageCompletion =
    rows.length > 0
      ? Math.round(rows.reduce((sum, row) => sum + row.completionRate, 0) / rows.length)
      : 0;

  const severityOrder: Record<AttentionLevel, number> = { HIGH: 0, MEDIUM: 1, NONE: 2 };
  const sortedAlerts = [...alertList].sort(
    (a, b) =>
      severityOrder[ALERT_META[a.kind].severity] - severityOrder[ALERT_META[b.kind].severity] ||
      a.studentName.localeCompare(b.studentName, 'vi'),
  );

  return (
    <>
      <PageHeader
        eyebrow="Khu vực giáo viên"
        title="Học sinh của tôi"
        subtitle={`Xin chào ${session.fullName}. Danh sách xếp theo mức cần chú ý, ai cần thầy cô trước thì nằm trên.`}
        action={
          profile ? (
            <Badge tone="neutral">
              Sức chứa mỗi chu kỳ: {profile.capacityPerCycle} học sinh
            </Badge>
          ) : (
            <Badge tone="info">Đang xem toàn hệ thống</Badge>
          )
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon="🧑‍🏫"
          title="Chưa có học sinh nào được phân công"
          description="Khi bộ phận vận hành phân công học sinh, danh sách và các thẻ cảnh báo sẽ tự hiện ở đây."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Học sinh phụ trách"
              value={rows.length}
              icon={<span aria-hidden>👥</span>}
              hint={
                profile
                  ? `${Math.max(0, profile.capacityPerCycle - rows.length)} suất còn trống`
                  : 'Toàn bộ học sinh đang hoạt động'
              }
            />
            <StatTile
              label="Cần chú ý"
              value={needAttention}
              icon={<span aria-hidden>⚠️</span>}
              tone={needAttention === 0 ? 'success' : needAttention > rows.length / 3 ? 'danger' : 'warn'}
              hint={needAttention === 0 ? 'Không có cảnh báo nào' : `${sortedAlerts.length} cảnh báo đang mở`}
            />
            <StatTile
              label="Buổi tư vấn tuần này"
              value={sessionsThisWeek}
              icon={<span aria-hidden>🗓️</span>}
              hint={`Mỗi buổi ${config.teacher.sessionMinutes} phút`}
            />
            <StatTile
              label="Hoàn thành lộ trình"
              value={`${averageCompletion}%`}
              icon={<span aria-hidden>📈</span>}
              tone={averageCompletion >= 70 ? 'success' : averageCompletion >= 40 ? 'warn' : 'danger'}
              hint="Trung bình của cả lớp phụ trách"
            />
          </div>

          <section className="mt-8">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-ink-900">Cần thầy cô xem trước</h2>
                <p className="mt-0.5 text-sm text-ink-500">
                  Bấm vào một thẻ để mở hồ sơ học sinh và xem chi tiết.
                </p>
              </div>
              {sortedAlerts.length > MAX_ALERT_CARDS ? (
                <span className="text-sm text-ink-500 tabular-nums">
                  {MAX_ALERT_CARDS}/{sortedAlerts.length} cảnh báo
                </span>
              ) : null}
            </div>

            {sortedAlerts.length === 0 ? (
              <Alert tone="success" title="Cả lớp đang đi đúng nhịp">
                Không có cảnh báo nào trong chu kỳ này. Thầy cô có thể dùng buổi tư vấn để nâng độ
                khó cho các em đã vững.
              </Alert>
            ) : (
              <ul className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {sortedAlerts.slice(0, MAX_ALERT_CARDS).map((alert, index) => {
                  const meta = ALERT_META[alert.kind];
                  return (
                    <li key={`${alert.enrollmentId}-${alert.kind}-${index}`}>
                      <Link
                        href={routes.teacherStudent(alert.enrollmentId)}
                        className="hover-lift press block h-full rounded-xl bg-white p-4 ring-1 ring-ink-100 shadow-[0_1px_3px_rgb(120_70_45/0.05)] transition-shadow"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            aria-hidden
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-lg"
                          >
                            {meta.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-ink-900">{alert.studentName}</span>
                              <Badge tone={meta.severity === 'HIGH' ? 'danger' : 'warn'} dot>
                                {meta.title}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-ink-600">{alert.detail}</p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="mt-8">
            <div className="mb-3">
              <h2 className="text-lg font-bold text-ink-900">Toàn bộ học sinh</h2>
              <p className="mt-0.5 text-sm text-ink-500">
                Sắp mặc định theo mức cần chú ý, rồi tới buổi tư vấn gần nhất.
              </p>
            </div>
            <StudentsTable rows={rows} />
          </section>

          {enrollments.length >= MAX_ROWS ? (
            <Alert tone="info" className="mt-6">
              Đang hiển thị {MAX_ROWS} học sinh gần nhất. Dùng màn hình quản trị nếu cần xem toàn bộ.
            </Alert>
          ) : null}
        </>
      )}

      <Card className="mt-8">
        <CardHeader
          title="Buổi tư vấn 20 phút dùng để làm gì"
          subtitle="Nhắc nhanh trước khi thầy cô vào buổi (specs §10.4)."
          icon={<span aria-hidden>💬</span>}
        />
        <ul className="grid gap-2 text-sm text-ink-600 sm:grid-cols-2">
          <li>Giải thích những chỗ hệ thống phát hiện nhưng học sinh chưa hiểu.</li>
          <li>Tìm nguyên nhân thật: kiến thức, chiến thuật, đọc đề hay tâm lý thời gian.</li>
          <li>Chỉnh mục tiêu nếu đang quá cao hoặc quá thấp.</li>
          <li>Chốt 1–3 khuyến nghị cho 2 tuần tới — hệ thống sẽ làm theo.</li>
        </ul>
        <div className="mt-4">
          <LinkButton href={routes.adminTeachers()} variant="ghost" size="sm">
            Xem lịch và tải công việc →
          </LinkButton>
        </div>
      </Card>
    </>
  );
}
