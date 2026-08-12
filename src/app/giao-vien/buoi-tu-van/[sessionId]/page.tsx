import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTeacher, hasRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getMasteryMap, getTopErrorPatterns } from '@/server/student-model/service';
import { getPlanProgress } from '@/server/plan/service';
import { listAttempts } from '@/server/assessment/service';
import { generateTeacherBrief } from '@/server/ai/service';
import { getConfig } from '@/lib/config';
import { formatDateTimeVN } from '@/lib/dates';
import { LEVEL_LABEL, MASTERY_TIER_LABEL, SUBJECT_LABEL } from '@/lib/domain';
import { routes } from '@/lib/routes';
import { Card, CardHeader, PageHeader, StatTile } from '@/components/ui';
import { MasteryBars } from '@/components/charts';
import { SessionNotes } from './session-notes';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Buổi tư vấn' };

/**
 * Màn hình buổi tư vấn 20 phút — nơi con người đóng vòng lặp của hệ thống.
 * Bố cục xếp theo thứ tự đọc trong buổi: bức tranh tổng quan trước, chi tiết
 * sau, ô ghi chú và quyết định điều chỉnh lộ trình ở cuối.
 */
export default async function TeacherSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await requireTeacher();

  const record = await prisma.teacherSession.findUnique({
    where: { id: sessionId },
    include: {
      teacher: { select: { userId: true } },
      enrollment: {
        include: {
          student: { include: { user: { select: { fullName: true } } } },
          course: { include: { program: { select: { name: true } } } },
          goals: { where: { active: true }, take: 1, orderBy: { createdAt: 'desc' } },
        },
      },
    },
  });

  if (!record) notFound();

  const isAssigned = record.teacher?.userId === session.id;
  const isOverseer = hasRole(session, 'SUPER_ADMIN', 'PROGRAM_MANAGER');
  if (!isAssigned && !isOverseer) notFound();

  const enrollmentId = record.enrollmentId;
  const [map, errors, progress, attempts, brief, config] = await Promise.all([
    getMasteryMap(enrollmentId),
    getTopErrorPatterns(enrollmentId, 5),
    getPlanProgress(enrollmentId).catch(() => null),
    listAttempts(enrollmentId),
    generateTeacherBrief(sessionId).catch(() => null),
    getConfig(),
  ]);

  const studentName = record.enrollment.student.user.fullName;
  const goal = record.enrollment.goals[0];
  const latest = attempts.find((a) => a.submittedAt);
  const locked = record.status === 'CANCELLED' || record.status === 'NO_SHOW';

  return (
    <div>
      <PageHeader
        eyebrow={`${record.enrollment.course.program.name} · ${SUBJECT_LABEL[record.enrollment.course.subject]}`}
        title={`Buổi tư vấn ${config.teacher.sessionMinutes} phút — ${studentName}`}
        subtitle={
          record.scheduledAt
            ? `Chu kỳ ${record.cycleNo} · ${formatDateTimeVN(record.scheduledAt)}`
            : `Chu kỳ ${record.cycleNo} · chưa hẹn giờ`
        }
        action={
          <Link
            href={routes.teacherStudent(enrollmentId)}
            className="link-underline text-sm font-medium text-brand-700"
          >
            Xem hồ sơ đầy đủ →
          </Link>
        }
      />

      {/* 1. Overview + 2. Performance */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Mức hiện tại"
          value={record.enrollment.estimatedLevel ? LEVEL_LABEL[record.enrollment.estimatedLevel] : 'Chưa đo'}
        />
        <StatTile label="Mastery trung bình" value={`${Math.round(map.overall)}/100`} />
        <StatTile
          label="Bài gần nhất"
          value={latest ? `${latest.rawScore}/${latest.maxScore}` : '—'}
          trend={latest?.averageDelta ?? undefined}
        />
        <StatTile
          label="Hoàn thành lộ trình"
          value={progress ? `${Math.round(progress.completionRate * 100)}%` : '—'}
          hint={goal ? `mục tiêu ${LEVEL_LABEL[goal.targetLevel]}` : 'chưa đặt mục tiêu'}
          tone={goal?.feasibility === 'INFEASIBLE' ? 'danger' : undefined}
        />
      </div>

      {/* 3. Mastery Map */}
      <Card className="mb-4">
        <CardHeader title="Bản đồ năng lực" subtitle="Sáu phần cần chú ý nhất." />
        <MasteryBars
          data={map.chapters.map((chapter) => ({
            id: chapter.chapterId,
            label: chapter.chapterName,
            value: chapter.averageMastery,
            sublabel: MASTERY_TIER_LABEL[chapter.tier],
          }))}
          target={60}
          limit={6}
        />
      </Card>

      {/* 4. Error Patterns + 5. Engagement */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Lỗi hay lặp lại" />
          {errors.length === 0 ? (
            <p className="text-sm text-ink-500">Chưa đủ dữ liệu.</p>
          ) : (
            <ul className="space-y-2">
              {errors.map((item) => (
                <li key={item.pattern} className="flex justify-between gap-3 text-sm">
                  <span className="text-ink-700">{item.label}</span>
                  <span className="font-semibold text-ink-800 tabular-nums">{item.count} lần</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Mức độ chuyên cần" />
          {progress ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Ngày học đã hoàn thành</dt>
                <dd className="font-medium tabular-nums">
                  {progress.completedDays}/{progress.totalDays}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Số phút đã học</dt>
                <dd className="font-medium tabular-nums">{progress.minutesStudied}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Số câu đã làm</dt>
                <dd className="font-medium tabular-nums">{progress.itemsAnswered}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Tỷ lệ đúng</dt>
                <dd className="font-medium tabular-nums">{Math.round(progress.accuracy * 100)}%</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-ink-500">Học sinh chưa có lộ trình.</p>
          )}
        </Card>
      </div>

      {/* 6. AI Recommendation + 7. Teacher Notes */}
      <SessionNotes
        sessionId={sessionId}
        studentName={studentName}
        brief={brief}
        skills={map.chapters
          .flatMap((chapter) =>
            chapter.skills.map((skill) => ({
              id: skill.skillId,
              name: skill.skillName,
              chapterName: chapter.chapterName,
              masteryScore: skill.masteryScore,
              tierLabel: skill.tierLabel,
            })),
          )
          .sort((a, b) => a.masteryScore - b.masteryScore)
          .slice(0, 30)}
        initial={{
          teacherNotes: record.teacherNotes ?? '',
          actionCode: record.actionCode,
          actionItems: Array.isArray(record.actionItems) ? (record.actionItems as string[]) : [],
          focusSkillIds: record.focusSkillIds,
          followUpLevel: (record.followUpLevel as 'NORMAL' | 'WATCH' | 'ESCALATE' | null) ?? null,
          aiBriefApproved: record.aiBriefApproved,
        }}
        locked={locked}
      />
    </div>
  );
}
