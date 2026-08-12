import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { getEnrollmentForUser } from '@/server/commerce/service';
import { getAssessmentStatus } from '@/server/assessment/service';
import { routes } from '@/lib/routes';
import { PageHeader, Alert } from '@/components/ui';
import { OnboardingForm } from './onboarding-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Bắt đầu' };

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;
  const session = await requireSession();
  const enrollment = await getEnrollmentForUser(session.id, enrollmentId);

  // Đã làm bài đầu vào rồi thì không cần khai lại mức — vào thẳng khu học tập.
  const status = await getAssessmentStatus(enrollmentId);
  if (status.hasDiagnostic) redirect(routes.studyDashboard(enrollmentId));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow={`${enrollment.course.programName} · ${enrollment.course.subjectLabel}`}
        title="Trước khi bắt đầu, em tự thấy mình đang ở mức nào?"
        subtitle="Câu trả lời này chỉ giúp hệ thống chọn vùng độ khó cho bài kiểm tra đầu tiên."
      />

      <Alert tone="info" className="mb-6">
        Đây <strong>không phải</strong> đánh giá về em. Mức thật sự sẽ do bài kiểm tra và quá trình
        học quyết định, và được cập nhật liên tục sau mỗi câu em làm.
      </Alert>

      <OnboardingForm enrollmentId={enrollmentId} />
    </div>
  );
}
