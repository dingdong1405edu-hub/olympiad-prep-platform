import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ApiError } from '@/lib/http';
import { getAttemptResult } from '@/server/mock-exam/service';
import { SiteShell } from '@/components/site-shell';
import { ResultView } from './result-view';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Kết quả bài thi thử' };

/**
 * Kết quả đọc thẳng từ database ở máy chủ, không giữ trong state tạm — tải lại
 * trang bao nhiêu lần vẫn đúng chừng ấy điểm (spec §13 mục 7).
 */
export default async function MockExamResultPage({
  params,
}: {
  params: Promise<{ slug: string; attemptId: string }>;
}) {
  const { attemptId } = await params;
  const session = await getSession();

  try {
    const result = await getAttemptResult(attemptId, session);
    return (
      <SiteShell signedIn={Boolean(session)}>
        <div className="bg-ink-50 pt-24 pb-12">
          <ResultView result={result} />
        </div>
      </SiteShell>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}
