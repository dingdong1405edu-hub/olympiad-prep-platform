import { requireSession } from '@/lib/auth';
import { getEnrollmentForUser } from '@/server/commerce/service';
import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';
import { formatDateTimeVN } from '@/lib/dates';
import { TEACHER_ACTION_LABEL } from '@/lib/domain';
import { Alert, Badge, Card, EmptyState, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Buổi tư vấn' };

const STATUS_TONE = {
  SCHEDULED: 'info',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  NO_SHOW: 'warn',
} as const;

const STATUS_LABEL = {
  SCHEDULED: 'Đã lên lịch',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã hủy',
  NO_SHOW: 'Vắng mặt',
} as const;

export default async function TeacherSessionsPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;
  const session = await requireSession();
  await getEnrollmentForUser(session.id, enrollmentId);

  const [sessions, config] = await Promise.all([
    prisma.teacherSession.findMany({
      where: { enrollmentId },
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
      include: { teacher: { include: { user: { select: { fullName: true } } } } },
    }),
    getConfig(),
  ]);

  return (
    <div>
      <PageHeader
        title="Buổi tư vấn với giáo viên"
        subtitle={`Sau mỗi lần kiểm tra tiến bộ, em có ${config.teacher.sessionMinutes} phút trao đổi riêng với thầy cô.`}
      />

      {sessions.length === 0 ? (
        <EmptyState
          icon="🧑‍🏫"
          title="Chưa có buổi tư vấn nào"
          description={`Buổi tư vấn sẽ tự được tạo sau khi em hoàn thành bài kiểm tra tiến bộ mỗi ${config.assessment.cycleDays} ngày.`}
        />
      ) : (
        <div className="space-y-4">
          {sessions.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                    <span className="text-xs text-ink-400">Chu kỳ {item.cycleNo}</span>
                  </div>
                  <p className="mt-2 font-semibold text-ink-900">
                    {item.scheduledAt ? formatDateTimeVN(item.scheduledAt) : 'Chưa hẹn giờ'}
                  </p>
                  <p className="text-sm text-ink-500">
                    {item.teacher?.user.fullName
                      ? `Giáo viên: ${item.teacher.user.fullName}`
                      : 'Chưa phân công giáo viên'}
                    {' · '}
                    {item.durationMinutes} phút
                  </p>
                </div>

                {item.meetingLink && item.status === 'SCHEDULED' ? (
                  <a
                    href={item.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="press rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-brand-700"
                  >
                    Vào phòng họp
                  </a>
                ) : null}
              </div>

              {item.teacherNotes ? (
                <div className="mt-4 border-t border-ink-100 pt-4">
                  <p className="mb-1.5 text-sm font-semibold text-ink-700">Thầy cô nhận xét</p>
                  <p className="stem-content text-sm text-ink-600">{item.teacherNotes}</p>
                </div>
              ) : null}

              {Array.isArray(item.actionItems) && item.actionItems.length > 0 ? (
                <div className="mt-4">
                  <p className="mb-1.5 text-sm font-semibold text-ink-700">
                    Việc cần làm 2 tuần tới
                  </p>
                  <ul className="space-y-1.5">
                    {(item.actionItems as string[]).map((action, index) => (
                      <li key={index} className="flex gap-2.5 text-sm text-ink-600">
                        <span aria-hidden className="text-brand-600">
                          ✓
                        </span>
                        {action}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {item.actionCode ? (
                <Alert tone="info" className="mt-4">
                  Sau buổi này, lộ trình của em đã được điều chỉnh:{' '}
                  <strong>{TEACHER_ACTION_LABEL[item.actionCode]}</strong>.
                </Alert>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
