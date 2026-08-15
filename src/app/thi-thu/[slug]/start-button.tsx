'use client';

/**
 * Nút bắt đầu lượt thi.
 *
 * Chỉ có đúng một việc: gọi máy chủ mở lượt rồi đưa sang màn hình làm bài. Việc
 * mở lượt phải do MÁY CHỦ làm chứ không phải chỉ đổi URL — máy chủ mới là nơi
 * chốt giờ bắt đầu, đếm quota, và tạo chỗ trống để ghi bài làm.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, ApiClientError } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import { Alert, Button } from '@/components/ui';

export function StartExamButton({
  slug,
  resuming,
  durationMin,
}: {
  slug: string;
  resuming: boolean;
  durationMin: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const reply = await apiPost<{ attemptId: string; resumed: boolean }>(API.mockStart(slug));
      router.push(routes.mockExamSitting(slug, reply.attemptId));
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Không mở được lượt thi.');
      setBusy(false);
    }
  }

  return (
    <>
      {error ? (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}
      <Button className="mt-4 w-full" size="lg" loading={busy} onClick={() => void start()}>
        {resuming ? 'Vào làm tiếp' : 'Bắt đầu làm bài'}
      </Button>
      {!resuming ? (
        <p className="mt-2 text-center text-xs text-ink-500">
          Bấm là đồng hồ {durationMin} phút bắt đầu chạy
        </p>
      ) : null}
    </>
  );
}
