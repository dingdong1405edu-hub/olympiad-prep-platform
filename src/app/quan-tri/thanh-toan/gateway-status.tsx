'use client';

/**
 * Bảng trạng thái cổng thanh toán cho người vận hành.
 *
 * Lý do nó tồn tại: URL webhook phải dán bằng tay vào trang quản trị của PayOS,
 * và người dán thường không phải người viết code. Bắt họ đi hỏi lập trình viên
 * hoặc mò trong file .env là cách chắc chắn để có một URL gõ sai.
 */
import { useState } from 'react';
import { Badge, Card, CardHeader, cx } from '@/components/ui';

export function GatewayStatus({
  active,
  configured,
  webhookUrl,
  rendersQrInline,
}: {
  active: string;
  /** false = cổng đang bật nhưng thiếu khóa API → sẽ báo lỗi khi có người bấm mua. */
  configured: boolean;
  webhookUrl: string;
  rendersQrInline: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard?.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1_800);
    });
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title="Cổng thanh toán"
        subtitle="Cấu hình hiện hành và địa chỉ nhận thông báo giao dịch"
        action={
          <Badge tone={configured ? 'success' : 'danger'} dot>
            {configured ? 'Sẵn sàng' : 'Thiếu cấu hình'}
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">Đang dùng</p>
          <p className="mt-1 font-semibold text-ink-900">{active}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {rendersQrInline
              ? 'Mã QR hiện ngay trên trang, khách không rời khỏi website.'
              : 'Cổng chuyển hướng hoặc kích hoạt thủ công.'}
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">Webhook URL</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-ink-50 px-2.5 py-1.5 font-mono text-xs text-ink-700">
              {webhookUrl}
            </code>
            <button
              type="button"
              onClick={copy}
              className={cx(
                'press shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
                copied ? 'bg-accent-50 text-accent-700' : 'bg-ink-100 text-ink-600 hover:bg-brand-50 hover:text-brand-700',
              )}
            >
              {copied ? 'Đã chép' : 'Chép'}
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-500">
            Dán vào my.payos.vn → Kênh thanh toán → Webhook, rồi bấm “Kiểm tra”.
          </p>
        </div>
      </div>

      {!configured ? (
        <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">
          Cổng <strong>{active}</strong> đang được chọn nhưng chưa đủ khóa API. Mọi lượt bấm thanh
          toán sẽ báo lỗi. Bổ sung <code className="font-mono text-xs">PAYOS_CLIENT_ID</code>,{' '}
          <code className="font-mono text-xs">PAYOS_API_KEY</code>,{' '}
          <code className="font-mono text-xs">PAYOS_CHECKSUM_KEY</code> rồi khởi động lại ứng dụng.
        </p>
      ) : null}
    </Card>
  );
}
