'use client';

import { useState } from 'react';
import type { PaymentSession } from '@/server/commerce/service';
import { PaymentQrPanel, PaymentQrOverlay } from '@/components/payment-qr';
import { cx } from '@/components/ui';

/**
 * Bật qua lại giữa hai chỗ panel thanh toán được dùng thật:
 *  - "Trên trang"  → giống /thanh-toan/ket-qua/[orderCode]
 *  - "Lớp phủ"     → giống lúc bấm nút mua ở /thanh-toan/[courseId]
 *
 * Thu hẹp khung lại được để soi cách bố cục đổ về một cột trên điện thoại mà
 * không cần mở DevTools.
 */
const WIDTHS = [
  { key: 'phone', label: 'Điện thoại', width: 390 },
  { key: 'tablet', label: 'Máy tính bảng', width: 760 },
  { key: 'full', label: 'Toàn màn hình', width: null },
] as const;

export function PreviewSwitcher({ session }: { session: PaymentSession }) {
  const [overlay, setOverlay] = useState(false);
  const [width, setWidth] = useState<(typeof WIDTHS)[number]['key']>('full');

  const active = WIDTHS.find((entry) => entry.key === width) ?? WIDTHS[2];

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 bg-white px-4 py-2.5">
        <p className="text-sm font-semibold text-ink-900">Xem thử màn hình thanh toán</p>

        <div className="flex gap-1 rounded-lg bg-ink-50 p-1 ring-1 ring-ink-100">
          {WIDTHS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setWidth(entry.key)}
              className={cx(
                'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                width === entry.key ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setOverlay((value) => !value)}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white"
        >
          {overlay ? 'Đóng lớp phủ' : 'Mở kiểu lớp phủ'}
        </button>

        <p className="text-xs text-ink-500">
          Cuộn thử phần giữa — số tiền, đồng hồ và nút hủy phải đứng yên.
        </p>
      </div>

      <div className="px-4 py-6">
        <div
          className="mx-auto"
          style={active.width ? { maxWidth: active.width } : { maxWidth: '48rem' }}
        >
          <PaymentQrPanel initialSession={session} className="max-h-[calc(100dvh-10rem)]" />
        </div>
      </div>

      {overlay ? <PaymentQrOverlay session={session} onClose={() => setOverlay(false)} /> : null}
    </div>
  );
}
