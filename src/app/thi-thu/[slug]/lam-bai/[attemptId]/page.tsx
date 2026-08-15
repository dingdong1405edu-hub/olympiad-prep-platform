import { notFound, redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ApiError } from '@/lib/http';
import { routes } from '@/lib/routes';
import { getSitting } from '@/server/mock-exam/service';
import { ExamPlayer } from '../../exam-player';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Đang làm bài thi thử' };

/**
 * MÀN HÌNH LÀM BÀI của một lượt thi cụ thể.
 *
 * URL mang id lượt thi nên mỗi lần thi là một trang khác nhau — đây là thứ chặn
 * đứng chuyện bài của lượt trước hiện lại ở lượt sau.
 *
 * Đề vẫn được lấy Ở MÁY CHỦ rồi truyền thẳng xuống: mở trang là thấy đề ngay,
 * và không có cơ hội đọc đáp án qua tab Network vì service đã bóc sạch.
 */
export default async function MockExamSittingPage({
  params,
}: {
  params: Promise<{ slug: string; attemptId: string }>;
}) {
  const { slug, attemptId } = await params;
  const session = await requireSession();

  try {
    const sitting = await getSitting(attemptId, session.id);
    return <ExamPlayer sitting={sitting} />;
  } catch (error) {
    if (error instanceof ApiError) {
      // Đã nộp rồi thì đưa thẳng sang trang kết quả thay vì báo lỗi cụt lủn.
      if (error.status === 400) redirect(routes.mockExamResult(slug, attemptId));
      if (error.status === 403) redirect(routes.mockExam(slug));
      if (error.status === 404) notFound();
    }
    throw error;
  }
}
