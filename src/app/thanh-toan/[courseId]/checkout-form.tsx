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
  /**
   * Ô nhập mã giảm giá mặc định ĐÓNG.
   *
   * Phần lớn người mua không có mã. Bày sẵn một ô trống ngay trên nút thanh toán
   * chỉ làm người ta khựng lại tự hỏi "mình có bỏ lỡ khuyến mãi nào không?" —
   * mở ra khi cần thì đỡ phân tâm hơn hẳn, mà ai có mã vẫn thấy đường vào.
   */
  const [couponOpen, setCouponOpen] = useState(Boolean(initialPreview.couponCode));
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

  const couponApplied = Boolean(preview.couponCode) && !preview.couponError;

  return (
    <>
      {paymentSession ? (
        <PaymentQrOverlay session={paymentSession} onClose={() => setPaymentSession(null)} />
      ) : null}

      <Card padded={false} className="overflow-hidden">
        <div className="border-b border-ink-100 bg-ink-50/60 px-5 py-2.5">
          <h2 className="text-sm font-semibold text-ink-900">Tóm tắt đơn hàng</h2>
        </div>

        <div className="p-5">
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
                <dt className="text-ink-500">
                  Giảm giá
                  {preview.couponCode ? (
                    <span className="ml-1.5 rounded bg-accent-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-accent-700">
                      {preview.couponCode}
                    </span>
                  ) : null}
                </dt>
                <dd className="font-medium text-emerald-700 tabular-nums">
                  −{formatVnd(preview.discount)}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-ink-100 pt-3">
            <span className="text-sm font-semibold text-ink-700">Tổng thanh toán</span>
            <span className="text-2xl font-bold tracking-tight text-ink-900 tabular-nums">
              {formatVnd(preview.total)}
            </span>
          </div>

          <p className="mt-1.5 text-xs text-ink-500">
            Quyền truy cập {preview.accessDurationDays} ngày, đến {preview.accessUntilLabel}.
          </p>

          {/* --- Mã giảm giá ------------------------------------------------ */}
          <div className="mt-4 border-t border-ink-100 pt-4">
            {couponOpen ? (
              <>
                <Label htmlFor="coupon">Mã giảm giá</Label>
                <div className="flex gap-2">
                  <Input
                    id="coupon"
                    value={couponCode}
                    onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                    placeholder="Nhập mã nếu có"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={applyCoupon}
                    loading={checkingCoupon}
                  >
                    Áp dụng
                  </Button>
                </div>
                {preview.couponError ? (
                  <p className="mt-1.5 text-sm text-rose-600">{preview.couponError}</p>
                ) : null}
                {couponApplied ? (
                  <p className="mt-1.5 text-sm text-emerald-700">
                    Đã áp dụng mã {preview.couponCode}.
                  </p>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setCouponOpen(true)}
                className="link-underline text-sm font-medium text-ink-500 transition-colors hover:text-brand-700"
              >
                Tôi có mã giảm giá
              </button>
            )}
          </div>

          <Button className="mt-5 w-full" size="lg" onClick={submit} loading={submitting}>
            {preview.total === 0 ? 'Kích hoạt khóa học' : 'Thanh toán bằng mã QR'}
          </Button>

          {preview.total > 0 ? (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-ink-500">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
                <path
                  d="M12 2 4 5.5v6c0 4.6 3.2 8.9 8 10.5 4.8-1.6 8-5.9 8-10.5v-6L12 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 12l2 2 4-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Mã QR hiện ngay tại đây — bạn không rời khỏi trang này
            </p>
          ) : null}
        </div>

        <p className="border-t border-ink-100 bg-ink-50/60 px-5 py-3 text-xs leading-relaxed text-ink-500">
          Sau khi kích hoạt, bạn sẽ làm bài kiểm tra đầu vào 15 câu để hệ thống dựng lộ trình riêng.
        </p>
      </Card>
    </>
  );
}
