'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import { Alert, Button } from '@/components/ui';

export function StartDiagnostic({ enrollmentId }: { enrollmentId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function start() {
    setError(null);
    setSubmitting(true);
    try {
      // API tự trả lại bài đang dở nếu có, nên bấm nhiều lần cũng không tạo bài mới.
      const result = await apiPost<{ attemptId: string }>(API.diagnosticStart(enrollmentId), {});
      router.push(routes.assessmentPlayer(enrollmentId, result.attemptId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không bắt đầu được bài kiểm tra.');
      setSubmitting(false);
    }
  }

  return (
    <div>
      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}
      <Button size="lg" className="w-full" onClick={start} loading={submitting}>
        {submitting ? 'Đang chuẩn bị đề…' : 'Bắt đầu làm bài'}
      </Button>
    </div>
  );
}
