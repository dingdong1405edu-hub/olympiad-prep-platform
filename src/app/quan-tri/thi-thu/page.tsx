import { requireRole } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { aiStatus, listAttemptsForStaff } from '@/server/mock-exam/service';
import { PageHeader } from '@/components/ui';
import { MockAttemptTable } from '@/components/mock-attempt-table';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Bài thi thử đã nộp' };

/**
 * Danh sách bài thi thử đã nộp.
 *
 * Cột "cần xem lại" là cột quan trọng nhất: nó gom đúng những bài mà AI tự khai
 * là mình không chắc, để người chấm tay mở đúng bài cần mở thay vì đọc lần lượt.
 */
export default async function AdminMockExamsPage() {
  await requireRole('SUPER_ADMIN', 'OPS_ADMIN', 'PROGRAM_MANAGER', 'REVIEWER');

  const attempts = await listAttemptsForStaff();
  const ai = aiStatus();

  return (
    <>
      <PageHeader
        eyebrow="Thi thử chấm bằng AI"
        title="Bài đã nộp"
        subtitle={`Đang dùng: ${ai.label}${ai.live ? ` · ${ai.model}` : ''}`}
      />
      <MockAttemptTable attempts={attempts} hrefFor={routes.adminMockAttempt} />
    </>
  );
}
