import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { getEnrollmentForUser } from '@/server/commerce/service';
import { getAssessmentStatus, listAttempts } from '@/server/assessment/service';
import { formatDateTimeVN } from '@/lib/dates';
import { formatMinutes } from '@/lib/domain';
import { routes } from '@/lib/routes';
import { Alert, Badge, EmptyState, LinkButton, PageHeader, Table, Td, Tr } from '@/components/ui';
import { StartProgressAssessmentButton } from '../student-actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Bài kiểm tra' };

export default async function AssessmentsPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;
  const session = await requireSession();
  await getEnrollmentForUser(session.id, enrollmentId);

  const [attempts, status] = await Promise.all([
    listAttempts(enrollmentId),
    getAssessmentStatus(enrollmentId),
  ]);

  return (
    <div>
      <PageHeader
        title="Bài kiểm tra của em"
        subtitle="Mỗi 2 tuần một lần đo tiến bộ, có câu neo để so với lần trước."
        action={
          status.isDue || status.isOverdue ? (
            <StartProgressAssessmentButton enrollmentId={enrollmentId} />
          ) : null
        }
      />

      <Alert tone={status.isOverdue ? 'warn' : 'info'} className="mb-6">
        {status.message}
      </Alert>

      {attempts.length === 0 ? (
        <EmptyState
          icon="📝"
          title="Em chưa làm bài kiểm tra nào"
          description="Bắt đầu bằng bài kiểm tra đầu vào 15 câu để hệ thống dựng lộ trình riêng."
          action={<LinkButton href={routes.diagnostic(enrollmentId)}>Làm bài đầu vào</LinkButton>}
        />
      ) : (
        <Table head={['Bài', 'Thời điểm', 'Điểm', 'Mức ước tính', 'Tiến bộ', '']}>
          {attempts.map((attempt) => (
            <Tr key={attempt.attemptId}>
              <Td>
                <span className="font-medium text-ink-800">{attempt.typeLabel}</span>
                {attempt.cycleNo > 0 ? (
                  <span className="ml-1 text-xs text-ink-400">chu kỳ {attempt.cycleNo}</span>
                ) : null}
              </Td>
              <Td className="whitespace-nowrap text-ink-500">
                {attempt.submittedAt ? formatDateTimeVN(attempt.submittedAt) : 'Đang làm dở'}
              </Td>
              <Td className="tabular-nums">
                {attempt.submittedAt ? (
                  <>
                    <strong>{attempt.rawScore}</strong>/{attempt.maxScore}
                    <span className="ml-1.5 text-xs text-ink-400">
                      {formatMinutes(Math.round(attempt.totalTimeMs / 60000))}
                    </span>
                  </>
                ) : (
                  '—'
                )}
              </Td>
              <Td>
                {attempt.estimatedLevelLabel ? (
                  <Badge tone="brand">{attempt.estimatedLevelLabel}</Badge>
                ) : (
                  '—'
                )}
              </Td>
              <Td className="tabular-nums">
                {attempt.averageDelta === null ? (
                  <span className="text-ink-400">—</span>
                ) : (
                  <span
                    className={
                      attempt.averageDelta >= 0 ? 'font-semibold text-accent-700' : 'font-semibold text-rose-600'
                    }
                  >
                    {attempt.averageDelta >= 0 ? '+' : ''}
                    {Math.round(attempt.averageDelta)}
                  </span>
                )}
              </Td>
              <Td>
                {attempt.submittedAt ? (
                  <Link
                    href={routes.attemptResult(enrollmentId, attempt.attemptId)}
                    className="link-underline text-sm font-medium text-brand-700"
                  >
                    Xem báo cáo
                  </Link>
                ) : (
                  <Link
                    href={routes.assessmentPlayer(enrollmentId, attempt.attemptId)}
                    className="link-underline text-sm font-medium text-brand-700"
                  >
                    Làm tiếp
                  </Link>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
