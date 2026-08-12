import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { routes } from '@/lib/routes';
import { formatVnd } from '@/lib/domain';
import { AppShell } from '@/components/shell';
import { Alert, Card, LinkButton } from '@/components/ui';
import { ConfirmMockPayment } from './confirm-mock';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Kết quả thanh toán' };

export default async function CheckoutResultPage({
  params,
}: {
  params: Promise<{ orderCode: string }>;
}) {
  const { orderCode } = await params;
  const session = await getSession();
  if (!session) redirect(routes.login(routes.checkoutResult(orderCode)));

  const payment = await prisma.payment.findUnique({
    where: { orderCode },
    include: { course: { include: { program: true } }, enrollment: true },
  });

  if (!payment || payment.userId !== session.id) {
    return (
      <AppShell user={{ id: session.id, fullName: session.fullName, roles: session.roles }}>
        <Card>
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

  const paid = payment.status === 'PAID';

  return (
    <AppShell user={{ id: session.id, fullName: session.fullName, roles: session.roles }}>
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold text-ink-900">
          {paid ? 'Thanh toán thành công' : 'Đơn hàng đang chờ thanh toán'}
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
                {payment.course.program.name}
                <br />
                <span className="font-normal text-ink-600">{payment.course.name}</span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Số tiền</dt>
              <dd className="font-medium text-ink-800 tabular-nums">{formatVnd(payment.amount)}</dd>
            </div>
          </dl>
        </Card>

        {paid && payment.enrollment ? (
          <>
            <Alert tone="success" className="mt-5">
              Khóa học đã được kích hoạt. Bước tiếp theo là bài kiểm tra đầu vào 15 câu.
            </Alert>
            <div className="mt-5">
              <LinkButton href={routes.onboarding(payment.enrollment.id)} size="lg" className="w-full">
                Bắt đầu bài kiểm tra đầu vào
              </LinkButton>
            </div>
          </>
        ) : (
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
