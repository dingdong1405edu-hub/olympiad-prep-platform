/**
 * Bảng "bài thi thử đã nộp" — dùng chung cho khu giáo viên và khu quản trị.
 *
 * Hai khu vực cần đúng một bảng này nhưng đường dẫn mở bài khác nhau, nên đường
 * dẫn được truyền vào chứ không viết cứng. Không dùng hook để cả hai bên đều
 * import được từ Server Component.
 */
import Link from 'next/link';
import { formatDateTimeVN } from '@/lib/dates';
import { Badge, EmptyState, Table, Td, Tr } from '@/components/ui';

export interface MockAttemptRow {
  id: string;
  examTitle: string;
  studentName: string;
  submittedAt: string | null;
  score: number;
  totalPoints: number;
  status: string;
  needsReviewCount: number;
}

const STATUS_LABEL: Record<string, { label: string; tone: 'success' | 'warn' | 'danger' }> = {
  DONE: { label: 'Đã chấm xong', tone: 'success' },
  GRADING: { label: 'Đang chấm', tone: 'warn' },
  PARTIAL_FAILED: { label: 'Có câu chấm hỏng', tone: 'danger' },
};

export function MockAttemptTable({
  attempts,
  hrefFor,
}: {
  attempts: MockAttemptRow[];
  hrefFor: (attemptId: string) => string;
}) {
  if (attempts.length === 0) {
    return (
      <EmptyState
        icon="📝"
        title="Chưa có ai nộp bài thi thử"
        description="Bài nộp từ trang /thi-thu sẽ hiện ở đây, kể cả bài của khách chưa đăng nhập."
      />
    );
  }

  return (
    <Table head={['Học sinh', 'Đề', 'Nộp lúc', 'Điểm', 'Trạng thái', 'Cần xem lại', '']}>
      {attempts.map((attempt) => {
        const status = STATUS_LABEL[attempt.status] ?? { label: attempt.status, tone: 'warn' as const };
        return (
          <Tr key={attempt.id}>
            <Td className="font-medium text-ink-900">{attempt.studentName}</Td>
            <Td>{attempt.examTitle}</Td>
            <Td className="whitespace-nowrap">
              {attempt.submittedAt ? formatDateTimeVN(new Date(attempt.submittedAt)) : '—'}
            </Td>
            <Td className="font-semibold tabular-nums">
              {attempt.score}/{attempt.totalPoints}
            </Td>
            <Td>
              <Badge tone={status.tone}>{status.label}</Badge>
            </Td>
            <Td>
              {attempt.needsReviewCount > 0 ? (
                <Badge tone="warn">⚠ {attempt.needsReviewCount} câu</Badge>
              ) : (
                <span className="text-ink-400">—</span>
              )}
            </Td>
            <Td>
              <Link href={hrefFor(attempt.id)} className="font-medium text-brand-700 hover:underline">
                Mở bài
              </Link>
            </Td>
          </Tr>
        );
      })}
    </Table>
  );
}
