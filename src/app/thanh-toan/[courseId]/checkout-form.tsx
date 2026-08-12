'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import type { CheckoutPreview, CreateCheckoutResult, PaymentSession } from '@/server/commerce/service';
import { Alert, Button, Card, Input, Label } from '@/components/ui';
import { PaymentQrOverlay } from '@/components/payment-qr';
import { formatVnd } from '@/lib/domain';

export function CheckoutForm({
  courseId,
  initialPreview,
}: {
  courseId: string;
  initialPreview: CheckoutPreview;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState(initialPreview);
  const [couponCode, setCouponCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Có giá trị = đang mở màn hình quét mã QR chồng lên trang này. */
  const [paymentSession, setPaymentSession] = useState<PaymentSession | null>(null);

  async function applyCoupon() {
    setError(null);
    setCheckingCoupon(true);
    try {
      const next = await apiPost<CheckoutPreview>(API.checkoutPreview, {
        courseId,
        couponCode: couponCode.trim() || undefined,
      });
      setPreview(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không kiểm tra được mã giảm giá.');
    } finally {
      setCheckingCoupon(false);
    }
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiPost<CreateCheckoutResult>(API.checkout, {
        courseId,
        couponCode: couponCode.trim() || undefined,
      });

      if (result.activatedImmediately && result.enrollmentId) {
        router.push(routes.onboarding(result.enrollmentId));
        return;
      }

      // Cổng vẽ QR tại chỗ: mở luôn màn hình quét mã, KHÔNG rời khỏi trang này.
      // Đây là điểm khác biệt chính so với luồng chuyển hướng của cổng cũ.
      if (result.session) {
        setPaymentSession(result.session);
        setSubmitting(false);
        return;
      }

      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      router.push(routes.checkoutResult(result.orderCode));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được đơn hàng.');
      setSubmitting(false);
    }
  }

  return (
    <>
      {paymentSession ? (
        <PaymentQrOverlay session={paymentSession} onClose={() => setPaymentSession(null)} />
      ) : null}

      <Card>
        {error ? (
          <Alert tone="danger" className="mb-4">
            {error}
          </Alert>
        ) : null}

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-500">Học phí</dt>
            <dd className="font-medium text-ink-800 tabular-nums">{formatVnd(preview.price)}</dd>
          </div>
          {preview.discount > 0 ? (
            <div className="flex justify-between">
              <dt className="text-ink-500">Giảm giá</dt>
              <dd className="font-medium text-emerald-700 tabular-nums">
                −{formatVnd(preview.discount)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-ink-100 pt-2">
            <dt className="font-semibold text-ink-700">Tổng thanh toán</dt>
            <dd className="text-lg font-bold text-ink-900 tabular-nums">{formatVnd(preview.total)}</dd>
          </div>
        </dl>

        <p className="mt-2 text-xs text-ink-500">
          Quyền truy cập {preview.accessDurationDays} ngày, đến {preview.accessUntilLabel}.
        </p>

        <div className="mt-5">
          <Label htmlFor="coupon">Mã giảm giá</Label>
          <div className="flex gap-2">
            <Input
              id="coupon"
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
              placeholder="Nhập mã nếu có"
            />
            <Button type="button" variant="secondary" onClick={applyCoupon} disabled={checkingCoupon}>
              {checkingCoupon ? 'Đang kiểm tra…' : 'Áp dụng'}
            </Button>
          </div>
          {preview.couponError ? (
            <p className="mt-1.5 text-sm text-rose-600">{preview.couponError}</p>
          ) : null}
          {preview.couponCode && !preview.couponError ? (
            <p className="mt-1.5 text-sm text-emerald-700">Đã áp dụng mã {preview.couponCode}.</p>
          ) : null}
        </div>

        <Button className="mt-6 w-full" size="lg" onClick={submit} loading={submitting}>
          {preview.total === 0 ? 'Kích hoạt khóa học' : 'Thanh toán bằng mã QR'}
        </Button>

        {preview.total > 0 ? (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-500">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 2 4 5.5v6c0 4.6 3.2 8.9 8 10.5 4.8-1.6 8-5.9 8-10.5v-6L12 2Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Mã QR hiện ngay tại đây — bạn không rời khỏi trang này
          </p>
        ) : null}

        <p className="mt-3 text-xs text-ink-500">
          Sau khi kích hoạt, bạn sẽ làm bài kiểm tra đầu vào 15 câu để hệ thống dựng lộ trình riêng.
        </p>
      </Card>
    </>
  );
}
