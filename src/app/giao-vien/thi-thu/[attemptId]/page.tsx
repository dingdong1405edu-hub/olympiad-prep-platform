import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTeacher } from '@/lib/auth';
import { ApiError } from '@/lib/http';
import { routes } from '@/lib/routes';
import { getAttemptResult } from '@/server/mock-exam/service';
import { getResultAdvice } from '@/server/mock-exam/advice';
import { PageHeader } from '@/components/ui';
import { ResultView } from '@/app/thi-thu/[slug]/ket-qua/[attemptId]/result-view';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Chấm bài thi thử' };

export default async function TeacherMockAttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const session = await requireTeacher();
  const { attemptId } = await params;

  try {
    const result = await getAttemptResult(attemptId, session);
    const advice = await getResultAdvice(result, session);
    return (
      <>
        <PageHeader
          eyebrow={result.examTitle}
          title="Chấm lại và sửa điểm"
          subtitle="Sửa điểm câu nào thì tổng điểm cập nhật ngay; mọi lần sửa đều ghi vào nhật ký."
          action={
            <Link
              href={routes.teacherMockExams()}
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              ← Về danh sách
            </Link>
          }
        />
        <ResultView result={result} advice={advice} />
      </>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}
