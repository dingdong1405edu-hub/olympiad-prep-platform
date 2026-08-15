import { requireTeacher } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { aiStatus, listAttemptsForStaff } from '@/server/mock-exam/service';
import { PageHeader } from '@/components/ui';
import { MockAttemptTable } from '@/components/mock-attempt-table';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Chấm bài thi thử' };

/**
 * Khu chấm bài của giáo viên.
 *
 * Vì sao có bản riêng thay vì cho giáo viên vào /quan-tri: khu quản trị chỉ mở
 * cho nhóm quản trị và nhóm học liệu (middleware + layout đều chặn). Chấm bài
 * là việc của giáo viên, nên nó phải nằm trong khu giáo viên — cùng một bảng,
 * cùng một màn hình chấm, chỉ khác cửa vào.
 */
export default async function TeacherMockExamsPage() {
  await requireTeacher();

  const attempts = await listAttemptsForStaff();
  const ai = aiStatus();

  return (
    <>
      <PageHeader
        eyebrow="Thi thử chấm bằng AI"
        title="Bài học sinh đã nộp"
        subtitle={`Đang dùng: ${ai.label}${ai.live ? ` · ${ai.model}` : ''}`}
      />
      <MockAttemptTable attempts={attempts} hrefFor={routes.teacherMockAttempt} />
    </>
  );
}
