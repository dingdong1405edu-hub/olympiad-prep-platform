import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { getAttemptForStudent } from '@/server/assessment/service';
import { routes } from '@/lib/routes';
import { AttemptPlayer } from './attempt-player';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Đang làm bài' };

export default async function AttemptPage({
  params,
}: {
  params: Promise<{ enrollmentId: string; attemptId: string }>;
}) {
  const { enrollmentId, attemptId } = await params;
  const session = await requireSession();

  // Service tự kiểm tra bài này có thuộc về học sinh đang đăng nhập hay không,
  // và không bao giờ trả kèm đáp án hay lời giải khi bài chưa nộp.
  const attempt = await getAttemptForStudent(attemptId, session.id);

  if (attempt.status !== 'IN_PROGRESS') {
    redirect(routes.attemptResult(enrollmentId, attemptId));
  }

  return <AttemptPlayer enrollmentId={enrollmentId} attempt={attempt} />;
}
