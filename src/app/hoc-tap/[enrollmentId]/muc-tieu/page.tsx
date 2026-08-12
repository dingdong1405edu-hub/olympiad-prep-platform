import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { getConfig } from '@/lib/config';
import { getEnrollmentForUser } from '@/server/commerce/service';
import { getCurrentPlan } from '@/server/plan/service';
import { Alert, LinkButton, PageHeader } from '@/components/ui';
import { GoalBuilder } from './goal-builder';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Đặt mục tiêu học tập' };

/**
 * GOAL BUILDER (specs §9.2 màn 8, §6.1, §7.7).
 *
 * Trang chỉ nạp dữ liệu khởi tạo và kiểm tra quyền; toàn bộ việc tính phương án
 * do engine làm qua API `goal-options` — giao diện KHÔNG tự suy ra mức đích hay
 * số tuần.
 */
export default async function GoalBuilderPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;
  const session = await requireSession();

  const enrollment = await getEnrollmentForUser(session.id, enrollmentId).catch(() => null);
  if (!enrollment) redirect(routes.myCourses());

  const [config, plan] = await Promise.all([getConfig(), getCurrentPlan(enrollmentId)]);
  const currentGoal = plan?.goal ?? null;

  // Ngưỡng quỹ thời gian là THAM SỐ CẤU HÌNH, không hard-code trong giao diện.
  const minMinutes = Math.max(5, Math.round(config.recommendation.minMinutesPerDay));
  const maxMinutes = Math.max(minMinutes + 5, Math.round(config.recommendation.maxMinutesPerDay));

  return (
    <div>
      <PageHeader
        eyebrow={`${enrollment.course.programCode} · ${enrollment.course.subjectLabel}`}
        title="Bạn muốn đi tới đâu?"
        subtitle="Cho hệ thống biết bạn học được bao nhiêu mỗi tuần. Hệ thống sẽ tính ngược ra vài đích đến khả thi để bạn chọn."
        action={
          <LinkButton href={routes.studyDashboard(enrollmentId)} variant="ghost" size="sm">
            Quay lại
          </LinkButton>
        }
      />

      {currentGoal ? (
        <Alert tone="info" title="Bạn đang có một mục tiêu" className="mb-6">
          <p>
            {currentGoal.currentLevelLabel} → {currentGoal.targetLevelLabel}, mốc{' '}
            {currentGoal.deadlineLabel} ({currentGoal.daysPerWeek} buổi/tuần ·{' '}
            {currentGoal.minutesPerDay} phút/buổi). Chọn mục tiêu mới sẽ thay thế mục tiêu này và
            hệ thống dựng lại lộ trình từ hôm nay.
          </p>
        </Alert>
      ) : null}

      <GoalBuilder
        enrollmentId={enrollmentId}
        minMinutes={minMinutes}
        maxMinutes={maxMinutes}
        initialDaysPerWeek={currentGoal?.daysPerWeek ?? 5}
        initialMinutesPerDay={currentGoal?.minutesPerDay ?? Math.min(45, maxMinutes)}
      />
    </div>
  );
}
