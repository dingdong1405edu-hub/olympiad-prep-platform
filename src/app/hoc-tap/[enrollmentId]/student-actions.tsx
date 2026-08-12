'use client';

/**
 * Ba nút cần JavaScript của khu học sinh: bắt đầu bài kiểm tra tiến bộ, dàn lại
 * lịch sau khi bỏ lỡ, tạo lộ trình khi đã có mục tiêu nhưng chưa có lịch.
 *
 * Toàn bộ nghiệp vụ nằm ở module (assessment / plan) — ở đây chỉ gọi API và
 * hiển thị đúng thông điệp máy chủ trả về.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API, routes } from '@/lib/routes';
import { ApiClientError, apiPost } from '@/lib/client';
import { Alert, Button } from '@/components/ui';

type Variant = 'primary' | 'secondary';
type Size = 'sm' | 'md' | 'lg';

function readableError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return 'Có lỗi xảy ra, bạn thử lại giúp nhé.';
}

// ---------------------------------------------------------------------------

export function StartProgressAssessmentButton({
  enrollmentId,
  label = 'Làm bài kiểm tra tiến bộ',
  variant = 'primary',
  size = 'md',
}: {
  enrollmentId: string;
  label?: string;
  variant?: Variant;
  size?: Size;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      // Service tự trả lại bài đang dở thay vì tạo bài mới, nên bấm nhiều lần
      // cũng không mất bài (specs §19.2).
      const attempt = await apiPost<{ attemptId: string }>(API.progressStart(enrollmentId));
      router.push(routes.assessmentPlayer(enrollmentId, attempt.attemptId));
    } catch (caught) {
      setError(readableError(caught));
      setBusy(false);
    }
  }

  return (
    <div>
      <Button type="button" variant={variant} size={size} disabled={busy} onClick={start}>
        {busy ? 'Đang mở bài…' : label}
      </Button>
      {error ? (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function RescheduleButton({
  enrollmentId,
  label = 'Sắp xếp lại lịch',
}: {
  enrollmentId: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reschedule(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiPost<{ movedDays: number; message: string }>(
        API.reschedule(enrollmentId),
        { reason: 'Học sinh yêu cầu sắp xếp lại lịch' },
      );
      setMessage(result.message);
      router.refresh();
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={reschedule}>
        {busy ? 'Đang sắp xếp…' : label}
      </Button>
      {message ? (
        <Alert tone="success" className="mt-3">
          {message}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function GeneratePlanButton({ enrollmentId }: { enrollmentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function generate(): Promise<void> {
    setBusy(true);
    setError(null);
    setWarnings([]);
    try {
      const result = await apiPost<{ planId: string; days: number; warnings: string[] }>(
        API.plan(enrollmentId),
        { reason: 'Học sinh yêu cầu tạo lộ trình mới' },
      );
      setWarnings(result.warnings);
      router.refresh();
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button type="button" disabled={busy} onClick={generate}>
        {busy ? 'Đang tạo lộ trình…' : 'Tạo lộ trình cho tôi'}
      </Button>
      {warnings.length > 0 ? (
        <Alert tone="warn" title="Vài điều bạn nên biết" className="mt-3">
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
