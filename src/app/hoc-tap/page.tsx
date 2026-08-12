import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { listEnrollmentsForUser } from '@/server/commerce/service';
import { routes } from '@/lib/routes';
import { AppShell } from '@/components/shell';
import { Alert, Badge, Card, EmptyState, LinkButton, PageHeader, ProgressBar } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Khóa học của tôi' };

export default async function MyCoursesPage() {
  const session = await requireSession();
  const enrollments = await listEnrollmentsForUser(session.id);

  return (
    <AppShell user={{ id: session.id, fullName: session.fullName, roles: session.roles }}>
      <PageHeader
        title="Khóa học của tôi"
        subtitle="Chọn khóa để xem lộ trình hôm nay."
        action={
          <LinkButton href={routes.home()} variant="secondary" size="sm">
            Xem thêm kỳ thi
          </LinkButton>
        }
      />

      {enrollments.length === 0 ? (
        <EmptyState
          title="Bạn chưa ghi danh khóa nào"
          description="Chọn kỳ thi bạn dự thi, sau đó làm bài kiểm tra đầu vào 15 câu để hệ thống dựng lộ trình riêng."
          action={<LinkButton href={routes.home()}>Chọn kỳ thi</LinkButton>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {enrollments.map((enrollment) => {
            const needsOnboarding = enrollment.onboardedAt === null;
            return (
              <Card key={enrollment.id} className="flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">
                        {enrollment.course.programName}
                      </p>
                      <h2 className="mt-0.5 font-semibold text-ink-900">
                        {enrollment.course.subjectLabel} · {enrollment.course.gradeBandLabel}
                      </h2>
                    </div>
                    <Badge tone={enrollment.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {enrollment.statusLabel}
                    </Badge>
                  </div>

                  {enrollment.estimatedLevelLabel ? (
                    <p className="mt-3 text-sm text-ink-600">
                      Mức hiện tại: <strong>{enrollment.estimatedLevelLabel}</strong>
                    </p>
                  ) : null}

                  {!needsOnboarding ? (
                    <div className="mt-4">
                      <div className="mb-1.5 flex items-baseline justify-between text-sm">
                        <span className="text-ink-500">Tiến độ lộ trình</span>
                        <span className="font-medium text-ink-700 tabular-nums">
                          {Math.round(enrollment.progress.completionRate * 100)}%
                        </span>
                      </div>
                      <ProgressBar value={enrollment.progress.completionRate * 100} />
                      <p className="mt-1.5 text-xs text-ink-500">
                        {enrollment.progress.completedPlanDays}/{enrollment.progress.totalPlanDays} ngày học
                        đã hoàn thành
                      </p>
                    </div>
                  ) : null}

                  {enrollment.expiringSoon ? (
                    <Alert tone="warn" className="mt-4">
                      Quyền truy cập còn {enrollment.daysLeft} ngày (đến {enrollment.expiresAtLabel}).
                    </Alert>
                  ) : null}
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className="text-xs text-ink-500">
                    Hết hạn {enrollment.expiresAtLabel}
                  </span>
                  <LinkButton
                    href={
                      needsOnboarding
                        ? routes.onboarding(enrollment.id)
                        : routes.studyDashboard(enrollment.id)
                    }
                    size="sm"
                  >
                    {needsOnboarding ? 'Bắt đầu' : 'Vào học'}
                  </LinkButton>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-sm text-ink-500">
        <Link href={routes.account()} className="hover:text-brand-700">
          Quản lý tài khoản và hóa đơn →
        </Link>
      </p>
    </AppShell>
  );
}
