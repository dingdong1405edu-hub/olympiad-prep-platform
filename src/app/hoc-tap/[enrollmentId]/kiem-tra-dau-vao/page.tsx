import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { getEnrollmentForUser } from '@/server/commerce/service';
import { getAssessmentStatus } from '@/server/assessment/service';
import { getConfig } from '@/lib/config';
import { routes } from '@/lib/routes';
import { Card, PageHeader } from '@/components/ui';
import { StartDiagnostic } from './start-diagnostic';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Kiểm tra đầu vào' };

export default async function DiagnosticIntroPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;
  const session = await requireSession();
  const enrollment = await getEnrollmentForUser(session.id, enrollmentId);

  // Chưa tự khai mức thì quay lại bước khởi động — engine cần mốc này để chọn vùng độ khó.
  if (!enrollment.onboardedAt) redirect(routes.onboarding(enrollmentId));

  const [status, config] = await Promise.all([getAssessmentStatus(enrollmentId), getConfig()]);

  // Đã nộp rồi → xem kết quả. Đang dở → vào làm tiếp.
  if (status.hasDiagnostic && status.diagnosticAttemptId) {
    redirect(routes.attemptResult(enrollmentId, status.diagnosticAttemptId));
  }

  const soCau = config.assessment.diagnosticItemCount;
  const phut = Math.round((soCau * 80) / 60);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow={`${enrollment.course.programName} · ${enrollment.course.subjectLabel}`}
        title="Bài kiểm tra đầu vào"
        subtitle="Bước duy nhất cần làm trước khi hệ thống dựng lộ trình riêng cho em."
      />

      <Card className="animate-fade-up">
        <ul className="space-y-3.5 text-sm text-ink-700">
          <li className="flex gap-3">
            <span aria-hidden className="text-lg">
              📝
            </span>
            <span>
              <strong>{soCau} câu</strong>, chọn theo đúng cấu trúc đề của{' '}
              {enrollment.course.programName} — không phải câu ngẫu nhiên.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="text-lg">
              ⏱️
            </span>
            <span>
              Khoảng <strong>{phut} phút</strong>. Không bị tính giờ gắt gao, em cứ làm kỹ.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="text-lg">
              💾
            </span>
            <span>
              Bài được <strong>lưu tự động</strong>. Nếu em thoát giữa chừng hay mất mạng, vào lại
              vẫn tiếp tục đúng chỗ đang làm.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="text-lg">
              🎯
            </span>
            <span>
              Làm hết sức mình. Câu nào không biết cứ bỏ qua — hệ thống cần biết đúng chỗ em còn
              yếu để giao bài cho trúng.
            </span>
          </li>
        </ul>

        <div className="mt-7">
          <StartDiagnostic enrollmentId={enrollmentId} />
        </div>
      </Card>
    </div>
  );
}
