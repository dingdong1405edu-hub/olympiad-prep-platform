'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import { Alert, Button, Card } from '@/components/ui';

/**
 * Nút mô phỏng "cổng thanh toán đã báo thành công", chỉ dùng khi gateway = MANUAL.
 * Khi tích hợp cổng thật, phần này biến mất và webhook của cổng sẽ kích hoạt.
 */
export function ConfirmMockPayment({ orderCode }: { orderCode: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiPost<{ enrollmentId: string }>(API.confirmMockPayment, { orderCode });
      router.push(routes.onboarding(result.enrollmentId));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xác nhận được thanh toán.');
      setSubmitting(false);
    }
  }

  return (
    <Card className="border border-dashed border-ink-200 bg-ink-50/50">
      <p className="text-sm font-medium text-ink-700">Môi trường phát triển</p>
      <p className="mt-1 text-sm text-ink-600">
        Hệ thống đang dùng cổng thanh toán giả lập. Bấm nút bên dưới để mô phỏng việc cổng báo
        thanh toán thành công.
      </p>
      {error ? (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}
      <Button className="mt-4" variant="secondary" onClick={confirm} disabled={submitting}>
        {submitting ? 'Đang xác nhận…' : 'Xác nhận đã thanh toán'}
      </Button>
    </Card>
  );
}
