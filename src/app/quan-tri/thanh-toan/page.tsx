import { requireAdmin } from '@/lib/auth';
import { listPayments } from '@/server/commerce/service';
import { getGateway, webhookUrlFor } from '@/server/commerce/gateway';
import { isPayosConfigured } from '@/server/commerce/payos';
import { getConfig } from '@/lib/config';
import { formatVnd } from '@/lib/domain';
import { formatDateTimeVN } from '@/lib/dates';
import { Badge, EmptyState, PageHeader, StatTile, Table, Td, Tr } from '@/components/ui';
import { GatewayStatus } from './gateway-status';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Thanh toán' };

const STATUS_TONE = {
  PENDING: 'warn',
  PAID: 'success',
  FAILED: 'danger',
  REFUNDED: 'neutral',
  CANCELLED: 'neutral',
} as const;

const STATUS_LABEL = {
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  FAILED: 'Thất bại',
  REFUNDED: 'Đã hoàn tiền',
  CANCELLED: 'Đã hủy',
} as const;

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const { page } = await searchParams;

  const [result, config] = await Promise.all([
    listPayments({ page: page ? Number(page) : 1, pageSize: 30 }),
    getConfig(),
  ]);

  // Cổng cấu hình sai không được làm sập cả trang quản trị — vẫn phải xem được
  // danh sách đơn để đối soát, thậm chí ĐẶC BIỆT cần xem lúc cổng đang hỏng.
  let gateway: { code: string; label: string; rendersQrInline: boolean } | null = null;
  try {
    gateway = getGateway(config.commerce.gateway);
  } catch {
    gateway = null;
  }
  const gatewayCode = gateway?.code ?? config.commerce.gateway;

  return (
    <div>
      <PageHeader eyebrow="Quản trị" title="Thanh toán" subtitle="Giao dịch, đối soát và hoàn tiền." />

      <GatewayStatus
        active={gateway ? `${gateway.code} — ${gateway.label}` : `${gatewayCode} (chưa hỗ trợ)`}
        configured={gateway !== null && (gatewayCode !== 'PAYOS' || isPayosConfigured())}
        webhookUrl={webhookUrlFor(gatewayCode)}
        rendersQrInline={gateway?.rendersQrInline ?? false}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="Tổng đơn" value={result.total.toLocaleString('vi-VN')} />
        <StatTile label="Đã thu" value={formatVnd(result.paidAmount)} />
        <StatTile label="Đang hiển thị" value={`${result.items.length} đơn`} hint={`trang ${result.page}`} />
      </div>

      {result.items.length === 0 ? (
        <EmptyState icon="💳" title="Chưa có giao dịch nào" description="Đơn hàng sẽ xuất hiện ở đây ngay khi học sinh bắt đầu thanh toán." />
      ) : (
        <Table head={['Mã đơn', 'Khách hàng', 'Khóa học', 'Số tiền', 'Trạng thái', 'Thời điểm']}>
          {result.items.map((payment) => (
            <Tr key={payment.id}>
              <Td className="font-mono text-xs text-ink-700">{payment.orderCode}</Td>
              <Td className="text-ink-700">
                {payment.user?.fullName ?? '—'}
                <br />
                <span className="text-xs text-ink-400">{payment.user?.email ?? ''}</span>
              </Td>
              <Td className="text-ink-600">{payment.course?.name ?? '—'}</Td>
              <Td className="font-semibold text-ink-800 tabular-nums">{formatVnd(payment.amount)}</Td>
              <Td>
                <Badge tone={STATUS_TONE[payment.status]}>{STATUS_LABEL[payment.status]}</Badge>
                {payment.refundNote ? (
                  <p className="mt-1 text-xs text-ink-400">{payment.refundNote}</p>
                ) : null}
              </Td>
              <Td className="whitespace-nowrap text-ink-500">
                {formatDateTimeVN(payment.paidAt ?? payment.createdAt)}
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
