import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTeacher, hasRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getMasteryMap, getTopErrorPatterns } from '@/server/student-model/service';
import { getPlanProgress } from '@/server/plan/service';
import { listAttempts } from '@/server/assessment/service';
import { formatDateTimeVN, formatDateVN } from '@/lib/dates';
import { GRADE_BAND_LABEL, LEVEL_LABEL, MASTERY_TIER_LABEL, SUBJECT_LABEL } from '@/lib/domain';
import { routes } from '@/lib/routes';
import { Badge, Card, CardHeader, PageHeader, StatTile, Table, Td, Tr, TIER_TONE } from '@/components/ui';
import { MasteryBars, TierSummary, type TierCount } from '@/components/charts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Hồ sơ học sinh' };

export default async function TeacherStudentPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;
  const session = await requireTeacher();

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      student: { include: { user: { select: { fullName: true, email: true } } } },
      course: { include: { program: { select: { name: true, code: true } } } },
      teacherAssignment: { include: { teacher: { select: { userId: true } } } },
      goals: { where: { active: true }, take: 1, orderBy: { createdAt: 'desc' } },
      teacherSessions: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });

  if (!enrollment) notFound();

  // PHÂN QUYỀN NGHIÊM (specs §10.5): giáo viên chỉ xem học sinh được phân công.
  // Quản lý chương trình và super admin được xem tất cả để hỗ trợ vận hành.
  const isAssigned = enrollment.teacherAssignment?.teacher.userId === session.id;
  const isOverseer = hasRole(session, 'SUPER_ADMIN', 'PROGRAM_MANAGER');
  if (!isAssigned && !isOverseer) notFound();

  const [map, errors, progress, attempts] = await Promise.all([
    getMasteryMap(enrollmentId),
    getTopErrorPatterns(enrollmentId, 5),
    getPlanProgress(enrollmentId).catch(() => null),
    listAttempts(enrollmentId),
  ]);

  const allSkills = map.chapters.flatMap((chapter) => chapter.skills);
  const tierCounts: TierCount[] = (['STRONG', 'OK', 'NEEDS_WORK', 'GAP'] as const).map((tier) => ({
    tier,
    count: allSkills.filter((skill) => skill.tier === tier).length,
  }));
  const goal = enrollment.goals[0];

  return (
    <div>
      <PageHeader
        eyebrow={`${enrollment.course.program.name} · ${SUBJECT_LABEL[enrollment.course.subject]}`}
        title={enrollment.student.user.fullName}
        subtitle={`Lớp ${enrollment.student.actualGrade} · ${GRADE_BAND_LABEL[enrollment.course.gradeBand]}${
          enrollment.student.school ? ` · ${enrollment.student.school}` : ''
        }`}
        action={
          <Link href={routes.teacherHome()} className="link-underline text-sm font-medium text-brand-700">
            ← Về danh sách
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Mức hiện tại"
          value={enrollment.estimatedLevel ? LEVEL_LABEL[enrollment.estimatedLevel] : 'Chưa đo'}
          hint={enrollment.selfDeclaredLevel ? `tự khai: ${LEVEL_LABEL[enrollment.selfDeclaredLevel]}` : undefined}
        />
        <StatTile label="Mastery trung bình" value={`${Math.round(map.overall)}/100`} />
        <StatTile
          label="Hoàn thành lộ trình"
          value={progress ? `${Math.round(progress.completionRate * 100)}%` : '—'}
          hint={progress ? `${progress.completedDays}/${progress.totalDays} ngày` : undefined}
        />
        <StatTile
          label="Mục tiêu"
          value={goal ? LEVEL_LABEL[goal.targetLevel] : 'Chưa đặt'}
          hint={goal ? `hạn ${formatDateVN(goal.deadline)}` : undefined}
          tone={goal?.feasibility === 'INFEASIBLE' ? 'danger' : undefined}
        />
      </div>

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-bold text-ink-900">Bản đồ năng lực</h2>
        <TierSummary counts={tierCounts} />
        <Card className="mt-4">
          <MasteryBars
            data={map.chapters.map((chapter) => ({
              id: chapter.chapterId,
              label: chapter.chapterName,
              value: chapter.averageMastery,
              sublabel: MASTERY_TIER_LABEL[chapter.tier],
            }))}
            target={60}
            limit={10}
            caption="Mười phần cần chú ý nhất."
          />
        </Card>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Lỗi hay lặp lại" subtitle="Dùng để hỏi đúng nguyên nhân trong buổi tư vấn." />
          {errors.length === 0 ? (
            <p className="text-sm text-ink-500">Chưa đủ dữ liệu để kết luận kiểu lỗi.</p>
          ) : (
            <ul className="space-y-2">
              {errors.map((item) => (
                <li key={item.pattern} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink-700">{item.label}</span>
                  <Badge tone="warn">{item.count} lần</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Điểm mạnh và điểm yếu nhất" />
          {map.strongest ? (
            <div className="mb-3">
              <p className="text-xs text-ink-500">Mạnh nhất</p>
              <p className="font-medium text-ink-800">{map.strongest.skillName}</p>
              <Badge tone={TIER_TONE[map.strongest.tier]}>
                {Math.round(map.strongest.masteryScore)}/100
              </Badge>
            </div>
          ) : null}
          {map.weakest ? (
            <div>
              <p className="text-xs text-ink-500">Yếu nhất</p>
              <p className="font-medium text-ink-800">{map.weakest.skillName}</p>
              <Badge tone={TIER_TONE[map.weakest.tier]}>
                {Math.round(map.weakest.masteryScore)}/100
              </Badge>
            </div>
          ) : null}
        </Card>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold text-ink-900">Lịch sử bài kiểm tra</h2>
        {attempts.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-500">Học sinh chưa làm bài kiểm tra nào.</p>
          </Card>
        ) : (
          <Table head={['Bài', 'Thời điểm', 'Điểm', 'Mức', 'Tiến bộ']}>
            {attempts.map((attempt) => (
              <Tr key={attempt.attemptId}>
                <Td className="text-ink-700">{attempt.typeLabel}</Td>
                <Td className="whitespace-nowrap text-ink-500">
                  {attempt.submittedAt ? formatDateTimeVN(attempt.submittedAt) : 'Đang làm'}
                </Td>
                <Td className="tabular-nums">
                  {attempt.rawScore}/{attempt.maxScore}
                </Td>
                <Td>{attempt.estimatedLevelLabel ?? '—'}</Td>
                <Td className="tabular-nums">
                  {attempt.averageDelta === null
                    ? '—'
                    : `${attempt.averageDelta >= 0 ? '+' : ''}${Math.round(attempt.averageDelta)}`}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>

      {enrollment.teacherSessions.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-bold text-ink-900">Buổi tư vấn</h2>
          <div className="space-y-3">
            {enrollment.teacherSessions.map((item) => (
              <Card key={item.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink-800">
                      Chu kỳ {item.cycleNo} ·{' '}
                      {item.scheduledAt ? formatDateTimeVN(item.scheduledAt) : 'chưa hẹn giờ'}
                    </p>
                    {item.teacherNotes ? (
                      <p className="mt-1 line-clamp-2 text-sm text-ink-600">{item.teacherNotes}</p>
                    ) : (
                      <p className="mt-1 text-sm text-amber-700">Chưa ghi nhận xét</p>
                    )}
                  </div>
                  <Link
                    href={routes.teacherSession(item.id)}
                    className="press rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    Mở buổi tư vấn
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
