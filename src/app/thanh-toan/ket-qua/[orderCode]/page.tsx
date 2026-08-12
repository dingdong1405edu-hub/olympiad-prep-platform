import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getPaymentSession } from '@/server/commerce/service';
import { ApiError } from '@/lib/http';
import { routes } from '@/lib/routes';
import { AppShell } from '@/components/shell';
import { Alert, Card, LinkButton } from '@/components/ui';
import { PaymentQrPanel } from '@/components/payment-qr';
import { ConfirmMockPayment } from './confirm-mock';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Kết quả thanh toán' };

/**
 * Trang theo dõi một đơn hàng.
 *
 * Vào lại trang này (tải lại, quay về từ app ngân hàng, mở trên máy khác) vẫn
 * thấy ĐÚNG mã QR cũ chứ không sinh đơn mới — mã đã lưu trong `gatewayMeta`.
 * Hết hạn thì `getPaymentSession` tự xin cổng cấp mã mới cho cùng đơn đó.
 */
export default async function CheckoutResultPage({
  params,
}: {
  params: Promise<{ orderCode: string }>;
}) {
  const { orderCode } = await params;
  const session = await getSession();
  if (!session) redirect(routes.login(routes.checkoutResult(orderCode)));

  const user = { id: session.id, fullName: session.fullName, roles: session.roles };

  let payment;
  try {
    payment = await getPaymentSession(session.id, orderCode);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    return (
      <AppShell user={user}>
        <Card className="mx-auto max-w-lg">
          <p className="text-ink-700">Không tìm thấy đơn hàng này.</p>
          <div className="mt-4">
            <LinkButton href={routes.myCourses()} variant="secondary">
              Về khóa học của tôi
            </LinkButton>
          </div>
        </Card>
      </AppShell>
    );
  }

  // Cổng trả QR → giao cả màn hình cho panel: nó tự lo đếm ngược, hỏi trạng
  // thái, báo thành công và điều hướng tiếp.
  if (payment.qr || payment.status === 'PAID') {
    return (
      <AppShell user={user}>
        <div className="mx-auto max-w-3xl">
          <PaymentQrPanel initialSession={payment} />
          <p className="mt-6 text-center">
            <LinkButton href={routes.myCourses()} variant="ghost" size="sm">
              Về khóa học của tôi
            </LinkButton>
          </p>
        </div>
      </AppShell>
    );
  }

  // Cổng không có QR (MANUAL) hoặc đơn đã đóng — bản tóm tắt tĩnh là đủ.
  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold text-ink-900">
          {payment.status === 'PENDING' ? 'Đơn hàng đang chờ thanh toán' : payment.statusLabel}
        </h1>

        <Card className="mt-5">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">Mã đơn</dt>
              <dd className="font-medium text-ink-800">{payment.orderCode}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Khóa học</dt>
              <dd className="text-right font-medium text-ink-800">
                {payment.course.programName}
                <br />
                <span className="font-normal text-ink-600">{payment.course.name}</span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Số tiền</dt>
              <dd className="font-medium text-ink-800 tabular-nums">{payment.amountLabel}</dd>
            </div>
          </dl>
        </Card>

        {payment.status === 'PENDING' ? (
          <>
            <Alert tone="info" className="mt-5" title="Đang chờ xác nhận từ cổng thanh toán">
              Quyền truy cập sẽ được kích hoạt ngay khi cổng thanh toán báo về. Trang này tự cập
              nhật khi bạn tải lại.
            </Alert>
            {payment.gateway === 'MANUAL' ? (
              <div className="mt-5">
                <ConfirmMockPayment orderCode={payment.orderCode} />
              </div>
            ) : null}
          </>
        ) : (
          <Alert tone="warn" className="mt-5">
            Đơn hàng đang ở trạng thái “{payment.statusLabel}”. Bạn có thể đặt lại đơn mới hoặc liên
            hệ bộ phận hỗ trợ.
          </Alert>
        )}

        <p className="mt-6 text-center text-sm">
          <LinkButton href={routes.myCourses()} variant="ghost" size="sm">
            Về khóa học của tôi
          </LinkButton>
        </p>
      </div>
    </AppShell>
  );
}
